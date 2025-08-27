const mongoose = require('mongoose');

const vehicleLogSchema = new mongoose.Schema({
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  parkingSpot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSpot',
    required: true
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  logType: {
    type: String,
    enum: ['entry', 'exit'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  detectionMethod: {
    type: String,
    enum: ['lpr', 'rfid', 'manual', 'qr_code', 'mobile_app'],
    required: true
  },
  lprData: {
    licensePlate: {
      detected: String,
      confidence: {
        type: Number,
        min: 0,
        max: 1
      }
    },
    imageUrl: String,
    processingTime: Number, // in milliseconds
    cameraId: String,
    alternateReadings: [{
      text: String,
      confidence: Number
    }]
  },
  rfidData: {
    tagId: String,
    readerId: String,
    signalStrength: Number
  },
  manualData: {
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    notes: String
  },
  location: {
    gate: String,
    camera: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  vehicleDetails: {
    licensePlate: String,
    make: String,
    model: String,
    color: String,
    type: String
  },
  payment: {
    amount: {
      type: Number,
      default: 0
    },
    method: {
      type: String,
      enum: ['cash', 'card', 'wallet', 'upi', 'netbanking', 'free'],
      default: 'free'
    },
    transactionId: String,
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    }
  },
  duration: {
    type: Number, // in minutes
    default: 0
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'suspicious', 'unauthorized'],
    default: 'success'
  },
  flags: [{
    type: {
      type: String,
      enum: [
        'unauthorized_vehicle',
        'expired_booking',
        'payment_pending',
        'suspicious_activity',
        'manual_override',
        'system_error',
        'blacklisted_vehicle'
      ]
    },
    description: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  images: [{
    type: {
      type: String,
      enum: ['entry', 'exit', 'license_plate', 'vehicle_overview', 'receipt']
    },
    url: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: {
      camera: String,
      resolution: String,
      fileSize: Number
    }
  }],
  relatedLogs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VehicleLog'
  }],
  systemInfo: {
    serverVersion: String,
    deviceId: String,
    ipAddress: String,
    userAgent: String
  },
  analytics: {
    processingTime: Number, // Total processing time in milliseconds
    confidence: Number,
    anomalyScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
vehicleLogSchema.index({ vehicle: 1, logType: 1, timestamp: -1 });
vehicleLogSchema.index({ parkingSpot: 1, timestamp: -1 });
vehicleLogSchema.index({ logType: 1, timestamp: -1 });
vehicleLogSchema.index({ 'lprData.licensePlate.detected': 1 });
vehicleLogSchema.index({ 'rfidData.tagId': 1 });
vehicleLogSchema.index({ status: 1 });
vehicleLogSchema.index({ booking: 1 });

// Virtual for related entry/exit log
vehicleLogSchema.virtual('pairedLog', {
  ref: 'VehicleLog',
  localField: 'relatedLogs',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to calculate duration and link entry/exit logs
vehicleLogSchema.pre('save', async function(next) {
  if (this.isNew && this.logType === 'exit') {
    try {
      // Find the corresponding entry log
      const entryLog = await this.constructor.findOne({
        vehicle: this.vehicle,
        parkingSpot: this.parkingSpot,
        logType: 'entry',
        relatedLogs: { $size: 0 } // Not already linked
      }).sort({ timestamp: -1 });

      if (entryLog) {
        // Calculate duration
        this.duration = Math.round((this.timestamp - entryLog.timestamp) / (1000 * 60));
        
        // Link the logs
        this.relatedLogs.push(entryLog._id);
        entryLog.relatedLogs.push(this._id);
        entryLog.duration = this.duration;
        
        await entryLog.save();
      }
    } catch (error) {
      console.error('Error linking entry/exit logs:', error);
    }
  }
  next();
});

// Method to mark as suspicious
vehicleLogSchema.methods.markSuspicious = function(reason, severity = 'medium') {
  this.status = 'suspicious';
  this.flags.push({
    type: 'suspicious_activity',
    description: reason,
    severity: severity
  });
  return this.save();
};

// Method to resolve flags
vehicleLogSchema.methods.resolveFlag = function(flagId, userId) {
  const flag = this.flags.id(flagId);
  if (flag) {
    flag.resolvedAt = new Date();
    flag.resolvedBy = userId;
  }
  return this.save();
};

// Static method to get parking session
vehicleLogSchema.statics.getParkingSession = function(vehicleId, spotId, startTime) {
  return this.find({
    vehicle: vehicleId,
    parkingSpot: spotId,
    timestamp: { $gte: startTime }
  }).sort({ timestamp: 1 });
};

// Static method for analytics
vehicleLogSchema.statics.getAnalytics = function(filters = {}, groupBy = 'day') {
  const matchStage = { ...filters };
  
  let groupId;
  switch (groupBy) {
    case 'hour':
      groupId = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' },
        day: { $dayOfMonth: '$timestamp' },
        hour: { $hour: '$timestamp' }
      };
      break;
    case 'day':
      groupId = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' },
        day: { $dayOfMonth: '$timestamp' }
      };
      break;
    case 'month':
      groupId = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' }
      };
      break;
    default:
      groupId = '$logType';
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: groupId,
        totalLogs: { $sum: 1 },
        entries: { $sum: { $cond: [{ $eq: ['$logType', 'entry'] }, 1, 0] } },
        exits: { $sum: { $cond: [{ $eq: ['$logType', 'exit'] }, 1, 0] } },
        totalRevenue: { $sum: '$payment.amount' },
        averageDuration: { $avg: '$duration' },
        suspiciousCount: { $sum: { $cond: [{ $eq: ['$status', 'suspicious'] }, 1, 0] } }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
};

// Static method to detect anomalies
vehicleLogSchema.statics.detectAnomalies = function(timeWindow = 24) {
  const cutoffTime = new Date(Date.now() - (timeWindow * 60 * 60 * 1000));
  
  return this.aggregate([
    { $match: { timestamp: { $gte: cutoffTime } } },
    {
      $group: {
        _id: '$vehicle',
        logCount: { $sum: 1 },
        distinctSpots: { $addToSet: '$parkingSpot' },
        avgConfidence: { $avg: '$lprData.licensePlate.confidence' },
        suspiciousFlags: { $sum: { $size: '$flags' } }
      }
    },
    {
      $match: {
        $or: [
          { logCount: { $gt: 10 } }, // Too many logs
          { avgConfidence: { $lt: 0.7 } }, // Low LPR confidence
          { suspiciousFlags: { $gt: 0 } } // Has suspicious flags
        ]
      }
    }
  ]);
};

module.exports = mongoose.model('VehicleLog', vehicleLogSchema);
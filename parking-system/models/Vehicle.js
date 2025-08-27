const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Vehicle owner is required']
  },
  licensePlate: {
    type: String,
    required: [true, 'License plate is required'],
    unique: true,
    uppercase: true,
    trim: true,
    match: [/^[A-Z0-9\s-]+$/, 'Invalid license plate format']
  },
  make: {
    type: String,
    required: [true, 'Vehicle make is required'],
    trim: true
  },
  model: {
    type: String,
    required: [true, 'Vehicle model is required'],
    trim: true
  },
  year: {
    type: Number,
    required: [true, 'Manufacturing year is required'],
    min: [1900, 'Invalid year'],
    max: [new Date().getFullYear() + 1, 'Invalid year']
  },
  color: {
    type: String,
    required: [true, 'Vehicle color is required'],
    trim: true
  },
  type: {
    type: String,
    enum: ['car', 'suv', 'motorcycle', 'truck', 'van', 'electric'],
    required: [true, 'Vehicle type is required']
  },
  category: {
    type: String,
    enum: ['personal', 'commercial', 'government', 'rental'],
    default: 'personal'
  },
  specifications: {
    fuelType: {
      type: String,
      enum: ['petrol', 'diesel', 'electric', 'hybrid', 'cng', 'lpg'],
      required: true
    },
    engineCapacity: String,
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    weight: Number,
    seatingCapacity: {
      type: Number,
      min: 1,
      max: 50
    }
  },
  registration: {
    registrationNumber: {
      type: String,
      required: true,
      unique: true
    },
    registrationDate: Date,
    expiryDate: Date,
    state: String,
    rto: String
  },
  insurance: {
    company: String,
    policyNumber: String,
    startDate: Date,
    expiryDate: Date,
    coverageType: {
      type: String,
      enum: ['comprehensive', 'third_party']
    }
  },
  documents: {
    rc: {
      uploaded: {
        type: Boolean,
        default: false
      },
      url: String,
      verificationStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'pending'
      }
    },
    insurance: {
      uploaded: {
        type: Boolean,
        default: false
      },
      url: String,
      verificationStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'pending'
      }
    },
    puc: {
      uploaded: {
        type: Boolean,
        default: false
      },
      url: String,
      expiryDate: Date,
      verificationStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'pending'
      }
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'blocked', 'under_verification'],
    default: 'under_verification'
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  tags: {
    rfid: {
      tagId: String,
      status: {
        type: String,
        enum: ['active', 'inactive', 'lost', 'damaged'],
        default: 'inactive'
      },
      assignedDate: Date
    },
    barcode: String,
    qrCode: String
  },
  parkingHistory: [{
    spot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSpot'
    },
    entryTime: Date,
    exitTime: Date,
    duration: Number, // in minutes
    amount: Number,
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking'
    }
  }],
  lprData: {
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    lastDetection: Date,
    detectionCount: {
      type: Number,
      default: 0
    },
    alternateReadings: [String] // Different readings from LPR system
  },
  alerts: [{
    type: {
      type: String,
      enum: ['document_expiry', 'insurance_expiry', 'puc_expiry', 'suspicious_activity', 'blacklisted']
    },
    message: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    acknowledged: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  analytics: {
    totalParkingTime: {
      type: Number,
      default: 0 // in minutes
    },
    totalAmount: {
      type: Number,
      default: 0
    },
    averageParkingDuration: {
      type: Number,
      default: 0 // in minutes
    },
    frequentSpots: [{
      spot: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ParkingSpot'
      },
      count: Number
    }],
    lastParked: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
vehicleSchema.index({ licensePlate: 1 });
vehicleSchema.index({ owner: 1 });
vehicleSchema.index({ 'registration.registrationNumber': 1 });
vehicleSchema.index({ status: 1, verificationStatus: 1 });
vehicleSchema.index({ 'tags.rfid.tagId': 1 });

// Virtual for full vehicle name
vehicleSchema.virtual('fullName').get(function() {
  return `${this.year} ${this.make} ${this.model}`;
});

// Virtual for verification status
vehicleSchema.virtual('isVerified').get(function() {
  return this.verificationStatus === 'verified' && this.status === 'active';
});

// Virtual for document completion
vehicleSchema.virtual('documentCompletion').get(function() {
  const totalDocs = 3; // RC, Insurance, PUC
  let uploadedDocs = 0;
  
  if (this.documents.rc.uploaded) uploadedDocs++;
  if (this.documents.insurance.uploaded) uploadedDocs++;
  if (this.documents.puc.uploaded) uploadedDocs++;
  
  return Math.round((uploadedDocs / totalDocs) * 100);
});

// Method to add parking history
vehicleSchema.methods.addParkingHistory = function(spotId, entryTime, exitTime, amount, bookingId) {
  const duration = Math.round((exitTime - entryTime) / (1000 * 60)); // Convert to minutes
  
  this.parkingHistory.push({
    spot: spotId,
    entryTime,
    exitTime,
    duration,
    amount,
    booking: bookingId
  });
  
  // Update analytics
  this.analytics.totalParkingTime += duration;
  this.analytics.totalAmount += amount;
  this.analytics.lastParked = exitTime;
  this.analytics.averageParkingDuration = this.analytics.totalParkingTime / this.parkingHistory.length;
  
  // Update frequent spots
  const existingSpot = this.analytics.frequentSpots.find(fs => fs.spot.toString() === spotId.toString());
  if (existingSpot) {
    existingSpot.count++;
  } else {
    this.analytics.frequentSpots.push({ spot: spotId, count: 1 });
  }
  
  // Sort frequent spots by count
  this.analytics.frequentSpots.sort((a, b) => b.count - a.count);
  
  return this.save();
};

// Method to check document expiry
vehicleSchema.methods.checkDocumentExpiry = function() {
  const alerts = [];
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
  
  // Check insurance expiry
  if (this.insurance.expiryDate && this.insurance.expiryDate <= thirtyDaysFromNow) {
    alerts.push({
      type: 'insurance_expiry',
      message: `Vehicle insurance expires on ${this.insurance.expiryDate.toDateString()}`,
      severity: this.insurance.expiryDate <= now ? 'critical' : 'high'
    });
  }
  
  // Check PUC expiry
  if (this.documents.puc.expiryDate && this.documents.puc.expiryDate <= thirtyDaysFromNow) {
    alerts.push({
      type: 'puc_expiry',
      message: `PUC certificate expires on ${this.documents.puc.expiryDate.toDateString()}`,
      severity: this.documents.puc.expiryDate <= now ? 'critical' : 'high'
    });
  }
  
  // Add alerts if not already present
  alerts.forEach(alert => {
    const existingAlert = this.alerts.find(a => a.type === alert.type && !a.acknowledged);
    if (!existingAlert) {
      this.alerts.push(alert);
    }
  });
  
  return alerts;
};

// Static method to find vehicle by license plate (with LPR tolerance)
vehicleSchema.statics.findByLicensePlate = function(licensePlate, tolerance = 0.8) {
  // Exact match first
  return this.findOne({ licensePlate: licensePlate.toUpperCase() })
    .then(vehicle => {
      if (vehicle) return vehicle;
      
      // If no exact match, search in alternate readings with confidence
      return this.findOne({
        'lprData.alternateReadings': licensePlate.toUpperCase(),
        'lprData.confidence': { $gte: tolerance }
      });
    });
};

module.exports = mongoose.model('Vehicle', vehicleSchema);
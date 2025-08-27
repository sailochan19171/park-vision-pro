const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true
  },
  parkingSpot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSpot',
    required: true
  },
  bookingId: {
    type: String,
    unique: true,
    required: true
  },
  bookingType: {
    type: String,
    enum: ['hourly', 'daily', 'monthly', 'one_time'],
    default: 'hourly'
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'active', 'ongoing', 'completed', 'cancelled', 'no_show'],
    default: 'pending'
  },
  timeline: {
    bookedAt: {
      type: Date,
      default: Date.now
    },
    startTime: {
      type: Date,
      required: true
    },
    endTime: {
      type: Date,
      required: true
    },
    actualStartTime: Date,
    actualEndTime: Date,
    extendedUntil: Date
  },
  pricing: {
    baseAmount: {
      type: Number,
      required: true,
      min: 0
    },
    taxes: {
      type: Number,
      default: 0
    },
    discount: {
      type: Number,
      default: 0
    },
    extraCharges: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR'
    }
  },
  payment: {
    status: {
      type: String,
      enum: ['pending', 'paid', 'partially_paid', 'failed', 'refunded'],
      default: 'pending'
    },
    method: {
      type: String,
      enum: ['wallet', 'card', 'upi', 'netbanking', 'cash', 'free']
    },
    transactionId: String,
    paidAmount: {
      type: Number,
      default: 0
    },
    refundAmount: {
      type: Number,
      default: 0
    },
    paymentGateway: String,
    paymentDetails: mongoose.Schema.Types.Mixed
  },
  extensions: [{
    extendedUntil: Date,
    additionalAmount: Number,
    requestedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    }
  }],
  notifications: [{
    type: {
      type: String,
      enum: ['booking_confirmed', 'payment_received', 'entry_reminder', 'exit_reminder', 'overstay_warning', 'cancellation']
    },
    sentAt: Date,
    channel: {
      type: String,
      enum: ['email', 'sms', 'push', 'in_app']
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'failed'],
      default: 'sent'
    }
  }],
  qrCode: {
    data: String,
    generatedAt: Date,
    expiresAt: Date
  },
  accessCode: {
    code: String,
    generatedAt: Date,
    expiresAt: Date,
    usageCount: {
      type: Number,
      default: 0
    },
    maxUsage: {
      type: Number,
      default: 2 // Entry and exit
    }
  },
  specialRequests: [{
    type: {
      type: String,
      enum: ['wheelchair_accessible', 'ev_charging', 'covered_parking', 'security_escort']
    },
    fulfilled: {
      type: Boolean,
      default: false
    },
    notes: String
  }],
  cancellation: {
    cancelledAt: Date,
    reason: String,
    cancelledBy: {
      type: String,
      enum: ['user', 'admin', 'system']
    },
    refundEligible: {
      type: Boolean,
      default: true
    },
    refundAmount: Number,
    cancellationFee: Number
  },
  reviews: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    reviewedAt: Date
  },
  metadata: {
    source: {
      type: String,
      enum: ['mobile_app', 'web', 'kiosk', 'call_center', 'walk_in'],
      default: 'mobile_app'
    },
    deviceInfo: mongoose.Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
    referrer: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
bookingSchema.index({ bookingId: 1 });
bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ parkingSpot: 1, status: 1 });
bookingSchema.index({ 'timeline.startTime': 1, 'timeline.endTime': 1 });
bookingSchema.index({ status: 1, 'timeline.startTime': 1 });

// Virtual for duration
bookingSchema.virtual('duration').get(function() {
  if (this.timeline.actualEndTime && this.timeline.actualStartTime) {
    return Math.round((this.timeline.actualEndTime - this.timeline.actualStartTime) / (1000 * 60));
  } else if (this.timeline.endTime && this.timeline.startTime) {
    return Math.round((this.timeline.endTime - this.timeline.startTime) / (1000 * 60));
  }
  return 0;
});

// Virtual for booking status display
bookingSchema.virtual('statusDisplay').get(function() {
  const statusMap = {
    'pending': 'Pending Confirmation',
    'confirmed': 'Confirmed',
    'active': 'Ready to Start',
    'ongoing': 'In Progress',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'no_show': 'No Show'
  };
  return statusMap[this.status] || this.status;
});

// Virtual for overstay status
bookingSchema.virtual('isOverstayed').get(function() {
  if (this.status !== 'ongoing') return false;
  const endTime = this.timeline.extendedUntil || this.timeline.endTime;
  return new Date() > endTime;
});

// Pre-validate middleware to generate booking ID before required validation runs
bookingSchema.pre('validate', async function(next) {
  try {
    if (this.isNew && !this.bookingId) {
      const date = new Date();
      const year = date.getFullYear().toString().substr(-2);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      // Find the last booking of the day
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

      const lastBooking = await this.constructor.findOne({
        createdAt: { $gte: startOfDay, $lt: endOfDay }
      }).sort({ createdAt: -1 });

      let sequence = 1;
      if (lastBooking && lastBooking.bookingId) {
        const lastSequence = parseInt(lastBooking.bookingId.substr(-4));
        sequence = lastSequence + 1;
      }

      this.bookingId = `VPB${year}${month}${day}${String(sequence).padStart(4, '0')}`;
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Pre-save middleware to calculate total amount
bookingSchema.pre('save', function(next) {
  this.pricing.totalAmount = this.pricing.baseAmount + 
                            this.pricing.taxes + 
                            this.pricing.extraCharges - 
                            this.pricing.discount;
  next();
});

// Method to extend booking
bookingSchema.methods.extendBooking = function(newEndTime, additionalAmount) {
  this.extensions.push({
    extendedUntil: newEndTime,
    additionalAmount: additionalAmount,
    status: 'pending'
  });
  
  return this.save();
};

// Method to cancel booking
bookingSchema.methods.cancelBooking = function(reason, cancelledBy = 'user') {
  this.status = 'cancelled';
  this.cancellation = {
    cancelledAt: new Date(),
    reason: reason,
    cancelledBy: cancelledBy
  };
  
  // Calculate refund based on cancellation policy
  const now = new Date();
  const timeDiff = this.timeline.startTime - now;
  const hoursUntilStart = timeDiff / (1000 * 60 * 60);
  
  if (hoursUntilStart > 24) {
    // Full refund if cancelled 24+ hours before
    this.cancellation.refundAmount = this.pricing.totalAmount;
    this.cancellation.cancellationFee = 0;
  } else if (hoursUntilStart > 2) {
    // 50% refund if cancelled 2-24 hours before
    this.cancellation.refundAmount = this.pricing.totalAmount * 0.5;
    this.cancellation.cancellationFee = this.pricing.totalAmount * 0.5;
  } else {
    // No refund if cancelled less than 2 hours before
    this.cancellation.refundAmount = 0;
    this.cancellation.cancellationFee = this.pricing.totalAmount;
    this.cancellation.refundEligible = false;
  }
  
  return this.save();
};

// Method to mark as no-show
bookingSchema.methods.markNoShow = function() {
  this.status = 'no_show';
  return this.save();
};

// Method to start parking session
bookingSchema.methods.startSession = function() {
  this.status = 'ongoing';
  this.timeline.actualStartTime = new Date();
  return this.save();
};

// Method to end parking session
bookingSchema.methods.endSession = function() {
  this.status = 'completed';
  this.timeline.actualEndTime = new Date();
  return this.save();
};

// Static method to find active bookings
bookingSchema.statics.findActiveBookings = function(userId) {
  return this.find({
    user: userId,
    status: { $in: ['confirmed', 'active', 'ongoing'] }
  }).populate('parkingSpot vehicle');
};

// Static method to check conflicts
bookingSchema.statics.checkConflicts = function(spotId, startTime, endTime, excludeBookingId) {
  const query = {
    parkingSpot: spotId,
    status: { $in: ['confirmed', 'active', 'ongoing'] },
    $or: [
      {
        'timeline.startTime': { $lt: endTime },
        'timeline.endTime': { $gt: startTime }
      },
      {
        'timeline.startTime': { $lt: endTime },
        'timeline.extendedUntil': { $gt: startTime }
      }
    ]
  };
  
  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }
  
  return this.find(query);
};

module.exports = mongoose.model('Booking', bookingSchema);
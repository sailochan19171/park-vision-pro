const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  // User information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  userRole: {
    type: String,
    enum: ['admin', 'user'],
    required: true
  },
  
  // Activity details
  action: {
    type: String,
    required: true,
    enum: [
      // Admin actions
      'ADMIN_LOGIN', 'ADMIN_LOGOUT', 'ADMIN_VIEW_DASHBOARD',
      'ADMIN_CREATE_USER', 'ADMIN_UPDATE_USER', 'ADMIN_DELETE_USER', 'ADMIN_VIEW_USERS',
      'ADMIN_CREATE_VEHICLE', 'ADMIN_UPDATE_VEHICLE', 'ADMIN_DELETE_VEHICLE', 'ADMIN_VIEW_VEHICLES',
      'ADMIN_CREATE_PARKING_SPOT', 'ADMIN_UPDATE_PARKING_SPOT', 'ADMIN_DELETE_PARKING_SPOT', 'ADMIN_VIEW_PARKING_SPOTS',
      'ADMIN_VIEW_BOOKINGS', 'ADMIN_UPDATE_BOOKING', 'ADMIN_DELETE_BOOKING',
      'ADMIN_VIEW_PAYMENTS', 'ADMIN_PROCESS_PAYMENT', 'ADMIN_REFUND_PAYMENT',
      'ADMIN_VIEW_REPORTS', 'ADMIN_GENERATE_REPORT', 'ADMIN_EXPORT_DATA',
      'ADMIN_UPDATE_SETTINGS', 'ADMIN_VIEW_ANALYTICS', 'ADMIN_VIEW_LOGS',
      
      // User actions
      'USER_LOGIN', 'USER_LOGOUT', 'USER_REGISTER', 'USER_VIEW_DASHBOARD',
      'USER_CREATE_BOOKING', 'USER_UPDATE_BOOKING', 'USER_CANCEL_BOOKING', 'USER_VIEW_BOOKINGS',
      'USER_ADD_VEHICLE', 'USER_UPDATE_VEHICLE', 'USER_DELETE_VEHICLE', 'USER_VIEW_VEHICLES',
      'USER_MAKE_PAYMENT', 'USER_VIEW_PAYMENTS', 'USER_VIEW_PAYMENT_HISTORY',
      'USER_UPDATE_PROFILE', 'USER_VIEW_PROFILE', 'USER_CHANGE_PASSWORD',
      'USER_VIEW_NOTIFICATIONS', 'USER_UPDATE_SETTINGS', 'USER_SEARCH_PARKING'
    ]
  },
  
  // HTTP request details
  method: {
    type: String,
    required: true,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  },
  endpoint: {
    type: String,
    required: true
  },
  
  // Request/Response details
  requestData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  responseStatus: {
    type: Number,
    required: true
  },
  responseMessage: {
    type: String
  },
  
  // Resource details
  resourceType: {
    type: String,
    enum: ['user', 'vehicle', 'parking_spot', 'booking', 'payment', 'report', 'setting', 'dashboard', 'auth']
  },
  resourceId: {
    type: String // Can be ObjectId or other identifier
  },
  
  // Technical details
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String
  },
  sessionId: {
    type: String
  },
  duration: {
    type: Number, // Response time in milliseconds
    default: 0
  },
  
  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Success/Error tracking
  success: {
    type: Boolean,
    required: true,
    default: true
  },
  errorDetails: {
    type: String
  },
  
  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  }
}, {
  timestamps: true,
  collection: 'activitylogs'
});

// Indexes for better query performance
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ userRole: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ resourceType: 1, resourceId: 1 });
activityLogSchema.index({ timestamp: -1 });
activityLogSchema.index({ ipAddress: 1, timestamp: -1 });

// Static methods for common queries
activityLogSchema.statics.getAdminActivities = function(limit = 100, page = 1) {
  const skip = (page - 1) * limit;
  return this.find({ userRole: 'admin' })
    .populate('userId', 'name email')
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);
};

activityLogSchema.statics.getUserActivities = function(userId, limit = 50, page = 1) {
  const skip = (page - 1) * limit;
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);
};

activityLogSchema.statics.getActivityStats = function(startDate, endDate) {
  const matchStage = {};
  if (startDate && endDate) {
    matchStage.timestamp = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          action: '$action',
          userRole: '$userRole',
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
        },
        count: { $sum: 1 },
        successCount: { $sum: { $cond: ['$success', 1, 0] } },
        errorCount: { $sum: { $cond: ['$success', 0, 1] } }
      }
    },
    { $sort: { '_id.date': -1, count: -1 } }
  ]);
};

// Instance methods
activityLogSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  // Remove sensitive data if needed
  if (obj.requestData && obj.requestData.password) {
    obj.requestData.password = '[REDACTED]';
  }
  return obj;
};

module.exports = mongoose.model('ActivityLog', activityLogSchema);
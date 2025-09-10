const ActivityLog = require('../models/ActivityLog');

/**
 * Activity Logger Middleware
 * Logs all admin and user dashboard operations to MongoDB
 */

// Action mapping based on route patterns
const ACTION_MAPPING = {
  // Admin routes
  'POST /api/admin/login': 'ADMIN_LOGIN',
  'POST /api/admin/logout': 'ADMIN_LOGOUT',
  'GET /api/admin/dashboard': 'ADMIN_VIEW_DASHBOARD',
  'GET /api/admin/stats': 'ADMIN_VIEW_DASHBOARD',
  
  // Admin user management
  'GET /api/admin/users': 'ADMIN_VIEW_USERS',
  'POST /api/admin/users': 'ADMIN_CREATE_USER',
  'PUT /api/admin/users': 'ADMIN_UPDATE_USER',
  'DELETE /api/admin/users': 'ADMIN_DELETE_USER',
  
  // Admin vehicle management
  'GET /api/admin/vehicles': 'ADMIN_VIEW_VEHICLES',
  'POST /api/admin/vehicles': 'ADMIN_CREATE_VEHICLE',
  'PUT /api/admin/vehicles': 'ADMIN_UPDATE_VEHICLE',
  'DELETE /api/admin/vehicles': 'ADMIN_DELETE_VEHICLE',
  
  // Admin parking spot management
  'GET /api/admin/parking-spots': 'ADMIN_VIEW_PARKING_SPOTS',
  'POST /api/admin/parking-spots': 'ADMIN_CREATE_PARKING_SPOT',
  'PUT /api/admin/parking-spots': 'ADMIN_UPDATE_PARKING_SPOT',
  'DELETE /api/admin/parking-spots': 'ADMIN_DELETE_PARKING_SPOT',
  
  // Admin booking management
  'GET /api/admin/bookings': 'ADMIN_VIEW_BOOKINGS',
  'PUT /api/admin/bookings': 'ADMIN_UPDATE_BOOKING',
  'DELETE /api/admin/bookings': 'ADMIN_DELETE_BOOKING',
  
  // Admin payment management
  'GET /api/admin/payments': 'ADMIN_VIEW_PAYMENTS',
  'POST /api/admin/payments': 'ADMIN_PROCESS_PAYMENT',
  'PUT /api/admin/payments': 'ADMIN_PROCESS_PAYMENT',
  
  // Admin reports and analytics
  'GET /api/admin/reports': 'ADMIN_VIEW_REPORTS',
  'POST /api/admin/reports': 'ADMIN_GENERATE_REPORT',
  'GET /api/admin/analytics': 'ADMIN_VIEW_ANALYTICS',
  'GET /api/admin/logs': 'ADMIN_VIEW_LOGS',
  'GET /api/admin/export': 'ADMIN_EXPORT_DATA',
  
  // Admin settings
  'GET /api/admin/settings': 'ADMIN_VIEW_SETTINGS',
  'PUT /api/admin/settings': 'ADMIN_UPDATE_SETTINGS',
  
  // User routes
  'POST /api/auth/login': 'USER_LOGIN',
  'POST /api/auth/register': 'USER_REGISTER',
  'POST /api/auth/logout': 'USER_LOGOUT',
  'GET /api/user/dashboard': 'USER_VIEW_DASHBOARD',
  
  // User booking management
  'GET /api/user/bookings': 'USER_VIEW_BOOKINGS',
  'POST /api/user/bookings': 'USER_CREATE_BOOKING',
  'PUT /api/user/bookings': 'USER_UPDATE_BOOKING',
  'DELETE /api/user/bookings': 'USER_CANCEL_BOOKING',
  
  // User vehicle management
  'GET /api/user/vehicles': 'USER_VIEW_VEHICLES',
  'POST /api/user/vehicles': 'USER_ADD_VEHICLE',
  'PUT /api/user/vehicles': 'USER_UPDATE_VEHICLE',
  'DELETE /api/user/vehicles': 'USER_DELETE_VEHICLE',
  
  // User payment management
  'GET /api/user/payments': 'USER_VIEW_PAYMENTS',
  'POST /api/user/payments': 'USER_MAKE_PAYMENT',
  'GET /api/user/payment-history': 'USER_VIEW_PAYMENT_HISTORY',
  
  // User profile management
  'GET /api/user/profile': 'USER_VIEW_PROFILE',
  'PUT /api/user/profile': 'USER_UPDATE_PROFILE',
  'PUT /api/user/change-password': 'USER_CHANGE_PASSWORD',
  
  // User other actions
  'GET /api/user/notifications': 'USER_VIEW_NOTIFICATIONS',
  'GET /api/user/settings': 'USER_VIEW_SETTINGS',
  'PUT /api/user/settings': 'USER_UPDATE_SETTINGS',
  'GET /api/parking/search': 'USER_SEARCH_PARKING'
};

// Resource type mapping
const RESOURCE_TYPE_MAPPING = {
  '/users': 'user',
  '/vehicles': 'vehicle',
  '/parking-spots': 'parking_spot',
  '/bookings': 'booking',
  '/payments': 'payment',
  '/reports': 'report',
  '/settings': 'setting',
  '/dashboard': 'dashboard',
  '/login': 'auth',
  '/logout': 'auth',
  '/register': 'auth'
};

/**
 * Get action from request
 */
const getActionFromRequest = (req) => {
  const method = req.method;
  const path = req.route?.path || req.path;
  const baseUrl = req.baseUrl || '';
  const fullPath = baseUrl + path;
  
  // Try exact match first
  const exactKey = `${method} ${fullPath}`;
  if (ACTION_MAPPING[exactKey]) {
    return ACTION_MAPPING[exactKey];
  }
  
  // Try pattern matching
  for (const [pattern, action] of Object.entries(ACTION_MAPPING)) {
    const [patternMethod, patternPath] = pattern.split(' ');
    if (method === patternMethod && fullPath.includes(patternPath.replace('/api', ''))) {
      return action;
    }
  }
  
  // Default action based on method and path
  if (fullPath.includes('/admin/')) {
    return `ADMIN_${method}_${path.split('/').pop()?.toUpperCase() || 'UNKNOWN'}`;
  } else if (fullPath.includes('/user/')) {
    return `USER_${method}_${path.split('/').pop()?.toUpperCase() || 'UNKNOWN'}`;
  }
  
  return 'UNKNOWN_ACTION';
};

/**
 * Get resource type from request
 */
const getResourceType = (req) => {
  const path = req.route?.path || req.path;
  const baseUrl = req.baseUrl || '';
  const fullPath = baseUrl + path;
  
  for (const [pathPattern, resourceType] of Object.entries(RESOURCE_TYPE_MAPPING)) {
    if (fullPath.includes(pathPattern)) {
      return resourceType;
    }
  }
  
  return null;
};

/**
 * Get resource ID from request
 */
const getResourceId = (req) => {
  // Try to get ID from params
  if (req.params.id) return req.params.id;
  if (req.params.userId) return req.params.userId;
  if (req.params.vehicleId) return req.params.vehicleId;
  if (req.params.bookingId) return req.params.bookingId;
  if (req.params.spotId) return req.params.spotId;
  
  // Try to get ID from body for POST requests
  if (req.method === 'POST' && req.body) {
    if (req.body.id) return req.body.id;
    if (req.body._id) return req.body._id;
  }
  
  return null;
};

/**
 * Sanitize request data (remove sensitive information)
 */
const sanitizeRequestData = (data) => {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveFields = [
    'password', 'confirmPassword', 'oldPassword', 'newPassword',
    'token', 'refreshToken', 'accessToken', 'apiKey', 'secret',
    'creditCard', 'cardNumber', 'cvv', 'pin'
  ];
  
  const sanitized = { ...data };
  
  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    for (const key in obj) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
    return obj;
  };
  
  return sanitizeObject(sanitized);
};

/**
 * Activity Logger Middleware
 */
const activityLogger = (req, res, next) => {
  // Skip logging for certain routes
  const skipRoutes = ['/health', '/favicon.ico', '/static', '/css', '/js', '/images'];
  if (skipRoutes.some(route => req.path.includes(route))) {
    return next();
  }
  
  const startTime = Date.now();
  
  // Capture original res.json and res.send
  const originalJson = res.json;
  const originalSend = res.send;
  
  let responseData = null;
  let responseLogged = false;
  
  const logActivity = async (responseBody = null) => {
    if (responseLogged) return;
    responseLogged = true;
    
    try {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Only log if user is authenticated
      if (!req.user) return;
      
      const activityData = {
        userId: req.user.id || req.user._id,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: getActionFromRequest(req),
        method: req.method,
        endpoint: `${req.baseUrl || ''}${req.route?.path || req.path}`,
        requestData: sanitizeRequestData({
          params: req.params,
          query: req.query,
          body: req.body
        }),
        responseStatus: res.statusCode,
        responseMessage: responseBody ? (typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody).substring(0, 500)) : null,
        resourceType: getResourceType(req),
        resourceId: getResourceId(req),
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID || req.session?.id,
        duration,
        success: res.statusCode < 400,
        errorDetails: res.statusCode >= 400 ? responseBody : null,
        metadata: {
          referer: req.get('Referer'),
          origin: req.get('Origin'),
          contentType: req.get('Content-Type'),
          contentLength: req.get('Content-Length')
        }
      };
      
      // Save to MongoDB
      const activityLog = new ActivityLog(activityData);
      await activityLog.save();
      
      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(` Activity Logged: ${activityData.userRole} - ${activityData.action} - ${activityData.responseStatus} - ${duration}ms`);
      }
      
    } catch (error) {
      console.error(' Failed to log activity:', error);
    }
  };
  
  // Override res.json
  res.json = function(data) {
    responseData = data;
    logActivity(data);
    return originalJson.call(this, data);
  };
  
  // Override res.send
  res.send = function(data) {
    if (!responseData) {
      responseData = data;
      logActivity(data);
    }
    return originalSend.call(this, data);
  };
  
  // Handle cases where response is sent without json/send
  res.on('finish', () => {
    if (!responseLogged) {
      logActivity();
    }
  });
  
  next();
};

/**
 * Get activity logs for admin dashboard
 */
const getActivityLogs = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      userRole, 
      action, 
      userId, 
      startDate, 
      endDate,
      resourceType 
    } = req.query;
    
    const query = {};
    
    if (userRole) query.userRole = userRole;
    if (action) query.action = action;
    if (userId) query.userId = userId;
    if (resourceType) query.resourceType = resourceType;
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
    const [logs, total] = await Promise.all([
      ActivityLog.find(query)
        .populate('userId', 'name email role')
        .sort({ timestamp: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      ActivityLog.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: {
        logs: logs.map(log => log.toSafeObject()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity logs'
    });
  }
};

/**
 * Get activity statistics
 */
const getActivityStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const stats = await ActivityLog.getActivityStats(startDate, endDate);
    
    // Get summary statistics
    const summary = await ActivityLog.aggregate([
      {
        $match: startDate && endDate ? {
          timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) }
        } : {}
      },
      {
        $group: {
          _id: null,
          totalActivities: { $sum: 1 },
          adminActivities: { $sum: { $cond: [{ $eq: ['$userRole', 'admin'] }, 1, 0] } },
          userActivities: { $sum: { $cond: [{ $eq: ['$userRole', 'user'] }, 1, 0] } },
          successfulActivities: { $sum: { $cond: ['$success', 1, 0] } },
          failedActivities: { $sum: { $cond: ['$success', 0, 1] } },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          _id: 0,
          totalActivities: 1,
          adminActivities: 1,
          userActivities: 1,
          successfulActivities: 1,
          failedActivities: 1,
          uniqueUsersCount: { $size: '$uniqueUsers' }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        summary: summary[0] || {
          totalActivities: 0,
          adminActivities: 0,
          userActivities: 0,
          successfulActivities: 0,
          failedActivities: 0,
          uniqueUsersCount: 0
        },
        detailed: stats
      }
    });
    
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity statistics'
    });
  }
};

module.exports = {
  activityLogger,
  getActivityLogs,
  getActivityStats
};

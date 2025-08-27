const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verify JWT Token
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'User account is suspended'
      });
    }

    // Attach user to request
    req.user = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status
    };

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid access token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Access token has expired'
      });
    }

    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Token verification failed'
    });
  }
};

/**
 * Check if user has required role
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient privileges'
      });
    }

    next();
  };
};

/**
 * Admin authentication middleware
 */
const requireAdmin = requireRole('admin', 'super_admin');

/**
 * Super admin authentication middleware
 */
const requireSuperAdmin = requireRole('super_admin');

/**
 * Check if user owns the resource or is admin
 */
const requireOwnershipOrAdmin = (resourceUserField = 'user') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Admin can access all resources
      if (['admin', 'super_admin'].includes(req.user.role)) {
        return next();
      }

      // Extract resource ID from request
      const resourceId = req.params.id || req.params.vehicleId || req.params.bookingId;
      
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: 'Resource ID is required'
        });
      }

      // The specific ownership check will be handled by the controller
      // This middleware just ensures the user is authenticated
      next();

    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        success: false,
        message: 'Authorization check failed'
      });
    }
  };
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (user && user.status === 'active') {
      req.user = {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status
      };
    }

    next();

  } catch (error) {
    // Ignore token errors for optional auth
    next();
  }
};

/**
 * Rate limiting for sensitive operations
 */
const sensitiveOperation = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
  const attempts = new Map();

  return (req, res, next) => {
    const identifier = req.user ? req.user.id : req.ip;
    const now = Date.now();
    
    if (!attempts.has(identifier)) {
      attempts.set(identifier, []);
    }

    const userAttempts = attempts.get(identifier);
    
    // Remove attempts outside the window
    const validAttempts = userAttempts.filter(attempt => now - attempt < windowMs);
    attempts.set(identifier, validAttempts);

    if (validAttempts.length >= maxAttempts) {
      return res.status(429).json({
        success: false,
        message: 'Too many attempts. Please try again later.',
        retryAfter: Math.ceil((validAttempts[0] + windowMs - now) / 1000)
      });
    }

    // Record this attempt
    validAttempts.push(now);
    
    next();
  };
};

module.exports = {
  verifyToken,
  requireRole,
  requireAdmin,
  requireSuperAdmin,
  requireOwnershipOrAdmin,
  optionalAuth,
  sensitiveOperation
};
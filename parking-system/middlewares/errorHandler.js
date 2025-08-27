const mongoose = require('mongoose');

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    user: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // Default error
  let error = {
    success: false,
    message: err.message || 'Server Error',
    statusCode: err.statusCode || 500
  };

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error.message = 'Resource not found';
    error.statusCode = 404;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    error.message = `${field} '${value}' already exists`;
    error.statusCode = 409;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    error.message = 'Validation Error';
    error.errors = messages;
    error.statusCode = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired';
    error.statusCode = 401;
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    error.message = 'File size too large';
    error.statusCode = 413;
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error.message = 'Unexpected file field';
    error.statusCode = 400;
  }

  // Network errors
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    error.message = 'External service unavailable';
    error.statusCode = 503;
  }

  // MongoDB connection errors
  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    error.message = 'Database connection error';
    error.statusCode = 503;
  }

  // Rate limiting errors
  if (err.statusCode === 429) {
    error.message = 'Too many requests, please slow down';
    error.statusCode = 429;
  }

  // Send response
  const response = {
    success: false,
    message: error.message,
    ...(error.errors && { errors: error.errors })
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.original_error = err;
  }

  // Log error to external service in production
  if (process.env.NODE_ENV === 'production') {
    // Log to monitoring service (Sentry, LogRocket, etc.)
    logErrorToService(err, req);
  }

  res.status(error.statusCode).json(response);
};

/**
 * Handle 404 errors
 */
const notFound = (req, res, next) => {
  const error = new Error(`Not found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * Async error wrapper
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Log error to external monitoring service
 */
const logErrorToService = (error, req) => {
  // Implementation depends on your monitoring service
  // Example: Sentry, LogRocket, Datadog, etc.
  
  const errorData = {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    headers: req.headers,
    user: req.user?.id,
    body: req.body,
    query: req.query,
    params: req.params,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version
  };

  // Log to console for now (replace with actual service)
  console.error('Production Error:', errorData);

  // Example Sentry integration:
  // Sentry.captureException(error, {
  //   user: { id: req.user?.id },
  //   request: req,
  //   extra: errorData
  // });
};

/**
 * Validation error formatter
 */
const formatValidationErrors = (errors) => {
  return errors.array().map(error => ({
    field: error.param,
    message: error.msg,
    value: error.value,
    location: error.location
  }));
};

/**
 * Create standardized error response
 */
const createError = (message, statusCode = 500, errors = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (errors) error.errors = errors;
  return error;
};

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (err, promise) => {
  console.error('Unhandled Promise Rejection:', err.message);
  
  // Log the error
  if (process.env.NODE_ENV === 'production') {
    logErrorToService(err, {});
  }
  
  // Close server & exit process
  // server.close(() => {
  //   process.exit(1);
  // });
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  
  // Log the error
  if (process.env.NODE_ENV === 'production') {
    logErrorToService(err, {});
  }
  
  // Exit process
  process.exit(1);
});

module.exports = {
  errorHandler,
  notFound,
  asyncHandler,
  formatValidationErrors,
  createError
};
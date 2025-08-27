const fs = require('fs');
const path = require('path');

/**
 * Custom Logger Middleware
 */
const logger = (req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  
  // Log request
  const requestLog = {
    timestamp,
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    user: req.user?.id || 'anonymous',
    body: req.method === 'POST' || req.method === 'PUT' ? sanitizeBody(req.body) : undefined,
    query: Object.keys(req.query).length ? req.query : undefined
  };

  console.log(`${timestamp} - ${req.method} ${req.url} - IP: ${requestLog.ip} - User: ${requestLog.user}`);

  // Capture response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    
    const responseLog = {
      ...requestLog,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: Buffer.byteLength(data, 'utf8')
    };

    // Color code based on status
    const statusColor = getStatusColor(res.statusCode);
    console.log(`${timestamp} - ${req.method} ${req.url} - ${statusColor}${res.statusCode}\x1b[0m - ${duration}ms`);

    // Log to file in production
    if (process.env.NODE_ENV === 'production') {
      logToFile(responseLog);
    }

    // Log errors
    if (res.statusCode >= 400) {
      logError(responseLog, data);
    }

    // Call original send
    originalSend.call(this, data);
  };

  next();
};

/**
 * Get color for status code
 */
const getStatusColor = (statusCode) => {
  if (statusCode >= 500) return '\x1b[31m'; // Red
  if (statusCode >= 400) return '\x1b[33m'; // Yellow
  if (statusCode >= 300) return '\x1b[36m'; // Cyan
  if (statusCode >= 200) return '\x1b[32m'; // Green
  return '\x1b[0m'; // Default
};

/**
 * Sanitize request body (remove sensitive data)
 */
const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') return body;
  
  const sensitiveFields = ['password', 'token', 'refreshToken', 'apiKey', 'secret'];
  const sanitized = { ...body };
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

/**
 * Log to file
 */
const logToFile = (logData) => {
  try {
    const logDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `access-${date}.log`);
    
    const logLine = JSON.stringify(logData) + '\n';
    fs.appendFileSync(logFile, logLine);
  } catch (error) {
    console.error('Failed to write log file:', error);
  }
};

/**
 * Log errors to separate file
 */
const logError = (logData, responseData) => {
  try {
    const logDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const date = new Date().toISOString().split('T')[0];
    const errorFile = path.join(logDir, `error-${date}.log`);
    
    const errorLog = {
      ...logData,
      error: true,
      response: process.env.NODE_ENV === 'development' ? responseData : undefined
    };
    
    const logLine = JSON.stringify(errorLog) + '\n';
    fs.appendFileSync(errorFile, logLine);
  } catch (error) {
    console.error('Failed to write error log file:', error);
  }
};

/**
 * API Analytics Logger
 */
const apiAnalytics = (req, res, next) => {
  // Track API usage for analytics
  const analyticsData = {
    endpoint: req.route?.path || req.url,
    method: req.method,
    timestamp: new Date(),
    user: req.user?.id,
    userRole: req.user?.role,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  };

  // Store in database or analytics service
  // For now, just log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('API Analytics:', analyticsData);
  }

  next();
};

/**
 * Security Logger
 */
const securityLogger = (req, res, next) => {
  const securityEvents = [];
  
  // Check for suspicious patterns
  if (req.url.includes('../') || req.url.includes('..\\')) {
    securityEvents.push('Path traversal attempt');
  }
  
  if (req.url.toLowerCase().includes('script') || 
      req.url.toLowerCase().includes('javascript:')) {
    securityEvents.push('Potential XSS attempt');
  }
  
  if (req.headers['user-agent']?.toLowerCase().includes('bot') && 
      !req.headers['user-agent']?.toLowerCase().includes('googlebot')) {
    securityEvents.push('Bot access detected');
  }

  // Log multiple failed requests from same IP
  if (res.statusCode === 401 || res.statusCode === 403) {
    securityEvents.push('Authentication failure');
  }

  if (securityEvents.length > 0) {
    const securityLog = {
      timestamp: new Date().toISOString(),
      ip: req.ip,
      url: req.url,
      method: req.method,
      userAgent: req.headers['user-agent'],
      events: securityEvents,
      user: req.user?.id
    };

    console.warn('Security Event:', securityLog);
    
    // Log to security file
    try {
      const logDir = path.join(__dirname, '../logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const date = new Date().toISOString().split('T')[0];
      const securityFile = path.join(logDir, `security-${date}.log`);
      
      const logLine = JSON.stringify(securityLog) + '\n';
      fs.appendFileSync(securityFile, logLine);
    } catch (error) {
      console.error('Failed to write security log:', error);
    }
  }

  next();
};

/**
 * Performance Logger
 */
const performanceLogger = (req, res, next) => {
  const start = process.hrtime();
  const startMemory = process.memoryUsage();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const duration = diff[0] * 1000 + diff[1] * 1e-6; // Convert to milliseconds
    const endMemory = process.memoryUsage();
    
    const memoryDiff = {
      rss: endMemory.rss - startMemory.rss,
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal
    };

    if (duration > 1000) { // Log slow requests (>1 second)
      console.warn(`Slow Request: ${req.method} ${req.url} - ${duration.toFixed(2)}ms`, {
        duration,
        memoryDiff,
        user: req.user?.id
      });
    }
  });

  next();
};

module.exports = {
  logger,
  apiAnalytics,
  securityLogger,
  performanceLogger
};
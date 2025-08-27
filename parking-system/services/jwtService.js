const jwt = require('jsonwebtoken');

/**
 * Generate Access and Refresh Tokens
 */
const generateTokens = (userId, role, expiresIn = null) => {
  const payload = {
    userId,
    role,
    type: 'access'
  };

  const accessTokenExpiry = expiresIn || process.env.JWT_EXPIRES_IN || '1h';
  const refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

  const accessToken = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: accessTokenExpiry }
  );

  const refreshToken = jwt.sign(
    { userId, role, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: refreshTokenExpiry }
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: accessTokenExpiry
  };
};

/**
 * Verify Access Token
 */
const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    throw error;
  }
};

/**
 * Verify Refresh Token
 */
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    throw error;
  }
};

/**
 * Generate API Key Token
 */
const generateAPIKeyToken = (userId, permissions = [], expiresIn = '1y') => {
  const payload = {
    userId,
    type: 'api_key',
    permissions,
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

/**
 * Generate Password Reset Token
 */
const generatePasswordResetToken = (userId, expiresIn = '1h') => {
  const payload = {
    userId,
    type: 'password_reset',
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

/**
 * Generate Email Verification Token
 */
const generateEmailVerificationToken = (userId, email, expiresIn = '24h') => {
  const payload = {
    userId,
    email,
    type: 'email_verification',
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

/**
 * Decode Token without verification (for debugging)
 */
const decodeToken = (token) => {
  try {
    return jwt.decode(token, { complete: true });
  } catch (error) {
    return null;
  }
};

/**
 * Check if token is expired
 */
const isTokenExpired = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return true;
    
    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch (error) {
    return true;
  }
};

/**
 * Get token expiration time
 */
const getTokenExpiration = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return null;
    
    return new Date(decoded.exp * 1000);
  } catch (error) {
    return null;
  }
};

/**
 * Generate temporary access token (for password reset flows)
 */
const generateTemporaryToken = (userId, purpose, expiresIn = '15m') => {
  const payload = {
    userId,
    type: 'temporary',
    purpose,
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

/**
 * Verify temporary token
 */
const verifyTemporaryToken = (token, expectedPurpose) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'temporary') {
      throw new Error('Invalid token type');
    }

    if (decoded.purpose !== expectedPurpose) {
      throw new Error('Invalid token purpose');
    }

    return decoded;
  } catch (error) {
    throw error;
  }
};

/**
 * Generate device-specific token
 */
const generateDeviceToken = (userId, deviceId, expiresIn = '30d') => {
  const payload = {
    userId,
    deviceId,
    type: 'device',
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

/**
 * Extract user info from token
 */
const extractUserFromToken = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded) return null;

    return {
      userId: decoded.userId,
      role: decoded.role,
      type: decoded.type,
      deviceId: decoded.deviceId,
      permissions: decoded.permissions,
      issuedAt: decoded.iat ? new Date(decoded.iat * 1000) : null,
      expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : null
    };
  } catch (error) {
    return null;
  }
};

/**
 * Blacklist token (for logout/security)
 */
const blacklistToken = (token) => {
  // In a real implementation, you'd store blacklisted tokens in Redis or database
  // with expiration matching the token's expiration
  const decoded = jwt.decode(token);
  if (!decoded) return false;

  // For now, just log it
  console.log(`Token blacklisted: ${token.substring(0, 20)}...`);
  
  // TODO: Store in Redis with TTL
  // redis.setex(`blacklist:${token}`, decoded.exp - Math.floor(Date.now() / 1000), '1');
  
  return true;
};

/**
 * Check if token is blacklisted
 */
const isTokenBlacklisted = async (token) => {
  // TODO: Check Redis for blacklisted token
  // return await redis.exists(`blacklist:${token}`);
  return false;
};

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  generateAPIKeyToken,
  generatePasswordResetToken,
  generateEmailVerificationToken,
  generateTemporaryToken,
  verifyTemporaryToken,
  generateDeviceToken,
  decodeToken,
  isTokenExpired,
  getTokenExpiration,
  extractUserFromToken,
  blacklistToken,
  isTokenBlacklisted
};
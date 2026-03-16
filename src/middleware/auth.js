'use strict';

const JwtService = require('../services/JwtService');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid token' });
  }

  const payload = JwtService.verifyAccessToken(token);
  if (!payload || !payload.sub) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }

  req.userId = payload.sub;
  req.userRole = payload.role;
  next();
}

/** Optional auth: set req.userId and req.userRole if valid Bearer token present; otherwise continue without them. */
function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return next();
  const payload = JwtService.verifyAccessToken(token);
  if (payload && payload.sub) {
    req.userId = payload.sub;
    req.userRole = payload.role;
  }
  next();
}

module.exports = { authMiddleware, optionalAuthMiddleware };

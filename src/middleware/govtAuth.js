'use strict';

const GovtService = require('../services/GovtService');
const { clientIp } = require('../utils/requestIp');

/**
 * @param {string[]} requiredPermissionKeys - e.g. ['ventures.list']
 */
function govtAuth(requiredPermissionKeys) {
  return async function govtAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const raw = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!raw) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Missing government API bearer token' });
    }

    const row = await GovtService.findTokenByRaw(raw);
    if (!row) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
    }

    for (const key of requiredPermissionKeys) {
      if (!GovtService.hasPermission(row.permissions, key)) {
        return res.status(403).json({ error: 'Forbidden', message: `Missing permission: ${key}` });
      }
    }

    req.govtTokenId = row.id;
    req.govtTokenName = row.name;
    req.govtPermissions = row.permissions;

    const ip = clientIp(req);
    const path = req.originalUrl || req.url;
    const method = req.method;

    res.on('finish', () => {
      GovtService.logAccess(row.id, {
        path,
        method,
        ip,
        statusCode: res.statusCode,
      }).catch(() => {});
    });

    GovtService.touchLastUsed(row.id).catch(() => {});
    next();
  };
}

module.exports = { govtAuth };

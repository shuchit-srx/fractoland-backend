'use strict';

/**
 * Require request to be authenticated and have one of the given roles.
 * Use after authMiddleware.
 */
function requireRole(allowedRoles) {
  const set = new Set(Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]);
  return (req, res, next) => {
    if (!req.userId || !req.userRole) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }
    if (!set.has(req.userRole)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient role' });
    }
    next();
  };
}

module.exports = { requireRole };

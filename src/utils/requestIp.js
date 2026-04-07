'use strict';

/** Best-effort client IP for audit logs (honors X-Forwarded-For when present). */
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) {
    const first = xf.split(',')[0].trim();
    if (first) return first.slice(0, 45);
  }
  const raw = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  return raw ? String(raw).slice(0, 45) : null;
}

module.exports = { clientIp };

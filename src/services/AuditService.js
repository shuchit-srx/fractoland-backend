'use strict';

const { adminSupabase } = require('../config/database');

/**
 * @param {object} opts
 * @param {string|null} opts.userId - actor (nullable for system/webhook)
 * @param {string} opts.action - e.g. venture.update, payment.withdraw.completed
 * @param {string|null} [opts.resourceType]
 * @param {string|null} [opts.resourceId]
 * @param {object} [opts.payload] - JSON-serializable snapshot (stored as JSONB)
 * @param {string|null} [opts.ip]
 */
async function log(opts) {
  const { userId, action, resourceType, resourceId, payload, ip } = opts;
  const { error } = await adminSupabase.from('audit_logs').insert({
    user_id: userId || null,
    action: String(action || 'unknown').slice(0, 100),
    resource_type: resourceType != null ? String(resourceType).slice(0, 50) : null,
    resource_id: resourceId || null,
    payload: payload && typeof payload === 'object' ? payload : {},
    ip: ip != null ? String(ip).slice(0, 45) : null,
  });
  if (error) console.error('audit_logs insert failed:', error.message);
}

/** Same as log but never throws; use from hot paths. */
async function safeLog(opts) {
  try {
    await log(opts);
  } catch (e) {
    console.error('audit safeLog error', e);
  }
}

async function list({ limit = 50, offset = 0, action, resource_type, user_id } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  let q = adminSupabase
    .from('audit_logs')
    .select('id, user_id, action, resource_type, resource_id, payload, ip, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);
  if (action) q = q.eq('action', action);
  if (resource_type) q = q.eq('resource_type', resource_type);
  if (user_id) q = q.eq('user_id', user_id);
  const { data, error, count } = await q;
  if (error) throw error;
  return { items: data || [], total: count ?? 0 };
}

module.exports = { log, safeLog, list };

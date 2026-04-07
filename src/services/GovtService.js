'use strict';

const crypto = require('crypto');
const { adminSupabase } = require('../config/database');

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest('hex');
}

async function findTokenByRaw(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const h = hashToken(raw.trim());
  const { data, error } = await adminSupabase
    .from('govt_api_tokens')
    .select('id, name, permissions')
    .eq('token_hash', h)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function touchLastUsed(tokenId) {
  await adminSupabase.from('govt_api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tokenId);
}

function hasPermission(permissions, key) {
  if (!permissions || typeof permissions !== 'object') return false;
  if (permissions.all === true) return true;
  return permissions[key] === true;
}

async function logAccess(tokenId, { path, method, ip, statusCode }) {
  if (!tokenId) return;
  const { error } = await adminSupabase.from('govt_api_access_logs').insert({
    token_id: tokenId,
    path: String(path || '').slice(0, 2000),
    method: method ? String(method).slice(0, 12) : null,
    ip: ip != null ? String(ip).slice(0, 45) : null,
    status_code: statusCode != null ? Number(statusCode) : null,
  });
  if (error) console.error('govt_api_access_logs insert failed', error.message);
}

function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createToken({ name, permissions }) {
  const raw = generateRawToken();
  const token_hash = hashToken(raw);
  const { data, error } = await adminSupabase
    .from('govt_api_tokens')
    .insert({
      name: name != null ? String(name).slice(0, 100) : 'token',
      token_hash,
      permissions: permissions && typeof permissions === 'object' ? permissions : {},
    })
    .select('id, name, permissions, created_at')
    .single();
  if (error) throw error;
  return { ...data, token: raw };
}

async function listTokens() {
  const { data, error } = await adminSupabase
    .from('govt_api_tokens')
    .select('id, name, permissions, last_used_at, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

module.exports = {
  hashToken,
  findTokenByRaw,
  touchLastUsed,
  hasPermission,
  logAccess,
  createToken,
  listTokens,
};

'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { adminSupabase } = require('../config/database');

const accessSecret = process.env.JWT_ACCESS_SECRET || 'change-me-access-secret';
const refreshSecret = process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret';
const accessExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
const refreshExpiryDays = parseInt(process.env.JWT_REFRESH_EXPIRY_DAYS || '7', 10);

function signAccessToken(payload) {
  return jwt.sign(
    { ...payload, type: 'access' },
    accessSecret,
    { expiresIn: accessExpiry }
  );
}

function signRefreshToken(userId) {
  const jti = uuidv4();
  const token = jwt.sign(
    { sub: userId, type: 'refresh', jti },
    refreshSecret,
    { expiresIn: `${refreshExpiryDays}d` }
  );
  return { token, jti, expiresInDays: refreshExpiryDays };
}

function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, accessSecret);
    if (decoded.type !== 'access') throw new Error('Invalid token type');
    return decoded;
  } catch (e) {
    return null;
  }
}

function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, refreshSecret);
    if (decoded.type !== 'refresh') throw new Error('Invalid token type');
    return decoded;
  } catch (e) {
    return null;
  }
}

async function storeRefreshToken(userId, tokenHash, expiresAt) {
  const { error } = await adminSupabase.from('refresh_tokens').insert({
    id: uuidv4(),
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw error;
}

async function findRefreshToken(userId, tokenHash) {
  const now = new Date().toISOString();
  const { data, error } = await adminSupabase
    .from('refresh_tokens')
    .select('id')
    .eq('user_id', userId)
    .eq('token_hash', tokenHash)
    .gt('expires_at', now)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function revokeRefreshToken(userId, tokenHash) {
  const { error } = await adminSupabase
    .from('refresh_tokens')
    .update({ expires_at: new Date(0).toISOString() })
    .eq('user_id', userId)
    .eq('token_hash', tokenHash);
  if (error) throw error;
}

const crypto = require('crypto');
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  storeRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  hashToken,
  refreshExpiryDays,
};

'use strict';

const store = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;

function getKey(phone, purpose) {
  return `otp:${purpose}:${phone}`;
}

function cleanup() {
  const now = Date.now();
  for (const [key, data] of store.entries()) {
    if (data.expiresAt < now) store.delete(key);
  }
}

if (typeof setInterval !== 'undefined') {
  setInterval(cleanup, 60000);
}

function checkRateLimit(phone, purpose = 'login') {
  const key = getKey(phone, purpose);
  const now = Date.now();
  const record = store.get(key);

  if (!record) {
    store.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_PER_WINDOW - 1 };
  }

  if (record.expiresAt < now) {
    store.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_PER_WINDOW - 1 };
  }

  record.count += 1;
  if (record.count > MAX_PER_WINDOW) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((record.expiresAt - now) / 1000) };
  }
  return { allowed: true, remaining: MAX_PER_WINDOW - record.count };
}

module.exports = { checkRateLimit };

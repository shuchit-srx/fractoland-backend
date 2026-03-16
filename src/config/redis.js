'use strict';

/**
 * Optional Redis client for sessions, OTP rate-limiting, and cache.
 * If REDIS_URL is not set, getClient() returns null and callers should skip Redis-dependent behavior.
 * Install: npm install redis
 */
let client = null;
let connectPromise = null;

function getClient() {
  return client;
}

async function ensureConnected() {
  if (client) return client;
  if (connectPromise) return connectPromise;
  const url = process.env.REDIS_URL;
  if (!url || url.trim() === '') return null;
  try {
    const Redis = require('redis');
    const c = Redis.createClient({ url });
    c.on('error', (err) => console.warn('Redis client error:', err.message));
    connectPromise = c.connect().then(() => {
      client = c;
      return c;
    });
    return connectPromise;
  } catch (e) {
    console.warn('Redis not available:', e.message);
    return null;
  }
}

async function get(key) {
  const c = await ensureConnected();
  if (!c) return null;
  try {
    return await c.get(key);
  } catch {
    return null;
  }
}

async function set(key, value, options = {}) {
  const c = await ensureConnected();
  if (!c) return false;
  try {
    const { exSeconds } = options;
    if (exSeconds != null) await c.setEx(key, exSeconds, value);
    else await c.set(key, value);
    return true;
  } catch {
    return false;
  }
}

async function del(key) {
  const c = await ensureConnected();
  if (!c) return false;
  try {
    await c.del(key);
    return true;
  } catch {
    return false;
  }
}

module.exports = { getClient, ensureConnected, get, set, del };

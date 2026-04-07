'use strict';

const NotificationService = require('../services/NotificationService');

function parseLimitOffset(query) {
  const limitRaw = query.limit != null ? Number(query.limit) : 30;
  const offsetRaw = query.offset != null ? Number(query.offset) : 0;
  const limit = Math.min(Number.isFinite(limitRaw) ? limitRaw : 30, 100);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  return { limit, offset };
}

async function listMe(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const { read } = req.query;
    const result = await NotificationService.listForUser(req.userId, { read, limit, offset });
    res.json(result);
  } catch (e) {
    console.error('notifications listMe error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function markRead(req, res) {
  try {
    const row = await NotificationService.markRead(req.userId, req.params.id);
    res.json(row);
  } catch (e) {
    console.error('notifications markRead error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

async function markAllRead(req, res) {
  try {
    const result = await NotificationService.markAllRead(req.userId);
    res.json(result);
  } catch (e) {
    console.error('notifications markAllRead error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function remove(req, res) {
  try {
    const result = await NotificationService.remove(req.userId, req.params.id);
    res.json(result);
  } catch (e) {
    console.error('notifications remove error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

module.exports = { listMe, markRead, markAllRead, remove };

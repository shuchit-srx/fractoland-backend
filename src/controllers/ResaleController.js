'use strict';

const ResaleService = require('../services/ResaleService');

function parseLimitOffset(query) {
  const limitRaw = query.limit != null ? Number(query.limit) : 20;
  const offsetRaw = query.offset != null ? Number(query.offset) : 0;
  const limit = Math.min(Number.isFinite(limitRaw) ? limitRaw : 20, 100);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  return { limit, offset };
}

async function create(req, res) {
  try {
    const { venture_id, token_count, requested_amount } = req.body || {};
    const row = await ResaleService.create(req.userId, { venture_id, token_count, requested_amount });
    res.status(201).json(row);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

async function listMe(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const { status } = req.query;
    const result = await ResaleService.listByUser(req.userId, { status, limit, offset });
    res.json(result);
  } catch (e) {
    console.error('resale listMe error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function availability(req, res) {
  try {
    const { ventureId } = req.params;
    const summary = await ResaleService.getAvailability(req.userId, ventureId);
    res.json(summary);
  } catch (e) {
    console.error('resale availability error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function cancel(req, res) {
  try {
    const row = await ResaleService.cancel(req.userId, req.params.id);
    res.json(row);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

async function adminList(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const { status, venture_id } = req.query;
    const result = await ResaleService.listAdmin({ status, venture_id, limit, offset });
    res.json(result);
  } catch (e) {
    console.error('resale adminList error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function adminPatch(req, res) {
  try {
    const { status, queue_position } = req.body || {};
    const row = await ResaleService.adminUpdate(req.params.id, { status, queue_position });
    res.json(row);
  } catch (e) {
    const statusCode = e.status || 500;
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Server error' : 'Request error',
      message: e.message,
    });
  }
}

module.exports = { create, listMe, cancel, adminList, adminPatch, availability };

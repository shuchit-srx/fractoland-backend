'use strict';

const PollService = require('../services/PollService');
const OwnerService = require('../services/OwnerService');

function parseLimitOffset(query) {
  const limitRaw = query.limit != null ? Number(query.limit) : 20;
  const offsetRaw = query.offset != null ? Number(query.offset) : 0;
  const limit = Math.min(Number.isFinite(limitRaw) ? limitRaw : 20, 100);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  return { limit, offset };
}

async function listPolls(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const statusParam = req.query.status || 'all';
    const st = ['active', 'closed', 'all'].includes(statusParam) ? statusParam : 'all';
    const result = await PollService.listForOwner(req.userId, { status: st, limit, offset });
    res.json(result);
  } catch (e) {
    console.error('owners listPolls error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function createPoll(req, res) {
  try {
    const poll = await PollService.createForOwner(req.userId, req.body || {});
    res.status(201).json(poll);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

async function proceeds(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const result = await OwnerService.listInvestmentProceeds(req.userId, { limit, offset });
    res.json(result);
  } catch (e) {
    console.error('owners proceeds error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { listPolls, createPoll, proceeds };

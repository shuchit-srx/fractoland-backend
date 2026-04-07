'use strict';

const DeveloperBidService = require('../services/DeveloperBidService');

function parseLimitOffset(query) {
  const limitRaw = query.limit != null ? Number(query.limit) : 30;
  const offsetRaw = query.offset != null ? Number(query.offset) : 0;
  const limit = Math.min(Number.isFinite(limitRaw) ? limitRaw : 30, 100);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  return { limit, offset };
}

async function place(req, res) {
  try {
    const { venture_id, bid_amount, notes } = req.body || {};
    const row = await DeveloperBidService.placeBid(req.userId, { venture_id, bid_amount, notes });
    res.status(201).json(row);
  } catch (e) {
    console.error('developerBids place error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

async function listMe(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const { status } = req.query;
    const result = await DeveloperBidService.listForDeveloper(req.userId, { status, limit, offset });
    res.json(result);
  } catch (e) {
    console.error('developerBids listMe error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listProjects(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const result = await DeveloperBidService.listProjectsForDeveloper(req.userId, { limit, offset });
    res.json(result);
  } catch (e) {
    console.error('developerBids listProjects error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { place, listMe, listProjects };

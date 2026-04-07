'use strict';

const VentureService = require('../services/VentureService');
const ResaleService = require('../services/ResaleService');
const PollService = require('../services/PollService');
const DeveloperBidService = require('../services/DeveloperBidService');
const PaymentService = require('../services/PaymentService');
const AdminAnalyticsService = require('../services/AdminAnalyticsService');
const AuditService = require('../services/AuditService');
const { clientIp } = require('../utils/requestIp');

function parseLimitOffset(query, maxLimit = 100) {
  const limitRaw = query.limit != null ? Number(query.limit) : 50;
  const offsetRaw = query.offset != null ? Number(query.offset) : 0;
  const limit = Math.min(Number.isFinite(limitRaw) ? limitRaw : 50, maxLimit);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  return { limit, offset };
}

async function analytics(req, res) {
  try {
    const summary = await AdminAnalyticsService.getSummary();
    res.json(summary);
  } catch (e) {
    console.error('admin analytics error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listVentures(req, res) {
  try {
    const { status, state, owner_id, limit, offset } = req.query;
    const result = await VentureService.list(
      {
        status,
        state,
        owner_id,
        limit: limit != null ? Math.min(Number(limit), 100) : 50,
        offset: offset != null ? Number(offset) : 0,
      },
      req.userId,
      'admin'
    );
    res.json(result);
  } catch (e) {
    console.error('admin listVentures error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getVenture(req, res) {
  try {
    const venture = await VentureService.findById(req.params.id);
    if (!venture) return res.status(404).json({ error: 'Not found', message: 'Venture not found' });
    res.json(venture);
  } catch (e) {
    console.error('admin getVenture error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateVenture(req, res) {
  try {
    const venture = await VentureService.findById(req.params.id);
    if (!venture) return res.status(404).json({ error: 'Not found', message: 'Venture not found' });
    const prev = { status: venture.status, name: venture.name };
    const updated = await VentureService.update(req.params.id, req.body || {});
    await AuditService.safeLog({
      userId: req.userId,
      action: 'venture.update',
      resourceType: 'venture',
      resourceId: req.params.id,
      payload: { before: prev, body: req.body || {} },
      ip: clientIp(req),
    });
    res.json(updated);
  } catch (e) {
    console.error('admin updateVenture error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listResaleQueue(req, res) {
  try {
    const { status, venture_id, limit, offset } = req.query;
    const result = await ResaleService.listAdmin({
      status,
      venture_id,
      limit: limit != null ? Number(limit) : 50,
      offset: offset != null ? Number(offset) : 0,
    });
    res.json(result);
  } catch (e) {
    console.error('admin listResaleQueue error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function patchResaleRequest(req, res) {
  try {
    const { status, queue_position } = req.body || {};
    const row = await ResaleService.adminUpdate(req.params.id, { status, queue_position });
    await AuditService.safeLog({
      userId: req.userId,
      action: 'resale_request.admin_update',
      resourceType: 'resale_request',
      resourceId: req.params.id,
      payload: { status, queue_position },
      ip: clientIp(req),
    });
    res.json(row);
  } catch (e) {
    console.error('admin patchResaleRequest error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

async function listPolls(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const status = req.query.status || undefined;
    const result = await PollService.listAllAdmin({ status, limit, offset });
    res.json(result);
  } catch (e) {
    console.error('admin listPolls error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listDeveloperBids(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const { status, venture_id } = req.query;
    const result = await DeveloperBidService.listAdmin({ status, venture_id, limit, offset });
    res.json(result);
  } catch (e) {
    console.error('admin listDeveloperBids error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function patchDeveloperBid(req, res) {
  try {
    const { status, notes } = req.body || {};
    if (!status) return res.status(400).json({ error: 'Bad request', message: 'status is required' });
    const row = await DeveloperBidService.updateStatus(req.params.id, { status, notes });
    await AuditService.safeLog({
      userId: req.userId,
      action: 'developer_bid.admin_update',
      resourceType: 'developer_bid',
      resourceId: req.params.id,
      payload: { status, notes },
      ip: clientIp(req),
    });
    res.json(row);
  } catch (e) {
    console.error('admin patchDeveloperBid error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

async function listPayments(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const { type, status, user_id } = req.query;
    const result = await PaymentService.listAllAdmin({ type, status, user_id, limit, offset });
    res.json(result);
  } catch (e) {
    console.error('admin listPayments error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listAuditLogs(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query, 200);
    const { action, resource_type, user_id } = req.query;
    const result = await AuditService.list({ limit, offset, action, resource_type, user_id });
    res.json(result);
  } catch (e) {
    console.error('admin listAuditLogs error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  analytics,
  listVentures,
  getVenture,
  updateVenture,
  listResaleQueue,
  patchResaleRequest,
  listPolls,
  listDeveloperBids,
  patchDeveloperBid,
  listPayments,
  listAuditLogs,
};

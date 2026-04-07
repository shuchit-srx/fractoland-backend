'use strict';

const ReferralService = require('../services/ReferralService');
const AuditService = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const { clientIp } = require('../utils/requestIp');

function parseLimitOffset(query) {
  const limitRaw = query.limit != null ? Number(query.limit) : 20;
  const offsetRaw = query.offset != null ? Number(query.offset) : 0;
  const limit = Math.min(Number.isFinite(limitRaw) ? limitRaw : 20, 100);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  return { limit, offset };
}

async function trackClick(req, res) {
  try {
    const code = req.params.code;
    const result = await ReferralService.trackClick(code);
    res.json(result);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

async function listLinks(req, res) {
  try {
    const items = await ReferralService.listLinks(req.userId);
    res.json({ items });
  } catch (e) {
    console.error('referrals listLinks error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function createLink(req, res) {
  try {
    const { name } = req.body || {};
    const link = await ReferralService.createLink(req.userId, { name });
    res.status(201).json(link);
  } catch (e) {
    console.error('referrals createLink error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateLink(req, res) {
  try {
    const { name, is_active } = req.body || {};
    const link = await ReferralService.updateLink(req.userId, req.params.id, { name, is_active });
    res.json(link);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

async function deleteLink(req, res) {
  try {
    const link = await ReferralService.deactivateLink(req.userId, req.params.id);
    res.json(link);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

async function referredUsers(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const result = await ReferralService.listReferredUsers(req.userId, { limit, offset });
    res.json(result);
  } catch (e) {
    console.error('referrals referredUsers error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function earnings(req, res) {
  try {
    const summary = await ReferralService.computeEarningsBalance(req.userId);
    res.json({ ...summary, commission_rate: ReferralService.COMMISSION_RATE });
  } catch (e) {
    console.error('referrals earnings error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function withdraw(req, res) {
  try {
    const { amount } = req.body || {};
    const row = await ReferralService.requestWithdrawal(req.userId, amount);
    await AuditService.safeLog({
      userId: req.userId,
      action: 'referral.withdraw.request',
      resourceType: 'agent_earning',
      resourceId: row.id,
      payload: { amount: Number(amount), status: row.status },
      ip: clientIp(req),
    });
    await NotificationService.create(req.userId, {
      title: 'Referral withdrawal requested',
      message: `A withdrawal of ₹${Number(amount).toLocaleString('en-IN')} from your referral earnings was submitted.`,
      type: 'info',
      metadata: { agent_earning_id: row.id },
    });
    res.status(201).json(row);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

async function listWithdrawals(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const result = await ReferralService.listWithdrawals(req.userId, { limit, offset });
    res.json(result);
  } catch (e) {
    console.error('referrals listWithdrawals error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function ledger(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const result = await ReferralService.listEarningsLedger(req.userId, { limit, offset });
    res.json(result);
  } catch (e) {
    console.error('referrals ledger error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  trackClick,
  listLinks,
  createLink,
  updateLink,
  deleteLink,
  referredUsers,
  earnings,
  withdraw,
  listWithdrawals,
  ledger,
};

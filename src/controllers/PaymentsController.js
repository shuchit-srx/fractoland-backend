'use strict';

const PaymentService = require('../services/PaymentService');
const AuditService = require('../services/AuditService');
const { clientIp } = require('../utils/requestIp');

async function listMe(req, res) {
  try {
    const { type, limit, offset } = req.query;
    const result = await PaymentService.listByUser(req.userId, {
      type,
      limit: limit != null ? Math.min(Number(limit), 100) : 20,
      offset: offset != null ? Number(offset) : 0,
    });
    res.json(result);
  } catch (e) {
    console.error('payments listMe error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function addFunds(req, res) {
  try {
    const { amount, currency, gateway } = req.body || {};
    const result = await PaymentService.addFundsInit(req.userId, { amount, currency, gateway });
    res.status(201).json(result);
  } catch (e) {
    console.error('payments addFunds error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Validation error', message: e.message });
  }
}

async function addFundsCallback(req, res) {
  try {
    const signature = req.headers['x-webhook-signature'];
    const result = await PaymentService.addFundsCallback(req.body || {}, signature);
    res.json(result);
  } catch (e) {
    console.error('payments callback error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Validation error', message: e.message });
  }
}

async function withdraw(req, res) {
  try {
    const { amount } = req.body || {};
    const result = await PaymentService.withdraw(req.userId, { amount });
    await AuditService.safeLog({
      userId: req.userId,
      action: 'payment.withdraw.completed',
      resourceType: 'payment',
      resourceId: result.id,
      payload: { amount: result.amount, status: result.status },
      ip: clientIp(req),
    });
    res.status(201).json(result);
  } catch (e) {
    console.error('payments withdraw error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Validation error', message: e.message });
  }
}

module.exports = { listMe, addFunds, addFundsCallback, withdraw };


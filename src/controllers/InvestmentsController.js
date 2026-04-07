'use strict';

const InvestmentService = require('../services/InvestmentService');

async function create(req, res) {
  try {
    const { venture_id, token_count, payment_method, referral_code } = req.body || {};
    const investment = await InvestmentService.create(req.userId, {
      venture_id,
      token_count,
      payment_method,
      referral_code,
    });
    res.status(201).json(investment);
  } catch (e) {
    console.error('investments create error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Validation error', message: e.message });
  }
}

async function listMe(req, res) {
  try {
    const { status, venture_id, limit, offset } = req.query;
    const result = await InvestmentService.listByUser(req.userId, { status, venture_id, limit, offset });
    res.json(result);
  } catch (e) {
    console.error('investments listMe error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getStats(req, res) {
  try {
    const stats = await InvestmentService.getStats(req.userId);
    res.json(stats);
  } catch (e) {
    console.error('investments getStats error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { create, listMe, getStats };

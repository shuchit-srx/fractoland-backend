'use strict';

const InvestmentService = require('../services/InvestmentService');

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

module.exports = { listMe, getStats };

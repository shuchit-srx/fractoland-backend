'use strict';

const WalletService = require('../services/WalletService');

async function getMe(req, res) {
  try {
    const balance = await WalletService.getBalance(req.userId);
    res.json(balance);
  } catch (e) {
    console.error('wallets getMe error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getMe };

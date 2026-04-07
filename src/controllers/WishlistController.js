'use strict';

const WishlistService = require('../services/WishlistService');

async function list(req, res) {
  try {
    const { limit, offset } = req.query;
    const result = await WishlistService.listByUser(req.userId, {
      limit: limit != null ? Number(limit) : undefined,
      offset: offset != null ? Number(offset) : undefined,
    });
    res.json(result);
  } catch (e) {
    console.error('wishlist list error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function create(req, res) {
  try {
    const { venture_id, selected_piece_ids, total_amount } = req.body || {};
    const row = await WishlistService.addOrUpdate(req.userId, {
      venture_id,
      selected_piece_ids,
      total_amount,
    });
    res.status(201).json(row);
  } catch (e) {
    console.error('wishlist create error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Validation error', message: e.message });
  }
}

async function removeItem(req, res) {
  try {
    const { id } = req.params;
    const result = await WishlistService.remove(req.userId, id);
    res.json(result);
  } catch (e) {
    console.error('wishlist delete error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Validation error', message: e.message });
  }
}

module.exports = { list, create, removeItem };

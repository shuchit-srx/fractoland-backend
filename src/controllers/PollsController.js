'use strict';

const PollService = require('../services/PollService');

async function list(req, res) {
  try {
    const { status, limit, offset } = req.query;
    const onlyActive = status !== 'closed';
    const result = await PollService.listActive({
      userId: req.userId,
      limit: limit != null ? Math.min(Number(limit), 50) : 20,
      offset: offset != null ? Number(offset) : 0,
    });
    if (onlyActive) {
      const filtered = { ...result, items: result.items.filter((p) => p.status === 'active') };
      return res.json(filtered);
    }
    res.json(result);
  } catch (e) {
    console.error('polls list error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { list };

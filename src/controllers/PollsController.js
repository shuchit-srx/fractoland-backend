'use strict';

const PollService = require('../services/PollService');
const AuditService = require('../services/AuditService');
const { clientIp } = require('../utils/requestIp');

function parseLimitOffset(query) {
  const limitRaw = query.limit != null ? Number(query.limit) : 20;
  const offsetRaw = query.offset != null ? Number(query.offset) : 0;
  const limit = Math.min(Number.isFinite(limitRaw) ? limitRaw : 20, 50);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  return { limit, offset };
}

async function list(req, res) {
  try {
    const { limit, offset } = parseLimitOffset(req.query);
    const statusParam = req.query.status || 'active';
    const st = ['active', 'closed', 'all'].includes(statusParam) ? statusParam : 'active';
    const result = await PollService.listForUser({
      userId: req.userId,
      status: st,
      limit,
      offset,
    });
    res.json(result);
  } catch (e) {
    console.error('polls list error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getOne(req, res) {
  try {
    const { id } = req.params;
    const poll = await PollService.getByIdForUser(id, req.userId);
    res.json(poll);
  } catch (e) {
    console.error('polls getOne error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

async function vote(req, res) {
  try {
    const { id } = req.params;
    const { vote: voteVal } = req.body || {};
    const result = await PollService.castVote(req.userId, id, voteVal);
    await AuditService.safeLog({
      userId: req.userId,
      action: 'poll.vote',
      resourceType: 'poll',
      resourceId: id,
      payload: { vote: result.vote, token_weight: result.token_weight },
      ip: clientIp(req),
    });
    res.status(201).json(result);
  } catch (e) {
    console.error('polls vote error', e);
    const status = e.status || 500;
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Request error', message: e.message });
  }
}

module.exports = { list, getOne, vote };

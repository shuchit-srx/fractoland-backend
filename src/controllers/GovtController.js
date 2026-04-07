'use strict';

const VentureService = require('../services/VentureService');
const { adminSupabase } = require('../config/database');

async function listVentures(req, res) {
  try {
    const { state, limit, offset } = req.query;
    const result = await VentureService.list(
      {
        mature_for_bid: 'true',
        state,
        limit: limit != null ? Math.min(Number(limit), 100) : 50,
        offset: offset != null ? Number(offset) : 0,
      },
      null,
      'admin'
    );
    res.json(result);
  } catch (e) {
    console.error('govt listVentures error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getVenture(req, res) {
  try {
    const venture = await VentureService.findById(req.params.id);
    if (!venture) return res.status(404).json({ error: 'Not found' });
    if (!['live', 'voting', 'sold', 'closed'].includes(venture.status)) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(venture);
  } catch (e) {
    console.error('govt getVenture error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function ownershipSnapshot(req, res) {
  try {
    const ventureId = req.params.id;
    const { data: venture } = await adminSupabase.from('ventures').select('id, name, ref, status').eq('id', ventureId).maybeSingle();
    if (!venture) return res.status(404).json({ error: 'Not found' });

    const { data: rows, error } = await adminSupabase
      .from('investments')
      .select('user_id, token_count, amount_paid')
      .eq('venture_id', ventureId)
      .eq('status', 'completed');
    if (error) throw error;

    const uids = [...new Set((rows || []).map((r) => r.user_id).filter(Boolean))];
    let userById = {};
    if (uids.length > 0) {
      const { data: users } = await adminSupabase.from('users').select('id, name, phone').in('id', uids);
      for (const u of users || []) userById[u.id] = u;
    }

    const holders = {};
    for (const r of rows || []) {
      const uid = r.user_id;
      if (!uid) continue;
      if (!holders[uid]) {
        const u = userById[uid] || {};
        holders[uid] = {
          user_id: uid,
          display_name: u.name || null,
          phone_masked: u.phone ? String(u.phone).replace(/\d(?=\d{4})/g, '•') : null,
          token_count: 0,
          amount_paid: 0,
        };
      }
      holders[uid].token_count += Number(r.token_count ?? 0);
      holders[uid].amount_paid += Number(r.amount_paid ?? 0);
    }

    res.json({
      venture: { id: venture.id, name: venture.name, ref: venture.ref, status: venture.status },
      holder_count: Object.keys(holders).length,
      holders: Object.values(holders),
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('govt ownershipSnapshot error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { listVentures, getVenture, ownershipSnapshot };

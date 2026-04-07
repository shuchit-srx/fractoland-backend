'use strict';

const { adminSupabase } = require('../config/database');

const STATUSES = ['pending', 'approved', 'rejected', 'outbid'];

async function listAdmin({ status, venture_id, limit = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);
  let q = adminSupabase
    .from('developer_bids')
    .select('id, developer_id, venture_id, bid_amount, currency, status, notes, created_at, updated_at, ventures(name, state, district)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);
  if (status) q = q.eq('status', status);
  if (venture_id) q = q.eq('venture_id', venture_id);
  const { data, error, count } = await q;
  if (error) throw error;
  const rows = data || [];
  const devIds = [...new Set(rows.map((r) => r.developer_id).filter(Boolean))];
  let userById = {};
  if (devIds.length > 0) {
    const { data: users } = await adminSupabase.from('users').select('id, name, phone').in('id', devIds);
    for (const u of users || []) userById[u.id] = u;
  }
  const items = rows.map((row) => {
    const v = row.ventures || {};
    const u = userById[row.developer_id] || {};
    const { ventures, ...rest } = row;
    return {
      ...rest,
      bid_amount: Number(rest.bid_amount ?? 0),
      venture_name: v.name || null,
      location: [v.district, v.state].filter(Boolean).join(', ') || null,
      developer_name: u.name || null,
      developer_phone: u.phone || null,
    };
  });
  return { items, total: count ?? 0 };
}

async function updateStatus(bidId, { status, notes }) {
  if (!STATUSES.includes(status)) {
    const err = new Error(`status must be one of: ${STATUSES.join(', ')}`);
    err.status = 400;
    throw err;
  }
  const updates = { status, updated_at: new Date().toISOString() };
  if (notes !== undefined) updates.notes = notes == null ? null : String(notes).slice(0, 2000);
  const { data, error } = await adminSupabase.from('developer_bids').update(updates).eq('id', bidId).select().maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error('Bid not found');
    err.status = 404;
    throw err;
  }
  return data;
}

module.exports = { listAdmin, updateStatus, STATUSES };

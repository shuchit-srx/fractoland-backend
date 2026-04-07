'use strict';

const { v4: uuidv4 } = require('uuid');
const { adminSupabase } = require('../config/database');

const STATUSES = ['pending', 'approved', 'rejected', 'outbid'];
const MATURE = ['live', 'voting', 'sold'];
const MIN_BID = 100000;

async function placeBid(developerId, { venture_id, bid_amount, notes }) {
  const amt = Number(bid_amount);
  if (!venture_id) {
    const err = new Error('venture_id is required');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(amt) || amt < MIN_BID) {
    const err = new Error(`Minimum bid amount is ₹${MIN_BID.toLocaleString('en-IN')}`);
    err.status = 400;
    throw err;
  }

  const { data: venture, error: vErr } = await adminSupabase.from('ventures').select('id, status, name').eq('id', venture_id).maybeSingle();
  if (vErr) throw vErr;
  if (!venture || !MATURE.includes(venture.status)) {
    const err = new Error('This land is not open for developer bidding');
    err.status = 400;
    throw err;
  }

  const { data: pendingRows } = await adminSupabase
    .from('developer_bids')
    .select('id')
    .eq('developer_id', developerId)
    .eq('venture_id', venture_id)
    .eq('status', 'pending')
    .limit(1);
  if (pendingRows && pendingRows.length > 0) {
    const err = new Error('You already have a pending bid on this land');
    err.status = 409;
    throw err;
  }

  const { data, error } = await adminSupabase
    .from('developer_bids')
    .insert({
      id: uuidv4(),
      developer_id: developerId,
      venture_id,
      bid_amount: amt,
      currency: 'INR',
      status: 'pending',
      notes: notes != null ? String(notes).slice(0, 2000) : null,
    })
    .select('id, developer_id, venture_id, bid_amount, currency, status, notes, created_at')
    .single();
  if (error) throw error;
  return { ...data, bid_amount: Number(data.bid_amount), venture_name: venture.name };
}

async function listForDeveloper(developerId, { status, limit = 30, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);
  let q = adminSupabase
    .from('developer_bids')
    .select('id, venture_id, bid_amount, currency, status, notes, created_at, updated_at, ventures(name, state, district, status)', { count: 'exact' })
    .eq('developer_id', developerId)
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);
  if (status) q = q.eq('status', status);
  const { data, error, count } = await q;
  if (error) throw error;
  const items = (data || []).map((row) => {
    const v = row.ventures || {};
    const { ventures, ...rest } = row;
    return {
      ...rest,
      bid_amount: Number(rest.bid_amount ?? 0),
      venture_name: v.name || null,
      venture_status: v.status || null,
      location: [v.district, v.state].filter(Boolean).join(', ') || null,
    };
  });
  return { items, total: count ?? 0 };
}

async function listProjectsForDeveloper(developerId, { limit = 30, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);
  const { data, error, count } = await adminSupabase
    .from('developer_bids')
    .select('id, venture_id, bid_amount, currency, status, notes, created_at, updated_at, ventures(name, state, district, full_address, area_acres, total_value, status)', { count: 'exact' })
    .eq('developer_id', developerId)
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })
    .range(off, off + lim - 1);
  if (error) throw error;
  const items = (data || []).map((row) => {
    const v = row.ventures || {};
    const { ventures, ...rest } = row;
    return {
      ...rest,
      bid_amount: Number(rest.bid_amount ?? 0),
      venture_name: v.name || null,
      location: [v.district, v.state].filter(Boolean).join(', ') || null,
      full_address: v.full_address || null,
      area_acres: v.area_acres != null ? Number(v.area_acres) : null,
      total_value: v.total_value != null ? Number(v.total_value) : null,
      venture_status: v.status || null,
    };
  });
  return { items, total: count ?? 0 };
}

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

module.exports = { listAdmin, updateStatus, STATUSES, placeBid, listForDeveloper, listProjectsForDeveloper, MIN_BID };

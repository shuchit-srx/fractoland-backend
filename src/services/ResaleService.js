'use strict';

const { adminSupabase } = require('../config/database');

const ACTIVE_STATUSES = ['pending', 'listed', 'matched'];

function toNum(v) {
  return Number(v ?? 0);
}

async function completedTokensByVenture(userId, ventureId) {
  const { data, error } = await adminSupabase
    .from('investments')
    .select('token_count')
    .eq('user_id', userId)
    .eq('venture_id', ventureId)
    .eq('status', 'completed');
  if (error) throw error;
  let sum = 0;
  for (const row of data || []) sum += Number(row.token_count ?? 0);
  return sum;
}

async function lockedTokensInResale(userId, ventureId) {
  const { data, error } = await adminSupabase
    .from('resale_requests')
    .select('token_count')
    .eq('user_id', userId)
    .eq('venture_id', ventureId)
    .in('status', ACTIVE_STATUSES);
  if (error) throw error;
  let sum = 0;
  for (const row of data || []) sum += Number(row.token_count ?? 0);
  return sum;
}

async function availableTokensForResale(userId, ventureId) {
  const owned = await completedTokensByVenture(userId, ventureId);
  const locked = await lockedTokensInResale(userId, ventureId);
  return Math.max(0, owned - locked);
}

async function getAvailability(userId, ventureId) {
  const completed_tokens = await completedTokensByVenture(userId, ventureId);
  const locked_tokens = await lockedTokensInResale(userId, ventureId);
  return {
    completed_tokens,
    locked_tokens,
    available_tokens: Math.max(0, completed_tokens - locked_tokens),
  };
}

async function create(userId, { venture_id, token_count, requested_amount }) {
  const tc = Number(token_count);
  if (!venture_id) {
    const err = new Error('venture_id is required');
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(tc) || tc <= 0) {
    const err = new Error('token_count must be a positive integer');
    err.status = 400;
    throw err;
  }

  let amount = null;
  if (requested_amount != null && requested_amount !== '') {
    amount = toNum(requested_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      const err = new Error('requested_amount must be a positive number when provided');
      err.status = 400;
      throw err;
    }
  }

  const { data: venture, error: vErr } = await adminSupabase.from('ventures').select('id').eq('id', venture_id).maybeSingle();
  if (vErr) throw vErr;
  if (!venture) {
    const err = new Error('Venture not found');
    err.status = 404;
    throw err;
  }

  const available = await availableTokensForResale(userId, venture_id);
  if (tc > available) {
    const err = new Error(`Only ${available} token(s) available to list for resale (after other open requests)`);
    err.status = 400;
    throw err;
  }

  const { data, error } = await adminSupabase
    .from('resale_requests')
    .insert({
      user_id: userId,
      venture_id,
      token_count: tc,
      requested_amount: amount,
      status: 'pending',
    })
    .select('id, venture_id, token_count, requested_amount, status, queue_position, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}

async function listByUser(userId, { status, limit = 20, offset = 0 } = {}) {
  let q = adminSupabase
    .from('resale_requests')
    .select(
      'id, venture_id, token_count, requested_amount, status, queue_position, created_at, updated_at, ventures(id, name, state, district)',
      { count: 'exact' }
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) q = q.eq('status', status);
  const { data, error, count } = await q;
  if (error) throw error;
  const items = (data || []).map((row) => {
    const v = row.ventures || {};
    const location = [v.district, v.state].filter(Boolean).join(', ') || '';
    const { ventures, ...rest } = row;
    return {
      ...rest,
      venture_name: v.name || null,
      location,
    };
  });
  return { items, total: count ?? 0 };
}

async function cancel(userId, requestId) {
  const { data: row, error: fErr } = await adminSupabase
    .from('resale_requests')
    .select('id, user_id, status')
    .eq('id', requestId)
    .maybeSingle();
  if (fErr) throw fErr;
  if (!row || row.user_id !== userId) {
    const err = new Error('Resale request not found');
    err.status = 404;
    throw err;
  }
  if (!['pending', 'listed'].includes(row.status)) {
    const err = new Error('Only pending or listed requests can be cancelled by the investor');
    err.status = 400;
    throw err;
  }
  const { data, error } = await adminSupabase
    .from('resale_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .select('id, venture_id, token_count, requested_amount, status, queue_position, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}

async function nextQueuePosition(ventureId) {
  const { data, error } = await adminSupabase
    .from('resale_requests')
    .select('queue_position')
    .eq('venture_id', ventureId)
    .in('status', ['listed', 'matched'])
    .order('queue_position', { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = data && data[0] && data[0].queue_position != null ? Number(data[0].queue_position) : 0;
  return max + 1;
}

const ADMIN_TRANSITIONS = {
  pending: ['listed', 'cancelled'],
  listed: ['matched', 'cancelled'],
  matched: ['completed', 'cancelled'],
};

async function listAdmin({ status, venture_id, limit = 50, offset = 0 } = {}) {
  let q = adminSupabase
    .from('resale_requests')
    .select(
      'id, user_id, venture_id, token_count, requested_amount, status, queue_position, created_at, updated_at, ventures(id, name, state, district), users(id, name, phone)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) q = q.eq('status', status);
  if (venture_id) q = q.eq('venture_id', venture_id);
  const { data, error, count } = await q;
  if (error) throw error;
  const items = (data || []).map((row) => {
    const v = row.ventures || {};
    const u = row.users || {};
    const location = [v.district, v.state].filter(Boolean).join(', ') || '';
    const { ventures, users, ...rest } = row;
    return {
      ...rest,
      venture_name: v.name || null,
      location,
      user_name: u.name || null,
      user_phone: u.phone || null,
    };
  });
  return { items, total: count ?? 0 };
}

async function adminUpdate(requestId, { status: newStatus, queue_position } = {}) {
  if (!newStatus) {
    const err = new Error('status is required');
    err.status = 400;
    throw err;
  }

  const { data: row, error: fErr } = await adminSupabase
    .from('resale_requests')
    .select('id, status, venture_id')
    .eq('id', requestId)
    .maybeSingle();
  if (fErr) throw fErr;
  if (!row) {
    const err = new Error('Resale request not found');
    err.status = 404;
    throw err;
  }

  const from = row.status;
  if (['completed', 'cancelled'].includes(from)) {
    const err = new Error('Request is already terminal');
    err.status = 400;
    throw err;
  }

  const allowed = ADMIN_TRANSITIONS[from] || [];
  if (!allowed.includes(newStatus)) {
    const err = new Error(`Cannot transition from ${from} to ${newStatus}`);
    err.status = 400;
    throw err;
  }

  const payload = { status: newStatus };
  if (newStatus === 'listed' && queue_position == null) {
    payload.queue_position = await nextQueuePosition(row.venture_id);
  } else if (queue_position != null) {
    const qp = Number(queue_position);
    if (!Number.isInteger(qp) || qp < 1) {
      const err = new Error('queue_position must be a positive integer');
      err.status = 400;
      throw err;
    }
    payload.queue_position = qp;
  }

  const { error: upErr } = await adminSupabase.from('resale_requests').update(payload).eq('id', requestId);
  if (upErr) throw upErr;

  const { data, error } = await adminSupabase
    .from('resale_requests')
    .select(
      'id, user_id, venture_id, token_count, requested_amount, status, queue_position, created_at, updated_at, ventures(id, name, state, district), users(id, name, phone)'
    )
    .eq('id', requestId)
    .single();
  if (error) throw error;

  const v = data.ventures || {};
  const u = data.users || {};
  const location = [v.district, v.state].filter(Boolean).join(', ') || '';
  const { ventures, users, ...rest } = data;
  return {
    ...rest,
    venture_name: v.name || null,
    location,
    user_name: u.name || null,
    user_phone: u.phone || null,
  };
}

module.exports = {
  create,
  listByUser,
  cancel,
  listAdmin,
  adminUpdate,
  availableTokensForResale,
  completedTokensByVenture,
  getAvailability,
};

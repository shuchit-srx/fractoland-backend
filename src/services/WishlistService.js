'use strict';

const { adminSupabase } = require('../config/database');

function normalizePieceIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
}

async function listByUser(userId, { limit = 50, offset = 0 } = {}) {
  const { data, error, count } = await adminSupabase
    .from('wishlist')
    .select(
      'id, venture_id, selected_piece_ids, total_amount, status, created_at, updated_at, ventures(id, name, state, district, area_acres, expected_roi_percent)',
      { count: 'exact' }
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const ventureIds = [...new Set((data || []).map((w) => w.venture_id).filter(Boolean))];
  let imageByVenture = {};
  let tokenPriceByVenture = {};
  if (ventureIds.length > 0) {
    const { data: imgRows } = await adminSupabase
      .from('venture_images')
      .select('venture_id, file_url')
      .in('venture_id', ventureIds)
      .order('sort_order');
    const firstByVenture = {};
    for (const row of imgRows || []) {
      if (!firstByVenture[row.venture_id]) firstByVenture[row.venture_id] = row.file_url;
    }
    imageByVenture = firstByVenture;

    const { data: vtRows } = await adminSupabase
      .from('venture_tokens')
      .select('venture_id, token_price')
      .in('venture_id', ventureIds);
    for (const row of vtRows || []) {
      if (row.venture_id && tokenPriceByVenture[row.venture_id] == null) {
        tokenPriceByVenture[row.venture_id] =
          row.token_price != null ? Number(row.token_price) : null;
      }
    }
  }

  const items = (data || []).map((row) => {
    const v = row.ventures || {};
    const tokenPrice = tokenPriceByVenture[row.venture_id] ?? null;
    const location = [v.district, v.state].filter(Boolean).join(', ') || '';
    const pieces = normalizePieceIds(row.selected_piece_ids);
    return {
      id: row.id,
      venture_id: row.venture_id,
      selected_piece_ids: pieces,
      total_amount: Number(row.total_amount ?? 0),
      status: row.status || 'pending',
      created_at: row.created_at,
      updated_at: row.updated_at,
      venture: {
        name: v.name || null,
        location,
        area_acres: v.area_acres != null ? Number(v.area_acres) : null,
        expected_roi_percent: v.expected_roi_percent != null ? Number(v.expected_roi_percent) : null,
        token_price: tokenPrice,
      },
      image_url: imageByVenture[row.venture_id] || null,
    };
  });

  return { items, total: count ?? 0 };
}

async function addOrUpdate(userId, { venture_id, selected_piece_ids, total_amount }) {
  const pieceIds = normalizePieceIds(selected_piece_ids);
  if (!venture_id) {
    const err = new Error('venture_id is required');
    err.status = 400;
    throw err;
  }
  if (pieceIds.length === 0) {
    const err = new Error('selected_piece_ids must be a non-empty array of piece ids');
    err.status = 400;
    throw err;
  }

  const { data: venture, error: vErr } = await adminSupabase
    .from('ventures')
    .select('id, status')
    .eq('id', venture_id)
    .maybeSingle();
  if (vErr) throw vErr;
  if (!venture) {
    const err = new Error('Venture not found');
    err.status = 404;
    throw err;
  }
  if (venture.status !== 'live') {
    const err = new Error('Venture is not available for expressions of interest');
    err.status = 400;
    throw err;
  }

  const { data: vt, error: vtErr } = await adminSupabase
    .from('venture_tokens')
    .select('token_price')
    .eq('venture_id', venture_id)
    .maybeSingle();
  if (vtErr) throw vtErr;
  if (!vt || vt.token_price == null) {
    const err = new Error('Venture token configuration not found');
    err.status = 400;
    throw err;
  }

  const tokenPrice = Number(vt.token_price);
  const computedTotal = tokenPrice * pieceIds.length;
  const clientTotal = total_amount != null ? Number(total_amount) : computedTotal;
  if (!Number.isFinite(clientTotal) || clientTotal < 0) {
    const err = new Error('total_amount is invalid');
    err.status = 400;
    throw err;
  }
  if (Math.abs(clientTotal - computedTotal) > 0.01) {
    const err = new Error('total_amount does not match token price and selection');
    err.status = 400;
    throw err;
  }

  const { data: existing, error: exErr } = await adminSupabase
    .from('wishlist')
    .select('id')
    .eq('user_id', userId)
    .eq('venture_id', venture_id)
    .maybeSingle();
  if (exErr) throw exErr;

  const payload = {
    selected_piece_ids: pieceIds,
    total_amount: computedTotal,
    status: 'pending',
  };

  if (existing?.id) {
    const { data: updated, error: upErr } = await adminSupabase
      .from('wishlist')
      .update(payload)
      .eq('id', existing.id)
      .eq('user_id', userId)
      .select('id, venture_id, selected_piece_ids, total_amount, status, created_at, updated_at')
      .single();
    if (upErr) throw upErr;
    return updated;
  }

  const { data: created, error: insErr } = await adminSupabase
    .from('wishlist')
    .insert({
      user_id: userId,
      venture_id,
      selected_piece_ids: pieceIds,
      total_amount: computedTotal,
      status: 'pending',
    })
    .select('id, venture_id, selected_piece_ids, total_amount, status, created_at, updated_at')
    .single();
  if (insErr) throw insErr;
  return created;
}

async function remove(userId, wishlistId) {
  if (!wishlistId) {
    const err = new Error('id is required');
    err.status = 400;
    throw err;
  }
  const { data, error } = await adminSupabase
    .from('wishlist')
    .delete()
    .eq('id', wishlistId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error('Wishlist item not found');
    err.status = 404;
    throw err;
  }
  return { success: true };
}

module.exports = { listByUser, addOrUpdate, remove };

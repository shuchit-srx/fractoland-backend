'use strict';

const { adminSupabase } = require('../config/database');

async function listByUser(userId, { status, venture_id, limit = 20, offset = 0 } = {}) {
  let q = adminSupabase
    .from('investments')
    .select('id, venture_id, token_count, amount_paid, status, created_at, ventures(id, name, state, district)', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) q = q.eq('status', status);
  if (venture_id) q = q.eq('venture_id', venture_id);

  const { data, error, count } = await q;
  if (error) throw error;

  const ventureIds = [...new Set((data || []).map((inv) => inv.venture_id).filter(Boolean))];
  let imageByVenture = {};
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
  }

  const items = (data || []).map((inv) => {
    const v = inv.ventures || {};
    const location = [v.district, v.state].filter(Boolean).join(', ') || '';
    return {
      id: inv.id,
      venture_id: inv.venture_id,
      venture_name: v.name,
      location,
      token_count: inv.token_count,
      amount_paid: Number(inv.amount_paid),
      status: inv.status,
      created_at: inv.created_at,
      image_url: imageByVenture[inv.venture_id] || null,
    };
  });

  return { items, total: count ?? 0 };
}

async function getStats(userId) {
  const { data, error } = await adminSupabase
    .from('investments')
    .select('amount_paid, token_count, status')
    .eq('user_id', userId)
    .eq('status', 'completed');

  if (error) throw error;

  let totalInvested = 0;
  let tokensOwned = 0;
  const count = (data || []).length;

  for (const row of data || []) {
    totalInvested += Number(row.amount_paid ?? 0);
    tokensOwned += Number(row.token_count ?? 0);
  }

  return {
    total_invested: totalInvested,
    current_value: totalInvested,
    active_investments: count,
    tokens_owned: tokensOwned,
  };
}

module.exports = { listByUser, getStats };

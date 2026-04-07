'use strict';

const { adminSupabase } = require('../config/database');

/**
 * Completed investments on ventures owned by userId (proceeds view for owner dashboard).
 */
async function listInvestmentProceeds(ownerId, { limit = 50, offset = 0 } = {}) {
  const { data: ventures, error: vErr } = await adminSupabase.from('ventures').select('id, name').eq('owner_id', ownerId);
  if (vErr) throw vErr;
  const ventureIds = (ventures || []).map((v) => v.id);
  if (ventureIds.length === 0) {
    return {
      items: [],
      total: 0,
      summary: { total_received: 0, transaction_count: 0, venture_count: 0 },
    };
  }

  const nameByVenture = {};
  for (const v of ventures || []) nameByVenture[v.id] = v.name;

  let q = adminSupabase
    .from('investments')
    .select('id, venture_id, user_id, token_count, amount_paid, status, created_at', { count: 'exact' })
    .in('venture_id', ventureIds)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;

  const { data: allCompleted } = await adminSupabase
    .from('investments')
    .select('amount_paid')
    .in('venture_id', ventureIds)
    .eq('status', 'completed');

  let totalReceived = 0;
  for (const inv of allCompleted || []) totalReceived += Number(inv.amount_paid ?? 0);

  const items = (data || []).map((inv) => ({
    id: inv.id,
    venture_id: inv.venture_id,
    venture_name: nameByVenture[inv.venture_id] || null,
    token_count: inv.token_count,
    amount: Number(inv.amount_paid ?? 0),
    created_at: inv.created_at,
    type: 'token_sale',
  }));

  return {
    items,
    total: count ?? 0,
    summary: {
      total_received: totalReceived,
      transaction_count: (allCompleted || []).length,
      venture_count: ventureIds.length,
    },
  };
}

module.exports = { listInvestmentProceeds };

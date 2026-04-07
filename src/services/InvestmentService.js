'use strict';

const { adminSupabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const WalletService = require('./WalletService');

async function create(userId, { venture_id, token_count, payment_method }) {
  const tokenCount = Number(token_count);
  const method = String(payment_method || '').toLowerCase();

  if (!venture_id) {
    const err = new Error('venture_id is required');
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(tokenCount) || tokenCount <= 0) {
    const err = new Error('token_count must be a positive integer');
    err.status = 400;
    throw err;
  }
  if (!['wallet', 'gateway'].includes(method)) {
    const err = new Error('payment_method must be wallet or gateway');
    err.status = 400;
    throw err;
  }

  const { data: venture, error: ventureErr } = await adminSupabase
    .from('ventures')
    .select('id, status, name')
    .eq('id', venture_id)
    .maybeSingle();
  if (ventureErr) throw ventureErr;
  if (!venture) {
    const err = new Error('Venture not found');
    err.status = 404;
    throw err;
  }
  if (venture.status !== 'live') {
    const err = new Error('Venture is not investable');
    err.status = 400;
    throw err;
  }

  const { data: vt, error: vtErr } = await adminSupabase
    .from('venture_tokens')
    .select('id, token_price, total_tokens, available_tokens')
    .eq('venture_id', venture_id)
    .maybeSingle();
  if (vtErr) throw vtErr;
  if (!vt || vt.token_price == null) {
    const err = new Error('Venture token configuration not found');
    err.status = 400;
    throw err;
  }

  const available = Number(vt.available_tokens ?? 0);
  const tokenPrice = Number(vt.token_price ?? 0);
  const amountPaid = tokenPrice * tokenCount;
  if (available < tokenCount) {
    const err = new Error('Insufficient available tokens');
    err.status = 409;
    throw err;
  }

  // Payment row is always created first for traceability.
  const paymentStatus = method === 'wallet' ? 'completed' : 'pending';
  const gatewayOrderId = method === 'gateway' ? `order_${Date.now()}_${uuidv4().slice(0, 8)}` : null;
  const { data: payment, error: paymentErr } = await adminSupabase
    .from('payments')
    .insert({
      user_id: userId,
      type: 'investment',
      amount: amountPaid,
      currency: 'INR',
      status: paymentStatus,
      gateway: method === 'gateway' ? 'gateway' : 'wallet',
      gateway_order_id: gatewayOrderId,
      metadata: { venture_id, token_count: tokenCount, payment_method: method },
    })
    .select('id, status, gateway_order_id')
    .single();
  if (paymentErr) throw paymentErr;

  if (method === 'gateway') {
    // For gateway we keep investment pending; token allocation is done after payment callback.
    const { data: pendingInv, error: invErr } = await adminSupabase
      .from('investments')
      .insert({
        user_id: userId,
        venture_id,
        token_count: tokenCount,
        amount_paid: amountPaid,
        payment_id: payment.id,
        status: 'pending',
      })
      .select('id, venture_id, token_count, amount_paid, status, payment_id, tx_hash')
      .single();
    if (invErr) throw invErr;
    return {
      ...pendingInv,
      payment_gateway_order_id: payment.gateway_order_id || null,
    };
  }

  // Wallet flow: verify and debit via central wallet service.
  let debited;
  try {
    debited = await WalletService.debit(userId, amountPaid);
  } catch (e) {
    await adminSupabase.from('payments').update({ status: 'failed' }).eq('id', payment.id);
    throw e;
  }

  // Optimistic token decrement to reduce oversell risk.
  const updatedAvailable = available - tokenCount;
  const { data: tokenUpdated, error: tokenUpdErr } = await adminSupabase
    .from('venture_tokens')
    .update({ available_tokens: updatedAvailable })
    .eq('id', vt.id)
    .eq('available_tokens', vt.available_tokens)
    .select('id')
    .maybeSingle();

  if (tokenUpdErr || !tokenUpdated) {
    // Compensate wallet/payment on conflict.
    await WalletService.credit(userId, amountPaid);
    await adminSupabase.from('payments').update({ status: 'failed' }).eq('id', payment.id);
    const err = new Error('Token availability changed, please retry');
    err.status = 409;
    throw err;
  }

  const { data: completedInv, error: compInvErr } = await adminSupabase
    .from('investments')
    .insert({
      user_id: userId,
      venture_id,
      token_count: tokenCount,
      amount_paid: amountPaid,
      payment_id: payment.id,
      status: 'completed',
    })
    .select('id, venture_id, token_count, amount_paid, status, payment_id, tx_hash')
    .single();
  if (compInvErr) throw compInvErr;

  return {
    ...completedInv,
    wallet_balance_before: debited.old_balance,
    wallet_balance_after: debited.new_balance,
  };
}

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

module.exports = { create, listByUser, getStats };

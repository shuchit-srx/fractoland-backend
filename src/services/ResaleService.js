'use strict';

const { v4: uuidv4 } = require('uuid');
const { adminSupabase } = require('../config/database');
const WalletService = require('./WalletService');

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

function feeRate() {
  return Number(process.env.RESALE_PLATFORM_FEE_RATE || 0.02);
}

function resolveSaleAmount(resale, bodyAmount) {
  const asked = resale.requested_amount != null ? toNum(resale.requested_amount) : null;
  if (asked != null && asked > 0) return asked;
  const a = toNum(bodyAmount);
  if (!Number.isFinite(a) || a < 1000) {
    const err = new Error('Offer amount must be at least 1000 INR when listing has no fixed price');
    err.status = 400;
    throw err;
  }
  return a;
}

async function reduceSellerInvestments(sellerId, ventureId, tokensToRemove) {
  let need = Number(tokensToRemove);
  if (need <= 0) return;

  const { data: rows, error } = await adminSupabase
    .from('investments')
    .select('id, token_count, amount_paid')
    .eq('user_id', sellerId)
    .eq('venture_id', ventureId)
    .eq('status', 'completed')
    .order('created_at', { ascending: true });
  if (error) throw error;

  for (const row of rows || []) {
    if (need <= 0) break;
    const tc = Number(row.token_count ?? 0);
    const ap = toNum(row.amount_paid);
    if (tc <= 0) continue;

    if (tc <= need) {
      const { error: delE } = await adminSupabase.from('investments').delete().eq('id', row.id);
      if (delE) throw delE;
      need -= tc;
    } else {
      const newTc = tc - need;
      const newAp = Math.round((ap * newTc) / tc * 100) / 100;
      const { error: upE } = await adminSupabase
        .from('investments')
        .update({ token_count: newTc, amount_paid: newAp })
        .eq('id', row.id);
      if (upE) throw upE;
      need = 0;
    }
  }

  if (need > 0) {
    const err = new Error('Could not reconcile seller token lots');
    err.status = 500;
    throw err;
  }
}

async function settleResaleTransfer({
  resaleId,
  buyerId,
  sellerId,
  ventureId,
  tokenCount,
  saleAmount,
  purchasePaymentId,
}) {
  const rate = feeRate();
  const feeAmt = Math.round(saleAmount * rate * 100) / 100;
  const sellerNet = Math.round((saleAmount - feeAmt) * 100) / 100;

  await reduceSellerInvestments(sellerId, ventureId, tokenCount);

  const { error: invE } = await adminSupabase.from('investments').insert({
    user_id: buyerId,
    venture_id: ventureId,
    token_count: tokenCount,
    amount_paid: saleAmount,
    payment_id: purchasePaymentId,
    status: 'completed',
  });
  if (invE) throw invE;

  const { data: payoutPay, error: poE } = await adminSupabase
    .from('payments')
    .insert({
      user_id: sellerId,
      type: 'resale_payout',
      amount: sellerNet,
      currency: 'INR',
      status: 'completed',
      gateway: 'internal',
      metadata: {
        resale_request_id: resaleId,
        purchase_payment_id: purchasePaymentId,
        buyer_user_id: buyerId,
        gross_sale: saleAmount,
        platform_fee: feeAmt,
        fee_rate: rate,
      },
    })
    .select('id')
    .single();
  if (poE) throw poE;

  const { data: upd, error: upE } = await adminSupabase
    .from('resale_requests')
    .update({
      status: 'completed',
      sale_amount: saleAmount,
      seller_payout_amount: sellerNet,
      purchase_payment_id: purchasePaymentId,
      seller_payout_payment_id: payoutPay.id,
      completed_at: new Date().toISOString(),
    })
    .eq('id', resaleId)
    .eq('status', 'matched')
    .select('id');
  if (upE) throw poE;
  if (!upd || upd.length === 0) {
    const err = new Error('Resale state changed during settlement');
    err.status = 409;
    throw err;
  }

  await WalletService.credit(sellerId, sellerNet);
}

async function listMarketplace({ venture_id, limit = 20, offset = 0 } = {}) {
  let q = adminSupabase
    .from('resale_requests')
    .select(
      'id, venture_id, token_count, requested_amount, queue_position, created_at, ventures(id, name, state, district, venture_images(file_url, sort_order), venture_tokens(token_price, total_tokens, available_tokens))',
      { count: 'exact' }
    )
    .eq('status', 'listed')
    .order('queue_position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);
  if (venture_id) q = q.eq('venture_id', venture_id);
  const { data, error, count } = await q;
  if (error) throw error;

  const items = (data || []).map((row) => {
    const v = row.ventures || {};
    const imgs = v.venture_images || [];
    const arr = Array.isArray(imgs) ? imgs : [];
    const sorted = [...arr].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const image_url = sorted[0]?.file_url || null;
    const rawTok = v.venture_tokens;
    const tok = Array.isArray(rawTok) ? rawTok[0] : rawTok || {};
    const location = [v.district, v.state].filter(Boolean).join(', ') || '';
    return {
      id: row.id,
      venture_id: row.venture_id,
      token_count: row.token_count,
      requested_amount: row.requested_amount != null ? toNum(row.requested_amount) : null,
      queue_position: row.queue_position,
      created_at: row.created_at,
      venture_name: v.name || null,
      location,
      image_url,
      reference_token_price: tok.token_price != null ? toNum(tok.token_price) : null,
    };
  });
  return { items, total: count ?? 0 };
}

async function purchase(buyerId, resaleId, { payment_method, amount: bodyAmount }) {
  const method = String(payment_method || '').toLowerCase();
  if (!['wallet', 'gateway'].includes(method)) {
    const err = new Error('payment_method must be wallet or gateway');
    err.status = 400;
    throw err;
  }

  const { data: resale, error: fErr } = await adminSupabase
    .from('resale_requests')
    .select('id, user_id, venture_id, token_count, requested_amount, status')
    .eq('id', resaleId)
    .maybeSingle();
  if (fErr) throw fErr;
  if (!resale || resale.status !== 'listed') {
    const err = new Error('Listing is not available for purchase');
    err.status = 404;
    throw err;
  }
  if (resale.user_id === buyerId) {
    const err = new Error('You cannot buy your own listing');
    err.status = 400;
    throw err;
  }

  let saleAmount;
  try {
    saleAmount = resolveSaleAmount(resale, bodyAmount);
  } catch (e) {
    throw e;
  }

  const { data: reserved, error: rErr } = await adminSupabase
    .from('resale_requests')
    .update({ status: 'matched', buyer_id: buyerId })
    .eq('id', resaleId)
    .eq('status', 'listed')
    .select('id')
    .maybeSingle();
  if (rErr) throw rErr;
  if (!reserved) {
    const err = new Error('Listing was just sold or removed');
    err.status = 409;
    throw err;
  }

  if (method === 'wallet') {
    let debited = false;
    try {
      await WalletService.debit(buyerId, saleAmount);
      debited = true;

      const { data: pay, error: pe } = await adminSupabase
        .from('payments')
        .insert({
          user_id: buyerId,
          type: 'resale_purchase',
          amount: saleAmount,
          currency: 'INR',
          status: 'completed',
          gateway: 'wallet',
          metadata: {
            resale_request_id: resaleId,
            seller_user_id: resale.user_id,
            venture_id: resale.venture_id,
            token_count: resale.token_count,
          },
        })
        .select('id')
        .single();
      if (pe) throw pe;

      await settleResaleTransfer({
        resaleId,
        buyerId,
        sellerId: resale.user_id,
        ventureId: resale.venture_id,
        tokenCount: resale.token_count,
        saleAmount,
        purchasePaymentId: pay.id,
      });

      return {
        status: 'completed',
        payment_id: pay.id,
        sale_amount: saleAmount,
        resale_id: resaleId,
      };
    } catch (e) {
      if (debited) {
        await WalletService.credit(buyerId, saleAmount).catch(() => {});
      }
      await adminSupabase.from('resale_requests').update({ status: 'listed', buyer_id: null }).eq('id', resaleId);
      throw e;
    }
  }

  const gatewayOrderId = `resale_${Date.now()}_${uuidv4().slice(0, 8)}`;
  const { data: pay, error: pe } = await adminSupabase
    .from('payments')
    .insert({
      user_id: buyerId,
      type: 'resale_purchase',
      amount: saleAmount,
      currency: 'INR',
      status: 'pending',
      gateway: 'gateway',
      gateway_order_id: gatewayOrderId,
      metadata: {
        resale_request_id: resaleId,
        seller_user_id: resale.user_id,
        venture_id: resale.venture_id,
        token_count: resale.token_count,
      },
    })
    .select('id, gateway_order_id')
    .single();
  if (pe) {
    await adminSupabase.from('resale_requests').update({ status: 'listed', buyer_id: null }).eq('id', resaleId);
    throw pe;
  }

  return {
    status: 'pending',
    payment_id: pay.id,
    sale_amount: saleAmount,
    resale_id: resaleId,
    payment_gateway_order_id: pay.gateway_order_id,
  };
}

async function processResalePurchaseCompletion(payment, status) {
  if (payment.type !== 'resale_purchase') return;

  const meta = payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
  const resaleId = meta.resale_request_id;
  const sellerId = meta.seller_user_id;

  if (status === 'failed' || status === 'refunded') {
    if (resaleId) {
      await adminSupabase
        .from('resale_requests')
        .update({ status: 'listed', buyer_id: null })
        .eq('id', resaleId)
        .eq('status', 'matched');
    }
    return;
  }

  if (status !== 'completed') return;
  if (!resaleId || !sellerId) return;

  const { data: resale } = await adminSupabase
    .from('resale_requests')
    .select('id, user_id, venture_id, token_count, status, buyer_id, purchase_payment_id')
    .eq('id', resaleId)
    .maybeSingle();
  if (!resale) return;

  if (resale.status === 'completed') {
    return;
  }
  if (resale.user_id !== sellerId) {
    return;
  }
  if (resale.status !== 'matched' || resale.buyer_id !== payment.user_id) {
    return;
  }

  const saleAmount = toNum(payment.amount);
  await settleResaleTransfer({
    resaleId,
    buyerId: payment.user_id,
    sellerId,
    ventureId: resale.venture_id,
    tokenCount: resale.token_count,
    saleAmount,
    purchasePaymentId: payment.id,
  });
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
  listMarketplace,
  purchase,
  processResalePurchaseCompletion,
};

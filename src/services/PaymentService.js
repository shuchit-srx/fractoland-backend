'use strict';

const crypto = require('crypto');
const { adminSupabase } = require('../config/database');
const WalletService = require('./WalletService');
const ReferralService = require('./ReferralService');

function toNum(v) {
  return Number(v ?? 0);
}

function buildSignatureBase(gateway_order_id, gateway_payment_id, status) {
  return `${gateway_order_id}|${gateway_payment_id}|${status}`;
}

function verifyWebhookSignature(gateway_order_id, gateway_payment_id, status, providedSignature) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return true; // local/dev convenience
  if (!providedSignature) return false;
  const payload = buildSignatureBase(gateway_order_id, gateway_payment_id, status);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(providedSignature)));
}

async function listByUser(userId, { type, limit = 20, offset = 0 } = {}) {
  let q = adminSupabase
    .from('payments')
    .select('id, type, amount, currency, status, gateway, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (type) q = q.eq('type', type);
  const { data, error, count } = await q;
  if (error) throw error;
  return {
    items: (data || []).map((p) => ({
      id: p.id,
      type: p.type,
      amount: toNum(p.amount),
      currency: p.currency || 'INR',
      status: p.status,
      description: `${p.type} via ${p.gateway || 'system'}`,
      created_at: p.created_at,
    })),
    total: count ?? 0,
  };
}

async function addFundsInit(userId, { amount, currency = 'INR', gateway = 'gateway' }) {
  const amt = toNum(amount);
  if (!Number.isFinite(amt) || amt < 1000) {
    const err = new Error('Minimum add-funds amount is 1000');
    err.status = 400;
    throw err;
  }
  const gatewayOrderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await adminSupabase
    .from('payments')
    .insert({
      user_id: userId,
      type: 'add_funds',
      amount: amt,
      currency,
      status: 'pending',
      gateway,
      gateway_order_id: gatewayOrderId,
      metadata: { flow: 'add_funds' },
    })
    .select('id, amount, gateway_order_id')
    .single();
  if (error) throw error;
  return { order_id: data.id, amount: toNum(data.amount), gateway_order_id: data.gateway_order_id, redirect_url: null };
}

async function processInvestmentCompletionForPayment(payment, status) {
  if (payment.type !== 'investment') return;
  const { data: inv, error: invErr } = await adminSupabase
    .from('investments')
    .select('id, user_id, venture_id, token_count, status, referral_link_id, amount_paid')
    .eq('payment_id', payment.id)
    .maybeSingle();
  if (invErr || !inv) return;

  if (status === 'completed' && inv.status === 'pending') {
    const { data: vt, error: vtErr } = await adminSupabase
      .from('venture_tokens')
      .select('id, available_tokens')
      .eq('venture_id', inv.venture_id)
      .maybeSingle();
    if (vtErr || !vt) return;
    const available = toNum(vt.available_tokens);
    const needed = toNum(inv.token_count);
    if (available < needed) {
      await adminSupabase.from('investments').update({ status: 'failed' }).eq('id', inv.id);
      await adminSupabase.from('payments').update({ status: 'failed' }).eq('id', payment.id);
      return;
    }
    const { data: updated } = await adminSupabase
      .from('venture_tokens')
      .update({ available_tokens: available - needed })
      .eq('id', vt.id)
      .eq('available_tokens', vt.available_tokens)
      .select('id')
      .maybeSingle();
    if (!updated) return;
    await adminSupabase.from('investments').update({ status: 'completed' }).eq('id', inv.id);
    if (inv.referral_link_id) {
      await ReferralService.onInvestmentCompleted({
        id: inv.id,
        user_id: inv.user_id,
        referral_link_id: inv.referral_link_id,
        amount_paid: Number(inv.amount_paid ?? 0),
      });
    }
    return;
  }

  if (status === 'failed' || status === 'refunded') {
    await adminSupabase.from('investments').update({ status: 'failed' }).eq('id', inv.id).eq('status', 'pending');
  }
}

async function addFundsCallback(payload, signature) {
  const gateway_order_id = payload.gateway_order_id;
  const gateway_payment_id = payload.gateway_payment_id || null;
  const status = String(payload.status || '').toLowerCase();
  if (!gateway_order_id || !['pending', 'completed', 'failed', 'refunded'].includes(status)) {
    const err = new Error('Invalid callback payload');
    err.status = 400;
    throw err;
  }
  if (!verifyWebhookSignature(gateway_order_id, gateway_payment_id, status, signature)) {
    const err = new Error('Invalid webhook signature');
    err.status = 401;
    throw err;
  }

  const { data: payment, error: pErr } = await adminSupabase
    .from('payments')
    .select('id, user_id, type, amount, status, gateway_order_id')
    .eq('gateway_order_id', gateway_order_id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!payment) {
    const err = new Error('Payment not found');
    err.status = 404;
    throw err;
  }

  if (payment.status === 'completed' && status === 'completed') {
    return { success: true, already_processed: true, payment_id: payment.id, status };
  }

  await adminSupabase
    .from('payments')
    .update({
      status,
      gateway_payment_id,
      metadata: { callback_status: status, callback_received_at: new Date().toISOString() },
    })
    .eq('id', payment.id);

  if (payment.type === 'add_funds' && status === 'completed') {
    await WalletService.credit(payment.user_id, payment.amount);
  }

  await processInvestmentCompletionForPayment(payment, status);
  return { success: true, payment_id: payment.id, status };
}

async function withdraw(userId, { amount }) {
  const amt = toNum(amount);
  if (!Number.isFinite(amt) || amt < 1000) {
    const err = new Error('Minimum withdrawal amount is 1000');
    err.status = 400;
    throw err;
  }
  const { data: payment, error: pErr } = await adminSupabase
    .from('payments')
    .insert({
      user_id: userId,
      type: 'withdrawal',
      amount: amt,
      currency: 'INR',
      status: 'pending',
      gateway: 'bank_transfer',
      metadata: { flow: 'withdraw' },
    })
    .select('id')
    .single();
  if (pErr) throw pErr;

  let debited;
  try {
    debited = await WalletService.debit(userId, amt);
  } catch (e) {
    await adminSupabase.from('payments').update({ status: 'failed' }).eq('id', payment.id);
    throw e;
  }

  await adminSupabase
    .from('payments')
    .update({
      status: 'completed',
      metadata: {
        flow: 'withdraw',
        processed_at: new Date().toISOString(),
        old_balance: debited.old_balance,
        new_balance: debited.new_balance,
      },
    })
    .eq('id', payment.id);

  return { id: payment.id, status: 'completed', amount: amt };
}

module.exports = { listByUser, addFundsInit, addFundsCallback, withdraw };


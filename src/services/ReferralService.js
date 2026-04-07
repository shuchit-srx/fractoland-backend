'use strict';

const crypto = require('crypto');
const { adminSupabase } = require('../config/database');

const COMMISSION_RATE = Number(process.env.AGENT_COMMISSION_RATE || 0.02);

function baseUrl() {
  return (process.env.REFERRAL_PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function randomCodeSegment() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function generateUniqueCode() {
  for (let i = 0; i < 8; i++) {
    const code = `FL-${randomCodeSegment()}`;
    const { data } = await adminSupabase.from('referral_links').select('id').eq('code', code).maybeSingle();
    if (!data) return code;
  }
  return `FL-${randomCodeSegment()}${randomCodeSegment().slice(0, 4)}`;
}

async function findByCode(code) {
  const c = String(code || '').trim();
  if (!c) return null;
  const { data, error } = await adminSupabase
    .from('referral_links')
    .select('id, agent_id, code, name, full_url, clicks, signups, conversions, is_active, created_at')
    .eq('code', c)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function listLinks(agentId) {
  const { data, error } = await adminSupabase
    .from('referral_links')
    .select('id, name, code, full_url, clicks, signups, conversions, is_active, created_at, updated_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const items = (data || []).map((row) => ({
    ...row,
    full_url: row.full_url || `${baseUrl()}/register?ref=${encodeURIComponent(row.code)}`,
    earnings_from_link: 0,
  }));
  const linkIds = items.map((r) => r.id);
  if (linkIds.length > 0) {
    const { data: earnRows } = await adminSupabase
      .from('agent_earnings')
      .select('referral_link_id, amount')
      .in('referral_link_id', linkIds)
      .in('type', ['commission', 'bonus'])
      .in('status', ['credited', 'completed']);
    const sumByLink = {};
    for (const e of earnRows || []) {
      const lid = e.referral_link_id;
      if (!lid) continue;
      sumByLink[lid] = (sumByLink[lid] || 0) + Number(e.amount ?? 0);
    }
    for (const row of items) {
      row.earnings_from_link = sumByLink[row.id] || 0;
    }
  }
  return items;
}

async function createLink(agentId, { name } = {}) {
  const code = await generateUniqueCode();
  const full_url = `${baseUrl()}/register?ref=${encodeURIComponent(code)}`;
  const { data, error } = await adminSupabase
    .from('referral_links')
    .insert({
      agent_id: agentId,
      name: name ? String(name).slice(0, 100) : 'Campaign',
      code,
      full_url,
      is_active: true,
    })
    .select('id, name, code, full_url, clicks, signups, conversions, is_active, created_at')
    .single();
  if (error) throw error;
  return data;
}

async function updateLink(agentId, linkId, { name, is_active } = {}) {
  const payload = {};
  if (name !== undefined) payload.name = String(name).slice(0, 100);
  if (is_active !== undefined) payload.is_active = !!is_active;
  if (Object.keys(payload).length === 0) {
    const err = new Error('No updates provided');
    err.status = 400;
    throw err;
  }
  const { data, error } = await adminSupabase
    .from('referral_links')
    .update(payload)
    .eq('id', linkId)
    .eq('agent_id', agentId)
    .select('id, name, code, full_url, clicks, signups, conversions, is_active, created_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error('Referral link not found');
    err.status = 404;
    throw err;
  }
  return data;
}

async function deactivateLink(agentId, linkId) {
  return updateLink(agentId, linkId, { is_active: false });
}

async function trackClick(code) {
  const link = await findByCode(code);
  if (!link || !link.is_active) {
    const err = new Error('Invalid or inactive referral code');
    err.status = 404;
    throw err;
  }
  await adminSupabase
    .from('referral_links')
    .update({ clicks: (link.clicks || 0) + 1 })
    .eq('id', link.id);
  return { ok: true, code: link.code };
}

async function incrementSignups(linkId) {
  if (!linkId) return;
  const { data: row } = await adminSupabase.from('referral_links').select('id, signups').eq('id', linkId).maybeSingle();
  if (!row) return;
  await adminSupabase.from('referral_links').update({ signups: (row.signups || 0) + 1 }).eq('id', linkId);
}

async function incrementConversions(linkId) {
  if (!linkId) return;
  const { data: row } = await adminSupabase.from('referral_links').select('id, conversions').eq('id', linkId).maybeSingle();
  if (!row) return;
  await adminSupabase.from('referral_links').update({ conversions: (row.conversions || 0) + 1 }).eq('id', linkId);
}

/**
 * Resolve referral for a new investment. Returns referral_link_id or null.
 */
async function resolveReferralForInvestment(investorUserId, referralCode) {
  const code = String(referralCode || '').trim();
  if (!code) return null;
  const link = await findByCode(code);
  if (!link || !link.is_active) return null;
  if (link.agent_id === investorUserId) return null;
  return link.id;
}

async function onInvestmentCompleted(investment) {
  const linkId = investment.referral_link_id;
  if (!linkId) return;

  const { data: link } = await adminSupabase.from('referral_links').select('agent_id').eq('id', linkId).maybeSingle();
  if (!link) return;

  const amountPaid = Number(investment.amount_paid ?? 0);
  const commission = Math.round(amountPaid * COMMISSION_RATE * 100) / 100;
  if (commission <= 0) return;

  const { count: completedWithRef } = await adminSupabase
    .from('investments')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', investment.user_id)
    .eq('referral_link_id', linkId)
    .eq('status', 'completed');
  if ((completedWithRef ?? 0) === 1) await incrementConversions(linkId);

  await adminSupabase.from('agent_earnings').insert({
    agent_id: link.agent_id,
    type: 'commission',
    amount: commission,
    investment_id: investment.id,
    referral_link_id: linkId,
    status: 'credited',
  });
}

async function listReferredUsers(agentId, { limit = 20, offset = 0 } = {}) {
  const { data: links } = await adminSupabase.from('referral_links').select('id').eq('agent_id', agentId);
  const linkIds = (links || []).map((l) => l.id);
  if (linkIds.length === 0) return { items: [], total: 0 };

  let q = adminSupabase
    .from('users')
    .select('id, name, phone, created_at, referred_by_link_id', { count: 'exact' })
    .in('referred_by_link_id', linkIds)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;

  const items = (data || []).map((u) => ({
    user_id: u.id,
    name: u.name,
    phone: u.phone ? `***${String(u.phone).slice(-4)}` : null,
    created_at: u.created_at,
    referred_by_link_id: u.referred_by_link_id,
  }));

  return { items, total: count ?? 0 };
}

async function computeEarningsBalance(agentId) {
  const { data, error } = await adminSupabase
    .from('agent_earnings')
    .select('type, amount, status')
    .eq('agent_id', agentId);
  if (error) throw error;

  let credits = 0;
  let pendingWithdrawals = 0;
  let completedWithdrawals = 0;

  for (const row of data || []) {
    const amt = Number(row.amount ?? 0);
    if (row.type === 'withdrawal') {
      if (row.status === 'pending') pendingWithdrawals += amt;
      else if (row.status === 'completed') completedWithdrawals += amt;
    } else if (['commission', 'bonus'].includes(row.type) && ['credited', 'completed'].includes(row.status)) {
      credits += amt;
    }
  }

  const available = credits - pendingWithdrawals - completedWithdrawals;
  return {
    total_credited: credits,
    pending_withdrawals: pendingWithdrawals,
    completed_withdrawals: completedWithdrawals,
    available_balance: Math.max(0, available),
  };
}

async function requestWithdrawal(agentId, amountRaw) {
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 500) {
    const err = new Error('Minimum withdrawal amount is 500');
    err.status = 400;
    throw err;
  }

  const { available_balance } = await computeEarningsBalance(agentId);
  if (amount > available_balance) {
    const err = new Error('Insufficient available earnings balance');
    err.status = 400;
    throw err;
  }

  const { data, error } = await adminSupabase
    .from('agent_earnings')
    .insert({
      agent_id: agentId,
      type: 'withdrawal',
      amount,
      status: 'pending',
    })
    .select('id, type, amount, status, created_at')
    .single();

  if (error) throw error;
  return data;
}

async function listEarningsLedger(agentId, { limit = 50, offset = 0 } = {}) {
  const { data, error, count } = await adminSupabase
    .from('agent_earnings')
    .select('id, type, amount, status, created_at, investment_id, referral_link_id', { count: 'exact' })
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { items: data || [], total: count ?? 0 };
}

async function listWithdrawals(agentId, { limit = 20, offset = 0 } = {}) {
  const { data, error, count } = await adminSupabase
    .from('agent_earnings')
    .select('id, type, amount, status, created_at', { count: 'exact' })
    .eq('agent_id', agentId)
    .eq('type', 'withdrawal')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { items: data || [], total: count ?? 0 };
}

module.exports = {
  baseUrl,
  findByCode,
  listLinks,
  createLink,
  updateLink,
  deactivateLink,
  trackClick,
  incrementSignups,
  resolveReferralForInvestment,
  onInvestmentCompleted,
  listReferredUsers,
  computeEarningsBalance,
  requestWithdrawal,
  listWithdrawals,
  listEarningsLedger,
  COMMISSION_RATE,
};

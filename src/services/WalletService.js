'use strict';

const { adminSupabase } = require('../config/database');

async function getOrCreate(userId) {
  const { data: existing } = await adminSupabase.from('wallets').select('id, balance, currency').eq('user_id', userId).maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await adminSupabase.from('wallets').insert({ user_id: userId, balance: 0, currency: 'INR' }).select('id, balance, currency').single();
  if (error) throw error;
  return created;
}

async function getBalance(userId) {
  const wallet = await getOrCreate(userId);
  return { balance: Number(wallet.balance ?? 0), currency: wallet.currency || 'INR' };
}

async function updateBalanceById(walletId, expectedBalance, newBalance) {
  const { data, error } = await adminSupabase
    .from('wallets')
    .update({ balance: newBalance })
    .eq('id', walletId)
    .eq('balance', expectedBalance)
    .select('id, user_id, balance, currency')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function credit(userId, amount) {
  const amt = Number(amount ?? 0);
  if (!Number.isFinite(amt) || amt <= 0) {
    const err = new Error('Credit amount must be positive');
    err.status = 400;
    throw err;
  }
  const wallet = await getOrCreate(userId);
  const current = Number(wallet.balance ?? 0);
  const updated = await updateBalanceById(wallet.id, wallet.balance, current + amt);
  if (!updated) {
    const err = new Error('Wallet balance changed, please retry');
    err.status = 409;
    throw err;
  }
  return { old_balance: current, new_balance: Number(updated.balance), currency: updated.currency || 'INR' };
}

async function debit(userId, amount) {
  const amt = Number(amount ?? 0);
  if (!Number.isFinite(amt) || amt <= 0) {
    const err = new Error('Debit amount must be positive');
    err.status = 400;
    throw err;
  }
  const wallet = await getOrCreate(userId);
  const current = Number(wallet.balance ?? 0);
  if (current < amt) {
    const err = new Error('Insufficient wallet balance');
    err.status = 400;
    throw err;
  }
  const updated = await updateBalanceById(wallet.id, wallet.balance, current - amt);
  if (!updated) {
    const err = new Error('Wallet balance changed, please retry');
    err.status = 409;
    throw err;
  }
  return { old_balance: current, new_balance: Number(updated.balance), currency: updated.currency || 'INR' };
}

module.exports = { getOrCreate, getBalance, updateBalanceById, credit, debit };

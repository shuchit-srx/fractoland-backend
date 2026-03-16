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

module.exports = { getOrCreate, getBalance };

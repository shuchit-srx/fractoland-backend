'use strict';

const { v4: uuidv4 } = require('uuid');
const { adminSupabase } = require('../config/database');

const ROLES = ['customer', 'agent', 'owner', 'developer', 'admin'];

async function findById(userId) {
  const { data, error } = await adminSupabase
    .from('users')
    .select('id, phone, email, name, role, country_code, kyc_status, kyc_type, wallet_address, referred_by_agent_id, referred_by_link_id, email_verified_at, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

async function findByPhone(phone) {
  const { data, error } = await adminSupabase
    .from('users')
    .select('id, phone, email, name, role, country_code, kyc_status, kyc_type, wallet_address, referred_by_agent_id, referred_by_link_id, email_verified_at, created_at, updated_at')
    .eq('phone', phone)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function findByWalletAddress(walletAddress) {
  const normalized = String(walletAddress || '').toLowerCase();
  if (!normalized) return null;
  const { data, error } = await adminSupabase
    .from('users')
    .select('id, phone, email, name, role, country_code, kyc_status, kyc_type, wallet_address, referred_by_agent_id, referred_by_link_id, email_verified_at, created_at, updated_at')
    .eq('wallet_address', normalized)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createUser({
  phone,
  countryCode = '+91',
  email = null,
  name = null,
  role = 'customer',
  kycStatus = 'pending',
  kycType = null,
  kycIdEncrypted = null,
  referredByAgentId = null,
  referredByLinkId = null,
}) {
  if (!ROLES.includes(role)) throw new Error('Invalid role');
  const id = uuidv4();
  const { data, error } = await adminSupabase
    .from('users')
    .insert({
      id,
      phone,
      country_code: countryCode,
      email,
      name,
      role,
      kyc_status: kycStatus,
      kyc_type: kycType,
      kyc_id_encrypted: kycIdEncrypted,
      referred_by_agent_id: referredByAgentId,
      referred_by_link_id: referredByLinkId,
    })
    .select()
    .single();

  if (error) throw error;

  await ensureWalletForUser(id);
  return data;
}

async function ensureWalletForUser(userId) {
  const { data: existing } = await adminSupabase.from('wallets').select('id').eq('user_id', userId).maybeSingle();
  if (existing) return existing.id;
  const { data: inserted, error } = await adminSupabase
    .from('wallets')
    .insert({ id: uuidv4(), user_id: userId, balance: 0, currency: 'INR' })
    .select('id')
    .single();
  if (error) throw error;
  return inserted.id;
}

async function updateUser(userId, updates) {
  const allowed = ['name', 'email', 'country_code', 'kyc_status', 'kyc_type', 'kyc_id_encrypted', 'wallet_address', 'email_verified_at'];
  const payload = {};
  for (const key of Object.keys(updates)) {
    const snake = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowed.includes(snake) || allowed.includes(key)) payload[snake] = updates[key];
  }
  if (Object.keys(payload).length === 0) return findById(userId);

  const { data, error } = await adminSupabase
    .from('users')
    .update(payload)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function upsertDeveloperExtra(userId, { companyName, gstin, licenseNumber }) {
  const { data, error } = await adminSupabase
    .from('developer_extras')
    .upsert(
      {
        user_id: userId,
        company_name: companyName,
        gstin: gstin || null,
        license_number: licenseNumber || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function kycSubmit(userId, kycType, kycIdEncrypted) {
  return updateUser(userId, {
    kyc_type: kycType,
    kyc_id_encrypted: kycIdEncrypted,
    kyc_status: 'pending',
  });
}

module.exports = {
  findById,
  findByPhone,
  findByWalletAddress,
  createUser,
  updateUser,
  ensureWalletForUser,
  upsertDeveloperExtra,
  kycSubmit,
  ROLES,
};

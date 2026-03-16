'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { adminSupabase } = require('../config/database');

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const SALT_ROUNDS = 10;

function generateOtp() {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

async function hashOtp(otp) {
  return bcrypt.hash(otp, SALT_ROUNDS);
}

async function verifyOtpHash(plainOtp, hash) {
  return bcrypt.compare(plainOtp, hash);
}

async function storeOtp(phone, countryCode, otpHash, purpose = 'login') {
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const { data, error } = await adminSupabase
    .from('otp_logs')
    .insert({
      id: uuidv4(),
      phone,
      country_code: countryCode || '+91',
      otp_hash: otpHash,
      purpose,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, expires_at')
    .single();

  if (error) throw error;
  return { id: data.id, expiresAt: data.expires_at };
}

async function findValidOtp(phone, countryCode, purpose = 'login') {
  const now = new Date().toISOString();
  const { data, error } = await adminSupabase
    .from('otp_logs')
    .select('id, otp_hash, expires_at')
    .eq('phone', phone)
    .eq('country_code', countryCode || '+91')
    .eq('purpose', purpose)
    .is('used_at', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function markOtpUsed(otpLogId) {
  const { error } = await adminSupabase
    .from('otp_logs')
    .update({ used_at: new Date().toISOString() })
    .eq('id', otpLogId);

  if (error) throw error;
}

async function createAndStoreOtp(phone, countryCode, purpose = 'login') {
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const { id, expiresAt } = await storeOtp(phone, countryCode, otpHash, purpose);
  return { otp, otpLogId: id, expiresAt };
}

async function verifyAndConsumeOtp(phone, countryCode, plainOtp, purpose = 'login') {
  const record = await findValidOtp(phone, countryCode, purpose);
  if (!record) return { valid: false, error: 'OTP expired or not found' };
  const valid = await verifyOtpHash(plainOtp, record.otp_hash);
  if (!valid) return { valid: false, error: 'Invalid OTP' };
  await markOtpUsed(record.id);
  return { valid: true, otpLogId: record.id };
}

/** Check OTP without consuming it (for UI validation when 6 digits entered). */
async function checkOtp(phone, countryCode, plainOtp, purpose = 'login') {
  const record = await findValidOtp(phone, countryCode, purpose);
  if (!record) return { valid: false, error: 'OTP expired or not found' };
  const valid = await verifyOtpHash(plainOtp, record.otp_hash);
  return valid ? { valid: true } : { valid: false, error: 'Invalid OTP' };
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtpHash,
  storeOtp,
  findValidOtp,
  markOtpUsed,
  createAndStoreOtp,
  verifyAndConsumeOtp,
  checkOtp,
  OTP_EXPIRY_MINUTES,
};

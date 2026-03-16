'use strict';

const UserService = require('../services/UserService');
const KycService = require('../services/KycService');

async function getMe(req, res) {
  try {
    const user = await UserService.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'Not found', message: 'User not found' });
    }
    const sanitized = {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      role: user.role,
      country_code: user.country_code,
      kyc_status: user.kyc_status,
      kyc_type: user.kyc_type,
      wallet_address: user.wallet_address,
      referred_by_agent_id: user.referred_by_agent_id,
      referred_by_link_id: user.referred_by_link_id,
      email_verified_at: user.email_verified_at,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
    return res.status(200).json(sanitized);
  } catch (e) {
    console.error('getMe error', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updateMe(req, res) {
  try {
    const { name, email, country_code } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (country_code !== undefined) updates.country_code = country_code;
    const user = await UserService.updateUser(req.userId, updates);
    const sanitized = {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      role: user.role,
      country_code: user.country_code,
      kyc_status: user.kyc_status,
      kyc_type: user.kyc_type,
      wallet_address: user.wallet_address,
      email_verified_at: user.email_verified_at,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
    return res.status(200).json(sanitized);
  } catch (e) {
    console.error('updateMe error', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function kycSubmit(req, res) {
  try {
    const { kyc_type: kycType, kyc_id: kycId } = req.body || {};
    if (!kycType || !kycId) {
      return res.status(400).json({ error: 'Bad request', message: 'kyc_type and kyc_id required' });
    }
    const encrypted = KycService.encrypt(kycId);
    await UserService.kycSubmit(req.userId, kycType, encrypted);
    const user = await UserService.findById(req.userId);
    return res.status(200).json({
      success: true,
      message: 'KYC submitted for verification',
      kyc_status: user.kyc_status,
    });
  } catch (e) {
    console.error('kycSubmit error', e);
    return res.status(500).json({ error: 'Server error', message: 'Failed to submit KYC' });
  }
}

module.exports = { getMe, updateMe, kycSubmit };

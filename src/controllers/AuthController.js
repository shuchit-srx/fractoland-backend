'use strict';

const OtpService = require('../services/OtpService');
const SmsService = require('../services/SmsService');
const JwtService = require('../services/JwtService');
const UserService = require('../services/UserService');
const WalletLinkService = require('../services/WalletLinkService');
const { checkRateLimit } = require('../middleware/rateLimit');

async function sendOtp(req, res) {
  try {
    const { phone, country_code: countryCode, purpose = 'login' } = req.body || {};
    const phoneClean = (phone || '').replace(/\D/g, '');
    if (phoneClean.length < 10) {
      return res.status(400).json({ error: 'Invalid phone', message: 'Valid phone number required' });
    }

    const rate = checkRateLimit(phoneClean, purpose);
    if (!rate.allowed) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Please try again later',
        retryAfter: rate.retryAfter,
      });
    }

    if (purpose === 'login') {
      const existingUser = await UserService.findByPhone(phoneClean);
      if (!existingUser) {
        return res.status(404).json({
          error: 'Account not found',
          message: 'No account exists for this phone number. Please register first.',
        });
      }
    }

    const { otp, otpLogId, expiresAt } = await OtpService.createAndStoreOtp(
      phoneClean,
      countryCode || '+91',
      purpose
    );

    const fullPhone = SmsService.formatPhoneWithCountryCode(countryCode || '+91', phoneClean);
    await SmsService.sendOtpSms(fullPhone, otp);

    return res.status(200).json({
      success: true,
      message: 'OTP sent',
      expiresAt,
      ...(process.env.NODE_ENV !== 'production' && { devOtp: otp }),
    });
  } catch (e) {
    console.error('sendOtp error', e);
    return res.status(500).json({ error: 'Server error', message: 'Failed to send OTP' });
  }
}

async function checkOtp(req, res) {
  try {
    const { phone, country_code: countryCode, otp, purpose = 'login' } = req.body || {};
    const phoneClean = (phone || '').replace(/\D/g, '');
    if (phoneClean.length < 10 || !otp || String(otp).trim().length !== 6) {
      return res.status(400).json({ valid: false, error: 'Phone and 6-digit OTP required' });
    }
    const result = await OtpService.checkOtp(phoneClean, countryCode || '+91', String(otp).trim(), purpose);
    return res.status(200).json(result);
  } catch (e) {
    console.error('checkOtp error', e);
    return res.status(500).json({ valid: false, error: 'Server error' });
  }
}

async function verifyOtp(req, res) {
  try {
    const {
      phone,
      country_code: countryCode,
      otp,
      purpose = 'login',
      register,
      name,
      email,
      role,
      kyc_type: kycType,
      kyc_id: kycId,
      referred_by_agent_id: referredByAgentId,
      referred_by_link_id: referredByLinkId,
      developer,
      company_name: companyName,
      gstin,
      license_number: licenseNumber,
      wallet_message: walletMessage,
      wallet_signature: walletSignature,
    } = req.body || {};

    const phoneClean = (phone || '').replace(/\D/g, '');
    if (!phoneClean || !otp || String(otp).length !== 6) {
      return res.status(400).json({ error: 'Invalid request', message: 'Phone and 6-digit OTP required' });
    }

    const otpPurpose = developer ? 'register' : purpose;
    const { valid, error: otpError } = await OtpService.verifyAndConsumeOtp(
      phoneClean,
      countryCode || '+91',
      String(otp).trim(),
      otpPurpose
    );

    if (!valid) {
      return res.status(400).json({ error: 'Invalid OTP', message: otpError || 'Invalid or expired OTP' });
    }

    if (register || developer) {
      if (!walletMessage || !walletSignature) {
        return res.status(400).json({
          error: 'Wallet required',
          message: 'Please connect and sign with your wallet to complete registration.',
        });
      }
      const walletAddress = await WalletLinkService.verifySiweSignature(walletMessage, walletSignature);
      if (!walletAddress) {
        return res.status(400).json({
          error: 'Invalid wallet signature',
          message: 'Wallet signature verification failed. Please try again.',
        });
      }
      const existingByWallet = await UserService.findByWalletAddress(walletAddress);
      if (existingByWallet) {
        return res.status(400).json({
          error: 'Wallet already linked',
          message: 'This wallet is already linked to another account. Use a different wallet or log in with that account.',
        });
      }
    }

    let user = await UserService.findByPhone(phoneClean);

    if (register || developer) {
      const KycService = require('../services/KycService');
      const kycIdEncrypted = kycId ? KycService.encrypt(kycId) : null;
      const userRole = developer ? 'developer' : (role || 'customer');

      if (user) {
        user = await UserService.updateUser(user.id, {
          name: name || user.name,
          email: email || user.email,
          role: userRole,
          kyc_type: kycType || user.kyc_type,
          kyc_id_encrypted: kycIdEncrypted || user.kyc_id_encrypted,
          referred_by_agent_id: referredByAgentId || user.referred_by_agent_id,
          referred_by_link_id: referredByLinkId || user.referred_by_link_id,
        });
      } else {
        user = await UserService.createUser({
          phone: phoneClean,
          countryCode: countryCode || '+91',
          email: email || null,
          name: name || null,
          role: userRole,
          kycType: kycType || null,
          kycIdEncrypted,
          referredByAgentId: referredByAgentId || null,
          referredByLinkId: referredByLinkId || null,
        });
      }

      if (developer && (companyName || gstin || licenseNumber)) {
        await UserService.upsertDeveloperExtra(user.id, {
          companyName: companyName || '',
          gstin: gstin || null,
          licenseNumber: licenseNumber || null,
        });
      }

      const walletAddress = await WalletLinkService.verifySiweSignature(walletMessage, walletSignature);
      if (walletAddress) {
        await WalletLinkService.linkWalletToUser(user.id, walletAddress);
        user = await UserService.findById(user.id);
      }
    }

    if (!user) {
      return res.status(400).json({
        error: 'User not found',
        message: 'No account found for this phone. Please register first.',
      });
    }

    const accessToken = JwtService.signAccessToken({
      sub: user.id,
      role: user.role,
      phone: user.phone,
    });
    const { token: refreshToken, expiresInDays } = JwtService.signRefreshToken(user.id);
    const tokenHash = JwtService.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    await JwtService.storeRefreshToken(user.id, tokenHash, expiresAt.toISOString());

    const sanitized = {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      role: user.role,
      country_code: user.country_code,
      kyc_status: user.kyc_status,
      wallet_address: user.wallet_address,
      email_verified_at: user.email_verified_at,
      created_at: user.created_at,
    };

    return res.status(200).json({
      success: true,
      user: sanitized,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresInDays * 24 * 60 * 60,
    });
  } catch (e) {
    console.error('verifyOtp error', e);
    return res.status(500).json({ error: 'Server error', message: 'Verification failed' });
  }
}

async function refresh(req, res) {
  try {
    const { refresh_token: refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ error: 'Bad request', message: 'refresh_token required' });
    }

    const decoded = JwtService.verifyRefreshToken(refreshToken);
    if (!decoded || !decoded.sub) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired refresh token' });
    }

    const tokenHash = JwtService.hashToken(refreshToken);
    const stored = await JwtService.findRefreshToken(decoded.sub, tokenHash);
    if (!stored) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Refresh token not found or revoked' });
    }

    const user = await UserService.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    }

    const accessToken = JwtService.signAccessToken({
      sub: user.id,
      role: user.role,
      phone: user.phone,
    });

    return res.status(200).json({
      success: true,
      access_token: accessToken,
    });
  } catch (e) {
    console.error('refresh error', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function logout(req, res) {
  try {
    const userId = req.userId;
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const refreshToken = (req.body && req.body.refresh_token) || null;

    if (refreshToken && userId) {
      const tokenHash = JwtService.hashToken(refreshToken);
      await JwtService.revokeRefreshToken(userId, tokenHash).catch(() => {});
    }

    return res.status(200).json({ success: true, message: 'Logged out' });
  } catch (e) {
    console.error('logout error', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function loginWithWallet(req, res) {
  try {
    const { message, signature } = req.body || {};
    if (!message || !signature) {
      return res.status(400).json({ error: 'Bad request', message: 'message and signature required (SIWE)' });
    }

    const address = await WalletLinkService.verifySiweSignature(message, signature);
    if (!address) {
      return res.status(400).json({ error: 'Invalid signature', message: 'Wallet signature verification failed' });
    }

    const user = await UserService.findByWalletAddress(address);
    if (!user) {
      return res.status(404).json({
        error: 'Account not found',
        message: 'No account is linked to this wallet. Please register first and link your wallet.',
      });
    }

    const accessToken = JwtService.signAccessToken({
      sub: user.id,
      role: user.role,
      phone: user.phone,
    });
    const { token: refreshToken, expiresInDays } = JwtService.signRefreshToken(user.id);
    const tokenHash = JwtService.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    await JwtService.storeRefreshToken(user.id, tokenHash, expiresAt.toISOString());

    const sanitized = {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      role: user.role,
      country_code: user.country_code,
      kyc_status: user.kyc_status,
      wallet_address: user.wallet_address,
      email_verified_at: user.email_verified_at,
      created_at: user.created_at,
    };

    return res.status(200).json({
      success: true,
      user: sanitized,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresInDays * 24 * 60 * 60,
    });
  } catch (e) {
    console.error('loginWithWallet error', e);
    return res.status(500).json({ error: 'Server error', message: 'Login failed' });
  }
}

async function linkWallet(req, res) {
  try {
    const userId = req.userId;
    const { message, signature } = req.body || {};
    if (!message || !signature) {
      return res.status(400).json({ error: 'Bad request', message: 'message and signature required (SIWE)' });
    }

    const address = await WalletLinkService.verifySiweSignature(message, signature);
    if (!address) {
      return res.status(400).json({ error: 'Invalid signature', message: 'Wallet signature verification failed' });
    }

    const user = await WalletLinkService.linkWalletToUser(userId, address);
    const sanitized = {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      role: user.role,
      wallet_address: user.wallet_address,
      kyc_status: user.kyc_status,
      created_at: user.created_at,
    };
    return res.status(200).json({ success: true, user: sanitized });
  } catch (e) {
    console.error('linkWallet error', e);
    return res.status(500).json({ error: 'Server error', message: 'Failed to link wallet' });
  }
}

module.exports = {
  sendOtp,
  checkOtp,
  verifyOtp,
  refresh,
  logout,
  loginWithWallet,
  linkWallet,
};

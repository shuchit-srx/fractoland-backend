'use strict';

const SiweMessage = require('siwe').SiweMessage;
const { ethers } = require('ethers');
const { adminSupabase } = require('../config/database');

const DOMAIN = process.env.WALLET_LINK_DOMAIN || 'localhost';
const ORIGIN = process.env.WALLET_LINK_ORIGIN || 'http://localhost:5173';

function getNonceMessage(nonce) {
  return `Sign this message to link your wallet to FractoLand.\nNonce: ${nonce}`;
}

function getSiweMessageForVerification({ domain, address, statement, nonce, chainId = 1 }) {
  return new SiweMessage({
    domain,
    address,
    statement: statement || 'Sign in to FractoLand',
    nonce,
    chainId,
    uri: ORIGIN,
    version: '1',
    issuedAt: new Date().toISOString(),
  });
}

async function verifySiweSignature(message, signature) {
  let address = null;
  try {
    const siweMessage = new SiweMessage(message);
    const result = await siweMessage.verify({ signature });
    if (result && result.success && result.data && result.data.address) {
      address = String(result.data.address).toLowerCase();
    }
  } catch (e) {
    console.error('[WalletLinkService] SIWE verify error', e.message || e);
  }

  if (address) return address;

  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered && ethers.isAddress(recovered)) {
      return recovered.toLowerCase();
    }
  } catch (e) {
    console.error('[WalletLinkService] ethers verifyMessage error', e.message || e);
  }
  return null;
}

async function linkWalletToUser(userId, walletAddress) {
  const normalized = String(walletAddress).toLowerCase();
  if (!normalized || !ethers.isAddress(normalized)) {
    throw new Error('Invalid wallet address');
  }

  const { data: row, error } = await adminSupabase
    .from('users')
    .update({
      wallet_address: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id, phone, email, name, role, wallet_address, kyc_status, created_at, updated_at')
    .single();

  if (error) {
    console.error('[WalletLinkService] linkWalletToUser Supabase error', error.message, error.code, error.details);
    throw error;
  }
  if (!row || row.wallet_address !== normalized) {
    console.error('[WalletLinkService] wallet_address not persisted', { userId, normalized, row });
    throw new Error('Wallet update did not persist. Ensure the users table has a wallet_address column.');
  }
  return row;
}

module.exports = {
  getNonceMessage,
  getSiweMessageForVerification,
  verifySiweSignature,
  linkWalletToUser,
  DOMAIN,
  ORIGIN,
};

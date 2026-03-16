'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey() {
  const key = process.env.KYC_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    if (process.env.NODE_ENV === 'production') throw new Error('KYC_ENCRYPTION_KEY must be 32+ chars');
    return crypto.scryptSync('dev-kyc-secret-fractoland', 'salt', 32);
  }
  return Buffer.from(key.slice(0, 32), 'utf8');
}

function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(cipherText) {
  const key = getEncryptionKey();
  const parts = cipherText.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload');
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const enc = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final('utf8');
}

module.exports = { encrypt, decrypt };

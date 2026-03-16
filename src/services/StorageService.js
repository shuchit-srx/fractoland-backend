'use strict';

const { v4: uuidv4 } = require('uuid');
const { adminSupabase } = require('../config/database');
const storageConfig = require('../config/storage');

const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Build storage path for venture document or image.
 * @param {string} ventureId - UUID of venture
 * @param {string} type - 'documents' | 'images'
 * @param {string} filename - original filename
 * @param {string} [ext] - optional extension (e.g. 'pdf')
 */
function buildKey(ventureId, type, filename, ext) {
  const safeName = (filename || '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
  const extPart = ext || safeName.split('.').pop() || 'bin';
  const name = extPart === safeName ? `${safeName}_${uuidv4().slice(0, 8)}` : safeName;
  return `${ventureId}/${type}/${uuidv4().slice(0, 8)}_${name}`;
}

/**
 * Upload a buffer to Supabase Storage.
 * @param {Buffer} buffer
 * @param {string} path - storage path (from buildKey)
 * @param {string} contentType - e.g. 'application/pdf', 'image/jpeg'
 * @returns {Promise<{ key: string, bucket: string }>}
 */
async function uploadBuffer(buffer, path, contentType = 'application/octet-stream') {
  if (!storageConfig.isConfigured()) {
    throw new Error('Supabase is not configured. Set SUPABASE_PROJECT_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const bucket = storageConfig.getBucket();
  const { data, error } = await adminSupabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: contentType || 'application/octet-stream',
      upsert: true,
    });
  if (error) throw error;
  return { key: data.path, bucket };
}

/**
 * Generate a signed URL for GET (download). Use for private buckets.
 * @param {string} path - storage path (file_key stored in DB)
 * @param {number} [expiresIn] - seconds
 */
async function getSignedDownloadUrl(path, expiresIn = DEFAULT_SIGNED_URL_EXPIRY_SECONDS) {
  if (!storageConfig.isConfigured()) return null;
  const bucket = storageConfig.getBucket();
  const { data, error } = await adminSupabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}

/**
 * Get public URL for a file (use when bucket is public).
 * @param {string} path - storage path
 */
function getPublicUrl(path) {
  if (!storageConfig.isConfigured()) return null;
  const bucket = storageConfig.getBucket();
  const { data } = adminSupabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

/**
 * Generate a signed upload URL for client-side upload (optional).
 * @param {string} path - storage path
 * @param {number} [expiresIn] - seconds
 */
async function getSignedUploadUrl(path, expiresIn = 600) {
  if (!storageConfig.isConfigured()) return null;
  const bucket = storageConfig.getBucket();
  const { data, error } = await adminSupabase.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: true });
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Delete object from Supabase Storage.
 */
async function deleteObject(path) {
  if (!storageConfig.isConfigured()) return false;
  const bucket = storageConfig.getBucket();
  const { error } = await adminSupabase.storage.from(bucket).remove([path]);
  return !error;
}

module.exports = {
  isConfigured: () => storageConfig.isConfigured(),
  buildKey,
  uploadBuffer,
  getSignedDownloadUrl,
  getPublicUrl,
  getSignedUploadUrl,
  deleteObject,
  DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
};

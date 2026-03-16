'use strict';

/**
 * Supabase Storage configuration for venture documents and images.
 * Uses the same Supabase project as the database (SUPABASE_PROJECT_URL, SUPABASE_SERVICE_ROLE_KEY).
 * Create a bucket in Supabase Dashboard (e.g. "ventures") and set SUPABASE_STORAGE_BUCKET.
 */
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'ventures';

function isConfigured() {
  return !!(process.env.SUPABASE_PROJECT_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getBucket() {
  return bucket;
}

module.exports = { bucket, getBucket, isConfigured };

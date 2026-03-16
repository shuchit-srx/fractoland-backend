'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabaseProjectUrl = process.env.SUPABASE_PROJECT_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseProjectUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_PROJECT_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const adminSupabase = createClient(supabaseProjectUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

module.exports = { adminSupabase };

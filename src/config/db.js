import { createClient } from '@supabase/supabase-js';

import dotenv from 'dotenv';
dotenv.config();

const supabaseProjectUrl = process.env.SUPABASE_PROJECT_URL;
const supabasePublishableDefaultKey = process.env.SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseProjectUrl || !supabasePublishableDefaultKey || !supabaseServiceRoleKey) {
  throw new Error('⚠️ Server Message: Missing Supabase configuration');
}

export const supabase = createClient(supabaseProjectUrl, supabasePublishableDefaultKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
export const adminSupabase = createClient(supabaseProjectUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

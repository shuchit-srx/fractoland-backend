const { createClient } = require("@supabase/supabase-js");
require('dotenv').config();

const supabaseProjectUrl = process.env.SUPABASE_PROJECT_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(
  supabaseProjectUrl,
  supabasePublishableKey
);

module.exports = { supabase };
/** Service-role Supabase client for the Speed Trivia scripts. One copy; the scripts import it. */
const { createClient } = require('@supabase/supabase-js');

const clientFromEnv = () => {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

module.exports = { clientFromEnv };

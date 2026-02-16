import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isValidHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const validatedSupabaseUrl = isValidHttpUrl(supabaseUrl) ? supabaseUrl : null;

export const isSupabaseAdminConfigured = Boolean(
  validatedSupabaseUrl && serviceRoleKey
);

export const supabaseAdmin = isSupabaseAdminConfigured
  ? createClient(validatedSupabaseUrl!, serviceRoleKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

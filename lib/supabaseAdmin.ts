import "server-only";

import { createClient } from "@supabase/supabase-js";

function normalizeEnvValue(value: string | undefined): string {
  if (!value) return "";
  let normalized = value.trim();
  for (let i = 0; i < 2; i += 1) {
    if (
      (normalized.startsWith('""') && normalized.endsWith('""')) ||
      (normalized.startsWith("''") && normalized.endsWith("''"))
    ) {
      normalized = normalized.slice(2, -2).trim();
      continue;
    }
    if (
      (normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
      normalized = normalized.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return normalized;
}

const supabaseUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceRoleKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

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

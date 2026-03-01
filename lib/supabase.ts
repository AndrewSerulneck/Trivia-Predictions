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

function normalizeSupabaseUrl(value: string): string {
  if (!value) return value;
  const trimmed = value.trim();
  if (trimmed.includes(".supabase.com")) {
    return trimmed.replace(".supabase.com", ".supabase.co");
  }
  return trimmed;
}

const supabaseUrl = normalizeSupabaseUrl(normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL));
const supabaseAnonKey = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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

export const isSupabaseConfigured = Boolean(validatedSupabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(validatedSupabaseUrl!, supabaseAnonKey!)
  : null;

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

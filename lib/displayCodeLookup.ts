import "server-only";

import { parseDisplayCode } from "@/lib/displayCode";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * The venue behind a 4-character display code, or null (malformed, unknown, or the lookup failed).
 * One indexed read (`venues_display_code_key`). The ONE lookup, shared by the short link `/tv/<code>`
 * (app/tv/[code]/route.ts) and the TV app's typed code (app/api/tv-app/display-code/route.ts).
 * The code only reveals the display, which is already public.
 */
export const findVenueIdByDisplayCode = async (raw: string): Promise<string | null> => {
  const code = parseDisplayCode(raw);
  if (!code || !supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id")
    .eq("display_code", code)
    .maybeSingle<{ id: string }>();
  if (error || !data) return null;
  return data.id;
};

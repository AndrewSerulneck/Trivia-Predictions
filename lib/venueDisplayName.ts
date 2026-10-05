import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * How long a server instance trusts a venue name it has already read. The live coupon asks for it
 * on every wallet load, and a venue's name practically never changes — but it CAN, so the entry
 * expires (same convention as `getVenueTimezone`).
 */
export const VENUE_NAME_CACHE_TTL_MS = 10 * 60_000;

const venueNameCache = new Map<string, { name: string | null; expiresAtMs: number }>();

/** Test hook: forget every cached venue name. */
export function clearVenueDisplayNameCache(): void {
  venueNameCache.clear();
}

/**
 * The name guests see for a venue (`display_name`, else `name`), or null when it can't be read.
 * Cosmetic — the live coupon prints it so a coupon forwarded from another bar shows the wrong
 * name — so a failed read is "no name", never an error, and is NOT cached (the next call retries).
 */
export async function getVenueDisplayName(venueId: string): Promise<string | null> {
  const id = String(venueId ?? "").trim();
  if (!id || !supabaseAdmin) return null;
  const nowMs = Date.now();
  const cached = venueNameCache.get(id);
  if (cached && cached.expiresAtMs > nowMs) return cached.name;

  try {
    const { data, error } = await supabaseAdmin
      .from("venues")
      .select("name, display_name")
      .eq("id", id)
      .maybeSingle<{ name: string | null; display_name: string | null }>();
    if (error) return null;
    const name = String(data?.display_name ?? "").trim() || String(data?.name ?? "").trim() || null;
    venueNameCache.set(id, { name, expiresAtMs: nowMs + VENUE_NAME_CACHE_TTL_MS });
    return name;
  } catch {
    return null;
  }
}

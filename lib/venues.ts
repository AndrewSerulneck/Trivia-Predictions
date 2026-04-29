import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { defaultVenuesAsVenueModels } from "@/lib/defaultVenues";
import type { Venue } from "@/types";

const FALLBACK_VENUES: Venue[] = defaultVenuesAsVenueModels();
const VENUE_QUERY_TIMEOUT_MS = 8000;

type VenueRow = {
  id: string;
  name: string;
  display_name: string | null;
  logo_text: string | null;
  icon_emoji: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  radius: number;
};

function mapVenueRow(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name ?? undefined,
    logoText: row.logo_text ?? undefined,
    iconEmoji: row.icon_emoji ?? undefined,
    address: row.address ?? undefined,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radius: Number(row.radius),
  };
}

async function withTimedVenueQuery<T>(runQuery: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, VENUE_QUERY_TIMEOUT_MS);

  try {
    return await runQuery(controller.signal);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function listVenues(): Promise<Venue[]> {
  const supabaseClient = supabase;
  if (!isSupabaseConfigured || !supabaseClient) {
    return FALLBACK_VENUES;
  }

  try {
    const { data, error } = await withTimedVenueQuery(async (signal) => {
      return await supabaseClient
        .from("venues")
        .select("id, name, display_name, logo_text, icon_emoji, address, latitude, longitude, radius")
        .abortSignal(signal)
        .order("name", { ascending: true });
    });

    if (error || !data || data.length === 0) {
      return FALLBACK_VENUES;
    }

    return data.map((row) => mapVenueRow(row as VenueRow));
  } catch {
    return FALLBACK_VENUES;
  }
}

export async function getVenueById(venueId: string): Promise<Venue | null> {
  if (!venueId) return null;

  const supabaseClient = supabase;
  if (!isSupabaseConfigured || !supabaseClient) {
    return FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
  }

  try {
    const { data, error } = await withTimedVenueQuery(async (signal) => {
      return await supabaseClient
        .from("venues")
        .select("id, name, display_name, logo_text, icon_emoji, address, latitude, longitude, radius")
        .abortSignal(signal)
        .eq("id", venueId)
        .maybeSingle<VenueRow>();
    });

    if (error) {
      return FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
    }

    return data ? mapVenueRow(data) : FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
  } catch {
    return FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
  }
}

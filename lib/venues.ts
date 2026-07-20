import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { defaultVenuesAsVenueModels } from "@/lib/defaultVenues";
import type { Venue } from "@/types";

const FALLBACK_VENUES: Venue[] = defaultVenuesAsVenueModels();
const VENUE_QUERY_TIMEOUT_MS = 4500;

const VENUE_CACHE_KEY = "tp_venues_cache_v1";
const VENUE_CACHE_TTL_MS = 5 * 60 * 1000;

type VenueCache = {
  venues: Venue[];
  fetchedAt: number;
};

export function readCachedVenues(): Venue[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(VENUE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VenueCache;
    if (Date.now() - parsed.fetchedAt > VENUE_CACHE_TTL_MS) return null;
    if (!Array.isArray(parsed.venues) || parsed.venues.length === 0) return null;
    return parsed.venues;
  } catch {
    return null;
  }
}

function setCachedVenues(venues: Venue[]): void {
  if (typeof window === "undefined") return;
  try {
    const cache: VenueCache = { venues, fetchedAt: Date.now() };
    window.sessionStorage.setItem(VENUE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // sessionStorage unavailable or full — skip silently
  }
}

type VenueRow = {
  id: string;
  name: string;
  display_name: string | null;
  logo_text: string | null;
  icon_emoji: string | null;
  street: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  county: string | null;
  region: string | null;
  latitude: number;
  longitude: number;
  radius: number;
  screen_enabled?: boolean | null;
  screen_brand_image_url?: string | null;
  screen_brand_primary?: string | null;
  screen_brand_secondary?: string | null;
  screen_sponsor_rotation_enabled?: boolean | null;
};

const VENUE_SELECT_WITH_PARSED_ADDRESS =
  "id, name, display_name, logo_text, icon_emoji, street, address, city, state, zip_code, country, county, region, latitude, longitude, radius, screen_enabled, screen_brand_image_url, screen_brand_primary, screen_brand_secondary, screen_sponsor_rotation_enabled";
const VENUE_SELECT_LEGACY =
  "id, name, display_name, logo_text, icon_emoji, address, city, state, zip_code, county, region, latitude, longitude, radius";

function mapVenueRow(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name ?? undefined,
    logoText: row.logo_text ?? undefined,
    iconEmoji: row.icon_emoji ?? undefined,
    street: row.street ?? row.address ?? undefined,
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    zipCode: row.zip_code ?? undefined,
    country: row.country ?? undefined,
    county: row.county ?? undefined,
    region: row.region ?? undefined,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radius: Number(row.radius),
    screenEnabled: typeof row.screen_enabled === "boolean" ? row.screen_enabled : undefined,
    screenBrandImageUrl: row.screen_brand_image_url ?? undefined,
    screenBrandPrimary: row.screen_brand_primary ?? undefined,
    screenBrandSecondary: row.screen_brand_secondary ?? undefined,
    screenSponsorRotationEnabled:
      typeof row.screen_sponsor_rotation_enabled === "boolean" ? row.screen_sponsor_rotation_enabled : undefined,
  };
}

function isMissingParsedAddressColumns(errorMessage: string | undefined): boolean {
  const normalized = String(errorMessage ?? "").toLowerCase();
  return (
    normalized.includes("column venues.street does not exist") ||
    normalized.includes("column venues.country does not exist") ||
    normalized.includes("column venues.screen_enabled does not exist") ||
    normalized.includes("column venues.screen_brand_image_url does not exist") ||
    normalized.includes("column venues.screen_brand_primary does not exist") ||
    normalized.includes("column venues.screen_brand_secondary does not exist") ||
    normalized.includes("column venues.screen_sponsor_rotation_enabled does not exist")
  );
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
  const cached = readCachedVenues();
  if (cached) return cached;

  const supabaseClient = supabase;
  if (!isSupabaseConfigured || !supabaseClient) {
    return FALLBACK_VENUES;
  }

  try {
    const parsedResult = await withTimedVenueQuery(async (signal) => {
      return await supabaseClient
        .from("venues")
        .select(VENUE_SELECT_WITH_PARSED_ADDRESS)
        .abortSignal(signal)
        .or("hidden.is.null,hidden.eq.false")
        .order("name", { ascending: true });
    });

    let data: VenueRow[] | null = (parsedResult.data as VenueRow[] | null) ?? null;
    let error = parsedResult.error;

    if (error && isMissingParsedAddressColumns(error.message)) {
      const legacyResult = await withTimedVenueQuery(async (signal) => {
        return await supabaseClient
          .from("venues")
          .select(VENUE_SELECT_LEGACY)
          .abortSignal(signal)
          .or("hidden.is.null,hidden.eq.false")
          .order("name", { ascending: true });
      });
      data = (legacyResult.data as VenueRow[] | null) ?? null;
      error = legacyResult.error;
    }

    if (error || !data || data.length === 0) {
      return FALLBACK_VENUES;
    }

    const venues = data.map((row) => mapVenueRow(row));
    setCachedVenues(venues);
    return venues;
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
    const parsedResult = await withTimedVenueQuery(async (signal) => {
      return await supabaseClient
        .from("venues")
        .select(VENUE_SELECT_WITH_PARSED_ADDRESS)
        .abortSignal(signal)
        .eq("id", venueId)
        .maybeSingle<VenueRow>();
    });

    let data: VenueRow | null = (parsedResult.data as VenueRow | null) ?? null;
    let error = parsedResult.error;

    if (error && isMissingParsedAddressColumns(error.message)) {
      const legacyResult = await withTimedVenueQuery(async (signal) => {
        return await supabaseClient
          .from("venues")
          .select(VENUE_SELECT_LEGACY)
          .abortSignal(signal)
          .eq("id", venueId)
          .maybeSingle<VenueRow>();
      });
      data = (legacyResult.data as VenueRow | null) ?? null;
      error = legacyResult.error;
    }

    if (error) {
      return FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
    }

    return data ? mapVenueRow(data) : FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
  } catch {
    return FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
  }
}

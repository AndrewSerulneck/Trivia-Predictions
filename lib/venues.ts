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
  instagram_handle?: string | null;
  share_show_name?: boolean | null;
  share_show_address?: boolean | null;
  share_show_instagram?: boolean | null;
};

const VENUE_SELECT_WITH_PARSED_ADDRESS =
  "id, name, display_name, logo_text, icon_emoji, street, address, city, state, zip_code, country, county, region, latitude, longitude, radius, screen_enabled, screen_brand_image_url, screen_brand_primary, screen_brand_secondary, screen_sponsor_rotation_enabled";
const VENUE_SELECT_LEGACY =
  "id, name, display_name, logo_text, icon_emoji, address, city, state, zip_code, county, region, latitude, longitude, radius";
// What share pictures show (Phase 9e). Rides on the venue reads players already make, so a share
// never fetches the venue just for this (lib/socialShare/shareVenue.ts).
const VENUE_SELECT_WITH_SHARE_DETAILS = `${VENUE_SELECT_WITH_PARSED_ADDRESS}, instagram_handle, share_show_name, share_show_address, share_show_instagram`;

/** Widest first; a "column does not exist" error steps down one (a database a migration behind). */
const VENUE_SELECT_TIERS = [VENUE_SELECT_WITH_SHARE_DETAILS, VENUE_SELECT_WITH_PARSED_ADDRESS, VENUE_SELECT_LEGACY] as const;

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
    instagramHandle: row.instagram_handle ?? undefined,
    shareShowName: typeof row.share_show_name === "boolean" ? row.share_show_name : undefined,
    shareShowAddress: typeof row.share_show_address === "boolean" ? row.share_show_address : undefined,
    shareShowInstagram: typeof row.share_show_instagram === "boolean" ? row.share_show_instagram : undefined,
  };
}

function isMissingVenueColumn(errorMessage: string | undefined): boolean {
  const normalized = String(errorMessage ?? "").toLowerCase();
  return (
    /column venues\.(instagram_handle|share_show_name|share_show_address|share_show_instagram) does not exist/.test(normalized) ||
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

type VenueQueryResult<T> = { data: T | null; error: { message: string } | null };

/** Runs `run` with the widest column list the database has (see VENUE_SELECT_TIERS). */
async function selectVenueTiers<T>(
  run: (columns: string, signal: AbortSignal) => PromiseLike<VenueQueryResult<T>>,
): Promise<VenueQueryResult<T>> {
  let result: VenueQueryResult<T> = { data: null, error: null };
  for (const columns of VENUE_SELECT_TIERS) {
    result = await withTimedVenueQuery((signal) => run(columns, signal));
    if (!result.error || !isMissingVenueColumn(result.error.message)) return result;
  }
  return result;
}

export async function listVenues(): Promise<Venue[]> {
  const cached = readCachedVenues();
  if (cached) return cached;

  const supabaseClient = supabase;
  if (!isSupabaseConfigured || !supabaseClient) {
    return FALLBACK_VENUES;
  }

  try {
    const { data, error } = await selectVenueTiers<VenueRow[]>((columns, signal) =>
      supabaseClient
        .from("venues")
        .select(columns)
        .abortSignal(signal)
        .or("hidden.is.null,hidden.eq.false")
        .order("name", { ascending: true })
        .returns<VenueRow[]>(),
    );

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
    const { data, error } = await selectVenueTiers<VenueRow>((columns, signal) =>
      supabaseClient
        .from("venues")
        .select(columns)
        .abortSignal(signal)
        .eq("id", venueId)
        .maybeSingle<VenueRow>(),
    );

    if (error) {
      return FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
    }

    return data ? mapVenueRow(data) : FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
  } catch {
    return FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
  }
}

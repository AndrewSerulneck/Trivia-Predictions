import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { defaultVenuesAsVenueModels } from "@/lib/defaultVenues";
import type { Venue } from "@/types";

const FALLBACK_VENUES: Venue[] = defaultVenuesAsVenueModels();

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

export async function listVenues(): Promise<Venue[]> {
  if (!isSupabaseConfigured || !supabase) {
    return FALLBACK_VENUES;
  }

  const { data, error } = await supabase
    .from("venues")
    .select("id, name, display_name, logo_text, icon_emoji, address, latitude, longitude, radius")
    .order("name", { ascending: true });

  if (error || !data || data.length === 0) {
    return FALLBACK_VENUES;
  }

  return data.map((row) => mapVenueRow(row as VenueRow));
}

export async function getVenueById(venueId: string): Promise<Venue | null> {
  if (!venueId) return null;

  if (!isSupabaseConfigured || !supabase) {
    return FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
  }

  const { data, error } = await supabase
    .from("venues")
    .select("id, name, display_name, logo_text, icon_emoji, address, latitude, longitude, radius")
    .eq("id", venueId)
    .maybeSingle<VenueRow>();

  if (error) {
    return FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
  }

  return data ? mapVenueRow(data) : FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
}

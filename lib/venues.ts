import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Venue } from "@/types";

const FALLBACK_VENUES: Venue[] = [
  {
    id: "venue-downtown",
    name: "Downtown Sports Bar",
    address: "Downtown Manhattan, New York, NY",
    latitude: 40.712776,
    longitude: -74.005974,
    radius: 100,
  },
  {
    id: "venue-uptown",
    name: "Uptown Taproom",
    address: "Uptown Manhattan, New York, NY",
    latitude: 40.73061,
    longitude: -73.935242,
    radius: 100,
  },
  {
    id: "venue-riverside",
    name: "Riverside Grill",
    address: "Midtown West, New York, NY",
    latitude: 40.758896,
    longitude: -73.98513,
    radius: 100,
  },
];

type VenueRow = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius: number;
};

function mapVenueRow(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
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
    .select("id, name, address, latitude, longitude, radius")
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
    .select("id, name, address, latitude, longitude, radius")
    .eq("id", venueId)
    .maybeSingle<VenueRow>();

  if (error) {
    return FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
  }

  return data ? mapVenueRow(data) : FALLBACK_VENUES.find((venue) => venue.id === venueId) ?? null;
}

import type { Venue } from "@/types";

export type DefaultVenueSeed = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius: number;
};

export const DEFAULT_VENUE_SEEDS: DefaultVenueSeed[] = [
  {
    id: "venue-downtown",
    name: "Brunswick Grove",
    address: "Downtown Manhattan, New York, NY",
    latitude: 40.712776,
    longitude: -74.005974,
    radius: 100,
  },
  {
    id: "venue-uptown",
    name: "General Saloon",
    address: "Uptown Manhattan, New York, NY",
    latitude: 40.73061,
    longitude: -73.935242,
    radius: 100,
  },
  {
    id: "venue-riverside",
    name: "Buffalo Wild Wings",
    address: "Midtown West, New York, NY",
    latitude: 40.758896,
    longitude: -73.98513,
    radius: 100,
  },
];

export const DEFAULT_VENUE_BY_ID: Record<string, DefaultVenueSeed> = Object.fromEntries(
  DEFAULT_VENUE_SEEDS.map((venue) => [venue.id, venue])
);

export function defaultVenuesAsVenueModels(): Venue[] {
  return DEFAULT_VENUE_SEEDS.map((venue) => ({
    id: venue.id,
    name: venue.name,
    address: venue.address,
    latitude: venue.latitude,
    longitude: venue.longitude,
    radius: venue.radius,
  }));
}

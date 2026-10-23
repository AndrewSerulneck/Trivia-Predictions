import { getVenueDisplayName } from "@/lib/venueDisplay";
import { readCachedVenues } from "@/lib/venues";
import type { Venue } from "@/types";
import type { StoryShareVenueAddress } from "./contracts";

/**
 * The bar on a share picture: its name and physical address (street + city), never
 * directions (docs/native-app-store-plan.md Phases 9a–9f decision 3).
 *
 * Zero requests in the usual case: the venue hub remembers the venue it already loaded
 * (`rememberShareVenue`), and a game screen reads it back. Only when nothing is remembered
 * (a deep link straight into a game) does the share sheet read the one venue row, once,
 * when the player opens it (`useShareVenue`).
 */

export type ShareVenue = {
  id: string;
  name: string;
  address: StoryShareVenueAddress | null;
};

type VenueAddressFields = Pick<Venue, "street" | "address" | "city" | "state">;

const STORAGE_KEY = "htc_share_venue_v1";

const clean = (value: string | null | undefined): string | null => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
};

/**
 * "1010 Pacific St" + "Brooklyn, NY". Some venues store the whole formatted address in
 * `street` ("1010 Pacific St, Brooklyn, NY 11238, USA"), so only the part before the first
 * comma is the street. No street and no city → null (the picture shows the name only).
 */
export const formatShareVenueAddress = (venue: VenueAddressFields): StoryShareVenueAddress | null => {
  const streetSource = clean(venue.street) ?? clean(venue.address);
  const street = clean(streetSource?.split(",")[0]);
  const city = clean(venue.city);
  const state = clean(venue.state);
  const locality = city ? (state ? `${city}, ${state}` : city) : null;
  if (!street && !locality) return null;
  return { street, locality };
};

export const toShareVenue = (venue: Venue): ShareVenue => ({
  id: venue.id,
  name: getVenueDisplayName(venue),
  address: formatShareVenueAddress(venue),
});

const isShareVenue = (value: unknown): value is ShareVenue => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.name === "string";
};

/** Called by the venue hub with the venue it already has. One small localStorage write. */
export const rememberShareVenue = (venue: Venue): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toShareVenue(venue)));
  } catch {
    // storage unavailable — the share sheet reads the venue when opened instead
  }
};

/** The remembered venue (or the join list's cache), only if it is this venue. */
export const readShareVenue = (venueId: string): ShareVenue | null => {
  if (typeof window === "undefined" || !venueId) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isShareVenue(parsed) && parsed.id === venueId) return parsed;
  } catch {
    // fall through to the join list's cache
  }
  const cached = readCachedVenues()?.find((venue) => venue.id === venueId);
  return cached ? toShareVenue(cached) : null;
};

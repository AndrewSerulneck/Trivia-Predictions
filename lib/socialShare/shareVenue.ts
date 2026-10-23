import { getVenueDisplayName } from "@/lib/venueDisplay";
import { readCachedVenues } from "@/lib/venues";
import { DEFAULT_VENUE_SHARE_DETAILS, parseInstagramHandle } from "@/lib/venueShareDetails";
import type { Venue } from "@/types";
import type { StorySharePayload, StoryShareVenueAddress } from "./contracts";

/**
 * The bar on a share picture: its name, physical address (street + city, never directions —
 * docs/native-app-store-plan.md Phases 9a–9f decision 3) and Instagram handle, each shown only
 * if the venue's partner chose it (Phase 9e, one choice per venue).
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
  /** Without the "@"; null = none set. */
  instagram: string | null;
  show: { name: boolean; address: boolean; instagram: boolean };
};

type VenueAddressFields = Pick<Venue, "street" | "address" | "city" | "state">;

// v2 (Phase 9e): adds `instagram` + `show`; a v1 entry is ignored and re-read.
const STORAGE_KEY = "htc_share_venue_v2";

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

export const toShareVenue = (venue: Venue): ShareVenue => {
  const handle = parseInstagramHandle(venue.instagramHandle);
  return {
    id: venue.id,
    name: getVenueDisplayName(venue),
    address: formatShareVenueAddress(venue),
    instagram: handle.ok ? handle.handle : null,
    show: {
      name: venue.shareShowName ?? DEFAULT_VENUE_SHARE_DETAILS.showName,
      address: venue.shareShowAddress ?? DEFAULT_VENUE_SHARE_DETAILS.showAddress,
      instagram: venue.shareShowInstagram ?? DEFAULT_VENUE_SHARE_DETAILS.showInstagram,
    },
  };
};

const isShareVenue = (value: unknown): value is ShareVenue => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const show = record.show as Record<string, unknown> | null | undefined;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    (record.instagram === null || typeof record.instagram === "string") &&
    !!show &&
    typeof show.name === "boolean" &&
    typeof show.address === "boolean" &&
    typeof show.instagram === "boolean"
  );
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

/**
 * THE one place a venue's share choice is applied (Phase 9e). Every share — every game and every
 * prize, including ones added later — goes through StoryShareLauncher, which calls this before the
 * picture, headline and caption are built, so no screen or design decides it on its own.
 *
 * - name on: the bar's display name (a screen's own name is used only when none is known);
 *   name off: no name anywhere (the headline loses " at <bar>", the picture loses the bar line);
 * - address off: no street/city line;
 * - handle on + set: "@handle" on the picture and in the caption.
 * Venue not known yet: the payload as the screen built it (= the defaults, name + address).
 */
export const applyShareVenue = (payload: StorySharePayload, venue: ShareVenue | null): StorySharePayload => {
  if (!venue) return { ...payload, venueInstagram: null };
  return {
    ...payload,
    venueName: venue.show.name ? venue.name || payload.venueName : null,
    // A screen-built subtitle names the bar ("Live Trivia at …"); dropped so the game name alone is used.
    subtitle: venue.show.name ? payload.subtitle : null,
    venueAddress: venue.show.address ? (payload.venueAddress ?? venue.address) : null,
    venueInstagram: venue.show.instagram ? venue.instagram : null,
  };
};

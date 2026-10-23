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
 * (`rememberShareVenue`, stamped `savedAt`), and a game screen reads it back. When nothing fresh is
 * remembered (a deep link, a bookmark, or the hub was more than SHARE_VENUE_FRESH_MS ago) the share
 * sheet reads the one venue row when it opens (`useShareVenue`), so a partner's change always wins
 * over an old copy (9f.4).
 */

export type ShareVenue = {
  id: string;
  name: string;
  address: StoryShareVenueAddress | null;
  /** Without the "@"; null = none set. */
  instagram: string | null;
  show: { name: boolean; address: boolean; instagram: boolean };
};

/** Nothing fresh is known about the bar: the picture names no bar (9f.4) — never the screen's own name. */
export type ShareVenueChoice = ShareVenue | "unknown";

/** What storage knows: the venue and whether it is recent enough to share without re-reading. */
export type StoredShareVenue = { venue: ShareVenue; fresh: boolean };

type VenueAddressFields = Pick<Venue, "street" | "address" | "city" | "state">;

// v3 (9f.4): adds `savedAt`; a v2 entry (no date, so no way to tell its age) is ignored and re-read.
const STORAGE_KEY = "htc_share_venue_v3";

/** A remembered venue older than this is re-read when the share sheet opens (Andrew's note, 9f.4). */
export const SHARE_VENUE_FRESH_MS = 10 * 60 * 1000;

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

/** Called by the venue hub with the venue it already has, and by the share sheet after its read. One small localStorage write. */
export const rememberShareVenue = (venue: Venue, now: number = Date.now()): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...toShareVenue(venue), savedAt: now }));
  } catch {
    // storage unavailable — the share sheet reads the venue when opened instead
  }
};

const readRemembered = (venueId: string): { venue: ShareVenue; savedAt: number } | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!isShareVenue(parsed) || parsed.id !== venueId) return null;
    const savedAt = (parsed as { savedAt?: unknown }).savedAt;
    if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
    const { id, name, address, instagram, show } = parsed;
    return { venue: { id, name, address, instagram, show }, savedAt };
  } catch {
    return null;
  }
};

/**
 * What storage knows about this venue. Fresh = remembered under SHARE_VENUE_FRESH_MS ago, or in the
 * join list's cache (which itself expires after 5 minutes). A stale entry is still returned: it is the
 * fallback if the sheet's read fails.
 */
export const readShareVenue = (venueId: string, now: number = Date.now()): StoredShareVenue | null => {
  if (typeof window === "undefined" || !venueId) return null;
  const remembered = readRemembered(venueId);
  const age = remembered ? now - remembered.savedAt : Infinity;
  if (remembered && age >= 0 && age < SHARE_VENUE_FRESH_MS) return { venue: remembered.venue, fresh: true };
  const cached = readCachedVenues()?.find((venue) => venue.id === venueId);
  if (cached) return { venue: toShareVenue(cached), fresh: true };
  return remembered ? { venue: remembered.venue, fresh: false } : null;
};

/** The sheet's one venue read: still going, the venue, or failed (error, timeout or no such venue). */
export type ShareVenueRead = "pending" | ShareVenue | "failed";

/**
 * The expiry table (9f.4). `read` is null when no read was needed (storage was fresh).
 * - fresh in storage → it, ready;
 * - read landed → it, ready;
 * - read failed → the remembered entry if any, else "unknown" (no bar on the picture), ready;
 * - read in flight → the remembered entry if any, else "unknown", NOT ready: the pictures draw but
 *   nothing can be sent until the read settles.
 */
export const resolveShareVenue = (
  stored: StoredShareVenue | null,
  read: ShareVenueRead | null,
): { venue: ShareVenueChoice; ready: boolean } => {
  if (stored?.fresh) return { venue: stored.venue, ready: true };
  if (read && read !== "pending" && read !== "failed") return { venue: read, ready: true };
  return { venue: stored?.venue ?? "unknown", ready: read === "failed" };
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
 * "unknown" (nothing fresh and the read failed, or still reading with nothing remembered): the safe
 * fallback — no bar name, address or handle; the win and the app panel still share (9f.4). Never the
 * screen's own name: the partner may have turned it off.
 */
export const applyShareVenue = (payload: StorySharePayload, venue: ShareVenueChoice): StorySharePayload => {
  if (venue === "unknown") return { ...payload, venueName: null, subtitle: null, venueAddress: null, venueInstagram: null };
  return {
    ...payload,
    venueName: venue.show.name ? venue.name || payload.venueName : null,
    // A screen-built subtitle names the bar ("Live Trivia at …"); dropped so the game name alone is used.
    subtitle: venue.show.name ? payload.subtitle : null,
    venueAddress: venue.show.address ? (payload.venueAddress ?? venue.address) : null,
    venueInstagram: venue.show.instagram ? venue.instagram : null,
  };
};

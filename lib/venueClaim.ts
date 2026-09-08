// Self-Serve Signup — venue claim eligibility.
//
// Phase 1 of docs/self-serve-signup-review-fixes-plan.md. This module exists
// because the rule "may this venue be attached to a self-serve signup?" was
// written TWICE — once in `findNearbyVenue`'s proximity loop, and once,
// differently, in POST /api/owner/signup's `claimVenueId` branch. The claim
// copy was missing the (0, 0) placeholder clause, so an anonymous caller could
// post the id of the Category Blitz global room and receive an ownership link
// to it. There is now one predicate and two call sites.
//
// Pure and dependency-light on purpose (only lib/geofence + lib/selfServeSignup,
// both pure): no Supabase, no `server-only`, so it is testable in isolation and
// safe anywhere. It deliberately does NOT live in lib/selfServeSignup.ts, which
// is browser/edge-facing and knows nothing about database row shapes.

import { calculateDistanceMeters } from "@/lib/geofence";
import { SIGNUP_DUPLICATE_RADIUS_METERS } from "@/lib/selfServeSignup";

/**
 * The venue columns both the proximity scan and the claim lookup read.
 *
 * A single string rather than two `.select()` lists: Finding #2 existed because
 * `self_serve_created_at` was fetched by neither, so the stamp guard could not
 * have been written correctly even if someone had tried.
 */
export const VENUE_CLAIM_COLUMNS =
  "id, name, address, street, city, state, latitude, longitude, hidden, self_serve_created_at";

/** A `venues` row as selected by VENUE_CLAIM_COLUMNS. */
export type ClaimableVenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Soft-hidden: absent from `listVenues()` only. See CLAUDE.md, Venue Visibility. */
  hidden: boolean | null;
  /**
   * A CAPABILITY GRANT, not a timestamp. Non-null simultaneously arms
   * `maybeRevealVenue` (publish this venue to every player) and
   * `sweepAbandonedSignupVenues` (delete it 7 days from this instant). Only
   * rows the self-serve flow itself created carry it.
   */
  self_serve_created_at: string | null;
};

/**
 * A placeholder / internal room, not a place.
 *
 * Both Category Blitz global rooms (`hc-cbz-live`, `category-blitz-global-room`)
 * are seeded at exactly (0, 0) — they are the only rows in production that sit
 * there, and no real venue ever will: `(0, 0)` is open water in the Gulf of
 * Guinea. Such a row is never claimable, never offered as a duplicate, and must
 * never be revealed to players.
 */
export const isPlaceholderVenueRow = (row: Pick<ClaimableVenueRow, "latitude" | "longitude">): boolean =>
  row.latitude === 0 && row.longitude === 0;

/** Did the self-serve signup flow create this row? */
export const isSelfServeVenueRow = (row: Pick<ClaimableVenueRow, "self_serve_created_at">): boolean =>
  typeof row.self_serve_created_at === "string" && row.self_serve_created_at.trim() !== "";

/**
 * Hidden, but NOT by this flow — an admin hid it, or it is an internal room.
 *
 * Such a venue is out of scope for self-serve entirely: a stranger must not get
 * a `venue_owner_venues` row to it, and stamping it would hand the sweep an
 * admin-created venue to delete. Ops has `ActivateVenueFlow` for the legitimate
 * cases. Verified against production 2026-09-08: the only two rows this matches
 * are the Category Blitz global rooms, so it blocks no real partner today.
 */
export const isAdminHiddenVenueRow = (
  row: Pick<ClaimableVenueRow, "hidden" | "self_serve_created_at">
): boolean => row.hidden === true && !isSelfServeVenueRow(row);

/**
 * THE eligibility rule. Both the proximity scan and the attacker-supplied
 * `claimVenueId` lookup go through this and nothing else.
 *
 * Returns the distance from the pin for a row that qualifies — a real, located
 * place within SIGNUP_DUPLICATE_RADIUS_METERS — and `null` for one that does
 * not. It returns the distance rather than a boolean so `findNearbyVenue` can
 * pick the NEAREST match without a second, separately-written distance call:
 * that is exactly the kind of second copy this module exists to prevent.
 *
 * Provenance is a SEPARATE question — see `isAdminHiddenVenueRow` — because the
 * two call sites answer it differently: discovery must still notice an
 * admin-hidden venue at this address (otherwise it creates a duplicate that
 * splits one bar's leaderboard), it just must not offer it as a claim.
 */
export const claimableDistanceMeters = (
  row: Pick<ClaimableVenueRow, "latitude" | "longitude">,
  pin: { latitude: number; longitude: number }
): number | null => {
  if (row.latitude === null || row.longitude === null) return null;
  if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return null;
  if (isPlaceholderVenueRow(row)) return null;
  const distance = calculateDistanceMeters(pin, {
    latitude: row.latitude,
    longitude: row.longitude,
  });
  return distance <= SIGNUP_DUPLICATE_RADIUS_METERS ? distance : null;
};

/** `claimableDistanceMeters` as a yes/no — the shape the claim branch wants. */
export const isClaimableVenueRow = (
  row: Pick<ClaimableVenueRow, "latitude" | "longitude">,
  pin: { latitude: number; longitude: number }
): boolean => claimableDistanceMeters(row, pin) !== null;

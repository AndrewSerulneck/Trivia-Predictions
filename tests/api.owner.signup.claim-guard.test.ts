import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  VENUE_CLAIM_COLUMNS,
  claimableDistanceMeters,
  isAdminHiddenVenueRow,
  isClaimableVenueRow,
  isPlaceholderVenueRow,
  isSelfServeVenueRow,
  type ClaimableVenueRow,
} from "@/lib/venueClaim";

/**
 * Phase 1 of docs/self-serve-signup-review-fixes-plan.md — the claim-path
 * vulnerability (review findings #1 and #2).
 *
 * The attack chain this file exists to close: POST /api/owner/signup's
 * `claimVenueId` branch carried its OWN, shorter copy of the venue-eligibility
 * rule, missing the `(0, 0)` placeholder clause. An anonymous caller could post
 * `claimVenueId: "hc-cbz-live"` with a pin near the Gulf of Guinea and receive a
 * `venue_owner_venues` row for the Category Blitz global room (#1). The stamp
 * refresh four steps later was then guarded on `hidden` alone, so that same
 * request wrote `self_serve_created_at` onto the room — simultaneously arming
 * `maybeRevealVenue` (publish an internal pooling room to every player's venue
 * list) and `sweepAbandonedSignupVenues` (delete it 7 days later) (#2).
 *
 * Scope split, on purpose. This file owns the shared predicate itself and the
 * static tripwire that keeps it shared. The ROUTE-level cases the plan lists —
 * a `(0, 0)` claim, an admin-created hidden venue, and the legitimate abandoned
 * self-serve claim that must still work — live in the "claim guards (Phase 1)"
 * block of tests/api.owner.signup.test.ts instead, beside the Supabase/auth mock
 * harness they need. Copying that 170-line harness into a second file would be
 * the exact defect §2 of the plan names as the root cause of all fifteen
 * findings.
 */

const REPO_ROOT = join(__dirname, "..");
const read = (relPath: string): string => readFileSync(join(REPO_ROOT, relPath), "utf8");

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// Denver, and the two Category Blitz global rooms' actual seeded coordinates.
const PIN = { latitude: 39.7392, longitude: -104.9903 };
const GULF_OF_GUINEA = { latitude: 0, longitude: 0 };

const row = (overrides: Partial<ClaimableVenueRow> = {}): ClaimableVenueRow => ({
  id: "venue-anchor",
  name: "The Anchor",
  address: "1 Main St, Denver, CO",
  street: "1 Main St",
  city: "Denver",
  state: "CO",
  latitude: PIN.latitude,
  longitude: PIN.longitude,
  hidden: false,
  self_serve_created_at: null,
  ...overrides,
});

describe("isPlaceholderVenueRow — the (0, 0) internal rooms", () => {
  it("matches exactly (0, 0), the coordinates both Category Blitz global rooms are seeded at", () => {
    expect(isPlaceholderVenueRow({ latitude: 0, longitude: 0 })).toBe(true);
  });

  it("does not match a real venue, or a row with only one zero component", () => {
    expect(isPlaceholderVenueRow(PIN)).toBe(false);
    expect(isPlaceholderVenueRow({ latitude: 0, longitude: -104.9903 })).toBe(false);
    expect(isPlaceholderVenueRow({ latitude: 39.7392, longitude: 0 })).toBe(false);
  });
});

describe("claimableDistanceMeters — the ONE eligibility rule", () => {
  it("returns the distance for a venue at the pin", () => {
    expect(claimableDistanceMeters(row(), PIN)).toBeCloseTo(0, 5);
  });

  it("returns a distance for a venue ~50 m away and null for one ~5 km away", () => {
    const near = row({ latitude: PIN.latitude + 0.00045 });
    const far = row({ latitude: PIN.latitude + 0.045 });
    expect(claimableDistanceMeters(near, PIN)).toBeLessThan(150);
    expect(claimableDistanceMeters(far, PIN)).toBeNull();
  });

  it("REFUSES the (0, 0) placeholder even when the pin is standing on it", () => {
    // Finding #1, reduced to its smallest form. Without the placeholder clause
    // this returns ~0 and the room becomes claimable.
    const globalRoom = row({ id: "hc-cbz-live", latitude: 0, longitude: 0, hidden: true });
    expect(claimableDistanceMeters(globalRoom, GULF_OF_GUINEA)).toBeNull();
    expect(isClaimableVenueRow(globalRoom, GULF_OF_GUINEA)).toBe(false);
  });

  it("refuses rows with null or non-finite coordinates", () => {
    expect(claimableDistanceMeters(row({ latitude: null, longitude: null }), PIN)).toBeNull();
    expect(claimableDistanceMeters(row({ latitude: null }), PIN)).toBeNull();
    expect(claimableDistanceMeters(row({ longitude: null }), PIN)).toBeNull();
    expect(claimableDistanceMeters(row({ latitude: Number.NaN }), PIN)).toBeNull();
    expect(claimableDistanceMeters(row({ longitude: Number.POSITIVE_INFINITY }), PIN)).toBeNull();
  });

  it("uses SIGNUP_DUPLICATE_RADIUS_METERS as the bound, not a literal", async () => {
    const { SIGNUP_DUPLICATE_RADIUS_METERS } = await import("@/lib/selfServeSignup");
    // ~1 m inside and ~1 m outside the radius, due north.
    const metresPerDegree = 111_320;
    const inside = row({ latitude: PIN.latitude + (SIGNUP_DUPLICATE_RADIUS_METERS - 1) / metresPerDegree });
    const outside = row({ latitude: PIN.latitude + (SIGNUP_DUPLICATE_RADIUS_METERS + 1) / metresPerDegree });
    expect(claimableDistanceMeters(inside, PIN)).not.toBeNull();
    expect(claimableDistanceMeters(outside, PIN)).toBeNull();
  });
});

describe("provenance — self_serve_created_at is a capability grant", () => {
  it("treats a non-empty timestamp as self-serve provenance", () => {
    expect(isSelfServeVenueRow(row({ self_serve_created_at: "2026-09-07T00:00:00.000Z" }))).toBe(true);
  });

  it("treats null, empty and whitespace as NOT self-serve", () => {
    // Whitespace matters because the guard's failure mode is silent: a truthy
    // non-timestamp would let an admin-created row be stamped and revealed.
    expect(isSelfServeVenueRow(row({ self_serve_created_at: null }))).toBe(false);
    expect(isSelfServeVenueRow(row({ self_serve_created_at: "" }))).toBe(false);
    expect(isSelfServeVenueRow(row({ self_serve_created_at: "   " }))).toBe(false);
  });

  it("flags a hidden venue this flow did NOT create — and only that combination", () => {
    expect(isAdminHiddenVenueRow(row({ hidden: true, self_serve_created_at: null }))).toBe(true);
    // Somebody else's abandoned self-serve signup: claimable, and the case the
    // stamp refresh exists for.
    expect(isAdminHiddenVenueRow(row({ hidden: true, self_serve_created_at: "2026-08-18T00:00:00Z" }))).toBe(
      false
    );
    // A live venue is never "admin hidden", whatever its provenance.
    expect(isAdminHiddenVenueRow(row({ hidden: false, self_serve_created_at: null }))).toBe(false);
    expect(isAdminHiddenVenueRow(row({ hidden: null, self_serve_created_at: null }))).toBe(false);
  });
});

describe("tripwire — one predicate, two call sites", () => {
  const routeSrc = stripComments(read("app/api/owner/signup/route.ts"));

  it("the route imports the shared predicate from @/lib/venueClaim", () => {
    expect(routeSrc).toMatch(/from ["']@\/lib\/venueClaim["']/);
    expect(routeSrc).toMatch(/\bclaimableDistanceMeters\b/);
    expect(routeSrc).toMatch(/\bisClaimableVenueRow\b/);
  });

  it("the route never re-derives the distance rule itself", () => {
    // Finding #1 WAS a second, hand-written copy of exactly this expression in
    // the claim branch. lib/venueClaim.ts is the only place it may live.
    expect(routeSrc, "calculateDistanceMeters belongs in lib/venueClaim.ts").not.toMatch(
      /calculateDistanceMeters/
    );
  });

  it("both venue reads select the shared column list, never a hand-written one", () => {
    // Finding #2 was possible because `self_serve_created_at` was in neither
    // .select() list, so the stamp guard could not have been written correctly.
    // Two `.select(VENUE_CLAIM_COLUMNS)` call sites — the proximity scan and the
    // claimVenueId lookup — and no hand-written venue column list anywhere.
    expect(routeSrc.match(/\.select\(VENUE_CLAIM_COLUMNS\)/g) ?? []).toHaveLength(2);
    expect(routeSrc, "no literal venue column list in the route").not.toMatch(
      /\.select\(\s*["'][^"']*\blatitude\b/
    );
    expect(VENUE_CLAIM_COLUMNS).toContain("self_serve_created_at");
    expect(VENUE_CLAIM_COLUMNS).toContain("hidden");
  });

  it("the stamp refresh is guarded on provenance, never on `hidden` alone", () => {
    expect(routeSrc).toMatch(/claimTarget\?\.hidden\s*&&\s*isSelfServeVenueRow\(claimTarget\)/);
  });
});

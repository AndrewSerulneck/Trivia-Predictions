import { describe, expect, it } from "vitest";

import {
  isBillingLive,
  isVenueRehideEnabled,
  shouldRehideVenue,
  shouldRestoreVenue,
  shouldRevealVenue,
  type VisibilityBillingRow,
  type VisibilityVenueRow,
} from "@/lib/venueVisibility";

/**
 * Venue visibility — the truth table.
 *
 * docs/self-serve-signup-review-fixes-plan.md §3 Phase 3 (Finding #3), which
 * absorbs docs/lapsed-venue-rehide-plan.md Phases 0–1. Reveal, re-hide and
 * restore are ONE table on purpose: the root cause §2 names is a rule written
 * twice, and "is this venue supposed to be visible?" is the rule most likely to
 * be answered differently in the webhook, the cron and the sweep.
 *
 * Only `shouldRevealVenue` has a caller today (the reconciler). The other two
 * are pinned here now, before Phase 9 wires them, precisely so they cannot be
 * written later, elsewhere, and drift.
 */

const venue = (over: Partial<VisibilityVenueRow> = {}): VisibilityVenueRow => ({
  id: "the-corner-tap",
  hidden: true,
  latitude: 41.8781,
  longitude: -87.6298,
  self_serve_created_at: "2026-09-01T12:00:00.000Z",
  rehidden_at: null,
  ...over,
});

const billing = (over: Partial<VisibilityBillingRow> = {}): VisibilityBillingRow => ({
  status: "active",
  stripe_subscription_id: "sub_123",
  billing_method: "stripe",
  ...over,
});

describe("isBillingLive — the live/not-live predicate is classifyBillingRow's, not ours", () => {
  it("treats active and past_due as live and everything else as not", () => {
    expect(isBillingLive(billing({ status: "active" }))).toBe(true);
    // A card in dunning is still a paying customer — going dark on them is the
    // failure mode the reveal/re-hide split exists to avoid.
    expect(isBillingLive(billing({ status: "past_due" }))).toBe(true);
    expect(isBillingLive(billing({ status: "cancelled" }))).toBe(false);
    // No Stripe object = nothing that can bill, whatever the mirrored status says.
    expect(isBillingLive(billing({ stripe_subscription_id: null }))).toBe(false);
    expect(isBillingLive(null)).toBe(false);
    expect(isBillingLive(undefined)).toBe(false);
  });
});

describe("shouldRevealVenue — the repair for a missed webhook reveal", () => {
  it("reveals a paying, hidden, self-serve venue (the whole point of Finding #3)", () => {
    expect(shouldRevealVenue(venue(), billing())).toBe(true);
  });

  it("reveals a past_due venue — dunning is not a reason to be invisible", () => {
    expect(shouldRevealVenue(venue(), billing({ status: "past_due" }))).toBe(true);
  });

  it("does nothing for a venue that is already visible", () => {
    expect(shouldRevealVenue(venue({ hidden: false }), billing())).toBe(false);
  });

  it("does nothing without a live subscription — an abandoned signup stays hidden", () => {
    expect(shouldRevealVenue(venue(), billing({ status: "cancelled" }))).toBe(false);
    expect(shouldRevealVenue(venue(), null)).toBe(false);
    expect(shouldRevealVenue(venue(), undefined)).toBe(false);
  });

  /**
   * The load-bearing clause. Without it the reconciler would publish every
   * admin-hidden venue that happens to carry a subscription.
   */
  it("refuses an admin-hidden venue (no self_serve_created_at stamp)", () => {
    expect(shouldRevealVenue(venue({ self_serve_created_at: null }), billing())).toBe(false);
    expect(shouldRevealVenue(venue({ self_serve_created_at: "   " }), billing())).toBe(false);
  });

  /**
   * The two Category Blitz global rooms sit at exactly (0, 0) and are hidden.
   * They are stamp-null today, so the clause above already covers them — this is
   * the second lock, and it is the one that holds if a row is ever mis-stamped.
   */
  it("refuses a (0, 0) placeholder even if it is somehow stamped and paying", () => {
    expect(
      shouldRevealVenue(venue({ id: "hc-cbz-live", latitude: 0, longitude: 0 }), billing())
    ).toBe(false);
  });

  it("still reveals a venue on the equator or the prime meridian (only BOTH is a placeholder)", () => {
    expect(shouldRevealVenue(venue({ latitude: 0, longitude: 36.8 }), billing())).toBe(true);
    expect(shouldRevealVenue(venue({ latitude: 51.5, longitude: 0 }), billing())).toBe(true);
  });
});

/**
 * The re-hide truth table, verbatim from docs/lapsed-venue-rehide-plan.md §4
 * Phase 1. Nothing calls `shouldRehideVenue` until Phase 9; it is pinned now so
 * the "wait for period end" and "failed payment" decisions cannot be quietly
 * reversed by someone wiring it up later.
 */
describe("shouldRehideVenue — lapsed venues (Phase 9 wires it; the decisions are made here)", () => {
  const visible = venue({ hidden: false });

  it("active → no action", () => {
    expect(shouldRehideVenue(visible, billing({ status: "active" }))).toBe(false);
  });

  it("active with cancel_at_period_end → NO action; we wait for the period to end", () => {
    // Stripe keeps the subscription `active` until the period actually ends, so
    // our mirror says active too. That IS the decision — never compute
    // current_period_end here.
    expect(shouldRehideVenue(visible, billing({ status: "active" }))).toBe(false);
  });

  it("past_due → NO action; a retrying card is not a lapse", () => {
    expect(shouldRehideVenue(visible, billing({ status: "past_due" }))).toBe(false);
  });

  it("cancelled (canceled / incomplete_expired / paused all map here) → hide", () => {
    expect(shouldRehideVenue(visible, billing({ status: "cancelled" }))).toBe(true);
  });

  it("a mirror with no Stripe object → hide", () => {
    expect(shouldRehideVenue(visible, billing({ stripe_subscription_id: null }))).toBe(true);
  });

  it("an expired OFFLINE grant → report only, never an automatic hide", () => {
    expect(
      shouldRehideVenue(visible, billing({ status: "cancelled", billing_method: "offline" }))
    ).toBe(false);
  });

  it("refuses an admin-activated venue (no stamp) and an already-hidden one", () => {
    expect(
      shouldRehideVenue(venue({ hidden: false, self_serve_created_at: null }), billing({ status: "cancelled" }))
    ).toBe(false);
    expect(shouldRehideVenue(venue({ hidden: true }), billing({ status: "cancelled" }))).toBe(false);
  });

  it("does nothing when there is no billing row at all", () => {
    // A venue with no subscription is the signup sweep's business, not ours.
    expect(shouldRehideVenue(visible, null)).toBe(false);
  });
});

describe("shouldRestoreVenue — we only ever restore what we hid", () => {
  it("restores a venue this feature hid once billing goes live again", () => {
    expect(shouldRestoreVenue(venue({ rehidden_at: "2026-09-05T00:00:00.000Z" }), billing())).toBe(true);
  });

  it("NEVER restores a venue an admin hid by hand (rehidden_at null)", () => {
    expect(shouldRestoreVenue(venue({ rehidden_at: null }), billing())).toBe(false);
    expect(shouldRestoreVenue(venue({ rehidden_at: "  " }), billing())).toBe(false);
  });

  it("does not restore while billing is still not live", () => {
    expect(
      shouldRestoreVenue(venue({ rehidden_at: "2026-09-05T00:00:00.000Z" }), billing({ status: "cancelled" }))
    ).toBe(false);
  });

  it("does nothing for a venue that is already visible", () => {
    expect(
      shouldRestoreVenue(venue({ hidden: false, rehidden_at: "2026-09-05T00:00:00.000Z" }), billing())
    ).toBe(false);
  });
});

describe("isVenueRehideEnabled — server-side flag, no NEXT_PUBLIC_ prefix", () => {
  const original = process.env.VENUE_REHIDE_ENABLED;
  const set = (value: string | undefined) => {
    if (value === undefined) delete process.env.VENUE_REHIDE_ENABLED;
    else process.env.VENUE_REHIDE_ENABLED = value;
  };

  it("is off by default and accepts the repo's truthy convention", () => {
    set(undefined);
    expect(isVenueRehideEnabled()).toBe(false);
    for (const on of ["1", "true", "YES", " on "]) {
      set(on);
      expect(isVenueRehideEnabled()).toBe(true);
    }
    for (const off of ["0", "false", "", "maybe"]) {
      set(off);
      expect(isVenueRehideEnabled()).toBe(false);
    }
    set(original);
  });
});

// The static tripwires that used to live here were CONSOLIDATED into
// `tests/venue-rehide-contract.test.ts` when Phase 9 wired the re-hide / restore
// jobs — they now guard three source files, not one, and belong with the
// re-hide contract rather than this module's behavioural table. Do not re-add a
// second copy here.

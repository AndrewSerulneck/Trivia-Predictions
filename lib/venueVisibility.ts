// Venue visibility — the single home of "should this venue be in the join list?"
//
// Phase 3 of docs/self-serve-signup-review-fixes-plan.md, which absorbs Phases
// 0–1 of docs/lapsed-venue-rehide-plan.md. Both plans converged on the same
// module because the code that REPAIRS a missed reveal is the code that decides
// a re-hide: one truth table, three questions.
//
// Finding #3 is what forced it. `maybeRevealVenue` in the Stripe webhook fires
// on exactly one event (`isFirstSyncForSubscription`), swallows its error by
// design, and had no repair path — so one transient Supabase blip left a paying
// partner permanently invisible to every player, undetectable: the signup sweep
// skips the row (it has a billing row) and nothing else looks. The fix is a
// reconciler, NOT a louder webhook: making the follower throw would make Stripe
// retry the whole event and re-drive billing sync over a cosmetic failure.
//
// Purity: no Supabase, no Stripe client, no I/O. It imports `classifyBillingRow`
// (lib/billing) and the claim predicates (lib/venueClaim) precisely so the
// live/not-live and placeholder/provenance rules are never re-derived here —
// that second copy is §2's root cause and Findings #1, #2, #9, #10 and #13. The
// `server-only` marker rides in transitively from lib/billing; every consumer
// (the webhook and /api/cron/billing) is server-side, so that costs nothing.
//
// WHAT `hidden` MEANS (do not harden without a separate decision, see
// docs/lapsed-venue-rehide-plan.md §3): hiding is SOFT. It removes the venue
// from `listVenues()` — the join list — and nothing else. Already-joined players
// keep playing, direct venue URLs resolve, and the owner dashboard, billing
// pages and TV screen are unaffected, which is required or a lapsed partner
// could not reach the Resubscribe button that fixes their own problem.

import { classifyBillingRow, type ClassifiableBillingRow } from "@/lib/billing";
import { OFFLINE_BILLING_METHOD } from "@/lib/stripe";
import { isPlaceholderVenueRow, isSelfServeVenueRow } from "@/lib/venueClaim";

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/**
 * Gate on the re-hide / restore jobs (Phase 9). Off (the default) = today's
 * behavior, fully inert: nothing ever hides a venue automatically.
 *
 * Deliberately NOT `NEXT_PUBLIC_*`. Every consumer is server-side (webhook +
 * cron), so this is read at request time and flips WITHOUT a redeploy — unlike
 * `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`, whose build-time inlining is a
 * documented footgun (CLAUDE.md). Do not add the prefix out of habit.
 *
 * The REVEAL-REPAIR job is not behind this flag and must not be put behind it:
 * it only ever un-hides a venue that is self-serve-created AND currently paying,
 * which is exactly what the webhook was already supposed to have done. It is the
 * repair for a bug, not a new behavior.
 */
export const isVenueRehideEnabled = (): boolean => truthy(process.env.VENUE_REHIDE_ENABLED);

/** The `venues` columns the visibility predicates read. */
export type VisibilityVenueRow = {
  id: string;
  hidden: boolean | null;
  latitude: number | null;
  longitude: number | null;
  /** See ClaimableVenueRow — a capability grant, not a timestamp. */
  self_serve_created_at: string | null;
  /**
   * Set when THIS feature hid a row, cleared when it restores one. It is the
   * ONLY thing distinguishing "we hid this because they lapsed" from "an admin
   * hid this on purpose", which is why `shouldRestoreVenue` requires it: we
   * only ever restore what we hid.
   */
  rehidden_at: string | null;
};

/** The `billing_subscriptions` columns the visibility predicates read. */
export type VisibilityBillingRow = ClassifiableBillingRow & {
  billing_method: string | null;
};

/**
 * Is there a subscription that can still bill? `active` and `past_due` both
 * count — a card in dunning is still a paying customer.
 *
 * Exported so callers that need the raw question (picking the live row out of a
 * duplicate pair, say) ask it here rather than re-deriving `status === "active"`,
 * which is the drift `classifyBillingRow` was written to stop.
 */
export const isBillingLive = (billing: VisibilityBillingRow | null | undefined): boolean =>
  billing !== null && billing !== undefined && classifyBillingRow(billing).live;

/**
 * Should this venue be visible right now, given a paid subscription?
 *
 * Used by the daily reconciler in /api/cron/billing to repair a reveal the
 * Stripe webhook missed. Every clause mirrors `maybeRevealVenue`'s UPDATE
 * predicate, plus the placeholder clause the webhook only gained in this phase:
 *
 *   1. billing exists and is live (`active` or `past_due` — a card in dunning is
 *      still a paying customer and must not go dark).
 *   2. the venue is currently hidden. Nothing to do otherwise.
 *   3. it was created by the self-serve flow. LOAD-BEARING: this is what keeps
 *      the job off every admin-hidden venue, including the two Category Blitz
 *      global rooms, which are hidden and stamp-null.
 *   4. it is not a (0, 0) placeholder. Belt to (3)'s braces: even a mis-stamped
 *      internal room can never be published to players.
 */
export const shouldRevealVenue = (
  venue: Pick<VisibilityVenueRow, "hidden" | "latitude" | "longitude" | "self_serve_created_at">,
  billing: VisibilityBillingRow | null | undefined
): boolean =>
  isBillingLive(billing) &&
  venue.hidden === true &&
  isSelfServeVenueRow(venue) &&
  !isPlaceholderVenueRow(venue);

/**
 * The BILLING half of the re-hide decision, on its own: a subscription row that
 * exists, can no longer bill, and is card-billed rather than an offline grant.
 *
 * Split out (behaviour-identical — `shouldRehideVenue` below is still the whole
 * rule) for exactly one caller: `maybeRehideVenue` in the Stripe webhook. That
 * follower never READS the venue row. Like its twin `maybeRevealVenue`, it
 * expresses the venue half of the predicate as SQL filters on the UPDATE itself
 * (`hidden = false`, the `self_serve_created_at` guard, the (0,0) clause), which
 * is what makes it idempotent on a Stripe retry and free of a read/write race.
 * All it has in hand is the mirror row it just wrote — so it asks the billing
 * question here rather than re-deriving `status !== "active"` at the call site,
 * which is the drift this module exists to prevent.
 *
 * A missing row is deliberately NOT lapsed: a venue with no billing row at all
 * is an ops/admin situation, and the signup sweep already owns the
 * abandoned-signup case.
 */
export const isBillingLapsed = (billing: VisibilityBillingRow | null | undefined): boolean =>
  billing !== null &&
  billing !== undefined &&
  !classifyBillingRow(billing).live &&
  billing.billing_method !== null &&
  billing.billing_method !== OFFLINE_BILLING_METHOD;

/**
 * Our billing mirror folds every genuinely-finished Stripe status (`canceled`,
 * `incomplete_expired`, `paused`) AND every expired offline grant into the
 * single local status `"cancelled"`. That is the honest "the money has stopped"
 * signal for the reconciler's REPORT job (lapsed admin-activated venues).
 *
 * It is deliberately a mirror-status read, not a `classifyBillingRow` call:
 * `classifyBillingRow` reports an *active* offline grant as not-live only
 * because it has no Stripe object to check, so `!isBillingLive(row)` would flag
 * every currently-granted offline venue as "lapsed". `status === "cancelled"`
 * does not. It lives here, named and tested next to the other billing
 * predicates, rather than as a bare comparison at the reconciler call site.
 *
 * The automatic hide / restore jobs must NOT use this — they use
 * `isBillingLapsed` / `isBillingLive`, which are `classifyBillingRow`-derived.
 */
export const isBillingCancelled = (
  billing: VisibilityBillingRow | null | undefined
): boolean => billing?.status === "cancelled";

/**
 * Should this venue be hidden because its subscription lapsed? (Phase 9.)
 *
 * Defined here, now, and tested against the full truth table even though nothing
 * calls it yet — the whole point of this module is that reveal, re-hide and
 * restore are ONE truth table. Writing the other two later, elsewhere, is how
 * they drift.
 *
 *   1. billing exists and is NOT live. A missing row is deliberately not a
 *      hide: a venue with no billing row at all is an ops/admin situation, and
 *      the signup sweep already owns the abandoned-signup case.
 *   2. the venue is currently visible.
 *   3. self-serve provenance — same load-bearing clause as the reveal.
 *   4. it is a Stripe-billed row. An expired OFFLINE grant on a self-serve venue
 *      is an ops decision (an admin granted it, an admin re-grants it), so the
 *      reconciler reports it rather than acting on it.
 *
 * NEVER add a `current_period_end < now` comparison here. Stripe's status
 * already encodes both cancel-at-period-end and dunning; re-deriving it is how
 * you hide a partner who is still inside a period they paid for.
 */
export const shouldRehideVenue = (
  venue: Pick<VisibilityVenueRow, "hidden" | "self_serve_created_at">,
  billing: VisibilityBillingRow | null | undefined
): boolean => isBillingLapsed(billing) && venue.hidden === false && isSelfServeVenueRow(venue);

/**
 * Should a venue WE hid come back because billing went live again? (Phase 9.)
 *
 * `rehidden_at !== null` is the whole safety story: an admin who deliberately
 * hides a venue whose billing happens to be live must not have the reconciler
 * fight them. We only ever restore what we hid.
 *
 * NOTE THAT THIS PREDICATE CARRIES NO PROVENANCE OR PLACEHOLDER CLAUSE, BY
 * CONSTRUCTION — "we only restore what we hid" is what stands in for both, and
 * it is only true because every path that WRITES `rehidden_at` refuses a
 * stamp-null venue and refuses a (0, 0) placeholder. `maybeRehideVenue` in the
 * Stripe webhook enforces both as SQL filters on its UPDATE. Any future writer
 * of `rehidden_at` — the Phase 9 cron re-hide job included — MUST do the same,
 * or a mis-stamped internal room becomes restorable and lands in every player's
 * venue list.
 */
export const shouldRestoreVenue = (
  venue: Pick<VisibilityVenueRow, "hidden" | "rehidden_at">,
  billing: VisibilityBillingRow | null | undefined
): boolean =>
  isBillingLive(billing) &&
  venue.hidden === true &&
  typeof venue.rehidden_at === "string" &&
  venue.rehidden_at.trim() !== "";

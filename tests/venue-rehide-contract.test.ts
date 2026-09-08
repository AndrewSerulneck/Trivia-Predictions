import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lapsed Venue Re-Hide — static contract. docs/lapsed-venue-rehide-plan.md
 * Phase 5, sequenced as Phase 9 of docs/self-serve-signup-review-fixes-plan.md.
 *
 * These guards CONSOLIDATE the tripwires that were spread across
 * `tests/lib.venue-visibility.test.ts` and
 * `tests/api.webhooks.stripe.rehide-venue.test.ts` while the feature was being
 * built in pieces. Every failure mode here is "a boundary quietly reopens at a
 * call site" and none is caught by a behavioural test:
 *
 *   - the signup sweep loses its billing exclusion and starts deleting
 *     re-hidden REAL venues seven days later (Risk #1 — the sharpest edge);
 *   - `VENUE_REHIDE_ENABLED` gets read in a second place, or gains a
 *     `NEXT_PUBLIC_` prefix and starts inlining at build time;
 *   - the live/not-live predicate gets re-derived from a bare `status` check
 *     instead of `classifyBillingRow`, so `past_due` slips through again;
 *   - `current_period_end` arithmetic creeps into a visibility path and hides a
 *     partner who is still inside a period they paid for;
 *   - the reveal repair gets put behind the flag, so a paying partner stays
 *     invisible until someone sets an env var;
 *   - an un-hide path forgets to clear `rehidden_at`, leaving a visible venue
 *     marked "we hid this";
 *   - a webhook follower or the cron re-hide loses the `self_serve_created_at` /
 *     (0,0) guard and acts on an admin venue or a Category Blitz global room.
 *
 * Behavioural coverage lives elsewhere and is not duplicated here:
 * `tests/lib.venue-visibility.test.ts` (the truth table),
 * `tests/api.webhooks.stripe.rehide-venue.test.ts` (the webhook follower),
 * `tests/api.cron.billing.rehide.test.ts` (the reconciler jobs),
 * `tests/api.cron.billing.reveal.test.ts` (the reveal repair).
 */

const REPO_ROOT = join(__dirname, "..");

const read = (relPath: string): string => readFileSync(join(REPO_ROOT, relPath), "utf8");

/** Strip comments so a doc block that NAMES a prohibited token never trips a guard. */
const code = (relPath: string): string =>
  read(relPath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The body of one top-level function, comments stripped. */
const fnBody = (source: string, signature: string): string => {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const start = stripped.indexOf(signature);
  expect(start, `expected to find ${signature}`).toBeGreaterThan(-1);
  const next = stripped.indexOf("\nasync function ", start + signature.length);
  const alt = stripped.indexOf("\nfunction ", start + signature.length);
  const end = [next, alt].filter((n) => n > -1).sort((a, b) => a - b)[0] ?? stripped.length;
  return stripped.slice(start, end);
};

const collectSourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...collectSourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
};

const VISIBILITY = "lib/venueVisibility.ts";
const SYNC = "lib/venueVisibilitySync.ts";
const WEBHOOK = "app/api/webhooks/stripe/route.ts";
const SWEEP = "lib/signupSweep.ts";

describe("lapsed venue re-hide — static contract", () => {
  it("keeps the signup sweep's billing exclusion — Risk #1, the sharpest edge", () => {
    // A re-hidden venue is `hidden = true` AND self-serve-stamped: two of the
    // three clauses of `sweepAbandonedSignupVenues`'s DELETE predicate. The only
    // thing between a lapsed customer's real venue and deletion in seven days is
    // the third — that it still has a `billing_subscriptions` row. If that
    // exclusion ever goes, or someone "cleans up" cancelled billing rows, real
    // venues with real history get reaped.
    const sweep = read(SWEEP);
    expect(sweep).toContain('.from("billing_subscriptions")');
    expect(sweep).toContain("paidVenueIds");
    expect(sweep).toContain("!paidVenueIds.has(venue.id)");
  });

  it("never deletes a billing_subscriptions row on cancellation", () => {
    // Same rule from the other side: nothing in the webhook may delete the row
    // that is keeping the sweep off a re-hidden venue.
    expect(read(WEBHOOK)).not.toMatch(/from\("billing_subscriptions"\)\s*\.delete\(/);
  });

  it("reads VENUE_REHIDE_ENABLED in exactly one file, with no NEXT_PUBLIC_ prefix", () => {
    // Comment-stripped: doc blocks in the webhook and the sync module NAME the
    // env var to explain the gate, but only one file may READ it.
    const owners = [...collectSourceFiles("lib"), ...collectSourceFiles("app")].filter((file) =>
      code(file).includes("VENUE_REHIDE_ENABLED")
    );
    expect(owners).toEqual([VISIBILITY]);
    expect(read(VISIBILITY)).toContain("process.env.VENUE_REHIDE_ENABLED");
    expect(read(VISIBILITY)).not.toContain("NEXT_PUBLIC_VENUE_REHIDE");
  });

  it("derives live/not-live only from classifyBillingRow — no bare status check", () => {
    const source = read(VISIBILITY);
    expect(source).toContain('from "@/lib/billing"');
    expect(source).toContain("classifyBillingRow");
    // `active` / `past_due` are `classifyBillingRow`'s to judge. `cancelled` is
    // deliberately allowed here: `isBillingCancelled` is a mirror-status read
    // the report job needs and classifyBillingRow structurally cannot give.
    expect(code(VISIBILITY)).not.toMatch(/status\s*===\s*"(active|past_due)"/);
  });

  it("never compares current_period_end anywhere in a visibility path", () => {
    expect(code(VISIBILITY)).not.toContain("current_period_end");
    expect(code(SYNC)).not.toContain("current_period_end");
    expect(fnBody(read(WEBHOOK), "async function maybeRehideVenue")).not.toContain("current_period_end");
  });

  it("keeps the reveal repair OUT of the flag — a paying partner is never gated on it", () => {
    // The reveal repair fixes a bug (a webhook that dropped a reveal); only
    // re-hide / restore are new behavior. venueVisibilitySync.ts imports the
    // flag helper for the re-hide job now, so the guard is scoped to the reveal
    // function's own body.
    expect(fnBody(read(SYNC), "export async function repairMissedVenueReveals")).not.toContain(
      "isVenueRehideEnabled"
    );
  });

  it("clears rehidden_at on EVERY un-hide in the reconciler", () => {
    // Rule with no exceptions: whatever un-hides a venue clears the stamp, or a
    // visible venue is left marked "we hid this" and the admin badge / restore
    // scan read stale provenance.
    const sync = code(SYNC);
    expect(sync).toContain("rehidden_at: null");
    // No `hidden: false` write that forgets the stamp.
    expect(sync).not.toMatch(/update\(\s*\{\s*hidden:\s*false\s*\}\s*\)/);
  });

  it("re-asserts the provenance and placeholder guards on the re-hide and restore writes", () => {
    // `shouldRestoreVenue` has NO provenance or placeholder clause — "we only
    // restore what we hid" stands in for both, and that is only safe because
    // every WRITER of rehidden_at refused a stamp-null / (0,0) row.
    const sync = code(SYNC);
    const stampGuards = sync.match(/\.not\("self_serve_created_at", "is", null\)/g) ?? [];
    const placeholderGuards = sync.match(/\.or\("latitude\.neq\.0,longitude\.neq\.0"\)/g) ?? [];
    // reveal scan + restore scan + restore write + re-hide scan + re-hide write.
    expect(stampGuards.length).toBeGreaterThanOrEqual(4);
    expect(placeholderGuards.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps both webhook followers guarded on self_serve_created_at", () => {
    const source = read(WEBHOOK);
    for (const signature of ["async function maybeRevealVenue", "async function maybeRehideVenue"]) {
      expect(fnBody(source, signature)).toContain('.not("self_serve_created_at", "is", null)');
    }
  });

  it("hangs maybeRehideVenue off the upsert result, not the raw event", () => {
    // This is what gives it upsertSubscription's stale-subscription-id guard for
    // free — a late/retried event for a replaced subscription never reaches it.
    const source = read(WEBHOOK);
    expect(source).toContain("async function runStateChangeFollowers(result: UpsertResult");
    expect(source).toMatch(/if \(!result\.applied\) return;\s*\n\s*await maybeRehideVenue\(result, sub\);/);
  });

  it("asks lib/venueVisibility for maybeRehideVenue's billing half", () => {
    const body = fnBody(read(WEBHOOK), "async function maybeRehideVenue");
    expect(body).toContain("isBillingLapsed(");
    expect(body).not.toMatch(/status\s*===\s*"(active|past_due|cancelled)"/);
  });

  it("re-hide aborts over cap rather than deferring — hiding is destructive", () => {
    const sync = code(SYNC);
    expect(sync).toContain("REHIDE_MAX_PER_RUN");
    expect(sync).toContain("abortedOverCap");
    expect(sync).toMatch(/candidates\.length > REHIDE_MAX_PER_RUN/);
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 4 of docs/billing-code-review-fixes-plan.md — SlimCD teardown tripwire.
 *
 * SlimCD was the pre-Stripe processor. It was abandoned before launch, never
 * charged a real partner, and has been removed: lib/slimcd.ts, the hosted-page
 * session/return routes, the owner card/subscribe 410 stubs and the cron charge
 * loop are all gone.
 *
 * The review finding this closes: a legacy SlimCD row (token set,
 * stripe_subscription_id null, billing_method='stripe') classified as
 * `no_stripe_object` and could open a Stripe Checkout while the SlimCD cron kept
 * charging it. With no token read anywhere and no cron charge path, that shape
 * cannot exist — but only for as long as nothing reintroduces it. This is a
 * static guard because the failure mode is a *reference reappearing*, which no
 * behavioural test can catch.
 *
 * The DB columns (`slimcd_recurring_token`, `slimcd_ticket`) deliberately
 * survive as dead weight — see supabase/migrations/20260801130000_*.sql — so
 * migrations are excluded from the sweep below.
 */

const REPO_ROOT = join(__dirname, "..");

/** Source trees that must be free of SlimCD references. */
const SCANNED_DIRS = ["app", "lib", "components", "types"];

const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

const collectFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full));
    } else if (/\.(ts|tsx|js|jsx|html)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
};

/**
 * Comments are stripped before scanning: what must not come back is executable
 * code (an import, a column read, a token write). Prose explaining WHY SlimCD is
 * gone — as in lib/stripe.ts's note about the dead columns — is the opposite of
 * a regression and should not fail this test.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("SlimCD teardown", () => {
  it("leaves no SlimCD reference in executable application code", () => {
    const offenders = SCANNED_DIRS.flatMap((dir) => collectFiles(join(REPO_ROOT, dir))).filter(
      (file) => /slimcd/i.test(stripComments(readFileSync(file, "utf8")))
    );

    expect(offenders.map((f) => f.replace(`${REPO_ROOT}/`, ""))).toEqual([]);
  });

  it("keeps the checkout guard keyed on billing_method + Stripe truth only", () => {
    // The bypass the review found was a THIRD classification axis: a stored
    // processor token that no longer matched either dimension. Checkout must
    // decide on exactly two things — is this row offline, and what does Stripe
    // say about its subscription id.
    const source = readFileSync(
      join(REPO_ROOT, "app/api/owner/billing/checkout/route.ts"),
      "utf8"
    );

    const code = stripComments(source);
    expect(code).toContain("OFFLINE_BILLING_METHOD");
    expect(code).toContain("readStripeTruth");
    expect(code).not.toMatch(/recurring_token/i);
  });
});

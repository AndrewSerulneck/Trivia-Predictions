import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OWNER_SHEET_IDS } from "@/lib/ownerSheetParams";

// Multi-venue billing Phase 4 tripwires (docs/multi-venue-volume-billing-plan.md §4.5, Phase 4).

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SHEET_DIR = "components/owner/add-venue";
const sheetFiles = () => readdirSync(join(ROOT, SHEET_DIR)).map((name) => `${SHEET_DIR}/${name}`);

describe("Add a venue — UI contract", () => {
  it("is a URL-mirrored dashboard sheet", () => {
    expect(OWNER_SHEET_IDS).toContain("add-venue");
  });

  it("opens with the native history driver, never router.push", () => {
    const page = stripComments(read("app/owner/dashboard/page.tsx"));
    expect(page).toContain('pushSheet(window.history, window.location, "add-venue")');
    expect(page).not.toMatch(/router\.push\([^)]*sheet=/);
    for (const file of sheetFiles()) expect(stripComments(read(file))).not.toMatch(/router\.(push|replace)\(/);
  });

  it("shows the entry point only through the one availability reader", () => {
    const page = stripComments(read("app/owner/dashboard/page.tsx"));
    expect(page).toContain("isAddVenueAvailable()");
    expect(page).not.toContain("NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED");
    expect(page).not.toContain("isMultiVenueBillingEnabled");
  });

  it("availability needs BOTH the billing flag and the signup flag (it reuses signup's address search and map)", () => {
    const src = stripComments(read("lib/multiVenueBilling.ts"));
    expect(src).toMatch(/isAddVenueAvailable\s*=\s*\(\)\s*:\s*boolean\s*=>\s*isMultiVenueBillingEnabled\(\)\s*&&\s*isSelfServeSignupEnabled\(\)/);
  });

  it("reloads the venue list only AFTER a paid add, through the client helper (first load stays one call)", () => {
    const page = stripComments(read("app/owner/dashboard/page.tsx"));
    expect(page).not.toContain("/api/owner/venues");
    expect(page).toContain("fetchOwnerVenues()");
    expect(page.match(/fetchOwnerVenues\(\)/g)).toHaveLength(1);
    expect(page.indexOf("fetchOwnerVenues()")).toBeGreaterThan(page.indexOf("handleVenueAdded"));
  });

  it("talks to exactly the two add routes", () => {
    const urls = new Set<string>();
    for (const file of sheetFiles()) {
      for (const match of stripComments(read(file)).matchAll(/fetch\(\s*[`"']([^`"'$?]+)/g)) urls.add(match[1]!);
    }
    expect([...urls].sort()).toEqual(["/api/owner/venues/add", "/api/owner/venues/add/quote"]);
  });

  it("makes the idempotency key once per attempt, from newAttemptKey, and never from Math.random", () => {
    const sheet = stripComments(read(`${SHEET_DIR}/AddVenueSheet.tsx`));
    expect(sheet).toContain("attemptKey ?? newAttemptKey()");
    for (const file of [...sheetFiles(), "lib/addVenueFlow.ts"]) expect(stripComments(read(file))).not.toContain("Math.random");
  });

  it("never prices anything: no dollar literals and no price arithmetic in the sheet files", () => {
    for (const file of sheetFiles()) {
      const src = stripComments(read(file));
      expect(src).not.toMatch(/\$\d/);
      expect(src).not.toMatch(/Cents\s*[*/]\s*\d|Cents\s*\*\s*\w+Count/);
    }
  });

  it("only opens Stripe's own page (the URL is checked before it is ever rendered)", () => {
    expect(stripComments(read("lib/addVenueFlow.ts"))).toContain("isStripeHostedUrl");
    const review = stripComments(read(`${SHEET_DIR}/AddVenueReviewStep.tsx`));
    expect(review).toContain('rel="noopener noreferrer"');
  });

  it("uses the shared flow pieces: DiscardGuard, OwnerSheet, WizardFooter, signup's address and map screens", () => {
    const sheet = stripComments(read(`${SHEET_DIR}/AddVenueSheet.tsx`));
    for (const piece of ["useDiscardGuard", "OwnerSheet", "WizardFooter", "AddressStep", "GeofenceStep", "SlideSteps"]) {
      expect(sheet).toContain(piece);
    }
  });

  it("keeps text at or above the 12px floor", () => {
    for (const file of sheetFiles()) expect(read(file)).not.toMatch(/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/);
  });
});

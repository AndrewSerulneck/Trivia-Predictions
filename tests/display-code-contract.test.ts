import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DISPLAY_CODE_ALPHABET,
  DISPLAY_CODE_LENGTH,
  displayCodePath,
  displayShortUrl,
  displayShortUrlLabel,
  normalizeDisplayCode,
  parseDisplayCode,
} from "@/lib/displayCode";
import { marketingUrl } from "@/lib/domainSplit";

// docs/live-trivia-pregame-and-display-cleanup-plan.md Phase 4 — the short display link.
// Partners set up a display ONLY by hightopchallenge.com/tv/<display_code>; there is no pairing.

const read = (path: string) => readFileSync(path, "utf8");
const migrationName = readdirSync("supabase/migrations").find((f) => f.endsWith("_venue_display_code.sql"));
const migration = migrationName ? read(`supabase/migrations/${migrationName}`) : "";

describe("lib/displayCode", () => {
  it("uses Crockford base32 (no I, L, O, U), 4 characters", () => {
    expect(DISPLAY_CODE_ALPHABET).toHaveLength(32);
    expect(DISPLAY_CODE_ALPHABET).not.toMatch(/[ILOU]/);
    expect(DISPLAY_CODE_LENGTH).toBe(4);
  });

  it("normalizes case, spaces and hyphens", () => {
    expect(normalizeDisplayCode(" k7-m2 ")).toBe("K7M2");
    expect(parseDisplayCode("k7m2")).toBe("K7M2");
  });

  it("rejects malformed codes", () => {
    for (const bad of ["", "K7M", "K7M2X", "IL0U", "K7M!", "kom2"]) expect(parseDisplayCode(bad)).toBeNull();
  });

  it("builds the short link on the apex", () => {
    expect(displayCodePath("K7M2")).toBe("/tv/K7M2");
    expect(displayShortUrl("K7M2")).toBe(marketingUrl("/tv/K7M2"));
    expect(displayShortUrlLabel("K7M2")).toMatch(/^[a-z0-9.-]+\/tv\/K7M2$/);
  });
});

describe("venues.display_code migration", () => {
  it("exists", () => {
    expect(migrationName).toBeTruthy();
  });

  it("uses the same alphabet and format as the app", () => {
    expect(migration).toContain(`'${DISPLAY_CODE_ALPHABET}'`);
    expect(migration).toContain("'^[0-9A-HJKMNP-TV-Z]{4}$'");
    for (const ch of DISPLAY_CODE_ALPHABET) expect(parseDisplayCode(`${ch}${ch}${ch}${ch}`)).toBe(`${ch}${ch}${ch}${ch}`);
  });

  it("is unique, filled by a SECURITY INVOKER trigger, backfilled and then NOT NULL", () => {
    expect(migration).toMatch(/create unique index if not exists venues_display_code_key\s+on public\.venues \(display_code\)/);
    expect(migration).not.toMatch(/security definer/i);
    expect(migration.match(/security invoker/g)).toHaveLength(2);
    expect(migration).toMatch(/before insert or update of display_code on public\.venues/);
    expect(migration).toMatch(/update public\.venues\s+set display_code = null\s+where display_code is null;/);
    expect(migration).toMatch(/alter column display_code set not null;/);
  });

  it("keeps the generator server-only", () => {
    expect(migration).toContain(
      "revoke all on function public.generate_venue_display_code() from public, anon, authenticated;",
    );
    expect(migration).toContain("grant execute on function public.generate_venue_display_code() to service_role;");
  });
});

describe("Display page (app/owner/display/page.tsx)", () => {
  const page = read("app/owner/display/page.tsx");

  it("has no pairing and no Manual setup", () => {
    expect(page).not.toMatch(/Link a TV|Manual setup|tv-pair|normalizePairingCode|tvPairing/i);
  });

  it("shows the Display URL with both steps and the Fire Stick steps", () => {
    expect(page).toContain(">Display URL<");
    expect(page).toContain("Step 1: Copy the display URL into your device&apos;s web browser.");
    expect(page).toContain("Step 2: Screen mirror your device with a TV or projector.");
    expect(page).toContain("Amazon Fire Stick");
    expect(page).toContain('{copied ? "Copied" : "Copy"}');
  });

  it("asks for the display codes and copies the short link", () => {
    expect(page).toContain('fetch("/api/owner/venues?with=displayCode")');
    expect(page).toMatch(/displayShortUrl\(displayCode\)/);
  });
});

describe("bare /tv", () => {
  it("redirects to /info (a route, not a page)", async () => {
    const { GET } = await import("@/app/tv/route");
    const res = GET();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(marketingUrl("/info"));
  });

  it("emails point at the Display page, not /tv", () => {
    const sender = read("lib/email/sendVenueAddedEmail.ts");
    expect(sender).toContain('tvSetupUrl: marketingUrl("/owner/display")');
    expect(read("lib/email/partnerEmailCopy.ts")).not.toMatch(/link a TV|Pair the TVs|pairing/i);
  });
});

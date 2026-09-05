import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 7 tripwire for docs/navigation-unification-plan.md — the unified
 * Back / Next / Sign Out system.
 *
 * Phases 0–6 collapsed 10 Back treatments, 2 Next buttons and 5 sign-outs onto
 * five primitives in components/navigation/:
 *   - ExitBackButton  — "leave this screen", the neutral dark slate circle,
 *                        leading slot of the top bar. Replaced the warm
 *                        `.tp-exit-pill` / `.ht-btn-exit` / `--ht-exit-*` pill.
 *   - StepBackButton / NextButton — composed only by WizardFooter.
 *   - WizardFooter    — the one sticky bottom bar for multi-step flows.
 *   - SignOutButton   — the ONLY place `signOut()` / `clearVenueSession()` /
 *                        the three logout endpoints are called. Never a top-bar
 *                        control; lives as the last item of an account menu.
 *
 * These are static guards because every failure mode here is "an old pattern
 * reappears at a call site" — a raw `←` glyph, a hand-inlined warm gradient, a
 * teardown call that bypasses SignOutButton — which no behavioural test catches.
 *
 * Comments are stripped before every scan: prose explaining why the pill is
 * gone (as in ExitBackButton.tsx's header) is the opposite of a regression.
 */

const REPO_ROOT = join(__dirname, "..");

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

const collectFiles = (dir: string, exts: RegExp): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full, exts));
    } else if (exts.test(entry)) {
      out.push(full);
    }
  }
  return out;
};

/** POSIX-style path relative to the repo root, for stable allowlist matching. */
const rel = (file: string): string => relative(REPO_ROOT, file).split(sep).join("/");

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const readStripped = (file: string): string => stripComments(readFileSync(file, "utf8"));

/** Every .ts/.tsx file under app/ and components/. */
const APP_AND_COMPONENT_FILES = [
  ...collectFiles(join(REPO_ROOT, "app"), /\.(ts|tsx)$/),
  ...collectFiles(join(REPO_ROOT, "components"), /\.(ts|tsx)$/),
];

/** The subset that is player-facing — owner + admin surfaces are separate. */
const isPlayerFacing = (file: string): boolean => {
  const r = rel(file);
  return (
    !r.startsWith("app/owner/") &&
    !r.startsWith("app/admin/") &&
    !r.startsWith("components/owner/") &&
    !r.startsWith("components/admin/")
  );
};

describe("navigation controls contract (Phase 7)", () => {
  it("has no raw ← glyph in player-facing TSX", () => {
    // `→` is allowed — it survives in body copy ("Privacy & Security →
    // Location Services", "Set Up PIN →"). The rule is `←`-only, per §6e.
    const offenders = APP_AND_COMPONENT_FILES.filter(
      (file) => file.endsWith(".tsx") && isPlayerFacing(file) && readStripped(file).includes("←")
    ).map(rel);

    expect(offenders, "raw ← reads as Back; use ExitBackButton (Lucide ChevronLeft)").toEqual([]);
  });

  it("has no retired warm exit-pill styling anywhere in app/ or components/", () => {
    // The pill is gone from globals.css and tailwind.config.ts. Nothing may
    // hand-roll it back: not the class names, not the gradient hexes.
    const RETIRED = [
      "tp-exit-pill",
      "ht-btn-exit",
      "ht-exit-", // --ht-exit-* vars and the ht.exit-* Tailwind scale
      "#a93d3a",
      "#c8573e",
      "#e9784e",
    ];
    const offenders = APP_AND_COMPONENT_FILES.filter((file) => {
      const src = readStripped(file);
      return RETIRED.some((needle) => src.includes(needle));
    }).map(rel);

    expect(offenders, "warm exit pill is retired — use ExitBackButton").toEqual([]);
  });

  it("confines signOut() / clearVenueSession() to SignOutButton and its two sanctioned exceptions", () => {
    // §2c–2d / §8f: the teardown lives in SignOutButton. The two allowed
    // exceptions are NOT sign-outs — JoinFlow drops a stale Supabase session
    // mid-login, VenueHubClient's arrival watchdog clears a half-joined venue.
    const ALLOWED = new Set([
      "components/navigation/SignOutButton.tsx",
      "components/join/JoinFlow.tsx",
      "components/venue/VenueHubClient.tsx",
    ]);
    const offenders = APP_AND_COMPONENT_FILES.filter((file) => {
      if (ALLOWED.has(rel(file))) return false;
      const src = readStripped(file);
      return /\bsignOut\s*\(/.test(src) || /\bclearVenueSession\s*\(/.test(src);
    }).map(rel);

    expect(offenders, "route account teardown through SignOutButton, not the call site").toEqual([]);
  });

  it("centralizes the three logout endpoint literals in SignOutButton", () => {
    const ENDPOINTS = ["/api/join/logout", "/api/owner/auth/logout", "/api/admin/logout"];
    const offenders = APP_AND_COMPONENT_FILES.filter((file) => {
      if (rel(file) === "components/navigation/SignOutButton.tsx") return false;
      const src = readStripped(file);
      return ENDPOINTS.some((endpoint) => src.includes(endpoint));
    }).map(rel);

    expect(offenders, "logout endpoints belong in SignOutButton's LOGOUT_ENDPOINT map").toEqual([]);
  });

  it("renders StepBackButton / NextButton only through WizardFooter", () => {
    // Type-only `NavTone` imports from StepBackButton are fine; what must not
    // spread is the rendered primitive. §9f: the footer owns both.
    const offenders = APP_AND_COMPONENT_FILES.filter((file) => {
      if (!file.endsWith(".tsx")) return false;
      if (rel(file) === "components/navigation/WizardFooter.tsx") return false;
      const src = readStripped(file);
      return src.includes("<StepBackButton") || src.includes("<NextButton");
    }).map(rel);

    expect(offenders, "compose step-back + Next via WizardFooter").toEqual([]);
  });

  it("renders SignOutButton only in a sanctioned account-menu / sidebar host", () => {
    // §0: Sign Out is the last item of an account drawer / sidebar footer,
    // never a top-bar or gameplay control. These are its only hosts.
    const SANCTIONED = new Set([
      "components/navigation/AccountMenuList.tsx",
      "components/owner/OwnerAccountMenu.tsx",
      "components/admin/AdminShell.tsx",
      "components/admin/AdminMobileShell.tsx",
      "components/join/JoinFlow.tsx", // the venue-list panel's sign-out (§3, Phase 3)
    ]);
    const offenders = APP_AND_COMPONENT_FILES.filter((file) => {
      if (!file.endsWith(".tsx") || SANCTIONED.has(rel(file))) return false;
      return readStripped(file).includes("<SignOutButton");
    }).map(rel);

    expect(offenders, "SignOutButton belongs in an account menu, not a page").toEqual([]);
  });

  it("keeps the legacy BackButton and its stale twin deleted", () => {
    // Phase 7 removed the warm-pill component and the extensionless, unimportable
    // stale copy of app/trivia/live/page.tsx that still referenced .tp-exit-pill.
    for (const gone of [
      "components/navigation/BackButton.tsx",
      "components/animations/LiveTriviaIntermissionLeaderboardReveal",
    ]) {
      expect(
        () => statSync(join(REPO_ROOT, gone)),
        `${gone} should stay deleted`
      ).toThrow();
    }
  });
});

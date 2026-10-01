import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NON_PLAYER_PATH_PREFIXES, isPlayerRuntimePath } from "@/lib/playerRuntimePaths";

// docs/partner-dashboard-merch-button-loader-speed-plan.md Phase 6, finding F5:
// the root layout used to mount five player-only runtimes statically on EVERY
// route, so /owner/* and /admin downloaded all of it — including the 18 gameplay
// animation components ANIMATION_REGISTRY pulls in — to run none of it.

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** Block and line comments removed, so a documented string is not a reference. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LAYOUT = read("app/layout.tsx");
const RUNTIME = read("components/ui/PlayerRuntime.tsx");
const RUNTIME_CODE = stripComments(RUNTIME);

/** The five runtimes that moved out of the layout. */
const DEFERRED = [
  "AnimationOverlay",
  "GlobalTransitionOverlay",
  "AnalyticsRuntime",
  "PopupAds",
  "MobileAdhesionAd",
] as const;

describe("isPlayerRuntimePath", () => {
  it("is true for player surfaces", () => {
    for (const path of ["/", "/join", "/venue/abc", "/trivia/live", "/bingo", "/pickem", "/info", "/tv"]) {
      expect(isPlayerRuntimePath(path), path).toBe(true);
    }
  });

  it("is false for the partner and admin surfaces", () => {
    for (const path of ["/owner", "/owner/dashboard", "/owner/billing/setup", "/admin", "/admin/anything"]) {
      expect(isPlayerRuntimePath(path), path).toBe(false);
    }
  });

  it("matches on a path SEGMENT, so /ownership is still a player path", () => {
    expect(isPlayerRuntimePath("/ownership")).toBe(true);
    expect(isPlayerRuntimePath("/administrator")).toBe(true);
    expect(isPlayerRuntimePath("/owner-guide")).toBe(true);
  });

  it("FAILS OPEN to the player on an unknown path", () => {
    // A player silently losing their ads, gameplay animations or venue-entry
    // transition is a real regression; a partner mounting five components that
    // already no-op on /owner/* costs only the bytes this change saves.
    expect(isPlayerRuntimePath(null)).toBe(true);
    expect(isPlayerRuntimePath(undefined)).toBe(true);
    expect(isPlayerRuntimePath("")).toBe(true);
  });

  it("pins the non-player prefixes", () => {
    expect([...NON_PLAYER_PATH_PREFIXES]).toEqual(["/owner", "/admin"]);
  });
});

describe("the root layout no longer ships the player runtime", () => {
  it("imports none of the five statically", () => {
    for (const name of DEFERRED) {
      expect(LAYOUT, name).not.toContain(`import { ${name} }`);
    }
  });

  it("mounts PlayerRuntime instead", () => {
    expect(LAYOUT).toContain('import { PlayerRuntime } from "@/components/ui/PlayerRuntime"');
    expect(LAYOUT).toContain("<PlayerRuntime />");
  });

  it("keeps PlayerRuntime inside AnimationTriggerProvider", () => {
    // AnimationOverlay reads that provider through useAnimationOverlayState().
    const provider = LAYOUT.indexOf("<AnimationTriggerProvider>");
    const mount = LAYOUT.indexOf("<PlayerRuntime />");
    const close = LAYOUT.indexOf("</AnimationTriggerProvider>");
    expect(provider).toBeGreaterThan(-1);
    expect(mount).toBeGreaterThan(provider);
    expect(close).toBeGreaterThan(mount);
  });

  it("still wraps everything in AuthSessionProvider", () => {
    // Deliberately NOT deferred — AuthNavigationGuard and LoginStuckStateBreaker
    // both consume its context from this same layout. See the Phase 6 handoff.
    expect(LAYOUT).toContain("<AuthSessionProvider>");
  });
});

describe("PlayerRuntime loads each runtime in its own chunk", () => {
  it("loads all five through next/dynamic", () => {
    expect(RUNTIME).toContain('import dynamic from "next/dynamic"');
    for (const name of DEFERRED) {
      expect(RUNTIME, name).toMatch(new RegExp(`const ${name} = dynamic\\(`));
    }
  });

  it("uses ssr: false for every one of them", () => {
    // All five render null on the server today, so nothing leaves the markup.
    const dynamicCalls = RUNTIME_CODE.match(/dynamic\(/g) ?? [];
    const ssrFalse = RUNTIME_CODE.match(/ssr: false/g) ?? [];
    expect(dynamicCalls.length).toBe(DEFERRED.length);
    expect(ssrFalse.length).toBe(DEFERRED.length);
  });

  it("gates on the shared predicate, never a hand-rolled prefix check", () => {
    expect(RUNTIME).toContain('import { isPlayerRuntimePath } from "@/lib/playerRuntimePaths"');
    expect(RUNTIME).toContain("if (!isPlayerRuntimePath(pathname))");
    expect(RUNTIME_CODE).not.toContain('startsWith("/owner');
    expect(RUNTIME_CODE).not.toContain('startsWith("/admin');
  });
});

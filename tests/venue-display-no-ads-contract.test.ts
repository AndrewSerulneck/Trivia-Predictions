import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isVenueDisplayPath } from "@/lib/playerRuntimePaths";

// docs/live-trivia-pregame-and-display-cleanup-plan.md Phase 1 (D3, D11):
// no ads of any kind on the venue display.

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(ROOT, rel)).isDirectory() ? files(rel) : /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });

describe("isVenueDisplayPath", () => {
  it("matches the display and /tv paths", () => {
    for (const p of ["/venue/x/screen", "/venue/x/screen/y", "/tv", "/tv/K7M2"]) {
      expect(isVenueDisplayPath(p), p).toBe(true);
    }
  });

  it("does not match player paths", () => {
    for (const p of ["/venue/x", "/venue/x/screens", "/tvx", "/", null, undefined, ""]) {
      expect(isVenueDisplayPath(p), String(p)).toBe(false);
    }
  });
});

describe("ad components bail on display paths", () => {
  it("PopupAds resolves no page key", () => {
    const src = read("components/ui/PopupAds.tsx");
    expect(src).toContain('import { isVenueDisplayPath } from "@/lib/playerRuntimePaths"');
    expect(src).toMatch(/function resolvePageKey[^{]*\{\s*(\/\/[^\n]*\n\s*)?if \(isVenueDisplayPath\(pathname\)\) \{\s*return null;/);
  });

  it("MobileAdhesionAd treats display paths as excluded", () => {
    const src = read("components/ui/MobileAdhesionAd.tsx");
    expect(src).toContain('import { isVenueDisplayPath } from "@/lib/playerRuntimePaths"');
    expect(src).toMatch(/function isAdExcludedRoute[\s\S]*?isVenueDisplayPath\(pathname\)/);
  });
});

describe("display code never touches ads", () => {
  it("nothing under components/venue-screen or the screen route references ads", () => {
    const all = [...files("components/venue-screen"), ...files("app/venue/[venueId]/screen")];
    expect(all.length).toBeGreaterThan(0);
    for (const f of all) {
      const src = read(f);
      expect(src, f).not.toMatch(/@\/lib\/ads|PopupAds|MobileAdhesionAd|\/api\/ads\//);
    }
  });
});

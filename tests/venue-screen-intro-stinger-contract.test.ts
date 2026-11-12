import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  STINGER_COIN_COUNT,
  STINGER_HARD_STOP_MS,
  STINGER_SPARK_COUNT,
  STINGER_TWINKLE_COUNT,
  T_REVEAL_END,
  T_TAG,
  isIntroDisabled,
  stageAlpha,
  stingerParticles,
  taglineAlpha,
  withIntroDisabled,
} from "@/components/venue-screen/stingerTimeline";

// Contract for docs/venue-display-hype-and-intro-stinger-plan.md §8 (Standing rules).

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("intro stinger timeline", () => {
  it("never shows the tagline before 2.15 s (Andrew, 2026-10-26)", () => {
    expect(T_TAG).toBe(2.15);
    for (let t = -0.5; t < T_TAG; t += 0.005) expect(taglineAlpha(t)).toBe(0);
    expect(taglineAlpha(T_TAG + 0.6)).toBeGreaterThan(0.95);
  });

  it("ends with the stage gone, inside the hard stop", () => {
    expect(stageAlpha(0)).toBe(1);
    expect(stageAlpha(3.3)).toBe(1);
    expect(stageAlpha(T_REVEAL_END)).toBe(0);
    expect(taglineAlpha(T_REVEAL_END)).toBe(0);
    expect(T_REVEAL_END * 1000).toBeLessThan(STINGER_HARD_STOP_MS);
  });

  it("keeps the ad's deterministic particles", () => {
    const a = stingerParticles(1000);
    const b = stingerParticles(1000);
    expect(a).toEqual(b);
    expect(a.coins).toHaveLength(STINGER_COIN_COUNT);
    expect(a.sparks).toHaveLength(STINGER_SPARK_COUNT);
    expect(a.twinkles).toHaveLength(STINGER_TWINKLE_COUNT);
  });
});

describe("intro=0 skip", () => {
  it("only the exact value 0 disables the intro", () => {
    expect(isIntroDisabled("0")).toBe(true);
    expect(isIntroDisabled(["0"])).toBe(true);
    expect(isIntroDisabled(undefined)).toBe(false);
    expect(isIntroDisabled("1")).toBe(false);
  });

  it("appends intro=0 to the thumbnail URL", () => {
    expect(withIntroDisabled("https://play.example.com/venue/v1/screen")).toBe(
      "https://play.example.com/venue/v1/screen?intro=0",
    );
    expect(withIntroDisabled("/venue/v1/screen?mode=idle")).toBe("/venue/v1/screen?mode=idle&intro=0");
    expect(withIntroDisabled("")).toBe("");
  });
});

describe("wiring", () => {
  it("the screen page passes intro from the query", () => {
    const page = read("app/venue/[venueId]/screen/page.tsx");
    expect(page).toMatch(/intro=\{!isIntroDisabled\(resolvedSearchParams\.intro\)\}/);
  });

  it("VenueScreenClient mounts the stinger by default and queues the go-live takeover behind it", () => {
    const client = read("components/venue-screen/VenueScreenClient.tsx");
    expect(client).toMatch(/intro = true/);
    expect(client).toMatch(/useState\(intro\)/);
    expect(client).toMatch(/introPlaying \? <TvIntroStinger/);
    expect(client).toMatch(/liveTakeover && !introPlaying/);
  });

  it("the dashboard thumbnail skips the stinger and Expand does not", () => {
    const display = read("app/owner/display/page.tsx");
    const preview = display.slice(display.indexOf("function ScaledPreview"));
    const expander = display.slice(display.indexOf("function FullscreenExpander"), display.indexOf("function ScaledPreview"));
    expect(preview).toMatch(/withIntroDisabled\(url\)/);
    expect(preview).toMatch(/src=\{previewUrl\}/);
    expect(expander).not.toMatch(/withIntroDisabled/);
    expect(expander).toMatch(/src=\{url\}/);
  });

  it("the stinger fails open and draws no per-frame shadowBlur", () => {
    const stinger = read("components/venue-screen/TvIntroStinger.tsx");
    expect(stinger).toMatch(/setTimeout\(finish, STINGER_HARD_STOP_MS\)/);
    expect(stinger).toMatch(/STINGER_LOGO_TIMEOUT_MS/);
    // shadowBlur appears only inside the one-time sprite builders.
    const frameCode = stinger.slice(stinger.indexOf("const drawSprite"), stinger.indexOf("export function TvIntroStinger"));
    expect(frameCode).not.toMatch(/shadowBlur/);
  });

  it("ships the logo and keep-awake assets under immutable /brand/web names", () => {
    expect(statSync(path.join(root, "public/brand/web/htc-logo-1254.webp")).size).toBeGreaterThan(0);
    expect(statSync(path.join(root, "public/brand/web/keep-awake-v1.mp4")).size).toBeLessThan(10_000);
  });
});

describe("stinger sound", () => {
  it("plays once at animation start, never throws or prompts when autoplay is blocked", () => {
    const stinger = read("components/venue-screen/TvIntroStinger.tsx");
    expect(stinger).toMatch(/makeAudio\(STINGER_SOUND_SRC\)/);
    expect(stinger).toMatch(/\.catch\(\(\) => undefined\)/);
    expect(stinger).toMatch(/playStingerSound\(audio\)/);
    expect(stinger).toMatch(/clip\?\.pause\(\)/);
  });

  it("plays the shine sound when the tagline starts (T_TAG), not before", () => {
    const stinger = read("components/venue-screen/TvIntroStinger.tsx");
    expect(stinger).toMatch(/t >= T_TAG\)\s*\{\s*shinePlayed = true;\s*playStingerSound\(shine\)/);
  });

  it("ships small AAC files under immutable /brand/web names", () => {
    const stinger = read("components/venue-screen/TvIntroStinger.tsx");
    for (const name of ["STINGER_SOUND_SRC", "STINGER_SHINE_SRC"]) {
      const src = stinger.match(new RegExp(name + ' = "\\/brand\\/web\\/([^"]+\\.m4a)"'));
      expect(src).not.toBeNull();
      expect(statSync(path.join(root, "public/brand/web", src![1])).size).toBeLessThan(60_000);
    }
  });

  it("the Expand iframe delegates autoplay; the thumbnail never plays the stinger", () => {
    const page = read("app/owner/display/page.tsx");
    expect(page).toMatch(/title="Venue display full screen"\s+allow="autoplay; fullscreen"/);
  });
});

describe("keep the TV awake", () => {
  it("the display and the /tv pairing screen both hold the screen on", () => {
    expect(read("components/venue-screen/VenueScreenClient.tsx")).toMatch(/useKeepScreenAwake\(\)/);
    expect(read("app/tv/page.tsx")).toMatch(/useKeepScreenAwake\(\)/);
  });

  it("uses the Wake Lock API with a muted looping video fallback, and skips embedded previews", () => {
    const hook = read("lib/useKeepScreenAwake.ts");
    expect(hook).toMatch(/request\("screen"\)/);
    expect(hook).toMatch(/visibilitychange/);
    expect(hook).toMatch(/video\.muted = true/);
    expect(hook).toMatch(/video\.loop = true/);
    expect(hook).toMatch(/window\.self !== window\.top/);
  });
});

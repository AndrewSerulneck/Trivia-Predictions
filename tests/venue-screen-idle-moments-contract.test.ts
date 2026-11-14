import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Plan §4 Phase 4 (docs/venue-display-hype-and-intro-stinger-plan.md): idle screen calm + periodic bursts.
const idle = readFileSync("components/venue-screen/TvIdleAttract.tsx", "utf8");
const wrapper = readFileSync("components/venue-screen/IdleVenueScreen.tsx", "utf8");

describe("idle screen moments", () => {
  it("fires the burst once per 75 s wall-clock slot, never for the slot present at load", () => {
    expect(idle).toContain("IDLE_MOMENT_MS = 75_000");
    expect(idle).toContain("Math.floor(nowMs / IDLE_MOMENT_MS)");
    expect(idle).toMatch(/fx\.burst\(\{ key: `idle:\$\{momentKey\}`/);
    expect(idle).toContain("if (momentKey === firstMomentKey) return;");
  });

  it("shines the wordmark on the same wall-clock slot and fades only under reduced motion", () => {
    expect(idle).toMatch(/<ShineSweep periodMs=\{IDLE_MOMENT_MS\} delayMs=\{0\}/);
    expect(idle).toContain("reduceMotion && momentKey !== firstMomentKey");
  });

  it("anchors the burst on the wordmark, never the QR", () => {
    expect(idle).toContain("at: wordmarkRef.current");
    expect(idle).not.toContain("cardRef");
  });

  it("is a still QR with motion only around it, and no game card (Andrew 2026-11-14)", () => {
    expect(idle).toContain("<AppDownloadQr");
    expect(idle).toContain('data-testid="idle-qr-halo"');
    expect(idle).toContain('data-testid="idle-qr-ring"');
    expect(idle).not.toContain("GAME_TILE_THEMES");
    expect(idle).not.toContain("Category Blitz");
    expect(wrapper).not.toContain("category-blitz");
    expect(wrapper).not.toContain('gameKey: "');
    const qr = readFileSync("components/venue-screen/AppDownloadQr.tsx", "utf8");
    expect(qr).not.toMatch(/framer-motion|motion\.|animate=|transition=|transform:/);
  });

  it("renders the same markup under reduced motion (no hydration mismatch)", () => {
    expect(idle).not.toContain("!reduceMotion &&");
    expect(idle).toContain("reduceMotion ? undefined :");
    // Device-time text only after hydration.
    expect(idle).toContain("hydrated ? formatNextLiveTriviaLine");
  });

  it("keeps the wall-clock drift", () => {
    expect(idle).toContain("DRIFT_X_MS = 227_000");
    expect(idle).toContain("DRIFT_Y_MS = 149_000");
  });
});

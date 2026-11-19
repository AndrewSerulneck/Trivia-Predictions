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

  it("takes game colours and vector art from GAME_TILE_THEMES, keeping the label as is", () => {
    expect(idle).toContain("GAME_TILE_THEMES[game.gameKey]");
    expect(idle).toContain("theme.surfaceClass");
    expect(idle).toContain("{game.label}");
    expect(wrapper).toContain('gameKey: "live_trivia"');
    expect(wrapper).toContain('gameKey: "category-blitz"');
  });

  it("flips digits under an hour and beats under five minutes, with no new words", () => {
    expect(idle).toContain("IDLE_FLIP_UNDER_S = 3_600");
    expect(idle).toContain("IDLE_HEARTBEAT_UNDER_S = 300");
    expect(idle).toContain("rotateX");
    expect(idle).toContain('data-testid="idle-heartbeat"');
  });

  it("renders the same markup under reduced motion (no hydration mismatch)", () => {
    expect(idle).not.toContain("!reduceMotion && remaining");
    expect(idle).not.toContain("heartbeat && !reduceMotion");
    expect(idle).toContain("flip={!reduceMotion}");
  });

  it("keeps the wall-clock drift and rotation", () => {
    expect(idle).toContain("DRIFT_X_MS = 227_000");
    expect(idle).toContain("DRIFT_Y_MS = 149_000");
    expect(idle).toContain("Math.floor(nowMs / (rotateSeconds * 1000))");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFxEngine } from "@/components/venue-screen/fx/fxEngine";
import { NOOP_FX } from "@/components/venue-screen/fx/useFx";

// Plan §4 Phase 5 (docs/venue-display-hype-and-intro-stinger-plan.md): game moments, each keyed on a stable
// identity so it fires once per page load and never for what was already on screen at load.
const read = (file: string) => readFileSync(`components/venue-screen/${file}`, "utf8");

describe("moment gate (engine)", () => {
  it("claims CSS moments through the same gate as canvas effects", () => {
    const engine = createFxEngine();
    expect(engine.claim("g:1")).toBe("swallow");
    expect(engine.claim("g:1")).toBe("duplicate");
    engine.arm();
    expect(engine.claim("g:2")).toBe("play");
    expect(engine.claim("g:2")).toBe("duplicate");
    expect(engine.fire("g:2", () => ({ duration: 1, frame: () => [] }))).toBe("duplicate");
  });

  it("remembers a value per scope and returns the previous one", () => {
    const engine = createFxEngine();
    expect(engine.remember("leader:g", "ann")).toBeUndefined();
    expect(engine.remember("leader:g", "bob")).toBe("ann");
    expect(engine.remember("leader:h", "cy")).toBeUndefined();
  });

  it("is inert outside a provider", () => {
    expect(NOOP_FX.moment("x")).toBe("swallow");
    expect(NOOP_FX.remember("s", "v")).toBeUndefined();
  });
});

describe("question appears", () => {
  const q = read("TvQuestionReveal.tsx");
  it("streaks once per game round and breathes the edge in the last 5 s", () => {
    expect(q).toContain("useFxMoment(gameId ? `${gameId}:${roundNumber}` : null)");
    expect(q).toContain("<LightStreak");
    expect(q).toContain("live > 0 && live <= 5 ? <EdgeGlow");
    expect(q).toContain("critical ? { scale: [1, 1.06, 1, 1.035, 1] }");
  });
  it("gets the game id from the screen wrapper", () => {
    expect(read("LiveTriviaScreen.tsx")).toContain("gameId={live.gameId}");
  });
});

describe("correct answer", () => {
  const a = read("TvAnswerReveal.tsx");
  it("fires a shockwave + sparks and one shine, keyed gameId:round:reveal", () => {
    expect(a).toContain("useFxMoment(gameId ? `${gameId}:${roundNumber}:reveal` : null)");
    expect(a).toMatch(/fx\.burst\(\{[\s\S]*?shockwave: true/);
    expect(a).toContain("<OneShotShine");
    expect(read("LiveTriviaRevealScreen.tsx")).toContain("gameId={live.gameId}");
  });
  it("never reads or renders the answer before the reveal gate (payload unchanged)", () => {
    expect(readFileSync("lib/venueScreen.ts", "utf8")).toContain('const correctAnswer = phase === "reveal"');
  });
});

describe("round leaderboard", () => {
  const r = read("TvRoundBreak.tsx");
  it("pops coins only when the leader changed since the last break the page saw", () => {
    expect(r).toContain("fx.remember(`leader:${gameId}`, leaderId)");
    expect(r).toContain("previous === undefined || previous === leaderId");
    expect(r).toContain("`${gameId}:${roundNumber}:first:${leaderId}`");
    expect(read("LiveTriviaIntermissionScreen.tsx")).toContain("gameId={live.gameId}");
  });
});

describe("final standings", () => {
  const f = read("TvFinalStandings.tsx");
  it("runs the coin explosion and a confetti shower once per game through the engine", () => {
    expect(f).toContain("useFxMoment(`${revealKey}:final`)");
    expect(f).toContain("fx.shower(");
    expect(f).toContain("fx.burst(");
    expect(f).toContain("colors: CONFETTI_COLORS");
  });
  it("no longer animates 72 confetti DOM nodes", () => {
    expect(f).not.toContain("confetti.map");
    expect(f).not.toContain("mulberry32");
  });
});

describe("letter slam", () => {
  const l = read("TvLetterReveal.tsx");
  it("rings and sparks only for a claimed round moment (not on reload)", () => {
    expect(l).toContain("useFxMoment(roundId != null ? String(roundId) : null)");
    expect(l).toContain("slam && !reduceMotion");
    expect(l).toContain("fx.burst({ key: `${roundId}:burst`");
    expect(l).not.toContain("spoke-");
  });
  it("breathes the edge and beats the ring in the last 5 s", () => {
    expect(l).toContain("live > 0 && live <= 5 ? <EdgeGlow");
    expect(l).toContain("critical ? { scale: [1, 1.06, 1, 1.035, 1] }");
  });
});

describe("blitz results", () => {
  const b = read("TvBlitzResults.tsx");
  it("shines and bursts at the winner row once per round, keyed roundId:results", () => {
    expect(b).toContain('phase === "results" && roundId != null ? `${roundId}:results` : null');
    expect(b).toContain("<OneShotShine");
    expect(b).toContain("ref={i === 0 ? winnerRowRef : undefined}");
    expect(read("CategoryBlitzIntermissionScreen.tsx")).toContain("roundId={blitz.roundId ?? undefined}");
  });
});

describe("go-live", () => {
  const g = read("TvGoLiveTakeover.tsx");
  it("bursts in the game's colours, no tagline, same 1.85 s length", () => {
    expect(g).toContain("useFxMoment(momentKey !== undefined ? `golive:${momentKey}` : null)");
    expect(g).toContain("SPARKS[gameLabel]");
    expect(g).toContain("const TOTAL = 1.85");
    expect(g).not.toMatch(/GAME TIME/i);
    expect(read("VenueScreenClient.tsx")).toContain("momentKey={liveTakeover.key}");
  });
});

describe("moment overlays", () => {
  const o = read("fx/MomentOverlays.tsx");
  it("animate transform and opacity only, with reduced-motion versions", () => {
    expect(o).not.toMatch(/filter|boxShadow|shadowBlur|blur\(/);
    expect(o).toContain("useReducedMotion");
    expect(o.match(/if \(reduceMotion\) return null/g)?.length).toBe(2);
  });
});

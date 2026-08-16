// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type {
  CategoryBlitzRound,
  CategoryBlitzRoundResults,
  CategoryBlitzSession,
} from "@/types";

/**
 * Guards the round-boundary kick (see the KICK_* constants and the kick effect
 * in lib/categoryBlitzRealtime.ts). The kick is what removes the multi-second
 * "Loading categories…" wait at the end of an intermission: every client asks
 * the server for the next round at T=0 rather than waiting out the 15s poll.
 *
 * Two things are pinned here:
 *
 * 1. The jitter math. The window has to satisfy two things at once that pull in
 *    opposite directions — a solo player must not be made to wait, and a full
 *    (or pooled, under NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM) venue must not
 *    stampede one session row. Scaling the window with the player count is what
 *    reconciles them; these tests pin that property rather than the constants.
 *
 * 2. WHICH round's boundary a given kick is armed against. This is the part
 *    that broke: the kick used to read `currentRoundIdRef.current` at effect
 *    time, but that ref can already have advanced to the NEXT round while the
 *    zeroed countdown still belongs to the previous one — the deferred-round
 *    effect is declared first, so it mutates the ref earlier in the same flush.
 *    The countdown now carries its own round id, so the two can't disagree.
 */

// The hook's realtime subscription is dormant without a client; every transition
// exercised below arrives through the fetch paths (poll, kick, /score) instead,
// which is also the solo-player reality this feature exists for.
vi.mock("@/lib/supabase", () => ({ supabase: null }));

const { kickJitterMs, useCategoryBlitzSession } = await import("@/lib/categoryBlitzRealtime");

afterEach(() => {
  vi.restoreAllMocks();
});

/** Force Math.random to a fixed point in [0,1) so the window is observable. */
const withRandom = (value: number): void => {
  vi.spyOn(Math, "random").mockReturnValue(value);
};

describe("kickJitterMs", () => {
  it("keeps a solo player's delay negligible", () => {
    withRandom(0.999);
    // Worst-case draw for one player is still far below a perceptible wait.
    expect(kickJitterMs(1)).toBeLessThan(250);
  });

  it("widens the window as the venue fills, to spread the herd", () => {
    withRandom(0.999);
    const solo = kickJitterMs(1);
    const busy = kickJitterMs(20);
    expect(busy).toBeGreaterThan(solo);
  });

  it("caps the window so a pooled global room can't push the kick far out", () => {
    withRandom(0.999);
    // 500 concurrent players (global-room pooling) must not mean a 100s delay.
    expect(kickJitterMs(500)).toBeLessThanOrEqual(3_000);
  });

  it("keeps the EXPECTED time-to-first-kick near-constant as players scale", () => {
    // The point of scaling the window with N: with N clients drawing uniformly
    // from [0, k·N], the earliest draw lands at ~k regardless of N. That's what
    // makes the round appear just as fast in a busy venue as a quiet one, even
    // though any individual client's own draw got later.
    const earliestOf = (players: number): number => {
      let earliest = Infinity;
      for (let i = 0; i < players; i += 1) {
        // Deterministic spread standing in for N independent uniform draws.
        withRandom((i + 0.5) / players);
        earliest = Math.min(earliest, kickJitterMs(players));
      }
      return earliest;
    };

    // Across two orders of magnitude the first kick still lands promptly.
    expect(earliestOf(1)).toBeLessThan(250);
    expect(earliestOf(10)).toBeLessThan(250);
    expect(earliestOf(100)).toBeLessThan(250);
  });

  it("treats a missing/zero player count as a single player", () => {
    withRandom(0.5);
    expect(kickJitterMs(0)).toBe(kickJitterMs(1));
    expect(kickJitterMs(-5)).toBe(kickJitterMs(1));
  });
});

// ── Boundary anchoring ────────────────────────────────────────────────────────

const T0 = new Date("2026-08-16T20:00:00.000Z").getTime();
/** Continuous-mode pacing for the fake venue, in seconds. Deliberately far
 *  shorter than the 15s fallback poll so a whole round + intermission fits
 *  between two polls and every assertion window below is poll-free. */
const ROUND_SECONDS = 6;
const INTERMISSION_SECONDS = 4;
/** Math.random is pinned at 0.5, so a 1-player venue's jitter is exactly this. */
const JITTER_MS = 100;

const at = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString();

const makeRound = (
  id: string,
  startedAtOffsetMs: number,
  overrides: Partial<CategoryBlitzRound> = {},
): CategoryBlitzRound => ({
  id,
  sessionId: "sess-1",
  venueId: "venue-1",
  letter: "S",
  categorySetIndex: 0,
  categories: ["A breakfast food"],
  startedAt: at(startedAtOffsetMs),
  endsAt: at(startedAtOffsetMs + ROUND_SECONDS * 1_000),
  status: "active",
  createdAt: at(startedAtOffsetMs),
  scoredAt: null,
  mode: "standard",
  ...overrides,
});

const SESSION: CategoryBlitzSession = {
  id: "sess-1",
  venueId: "venue-1",
  status: "active",
  source: "auto",
  sessionType: "continuous",
  scheduledEndAt: null,
  startsAt: null,
  testMode: false,
  createdAt: at(0),
  completedAt: null,
  playerCount: 1,
  roundDurationSeconds: ROUND_SECONDS,
  intermissionSeconds: INTERMISSION_SECONDS,
};

const makeResults = (roundId: string): CategoryBlitzRoundResults => ({
  roundId,
  letter: "S",
  mode: "standard",
  categories: ["A breakfast food"],
  results: [],
  playerCount: 1,
  totals: [],
});

describe("round-boundary kick anchoring", () => {
  /** Mutable stand-in for server state; tests advance it as the server would. */
  let server: { round: CategoryBlitzRound; scoreOk: boolean };
  /** Epoch-ms of every GET /api/category-blitz/sessions (poll OR kick). */
  let sessionFetchTimes: number[];

  const jsonResponse = (body: unknown): Response =>
    ({ status: 200, json: async () => body }) as unknown as Response;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    withRandom(0.5);
    // The hook's dev-only tracing would otherwise print hundreds of lines per test.
    vi.spyOn(console, "debug").mockImplementation(() => {});

    server = { round: makeRound("r1", 0), scoreOk: true };
    sessionFetchTimes = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url.includes("/score")) {
          if (server.scoreOk) {
            // Mirror the server: scoring marks the round complete, anchored on
            // the round's own end so the post-scoring anchor lands where the
            // pre-scoring estimate did.
            server.round = { ...server.round, status: "complete", scoredAt: server.round.endsAt };
            return jsonResponse({ ok: true, results: makeResults(server.round.id) });
          }
          // The <3-player scoring gate — the round stays unscored.
          return jsonResponse({ ok: false, error: "insufficient_players" });
        }
        if (url.includes("/current-round")) {
          return jsonResponse({ ok: true, round: server.round });
        }
        if (url.includes("/results")) {
          return jsonResponse({ ok: true, results: makeResults(server.round.id) });
        }
        sessionFetchTimes.push(Date.now());
        return jsonResponse({ ok: true, session: SESSION, realtimeChannel: "chan-1" });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** Drain pending promise chains without moving the clock. */
  const flush = async (): Promise<void> => {
    await act(async () => {
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
  };

  /** Advance fake time to `offsetMs` after T0, running timers and microtasks. */
  const advanceTo = async (offsetMs: number): Promise<void> => {
    const delta = T0 + offsetMs - Date.now();
    if (delta < 0) throw new Error(`advanceTo(${offsetMs}) would move time backwards`);
    await act(async () => { await vi.advanceTimersByTimeAsync(delta); });
    await flush();
  };

  const mount = async () => {
    const rendered = renderHook(() => useCategoryBlitzSession("venue-1", "user-1"));
    await flush();
    return rendered;
  };

  /** Sessions fetches that landed strictly inside (from, to] — the assertion
   *  windows are chosen to contain no 15s poll boundary, so any hit is a kick. */
  const kicksBetween = (fromOffsetMs: number, toOffsetMs: number): number =>
    sessionFetchTimes.filter((t) => t - T0 > fromOffsetMs && t - T0 <= toOffsetMs).length;

  it("arms against the round that just ENDED when a cascade outlasts the intermission", async () => {
    const { result } = await mount();
    expect(result.current.phase).toBe("answering");

    // The round-start reveal finishes, unblocking the scoring gate.
    act(() => { result.current.markRevealDone("r1"); });

    // Round ends at +6s; the submission grace defers scoring to +8s.
    await advanceTo(8_000);
    expect(result.current.phase).toBe("reveal");

    // The grading cascade is deliberately NOT completed — this is the case the
    // bug needed: a cascade still playing when the intermission runs out.
    // R1's next-round anchor is startedAt + 6s + 4s = +10s.
    await advanceTo(10_000);
    expect(result.current.nextRoundStartsIn).toBe(0);

    // The kick fires (jitter 100ms) and the server hands back the next round.
    server.round = makeRound("r2", 10_000);
    await advanceTo(10_000 + JITTER_MS + 50);
    expect(kicksBetween(10_000, 10_500)).toBe(1);
    // R2 is held back by applyRound's exit guard rather than cutting the
    // cascade short, so this tab is still showing R1's reveal.
    expect(result.current.phase).toBe("reveal");
    expect(result.current.round?.id).toBe("r1");

    // Now the cascade finishes. In the same flush the deferred-round effect
    // advances currentRoundIdRef to R2 BEFORE the kick effect re-runs on the
    // still-zeroed countdown — the exact ordering that used to arm a second
    // ladder against R2 and fire four loadSession calls into R2's answering
    // phase. Nothing may be kicked here: R1's ladder self-terminates (its
    // round is gone) and R2's boundary is still 10s away.
    act(() => { result.current.markResultsRevealDone("r1"); });
    await flush();
    expect(result.current.round?.id).toBe("r2");
    expect(result.current.phase).toBe("answering");

    // Covers both the mis-armed ladder's jitter (100ms) and R1's next rung
    // (+1.2s from its last fire at 10.1s → 11.3s), which must no-op.
    await advanceTo(12_000);
    expect(kicksBetween(10_500, 12_000)).toBe(0);
  });

  it("still arms a fresh ladder at the NEXT round's own boundary", async () => {
    const { result } = await mount();

    act(() => { result.current.markRevealDone("r1"); });
    await advanceTo(8_000);
    await advanceTo(10_000);
    server.round = makeRound("r2", 10_000);
    await advanceTo(10_500);
    act(() => { result.current.markResultsRevealDone("r1"); });
    await flush();
    expect(result.current.round?.id).toBe("r2");

    // R2 plays out normally: ends at +16s, scored at +18s, cascade done at
    // +18.5s, next-round anchor at 10s + 6s + 4s = +20s.
    act(() => { result.current.markRevealDone("r2"); });
    await advanceTo(18_000);
    expect(result.current.phase).toBe("reveal");
    act(() => { result.current.markResultsRevealDone("r2"); });
    await flush();
    expect(result.current.phase).toBe("results");

    const before = sessionFetchTimes.length;
    await advanceTo(20_000);
    expect(result.current.nextRoundStartsIn).toBe(0);
    expect(sessionFetchTimes.length).toBe(before);  // nothing fires before the boundary

    server.round = makeRound("r3", 20_000);
    await advanceTo(20_000 + JITTER_MS + 50);
    // R1's cascade must not have burned R2's arming.
    expect(kicksBetween(20_000, 20_500)).toBe(1);
  });

  it("does not burn the arming on an unscored round's pre-scoring anchor", async () => {
    // The min-player gate: /score keeps returning ok:false, so the round is
    // still unscored when its startedAt-based estimate (+10s) runs out. That
    // estimate is not the real boundary — once the server does score the round
    // the anchor becomes scoredAt + intermission — so nothing may be armed
    // against it.
    server.scoreOk = false;

    const { result } = await mount();
    act(() => { result.current.markRevealDone("r1"); });

    await advanceTo(8_000);
    // The /score POST is refused, so this tab sits in "scoring" and retries.
    expect(result.current.phase).toBe("scoring");

    await advanceTo(11_000);
    expect(result.current.phase).toBe("scoring");
    expect(result.current.nextRoundStartsIn).toBe(0);
    // The pre-scoring estimate has expired. Arming here would burn the round's
    // one arming against an anchor the server is about to move.
    await advanceTo(11_500);
    expect(kicksBetween(10_000, 11_500)).toBe(0);

    // The engine finally scores it at +12s; this tab resyncs at +12.6s and the
    // anchor becomes scoredAt + intermission = +16s. (Dispatched in its own act
    // so the resync lands with no timer tick interleaved, the way a real
    // foreground regain does.)
    server.round = { ...server.round, status: "complete", scoredAt: at(12_000) };
    await advanceTo(12_600);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(result.current.phase).toBe("reveal");
    expect(result.current.nextRoundStartsIn).toBe(3);

    // The real, post-scoring boundary still gets exactly one ladder.
    const beforeBoundary = sessionFetchTimes.length;
    await advanceTo(16_000);
    expect(result.current.nextRoundStartsIn).toBe(0);
    expect(sessionFetchTimes.length).toBe(beforeBoundary + 1);  // the +15s poll only

    server.round = makeRound("r2", 16_000);
    await advanceTo(16_000 + JITTER_MS + 50);
    expect(kicksBetween(16_000, 16_500)).toBe(1);
  });
});

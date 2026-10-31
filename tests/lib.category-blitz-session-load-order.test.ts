// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { CategoryBlitzRound, CategoryBlitzSession } from "@/types";

/**
 * docs/category-blitz-letter-die-plan.md Phase 12.2. loadSession calls overlap
 * (the 15 s poll, realtime reloads, the visibility resync): an older reply that
 * lands last must not restore an old window end or session (12.2b), and the
 * replies' `serverNowMs` gives the die its clock offset (12.2a). Phase 13.2: only
 * a good reply moves the order (13.2a); the end-of-session broadcasts and the
 * round fetch join it (13.2b).
 */

/** A fake realtime client: each `.on("broadcast", { event }, cb)` is kept so a test can fire it. */
const realtime = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
  const channel = {
    on: (_type: string, filter: { event: string }, cb: () => void) => {
      handlers.set(filter.event, cb);
      return channel;
    },
    subscribe: () => channel,
  };
  return { handlers, client: { channel: () => channel, removeChannel: async () => "ok" } };
});

vi.mock("@/lib/supabase", () => ({ supabase: realtime.client }));

const { useCategoryBlitzSession } = await import("@/lib/categoryBlitzRealtime");

const T0 = new Date("2026-08-16T20:00:00.000Z").getTime();
const at = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString();

const makeRound = (overrides: Partial<CategoryBlitzRound> = {}): CategoryBlitzRound => ({
  id: "r1",
  sessionId: "sess-1",
  venueId: "venue-1",
  letter: "S",
  categorySetIndex: 0,
  categories: ["A breakfast food"],
  startedAt: at(-10_000),
  endsAt: at(170_000),
  status: "active",
  createdAt: at(-10_000),
  scoredAt: null,
  mode: "standard",
  ...overrides,
});

const SESSION: CategoryBlitzSession = {
  id: "sess-1",
  venueId: "venue-1",
  status: "active",
  source: "auto",
  sessionType: "scheduled",
  scheduledEndAt: at(3_600_000),
  startsAt: at(-60_000),
  testMode: false,
  createdAt: at(-60_000),
  completedAt: null,
  playerCount: 1,
};

type SessionBody = Record<string, unknown>;
type Held = { resolve: (body: SessionBody) => void };

const jsonResponse = (body: unknown): Response => ({ status: 200, json: async () => body }) as unknown as Response;

describe("useCategoryBlitzSession: overlapping session loads", () => {
  let server: { round: CategoryBlitzRound };
  /** null = answer at once with `immediate`; otherwise each sessions GET waits here. */
  let held: Held[] | null;
  let immediate: SessionBody;
  /** null = answer current-round at once with `server.round`; otherwise each waits here. */
  let roundHeld: Held[] | null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.spyOn(console, "debug").mockImplementation(() => {});
    server = { round: makeRound() };
    held = null;
    roundHeld = null;
    realtime.handlers.clear();
    immediate = { ok: true, session: SESSION, realtimeChannel: "chan-1", scheduleWindowEndAt: at(3_600_000) };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url.includes("/current-round")) {
          if (!roundHeld) return jsonResponse({ ok: true, round: server.round });
          const queue = roundHeld;
          return new Promise<Response>((resolve) => {
            queue.push({ resolve: (body) => resolve(jsonResponse(body)) });
          });
        }
        if (url.includes("/results")) return jsonResponse({ ok: false });
        if (url.includes("/score")) return jsonResponse({ ok: false });
        if (!held) return jsonResponse(immediate);
        const queue = held;
        return new Promise<Response>((resolve) => {
          queue.push({ resolve: (body) => resolve(jsonResponse(body)) });
        });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const flush = async (): Promise<void> => {
    await act(async () => {
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
  };

  const mount = async () => {
    const rendered = renderHook(() => useCategoryBlitzSession("venue-1", "user-1"));
    await flush();
    return rendered;
  };

  it("12.2b an older reply that lands last doesn't restore the old window end or session", async () => {
    const { result } = await mount();
    expect(result.current.scheduleWindowEndAt).toBe(at(3_600_000));

    held = [];
    act(() => { result.current.retry(); }); // A: read before the partner's edit
    act(() => { result.current.retry(); }); // B: after it (the schedule_updated reload)
    await flush();
    expect(held).toHaveLength(2);
    const [older, newer] = held;

    newer.resolve({ ok: true, session: { ...SESSION, playerCount: 4 }, realtimeChannel: "chan-1", scheduleWindowEndAt: at(600_000) });
    await flush();
    expect(result.current.scheduleWindowEndAt).toBe(at(600_000));

    older.resolve({ ok: true, session: { ...SESSION, playerCount: 2 }, realtimeChannel: "chan-1", scheduleWindowEndAt: at(3_600_000) });
    await flush();
    expect(result.current.scheduleWindowEndAt).toBe(at(600_000));
    expect(result.current.session?.playerCount).toBe(4);
  });

  it("12.2b an older failure that lands last doesn't raise an error over a newer reply", async () => {
    const { result } = await mount();
    held = [];
    act(() => { result.current.retry(); });
    act(() => { result.current.retry(); });
    await flush();
    const [older, newer] = held;
    newer.resolve(immediate);
    await flush();
    older.resolve({ ok: false, error: "boom" });
    await flush();
    expect(result.current.error).toBeNull();
  });

  it("12.2b a visibility resync's forceReveal still applies when a newer poll's reply wins", async () => {
    const { result } = await mount();
    expect(result.current.phase).toBe("answering");
    // The tab never saw its reveal finish (backgrounded mid-animation); the round
    // was scored server-side meanwhile. Only forceReveal lets it move on.
    server.round = makeRound({ status: "complete", scoredAt: at(-1_000), endsAt: at(-1_000) });

    held = [];
    act(() => { document.dispatchEvent(new Event("visibilitychange")); }); // A, forceReveal
    act(() => { result.current.retry(); }); // B, a plain load
    await flush();
    const [older, newer] = held;
    newer.resolve(immediate);
    await flush();
    older.resolve(immediate);
    await flush();
    expect(result.current.phase).not.toBe("answering");
  });

  it("13.2a a fast failure on the newest load doesn't drop an older good reply", async () => {
    const { result } = await mount();
    held = [];
    act(() => { result.current.retry(); }); // A (seq 4 in the plan's example), slow
    act(() => { result.current.retry(); }); // B, fails fast
    await flush();
    const [older, newer] = held;

    newer.resolve({ ok: false, error: "boom" });
    await flush();
    expect(result.current.error).toBe("boom");

    older.resolve({ ok: true, session: { ...SESSION, playerCount: 7 }, realtimeChannel: "chan-1", scheduleWindowEndAt: at(900_000) });
    await flush();
    expect(result.current.session?.playerCount).toBe(7);
    expect(result.current.scheduleWindowEndAt).toBe(at(900_000));
    expect(result.current.error).toBeNull();
  });

  it("13.2a a failure still shows when no newer reply has been applied", async () => {
    const { result } = await mount();
    held = [];
    act(() => { result.current.retry(); });
    await flush();
    held[0].resolve({ ok: false, error: "boom" });
    await flush();
    expect(result.current.error).toBe("boom");
  });

  it.each(["session_ended", "continuous_session_ended"])(
    "13.2b a poll sent before a %s broadcast that lands after it doesn't bring the session back",
    async (event) => {
      const { result } = await mount();
      expect(result.current.phase).toBe("answering");
      expect(realtime.handlers.has(event)).toBe(true);

      held = [];
      act(() => { result.current.retry(); }); // the poll, read before the session ended
      await flush();
      act(() => { realtime.handlers.get(event)?.(); });
      await flush();
      expect(result.current.phase).toBe("complete");

      held[0].resolve({ ok: true, session: SESSION, realtimeChannel: "chan-1", scheduleWindowEndAt: at(3_600_000) });
      await flush();
      expect(result.current.phase).toBe("complete");
    },
  );

  it("13.2b session_abandoned drops the in-flight poll but its own reload still applies", async () => {
    const { result } = await mount();
    held = [];
    act(() => { result.current.retry(); }); // stale poll, still sees the session
    await flush();
    act(() => { realtime.handlers.get("session_abandoned")?.(); }); // its reload is held[1]
    await flush();
    expect(result.current.phase).toBe("idle");
    expect(held).toHaveLength(2);
    const [stale, reload] = held;

    stale.resolve({ ok: true, session: SESSION, realtimeChannel: "chan-1", scheduleWindowEndAt: at(3_600_000) });
    await flush();
    expect(result.current.phase).toBe("idle");
    expect(result.current.session).toBeNull();

    reload.resolve({ ok: true, session: null, realtimeChannel: "chan-1", scheduleWindowEndAt: at(7_200_000) });
    await flush();
    expect(result.current.phase).toBe("idle");
    expect(result.current.scheduleWindowEndAt).toBe(at(7_200_000));
  });

  it("13.2b two applied replies whose round fetches land out of order: the newer round wins", async () => {
    const { result } = await mount();
    held = [];
    roundHeld = [];
    act(() => { result.current.retry(); }); // A
    act(() => { result.current.retry(); }); // B
    await flush();
    const [a, b] = held;
    a.resolve(immediate);
    await flush();
    b.resolve(immediate);
    await flush();
    expect(roundHeld).toHaveLength(2);
    const [roundA, roundB] = roundHeld;

    roundB.resolve({ ok: true, round: makeRound({ id: "r2", letter: "T" }) });
    await flush();
    expect(result.current.round?.id).toBe("r2");

    roundA.resolve({ ok: true, round: makeRound({ id: "r1", letter: "S" }) });
    await flush();
    expect(result.current.round?.id).toBe("r2");
  });

  it("13.2b a round fetch still in flight when the session ends doesn't revive it", async () => {
    const { result } = await mount();
    held = [];
    roundHeld = [];
    act(() => { result.current.retry(); });
    await flush();
    held[0].resolve(immediate);
    await flush();
    expect(roundHeld).toHaveLength(1);
    act(() => { realtime.handlers.get("session_ended")?.(); });
    await flush();
    roundHeld[0].resolve({ ok: true, round: makeRound({ id: "r9" }) });
    await flush();
    expect(result.current.phase).toBe("complete");
    expect(result.current.round?.id).not.toBe("r9");
  });

  it("12.2a the reply's serverNowMs becomes the clock offset", async () => {
    immediate = { ...immediate, serverNowMs: T0 + 4_000 };
    const { result } = await mount();
    expect(result.current.serverClockOffsetMs).toBe(4_000);
  });

  it("12.2a no serverNowMs (an older server) keeps the offset at 0", async () => {
    const { result } = await mount();
    expect(result.current.serverClockOffsetMs).toBe(0);
  });
});

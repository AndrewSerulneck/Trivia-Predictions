// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type FunctionComponent } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { HTMLMotionProps } from "framer-motion";
import type { CategoryBlitzRound, CategoryBlitzSession } from "@/types";
import { DIE_ARRIVAL_TO_BADGE_MAX_MS } from "@/lib/categoryBlitzLetterDie";
import { ROUND_START_DRIVE_SLACK_MS } from "@/lib/categoryBlitzShared";

// docs/category-blitz-letter-die-plan.md Phase 4: the letter die is wired into the
// real game. A break tumbles it over the intermission, the next round lands it and
// the board mounts as it flies; Majority Rules waits for the die; a die that never
// flies hands the round back to today's RoundStartReveal / plain board.

type SessionState = {
  phase: "idle" | "lobby" | "answering" | "scoring" | "reveal" | "results" | "complete";
  round: CategoryBlitzRound | null;
  nextRoundStartsIn: number | null;
  lobbyCountdown?: number | null;
  /** Overrides on the default continuous session (Phase 7: session id, scheduled end). */
  session?: Partial<CategoryBlitzSession>;
  /** The live open window's end from the sessions API (Phase 11.1b). */
  scheduleWindowEndAt?: string | null;
  /** Server time minus the phone's (Phase 12.2a); 0 when omitted. */
  serverClockOffsetMs?: number;
};
const sessionState = vi.hoisted(() => ({ current: null as SessionState | null }));
const markRevealDone = vi.hoisted(() => vi.fn());
const triggerAnimation = vi.hoisted(() => vi.fn());
const reduceMotionFlag = vi.hoisted(() => ({ value: false }));
// Phase 12.3a: AnsweringScreen is the only caller, so this counts its renders.
const reduceMotionCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/lib/categoryBlitzRealtime", () => ({
  useCategoryBlitzSession: () => ({
    phase: sessionState.current?.phase ?? "idle",
    session: {
      id: "session-1",
      status: "active",
      sessionType: "continuous",
      source: "auto",
      scheduledEndAt: null,
      testMode: false,
      playerCount: 3,
      ...sessionState.current?.session,
    },
    round: sessionState.current?.round ?? null,
    results: null,
    timeRemaining: 170,
    nextRoundStartsIn: sessionState.current?.nextRoundStartsIn ?? null,
    scheduleWindowEndAt: sessionState.current?.scheduleWindowEndAt ?? null,
    serverClockOffsetMs: sessionState.current?.serverClockOffsetMs ?? 0,
    lobbyCountdown: sessionState.current?.lobbyCountdown ?? null,
    hasLoaded: true,
    error: null,
    errorEscalated: false,
    retry: () => undefined,
    markRevealDone,
    markResultsRevealDone: () => undefined,
    dismissComplete: () => undefined,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/venue/v1/category-blitz",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return { ...actual, getVenueId: () => "venue-1", getUserId: () => "user-1", getUsername: () => "Tester" };
});
vi.mock("@/components/animations/AnimationTriggerProvider", () => ({
  useAnimationTrigger: () => ({ triggerAnimation }),
}));
// Phase 8: records every answer row rendered with `layout`/`layoutId`, so a test
// can prove the die's cascade rows never take a projection partner.
const layoutRows = vi.hoisted(() => new Set<string>());
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  const react = await vi.importActual<typeof import("react")>("react");
  const MotionDiv = actual.motion.div;
  const RecordingDiv = react.forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(function RecordingDiv(props, ref) {
    const row = (props as Record<string, unknown>)["data-category-blitz-answer-row-wrap"];
    if (row !== undefined && (props.layoutId || props.layout)) layoutRows.add(String(row));
    return react.createElement(MotionDiv, { ...props, ref });
  });
  const motion = new Proxy(actual.motion, {
    get: (target, key) => (key === "div" ? RecordingDiv : Reflect.get(target, key)),
  });
  return { ...actual, motion, useReducedMotion: () => {
      reduceMotionCalls.count += 1;
      return reduceMotionFlag.value;
    },
  };
});

import { AnsweringScreen, CategoryBlitzGame } from "@/components/category-blitz/CategoryBlitzGame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const T0 = 1_700_000_000_000;

const makeRound = (id: string, overrides: Partial<CategoryBlitzRound> = {}): CategoryBlitzRound => ({
  id,
  sessionId: "session-1",
  venueId: "venue-1",
  letter: "M",
  categorySetIndex: 0,
  categories: ["Fruits", "Countries", "Animals"],
  startedAt: new Date(Date.now()).toISOString(),
  endsAt: new Date(Date.now() + 180_000).toISOString(),
  status: "active",
  createdAt: new Date(Date.now()).toISOString(),
  scoredAt: null,
  mode: "standard",
  ...overrides,
});

const advance = async (ms: number) => {
  for (let left = ms; left > 0; left -= 50) {
    await act(async () => {
      vi.advanceTimersByTime(Math.min(50, left));
    });
  }
};
const setSession = async (view: ReturnType<typeof render>, next: SessionState) => {
  sessionState.current = next;
  await act(async () => {
    view.rerender(createElement(CategoryBlitzGame));
  });
};
const die = () => document.querySelector("[data-category-blitz-letter-die]");
const board = () => document.querySelector("[data-category-blitz-answer-list]");
const projectedRows = () => document.querySelectorAll("[data-category-blitz-row-projected]").length;
const cascadeRows = () => document.querySelectorAll("[data-category-blitz-row-cascade]").length;
const rowInput = (i: number) => document.querySelector<HTMLInputElement>(`[data-category-blitz-answer-input="${i}"]`);
const compactChrome = () => document.querySelector("[data-category-blitz-compact-chrome]");
/** Steps 50 ms at a time until the board mounts; returns how long that took. */
const advanceUntilBoard = async (maxMs: number) => {
  for (let waited = 0; waited <= maxMs; waited += 50) {
    if (board()) return waited;
    await advance(50);
  }
  throw new Error(`no board within ${maxMs} ms`);
};
const modeFlips = () => triggerAnimation.mock.calls.filter((c) => c[0] === "CATEGORY_BLITZ_MODE_FLIP");
// The die's own frames never run (a tab hidden as the round arrived): only its
// game-side watchdog can hand the round over. Framer-motion keeps its own clock.
const stallDieFrames = () => vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
const WATCHDOG_FIRED_MS = DIE_ARRIVAL_TO_BADGE_MAX_MS + 1500 + 500;

const mount = async (initial: SessionState, onBack?: () => void) => {
  sessionState.current = initial;
  const view = render(createElement(CategoryBlitzGame as FunctionComponent<{ onBack?: () => void }>, { onBack }));
  await advance(100); // hydrate
  return view;
};

beforeEach(() => {
  reduceMotionFlag.value = false;
  layoutRows.clear();
  markRevealDone.mockReset();
  triggerAnimation.mockReset();
  vi.useFakeTimers({
    now: T0,
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CategoryBlitzGame ↔ letter die", () => {
  it("tumbles in the last seconds of the break, lands on the new round, mounts the board as it flies", async () => {
    const prev = makeRound("round-a", { status: "complete" });
    const view = await mount({ phase: "results", round: prev, nextRoundStartsIn: 9 });
    expect(die()).toBeNull(); // the intermission is untouched until the tumble lead

    await setSession(view, { phase: "results", round: prev, nextRoundStartsIn: 4 });
    await advance(100);
    expect(die()).not.toBeNull();
    await advance(1500);

    await setSession(view, { phase: "answering", round: makeRound("round-b"), nextRoundStartsIn: null });
    await advance(50);
    expect(die()).not.toBeNull(); // same die instance kept rolling (key = the round the break followed)
    expect(board()).toBeNull(); // nothing under the die while it lands
    expect(document.body.textContent).not.toContain("M…"); // and no RoundStartReveal (its badge would steal the FLIP)
    expect(markRevealDone).not.toHaveBeenCalled();

    await advance(2400); // ≤ one hop to the impact + landing + hold → flying
    expect(board()).not.toBeNull();
    expect(markRevealDone).toHaveBeenCalledWith("round-b");
    expect(cascadeRows()).toBe(3); // rows cascading in on their motion wrappers
    expect(projectedRows()).toBe(0); // …which have no layout partner (Phase 8)

    await advance(1600);
    expect(die()).toBeNull();
    expect(cascadeRows()).toBe(3); // the same rows for the whole round, never swapped
    expect(projectedRows()).toBe(0);
    expect(modeFlips()).toHaveLength(0); // standard after standard: no takeover
  });

  it("Majority Rules: the takeover waits until the die has flown into the badge", async () => {
    const prev = makeRound("round-a", { status: "complete" });
    const view = await mount({ phase: "results", round: prev, nextRoundStartsIn: 4 });
    await advance(600);
    await setSession(view, { phase: "answering", round: makeRound("round-b", { mode: "reverse" }), nextRoundStartsIn: null });
    await advance(1000);
    expect(modeFlips()).toHaveLength(0); // not at round arrival, not during the landing
    await advance(1400);
    expect(board()).not.toBeNull();
    expect(modeFlips()).toHaveLength(0); // not during the FLIP either
    await advance(1000);
    expect(die()).toBeNull();
    expect(modeFlips()).toHaveLength(1);
    expect(modeFlips()[0][1]).not.toHaveProperty("modeFlipDirection");
  });

  it("back to standard after Majority Rules fires the green takeover after the die", async () => {
    const view = await mount({ phase: "results", round: makeRound("round-a", { status: "complete", mode: "reverse" }), nextRoundStartsIn: 4 });
    await advance(600);
    await setSession(view, { phase: "answering", round: makeRound("round-b"), nextRoundStartsIn: null });
    await advance(1500);
    expect(modeFlips()).toHaveLength(0);
    await advance(2500);
    expect(modeFlips()).toHaveLength(1);
    expect(modeFlips()[0][1]).toMatchObject({ modeFlipDirection: "toStandard" });
  });

  it("opened mid-round: straight to the plain board, no die, no takeover", async () => {
    const round = makeRound("round-b", { mode: "reverse", startedAt: new Date(T0 - 20_000).toISOString() });
    await mount({ phase: "answering", round, nextRoundStartsIn: null });
    await advance(100);
    expect(die()).toBeNull();
    expect(board()).not.toBeNull();
    expect(projectedRows()).toBe(0);
    await advance(3000);
    expect(modeFlips()).toHaveLength(0);
  });

  it("letter later than the cap: the die steps aside and today's RoundStartReveal shows the letter", async () => {
    const prev = makeRound("round-a", { status: "complete" });
    const view = await mount({ phase: "results", round: prev, nextRoundStartsIn: 4 });
    await advance(100);
    await setSession(view, { phase: "results", round: prev, nextRoundStartsIn: 0 });
    await advance(12_500);
    expect(die()).toBeNull();

    await setSession(view, { phase: "answering", round: makeRound("round-b"), nextRoundStartsIn: null });
    await advance(50);
    expect(die()).toBeNull();
    expect(board()).toBeNull();
    expect(document.body.textContent).toContain("M…"); // RoundStartReveal's rows
  });

  it("round arrives with no break seen (first visit at round start): the die still lands, then the board", async () => {
    await mount({ phase: "answering", round: makeRound("round-b"), nextRoundStartsIn: null });
    await advance(50);
    expect(die()).not.toBeNull();
    expect(board()).toBeNull();
    expect(document.body.textContent).not.toContain("M…");
    await advance(2400);
    expect(board()).not.toBeNull();
  });

  it("first round of a session: the lobby countdown is the tumble lead, then the die lands and flies", async () => {
    const view = await mount({ phase: "lobby", round: null, nextRoundStartsIn: null, lobbyCountdown: 9 });
    expect(die()).toBeNull();
    await setSession(view, { phase: "lobby", round: null, nextRoundStartsIn: null, lobbyCountdown: 4 });
    await advance(600);
    expect(die()).not.toBeNull();
    await setSession(view, { phase: "answering", round: makeRound("round-1"), nextRoundStartsIn: null });
    await advance(50);
    expect(die()).not.toBeNull();
    expect(board()).toBeNull();
    await advance(2500);
    expect(board()).not.toBeNull();
    expect(markRevealDone).toHaveBeenCalledWith("round-1");
  });

  it("Reduce Motion in the game: no cube, the board still arrives, rows fade without travelling", async () => {
    reduceMotionFlag.value = true;
    const prev = makeRound("round-a", { status: "complete" });
    const view = await mount({ phase: "results", round: prev, nextRoundStartsIn: 4 });
    await advance(600);
    await setSession(view, { phase: "answering", round: makeRound("round-b"), nextRoundStartsIn: null });
    await advance(50);
    expect(document.querySelector(".\\[transform-style\\:preserve-3d\\]")).toBeNull();
    await advance(2500);
    expect(board()).not.toBeNull();
    await advance(1600);
    expect(die()).toBeNull();
    expect(projectedRows()).toBe(0);
  });

  it("tab hidden while the die lands: it steps aside and the player is never stuck without a board", async () => {
    const prev = makeRound("round-a", { status: "complete" });
    const view = await mount({ phase: "results", round: prev, nextRoundStartsIn: 4 });
    await advance(600);
    await setSession(view, { phase: "answering", round: makeRound("round-b"), nextRoundStartsIn: null });
    await advance(300);
    const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(5000);
    hidden.mockRestore();
    expect(die()).toBeNull();
    expect(board() ?? document.body.textContent?.includes("M…")).toBeTruthy();
  });

  // ── Phase 7: die lifecycle fixes ───────────────────────────────────────────
  it("7.1 a die skipped by a mid-round reload doesn't suppress the next session's die", async () => {
    const midRound = makeRound("round-b", { startedAt: new Date(T0 - 20_000).toISOString() });
    const view = await mount({ phase: "answering", round: midRound, nextRoundStartsIn: null });
    await advance(100);
    expect(die()).toBeNull(); // skipped: opened mid-round
    expect(board()).not.toBeNull();

    await setSession(view, { phase: "complete", round: midRound, nextRoundStartsIn: null });
    await advance(100);
    const next = { session: { id: "session-2" } };
    await setSession(view, { ...next, phase: "lobby", round: null, nextRoundStartsIn: null, lobbyCountdown: 9 });
    await advance(100);
    await setSession(view, { ...next, phase: "lobby", round: null, nextRoundStartsIn: null, lobbyCountdown: 4 });
    await advance(600);
    expect(die()).not.toBeNull(); // the new session's lobby tumbles
  });

  describe("7.2 / 11.1b-c / 12.1a no tumble over the last round's results", () => {
    // Scored 176 s after it started, so the next round is due in 4 s; the engine
    // checks the fit up to ROUND_START_DRIVE_SLACK_MS later, and the round lasts 180 s.
    const lastScored = () =>
      makeRound("round-a", {
        status: "complete",
        startedAt: new Date(T0 - 180_000).toISOString(),
        scoredAt: new Date(T0 - 176_000).toISOString(),
      });
    const nextRoundEndsAt = T0 + 4_000 + ROUND_START_DRIVE_SLACK_MS + 180_000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const breakWith = async (session: Partial<CategoryBlitzSession>, scheduleWindowEndAt: string | null) => {
      const round = lastScored();
      const view = await mount({ session, scheduleWindowEndAt, phase: "results", round, nextRoundStartsIn: 9 });
      await setSession(view, { session, scheduleWindowEndAt, phase: "results", round, nextRoundStartsIn: 4 });
      await advance(600);
      return view;
    };

    it("scheduled, no room before the live window's end: the standings stay uncovered", async () => {
      await breakWith({ sessionType: "scheduled" }, iso(nextRoundEndsAt - 1));
      expect(die()).toBeNull();
    });

    it("scheduled with room for another round: it tumbles", async () => {
      await breakWith({ sessionType: "scheduled" }, iso(nextRoundEndsAt));
      expect(die()).not.toBeNull();
    });

    it("11.1b a partner shortened tonight's window: the frozen scheduledEndAt is ignored", async () => {
      await breakWith(
        { sessionType: "scheduled", scheduledEndAt: iso(nextRoundEndsAt + 3_600_000) },
        iso(nextRoundEndsAt - 1)
      );
      expect(die()).toBeNull();
    });

    it("12.1a a partner extended tonight's window: the session still ends at its frozen scheduledEndAt", async () => {
      await breakWith(
        { sessionType: "scheduled", scheduledEndAt: iso(nextRoundEndsAt - 1) },
        iso(nextRoundEndsAt + 3_600_000)
      );
      expect(die()).toBeNull();
    });

    it("11.1c fits only at the exact due time (no slack): no tumble", async () => {
      await breakWith({ sessionType: "scheduled" }, iso(T0 + 4_000 + 180_000));
      expect(die()).toBeNull();
    });

    it("continuous: it tumbles", async () => {
      await breakWith({ sessionType: "continuous", scheduledEndAt: null }, null);
      expect(die()).not.toBeNull();
    });

    it("no open window / manual session / older server (null): no tumble", async () => {
      await breakWith({ sessionType: "scheduled", source: "manual", scheduledEndAt: null }, null);
      expect(die()).toBeNull();
    });
  });

  it("11.1a a letter that arrives 6 s late never holds the board, even after a tumble", async () => {
    const prev = makeRound("round-a", { status: "complete" });
    const view = await mount({ phase: "results", round: prev, nextRoundStartsIn: 9 });
    await setSession(view, { phase: "results", round: prev, nextRoundStartsIn: 5 });
    await advance(100);
    expect(die()).not.toBeNull(); // tumbling
    await advance(11_000); // the round started 6 s ago; realtime dropped, the poll delivers it now
    await setSession(view, {
      phase: "answering",
      round: makeRound("round-b", { startedAt: new Date(Date.now() - 6_000).toISOString() }),
      nextRoundStartsIn: null,
    });
    await advance(100);
    expect(die()).toBeNull();
    expect(board()).not.toBeNull();
  });

  it("12.2a a phone clock 4 s ahead of the server: an on-time round still lands the die and flies to the board", async () => {
    const prev = makeRound("round-a", { status: "complete" });
    const view = await mount({ phase: "results", round: prev, nextRoundStartsIn: 9, serverClockOffsetMs: -4_000 });
    await setSession(view, { phase: "results", round: prev, nextRoundStartsIn: 5, serverClockOffsetMs: -4_000 });
    await advance(5_000);
    expect(die()).not.toBeNull(); // tumbling
    // On time: by the server's clock the round started just now; this phone reads it as 4 s ago.
    await setSession(view, {
      phase: "answering",
      round: makeRound("round-b", { startedAt: new Date(Date.now() - 4_000).toISOString() }),
      nextRoundStartsIn: null,
      serverClockOffsetMs: -4_000,
    });
    await advance(100);
    expect(die()).not.toBeNull(); // landing, not skipped
    await advanceUntilBoard(DIE_ARRIVAL_TO_BADGE_MAX_MS);
    expect(markRevealDone).toHaveBeenCalledWith("round-b");
    expect(cascadeRows()).toBe(3); // the die flew: the rows cascade in out of it
  });

  it("7.3 Majority Rules: when the watchdog takes over a fresh round, the takeover still plays once", async () => {
    const prev = makeRound("round-a", { status: "complete" });
    const view = await mount({ phase: "results", round: prev, nextRoundStartsIn: 4 });
    await advance(600);
    const stalled = stallDieFrames();
    await setSession(view, { phase: "answering", round: makeRound("round-b", { mode: "reverse" }), nextRoundStartsIn: null });
    await advance(WATCHDOG_FIRED_MS);
    expect(die()).toBeNull();
    expect(board()).not.toBeNull();
    expect(modeFlips()).toHaveLength(1);
    await advance(3000);
    expect(modeFlips()).toHaveLength(1);
    stalled.mockRestore();
  });

  it("7.3 a mid-round reload of a Majority Rules round still gets no takeover, even via the watchdog", async () => {
    const stalled = stallDieFrames();
    const round = makeRound("round-b", { mode: "reverse", startedAt: new Date(T0 - 20_000).toISOString() });
    await mount({ phase: "answering", round, nextRoundStartsIn: null });
    await advance(WATCHDOG_FIRED_MS);
    expect(board()).not.toBeNull();
    expect(modeFlips()).toHaveLength(0);
    stalled.mockRestore();
  });

  // ── Phase 8: board cascade without a remount ───────────────────────────────
  describe("8 the die's board cascade never remounts a row", () => {
    // Focusing a row scrolls the list to it; jsdom has no scrollBy.
    beforeEach(() => {
      Element.prototype.scrollBy = () => undefined;
    });
    afterEach(() => {
      delete (Element.prototype as Partial<Element>).scrollBy;
    });
    const fromDie = async () => {
      const prev = makeRound("round-a", { status: "complete" });
      const view = await mount({ phase: "results", round: prev, nextRoundStartsIn: 4 });
      await advance(600);
      layoutRows.clear(); // only the round's own board counts
      await setSession(view, { phase: "answering", round: makeRound("round-b"), nextRoundStartsIn: null });
      await advanceUntilBoard(4000);
      return view;
    };

    it("a row tapped mid-cascade keeps its input, focus and text after the cascade ends", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
      await fromDie();
      await advance(600); // row 1 (index 1) has finished its fade-in (≈ 0.45 s); later rows may still be sliding
      const input = rowInput(1);
      expect(input).not.toBeNull();
      await act(async () => {
        input?.focus();
      });
      await act(async () => {
        fireEvent.change(input as HTMLInputElement, { target: { value: "Mango" } });
      });
      await advance(2000);
      expect(rowInput(1)).toBe(input); // the same DOM node, never remounted
      expect(document.activeElement).toBe(input);
      expect(input?.value).toBe("Mango");
    });

    it("no row takes a layoutId or layout: they have no partner out of the die", async () => {
      await fromDie();
      expect(cascadeRows()).toBe(3);
      await advance(2000);
      expect(cascadeRows()).toBe(3);
      expect([...layoutRows]).toEqual([]);
      expect(projectedRows()).toBe(0);
    });

    it("compact chrome waits only for the 570 ms badge morph, not the whole cascade", async () => {
      await fromDie();
      await act(async () => {
        rowInput(0)?.focus();
      });
      expect(compactChrome()).toBeNull(); // the badge is still flying in
      await advance(600);
      expect(compactChrome()).not.toBeNull(); // well before the ≈1.2 s cascade of 12 would end
    });

    // Rendered directly: the game reaches this path only after RoundStartReveal's
    // own animation completes, which framer runs on jsdom's real-time frames.
    const answering = (cascade: boolean) =>
      render(
        createElement(AnsweringScreen, {
          letter: "M",
          categories: ["Fruits", "Countries", "Animals"],
          roundId: "round-b",
          timeRemaining: 170,
          venueId: "venue-1",
          userId: "user-1",
          morphFromReveal: true,
          cascadeRows: cascade,
        })
      );

    it("the RoundStartReveal path is unchanged: rows FLIP on layoutIds, then plain divs at 570 ms", async () => {
      answering(false);
      expect(projectedRows()).toBe(3);
      expect(cascadeRows()).toBe(0);
      expect([...layoutRows].sort()).toEqual(["0", "1", "2"]);
      const first = rowInput(0);
      await advance(600);
      expect(projectedRows()).toBe(0);
      expect(cascadeRows()).toBe(0);
      expect(rowInput(0)).not.toBe(first); // the designed swap, scoped to 570 ms before anyone types
    });

    const wrap = (i: number) =>
      document.querySelector<HTMLElement>(`[data-category-blitz-answer-row-wrap="${i}"]`) as HTMLElement;

    it("11.4 a row is inert until its own fade-in completes; none after the fallback time", async () => {
      answering(true);
      await advance(100);
      expect(wrap(0).hasAttribute("inert")).toBe(true);
      expect(wrap(2).hasAttribute("inert")).toBe(true); // the last row, still invisible
      // (framer's own completion callbacks run on real-time frames, which fake timers don't drive;
      // the per-row callback is pinned in the contract test, the fallback timer is what runs here)
      await advance(1500); // past the fallback (≈ 1.07 s)
      expect(document.querySelectorAll("[inert]").length).toBe(0);
    });

    it("11.4 the fallback timer frees every row even if no animation callback ever fires", async () => {
      vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
      answering(true);
      await advance(100);
      expect(document.querySelectorAll("[inert]").length).toBe(3);
      await advance(1300);
      expect(document.querySelectorAll("[inert]").length).toBe(0);
      vi.restoreAllMocks();
    });

    it("11.4 Reduce Motion: same rule, rows free after the 0.2 s opacity fade", async () => {
      reduceMotionFlag.value = true;
      try {
        answering(true);
        await advance(100);
        expect(wrap(2).hasAttribute("inert")).toBe(true);
        await advance(1500);
        expect(document.querySelectorAll("[inert]").length).toBe(0);
      } finally {
        reduceMotionFlag.value = false;
      }
    });

    it("12.3a rows becoming ready never re-render the board (no more renders than a board with no cascade)", async () => {
      // Whatever else re-renders AnsweringScreen in this window (its own clock) is the baseline.
      const rendersOver = async (cascade: boolean) => {
        const view = answering(cascade);
        await advance(100);
        const before = reduceMotionCalls.count;
        await advance(1500); // every cascade row's fallback fires and flips its own `ready`
        const used = reduceMotionCalls.count - before;
        view.unmount();
        return used;
      };
      const plain = await rendersOver(false);
      const cascade = await rendersOver(true);
      expect(cascade).toBeLessThanOrEqual(plain); // the plain board also re-renders once when its morph settles
    });

    it("11.4 the non-die path never sets inert", async () => {
      answering(false);
      await advance(100);
      expect(document.querySelectorAll("[inert]").length).toBe(0);
    });

    it("cascadeRows is read once at mount: a later prop change can't swap the rows' element type", async () => {
      const view = answering(true);
      const input = rowInput(1);
      await act(async () => {
        view.rerender(
          createElement(AnsweringScreen, {
            letter: "M",
            categories: ["Fruits", "Countries", "Animals"],
            roundId: "round-b",
            timeRemaining: 169,
            venueId: "venue-1",
            userId: "user-1",
            morphFromReveal: true,
            cascadeRows: false,
          })
        );
      });
      await advance(600);
      expect(cascadeRows()).toBe(3);
      expect(rowInput(1)).toBe(input);
    });
  });
});

describe("9 / 11.2 Back stays reachable: the die lives in the stage, under the header", () => {
  const stage = () => document.querySelector("[data-category-blitz-stage]");

  it("while the die tumbles, Back is outside the die and the stage, and calls onBack", async () => {
    const onBack = vi.fn();
    await mount({ phase: "results", round: makeRound("round-a", { status: "complete" }), nextRoundStartsIn: 4 }, onBack);
    await advance(600);
    const dieEl = die();
    expect(dieEl).not.toBeNull();
    expect(dieEl?.parentElement).toBe(stage()); // a direct child: it fills the stage and nothing more
    const back = document.querySelector<HTMLElement>('button[aria-label="Back to venue"]');
    expect(back).not.toBeNull();
    expect(dieEl?.contains(back)).toBe(false);
    expect(stage()?.contains(back)).toBe(false); // the header is the stage's sibling, above it
    fireEvent.click(back as HTMLElement);
    await advance(10);
    expect(onBack).toHaveBeenCalled();
  });

  it("in test mode the dev buttons (Test mode, Skip round) sit outside the stage while the die tumbles", async () => {
    window.localStorage.setItem("tp:category-blitz-test-mode", "true");
    try {
      await mount({
        phase: "results",
        round: makeRound("round-a", { status: "complete" }),
        nextRoundStartsIn: 4,
        session: { testMode: true },
      });
      await advance(600);
      expect(die()).not.toBeNull();
      const devButtons = [...document.querySelectorAll<HTMLElement>("button[data-category-blitz-dev-only]")];
      const skip = devButtons.find((b) => /Skip round/.test(b.textContent ?? ""));
      const toggle = devButtons.find((b) => /Test mode/.test(b.textContent ?? ""));
      expect(skip).toBeDefined();
      expect(toggle).toBeDefined();
      expect(stage()?.contains(skip ?? null)).toBe(false);
      expect(stage()?.contains(toggle ?? null)).toBe(false);
    } finally {
      window.localStorage.removeItem("tp:category-blitz-test-mode");
    }
  });
});

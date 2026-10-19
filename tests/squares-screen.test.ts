// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { resetNativeBackHandlersForTest, handleNativeBackPress } from "@/components/navigation/nativeBackButton";
import type { SquaresBoardView } from "@/lib/squaresBoard";
import type { SquaresScoreView } from "@/lib/squaresView";

// Phase 3 — the Squares screen end to end against a fake network: load, open a square, claim/release,
// refusals, and the polling cost rules (docs/squares-and-brackets-plan.md §6). createElement, not JSX.

vi.mock("@/components/venue/AppBar", () => ({ GameAppBar: () => null }));
vi.mock("@/components/ui/HightopLoader", () => ({ HightopLoader: () => createElement("div", null, "loading") }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/storage", () => ({ getUserId: () => "user-1", getVenueId: () => "venue-1" }));

const { SquaresGame } = await import("@/components/squares/SquaresGame");
const { haptic } = await import("@/lib/haptics");

const COL = [3, 7, 0, 9, 1, 5, 8, 2, 6, 4];
const ROW = [6, 2, 9, 0, 4, 8, 1, 7, 3, 5];
const team = (abbreviation: string) => ({ abbreviation, fullName: abbreviation, name: abbreviation });

type Claim = { cell: number; username: string; mine: boolean };

const makeBoard = (over: { phase?: SquaresBoardView["event"] extends infer E ? (E extends { phase: infer P } ? P : never) : never; claims?: Claim[]; lockAt?: string; digits?: boolean } = {}): SquaresBoardView => {
  const claims = over.claims ?? [];
  const phase = over.phase ?? "open";
  return {
    event: {
      id: "e1",
      season: 2026,
      colTeam: team("KC"),
      rowTeam: team("PHI"),
      kickoffAt: "2099-02-14T23:30:00.000Z",
      lockAt: over.lockAt ?? "2099-02-14T23:00:00.000Z",
      phase,
      colDigits: over.digits ? COL : null,
      rowDigits: over.digits ? ROW : null,
      liveScore: null,
    },
    claims,
    myCells: claims.filter((c) => c.mine).map((c) => c.cell),
    cap: 2,
    moments: (["q1", "half", "q3", "final"] as const).map((moment) => ({ moment, points: moment === "final" ? 50 : 25, result: null })),
  };
};

const makeScore = (phase: "locked" | "drawn" | "complete", digits = true): SquaresScoreView => ({
  event: {
    id: "e1",
    phase,
    kickoffAt: "2099-02-14T23:30:00.000Z",
    lockAt: "2099-02-14T23:00:00.000Z",
    colDigits: digits ? COL : null,
    rowDigits: digits ? ROW : null,
    liveScore: null,
  },
  moments: (["q1", "half", "q3", "final"] as const).map((moment) => ({ moment, points: moment === "final" ? 50 : 25, result: null })),
});

type Calls = { board: number; score: number; claim: Array<{ cell: number; action: string }> };

/** A tiny fake server. `board`/`score` can be swapped between calls; claim mutates the board like the RPC would. */
const installFetch = (state: { board: SquaresBoardView; score: SquaresScoreView; claimOutcome?: string; claimStatus?: number }) => {
  const calls: Calls = { board: 0, score: 0, claim: [] };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("/api/squares/board")) {
      calls.board += 1;
      return json({ ok: true, ...state.board });
    }
    if (url.startsWith("/api/squares/score")) {
      calls.score += 1;
      return json({ ok: true, ...state.score });
    }
    if (url.startsWith("/api/squares/claim")) {
      const body = JSON.parse(String(init?.body)) as { cell: number; action: string };
      calls.claim.push({ cell: body.cell, action: body.action });
      if (state.claimOutcome) return json({ ok: false, outcome: state.claimOutcome }, state.claimStatus ?? 409);
      const claims = state.board.claims.filter((c) => c.cell !== body.cell);
      if (body.action === "claim") claims.push({ cell: body.cell, username: "me", mine: true });
      state.board = { ...state.board, claims, myCells: claims.filter((c) => c.mine).map((c) => c.cell) };
      return json({ ok: true, outcome: body.action === "claim" ? "claimed" : "released", myCells: state.board.myCells });
    }
    return json({ ok: false }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const mountScreen = async () => {
  render(createElement(SquaresGame));
  await advance(0);
  await flush();
};
const cellEl = (cell: number) => document.querySelector(`[data-cell="${cell}"]`) as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(new Date("2099-02-14T20:00:00Z"));
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  vi.mocked(haptic).mockClear();
});
afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  cleanup();
  resetNativeBackHandlersForTest();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("loading and claiming", () => {
  it("draws 100 squares, the headline and the key", async () => {
    installFetch({ board: makeBoard({ claims: [{ cell: 3, username: "sam", mine: false }] }), score: makeScore("locked") });
    await mountScreen();
    expect(screen.getByRole("heading", { name: "Pick your squares" })).toBeTruthy();
    expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(100);
    expect(cellEl(3).dataset.owner).toBe("taken");
    expect(cellEl(4).dataset.owner).toBe("open");
    expect(screen.getByText(/0 of 2 used/)).toBeTruthy();
    // Numbers are not shown before the draw.
    expect(document.querySelectorAll('[role="columnheader"]')).toHaveLength(10);
    expect(screen.queryByText("3")).toBeNull();
  });

  it("claims a square from the sheet, buzzes, closes the sheet and shows the server's board", async () => {
    const calls = installFetch({ board: makeBoard(), score: makeScore("locked") });
    await mountScreen();
    await act(async () => fireEvent.click(cellEl(12)));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Open")).toBeTruthy();
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Claim this square" })));
    await flush();
    await flush();
    expect(calls.claim).toEqual([{ cell: 12, action: "claim" }]);
    expect(haptic).toHaveBeenCalledWith("commit");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cellEl(12).dataset.owner).toBe("mine");
    expect(screen.getByText(/1 of 2 used/)).toBeTruthy();
  });

  it("releases her own square", async () => {
    const calls = installFetch({ board: makeBoard({ claims: [{ cell: 7, username: "me", mine: true }] }), score: makeScore("locked") });
    await mountScreen();
    await act(async () => fireEvent.click(cellEl(7)));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Release this square" })));
    await flush();
    await flush();
    expect(calls.claim).toEqual([{ cell: 7, action: "release" }]);
    expect(cellEl(7).dataset.owner).toBe("open");
  });

  it("offers no Claim on someone else's square or at the cap", async () => {
    installFetch({
      board: makeBoard({
        claims: [
          { cell: 1, username: "sam", mine: false },
          { cell: 2, username: "me", mine: true },
          { cell: 3, username: "me", mine: true },
        ],
      }),
      score: makeScore("locked"),
    });
    await mountScreen();
    await act(async () => fireEvent.click(cellEl(1)));
    expect(screen.getByText("Held by sam")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Claim|Release/ })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Close" , hidden: false })));
    await act(async () => fireEvent.click(cellEl(50)));
    expect(screen.queryByRole("button", { name: "Claim this square" })).toBeNull();
    expect(screen.getByText(/already hold 2/)).toBeTruthy();
  });

  it("shows a taken-square refusal inside the sheet and re-reads the board", async () => {
    const state = { board: makeBoard(), score: makeScore("locked"), claimOutcome: "taken" };
    const calls = installFetch(state);
    await mountScreen();
    const boardReadsBefore = calls.board;
    await act(async () => fireEvent.click(cellEl(9)));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Claim this square" })));
    await flush();
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("grabbed");
    expect(haptic).toHaveBeenCalledWith("warning");
    expect(calls.board).toBeGreaterThan(boardReadsBefore);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("opens and closes the sheet with Escape and with Android Back (overlay first)", async () => {
    installFetch({ board: makeBoard(), score: makeScore("locked") });
    await mountScreen();
    await act(async () => fireEvent.click(cellEl(0)));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => fireEvent.click(cellEl(0)));
    // Inside the app the hook registers; on the website it is inert (components/navigation/nativeBackButton.ts).
    (window as unknown as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: (name: string) => name === "App",
      nativePromise: vi.fn(async () => ({})),
    };
    cleanup();
    installFetch({ board: makeBoard(), score: makeScore("locked") });
    await mountScreen();
    await act(async () => fireEvent.click(cellEl(0)));
    expect(screen.getByRole("dialog")).toBeTruthy();
    const fallbacks = { goBack: vi.fn(), minimize: vi.fn() };
    await act(async () => {
      handleNativeBackPress(true, fallbacks);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fallbacks.goBack).not.toHaveBeenCalled();
  });

  it("moves between squares with the arrow keys", async () => {
    installFetch({ board: makeBoard(), score: makeScore("locked") });
    await mountScreen();
    cellEl(0).focus();
    await act(async () => fireEvent.keyDown(cellEl(0), { key: "ArrowRight" }));
    expect(document.activeElement).toBe(cellEl(1));
    await act(async () => fireEvent.keyDown(cellEl(1), { key: "ArrowDown" }));
    expect(document.activeElement).toBe(cellEl(11));
    await act(async () => fireEvent.keyDown(cellEl(11), { key: "Enter" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("after the lock", () => {
  it("draws the digits, hides Claim, and names the leading square", async () => {
    const board = makeBoard({ phase: "drawn", digits: true, claims: [{ cell: ROW.indexOf(4) * 10 + COL.indexOf(0), username: "sam", mine: false }] });
    const score = makeScore("drawn");
    score.event!.kickoffAt = "2020-01-01T00:00:00.000Z";
    score.event!.liveScore = { col: 10, row: 14, status: "Halftime" };
    board.event!.kickoffAt = "2020-01-01T00:00:00.000Z";
    board.event!.liveScore = { col: 10, row: 14, status: "Halftime" };
    installFetch({ board, score });
    await mountScreen();
    expect(screen.getByRole("heading", { name: "KC 10, PHI 14" })).toBeTruthy();
    // The feed's own status line sits under the score (and "Halftime" is also a moment row).
    expect(within(screen.getByRole("heading", { name: "KC 10, PHI 14" }).parentElement as HTMLElement).getByText("Halftime")).toBeTruthy();
    expect(screen.getByText(/Leading square: sam/)).toBeTruthy();
    expect(document.querySelectorAll('[role="columnheader"]')[0].textContent).toBe("3");
    await act(async () => fireEvent.click(cellEl(0)));
    expect(screen.getByText("Claims are closed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Claim|Release/ })).toBeNull();
  });
});

describe("what it costs (plan §6)", () => {
  it("before the lock: the board every 30 s, the score never", async () => {
    const calls = installFetch({ board: makeBoard(), score: makeScore("locked") });
    await mountScreen();
    expect(calls.board).toBe(1);
    await advance(30_000);
    expect(calls.board).toBe(2);
    await advance(60_000);
    expect(calls.board).toBe(4);
    expect(calls.score).toBe(0);
  });

  it("after the lock: the shared score every 15 s, and the board only when the draw or a grade changes it", async () => {
    const state = { board: makeBoard({ phase: "locked" }), score: makeScore("locked", false) };
    const calls = installFetch(state);
    await mountScreen();
    expect(calls.board).toBe(1);
    expect(calls.score).toBe(0); // the board just read already carries the live state
    await advance(15_000);
    await advance(15_000);
    expect(calls.score).toBe(2);
    expect(calls.board).toBe(1); // nothing changed: no per-venue read

    state.score = makeScore("drawn"); // the draw happened
    await advance(15_000);
    await flush();
    expect(calls.board).toBe(2); // one board read to catch up
    state.board = makeBoard({ phase: "drawn", digits: true });
    await advance(15_000);
    await flush();
    expect(calls.board).toBe(3);
    await advance(15_000);
    await advance(15_000);
    expect(calls.board).toBe(3); // aligned again: back to score-only
  });

  it("a hidden tab reads nothing, and catches up when it is shown", async () => {
    const calls = installFetch({ board: makeBoard(), score: makeScore("locked") });
    await mountScreen();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await advance(120_000);
    expect(calls.board).toBe(1);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(calls.board).toBe(2);
  });

  it("after the final: the shared score every 5 min (never the board), and once on returning to the tab", async () => {
    const board = makeBoard({ phase: "complete", digits: true });
    board.event!.kickoffAt = "2020-01-01T00:00:00.000Z";
    const state = { board, score: makeScore("complete") };
    const calls = installFetch(state);
    await mountScreen();
    const before = { board: calls.board, score: calls.score };
    await advance(290_000);
    expect(calls.score).toBe(before.score); // not before 5 min
    await advance(15_000);
    expect(calls.score).toBe(before.score + 1);
    await advance(300_000);
    expect(calls.score).toBe(before.score + 2);
    expect(calls.board).toBe(before.board); // unchanged revision: no per-venue read

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await advance(900_000);
    expect(calls.score).toBe(before.score + 2); // a hidden tab reads nothing
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(calls.score).toBe(before.score + 3);
    expect(calls.board).toBe(before.board);
  });

  it("after the final: a void + re-grade (same cell, new grade number) re-reads the board once", async () => {
    const board = makeBoard({ phase: "complete", digits: true });
    board.event!.kickoffAt = "2020-01-01T00:00:00.000Z";
    board.moments[3].result = { col: 7, row: 3, winningCell: 41, gradeNo: 1, winner: null };
    const score = makeScore("complete");
    score.moments[3].result = { col: 7, row: 3, winningCell: 41, gradeNo: 1 };
    const state = { board, score };
    const calls = installFetch(state);
    await mountScreen();
    const before = calls.board;
    score.moments[3].result = { col: 7, row: 3, winningCell: 41, gradeNo: 2 };
    board.moments[3].result = { col: 7, row: 3, winningCell: 41, gradeNo: 2, winner: null }; // what the server now holds
    await advance(305_000);
    await flush();
    expect(calls.board).toBe(before + 1);
  });

  it("switches from the board to the score at the lock without a reload", async () => {
    const lock = new Date(Date.now() + 40_000).toISOString();
    const state = { board: makeBoard({ lockAt: lock }), score: makeScore("locked", false) };
    state.score.event!.lockAt = lock;
    const calls = installFetch(state);
    await mountScreen();
    expect(calls.score).toBe(0);
    await advance(40_000 + 5_000);
    await advance(15_000);
    expect(calls.score).toBeGreaterThan(0);
  });
});

describe("empty and failure states", () => {
  it("says the board opens soon when there is no event", async () => {
    installFetch({ board: { ...makeBoard(), event: null }, score: makeScore("locked") });
    await mountScreen();
    expect(screen.getByRole("heading", { name: "The board opens soon" })).toBeTruthy();
  });

  it("offers a retry when the first load fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    await mountScreen();
    expect(screen.getByRole("heading", { name: "The board didn't load" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("treats a 404 (flag off) as unavailable, not an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await mountScreen();
    expect(screen.getByRole("heading", { name: "Not available right now" })).toBeTruthy();
  });
});

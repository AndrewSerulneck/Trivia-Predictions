import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const boardMock = vi.fn();
vi.mock("@/lib/squaresBoard", () => ({ getSquaresBoardView: (...args: unknown[]) => boardMock(...args) }));

import { SquaresTvScreen } from "@/components/venue-screen/SquaresTvScreen";
import type { SquaresBoardView } from "@/lib/squaresBoard";
import { buildSquaresTvPayload, SQUARES_TV_WINDOW_MS } from "@/lib/squaresTv";
import { getSquaresTvPayload } from "@/lib/squaresTvRead";
import { getVenueScreenPollIntervalMs } from "@/lib/venueScreenTiming";
import { selectVenueScreenState, type VenueScreenSelectionInput, type VenueScreenState } from "@/lib/venueScreen";

// Phase 5 — Squares on the venue TV: when it shows, what it carries, and what it costs.

const COL = [3, 7, 0, 9, 1, 5, 8, 2, 6, 4];
const ROW = [6, 2, 9, 0, 4, 8, 1, 7, 3, 5];
const KICKOFF = "2027-02-14T23:30:00.000Z";
const KICKOFF_MS = Date.parse(KICKOFF);
const team = (abbreviation: string) => ({ abbreviation, fullName: abbreviation, name: abbreviation });

const board = (patch: Partial<NonNullable<SquaresBoardView["event"]>> = {}, over: Partial<SquaresBoardView> = {}): SquaresBoardView => ({
  event: {
    id: "e1",
    season: 2026,
    colTeam: team("KC"),
    rowTeam: team("PHI"),
    kickoffAt: KICKOFF,
    lockAt: "2027-02-14T23:00:00.000Z",
    phase: "drawn",
    colDigits: COL,
    rowDigits: ROW,
    liveScore: { col: 13, row: 7, status: "2nd Quarter" },
    ...patch,
  },
  claims: [
    { cell: 3, username: "ann", mine: false },
    { cell: 42, username: "bo", mine: false },
  ],
  myCells: [],
  cap: 2,
  moments: ["q1", "half", "q3", "final"].map((moment, i) => ({
    moment: moment as "q1",
    points: i === 3 ? 50 : 25,
    result: moment === "q1" ? { col: 7, row: 3, winningCell: 3, winner: { username: "ann", mine: false } } : null,
  })),
  ...over,
});

const NOW = KICKOFF_MS + 60 * 60 * 1000;

describe("buildSquaresTvPayload", () => {
  it("builds the payload for a drawn board with claims", () => {
    const payload = buildSquaresTvPayload(board(), NOW);
    expect(payload).not.toBeNull();
    expect(payload?.phase).toBe("drawn");
    expect(payload?.claims).toEqual([
      { cell: 3, username: "ann" },
      { cell: 42, username: "bo" },
    ]);
    expect(payload?.winningCells).toEqual([{ cell: 3, moments: ["q1"] }]);
    expect(payload?.leadingCell).not.toBeNull();
    expect(payload?.moments[0]).toMatchObject({ moment: "q1", state: "won", winner: { username: "ann" } });
  });

  it("never carries a player id", () => {
    expect(JSON.stringify(buildSquaresTvPayload(board(), NOW))).not.toMatch(/user_?id|"mine"/i);
  });

  it("stays off before the numbers are drawn, with no claims, or with no event", () => {
    expect(buildSquaresTvPayload(board({ phase: "open", colDigits: null, rowDigits: null }), NOW)).toBeNull();
    expect(buildSquaresTvPayload(board({ phase: "locked", colDigits: null, rowDigits: null }), NOW)).toBeNull();
    expect(buildSquaresTvPayload(board({}, { claims: [] }), NOW)).toBeNull();
    expect(buildSquaresTvPayload({ ...board(), event: null }, NOW)).toBeNull();
  });

  it("keeps a finished game up for the window, then stops", () => {
    const done = board({ phase: "complete" });
    expect(buildSquaresTvPayload(done, KICKOFF_MS + 4 * 60 * 60 * 1000)?.leadingCell).toBeNull();
    expect(buildSquaresTvPayload(done, KICKOFF_MS + SQUARES_TV_WINDOW_MS + 1)).toBeNull();
  });
});

describe("selectVenueScreenState with Squares", () => {
  const venue = { id: "v1", name: "Pub", displayName: null, screenBrandImageUrl: null, screenBrandPrimary: null, screenBrandSecondary: null };
  const idleLive = { isGameActive: false, nextSchedule: null } as unknown as VenueScreenSelectionInput["liveTrivia"];
  const noBlitz = { session: null, round: null, leaderboard: null, nextStartsAt: null, nextRoundStartsAt: null };
  const squares = buildSquaresTvPayload(board(), NOW);

  it("replaces the idle screen", () => {
    const state = selectVenueScreenState({ venue, liveTrivia: idleLive, categoryBlitz: noBlitz, squares, updatedAt: NOW });
    expect(state.mode).toBe("squares");
  });

  it("is idle when there is no Squares payload", () => {
    expect(selectVenueScreenState({ venue, liveTrivia: idleLive, categoryBlitz: noBlitz, squares: null, updatedAt: NOW }).mode).toBe("idle");
  });

  it("never beats a live Live Trivia game", () => {
    const live = { ...idleLive, isGameActive: true, activePhase: "answering", secondsRemaining: 10, totalRounds: 3, currentRound: 1, scheduleId: "s", occurrenceDate: "d", leaderboard: null, isFinalResultsWindow: false, activeQuestion: null, revealedAnswer: null, currentRoundCategory: null, venueName: null } as unknown as VenueScreenSelectionInput["liveTrivia"];
    expect(selectVenueScreenState({ venue, liveTrivia: live, categoryBlitz: noBlitz, squares, updatedAt: NOW }).mode).toBe("live-trivia");
  });

  it("polls at the cached cadence, no faster", () => {
    const state = selectVenueScreenState({ venue, liveTrivia: idleLive, categoryBlitz: noBlitz, squares, updatedAt: NOW });
    expect(getVenueScreenPollIntervalMs(state)).toBe(15_000);
  });
});

describe("getSquaresTvPayload (cost)", () => {
  beforeEach(() => {
    boardMock.mockReset();
    vi.unstubAllEnvs();
  });
  const inWindow = Date.parse("2027-02-14T22:00:00.000Z");

  it("does no I/O with the flag off", async () => {
    expect(await getSquaresTvPayload("v-off", NOW)).toBeNull();
    expect(boardMock).not.toHaveBeenCalled();
  });

  it("does no I/O outside the Squares window", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
    expect(await getSquaresTvPayload("v-outside", Date.parse("2026-10-20T20:00:00.000Z"))).toBeNull();
    expect(boardMock).not.toHaveBeenCalled();
  });

  it("reads once per venue per 15 s however many TVs ask, and hides itself on failure", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
    boardMock.mockResolvedValue({ ok: true, view: board() });
    const at = Math.max(inWindow, KICKOFF_MS + 1000);
    await getSquaresTvPayload("v-cache", at);
    await getSquaresTvPayload("v-cache", at + 5_000);
    expect(boardMock).toHaveBeenCalledTimes(1);
    await getSquaresTvPayload("v-cache", at + 16_000);
    expect(boardMock).toHaveBeenCalledTimes(2);

    boardMock.mockResolvedValue({ ok: false, error: "boom" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getSquaresTvPayload("v-fail", at)).toBeNull();
  });
});

describe("SquaresTvScreen", () => {
  it("draws the digits, the owners, the score and each moment", () => {
    const payload = buildSquaresTvPayload(board(), NOW);
    if (!payload) throw new Error("payload expected");
    const state = {
      ok: true,
      mode: "squares",
      venue: { id: "v1", name: "Pub" },
      liveTrivia: null,
      categoryBlitz: null,
      idle: null,
      squares: payload,
      updatedAt: NOW,
    } as VenueScreenState as Extract<VenueScreenState, { mode: "squares" }>;
    const html = renderToStaticMarkup(React.createElement(SquaresTvScreen, { state, accent: "#fcd34d" }));
    expect(html).toContain("ann");
    expect(html).toContain("bo");
    expect(html).toContain("Winning right now");
    expect(html).toContain("End of Q1");
    expect(html).toContain("2nd Quarter");
    expect(html).toContain(">13<");
    expect(html).toContain(">7<");
  });
});

import { describe, expect, it } from "vitest";
import type { SquaresBoardView } from "@/lib/squaresBoard";
import {
  boardRevision,
  leadingCellOf,
  scoreRevision,
  squaresCellAction,
  squaresCellLabel,
  squaresCellModels,
  squaresCellNote,
  squaresClaimMessage,
  squaresHeadline,
  squaresMomentRows,
  squaresRevision,
  squaresScreenState,
  type SquaresScoreView,
} from "@/lib/squaresView";

// Phase 3 — every decision the Squares screen makes, pinned without rendering it.

const COL = [3, 7, 0, 9, 1, 5, 8, 2, 6, 4];
const ROW = [6, 2, 9, 0, 4, 8, 1, 7, 3, 5];
const team = (abbreviation: string) => ({ abbreviation, fullName: abbreviation, name: abbreviation });

const baseBoard = (patch: Partial<NonNullable<SquaresBoardView["event"]>> = {}, over: Partial<SquaresBoardView> = {}): SquaresBoardView => ({
  event: {
    id: "e1",
    season: 2026,
    colTeam: team("KC"),
    rowTeam: team("PHI"),
    kickoffAt: "2027-02-14T23:30:00.000Z",
    lockAt: "2027-02-14T23:00:00.000Z",
    phase: "open",
    colDigits: null,
    rowDigits: null,
    liveScore: null,
    ...patch,
  },
  claims: [],
  myCells: [],
  cap: 2,
  moments: ["q1", "half", "q3", "final"].map((moment, i) => ({
    moment: moment as "q1",
    points: i === 3 ? 50 : 25,
    result: null,
  })),
  ...over,
});

const baseScore = (patch: Partial<NonNullable<SquaresScoreView["event"]>> = {}, moments: SquaresScoreView["moments"] = []): SquaresScoreView => ({
  event: {
    id: "e1",
    phase: "open",
    kickoffAt: "2027-02-14T23:30:00.000Z",
    lockAt: "2027-02-14T23:00:00.000Z",
    colDigits: null,
    rowDigits: null,
    liveScore: null,
    ...patch,
  },
  moments: moments.length
    ? moments
    : (["q1", "half", "q3", "final"] as const).map((moment) => ({ moment, points: moment === "final" ? 50 : 25, result: null })),
});

describe("cell models", () => {
  it("marks open / taken / mine from the claims and never invents an owner", () => {
    const board = baseBoard({}, {
      claims: [
        { cell: 5, username: "sam", mine: false },
        { cell: 17, username: "me", mine: true },
      ],
      myCells: [17],
    });
    const state = squaresScreenState(board, null);
    expect(state).not.toBeNull();
    const models = squaresCellModels(board, state!);
    expect(models).toHaveLength(100);
    expect(models[5]).toMatchObject({ owner: "taken", username: "sam", row: 0, col: 5 });
    expect(models[17]).toMatchObject({ owner: "mine", row: 1, col: 7 });
    expect(models[0]).toMatchObject({ owner: "open", username: null });
  });

  it("outlines the squares that won a moment, and the one the live score points at", () => {
    const col = COL.indexOf(7);
    const row = ROW.indexOf(3);
    const board = baseBoard({ phase: "drawn", colDigits: COL, rowDigits: ROW, liveScore: { col: 17, row: 13, status: "Q2" } });
    const score = baseScore(
      { phase: "drawn", colDigits: COL, rowDigits: ROW, liveScore: { col: 17, row: 13, status: "Q2" } },
      [
        { moment: "q1", points: 25, result: { col: 7, row: 3, winningCell: row * 10 + col, gradeNo: 1 } },
        { moment: "half", points: 25, result: null },
        { moment: "q3", points: 25, result: null },
        { moment: "final", points: 50, result: null },
      ],
    );
    const state = squaresScreenState(board, score)!;
    // 17 -> digit 7 across, 13 -> digit 3 down: the same square that already won Q1.
    expect(state.leadingCell).toBe(row * 10 + col);
    const model = squaresCellModels(board, state)[row * 10 + col];
    expect(model.wins).toEqual(["q1"]);
    expect(model.leading).toBe(true);
  });

  it("describes a cell for a screen reader and only names digits once drawn", () => {
    const board = baseBoard({}, { claims: [{ cell: 0, username: "sam", mine: false }] });
    const model = squaresCellModels(board, squaresScreenState(board, null)!)[0];
    const teams = { col: "KC", row: "PHI" };
    expect(squaresCellLabel(model, { colDigits: null, rowDigits: null }, teams)).toBe("Row 1, column 1, held by sam");
    expect(squaresCellLabel(model, { colDigits: COL, rowDigits: ROW }, teams)).toBe("Row 1, column 1, KC 3, PHI 6, held by sam");
  });
});

describe("leading square", () => {
  it("is null until both digit rows are drawn and both scores are known", () => {
    expect(leadingCellOf(null, ROW, { col: 1, row: 2 })).toBeNull();
    expect(leadingCellOf(COL, null, { col: 1, row: 2 })).toBeNull();
    expect(leadingCellOf(COL, ROW, null)).toBeNull();
    expect(leadingCellOf(COL, ROW, { col: null, row: 2 })).toBeNull();
    expect(leadingCellOf(COL, ROW, { col: 3, row: null })).toBeNull();
  });

  it("uses the last digit of each cumulative score (and rejects a malformed permutation)", () => {
    expect(leadingCellOf(COL, ROW, { col: 20, row: 14 })).toBe(ROW.indexOf(4) * 10 + COL.indexOf(0));
    expect(leadingCellOf([1, 1, 2, 3, 4, 5, 6, 7, 8, 9], ROW, { col: 1, row: 1 })).toBeNull();
  });

  it("only leads while the game is in play", () => {
    const board = baseBoard({ phase: "complete", colDigits: COL, rowDigits: ROW, liveScore: { col: 31, row: 27, status: "Final" } });
    expect(squaresScreenState(board, null)!.leadingCell).toBeNull();
  });
});

describe("what changed", () => {
  it("fingerprints the draw and each graded cell, not the live score", () => {
    const board = baseBoard();
    const score = baseScore();
    expect(boardRevision(board)).toBe(scoreRevision(score));
    const drawn = baseScore({ phase: "drawn", colDigits: COL, rowDigits: ROW });
    expect(scoreRevision(drawn)).not.toBe(boardRevision(board));
    const live = baseScore({ phase: "drawn", colDigits: COL, rowDigits: ROW, liveScore: { col: 3, row: 0, status: "Q1" } });
    expect(scoreRevision(live)).toBe(scoreRevision(drawn));
    const graded = baseScore({ phase: "drawn", colDigits: COL, rowDigits: ROW }, [
      { moment: "q1", points: 25, result: { col: 3, row: 0, winningCell: 33, gradeNo: 1 } },
      { moment: "half", points: 25, result: null },
      { moment: "q3", points: 25, result: null },
      { moment: "final", points: 50, result: null },
    ]);
    expect(scoreRevision(graded)).not.toBe(scoreRevision(drawn));
  });
});

describe("screen state", () => {
  it("prefers the fresher shared score, falls back to the board, and ignores a score for another event", () => {
    const board = baseBoard({ phase: "open" });
    expect(squaresScreenState(board, baseScore({ phase: "drawn", colDigits: COL, rowDigits: ROW }))!.phase).toBe("drawn");
    expect(squaresScreenState(board, null)!.phase).toBe("open");
    const other = baseScore({ phase: "complete" });
    other.event!.id = "someone-else";
    expect(squaresScreenState(board, other)!.phase).toBe("open");
  });

  it("is null when there is no event", () => {
    expect(squaresScreenState(baseBoard({}, { event: null }), null)).toBeNull();
  });
});

describe("what a player can do", () => {
  const open = { phase: "open" as const, used: 0, cap: 2 };
  it("claims an open square under the cap, releases her own, nothing else", () => {
    expect(squaresCellAction({ ...open, model: { owner: "open" } })).toBe("claim");
    expect(squaresCellAction({ ...open, used: 2, model: { owner: "open" } })).toBe("none");
    expect(squaresCellAction({ ...open, used: 2, model: { owner: "mine" } })).toBe("release");
    expect(squaresCellAction({ ...open, model: { owner: "taken" } })).toBe("none");
  });

  it("offers nothing once claims close, even for her own square", () => {
    for (const phase of ["locked", "drawn", "complete"] as const) {
      expect(squaresCellAction({ phase, used: 1, cap: 2, model: { owner: "mine" } })).toBe("none");
      expect(squaresCellAction({ phase, used: 0, cap: 2, model: { owner: "open" } })).toBe("none");
    }
  });

  it("explains why, in plain words", () => {
    expect(squaresCellNote({ phase: "drawn", owner: "open", used: 0, cap: 2 })).toBe("Claims are closed.");
    expect(squaresCellNote({ phase: "open", owner: "open", used: 2, cap: 2 })).toContain("already hold 2");
    expect(squaresCellNote({ phase: "open", owner: "taken", used: 0, cap: 2 })).toContain("already holds");
    expect(squaresCellNote({ phase: "open", owner: "open", used: 0, cap: 2 })).toBeNull();
  });

  it("has a message for every refusal the claim route can send", () => {
    for (const outcome of ["taken", "cap_reached", "not_yours", "locked", "no_event", "wrong_venue", "user_not_found", null]) {
      expect(squaresClaimMessage(outcome).length).toBeGreaterThan(5);
    }
    expect(squaresClaimMessage("taken")).toContain("grabbed");
  });
});

describe("moment rows", () => {
  const graded = (winningCell: number): SquaresScoreView["moments"] => [
    { moment: "q1", points: 25, result: { col: 7, row: 3, winningCell, gradeNo: 1 } },
    { moment: "half", points: 25, result: null },
    { moment: "q3", points: 25, result: null },
    { moment: "final", points: 50, result: null },
  ];

  it("shows the winner's name from the board once the board agrees with the score", () => {
    const board = baseBoard({ phase: "drawn", colDigits: COL, rowDigits: ROW });
    board.moments[0].result = { col: 7, row: 3, winningCell: 41, gradeNo: 1, winner: { username: "sam", mine: false } };
    const rows = squaresMomentRows(board, baseScore({ phase: "drawn" }, graded(41)));
    expect(rows[0]).toMatchObject({ moment: "q1", label: "End of Q1", points: 25, state: "won", winner: { username: "sam" } });
    expect(rows[1]).toMatchObject({ state: "pending", winner: null });
  });

  it("says nobody won when the cell is empty at this venue", () => {
    const board = baseBoard({ phase: "drawn", colDigits: COL, rowDigits: ROW });
    board.moments[0].result = { col: 7, row: 3, winningCell: 41, gradeNo: 1, winner: null };
    expect(squaresMomentRows(board, baseScore({ phase: "drawn" }, graded(41)))[0].state).toBe("nobody");
  });

  it("waits (pending) while the score is ahead of the board, rather than showing a stale name", () => {
    const board = baseBoard({ phase: "drawn", colDigits: COL, rowDigits: ROW });
    board.moments[0].result = { col: 1, row: 1, winningCell: 11, gradeNo: 1, winner: { username: "old", mine: false } };
    expect(squaresMomentRows(board, baseScore({ phase: "drawn" }, graded(41)))[0]).toMatchObject({ state: "pending", winner: null });
  });

  it("falls back to the board alone before a score has loaded", () => {
    const board = baseBoard({ phase: "drawn", colDigits: COL, rowDigits: ROW });
    board.moments[3].result = { col: 1, row: 7, winningCell: 70, gradeNo: 1, winner: { username: "me", mine: true } };
    expect(squaresMomentRows(board, null)[3]).toMatchObject({ state: "won", winner: { mine: true } });
  });
});

describe("headline", () => {
  const at = (iso: string) => Date.parse(iso);

  it("before the lock: how many squares are used and when claims close", () => {
    const board = baseBoard({}, { myCells: [1] });
    const headline = squaresHeadline({ board, state: squaresScreenState(board, null)!, nowMs: at("2027-02-14T20:00:00Z") });
    expect(headline.title).toBe("Pick your squares");
    expect(headline.detail).toContain("1 of 2 used");
    expect(headline.detail).toContain("Claims close");
  });

  it("after the lock but before the draw: closed, drawing", () => {
    const board = baseBoard({ phase: "locked" });
    expect(squaresHeadline({ board, state: squaresScreenState(board, null)!, nowMs: at("2027-02-14T23:01:00Z") }).title).toBe("Claims are closed");
  });

  it("drawn and before kickoff: no score, the kickoff time", () => {
    const board = baseBoard({ phase: "drawn", colDigits: COL, rowDigits: ROW, liveScore: { col: 0, row: 0, status: "2/14 - 6:30 PM EST" } });
    const headline = squaresHeadline({ board, state: squaresScreenState(board, null)!, nowMs: at("2027-02-14T23:10:00Z") });
    expect(headline.title).toBe("Numbers are drawn");
    expect(headline.detail).toContain("Kickoff");
  });

  it("in play: the score with the feed's own status line", () => {
    const board = baseBoard({ phase: "drawn", colDigits: COL, rowDigits: ROW, liveScore: { col: 10, row: 7, status: "Halftime" } });
    const headline = squaresHeadline({ board, state: squaresScreenState(board, null)!, nowMs: at("2027-02-15T00:40:00Z") });
    expect(headline).toEqual({ title: "KC 10, PHI 7", detail: "Halftime" });
  });

  it("final, and no event", () => {
    const board = baseBoard({ phase: "complete", colDigits: COL, rowDigits: ROW, liveScore: { col: 31, row: 27, status: "Final" } });
    expect(squaresHeadline({ board, state: squaresScreenState(board, null)!, nowMs: at("2027-02-15T04:00:00Z") }).title).toBe("Final · KC 31, PHI 27");
    const none = baseBoard({}, { event: null });
    expect(squaresHeadline({ board: none, state: { phase: "open", colDigits: null, rowDigits: null, liveScore: null, winningCells: new Map(), leadingCell: null }, nowMs: 0 }).title).toBe("The board opens soon");
  });
});

describe("squaresRevision (plan 6.4)", () => {
  it("a re-grade with the same winning cell is a new revision", () => {
    const moments = (gradeNo: number) => [{ moment: "final" as const, result: { winningCell: 41, gradeNo } }];
    expect(squaresRevision({ drawn: true, moments: moments(1) })).not.toBe(squaresRevision({ drawn: true, moments: moments(2) }));
    expect(squaresRevision({ drawn: true, moments: moments(1) })).toBe(squaresRevision({ drawn: true, moments: moments(1) }));
  });
});

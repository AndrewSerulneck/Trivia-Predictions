// Squares — what the player screen decides from the two payloads it reads
// (docs/squares-and-brackets-plan.md, Phase 3). Pure and client-safe: no I/O, no server-only, so the
// screen stays dumb and the tests can pin every rule here without rendering anything.
//
// Two payloads feed the screen:
//   • the BOARD (per venue, never cached): who holds each square, "mine", each moment's winner NAME;
//   • the SCORE (one copy for every venue, CDN-cached 15 s): the phase, the drawn digits, the live
//     score and each graded moment's winning cell. It carries no player, so it is safe to cache.

import type { SquaresBoardView } from "@/lib/squaresBoard";
import {
  SQUARES_CELL_COUNT,
  SQUARES_MOMENTS,
  colOfCell,
  isDigitPermutation,
  rowOfCell,
  winningCell,
  type SquaresEventPhase,
  type SquaresMoment,
} from "@/lib/squares";

export type SquaresScoreMoment = {
  moment: SquaresMoment;
  points: number;
  result: null | { col: number; row: number; winningCell: number };
};

/** The shared, not-user-specific read (GET /api/squares/score). */
export type SquaresScoreView = {
  event: null | {
    id: string;
    phase: SquaresEventPhase;
    kickoffAt: string;
    lockAt: string;
    /** Null until the draw — never sent earlier. */
    colDigits: number[] | null;
    rowDigits: number[] | null;
    liveScore: { col: number | null; row: number | null; status: string | null } | null;
  };
  moments: SquaresScoreMoment[];
};

/** Player-facing names for the four scoring moments. */
export const SQUARES_MOMENT_LABELS: Record<SquaresMoment, string> = {
  q1: "End of Q1",
  half: "Halftime",
  q3: "End of Q3",
  final: "Final",
};

/** How often an open screen re-reads (ms). The board is per venue and uncached, so it is the slow one. */
export const SQUARES_BOARD_POLL_MS = 30_000;
export const SQUARES_SCORE_POLL_MS = 15_000;

// ── What changed? ───────────────────────────────────────────────────────────────────────────────

/**
 * A short fingerprint of everything on the shared score that the BOARD payload must agree with: the
 * draw, and each graded moment's cell. When the score's fingerprint differs from the board's, the
 * screen refetches the board once (for the winners' names). Cumulative live score is NOT in it — that
 * changes every minute and needs no board read.
 */
export const squaresRevision = (parts: {
  drawn: boolean;
  moments: ReadonlyArray<{ moment: SquaresMoment; result: null | { winningCell: number } }>;
}): string =>
  `${parts.drawn ? "d" : "u"}|${parts.moments
    .map((m) => `${m.moment}:${m.result ? m.result.winningCell : "-"}`)
    .join(",")}`;

export const boardRevision = (board: SquaresBoardView): string =>
  squaresRevision({
    drawn: Boolean(board.event?.colDigits && board.event?.rowDigits),
    moments: board.moments,
  });

export const scoreRevision = (score: SquaresScoreView): string =>
  squaresRevision({
    drawn: Boolean(score.event?.colDigits && score.event?.rowDigits),
    moments: score.moments,
  });

// ── Merging the two payloads ────────────────────────────────────────────────────────────────────

export type SquaresScreenState = {
  phase: SquaresEventPhase;
  colDigits: number[] | null;
  rowDigits: number[] | null;
  liveScore: { col: number | null; row: number | null; status: string | null } | null;
  /** cell → the moments it won (graded, this venue or not — the cell is the same everywhere). */
  winningCells: Map<number, SquaresMoment[]>;
  /** The cell the live score points at right now (null before the draw, before a score, or once final). */
  leadingCell: number | null;
};

/** The score wins for anything live (it is fresher); the board is the fallback before a score has loaded. */
export const squaresScreenState = (board: SquaresBoardView, score: SquaresScoreView | null): SquaresScreenState | null => {
  const event = board.event;
  if (!event) return null;
  const scoreEvent = score?.event && score.event.id === event.id ? score.event : null;
  const colDigits = scoreEvent?.colDigits ?? event.colDigits;
  const rowDigits = scoreEvent?.rowDigits ?? event.rowDigits;
  const phase = scoreEvent?.phase ?? event.phase;
  const liveScore = scoreEvent ? scoreEvent.liveScore : event.liveScore;
  const moments: ReadonlyArray<SquaresScoreMoment | SquaresBoardView["moments"][number]> =
    scoreEvent && score ? score.moments : board.moments;

  const winningCells = new Map<number, SquaresMoment[]>();
  for (const moment of moments) {
    if (!moment.result) continue;
    winningCells.set(moment.result.winningCell, [...(winningCells.get(moment.result.winningCell) ?? []), moment.moment]);
  }

  return {
    phase,
    colDigits,
    rowDigits,
    liveScore,
    winningCells,
    leadingCell: phase === "drawn" ? leadingCellOf(colDigits, rowDigits, liveScore) : null,
  };
};

/** The square the current score would pay. Null until both digit rows are drawn and both scores are known. */
export const leadingCellOf = (
  colDigits: readonly number[] | null,
  rowDigits: readonly number[] | null,
  liveScore: { col: number | null; row: number | null } | null,
): number | null => {
  if (!isDigitPermutation(colDigits) || !isDigitPermutation(rowDigits)) return null;
  if (!liveScore || liveScore.col === null || liveScore.row === null) return null;
  if (!Number.isInteger(liveScore.col) || !Number.isInteger(liveScore.row) || liveScore.col < 0 || liveScore.row < 0) return null;
  return winningCell(colDigits, rowDigits, liveScore.col, liveScore.row);
};

// ── One cell ────────────────────────────────────────────────────────────────────────────────────

export type SquaresCellOwner = "open" | "taken" | "mine";

export type SquaresCellModel = {
  cell: number;
  row: number;
  col: number;
  owner: SquaresCellOwner;
  /** Null when the square is open. */
  username: string | null;
  wins: SquaresMoment[];
  leading: boolean;
};

export const squaresCellModels = (board: SquaresBoardView, state: SquaresScreenState): SquaresCellModel[] => {
  const byCell = new Map(board.claims.map((claim) => [claim.cell, claim]));
  return Array.from({ length: SQUARES_CELL_COUNT }, (_, cell) => {
    const claim = byCell.get(cell);
    return {
      cell,
      row: rowOfCell(cell),
      col: colOfCell(cell),
      owner: claim ? (claim.mine ? "mine" : "taken") : "open",
      username: claim ? claim.username : null,
      wins: state.winningCells.get(cell) ?? [],
      leading: state.leadingCell === cell,
    };
  });
};

/** What a screen reader hears for a cell. Digits are only named once drawn. */
export const squaresCellLabel = (
  model: SquaresCellModel,
  state: Pick<SquaresScreenState, "colDigits" | "rowDigits">,
  teams: { col: string; row: string },
): string => {
  const parts: string[] = [`Row ${model.row + 1}, column ${model.col + 1}`];
  if (isDigitPermutation(state.colDigits) && isDigitPermutation(state.rowDigits)) {
    parts.push(`${teams.col} ${state.colDigits[model.col]}, ${teams.row} ${state.rowDigits[model.row]}`);
  }
  parts.push(model.owner === "open" ? "open" : model.owner === "mine" ? "yours" : `held by ${model.username}`);
  if (model.wins.length > 0) parts.push(`won ${model.wins.map((m) => SQUARES_MOMENT_LABELS[m]).join(" and ")}`);
  if (model.leading) parts.push("leading right now");
  return parts.join(", ");
};

// ── What the player may do ──────────────────────────────────────────────────────────────────────

export type SquaresCellAction = "claim" | "release" | "none";

/** Claims are open only before the lock, on the server's phase; the database clock has the last word. */
export const squaresCellAction = (params: {
  phase: SquaresEventPhase;
  model: Pick<SquaresCellModel, "owner">;
  used: number;
  cap: number;
}): SquaresCellAction => {
  if (params.phase !== "open") return "none";
  if (params.model.owner === "mine") return "release";
  if (params.model.owner === "open" && params.used < params.cap) return "claim";
  return "none";
};

/** The line under a cell in the sheet when no action is possible. */
export const squaresCellNote = (params: {
  phase: SquaresEventPhase;
  owner: SquaresCellOwner;
  used: number;
  cap: number;
}): string | null => {
  if (params.phase !== "open") return "Claims are closed.";
  if (params.owner === "open" && params.used >= params.cap) return `You already hold ${params.cap} squares. Release one to pick another.`;
  if (params.owner === "taken") return "Someone else already holds this square.";
  return null;
};

/** What the screen says when a claim/release comes back refused (409 outcomes + the rest). */
export const squaresClaimMessage = (outcome: string | null): string => {
  switch (outcome) {
    case "taken":
      return "Someone just grabbed that square.";
    case "cap_reached":
      return "You already hold the most squares you can. Release one first.";
    case "not_yours":
      return "That square isn't yours to release.";
    case "locked":
      return "Claims just closed.";
    case "no_event":
      return "The board isn't open yet.";
    case "rehearsal_only":
      return "This board is a test game and isn't open at this venue.";
    case "wrong_venue":
    case "user_not_found":
      return "We couldn't match you to this venue. Go back to the venue and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
};

// ── Order of the moments for display, with the winner's name from the board ────────────────────

export type SquaresMomentRow = {
  moment: SquaresMoment;
  label: string;
  points: number;
  state: "pending" | "won" | "nobody";
  winner: { username: string; mine: boolean } | null;
};

/** One row per moment: graded from the shared score (fresher), the winner's name from the board. */
export const squaresMomentRows = (board: SquaresBoardView, score: SquaresScoreView | null): SquaresMomentRow[] => {
  const sharedMoments = score?.event && board.event && score.event.id === board.event.id ? score.moments : [];
  return SQUARES_MOMENTS.map((moment) => {
    const fromBoard = board.moments.find((m) => m.moment === moment);
    const shared = sharedMoments.find((m) => m.moment === moment);
    const graded = shared ? shared.result : (fromBoard?.result ?? null);
    const row = { moment, label: SQUARES_MOMENT_LABELS[moment], points: fromBoard?.points ?? shared?.points ?? 0 };
    if (!graded) return { ...row, state: "pending", winner: null };
    // The board's name counts only for the same winning cell the score reports. Otherwise the score is
    // ahead (a grade or a void landed since the board was read) and the board is being refetched.
    const named = fromBoard?.result && fromBoard.result.winningCell === graded.winningCell ? fromBoard.result : null;
    if (!named) return { ...row, state: "pending", winner: null };
    return named.winner ? { ...row, state: "won", winner: named.winner } : { ...row, state: "nobody", winner: null };
  });
};

// ── The headline ────────────────────────────────────────────────────────────────────────────────

export type SquaresHeadline = { title: string; detail: string | null };

const formatClock = (iso: string): string =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export const squaresHeadline = (params: {
  board: SquaresBoardView;
  state: SquaresScreenState;
  nowMs: number;
}): SquaresHeadline => {
  const { board, state, nowMs } = params;
  const event = board.event;
  if (!event) return { title: "The board opens soon", detail: "It opens once the matchup is set." };
  const used = board.myCells.length;

  if (state.phase === "open") {
    return {
      title: "Pick your squares",
      detail: `${used} of ${board.cap} used · Claims close ${formatClock(event.lockAt)}`,
    };
  }
  if (state.phase === "locked") {
    return { title: "Claims are closed", detail: "The numbers are being drawn." };
  }
  const score = state.liveScore;
  const hasScore = score !== null && score.col !== null && score.row !== null;
  const started = nowMs >= Date.parse(event.kickoffAt);
  if (state.phase === "complete") {
    return {
      title: hasScore ? `Final · ${event.colTeam.abbreviation} ${score.col}, ${event.rowTeam.abbreviation} ${score.row}` : "Final",
      detail: null,
    };
  }
  // drawn
  if (!started || !hasScore) {
    return { title: "Numbers are drawn", detail: `Kickoff ${formatClock(event.kickoffAt)}` };
  }
  return {
    title: `${event.colTeam.abbreviation} ${score.col}, ${event.rowTeam.abbreviation} ${score.row}`,
    detail: score.status ? score.status : null,
  };
};

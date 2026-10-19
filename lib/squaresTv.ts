// Squares on the venue TV (docs/squares-and-brackets-plan.md, Phase 5). Pure and client-safe: it turns
// the venue's board read into the small payload the TV draws. It adds no request of its own — the TV
// already polls /api/venue-screen/state, and that route reads the board (see lib/squaresTvRead.ts).

import type { SquaresBoardView } from "@/lib/squaresBoard";
import type { SquaresMoment } from "@/lib/squares";
import { leadingCellOf, squaresMomentRows } from "@/lib/squaresView";

/** How long after kickoff the TV keeps showing the board: a long game plus three hours (plan §6). */
export const SQUARES_TV_WINDOW_MS = 7 * 60 * 60 * 1000;

export type SquaresTvPayload = {
  eventId: string;
  phase: "drawn" | "complete";
  colTeam: { abbreviation: string; name: string };
  rowTeam: { abbreviation: string; name: string };
  colDigits: number[];
  rowDigits: number[];
  liveScore: { col: number | null; row: number | null; status: string | null } | null;
  /** The square the current score would pay (null once final or before a score). */
  leadingCell: number | null;
  /** Everyone holding a square at this venue. Usernames are public (plan §1 decision 15). */
  claims: Array<{ cell: number; username: string }>;
  /** Cells that already won a moment, with the moments (graded, from the shared score). */
  winningCells: Array<{ cell: number; moments: SquaresMoment[] }>;
  moments: Array<{
    moment: SquaresMoment;
    label: string;
    points: number;
    state: "pending" | "won" | "nobody";
    winner: { username: string } | null;
  }>;
};

/**
 * The TV payload for a board, or null when the TV should not show Squares: no event, the numbers are
 * not drawn yet, the game is over for longer than the window, or nobody at this venue holds a square.
 */
export const buildSquaresTvPayload = (board: SquaresBoardView, nowMs: number): SquaresTvPayload | null => {
  const event = board.event;
  if (!event) return null;
  if (event.phase !== "drawn" && event.phase !== "complete") return null;
  if (!event.colDigits || !event.rowDigits) return null;
  if (board.claims.length === 0) return null;
  const kickoffMs = Date.parse(event.kickoffAt);
  if (!Number.isFinite(kickoffMs) || nowMs > kickoffMs + SQUARES_TV_WINDOW_MS) return null;

  const winning = new Map<number, SquaresMoment[]>();
  for (const moment of board.moments) {
    if (!moment.result) continue;
    winning.set(moment.result.winningCell, [...(winning.get(moment.result.winningCell) ?? []), moment.moment]);
  }

  return {
    eventId: event.id,
    phase: event.phase,
    colTeam: { abbreviation: event.colTeam.abbreviation, name: event.colTeam.name },
    rowTeam: { abbreviation: event.rowTeam.abbreviation, name: event.rowTeam.name },
    colDigits: event.colDigits,
    rowDigits: event.rowDigits,
    liveScore: event.liveScore,
    leadingCell: event.phase === "drawn" ? leadingCellOf(event.colDigits, event.rowDigits, event.liveScore) : null,
    claims: board.claims.map((claim) => ({ cell: claim.cell, username: claim.username })),
    winningCells: [...winning.entries()].map(([cell, moments]) => ({ cell, moments })),
    moments: squaresMomentRows(board, null).map((row) => ({
      moment: row.moment,
      label: row.label,
      points: row.points,
      state: row.state,
      winner: row.winner ? { username: row.winner.username } : null,
    })),
  };
};

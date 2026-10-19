import "server-only";

import { SQUARES_PER_PLAYER_CAP } from "@/lib/seasonalGames";
import {
  SQUARES_MOMENTS,
  squaresEventPhase,
  squaresMomentPoints,
  type SquaresEventPhase,
  type SquaresMoment,
} from "@/lib/squares";
import { getCurrentSquaresEvent, getSquaresMoments } from "@/lib/squaresStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";

// Super Bowl Squares — what a player's screen reads and the claim/release write
// (docs/squares-and-brackets-plan.md, Phases 2–3). Every owner is public (Andrew, decision 15), so
// the view carries usernames — but never a user id: "mine" is decided here, on the server.

export type SquaresTeamView = { abbreviation: string; fullName: string; name: string };

export type SquaresBoardView = {
  event: {
    id: string;
    season: number;
    colTeam: SquaresTeamView;
    rowTeam: SquaresTeamView;
    kickoffAt: string;
    lockAt: string;
    phase: SquaresEventPhase;
    /** Null until the draw — nobody sees numbers before claiming. */
    colDigits: number[] | null;
    rowDigits: number[] | null;
    liveScore: { col: number | null; row: number | null; status: string | null } | null;
  } | null;
  claims: Array<{ cell: number; username: string; mine: boolean }>;
  myCells: number[];
  cap: number;
  moments: Array<{
    moment: SquaresMoment;
    points: number;
    result: null | {
      col: number;
      row: number;
      winningCell: number;
      /** Null = nobody held the winning square at this venue. */
      winner: { username: string; mine: boolean } | null;
    };
  }>;
};

type Embedded = { username?: string | null } | Array<{ username?: string | null }> | null;
const usernameOf = (embedded: Embedded): string => {
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  return String(row?.username ?? "").trim() || "Player";
};

const teamView = (team: { abbreviation?: string; fullName?: string; name?: string }): SquaresTeamView => ({
  abbreviation: String(team.abbreviation ?? ""),
  fullName: String(team.fullName ?? ""),
  name: String(team.name ?? ""),
});

export type SquaresViewResult = { ok: true; view: SquaresBoardView } | { ok: false; error: string };

/** The current event's board at one venue, from the reader's point of view (`userId` may be null). */
export async function getSquaresBoardView(params: {
  venueId: string;
  userId: string | null;
  nowMs?: number;
}): Promise<SquaresViewResult> {
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin client is not configured." };
  const nowMs = params.nowMs ?? Date.now();
  const empty: SquaresBoardView = { event: null, claims: [], myCells: [], cap: SQUARES_PER_PLAYER_CAP, moments: [] };

  const current = await getCurrentSquaresEvent();
  if (!current.ok) return { ok: false, error: current.error };
  const event = current.value;
  if (!event) return { ok: true, view: empty };

  const [boardRead, momentsRead] = await Promise.all([
    supabaseAdmin.from("squares_boards").select("id").eq("event_id", event.id).eq("venue_id", params.venueId).maybeSingle(),
    getSquaresMoments(event.id),
  ]);
  if (boardRead.error) return { ok: false, error: boardRead.error.message };
  if (!momentsRead.ok) return { ok: false, error: momentsRead.error };
  const boardId = (boardRead.data as { id: string } | null)?.id ?? null;

  let claims: SquaresBoardView["claims"] = [];
  const winners = new Map<string, { username: string; mine: boolean } | null>();
  if (boardId) {
    const [claimsRead, resultsRead] = await Promise.all([
      supabaseAdmin.from("squares_claims").select("cell, user_id, users(username)").eq("board_id", boardId).order("cell"),
      supabaseAdmin
        .from("squares_results")
        .select("moment, grade_no, user_id, users(username)")
        .eq("board_id", boardId)
        .is("voided_at", null),
    ]);
    if (claimsRead.error) return { ok: false, error: claimsRead.error.message };
    if (resultsRead.error) return { ok: false, error: resultsRead.error.message };
    claims = ((claimsRead.data ?? []) as Array<{ cell: number; user_id: string; users: Embedded }>).map((row) => ({
      cell: Number(row.cell),
      username: usernameOf(row.users),
      mine: params.userId !== null && row.user_id === params.userId,
    }));
    for (const row of (resultsRead.data ?? []) as Array<{ moment: string; grade_no: number; user_id: string | null; users: Embedded }>) {
      winners.set(
        `${row.moment}:${row.grade_no}`,
        row.user_id ? { username: usernameOf(row.users), mine: params.userId !== null && row.user_id === params.userId } : null,
      );
    }
  }

  const drawn = Boolean(event.drawnAt);
  return {
    ok: true,
    view: {
      event: {
        id: event.id,
        season: event.season,
        colTeam: teamView(event.colTeam),
        rowTeam: teamView(event.rowTeam),
        kickoffAt: event.kickoffAt,
        lockAt: event.lockAt,
        phase: squaresEventPhase(
          {
            lockAtMs: Date.parse(event.lockAt),
            drawnAtMs: event.drawnAt ? Date.parse(event.drawnAt) : null,
            completedAtMs: event.completedAt ? Date.parse(event.completedAt) : null,
            archivedAtMs: null,
          },
          nowMs,
        ),
        colDigits: drawn ? event.colDigits : null,
        rowDigits: drawn ? event.rowDigits : null,
        liveScore: event.liveScore
          ? { col: event.liveScore.col, row: event.liveScore.row, status: event.liveScore.status }
          : null,
      },
      claims,
      myCells: claims.filter((claim) => claim.mine).map((claim) => claim.cell),
      cap: SQUARES_PER_PLAYER_CAP,
      moments: SQUARES_MOMENTS.map((moment) => {
        const record = momentsRead.value.find((item) => item.moment === moment);
        const graded = record?.graded ?? null;
        return {
          moment,
          points: squaresMomentPoints(moment),
          result: graded
            ? {
                col: graded.col,
                row: graded.row,
                winningCell: graded.winningCell,
                winner: winners.get(`${moment}:${record?.gradeNo}`) ?? null,
              }
            : null,
        };
      }),
    },
  };
}

export type SquaresClaimOutcome =
  | "claimed"
  | "released"
  | "already_yours"
  | "taken"
  | "cap_reached"
  | "not_yours"
  | "locked"
  | "no_event"
  | "user_not_found"
  | "wrong_venue";

export type SquaresClaimResult =
  | { ok: true; outcome: SquaresClaimOutcome; myCells: number[] }
  | { ok: false; code: "unavailable" | "rpc_missing" | "rpc_failed"; error: string };

/** Claim or release one cell on the player's venue board (squares_claim: cap, lock, uniqueness). */
export async function claimSquaresCell(params: {
  userId: string;
  venueId: string;
  cell: number;
  action: "claim" | "release";
}): Promise<SquaresClaimResult> {
  if (!supabaseAdmin) return { ok: false, code: "unavailable", error: "Supabase admin client is not configured." };
  const current = await getCurrentSquaresEvent();
  if (!current.ok) return { ok: false, code: "rpc_failed", error: current.error };
  if (!current.value) return { ok: true, outcome: "no_event", myCells: [] };

  const { data, error } = await supabaseAdmin.rpc("squares_claim", {
    p_event_id: current.value.id,
    p_user_id: params.userId,
    p_venue_id: params.venueId,
    p_cell: params.cell,
    p_action: params.action,
  });
  if (error) {
    const missing = isMissingFunction(error, "squares_claim");
    console.error(missing ? "[Squares] rpc-missing" : "[Squares] claim-failed", { message: error.message });
    return { ok: false, code: missing ? "rpc_missing" : "rpc_failed", error: error.message };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { claim_outcome?: SquaresClaimOutcome; claim_cells?: number[] | null } | undefined;
  if (!row?.claim_outcome) return { ok: false, code: "rpc_failed", error: "The claim returned nothing." };
  return { ok: true, outcome: row.claim_outcome, myCells: (row.claim_cells ?? []).map(Number) };
}

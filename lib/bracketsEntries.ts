import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";
import {
  bracketKindPhase,
  hasFullField,
  type BracketGameState,
  type BracketKindPhase,
} from "@/lib/brackets/games";
import { bracketPicksProblem, copyableBracketPicks, isBracketTiebreaker } from "@/lib/brackets/picks";
import { bracketMaxPossible, rankBracketEntries } from "@/lib/brackets/scoring";
import { BRACKET_KINDS, BRACKET_SLOT_COUNT, isBracketKind, type BracketGender, type BracketKind } from "@/lib/brackets/tree";
import {
  getBracketGamesFor,
  getBracketTournament,
  listCurrentBracketTournaments,
  tournamentNowMs,
  type BracketTournamentRecord,
} from "@/lib/bracketsStore";

// March Madness brackets — what a player's screen reads and the entry writes
// (docs/squares-and-brackets-plan.md, Phases 7–8). Phase 8's screens call only these routes and the
// pure rules in lib/brackets/. Never a user id in a response: "mine" is decided here. Every read is
// on demand (no polling): standings and the bracket are read when opened.

export type BracketTeamView = { name: string; abbreviation: string; seed: number | null };

export type BracketGameView = {
  round: number;
  location: number;
  /** 0–62; null for an opening-round game. */
  slot: number | null;
  tipAt: string | null;
  status: string | null;
  home: BracketTeamView | null;
  away: BracketTeamView | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerSide: "home" | "away" | null;
  /** Opening round: the round-1 seat its winner fills ("Team A / Team B" in that seat until then). */
  feedsSeat: number | null;
};

export type BracketEntryView = {
  picks: Array<number | null>;
  tiebreaker: number | null;
  pickCount: number;
  score: number;
  maxPossible: number;
  savedAt: string;
};

export type BracketTournamentView = {
  id: string;
  gender: BracketGender;
  season: number;
  rehearsal: boolean;
  /** Four region names; null = show "Region n". */
  regionNames: Array<string | null>;
  winnerSeats: Array<number | null>;
  championshipTotal: number | null;
  games: BracketGameView[];
  kinds: Record<BracketKind, {
    phase: BracketKindPhase;
    lockAt: string | null;
    mine: BracketEntryView | null;
    /** Other venues where this account has this bracket ("Copy my picks from <Venue>"). */
    copyFrom: Array<{ venueId: string; venueName: string; pickCount: number }>;
  }>;
};

export type BracketsViewResult = { ok: true; tournaments: BracketTournamentView[] } | { ok: false; error: string };

const teamView = (team: BracketGameState["homeTeam"]): BracketTeamView | null =>
  team ? { name: team.college || team.name, abbreviation: team.abbreviation, seed: team.seed } : null;

const gameView = (game: BracketGameState): BracketGameView => ({
  round: game.round,
  location: game.location,
  slot: game.slot,
  tipAt: game.tipAt,
  status: game.statusDetail,
  home: teamView(game.homeTeam),
  away: teamView(game.awayTeam),
  homeScore: game.homeScore,
  awayScore: game.awayScore,
  winnerSide: game.winnerSide,
  feedsSeat: game.round === 0 ? game.feedsSeat : null,
});

const picksOf = (value: unknown): Array<number | null> =>
  Array.from({ length: BRACKET_SLOT_COUNT }, (_, i) => {
    const seat = Array.isArray(value) ? value[i] : null;
    return seat === null || seat === undefined ? null : Number(seat);
  });

type EntryRow = {
  id: string;
  tournament_id: string;
  kind: string;
  venue_id: string;
  picks: number[] | null;
  tiebreaker: number | null;
  pick_count: number;
  score: number;
  submitted_at: string;
};

const ENTRY_COLUMNS = "id, tournament_id, kind, venue_id, picks, tiebreaker, pick_count, score, submitted_at";

/** The tournaments a venue shows: live ones everywhere, rehearsals only at hidden venues. */
async function tournamentsForVenue(venueId: string): Promise<{ ok: true; value: BracketTournamentRecord[] } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin client is not configured." };
  const current = await listCurrentBracketTournaments();
  if (!current.ok) return current;
  if (!current.value.some((t) => t.purpose === "rehearsal")) return { ok: true, value: current.value };
  const { data, error } = await supabaseAdmin.from("venues").select("hidden").eq("id", venueId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  const hidden = (data as { hidden?: boolean | null } | null)?.hidden === true;
  return { ok: true, value: current.value.filter((t) => t.purpose === "live" || hidden) };
}

/** The whole bracket screen for one venue, from the reader's point of view (`userId` may be null). */
export async function getBracketsView(params: { venueId: string; userId: string | null; nowMs?: number }): Promise<BracketsViewResult> {
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin client is not configured." };
  const nowMs = params.nowMs ?? Date.now();
  const tournaments = await tournamentsForVenue(params.venueId);
  if (!tournaments.ok) return tournaments;
  if (tournaments.value.length === 0) return { ok: true, tournaments: [] };
  const ids = tournaments.value.map((t) => t.id);
  const games = await getBracketGamesFor(ids);
  if (!games.ok) return games;

  // My entries at this venue, and this account's entries at other venues (for "copy my picks").
  const mine = new Map<string, EntryRow>();
  const siblings: Array<EntryRow & { venueName: string }> = [];
  if (params.userId) {
    const { data: me, error: meError } = await supabaseAdmin
      .from("users")
      .select("account_id, venue_id")
      .eq("id", params.userId)
      .maybeSingle();
    if (meError) return { ok: false, error: meError.message };
    const accountId = (me as { account_id?: string | null } | null)?.account_id ?? null;
    let userIds = [params.userId];
    if (accountId) {
      const { data: profiles, error } = await supabaseAdmin.from("users").select("id").eq("account_id", accountId).limit(50);
      if (error) return { ok: false, error: error.message };
      userIds = [...new Set([params.userId, ...((profiles ?? []) as Array<{ id: string }>).map((p) => p.id)])];
    }
    const { data: entries, error } = await supabaseAdmin
      .from("bracket_entries")
      .select(`${ENTRY_COLUMNS}, user_id, venues(name)`)
      .in("tournament_id", ids)
      .in("user_id", userIds);
    if (error) return { ok: false, error: error.message };
    for (const row of (entries ?? []) as Array<EntryRow & { user_id: string; venues: { name?: string | null } | Array<{ name?: string | null }> | null }>) {
      if (row.user_id === params.userId) mine.set(`${row.tournament_id}:${row.kind}`, row);
      else {
        const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues;
        siblings.push({ ...row, venueName: String(venue?.name ?? "").trim() || "Another venue" });
      }
    }
  }

  const views = tournaments.value.map((t): BracketTournamentView => {
    const tournamentGames = games.value.get(t.id) ?? [];
    const tNow = tournamentNowMs(t, nowMs);
    const fullField = hasFullField(tournamentGames);
    const kinds = Object.fromEntries(
      BRACKET_KINDS.map((kind) => {
        const lockAt = kind === "main" ? t.mainLockAt : t.secondLockAt;
        const phase = bracketKindPhase({ kind, nowMs: tNow, lockAt, fullField, winnerSeats: t.winnerSeats });
        const row = mine.get(`${t.id}:${kind}`);
        const picks = row ? picksOf(row.picks) : null;
        return [
          kind,
          {
            phase,
            lockAt,
            mine:
              row && picks
                ? {
                    picks,
                    tiebreaker: row.tiebreaker,
                    pickCount: Number(row.pick_count),
                    score: Number(row.score),
                    maxPossible: bracketMaxPossible(picks, t.winnerSeats, kind),
                    savedAt: row.submitted_at,
                  }
                : null,
            copyFrom:
              phase === "open"
                ? siblings
                    .filter((s) => s.tournament_id === t.id && s.kind === kind && s.venue_id !== params.venueId && s.pick_count > 0)
                    .map((s) => ({ venueId: s.venue_id, venueName: s.venueName, pickCount: Number(s.pick_count) }))
                : [],
          },
        ];
      }),
    ) as BracketTournamentView["kinds"];
    return {
      id: t.id,
      gender: t.gender,
      season: t.season,
      rehearsal: t.purpose === "rehearsal",
      regionNames: t.regionNames,
      winnerSeats: t.winnerSeats,
      championshipTotal: t.championshipTotal,
      games: tournamentGames.map(gameView),
      kinds,
    };
  });
  return { ok: true, tournaments: views };
}

export type BracketSaveOutcome =
  | "saved"
  | "not_open"
  | "locked"
  | "no_tournament"
  | "user_not_found"
  | "wrong_venue"
  | "rehearsal_only"
  | "invalid_picks"
  | "invalid_tiebreaker";

/** HTTP status for each save outcome (shared by the entry and copy routes). */
export const BRACKET_SAVE_STATUS: Record<BracketSaveOutcome, number> = {
  saved: 200,
  not_open: 409,
  locked: 409,
  no_tournament: 404,
  user_not_found: 403,
  wrong_venue: 403,
  rehearsal_only: 403,
  invalid_picks: 400,
  invalid_tiebreaker: 400,
};

export type BracketSaveResult =
  | { ok: true; outcome: BracketSaveOutcome; savedAt: string | null; problem: string | null }
  | { ok: false; error: string };

const SAVE_RPC = "bracket_save_entry";

/** The only caller of bracket_save_entry. Every rule is enforced inside the RPC (database clock). */
export async function saveBracketEntry(params: {
  tournamentId: string;
  kind: BracketKind;
  userId: string;
  venueId: string;
  picks: ReadonlyArray<number | null>;
  tiebreaker: number | null;
}): Promise<BracketSaveResult> {
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin client is not configured." };
  const { data, error } = await supabaseAdmin.rpc(SAVE_RPC, {
    p_tournament_id: params.tournamentId,
    p_kind: params.kind,
    p_user_id: params.userId,
    p_venue_id: params.venueId,
    p_picks: [...params.picks],
    p_tiebreaker: params.tiebreaker,
  });
  if (error) {
    const missing = isMissingFunction(error, SAVE_RPC);
    console.error(missing ? "[Brackets] rpc-missing" : "[Brackets] save-failed", { message: error.message });
    return { ok: false, error: error.message };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { save_outcome: BracketSaveOutcome; save_saved_at: string | null; save_problem: string | null }
    | undefined;
  if (!row) return { ok: false, error: "No answer from the save." };
  return { ok: true, outcome: row.save_outcome, savedAt: row.save_saved_at, problem: row.save_problem };
}

/** Parse a request's picks: 63 seats or nulls. Null when malformed. */
export const parseBracketPicks = (value: unknown): Array<number | null> | null => {
  if (!Array.isArray(value) || value.length !== BRACKET_SLOT_COUNT) return null;
  const picks: Array<number | null> = [];
  for (const item of value) {
    if (item === null) picks.push(null);
    else if (typeof item === "number" && Number.isInteger(item) && item >= 0 && item < 64) picks.push(item);
    else return null;
  }
  return picks;
};

export const parseBracketTiebreaker = (value: unknown): number | null | undefined =>
  value === null || value === undefined ? null : isBracketTiebreaker(value) ? value : undefined;

export type BracketCopyResult =
  | BracketSaveResult
  | { ok: true; outcome: "no_source" | "source_invalid"; savedAt: null; problem: string | null };

/**
 * "Copy my picks from <Venue>": the same account's entry at `fromVenueId` → this venue's entry, as a
 * normal save (same lock and venue rules). Never copies another player's bracket.
 */
export async function copyBracketEntry(params: {
  tournamentId: string;
  kind: BracketKind;
  userId: string;
  venueId: string;
  fromVenueId: string;
}): Promise<BracketCopyResult> {
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin client is not configured." };
  const { data: me, error: meError } = await supabaseAdmin.from("users").select("account_id").eq("id", params.userId).maybeSingle();
  if (meError) return { ok: false, error: meError.message };
  const accountId = (me as { account_id?: string | null } | null)?.account_id ?? null;
  if (!accountId) return { ok: true, outcome: "no_source", savedAt: null, problem: null };
  const { data: source, error: sourceError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("account_id", accountId)
    .eq("venue_id", params.fromVenueId)
    .maybeSingle();
  if (sourceError) return { ok: false, error: sourceError.message };
  const sourceUserId = (source as { id?: string } | null)?.id;
  if (!sourceUserId || sourceUserId === params.userId) return { ok: true, outcome: "no_source", savedAt: null, problem: null };
  const { data: entry, error: entryError } = await supabaseAdmin
    .from("bracket_entries")
    .select("picks, tiebreaker")
    .eq("tournament_id", params.tournamentId)
    .eq("kind", params.kind)
    .eq("user_id", sourceUserId)
    .maybeSingle();
  if (entryError) return { ok: false, error: entryError.message };
  if (!entry) return { ok: true, outcome: "no_source", savedAt: null, problem: null };
  const tournament = await getBracketTournament(params.tournamentId);
  if (!tournament.ok) return { ok: false, error: tournament.error };
  const sourcePicks = picksOf((entry as { picks: unknown }).picks);
  const picks = copyableBracketPicks(sourcePicks, params.kind, tournament.value?.winnerSeats ?? []);
  if (!picks) {
    return {
      ok: true,
      outcome: "source_invalid",
      savedAt: null,
      problem: bracketPicksProblem(sourcePicks, params.kind, tournament.value?.winnerSeats ?? []),
    };
  }
  return saveBracketEntry({
    tournamentId: params.tournamentId,
    kind: params.kind,
    userId: params.userId,
    venueId: params.venueId,
    picks,
    tiebreaker: (entry as { tiebreaker: number | null }).tiebreaker,
  });
}

export type BracketStandingView = {
  rank: number;
  username: string;
  score: number;
  maxPossible: number;
  pickCount: number;
  mine: boolean;
};

export type BracketStandingsResult =
  | { ok: true; standings: BracketStandingView[]; championshipTotal: number | null }
  | { ok: false; error: string; status: number };

/** One venue's standings for one bracket (Plan §3: points, tiebreaker distance, earliest save). */
export async function getBracketStandings(params: {
  tournamentId: string;
  kind: BracketKind;
  venueId: string;
  userId: string | null;
}): Promise<BracketStandingsResult> {
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin client is not configured.", status: 503 };
  if (!isBracketKind(params.kind)) return { ok: false, error: "Unknown bracket.", status: 400 };
  const tournaments = await tournamentsForVenue(params.venueId);
  if (!tournaments.ok) return { ok: false, error: tournaments.error, status: 503 };
  const tournament = tournaments.value.find((t) => t.id === params.tournamentId);
  if (!tournament) return { ok: false, error: "Unknown bracket.", status: 404 };
  const { data, error } = await supabaseAdmin
    .from("bracket_entries")
    .select("id, user_id, picks, tiebreaker, pick_count, score, submitted_at, users(username)")
    .eq("tournament_id", tournament.id)
    .eq("kind", params.kind)
    .eq("venue_id", params.venueId)
    .gt("pick_count", 0)
    .order("score", { ascending: false })
    .limit(1000);
  if (error) return { ok: false, error: error.message, status: 503 };
  type Row = EntryRow & { user_id: string; users: { username?: string | null } | Array<{ username?: string | null }> | null };
  const rows = (data ?? []) as Row[];
  const ranked = rankBracketEntries(
    rows.map((row) => ({
      entryId: row.id,
      score: Number(row.score),
      tiebreaker: row.tiebreaker,
      submittedAt: row.submitted_at,
      row,
    })),
    tournament.championshipTotal,
  );
  return {
    ok: true,
    championshipTotal: tournament.championshipTotal,
    standings: ranked.map((entry) => {
      const user = Array.isArray(entry.row.users) ? entry.row.users[0] : entry.row.users;
      return {
        rank: entry.rank,
        username: String(user?.username ?? "").trim() || "Player",
        score: entry.score,
        maxPossible: bracketMaxPossible(picksOf(entry.row.picks), tournament.winnerSeats, params.kind),
        pickCount: Number(entry.row.pick_count),
        mine: params.userId !== null && entry.row.user_id === params.userId,
      };
    }),
  };
}

import "server-only";

import {
  SEASONAL_GAME_WINDOWS,
  isBracketsEnabled,
  isBracketsRehearsalEnabled,
  seasonalWindowState,
  type SeasonalWindow,
} from "@/lib/seasonalGames";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  autoBracketLocks,
  bracketKindPhase,
  bracketWinnerSeats,
  hasFullField,
  type BracketGameState,
  type BracketKindPhase,
  type BracketTeam,
} from "@/lib/brackets/games";
import {
  BRACKET_KINDS,
  BRACKET_SEAT_COUNT,
  BRACKET_SLOT_COUNT,
  isBracketGender,
  isBracketKind,
  slotOf,
  slotsOfRound,
  type BracketGender,
  type BracketKind,
} from "@/lib/brackets/tree";
import {
  bracketsFeedSeason,
  bracketsSyncMode,
  isBracketSyncAutomatic,
  runBracketsTick,
  syncBracketTournament,
  type BracketSyncReport,
  type BracketsSyncMode,
  type BracketsTickReport,
} from "@/lib/bracketsSync";
import {
  TOURNAMENT_COLUMNS,
  createBracketTournament,
  getBracketGames,
  getBracketRounds,
  getBracketTournament,
  listCurrentBracketTournaments,
  lockPassedPatch,
  logBracketsAdmin,
  recordBracketResults,
  recordedChampionshipTotal,
  tournamentFromRow,
  tournamentNowMs,
  updateBracketGameColumns,
  updateBracketTournament,
  type BracketPurpose,
  type BracketRoundRecord,
  type BracketTournamentRecord,
} from "@/lib/bracketsStore";

// March Madness brackets admin panel: status + fix-ups (plan Phase 7). Every change is written to
// bracket_admin_log with the admin's username. The sync does the normal work; these exist for when
// the feed or the schedule needs a human — above all on Selection Sunday (region names, an
// opening-round game the feed doesn't place) and for a wrong result.

export type BracketsAdminTournament = {
  tournament: BracketTournamentRecord;
  /** The tournament's own clock (a rehearsal's replay time). */
  clockNow: string;
  phases: Record<BracketKind, BracketKindPhase>;
  entries: Record<BracketKind, number>;
  rounds: BracketRoundRecord[];
  games: BracketGameState[];
  /** Every team seen in this tournament's games, for "set a seat's team". */
  teams: BracketTeam[];
  problems: string[];
};

export type BracketsAdminOverview = {
  flags: {
    enabled: boolean;
    rehearsal: boolean;
    syncMode: BracketsSyncMode | null;
    season: number;
    window: SeasonalWindow;
  };
  tournaments: BracketsAdminTournament[];
  log: Array<{ id: string; tournamentId: string | null; action: string; actor: string; detail: Record<string, unknown>; createdAt: string }>;
  archived: Array<{ id: string; gender: BracketGender; season: number; purpose: BracketPurpose; archivedAt: string }>;
};

export type BracketsAdminAction =
  | { action: "discover" }
  | { action: "run_now" }
  | { action: "create"; gender: BracketGender; season: number; purpose: BracketPurpose; asOf: string | null }
  | { action: "dry_run"; tournamentId: string }
  | { action: "sync"; tournamentId: string }
  | { action: "set_region_names"; tournamentId: string; names: Array<string | null> }
  | { action: "link_opener"; tournamentId: string; location: number; seat: number | null }
  | { action: "set_seat_team"; tournamentId: string; slot: number; side: "home" | "away"; teamId: number | null }
  | {
      action: "override_result";
      tournamentId: string;
      round: number;
      location: number;
      winner: "home" | "away" | null;
      reason: string;
      /** Championship only, both or neither (plan 10.2): the final score when the feed has none. */
      scores: { home: number; away: number } | null;
    }
  | { action: "release_result"; tournamentId: string; round: number; location: number; reason: string }
  | { action: "move_lock"; tournamentId: string; kind: BracketKind; lockAt: string | null }
  | { action: "set_clock"; tournamentId: string; asOf: string }
  | { action: "archive"; tournamentId: string; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const reasonOf = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length >= 3 && text.length <= 400 ? text : null;
};
const isoOf = (value: unknown): string | null =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : null;

/** Validates an admin request body. Returns an error message for anything malformed. */
export const parseBracketsAdminAction = (body: unknown): BracketsAdminAction | { error: string } => {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const action = input.action;
  if (action === "discover" || action === "run_now") return { action };
  if (action === "create") {
    if (!isBracketGender(input.gender)) return { error: "gender must be men or women." };
    if (!isInt(input.season, 2000, 2100)) return { error: "season must be the year the season started (e.g. 2026 for March 2027)." };
    const purpose: BracketPurpose = input.purpose === "rehearsal" ? "rehearsal" : "live";
    const asOf = isoOf(input.asOf);
    if (purpose === "rehearsal" && !asOf) return { error: "A rehearsal needs a replay time (asOf)." };
    if (purpose === "live" && input.asOf) return { error: "A live tournament runs on real time (no asOf)." };
    return { action, gender: input.gender, season: input.season, purpose, asOf };
  }
  const tournamentId = typeof input.tournamentId === "string" && UUID.test(input.tournamentId) ? input.tournamentId : null;
  if (!tournamentId) return { error: "tournamentId is required." };
  switch (action) {
    case "dry_run":
    case "sync":
      return { action, tournamentId };
    case "set_region_names": {
      const names = Array.isArray(input.names) ? input.names : null;
      if (!names || names.length !== 4) return { error: "Four region names are required (blank = Region n)." };
      const clean = names.map((name) => (typeof name === "string" && name.trim() ? name.trim() : null));
      if (clean.some((name) => name !== null && name.length > 40)) return { error: "A region name is at most 40 characters." };
      return { action, tournamentId, names: clean };
    }
    case "link_opener": {
      if (!isInt(input.location, 1, 32)) return { error: "location must be the opening-round game's location." };
      if (input.seat !== null && !isInt(input.seat, 0, BRACKET_SEAT_COUNT - 1)) return { error: "seat must be 0–63, or null to unlink." };
      return { action, tournamentId, location: input.location, seat: input.seat as number | null };
    }
    case "set_seat_team": {
      if (!isInt(input.slot, 0, 31)) return { error: "slot must be a Round-of-64 game (0–31)." };
      if (input.side !== "home" && input.side !== "away") return { error: "side must be home or away." };
      if (input.teamId !== null && !isInt(input.teamId, 1, Number.MAX_SAFE_INTEGER)) return { error: "teamId must be a team's id, or null for TBD." };
      return { action, tournamentId, slot: input.slot, side: input.side, teamId: input.teamId as number | null };
    }
    case "override_result": {
      if (!isInt(input.round, 0, 6) || !isInt(input.location, 1, 32)) return { error: "round (0–6) and location are required." };
      if (input.round > 0 && slotOf(input.round, input.location) === null) return { error: "No such game." };
      if (input.winner !== "home" && input.winner !== "away" && input.winner !== null) return { error: "winner must be home, away, or null to clear." };
      const reason = reasonOf(input.reason);
      if (!reason) return { error: "A reason (3–400 characters) is required." };
      const given = (value: unknown) => value !== undefined && value !== null && value !== "";
      let scores: { home: number; away: number } | null = null;
      if (given(input.homeScore) || given(input.awayScore)) {
        if (input.round !== 6) return { error: "A score can be entered only for the championship." };
        if (!isInt(input.homeScore, 0, 200) || !isInt(input.awayScore, 0, 200)) return { error: "Enter both scores (0–200 each), or neither." };
        if (input.winner === null) return { error: "A score needs a winner (No result has no score)." };
        const [winning, losing] = input.winner === "home" ? [input.homeScore, input.awayScore] : [input.awayScore, input.homeScore];
        if (winning <= losing) return { error: "The winner's score must be higher than the loser's." };
        scores = { home: input.homeScore, away: input.awayScore };
      }
      return { action, tournamentId, round: input.round, location: input.location, winner: input.winner, reason, scores };
    }
    case "release_result": {
      if (!isInt(input.round, 0, 6) || !isInt(input.location, 1, 32)) return { error: "round (0–6) and location are required." };
      if (input.round > 0 && slotOf(input.round, input.location) === null) return { error: "No such game." };
      const reason = reasonOf(input.reason);
      if (!reason) return { error: "A reason (3–400 characters) is required." };
      return { action, tournamentId, round: input.round, location: input.location, reason };
    }
    case "move_lock": {
      if (!isBracketKind(input.kind)) return { error: "kind must be main or second." };
      const lockAt = input.lockAt === null ? null : isoOf(input.lockAt);
      if (input.lockAt !== null && !lockAt) return { error: "lockAt must be a date and time, or null to follow the feed." };
      return { action, tournamentId, kind: input.kind, lockAt };
    }
    case "set_clock": {
      const asOf = isoOf(input.asOf);
      return asOf ? { action, tournamentId, asOf } : { error: "asOf must be a date and time." };
    }
    case "archive": {
      const reason = reasonOf(input.reason);
      return reason ? { action, tournamentId, reason } : { error: "A reason (3–400 characters) is required." };
    }
    default:
      return { error: "Unknown action." };
  }
};

const teamsOf = (games: readonly BracketGameState[]): BracketTeam[] => {
  const byId = new Map<number, BracketTeam>();
  for (const game of games) for (const team of [game.homeTeam, game.awayTeam]) if (team) byId.set(team.id, team);
  return [...byId.values()].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || a.college.localeCompare(b.college));
};

const FIRST_ROUND_NAME: Record<BracketKind, string> = { main: "Round-of-64", second: "Sweet 16" };

/**
 * An admin lock later than the kind's first tip (tournament clock), or null. Entries would stay
 * open while games are played (plan 10.2, §17 B5). No tips known = nothing to compare with.
 */
export const lockAfterFirstTip = (kind: BracketKind, lockAt: string | null, games: readonly BracketGameState[]): string | null => {
  const firstTip = autoBracketLocks(games)[kind];
  return lockAt && firstTip && Date.parse(lockAt) > Date.parse(firstTip) ? firstTip : null;
};

/**
 * Why an admin can't move this lock there, or null (plan 10.2). `lockAt` null = Follow feed. Once
 * the kind has started, a move may only make the lock EARLIER (plan 10.5.1): a late admin lock can
 * still be pulled in, but entries never reopen. A lock moved into the past closes entries at once.
 * Pure.
 */
export const lockMoveRefusal = (
  kind: BracketKind,
  lockAt: string | null,
  currentLockAt: string | null,
  games: readonly BracketGameState[],
  winnerSeats: ReadonlyArray<number | null>,
  tournamentNow: number,
): string | null => {
  if (kindHasStarted(kind, games, winnerSeats, tournamentNow)) {
    const target = lockAt ?? autoBracketLocks(games)[kind];
    if (currentLockAt && target && Date.parse(target) <= Date.parse(currentLockAt)) return null;
    return currentLockAt
      ? `This bracket's first games have already tipped, so its lock can only move earlier (${new Date(currentLockAt).toISOString()} or before).`
      : "This bracket's first games have already tipped, so its lock can't move.";
  }
  const firstTip = lockAfterFirstTip(kind, lockAt, games);
  return firstTip
    ? `The lock can't be after the first ${FIRST_ROUND_NAME[kind]} tip (${new Date(firstTip).toISOString()}): entries would stay open while games are played. Pick that time or earlier, or Follow feed.`
    : null;
};

/** Things an admin should look at before the lock (Selection Sunday) or during the tournament. */
export const bracketProblems = (
  tournament: BracketTournamentRecord,
  games: readonly BracketGameState[],
  tournamentNow: number,
): string[] => {
  const problems: string[] = [];
  const round1 = games.filter((g) => g.round === 1);
  if (round1.length < 32) problems.push(`Only ${round1.length} of 32 Round-of-64 games are in the feed.`);
  const openers = games.filter((g) => g.round === 0);
  const linked = new Set(openers.map((g) => g.feedsSeat).filter((seat): seat is number => seat !== null));
  for (const game of round1) {
    for (const side of ["home", "away"] as const) {
      const seat = 2 * (game.slot as number) + (side === "home" ? 0 : 1);
      if (!(side === "home" ? game.homeTeam : game.awayTeam) && !linked.has(seat)) {
        problems.push(`Round of 64 game ${game.location} (${side}) has no team and no opening-round game linked to it.`);
      }
    }
  }
  for (const opener of openers) {
    if (opener.feedsSeat === null) problems.push(`Opening-round game ${opener.location} isn't linked to a Round-of-64 seat.`);
  }
  if (tournament.regionNames.every((name) => name === null)) problems.push("Region names aren't set (players see Region 1–4).");
  for (const game of games) {
    if (game.mismatchNote) problems.push(`Round ${game.round} game ${game.location}: ${game.mismatchNote}`);
    else if (game.resultHeld) problems.push(`Round ${game.round} game ${game.location} is held (No result): the feed won't decide it until you let it.`);
  }
  if (round1.length === 32 && !tournament.mainLockAt) problems.push("The main bracket has no lock time (no tip times in the feed).");
  for (const kind of BRACKET_KINDS) {
    const lockAt = kind === "main" ? tournament.mainLockAt : tournament.secondLockAt;
    const setBy = kind === "main" ? tournament.mainLockSetBy : tournament.secondLockSetBy;
    if (setBy === "admin" && lockAt && tournamentNow < Date.parse(lockAt) && lockAfterFirstTip(kind, lockAt, games)) {
      problems.push(`The ${kind === "main" ? "main bracket" : "second-chance"} lock is after the first ${FIRST_ROUND_NAME[kind]} tip: entries stay open during games. Move it to the first tip or earlier, or press Follow feed.`);
    }
  }
  if ((tournament.winnerSeats[BRACKET_SLOT_COUNT - 1] ?? null) !== null && tournament.championshipTotal === null) {
    problems.push("The championship has no final score, so prizes can't settle: enter it with Override on the championship game.");
  }
  return problems;
};

export async function getBracketsAdminOverview(nowMs: number = Date.now()): Promise<{ ok: true; overview: BracketsAdminOverview } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin client is not configured." };
  const current = await listCurrentBracketTournaments();
  if (!current.ok) return current;
  const tournaments: BracketsAdminTournament[] = [];
  for (const tournament of current.value) {
    const [games, rounds] = await Promise.all([getBracketGames(tournament.id), getBracketRounds(tournament.id)]);
    if (!games.ok) return games;
    if (!rounds.ok) return rounds;
    const entries = {} as Record<BracketKind, number>;
    for (const kind of BRACKET_KINDS) {
      const { count, error } = await supabaseAdmin
        .from("bracket_entries")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournament.id)
        .eq("kind", kind);
      if (error) return { ok: false, error: error.message };
      entries[kind] = count ?? 0;
    }
    const tNow = tournamentNowMs(tournament, nowMs);
    const fullField = hasFullField(games.value);
    tournaments.push({
      tournament,
      clockNow: new Date(tNow).toISOString(),
      phases: {
        main: bracketKindPhase({ kind: "main", nowMs: tNow, lockAt: tournament.mainLockAt, fullField, winnerSeats: tournament.winnerSeats }),
        second: bracketKindPhase({ kind: "second", nowMs: tNow, lockAt: tournament.secondLockAt, fullField, winnerSeats: tournament.winnerSeats }),
      },
      entries,
      rounds: rounds.value,
      games: games.value,
      teams: teamsOf(games.value),
      problems: bracketProblems(tournament, games.value, tNow),
    });
  }
  const { data: logRows, error: logError } = await supabaseAdmin
    .from("bracket_admin_log")
    .select("id, tournament_id, action, actor, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (logError) return { ok: false, error: logError.message };
  const { data: archivedRows, error: archivedError } = await supabaseAdmin
    .from("bracket_tournaments")
    .select(TOURNAMENT_COLUMNS)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(10);
  if (archivedError) return { ok: false, error: archivedError.message };
  return {
    ok: true,
    overview: {
      flags: {
        enabled: isBracketsEnabled(),
        rehearsal: isBracketsRehearsalEnabled(),
        syncMode: bracketsSyncMode(new Date(nowMs)),
        season: bracketsFeedSeason(),
        window: SEASONAL_GAME_WINDOWS.bracket,
      },
      tournaments,
      log: ((logRows ?? []) as Array<{ id: string; tournament_id: string | null; action: string; actor: string; detail: Record<string, unknown>; created_at: string }>).map((row) => ({
        id: row.id,
        tournamentId: row.tournament_id,
        action: row.action,
        actor: row.actor,
        detail: row.detail ?? {},
        createdAt: row.created_at,
      })),
      archived: ((archivedRows ?? []) as Parameters<typeof tournamentFromRow>[0][]).map(tournamentFromRow).map((t) => ({
        id: t.id,
        gender: t.gender,
        season: t.season,
        purpose: t.purpose,
        archivedAt: t.archivedAt as string,
      })),
    },
  };
}

export type BracketsAdminResult =
  | { ok: true; message: string; tick?: BracketsTickReport; sync?: BracketSyncReport }
  | { ok: false; status: number; error: string };

const refuse = (status: number, error: string): BracketsAdminResult => ({ ok: false, status, error });

/**
 * Has any game of the kind's first round tipped (on the tournament's clock) or been decided? Then
 * its lock can't move: moving it later would reopen entries while games are being played.
 */
export const kindHasStarted = (
  kind: BracketKind,
  games: readonly BracketGameState[],
  winnerSeats: ReadonlyArray<number | null>,
  tournamentNow: number,
): boolean => {
  const round = kind === "main" ? 1 : 3;
  if (slotsOfRound(round).some((slot) => (winnerSeats[slot] ?? null) !== null)) return true;
  return games.some((g) => g.round === round && g.tipAt !== null && Date.parse(g.tipAt) <= tournamentNow);
};

export async function runBracketsAdminAction(
  action: BracketsAdminAction,
  actor: string,
  nowMs: number = Date.now(),
): Promise<BracketsAdminResult> {
  if (!supabaseAdmin) return refuse(503, "Supabase admin client is not configured.");

  if (action.action === "discover" || action.action === "run_now") {
    const tick = await runBracketsTick({ now: new Date(nowMs), force: true });
    await logBracketsAdmin({ tournamentId: null, action: action.action, detail: { discovered: tick.discovered.length }, actor });
    return { ok: true, message: `Ran the sync: ${tick.synced.length} tournament(s) read, ${tick.discovered.length} discovered.`, tick };
  }

  if (action.action === "create") {
    const clockOffsetSeconds = action.asOf ? Math.round((nowMs - Date.parse(action.asOf)) / 1000) : 0;
    if (clockOffsetSeconds < 0) return refuse(400, "The replay time must be in the past.");
    const created = await createBracketTournament({
      gender: action.gender,
      season: action.season,
      purpose: action.purpose,
      clockOffsetSeconds,
      createdBy: actor,
    });
    if (!created.ok) {
      return refuse(409, /one_current/.test(created.error) ? "That tournament already exists (archive it first)." : created.error);
    }
    await logBracketsAdmin({
      tournamentId: created.value.id,
      action: "create",
      detail: { gender: action.gender, season: action.season, purpose: action.purpose, asOf: action.asOf },
      actor,
    });
    const sync = await syncBracketTournament(created.value, { realNowMs: nowMs, actor });
    return { ok: true, message: `Created; ${sync.changedGames} games read from the feed.`, sync };
  }

  const found = await getBracketTournament(action.tournamentId);
  if (!found.ok) return refuse(500, found.error);
  const tournament = found.value;
  if (!tournament || tournament.archivedAt) return refuse(404, "No such current tournament.");
  const log = (name: string, detail: Record<string, unknown>) =>
    logBracketsAdmin({ tournamentId: tournament.id, action: name, detail, actor });

  switch (action.action) {
    case "dry_run": {
      const sync = await syncBracketTournament(tournament, { realNowMs: nowMs, dryRun: true });
      return { ok: true, message: "Dry run: nothing was written.", sync };
    }
    case "sync": {
      const sync = await syncBracketTournament(tournament, { realNowMs: nowMs, actor });
      await log("sync", { changedGames: sync.changedGames, newResults: sync.newResults, errors: sync.errors });
      return { ok: true, message: sync.errors.length ? `Synced with errors: ${sync.errors.join("; ")}` : "Synced.", sync };
    }
    case "set_region_names": {
      const updated = await updateBracketTournament(tournament.id, { region_names: action.names });
      if (!updated.ok) return refuse(500, updated.error);
      await log("set_region_names", { names: action.names });
      return { ok: true, message: "Region names saved." };
    }
    case "set_clock": {
      if (tournament.purpose !== "rehearsal") return refuse(409, "Only a rehearsal has a replay clock.");
      const offset = Math.round((nowMs - Date.parse(action.asOf)) / 1000);
      if (offset < 0) return refuse(400, "The replay time must be in the past.");
      // Fix when each lock really passed before the offset changes (plan 10.7.1): a lock already
      // passed on the old clock passed at lock + the old offset; one this jump crosses passes now.
      const locks = { main: tournament.mainLockAt, second: tournament.secondLockAt };
      const lockPassed = {
        ...lockPassedPatch(tournament, locks, Date.parse(action.asOf), { atMs: nowMs }),
        ...lockPassedPatch(tournament, locks, tournamentNowMs(tournament, nowMs), { offsetSeconds: tournament.clockOffsetSeconds }),
      };
      const updated = await updateBracketTournament(tournament.id, {
        clock_offset_seconds: offset,
        ...lockPassed,
        next_sync_at: new Date(nowMs).toISOString(),
      });
      if (!updated.ok) return refuse(500, updated.error);
      await log("set_clock", { asOf: action.asOf, offsetSeconds: offset, ...lockPassed });
      return {
        ok: true,
        message: "Replay clock set; the next sync reads from there. (Moving it back doesn't undo results already recorded.)",
      };
    }
    case "move_lock": {
      const lockGames = await getBracketGames(tournament.id);
      if (!lockGames.ok) return refuse(500, lockGames.error);
      const lockRefusal = lockMoveRefusal(
        action.kind,
        action.lockAt,
        action.kind === "main" ? tournament.mainLockAt : tournament.secondLockAt,
        lockGames.value,
        tournament.winnerSeats,
        tournamentNowMs(tournament, nowMs),
      );
      if (lockRefusal) return refuse(409, lockRefusal);
      const column = action.kind === "main" ? "main_lock" : "second_lock";
      // Follow feed writes the feed's lock now (what the next sync would write), so entries never
      // pass through "no lock" (closed as not_open) in between (plan 10.5.1).
      const updated = await updateBracketTournament(tournament.id, {
        [`${column}_at`]: action.lockAt ?? autoBracketLocks(lockGames.value)[action.kind],
        [`${column}_set_by`]: action.lockAt ? "admin" : "auto",
        next_sync_at: new Date(nowMs).toISOString(),
      });
      if (!updated.ok) return refuse(500, updated.error);
      await log("move_lock", { kind: action.kind, lockAt: action.lockAt, previous: action.kind === "main" ? tournament.mainLockAt : tournament.secondLockAt });
      return { ok: true, message: action.lockAt ? "Lock moved." : "Lock follows the feed again (next sync)." };
    }
    case "archive": {
      const windowOpen = seasonalWindowState(SEASONAL_GAME_WINDOWS.bracket, new Date(nowMs)) !== "hidden";
      if (tournament.purpose === "live" && windowOpen && !tournament.completedAt) {
        return refuse(409, "A live tournament can't be archived while its window is open and it isn't finished: players' screens read it.");
      }
      const updated = await updateBracketTournament(tournament.id, { archived_at: new Date(nowMs).toISOString(), next_sync_at: null });
      if (!updated.ok) return refuse(500, updated.error);
      await log("archive", { reason: action.reason });
      return { ok: true, message: "Archived." };
    }
    default:
      break;
  }

  const gamesRead = await getBracketGames(tournament.id);
  if (!gamesRead.ok) return refuse(500, gamesRead.error);
  const games = gamesRead.value;

  // Every change below writes only its own columns of one game (never the feed's, plan 10.1), then
  // asks for a sync now: the next cron minute re-reads the feed, records and pays. That is what
  // re-pays a re-graded round after the championship, when the sync is otherwise never due again.
  const followUp = async (): Promise<string> => {
    const asked = await updateBracketTournament(tournament.id, { next_sync_at: new Date(nowMs).toISOString() });
    if (!asked.ok) console.error("[Brackets] sync-request-failed", { tournamentId: tournament.id, message: asked.error });
    return asked.ok && isBracketSyncAutomatic(tournament, new Date(nowMs))
      ? "The sync picks it up within a minute."
      : "The automatic sync is off right now: press Sync now.";
  };

  if (action.action === "link_opener") {
    const opener = games.find((g) => g.round === 0 && g.location === action.location);
    if (!opener) return refuse(404, "No such opening-round game.");
    if (action.seat !== null && games.some((g) => g.round === 0 && g !== opener && g.feedsSeat === action.seat)) {
      return refuse(409, "Another opening-round game is already linked to that seat.");
    }
    const saved = await updateBracketGameColumns(tournament.id, opener, {
      feedsSeat: action.seat,
      feedsSeatSetBy: action.seat === null ? null : "admin",
    });
    if (!saved.ok) return refuse(500, saved.error);
    await log("link_opener", { location: action.location, seat: action.seat, previous: opener.feedsSeat });
    return { ok: true, message: `${action.seat === null ? "Unlinked; the sync will try again." : "Linked."} ${await followUp()}` };
  }

  if (action.action === "set_seat_team") {
    const game = games.find((g) => g.round === 1 && g.slot === action.slot);
    if (!game) return refuse(404, "That Round-of-64 game isn't in the feed yet.");
    const team = action.teamId === null ? null : (teamsOf(games).find((t) => t.id === action.teamId) ?? null);
    if (action.teamId !== null && !team) return refuse(404, "That team isn't in this tournament.");
    // Both sides are written: once teams_set_by is 'admin' the feed no longer fills either one.
    const saved = await updateBracketGameColumns(tournament.id, game, {
      teamsSetBy: "admin",
      homeTeam: action.side === "home" ? team : game.homeTeam,
      awayTeam: action.side === "away" ? team : game.awayTeam,
    });
    if (!saved.ok) return refuse(500, saved.error);
    await log("set_seat_team", {
      slot: action.slot,
      side: action.side,
      teamId: action.teamId,
      previous: (action.side === "home" ? game.homeTeam : game.awayTeam)?.id ?? null,
    });
    return { ok: true, message: `Team set. The feed no longer changes this game's teams. ${await followUp()}` };
  }

  if (action.action === "release_result") {
    const game = games.find((g) => g.round === action.round && g.location === action.location);
    if (!game) return refuse(404, "No such game.");
    if (!game.resultHeld) return refuse(409, "This game isn't held.");
    const saved = await updateBracketGameColumns(tournament.id, game, { resultHeld: false, mismatchNote: null });
    if (!saved.ok) return refuse(500, saved.error);
    await log("release_result", { round: action.round, location: action.location, reason: action.reason });
    return { ok: true, message: `The feed decides this game again: the next sync records its final. ${await followUp()}` };
  }

  if (action.action === "override_result") {
    const game = games.find((g) => g.round === action.round && g.location === action.location);
    if (!game) return refuse(404, "No such game.");
    if (action.winner && !(action.winner === "home" ? game.homeTeam : game.awayTeam)) {
      return refuse(409, "That side has no team yet.");
    }
    if (action.scores && game.slot !== BRACKET_SLOT_COUNT - 1) return refuse(409, "A score can be entered only for the championship.");
    // A championship winner the stored score contradicts would settle prizes on that score's total
    // (plan 10.5.2, §22 R5). With new scores the parser already checked the winner is higher.
    if (!action.scores && action.winner && game.slot === BRACKET_SLOT_COUNT - 1 && game.homeScore !== null && game.awayScore !== null) {
      const [chosen, other] = action.winner === "home" ? [game.homeScore, game.awayScore] : [game.awayScore, game.homeScore];
      if (chosen <= other) return refuse(409, "The stored score says the other team won: enter the corrected score too.");
    }
    // "No result" HOLDS the game (result_held): the sync never fills it from the feed until an admin
    // overrides it again or lets the feed decide. A winner clears any hold.
    // The game row first: if the results RPC then fails, the sync reports the disagreement
    // (needsAdmin) instead of overwriting it, and re-applying this override finishes the job.
    const saved = await updateBracketGameColumns(tournament.id, game, {
      winnerSide: action.winner,
      resultSource: action.winner ? "admin" : null,
      resultHeld: action.winner === null,
      mismatchNote: null,
      ...(action.scores ? { homeScore: action.scores.home, awayScore: action.scores.away } : {}),
    });
    if (!saved.ok) return refuse(500, saved.error);
    if (action.round === 0) {
      await log("override_result", { round: 0, location: action.location, winner: action.winner, reason: action.reason });
      return { ok: true, message: `Opening-round result saved (it doesn't score). ${await followUp()}` };
    }
    // Grade from the games as they are now, not the read above: a sync may have filled another game
    // in between, and recording without it would clear (and re-grade) that result.
    const fresh = await getBracketGames(tournament.id);
    if (!fresh.ok) return refuse(500, `The game was saved but the games couldn't be re-read (${fresh.error}). Apply the override again.`);
    // The same total the sync records: a stored one stays when the final's scores are missing.
    const total = recordedChampionshipTotal(fresh.value, tournament);
    const recorded = await recordBracketResults({
      tournamentId: tournament.id,
      winnerSeats: bracketWinnerSeats(fresh.value),
      championshipTotal: total,
      allowChange: true,
      reason: action.reason,
      actor,
    });
    if (!recorded.ok) return refuse(500, `The game was saved but grading failed (${recorded.error}). Apply the override again.`);
    await log("override_result", {
      round: action.round,
      location: action.location,
      winner: action.winner,
      previous: game.winnerSide,
      held: action.winner === null,
      ...(action.scores ? { scores: action.scores, previousScores: { home: game.homeScore, away: game.awayScore } } : {}),
      reason: action.reason,
      regradedRounds: recorded.value.regradedRounds,
      reversedCredits: recorded.value.reversedCredits,
    });
    const regraded = recorded.value.regradedRounds;
    return {
      ok: true,
      message:
        `Result saved${action.winner === null ? " and held: the feed won't fill this game until you let it" : ""}; ` +
        `${recorded.value.gradedEntries} bracket(s) re-scored.` +
        (action.scores
          ? tournament.prizesSettledAt
            ? " Final score saved; prizes were already settled and don't change."
            : ` Final score saved (total ${action.scores.home + action.scores.away}): prizes settle at the next sync.`
          : game.slot === BRACKET_SLOT_COUNT - 1 && action.winner && total === null
            ? " Prizes need the final score: enter both scores and override again."
            : "") +
        (regraded.length
          ? ` Round(s) ${regraded.join(", ")} were already complete: their venue points were taken back and are paid again at the next sync.`
          : "") +
        ` ${await followUp()}`,
    };
  }

  return refuse(400, "Unknown action.");
}

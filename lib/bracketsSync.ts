import "server-only";

import { settleBracketPrizes } from "@/lib/bracketPrizeAwards";
import { creditSeasonalPoints } from "@/lib/seasonalPointsCredit";
import {
  SEASONAL_GAME_WINDOWS,
  isBracketsEnabled,
  isBracketsRehearsalEnabled,
  seasonalWindowState,
} from "@/lib/seasonalGames";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBracketFeed } from "@/lib/bracketsFeed";
import {
  autoBracketLocks,
  bracketWinnerSeats,
  championshipTotal,
  maskBracketFeedAt,
  mergeBracketFeed,
  nextBracketSyncAt,
  BRACKET_IDLE_SYNC_MS,
  BRACKET_LIVE_SYNC_MS,
  type BracketFeedGame,
} from "@/lib/brackets/games";
import {
  bracketCreditKey,
  bracketRoundVenuePoints,
  isBracketRoundComplete,
  kindScoresRound,
} from "@/lib/brackets/scoring";
import { BRACKET_GENDERS, BRACKET_ROUNDS, BRACKET_SLOT_COUNT, isBracketKind, type BracketRound } from "@/lib/brackets/tree";
import {
  bracketTournamentExists,
  createBracketTournament,
  finishBracketSyncRun,
  getBracketGames,
  getBracketRounds,
  getBracketWinnerSeats,
  listCurrentBracketTournaments,
  logBracketsAdmin,
  recordBracketResults,
  saveFeedBracketGames,
  tournamentNowMs,
  updateBracketTournament,
  type BracketTournamentRecord,
} from "@/lib/bracketsStore";

// March Madness brackets — the sync (docs/squares-and-brackets-plan.md, Phase 7). Rides on the
// every-minute /api/cron/pickem-settle like Squares (no vercel.json change).
//
// Cost (plan §6): unless bracketsSyncMode() says so (flag on + card window Mar 14 – Apr 6, or the
// server-side rehearsal switch), a run returns before touching the database or the provider. Then:
//   • one small read of the current tournaments per run (≤ 2 rows; ≈ 1,440/day in the window);
//   • no tournament yet for a gender: one feed request every BRACKETS_DISCOVERY_EVERY_MINUTES (in
//     season only — the rehearsal switch never discovers), plus one read to make sure that
//     tournament wasn't archived (discovery never re-creates one);
//   • a tournament is read from the feed only when its next_sync_at is due: every 2 min while a
//     game is live, else at the next tip or hourly, whichever is first; never after its
//     championship is decided and paid (nextBracketSyncAt). ≈ 30 requests/h per tournament live.
//   Each feed read: one games read, one write of the changed games (bracket_save_feed_games, ≤ 79
//   rows), one results RPC when a winner is new (set-based grading of every entry), one rounds read
//   once a round is complete (+ one winner-seats re-read when a round is due to be paid), and one
//   tournament update (a second one only if an admin asked for a sync during the run).
// Admin corrections (plan 10.1): an admin action that changes results or games sets next_sync_at =
// now, so the next cron minute re-reads and pays — including after the championship, when the sync
// is otherwise never due again. The run never overwrites an admin's game columns (the RPC keeps
// them), records results only against the winner seats it read (else `stale`: it stops and the next
// run starts fresh), and never pushes back a next_sync_at an admin set during the run.
// Final score (plan 10.2): prizes need the championship total (the tiebreaker). A championship
// decided without one (a stalled feed) is read hourly, not every 2 min, and reports needsAdmin until
// the feed or an admin (championship override with scores) supplies it. A known total is never
// cleared by a feed that has none.
// Venue points are paid per entry per round once the whole round is decided: one keyset-paged
// read of the tournament's entries (1,000 a page) for ALL due rounds together (plan 10.4) and one
// credit call per 500 credits — ≈ 20 reads + 40 credit calls per round at 20k entries, once; a
// correction that re-grades several rounds still costs one pass of reads.

export type BracketsSyncMode = { live: boolean; rehearsal: boolean };

/** Which tournaments the cron drives right now; null = do nothing. Pure, no I/O. */
export const bracketsSyncMode = (now: Date): BracketsSyncMode | null => {
  const live = isBracketsEnabled() && seasonalWindowState(SEASONAL_GAME_WINDOWS.bracket, now) === "open";
  const rehearsal = isBracketsRehearsalEnabled();
  return live || rehearsal ? { live, rehearsal } : null;
};

export const isBracketsSyncActive = (now: Date): boolean => bracketsSyncMode(now) !== null;

/** The feed season of the tournament the card window covers (March 2027 = 2026). */
export const bracketsFeedSeason = (): number => Number(SEASONAL_GAME_WINDOWS.bracket.opensOn.slice(0, 4)) - 1;

export const BRACKETS_DISCOVERY_EVERY_MINUTES = 10;

/** Entries read per page when paying a round (PostgREST's row cap is 1,000). */
const PAY_PAGE = 1000;

export type BracketSyncReport = {
  tournamentId: string;
  label: string;
  feed: "read" | "provided" | "failed";
  changedGames: number;
  newResults: number;
  mismatches: number;
  locksMoved: string[];
  paidRounds: number[];
  credited: number;
  /** Bracket prizes settled this run (Phase 9a): cycles answered, or null when not due. */
  prizeCycles: number | null;
  needsAdmin: string | null;
  nextSyncAt: string | null;
  dryRun: boolean;
  errors: string[];
};

export type BracketsTickReport = {
  ran: boolean;
  skipped: "inactive" | "no_database" | null;
  discovered: string[];
  synced: BracketSyncReport[];
  errors: string[];
};

const labelOf = (t: Pick<BracketTournamentRecord, "gender" | "season" | "purpose">): string =>
  `${t.gender === "men" ? "Men's" : "Women's"} ${t.season + 1}${t.purpose === "rehearsal" ? " (rehearsal)" : ""}`;

const isoOrNull = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

const sameInstant = (a: string | null, b: string | null): boolean =>
  a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b));

const modeDrives = (t: Pick<BracketTournamentRecord, "purpose">, mode: BracketsSyncMode | null): boolean =>
  t.purpose === "live" ? Boolean(mode?.live) : Boolean(mode?.rehearsal);

/** The tournament is the sync's to drive in this mode. */
const drives = (t: BracketTournamentRecord, mode: BracketsSyncMode | null, force: boolean): boolean => force || modeDrives(t, mode);

/** Will the every-minute cron pick this tournament up on its own right now? (Admin messages.) */
export const isBracketSyncAutomatic = (t: Pick<BracketTournamentRecord, "purpose">, now: Date): boolean =>
  modeDrives(t, bracketsSyncMode(now));

/** Is it time to read the feed for this tournament? */
export const isBracketSyncDue = (t: BracketTournamentRecord, realNowMs: number): boolean => {
  if (t.nextSyncAt === null) return t.completedAt === null;
  return Date.parse(t.nextSyncAt) <= realNowMs;
};

/**
 * Pay every complete round that hasn't been paid at its current grade_no. Returns the rounds paid.
 * Re-sending is always safe (the ledger key pays once); a round is marked paid only after every
 * page went through, and only if its grade_no is unchanged (an admin correction bumps it).
 */
export async function payCompleteBracketRounds(
  tournament: Pick<BracketTournamentRecord, "id">,
  winnerSeats: ReadonlyArray<number | null>,
): Promise<{ ok: true; paidRounds: number[]; credited: number; allPaid: boolean } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin client is not configured." };
  const complete = BRACKET_ROUNDS.filter((round) => isBracketRoundComplete(round, winnerSeats));
  if (complete.length === 0) return { ok: true, paidRounds: [], credited: 0, allPaid: false };
  const rounds = await getBracketRounds(tournament.id);
  if (!rounds.ok) return { ok: false, error: `rounds read: ${rounds.error}` };
  let due = rounds.value.filter((r) => complete.includes(r.round) && r.paidGradeNo !== r.gradeNo);
  if (due.length > 0) {
    // Re-check completeness against the seats as stored now, read AFTER the rounds (plan 10.1): an
    // admin correction committed before this read shows here (a round it made incomplete isn't
    // paid); one committed after the rounds read bumped grade_no, so the keys paid below are already
    // spent and the paid mark matches nothing. Either way nothing is paid on stale results.
    const fresh = await getBracketWinnerSeats(tournament.id);
    if (!fresh.ok) return { ok: false, error: `winner seats read: ${fresh.error}` };
    due = due.filter((r) => isBracketRoundComplete(r.round, fresh.value));
  }
  // One keyset pass over the entries credits every due round (plan 10.4, §17 B10); each round is
  // then marked paid only if its grade_no is unchanged.
  const paid = await payBracketRounds(tournament.id, due);
  if (!paid.ok) return { ok: false, error: `rounds ${due.map((r) => r.round).join(",")}: ${paid.error}` };
  const paidRounds: number[] = [];
  for (const round of due) {
    const { error } = await supabaseAdmin
      .from("bracket_rounds")
      .update({ paid_grade_no: round.gradeNo, paid_at: new Date().toISOString() })
      .eq("tournament_id", tournament.id)
      .eq("round", round.round)
      .eq("grade_no", round.gradeNo);
    if (error) return { ok: false, error: `mark round ${round.round} paid: ${error.message}` };
    paidRounds.push(round.round);
  }
  const allPaid =
    complete.length === BRACKET_ROUNDS.length &&
    rounds.value.every((r) => r.paidGradeNo === r.gradeNo || paidRounds.includes(r.round));
  return { ok: true, paidRounds, credited: paid.credited, allPaid };
}

/**
 * Credit the venue points of every due round in ONE keyset pass over the tournament's entries (each
 * row carries its `round_correct`), keyed `entry:r<round>:<grade_no>` exactly as before. A page's
 * credits for all due rounds go in one creditSeasonalPoints call (it batches by 500).
 */
async function payBracketRounds(
  tournamentId: string,
  due: ReadonlyArray<{ round: BracketRound; gradeNo: number }>,
): Promise<{ ok: true; credited: number } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin client is not configured." };
  if (due.length === 0) return { ok: true, credited: 0 };
  let after: string | null = null;
  let credited = 0;
  const blocked = new Map<number, number>();
  const roundOfKey = new Map<string, number>();
  for (;;) {
    let query = supabaseAdmin
      .from("bracket_entries")
      .select("id, user_id, kind, round_correct")
      .eq("tournament_id", tournamentId)
      .order("id", { ascending: true })
      .limit(PAY_PAGE);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) return { ok: false, error: `entries read: ${error.message}` };
    const rows = (data ?? []) as Array<{ id: string; user_id: string; kind: string; round_correct: number[] | null }>;
    const credits = rows.flatMap((row) => {
      if (!isBracketKind(row.kind)) return [];
      const kind = row.kind;
      return due.flatMap(({ round, gradeNo }) => {
        if (!kindScoresRound(kind, round)) return [];
        const points = bracketRoundVenuePoints(round, Number(row.round_correct?.[round - 1] ?? 0));
        if (points <= 0) return [];
        const sourceKey = bracketCreditKey(row.id, round, gradeNo);
        roundOfKey.set(sourceKey, round);
        return [{ userId: row.user_id, sourceKey, points }];
      });
    });
    if (credits.length > 0) {
      const result = await creditSeasonalPoints("bracket", credits);
      if (!result.ok) return { ok: false, error: `${result.code}: ${result.error}` };
      for (const item of result.results) {
        if (item.outcome === "credited") credited += 1;
        // A burned key (an admin correction raced this payment), a key paid to someone else, or a
        // player gone: never re-sent as a fix, so it can't block the round (Squares §13 F8).
        else if (item.outcome === "user_not_found" || (item.existingUserId && item.existingUserId !== item.userId)) {
          const round = roundOfKey.get(item.sourceKey) ?? 0;
          blocked.set(round, (blocked.get(round) ?? 0) + 1);
        }
      }
    }
    roundOfKey.clear();
    if (rows.length < PAY_PAGE) break;
    after = rows[rows.length - 1].id;
  }
  for (const { round, gradeNo } of due) {
    const count = blocked.get(round) ?? 0;
    if (count > 0) console.warn("[Brackets] credit-blocked", { tournamentId, round, gradeNo, blocked: count });
  }
  return { ok: true, credited };
}

/**
 * Read the feed for one tournament and apply it: games, new results (graded set-based), lock times,
 * payments, pace. `feed` skips the request (discovery already made it). `dryRun` reads and reports
 * what would change, and writes nothing.
 */
export async function syncBracketTournament(
  tournament: BracketTournamentRecord,
  options: { realNowMs?: number; feed?: BracketFeedGame[]; dryRun?: boolean; actor?: string } = {},
): Promise<BracketSyncReport> {
  const realNowMs = options.realNowMs ?? Date.now();
  const tNow = tournamentNowMs(tournament, realNowMs);
  const offsetMs = tournament.clockOffsetSeconds * 1000;
  const dryRun = Boolean(options.dryRun);
  const report: BracketSyncReport = {
    tournamentId: tournament.id,
    label: labelOf(tournament),
    feed: options.feed ? "provided" : "read",
    changedGames: 0,
    newResults: 0,
    mismatches: 0,
    locksMoved: [],
    paidRounds: [],
    credited: 0,
    prizeCycles: null,
    needsAdmin: null,
    nextSyncAt: null,
    dryRun,
    errors: [],
  };

  let feed = options.feed;
  if (!feed) {
    const fetched = await fetchBracketFeed(tournament.gender, tournament.season);
    if (!fetched.ok) {
      report.feed = "failed";
      report.errors.push(`feed: ${fetched.reason}`);
      if (!dryRun) {
        report.nextSyncAt = isoOrNull(realNowMs + BRACKET_LIVE_SYNC_MS);
        await updateBracketTournament(tournament.id, { next_sync_at: report.nextSyncAt });
      }
      return report;
    }
    feed = fetched.games;
  }

  const stored = await getBracketGames(tournament.id);
  if (!stored.ok) {
    report.errors.push(`games read: ${stored.error}`);
    return report;
  }
  const merged = mergeBracketFeed(stored.value, offsetMs > 0 ? maskBracketFeedAt(feed, tNow) : feed);
  report.changedGames = merged.changed.length;
  report.mismatches = merged.mismatches.length;

  // Results: the sync only ever FILLS undecided slots. A decided slot that the games now disagree
  // with (an admin override half-written) is left alone and reported.
  const computed = bracketWinnerSeats(merged.games);
  const conflict = computed.findIndex((seat, slot) => tournament.winnerSeats[slot] !== null && seat !== tournament.winnerSeats[slot]);
  const finalDecided = computed[BRACKET_SLOT_COUNT - 1] !== null;
  // A total an admin entered stays when the feed has none (a stale run may even have written the
  // game's scores back to null). Only a decided final has one.
  const total = championshipTotal(merged.games) ?? (finalDecided ? tournament.championshipTotal : null);
  const newSlots = computed.filter((seat, slot) => seat !== null && tournament.winnerSeats[slot] === null).length;
  report.newResults = conflict >= 0 ? 0 : newSlots;
  if (conflict >= 0) {
    report.needsAdmin = `Slot ${conflict}: the stored result disagrees with the games. Re-apply the admin override.`;
  }
  const winnerSeats = conflict >= 0 ? tournament.winnerSeats : computed;

  const autos = autoBracketLocks(merged.games);
  const storedAutos = autoBracketLocks(stored.value);
  const lockPatch: Record<string, string> = {};
  const moveLock = (kind: "main" | "second", current: string | null, setBy: "auto" | "admin", next: string | null) => {
    const lateAdminLock = setBy === "admin" && next && current && Date.parse(next) < Date.parse(current) && tNow < Date.parse(current);
    if (lateAdminLock && !sameInstant(storedAutos[kind], next)) {
      // The admin's lock is after the first tip the feed now shows (plan 10.2): never moved here,
      // but entries would stay open during games. Logged once, on the run whose merge moved the
      // first tip (plan 10.5.1); the admin panel's problems line is the standing signal.
      console.warn("[Brackets] admin-lock-after-first-tip", { tournamentId: tournament.id, kind, lockAt: current, firstTip: next });
    }
    if (setBy !== "auto" || !next || sameInstant(current, next)) return;
    if (current !== null && tNow >= Date.parse(current)) return; // a passed lock never moves
    lockPatch[kind === "main" ? "main_lock_at" : "second_lock_at"] = next;
    report.locksMoved.push(`${kind} → ${next}`);
  };
  moveLock("main", tournament.mainLockAt, tournament.mainLockSetBy, autos.main);
  moveLock("second", tournament.secondLockAt, tournament.secondLockSetBy, autos.second);

  const nextTournamentMs = nextBracketSyncAt(merged.games, tNow);
  if (dryRun) {
    report.nextSyncAt = isoOrNull(nextTournamentMs === null ? null : nextTournamentMs + offsetMs);
    return report;
  }

  const saved = await saveFeedBracketGames(tournament.id, merged.changed, stored.value);
  if (!saved.ok) {
    report.errors.push(`games write: ${saved.error}`);
    return report;
  }
  for (const mismatch of merged.mismatches) {
    console.warn("[Brackets] feed-mismatch", { tournamentId: tournament.id, ...mismatch });
    await logBracketsAdmin({ tournamentId: tournament.id, action: "feed_mismatch", detail: mismatch, actor: "sync" });
  }
  if (report.needsAdmin) console.error("[Brackets] results-need-admin", { tournamentId: tournament.id, slot: conflict });

  if (conflict < 0 && (newSlots > 0 || total !== tournament.championshipTotal)) {
    const recorded = await recordBracketResults({
      tournamentId: tournament.id,
      winnerSeats: computed,
      championshipTotal: total,
      allowChange: false,
      reason: null,
      actor: options.actor ?? "sync",
      expectedWinnerSeats: tournament.winnerSeats,
    });
    if (!recorded.ok) {
      report.errors.push(`record results: ${recorded.error}`);
      return report;
    }
    if (recorded.value.stale) {
      // An admin changed results during this run. Nothing was recorded or paid; the admin action
      // set next_sync_at = now, so the next minute starts again from fresh rows.
      report.newResults = 0;
      report.needsAdmin = null;
      console.warn("[Brackets] results-stale", { tournamentId: tournament.id });
      return report;
    }
  }

  const paid = await payCompleteBracketRounds(tournament, winnerSeats);
  let allPaid = false;
  if (paid.ok) {
    report.paidRounds = paid.paidRounds;
    report.credited = paid.credited;
    allPaid = paid.allPaid;
  } else {
    report.errors.push(`pay: ${paid.error}`);
  }

  // Bracket prizes (Phase 9a): once the championship is graded and every round is paid, settle every
  // prize of this tournament, once (prizes_settled_at). A failure keeps the 2-minute pace below.
  let prizesSettled = tournament.prizesSettledAt !== null;
  let prizesSettledAt: string | null = null;
  if (allPaid && !prizesSettled && conflict < 0) {
    const prizes = await settleBracketPrizes(tournament, winnerSeats, total, new Date(realNowMs));
    if (!prizes.ok) report.errors.push(`prizes: ${prizes.error}`);
    else if (prizes.ready) {
      prizesSettled = true;
      prizesSettledAt = new Date(realNowMs).toISOString();
      report.prizeCycles = prizes.settlements.length;
    }
  }

  // Every round paid, prizes waiting only for the final score: an hourly look at the feed, and a
  // human is asked for it. Nothing else would change it.
  const awaitingScore = conflict < 0 && finalDecided && total === null && allPaid && !prizesSettled;
  if (awaitingScore) {
    report.needsAdmin ??= "Enter the final score: the championship is decided but the feed has no score, so prizes can't settle.";
    console.warn("[Brackets] championship-score-missing", { tournamentId: tournament.id });
  }

  // After the championship, keep checking every couple of minutes until every round is paid and the
  // prizes are settled (hourly while only the final score is missing).
  const nextRealMs =
    nextTournamentMs !== null
      ? nextTournamentMs + offsetMs
      : allPaid && prizesSettled
        ? null
        : realNowMs + (awaitingScore ? BRACKET_IDLE_SYNC_MS : BRACKET_LIVE_SYNC_MS);
  report.nextSyncAt = isoOrNull(nextRealMs);
  const updated = await finishBracketSyncRun(
    tournament.id,
    tournament.nextSyncAt,
    {
      ...lockPatch,
      feed_checked_at: new Date(realNowMs).toISOString(),
      ...(prizesSettledAt ? { prizes_settled_at: prizesSettledAt } : {}),
    },
    report.nextSyncAt,
  );
  if (!updated.ok) report.errors.push(`tournament write: ${updated.error}`);
  return report;
}

/** Look for this season's tournaments in the feed and create the ones that appeared. */
async function discoverBracketTournaments(
  current: readonly BracketTournamentRecord[],
  realNowMs: number,
  report: BracketsTickReport,
): Promise<void> {
  const season = bracketsFeedSeason();
  for (const gender of BRACKET_GENDERS) {
    if (current.some((t) => t.purpose === "live" && t.gender === gender && t.season === season)) continue;
    const exists = await bracketTournamentExists(gender, season, "live");
    if (!exists.ok) {
      report.errors.push(`discovery ${gender}: ${exists.error}`);
      continue;
    }
    if (exists.value) continue; // archived by an admin: never re-created automatically
    const fetched = await fetchBracketFeed(gender, season);
    if (!fetched.ok) {
      report.errors.push(`discovery ${gender}: feed ${fetched.reason}`);
      continue;
    }
    if (fetched.games.length === 0) continue;
    const created = await createBracketTournament({ gender, season, purpose: "live", clockOffsetSeconds: 0, createdBy: "auto" });
    if (!created.ok) {
      report.errors.push(`discovery ${gender}: create ${created.error}`);
      continue;
    }
    await logBracketsAdmin({
      tournamentId: created.value.id,
      action: "discovered",
      detail: { gender, season, games: fetched.games.length },
      actor: "sync",
    });
    report.discovered.push(created.value.id);
    report.synced.push(await syncBracketTournament(created.value, { realNowMs, feed: fetched.games }));
  }
}

/** One cron run. Safe to call any number of times; never throws. */
export async function runBracketsTick(options: { now?: Date; force?: boolean } = {}): Promise<BracketsTickReport> {
  const now = options.now ?? new Date();
  const force = Boolean(options.force);
  const report: BracketsTickReport = { ran: false, skipped: null, discovered: [], synced: [], errors: [] };
  const mode = bracketsSyncMode(now);
  if (!force && !mode) return { ...report, skipped: "inactive" };
  if (!supabaseAdmin) return { ...report, skipped: "no_database" };
  report.ran = true;

  try {
    const current = await listCurrentBracketTournaments();
    if (!current.ok) {
      report.errors.push(`tournaments read: ${current.error}`);
      return report;
    }
    if ((mode?.live || force) && (force || now.getUTCMinutes() % BRACKETS_DISCOVERY_EVERY_MINUTES === 0)) {
      await discoverBracketTournaments(current.value, now.getTime(), report);
    }
    for (const tournament of current.value) {
      if (!drives(tournament, mode, force)) continue;
      if (!force && !isBracketSyncDue(tournament, now.getTime())) continue;
      report.synced.push(await syncBracketTournament(tournament, { realNowMs: now.getTime() }));
    }
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : "Bracket sync failed.");
  }
  if (report.errors.length || report.synced.some((s) => s.errors.length)) {
    console.error("[Brackets] tick-errors", {
      errors: report.errors,
      synced: report.synced.filter((s) => s.errors.length).map((s) => ({ id: s.tournamentId, errors: s.errors })),
    });
  }
  return report;
}

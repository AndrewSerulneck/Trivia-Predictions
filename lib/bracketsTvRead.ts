import "server-only";

import { bracketTournamentsShownAt, gameView, type BracketGameView } from "@/lib/bracketsEntries";
import { getBracketGamesFor, listCurrentBracketTournaments, tournamentNowMs, type BracketTournamentRecord } from "@/lib/bracketsStore";
import { buildBracketTvPayload, type BracketTvEntry, type BracketTvPayload, type BracketTvTournament } from "@/lib/bracketsTv";
import { bracketSeatList, isBracketKind } from "@/lib/brackets/tree";
import { isBracketsServerLive } from "@/lib/seasonalGames";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVenueTimezone } from "@/lib/timezone";

// The venue TV's March Madness read (Phase 9b). Cost rules (plan §6): ZERO I/O unless the flag is on
// and today is inside the bracket window (or the rehearsal switch is on WITH the flag — Preview only,
// as Squares). Then, per server instance:
//   • ONE shared read of the current tournaments + their games (≤ 2 + 158 rows) every 15 s, whatever
//     the number of venues or TVs (live scores in "today's games" come from it);
//   • per venue, ONE entries read, kept until a result changes (the tournaments' decided slots /
//     championship total / locks) or 10 minutes pass — so a venue's entries are re-read about once
//     per finished game, not on every poll. While a rehearsal tournament is current, also one read
//     of the venue's `hidden` (a rehearsal shows only at hidden venues, plan 10.4), on the same cadence.
// The state route is CDN-cached 15 s for this mode too, so many TVs at one venue cost one origin hit.
// Estimate at 100 venues with TVs on 12 h a day for the three weeks: ≈ 134 games × 100 venues + 72
// ten-minute refreshes × 21 days × 100 ≈ 165k small entries reads in all (tens of rows each).
// Failures hide the brackets (the TV falls back to its idle screen) and are never thrown.

const SHARED_TTL_MS = 15_000;
const VENUE_TTL_MS = 10 * 60_000;
/** Entries one venue can have across the current brackets that the TV will rank. */
const ENTRIES_CAP = 2000;

type Shared = { atMs: number; tournaments: BracketTournamentRecord[]; games: Map<string, BracketGameView[]>; revision: string };
let shared: Shared | null = null;
const venueCache = new Map<
  string,
  { atMs: number; revision: string; tournaments: BracketTournamentRecord[]; entries: BracketTvEntry[]; timeZone: string }
>();

/**
 * What, if it changes, can change a venue's standings: results, the final's total, the locks. The
 * winner seats themselves, not how many are decided: an admin correction that flips a winner keeps
 * the count and must still refresh the standings (plan 10.1, §17 B8).
 */
export const bracketTvRevisionOf = (tournaments: readonly BracketTournamentRecord[]): string =>
  tournaments
    .map((t) => `${t.id}:${t.winnerSeats.map((seat) => seat ?? "").join(",")}:${t.championshipTotal ?? ""}:${t.mainLockAt ?? ""}:${t.secondLockAt ?? ""}`)
    .join("|");

async function readShared(nowMs: number): Promise<Shared | null> {
  if (shared && nowMs - shared.atMs < SHARED_TTL_MS && nowMs >= shared.atMs) return shared;
  const current = await listCurrentBracketTournaments();
  if (!current.ok) {
    console.error("[BracketsTv] tournaments-read-failed", { message: current.error });
    return null;
  }
  const games = await getBracketGamesFor(current.value.map((t) => t.id));
  if (!games.ok) {
    console.error("[BracketsTv] games-read-failed", { message: games.error });
    return null;
  }
  const views = new Map([...games.value.entries()].map(([id, list]) => [id, list.map(gameView)] as const));
  shared = { atMs: nowMs, tournaments: current.value, games: views, revision: bracketTvRevisionOf(current.value) };
  return shared;
}

type EntryRow = {
  id: string;
  tournament_id: string;
  kind: string;
  score: number;
  tiebreaker: number | null;
  submitted_at: string;
  picks: Array<number | null> | null;
  users: { username?: string | null } | Array<{ username?: string | null }> | null;
};

async function readVenueEntries(venueId: string, tournamentIds: readonly string[]): Promise<BracketTvEntry[] | null> {
  if (!supabaseAdmin || tournamentIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("bracket_entries")
    .select("id, tournament_id, kind, score, tiebreaker, submitted_at, picks, users(username)")
    .eq("venue_id", venueId)
    .in("tournament_id", [...tournamentIds])
    .gt("pick_count", 0)
    .order("score", { ascending: false })
    .limit(ENTRIES_CAP);
  if (error) {
    console.error("[BracketsTv] entries-read-failed", { message: error.message });
    return null;
  }
  return ((data ?? []) as EntryRow[]).flatMap((row): BracketTvEntry[] => {
    if (!isBracketKind(row.kind)) return [];
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    return [
      {
        tournamentId: row.tournament_id,
        kind: row.kind,
        entryId: row.id,
        username: String(user?.username ?? "").trim() || "Player",
        score: Number(row.score) || 0,
        tiebreaker: row.tiebreaker,
        submittedAt: row.submitted_at,
        picks: bracketSeatList(row.picks),
      },
    ];
  });
}

export async function getBracketTvPayload(venueId: string, nowMs: number = Date.now()): Promise<BracketTvPayload | null> {
  if (!isBracketsServerLive(new Date(nowMs))) return null;
  try {
    const state = await readShared(nowMs);
    if (!state || state.tournaments.length === 0) return null;

    let venue = venueCache.get(venueId);
    if (!venue || venue.revision !== state.revision || nowMs - venue.atMs >= VENUE_TTL_MS || nowMs < venue.atMs) {
      // A rehearsal shows only at a hidden venue (the bracket screen's rule), so its games, standings
      // and upsets never reach a real bar's TV.
      const shown = await bracketTournamentsShownAt(venueId, state.tournaments);
      if (!shown.ok) {
        console.error("[BracketsTv] venue-read-failed", { message: shown.error });
        return null;
      }
      const [entries, timeZone] = await Promise.all([
        readVenueEntries(venueId, shown.value.map((t) => t.id)),
        getVenueTimezone(venueId),
      ]);
      if (!entries) return null;
      venue = { atMs: nowMs, revision: state.revision, tournaments: shown.value, entries, timeZone };
      venueCache.set(venueId, venue);
    }
    if (venue.entries.length === 0) return null;

    // Locks and "now" both in the tournament's own clock (a rehearsal runs behind real time).
    const lock = (at: string | null): number | null => {
      const ms = Date.parse(String(at ?? ""));
      return Number.isFinite(ms) ? ms : null;
    };
    const tournaments: BracketTvTournament[] = venue.tournaments.map((t) => {
      return {
        id: t.id,
        gender: t.gender,
        season: t.season,
        winnerSeats: t.winnerSeats,
        championshipTotal: t.championshipTotal,
        games: state.games.get(t.id) ?? [],
        locks: { main: lock(t.mainLockAt), second: lock(t.secondLockAt) },
        nowMs: tournamentNowMs(t, nowMs),
      };
    });
    return buildBracketTvPayload({ tournaments, entries: venue.entries, timeZone: venue.timeZone });
  } catch (error) {
    console.error("[BracketsTv] read-failed", { message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/** Test hook: forget the cached reads. */
export function clearBracketTvCache(): void {
  shared = null;
  venueCache.clear();
}

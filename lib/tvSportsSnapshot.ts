import "server-only";

// The venue TV's shared copy of today's games (docs/fire-tv-app-plan.md Phase 9, D27).
//
// Andrew, 2026-11-22: "Refresh only while a TV is on." No cron: an idle state request reads the copy, and after its
// response is sent it asks for a refresh. The refresh claims only the leagues that are due (one SQL call, atomic
// across instances), fetches them from the same feed Pick 'Em uses, and writes the games back. So:
//   - no TV on the carousel → no feed requests at all;
//   - many TVs → still one refresh per league per interval, for every venue together.
// Intervals: 2 min while a league has a game live or starting within 2 h (MMA and tennis 10 min: their feeds take
// more requests), 15 min with games later today, 6 h with none (off-season leagues cost ~nothing), 30 min when the
// feed returned nothing (a failure looks the same, so the old rows stay).

import { after } from "next/server";
import { COLLEGE_FOOTBALL_SPORT_KEY } from "@/lib/pickemCollegeFootball";
import { listPickEmTvFeedGames, type PickEmTvFeedGame } from "@/lib/pickem";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TV_LIVE_STALE_MS, TV_STARTS_SOON_MS, type TvSportsGameInput } from "@/lib/tvSportsRelevance";

/** Every Pick 'Em league the TV can show. College basketball is out of this plan (D19). */
export const TV_SPORT_KEYS: readonly string[] = [
  "americanfootball_nfl",
  COLLEGE_FOOTBALL_SPORT_KEY,
  "basketball_nba",
  "basketball_wnba",
  "icehockey_nhl",
  "baseball_mlb",
  "soccer_usa_mls",
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_italy_serie_a",
  "soccer_france_ligue_one",
  "soccer_germany_bundesliga",
  "soccer_uefa_champs_league",
  "soccer_fifa_world_cup",
  "mma_ufc",
  "tennis_atp",
  "tennis_wta",
];

const MINUTE_MS = 60_000;
export const TV_SPORTS_LIVE_REFRESH_MS = 2 * MINUTE_MS;
export const TV_SPORTS_SLOW_FEED_REFRESH_MS = 10 * MINUTE_MS;
export const TV_SPORTS_LATER_REFRESH_MS = 15 * MINUTE_MS;
export const TV_SPORTS_EMPTY_REFRESH_MS = 6 * 60 * MINUTE_MS;
export const TV_SPORTS_NO_REPLY_REFRESH_MS = 30 * MINUTE_MS;
/** How long a claim holds a league while its refresh runs (a crashed refresh retries after this). */
const CLAIM_LEASE_SECONDS = 120;
/** One instance asks to claim at most this often (most asks find nothing due). */
const CLAIM_CHECK_MS = 30_000;

const SLOW_FEEDS = new Set(["mma_ufc", "tennis_atp", "tennis_wta"]);

/** The feed window: covers "today" in any US time zone, plus live games that started last night. */
const feedWindow = (nowMs: number): { fromIso: string; toIso: string } => ({
  fromIso: new Date(nowMs - 12 * 60 * MINUTE_MS).toISOString(),
  toIso: new Date(nowMs + 30 * 60 * MINUTE_MS).toISOString(),
});

/** When this league is next due, from what the feed just said. Pure; exported for tests. */
export const nextTvSportsRefreshMs = (
  sportKey: string,
  result: { ok: boolean; games: ReadonlyArray<Pick<PickEmTvFeedGame, "startsAt" | "isFinal"> & { feedState?: PickEmTvFeedGame["feedState"] }> },
  nowMs: number,
): number => {
  if (!result.ok) return nowMs + TV_SPORTS_NO_REPLY_REFRESH_MS;
  let busy = false;
  let later = false;
  for (const game of result.games) {
    const startMs = Date.parse(game.startsAt);
    if (!Number.isFinite(startMs) || game.isFinal) continue;
    if (game.feedState === "live") busy = true;
    else if (startMs <= nowMs ? nowMs - startMs <= TV_LIVE_STALE_MS : startMs - nowMs <= TV_STARTS_SOON_MS) busy = true;
    else if (startMs > nowMs) later = true;
  }
  if (busy) return nowMs + (SLOW_FEEDS.has(sportKey) ? TV_SPORTS_SLOW_FEED_REFRESH_MS : TV_SPORTS_LIVE_REFRESH_MS);
  return nowMs + (later ? TV_SPORTS_LATER_REFRESH_MS : TV_SPORTS_EMPTY_REFRESH_MS);
};

type TvSportsGameRow = {
  feed_game_key: string;
  sport_key: string;
  league: string;
  home_team: string;
  away_team: string;
  home_abbr: string | null;
  away_abbr: string | null;
  starts_at: string;
  is_final: boolean;
  feed_state: "scheduled" | "live" | "final" | null;
  final_seen_at: string | null;
  home_score: number | null;
  away_score: number | null;
  period_label: string | null;
  is_postseason: boolean | null;
};

const GAME_COLUMNS =
  "feed_game_key, sport_key, league, home_team, away_team, home_abbr, away_abbr, starts_at, is_final, feed_state, final_seen_at, home_score, away_score, period_label, is_postseason";

/** Rows past this are deleted by the next refresh. */
const KEEP_MS = 36 * 60 * MINUTE_MS;

/**
 * The games a TV may show now: started in the last 8 hours, or starting before `untilMs`. One bounded read.
 * Null when the read fails (unknown, so the slide is skipped, never shown empty-as-zero).
 */
export async function readTvSportsGames(nowMs: number, untilMs: number): Promise<TvSportsGameInput[] | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("tv_sports_games")
    .select(GAME_COLUMNS)
    .gte("starts_at", new Date(nowMs - TV_LIVE_STALE_MS).toISOString())
    .lt("starts_at", new Date(untilMs).toISOString())
    .order("starts_at", { ascending: true })
    .limit(300)
    .returns<TvSportsGameRow[]>();
  if (error || !data) return null;
  return data.map((row) => ({
    key: row.feed_game_key,
    sportKey: row.sport_key,
    league: row.league,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeAbbr: row.home_abbr,
    awayAbbr: row.away_abbr,
    startsAt: row.starts_at,
    isFinal: row.is_final,
    feedState: row.feed_state,
    finalSeenAt: row.final_seen_at,
    homeScore: row.home_score,
    awayScore: row.away_score,
    periodLabel: row.period_label,
    isPostseason: row.is_postseason,
  }));
}

export type TvSportsRefreshReport = { claimed: string[]; written: number; failed: string[] };

/** Refreshes the leagues that are due. Never throws; returns what it did (logged once per run that did anything). */
export async function refreshTvSportsIfDue(nowMs: number = Date.now()): Promise<TvSportsRefreshReport> {
  const report: TvSportsRefreshReport = { claimed: [], written: 0, failed: [] };
  const admin = supabaseAdmin;
  if (!admin) return report;
  try {
    const { data: claimed, error: claimError } = await admin.rpc("claim_tv_sports_refresh", {
      p_sport_keys: [...TV_SPORT_KEYS],
      p_lease_seconds: CLAIM_LEASE_SECONDS,
    });
    if (claimError) {
      console.error("[tv-sports] claim-failed", claimError.message);
      return report;
    }
    const keys = ((claimed ?? []) as Array<string | { claim_tv_sports_refresh?: string }>)
      .map((entry) => (typeof entry === "string" ? entry : String(entry?.claim_tv_sports_refresh ?? "")))
      .filter(Boolean);
    report.claimed = keys;
    if (keys.length === 0) return report;

    const runIso = new Date(nowMs).toISOString();
    const { fromIso, toIso } = feedWindow(nowMs);
    const results = await Promise.all(
      keys.map(async (sportKey) => ({ sportKey, ...(await listPickEmTvFeedGames(sportKey, fromIso, toIso)) })),
    );
    const okKeys = results.filter((result) => result.ok).map((result) => result.sportKey);
    report.failed = results.filter((result) => !result.ok).map((result) => result.sportKey);

    const games = results.flatMap((result) => result.games);
    if (games.length > 0) {
      // Keep the first time each game was seen final (finals leave the TV an hour later).
      const { data: existing } = await admin
        .from("tv_sports_games")
        .select("feed_game_key, final_seen_at")
        .in("sport_key", okKeys)
        .not("final_seen_at", "is", null)
        .returns<Array<{ feed_game_key: string; final_seen_at: string }>>();
      const finalSeen = new Map((existing ?? []).map((row) => [row.feed_game_key, row.final_seen_at]));
      const rows = new Map<string, Record<string, unknown>>();
      for (const game of games) {
        rows.set(game.feedGameKey, {
          feed_game_key: game.feedGameKey,
          sport_key: game.sportKey,
          league: game.league,
          home_team: game.homeTeam,
          away_team: game.awayTeam,
          home_abbr: game.homeAbbr,
          away_abbr: game.awayAbbr,
          starts_at: game.startsAt,
          is_final: game.isFinal,
          feed_state: game.feedState,
          final_seen_at: game.isFinal ? finalSeen.get(game.feedGameKey) ?? runIso : null,
          home_score: game.homeScore,
          away_score: game.awayScore,
          period_label: game.periodLabel,
          is_postseason: game.isPostseason,
          refreshed_at: runIso,
        });
      }
      const { error: writeError } = await admin.from("tv_sports_games").upsert([...rows.values()], {
        onConflict: "feed_game_key",
      });
      if (writeError) {
        console.error("[tv-sports] write-failed", writeError.message);
      } else {
        report.written = rows.size;
        // A game the feed no longer lists in the window (rescheduled, cancelled) is gone; only for leagues that
        // answered, so a feed failure never empties the board.
        await admin.from("tv_sports_games").delete().in("sport_key", okKeys).lt("refreshed_at", runIso);
      }
    }
    await admin.from("tv_sports_games").delete().lt("starts_at", new Date(nowMs - KEEP_MS).toISOString());

    const { error: dueError } = await admin.from("tv_sports_refresh").upsert(
      results.map((result) => ({
        sport_key: result.sportKey,
        due_at: new Date(nextTvSportsRefreshMs(result.sportKey, result, nowMs)).toISOString(),
      })),
      { onConflict: "sport_key" },
    );
    if (dueError) console.error("[tv-sports] due-write-failed", dueError.message);
    console.info(
      `[tv-sports] refreshed=${keys.length} written=${report.written} no-reply=${report.failed.length} leagues=${keys.join(",")}`,
    );
  } catch (error) {
    console.error("[tv-sports] refresh-failed", error instanceof Error ? error.message : error);
  }
  return report;
}

let lastClaimCheckMs = 0;

/**
 * Called by an idle state request: refresh what's due after the response is sent. At most one claim check per
 * instance per 30 s, so a room full of TVs adds one tiny SQL call, not one per poll.
 */
export function scheduleTvSportsRefresh(nowMs: number = Date.now()): void {
  if (nowMs - lastClaimCheckMs < CLAIM_CHECK_MS) return;
  lastClaimCheckMs = nowMs;
  const run = () => refreshTvSportsIfDue(Date.now()).then(() => undefined);
  try {
    after(run);
  } catch {
    // Outside a request (scripts, tests): run it in the background.
    void run();
  }
}

/** Test hook. */
export function resetTvSportsRefreshThrottle(): void {
  lastClaimCheckMs = 0;
}

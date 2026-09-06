import "server-only";

import { fetchBallDontLieList, type BallDontLieFailureBox } from "@/lib/ballDontLieClient";

// Phase 4 of docs/prop-bingo-nfl-activation-plan.md — inactives and late scratches.
//
// MLB has `autoSwapLateScratchedStarSquares` (lib/sportsBingo.ts); NFL had nothing. NFL inactives
// drop ~90 minutes before kickoff, and a Sunday board generated Saturday can hand eight prop
// squares' worth of attention to a player who is inactive. Settlement already voids that square
// safely, but a dead square on a 24-square board is a quarter of a line gone.
//
// This module is the shared inactives source for both halves of the fix:
//   1. Pre-generation — `buildNFLPlayerPropCandidates` drops a market for any player this index
//      lists as not playing, before the board is ever assembled.
//   2. Post-lock swap — `autoSwapInactiveNFLPropSquares` (lib/sportsBingo.ts) mirrors MLB's
//      window logic: inside the kickoff window a prop square whose player is now inactive is
//      swapped for an equivalently-priced team square.
//
// Kept in its own module (not folded into lib/sportsBingo.ts) for the same reason
// lib/sportsBingoNflStars.ts is: so a caller — and a test — can import the pure classifier and
// the fetch/cache layer without pulling in the 11k-line settlement surface.

// Local copy of lib/sportsBingo.ts's `normalizeNameKey` (not exported there, and importing that
// module here would cycle). Kept in sync by hand with lib/sportsBingoNflStars.ts's copy; it's a
// ten-line pure function, not a maintenance burden.
function normalizeNameKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * A row from balldontlie `/nfl/v1/player_injuries` (probed live 2026-09-05):
 * `{ player: { id, first_name, last_name, ... }, status, comment, date }`.
 */
type BallDontLieNFLInjuryRow = {
  player?: {
    id?: number | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  status?: string | null;
};

/**
 * The injury-report statuses that mean "will not play this week." Deliberately a small, explicit
 * allow-list rather than a "not Questionable" negation:
 *
 *  - `Out` / `Doubtful` — the plan's named set. `Doubtful` is included because it is the plan's
 *    call: pre-generation is the cheap place to be conservative, and settlement still voids the
 *    rare case where a Doubtful player does suit up.
 *  - `IR` — 71 of 334 rows on the live probe; unambiguously out.
 *  - `PUP-R` / `NFI-R` — the *regular-season* reserve designations (Physically Unable to Perform
 *    / Non-Football Injury): a player on either list cannot play for at least the first four
 *    weeks. `PUP-P` and `NFI-A` are the *preseason/active* variants — those players can and do
 *    play, so they are NOT here.
 *  - `Reserve-Sus` (suspended) / `Reserve-DNR` (did not report) / `Reserve-Ret` (retired) — not
 *    injuries, but the same board outcome: the player is not on the field.
 *
 * All matched case-insensitively after trimming. If BDL introduces a new season-ending code, the
 * square still voids at settlement — this list only controls the pre-board drop and the swap.
 */
const NFL_INACTIVE_INJURY_STATUSES: ReadonlySet<string> = new Set<string>([
  "out",
  "doubtful",
  "ir",
  "injured reserve",
  "injured-reserve",
  "pup-r",
  "nfi-r",
  "reserve-sus",
  "reserve-dnr",
  "reserve-ret",
]);

/** True when this injury-report status means the player will not play this week. */
export function isInactiveNFLInjuryStatus(status: string | null | undefined): boolean {
  return NFL_INACTIVE_INJURY_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

export type NFLInjuryIndex = {
  /** BDL player ids for players who will not play (Out / Doubtful / IR / season reserve). */
  inactivePlayerIds: ReadonlySet<number>;
  /** Normalized "first last" keys for the same players — the fallback match when a ref has no id. */
  inactivePlayerKeys: ReadonlySet<string>;
  /**
   * True when the underlying `/nfl/v1/player_injuries` pull failed (feed down), as distinct from
   * "the feed answered with no inactive players." Callers keep a short negative TTL on a failure
   * and treat the index as "no signal," never as "everyone is healthy."
   */
  failed: boolean;
};

/** Pure: fold raw injury rows into the id/name sets the generator and swap both read. */
export function buildNFLInjuryIndex(rows: BallDontLieNFLInjuryRow[], failed: boolean): NFLInjuryIndex {
  const inactivePlayerIds = new Set<number>();
  const inactivePlayerKeys = new Set<string>();
  for (const row of rows) {
    if (!isInactiveNFLInjuryStatus(row?.status)) {
      continue;
    }
    const id = Number(row?.player?.id ?? 0);
    if (Number.isFinite(id) && id > 0) {
      inactivePlayerIds.add(Math.trunc(id));
    }
    const name = `${String(row?.player?.first_name ?? "").trim()} ${String(row?.player?.last_name ?? "").trim()}`.trim();
    const key = normalizeNameKey(name);
    if (key) {
      inactivePlayerKeys.add(key);
    }
  }
  return { inactivePlayerIds, inactivePlayerKeys, failed };
}

/**
 * Does this index list the given player as not playing? Id match first (both feeds are BDL, so the
 * ids align), name-key match as a fallback for a resolver ref that carries no id.
 */
export function isNFLPlayerInactive(
  index: NFLInjuryIndex,
  playerId: number | null | undefined,
  playerName?: string | null
): boolean {
  const id = Number(playerId ?? 0);
  if (Number.isFinite(id) && id > 0 && index.inactivePlayerIds.has(Math.trunc(id))) {
    return true;
  }
  if (playerName) {
    const key = normalizeNameKey(playerName);
    if (key && index.inactivePlayerKeys.has(key)) {
      return true;
    }
  }
  return false;
}

/**
 * One league-wide `/nfl/v1/player_injuries` pull. Never throws: a provider outage returns an empty
 * array with `failure.failed = true`, which degrades the filter to "no signal" rather than
 * breaking board generation — the same contract `fetchNFLSeasonStats` follows.
 */
export async function fetchNFLPlayerInjuries(
  options: { failure?: BallDontLieFailureBox } = {}
): Promise<BallDontLieNFLInjuryRow[]> {
  const query = new URLSearchParams({ per_page: "100" });
  try {
    // ~330 rows league-wide on the live probe; per_page 100 → ~4 pages. 10 leaves headroom.
    return await fetchBallDontLieList<BallDontLieNFLInjuryRow>("/nfl/v1/player_injuries", query, {
      maxPages: 10,
      failure: options.failure,
    });
  } catch (error) {
    console.error("[sportsBingoNflInjuries] Failed to fetch NFL player injuries:", error);
    if (options.failure) {
      options.failure.failed = true;
    }
    return [];
  }
}

/**
 * 24h cache TTL, same `cacheMsInWindow` shape lib/sportsBingoNflStars.ts uses for the star index
 * (duplicated rather than imported — that module does not export it and it is four lines).
 */
const cacheMsInWindow = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
};

const NFL_INJURY_INDEX_CACHE_MS = cacheMsInWindow(
  process.env.BINGO_NFL_INJURY_INDEX_CACHE_MS,
  24 * 60 * 60_000,
  5 * 60_000,
  24 * 60 * 60_000
);

/** Negative TTL for an index built from a failed pull — re-ask soon, don't pin 24h on one bad minute. */
const NFL_INJURY_INDEX_FAILURE_CACHE_MS = 5 * 60_000;

/**
 * The staleness bound the post-lock swap passes: inside the kickoff window we want near-real-time
 * data so a scratch that posts ~90 minutes out is caught, even though the pre-generation path is
 * happy with the full 24h entry.
 */
export const NFL_INJURY_INDEX_LIVE_STALENESS_MS = 10 * 60_000;

let injuryIndexCache: { fetchedAtMs: number; expiresAt: number; index: NFLInjuryIndex } | null = null;

/**
 * The live, automatic layer: a 24h cache over one `/nfl/v1/player_injuries` pull. Cached
 * process-wide (not per game), so a 13-game Sunday slate shares one pull.
 *
 * `maxStalenessMs` lets the post-lock swap demand a fresher entry than the pre-generation path:
 * pass `NFL_INJURY_INDEX_LIVE_STALENESS_MS` and a 12-hour-old cache entry is re-pulled even though
 * its TTL has not expired.
 *
 * `fetchInjuries` is injectable purely for tests; it defaults to the real fetch above, which
 * already degrades a feed failure to `[]` rather than throwing, so this never throws either.
 */
export async function resolveNFLInjuryIndex(
  options: {
    now?: Date;
    maxStalenessMs?: number;
    fetchInjuries?: (opts?: { failure?: BallDontLieFailureBox }) => Promise<BallDontLieNFLInjuryRow[]>;
  } = {}
): Promise<NFLInjuryIndex> {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const fetchInjuries = options.fetchInjuries ?? fetchNFLPlayerInjuries;

  if (
    injuryIndexCache &&
    injuryIndexCache.expiresAt > nowMs &&
    (options.maxStalenessMs === undefined || nowMs - injuryIndexCache.fetchedAtMs <= options.maxStalenessMs)
  ) {
    return injuryIndexCache.index;
  }

  const failure: BallDontLieFailureBox = { failed: false };
  const rows = await fetchInjuries({ failure });
  const index = buildNFLInjuryIndex(rows, failure.failed);
  injuryIndexCache = {
    fetchedAtMs: nowMs,
    expiresAt: nowMs + (failure.failed ? NFL_INJURY_INDEX_FAILURE_CACHE_MS : NFL_INJURY_INDEX_CACHE_MS),
    index,
  };
  return index;
}

/** Test-only: drop the module-level cache so a case starts from a cold pull. */
export function __resetNFLInjuryIndexCacheForTests(): void {
  injuryIndexCache = null;
}

import { bingoResolverCapability } from "@/lib/sportsBingoCapabilities";
import { normalizeBingoSportKey } from "@/lib/sportsBingoIdentity";
import { NFL_MONOTONE_TEAM_STAT_FIELDS } from "@/lib/sportsBingoNflFlavor";
import type { SportsBingoResolver, SquareSupportLevel } from "@/lib/sportsBingo";

export const BINGO_NON_FREE_SQUARE_COUNT = 24;
export const BINGO_MAX_SQUARES_PER_PLAYER = 2;
export const BINGO_NFL_PLAYER_PROP_TARGET = 8;
export const BINGO_NFL_SPECIAL_TARGET = 6;
export const BINGO_NFL_MIN_DISTINCT_PROP_SUBJECTS = 6;
export const BINGO_NFL_MIN_EARLY_PROGRESS_OPPORTUNITIES = 3;

type TeamSide = "home" | "away";

export type SportsBingoQualityCandidate = {
  key: string;
  label: string;
  resolver: SportsBingoResolver;
  bucket?: string;
  supportLevel?: SquareSupportLevel;
  teamHint?: TeamSide | null;
  isFree?: boolean;
};

export type SportsBingoBoardQuality = {
  eligible: boolean;
  issues: string[];
  nonFreeCount: number;
  duplicateResolverKeys: string[];
  duplicateDiversityAxes: string[];
  unsupportedCount: number;
  maxSquaresForOnePlayer: number;
  distinctPlayers: number;
  playerPropCount: number;
  distinctPlayerPropSubjects: number;
  representedPlayerTeams: TeamSide[];
  earlyProgressOpportunities: number;
  maxLabelLength: number;
};

const normalizePlayerName = (value: string): string =>
  value
    .replace(/::[1-9]\d*$/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const bingoResolverPlayerKey = (resolver: SportsBingoResolver): string | null => {
  if (!("player" in resolver)) {
    return null;
  }
  const id = /::([1-9]\d*)$/.exec(resolver.player)?.[1];
  if (id) {
    return `id:${id}`;
  }
  const name = normalizePlayerName(resolver.player);
  return name ? `name:${name}` : null;
};

const mlbPlayerMetric = (marketKey: string): string => {
  const aliases: Record<string, string> = {
    player_hits: "hit",
    player_home_runs: "home_run",
    player_rbis: "rbi",
    player_stolen_bases: "stolen_base",
    player_strikeouts_pitcher: "strikeout",
    player_earned_runs: "earned_run",
    player_pitcher_outs: "pitcher_out",
  };
  return aliases[marketKey] ?? marketKey;
};

/**
 * One generation-time diversity axis. Thresholds and over/under directions deliberately do not
 * distinguish player-stat axes: two versions of the same player's stat still read as the same idea
 * on a 5x5 board. Core market rungs stay distinct because the existing 10/6/8 mix and probability
 * model were calibrated with them; redesigning that ladder requires separate correlation evidence.
 */
export const bingoCandidateDiversityAxis = (candidate: SportsBingoQualityCandidate): string => {
  const resolver = candidate.resolver;
  const playerKey = bingoResolverPlayerKey(resolver);

  if (resolver.kind === "player_prop" && playerKey) {
    return `player:${playerKey}:${mlbPlayerMetric(resolver.marketKey)}`;
  }
  if (resolver.kind === "nba_player_stat_at_least" && playerKey) {
    return `player:${playerKey}:${resolver.metric}`;
  }
  if (
    (resolver.kind === "mlb_webhook_player_event_at_least" ||
      resolver.kind === "mlb_webhook_player_event_at_most") &&
    playerKey
  ) {
    return `player:${playerKey}:${resolver.event}`;
  }
  if (resolver.kind === "nfl_player_anytime_td" && playerKey) {
    return `player:${playerKey}:touchdown`;
  }

  // Core ladders intentionally carry distinct thresholds: the 10/6/8 NFL mix and the correlated
  // probability model were calibrated with those rungs. Phase 5 removes repeated *player ideas*
  // across prop/achievement factories without silently redesigning the calibrated core slate.
  return candidate.key;
};

/** True when the shipped grader can decide a hit or miss before the final whistle. */
export const isBingoEarlyProgressResolver = (resolver: SportsBingoResolver): boolean => {
  switch (resolver.kind) {
    case "game_total_over":
    case "game_total_under":
    case "team_total_over":
    case "team_total_under":
    case "nba_player_stat_at_least":
    case "nba_team_stat_at_least":
    case "mlb_webhook_player_event_at_least":
    case "mlb_webhook_player_event_at_most":
    case "mlb_webhook_team_event_at_least":
    case "nfl_player_anytime_td":
    case "nfl_team_scores_every_quarter":
    case "nfl_team_shutout_quarter":
    case "nfl_team_quarter_points_at_least":
    case "nfl_any_quarter_scoreless":
    case "nfl_team_leads_at_halftime":
    case "nfl_both_teams_score_at_least":
    case "nfl_game_max_stat_at_least":
    case "nfl_game_total_stat_at_least":
    case "nfl_game_missed_field_goal":
    case "nfl_non_quarterback_pass_attempt":
    case "nfl_first_score_within_minutes":
    case "nfl_score_in_final_minutes":
    case "nfl_both_teams_lead":
    case "nfl_lead_change_second_half":
    case "nfl_tied_after_halftime":
    case "nfl_two_point_conversion":
    case "nfl_safety":
    case "nfl_goal_line_touchdown":
      return true;
    case "player_prop":
      return !["passing_yards", "rushing_yards", "receiving_yards", "rushing_receiving_yards"].includes(
        resolver.marketKey
      );
    case "nfl_team_stat_at_least":
    case "nfl_team_stat_at_most":
    case "nfl_combined_team_stat_at_least":
    case "nfl_combined_team_stat_at_most":
      return NFL_MONOTONE_TEAM_STAT_FIELDS.has(resolver.field);
    default:
      return false;
  }
};

const duplicateValues = (values: string[]): string[] => {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
};

const playerTeamSides = (candidates: SportsBingoQualityCandidate[]): TeamSide[] =>
  [...new Set(candidates.map((candidate) => candidate.teamHint).filter((side): side is TeamSide => side === "home" || side === "away"))].sort();

export const auditSportsBingoBoardQuality = (params: {
  sportKey: string;
  squares: SportsBingoQualityCandidate[];
  candidatePool?: SportsBingoQualityCandidate[];
}): SportsBingoBoardQuality => {
  const sportKey = normalizeBingoSportKey(params.sportKey);
  const nonFree = params.squares.filter((square) => !square.isFree && square.resolver.kind !== "free");
  const pool = params.candidatePool ?? nonFree;
  const duplicateResolverKeys = duplicateValues(nonFree.map((square) => square.key));
  const duplicateDiversityAxes = duplicateValues(nonFree.map(bingoCandidateDiversityAxis));
  const unsupportedCount = nonFree.filter(
    (square) =>
      (square.supportLevel ?? "supported") !== "supported" ||
      !bingoResolverCapability(sportKey, square.resolver).supported
  ).length;
  const playerCounts = new Map<string, number>();
  for (const square of nonFree) {
    const playerKey = bingoResolverPlayerKey(square.resolver);
    if (playerKey) {
      playerCounts.set(playerKey, (playerCounts.get(playerKey) ?? 0) + 1);
    }
  }
  const maxSquaresForOnePlayer = Math.max(0, ...playerCounts.values());
  const playerProps = nonFree.filter((square) => square.bucket === "player-prop");
  const playerPropSubjects = new Set(
    playerProps.map((square) => bingoResolverPlayerKey(square.resolver)).filter((key): key is string => Boolean(key))
  );
  const poolPlayerProps = pool.filter((square) => square.bucket === "player-prop");
  const poolPropSubjects = new Set(
    poolPlayerProps.map((square) => bingoResolverPlayerKey(square.resolver)).filter((key): key is string => Boolean(key))
  );
  const representedPlayerTeams = playerTeamSides(playerProps);
  const poolPlayerTeams = playerTeamSides(poolPlayerProps);
  const earlyProgressOpportunities = nonFree.filter((square) => isBingoEarlyProgressResolver(square.resolver)).length;
  const issues: string[] = [];

  if (nonFree.length !== BINGO_NON_FREE_SQUARE_COUNT) issues.push("non_free_count");
  if (duplicateResolverKeys.length > 0) issues.push("duplicate_resolver_key");
  if (duplicateDiversityAxes.length > 0) issues.push("duplicate_or_near_duplicate_axis");
  if (unsupportedCount > 0) issues.push("unsupported_candidate");
  if (maxSquaresForOnePlayer > BINGO_MAX_SQUARES_PER_PLAYER) issues.push("player_square_cap");

  if (sportKey === "americanfootball_nfl") {
    const distinctTarget = Math.min(BINGO_NFL_MIN_DISTINCT_PROP_SUBJECTS, poolPropSubjects.size);
    if (
      playerProps.length >= BINGO_NFL_PLAYER_PROP_TARGET &&
      playerPropSubjects.size < distinctTarget
    ) {
      issues.push("nfl_distinct_prop_subjects");
    }
    if (poolPlayerTeams.length === 2 && playerProps.length >= 2 && representedPlayerTeams.length < 2) {
      issues.push("nfl_player_team_representation");
    }
    if (earlyProgressOpportunities < BINGO_NFL_MIN_EARLY_PROGRESS_OPPORTUNITIES) {
      issues.push("nfl_early_progress");
    }
  }

  return {
    eligible: issues.length === 0,
    issues,
    nonFreeCount: nonFree.length,
    duplicateResolverKeys,
    duplicateDiversityAxes,
    unsupportedCount,
    maxSquaresForOnePlayer,
    distinctPlayers: playerCounts.size,
    playerPropCount: playerProps.length,
    distinctPlayerPropSubjects: playerPropSubjects.size,
    representedPlayerTeams,
    earlyProgressOpportunities,
    maxLabelLength: Math.max(0, ...nonFree.map((square) => square.label.trim().length)),
  };
};

/** Cheap, deterministic preflight used by availability before Monte Carlo board generation. */
export const hasComposableSportsBingoCandidatePool = (
  sportKey: string,
  candidates: SportsBingoQualityCandidate[]
): boolean => {
  const supported = candidates.filter(
    (candidate) =>
      (candidate.supportLevel ?? "supported") === "supported" &&
      bingoResolverCapability(sportKey, candidate.resolver).supported
  );
  if (supported.length < BINGO_NON_FREE_SQUARE_COUNT) {
    return false;
  }

  const axes = new Set(supported.map(bingoCandidateDiversityAxis));
  if (axes.size < BINGO_NON_FREE_SQUARE_COUNT) {
    return false;
  }

  const axesByPlayer = new Map<string, Set<string>>();
  const nonPlayerAxes = new Set<string>();
  for (const candidate of supported) {
    const axis = bingoCandidateDiversityAxis(candidate);
    const playerKey = bingoResolverPlayerKey(candidate.resolver);
    if (playerKey) {
      const playerAxes = axesByPlayer.get(playerKey) ?? new Set<string>();
      playerAxes.add(axis);
      axesByPlayer.set(playerKey, playerAxes);
    } else {
      nonPlayerAxes.add(axis);
    }
  }
  const selectableUnderPlayerCap =
    nonPlayerAxes.size +
    [...axesByPlayer.values()].reduce(
      (sum, playerAxes) => sum + Math.min(BINGO_MAX_SQUARES_PER_PLAYER, playerAxes.size),
      0
    );
  if (selectableUnderPlayerCap < BINGO_NON_FREE_SQUARE_COUNT) {
    return false;
  }

  if (normalizeBingoSportKey(sportKey) !== "americanfootball_nfl") {
    return true;
  }

  // NFL also has hard board-level bucket budgets. Count unique axes, not raw templates, so a game
  // with 18 alternate special thresholds cannot appear available when only six may be selected.
  const nflSpecialAxes = new Set<string>();
  const nflPropAxesByPlayer = new Map<string, Set<string>>();
  const nflUnattributedPropAxes = new Set<string>();
  const nflOtherAxes = new Set<string>();
  for (const candidate of supported) {
    const axis = bingoCandidateDiversityAxis(candidate);
    if (candidate.bucket === "special") {
      nflSpecialAxes.add(axis);
    } else if (candidate.bucket === "player-prop") {
      const playerKey = bingoResolverPlayerKey(candidate.resolver);
      if (playerKey) {
        const playerAxes = nflPropAxesByPlayer.get(playerKey) ?? new Set<string>();
        playerAxes.add(axis);
        nflPropAxesByPlayer.set(playerKey, playerAxes);
      } else {
        nflUnattributedPropAxes.add(axis);
      }
    } else {
      nflOtherAxes.add(axis);
    }
  }
  const selectableProps = Math.min(
    BINGO_NFL_PLAYER_PROP_TARGET,
    nflUnattributedPropAxes.size +
      [...nflPropAxesByPlayer.values()].reduce(
        (sum, playerAxes) => sum + Math.min(BINGO_MAX_SQUARES_PER_PLAYER, playerAxes.size),
        0
      )
  );
  const selectableUnderBucketCaps =
    nflOtherAxes.size + Math.min(BINGO_NFL_SPECIAL_TARGET, nflSpecialAxes.size) + selectableProps;
  if (selectableUnderBucketCaps < BINGO_NON_FREE_SQUARE_COUNT) {
    return false;
  }

  return (
    new Set(
      supported
        .filter((candidate) => isBingoEarlyProgressResolver(candidate.resolver))
        .map(bingoCandidateDiversityAxis)
    ).size >= BINGO_NFL_MIN_EARLY_PROGRESS_OPPORTUNITIES
  );
};

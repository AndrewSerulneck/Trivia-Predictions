import type { SportsBingoResolver } from "@/lib/sportsBingo";
import { normalizeBingoSportKey } from "@/lib/sportsBingoIdentity";

// Admission is independent of odds and feature flags. See the capability matrix for
// provider endpoints, fixture provenance, finality, missing inputs and legacy policy.
const CORE = new Set<SportsBingoResolver["kind"]>(["free", "moneyline", "spread_more_than", "spread_keep_close", "game_total_over", "game_total_under", "team_total_over", "team_total_under"]);
const BASKETBALL = new Set<SportsBingoResolver["kind"]>(["nba_player_stat_at_least", "nba_team_stat_at_least"]);
const NFL = new Set<SportsBingoResolver["kind"]>([
  "nfl_player_anytime_td", "nfl_team_scores_every_quarter", "nfl_team_shutout_quarter",
  "nfl_team_quarter_points_at_least", "nfl_any_quarter_scoreless", "nfl_team_leads_at_halftime",
  "nfl_halftime_leader_loses", "nfl_overtime", "nfl_both_teams_score_at_least", "nfl_margin_at_most",
  "nfl_margin_at_least", "nfl_second_half_higher_scoring", "nfl_team_stat_at_least", "nfl_team_stat_at_most",
  "nfl_combined_team_stat_at_least", "nfl_combined_team_stat_at_most", "nfl_team_perfect_red_zone",
  "nfl_team_red_zone_trip_without_touchdown", "nfl_team_possession_advantage", "nfl_game_max_stat_at_least",
  "nfl_game_total_stat_at_least", "nfl_game_missed_field_goal", "nfl_non_quarterback_pass_attempt",
]);
export const BINGO_NFL_PROP_MARKETS = ["passing_yards", "passing_tds", "passing_attempts", "passing_completions", "interceptions", "rushing_yards", "rushing_attempts", "receptions", "receiving_yards", "rushing_receiving_yards", "longest_rush", "longest_reception", "fg_made", "kicking_points"] as const;
export const BINGO_MLB_PROP_MARKETS = ["player_hits", "player_home_runs", "player_rbis", "player_runs", "player_stolen_bases", "player_strikeouts_pitcher", "player_earned_runs", "player_pitcher_outs"] as const;
export const BINGO_BASKETBALL_METRICS = ["points", "rebounds", "assists", "steals", "blocks", "threes", "offensive_rebounds", "defensive_rebounds", "minutes_played"] as const;

export function bingoResolverCapability(sportKey: string, resolver: SportsBingoResolver): { supported: boolean; reason: string } {
  sportKey = normalizeBingoSportKey(sportKey);
  const reject = (reason: string) => ({ supported: false, reason });
  if (!["basketball_nba", "basketball_wnba", "americanfootball_nfl", "baseball_mlb"].includes(sportKey)) return reject("unsupported_league");
  // A current provider ID is compulsory on new named-player rules. Names alone remain legacy.
  if ("player" in resolver && !/::[1-9]\d*$/.test(resolver.player)) return reject("player_identity_missing");
  for (const field of ["line", "threshold", "seconds", "minTrips"] as const) {
    if (field in resolver) {
      const value = (resolver as unknown as Record<string, unknown>)[field];
      if (typeof value !== "number" || !Number.isFinite(value)) return reject("invalid_threshold");
    }
  }
  if ((resolver.kind === "nfl_combined_team_stat_at_least" || resolver.kind === "nfl_combined_team_stat_at_most") && !["penalties", "penalty_yards", "turnovers"].includes(resolver.field)) return reject("unverified_combined_field");
  if ("line" in resolver && Math.abs(resolver.line % 1) !== 0.5) return reject("new_lines_must_avoid_pushes");
  let supported = CORE.has(resolver.kind);
  if (sportKey.startsWith("basketball_") && BASKETBALL.has(resolver.kind)) {
    supported = resolver.kind === "nba_player_stat_at_least"
      ? (BINGO_BASKETBALL_METRICS as readonly string[]).includes(resolver.metric)
      : resolver.kind === "nba_team_stat_at_least" && ["made_threes", "total_assists", "total_rebounds"].includes(resolver.metric);
  }
  if (sportKey === "americanfootball_nfl") supported ||= NFL.has(resolver.kind);
  if (resolver.kind === "player_prop") {
    supported = sportKey === "americanfootball_nfl"
      ? (BINGO_NFL_PROP_MARKETS as readonly string[]).includes(resolver.marketKey)
      : sportKey === "baseball_mlb" && (BINGO_MLB_PROP_MARKETS as readonly string[]).includes(resolver.marketKey);
  }
  if (sportKey === "baseball_mlb") {
    if (resolver.kind === "mlb_webhook_player_event_at_least") supported = ["hit", "home_run", "strikeout", "walk", "hit_by_pitch", "rbi", "stolen_base", "pitcher_out"].includes(resolver.event);
    if (resolver.kind === "mlb_webhook_player_event_at_most") supported = ["earned_run", "hit_allowed"].includes(resolver.event);
    if (resolver.kind === "mlb_webhook_team_event_at_least") supported = ["groundout", "flyout", "strikeout", "walk", "hit_by_pitch", "hit"].includes(resolver.event);
  }
  return { supported, reason: supported ? "verified_provider_contract" : "legacy_only_until_evidence_verified" };
}

export const supportedBingoCandidates = <T extends { resolver: SportsBingoResolver }>(sportKey: string, candidates: T[]): T[] =>
  candidates.filter((candidate) => bingoResolverCapability(sportKey, candidate.resolver).supported);

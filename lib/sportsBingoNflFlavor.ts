/**
 * Phase 8b of docs/prop-bingo-nfl-plan.md — the NFL flavor-square slate.
 *
 * ## What this file is
 *
 * The **catalog**: every flavor square's resolver, its threshold and its base rate, in one place,
 * plus the label vocabulary the resolver kinds need. It deliberately owns no grading and no board
 * assembly — `lib/sportsBingo.ts` keeps the `SportsBingoResolver` union, `evaluateResolver`,
 * `resolverKey` and `buildSquareLabel`, and imports the pieces below. That split exists so adding a
 * 46th square is a data-only edit here rather than a ninth call-site edit over there, which is the
 * plan's own "prefer one parameterised kind per *source* over one kind per square" instruction.
 *
 * ## Where every number comes from
 *
 * **Measured, never guessed.** Phase 8a measured one hand-picked threshold per field over the full
 * 272-game 2025 regular season and found roughly half of the plan's sketched thresholds landed far
 * from their intended feel (`penalties >= 3` is 94%, not a coin flip; `punts_inside_20 >= 1` is
 * 96%, not a lean-lock). Phase 8b then swept the whole curve per field
 * (`npm run bingo:probe:nfl-flavor -- --sweep --tier4 --tier3-sample 272`) and every threshold
 * below is read off that curve, with the measured rate written next to it.
 *
 * - Raw sweep: `docs/phase0-artifacts/phase8b-nfl-threshold-sweep-2026-08-17.json`
 * - 8a's findings and the five feed unknowns: `docs/prop-bingo-nfl-phase8a-findings.md`
 * - `nfl_safety` recalibration (2026-08-18, same 272-game window, probe rule realigned to shipped
 *   grading): `docs/phase0-artifacts/phaseE-nfl-safety-recalibration-2026-08-18.json`. It is the
 *   only number in this file the probe and the grader had drifted apart on; the other eight Tier-3
 *   rates re-measured bit-identical, which is what proves the window is the same one.
 *
 * **These are single-season rates and they drift.** Re-run the sweep against the newest completed
 * season and diff before trusting them a year out — the same caveat Phase 7 put on its MLB numbers.
 *
 * ## Two feed facts that constrain everything here
 *
 * 1. `team_stats.sacks` is sacks **taken** by that team's offense, not sacks its defense made
 *    (8a Q2: 370 of 378 unambiguous team-games). Every square reading `sacks` says "sacked".
 * 2. `red_zone_scores` counts red-zone **touchdowns** only (8a Q3: 0 violations in 533 team-games).
 *    So `red_zone_attempts > red_zone_scores` means "left a red-zone trip without a touchdown",
 *    which includes turnovers and failed downs — *not* only "settled for a field goal". The square
 *    is named for what is actually measurable; see `nflTeamFlavorSquares`.
 */

import type { SportsBingoResolver } from "@/lib/sportsBingo";

type TeamSide = "home" | "away";

/**
 * The `/nfl/v1/team_stats` fields a Tier-1 square may read. This is an **allowlist checked at parse
 * time**, so a typo in a persisted resolver can never reach the grader as a silently-zero field.
 */
export const NFL_TEAM_STAT_FIELDS = [
  "penalties",
  "penalty_yards",
  "turnovers",
  "third_down_conversions",
  "fourth_down_conversions",
  "total_yards",
  "yards_per_play",
  "first_downs",
  "rushing_yards",
  "net_passing_yards",
  "total_offensive_plays",
  "sacks",
  "defensive_touchdowns",
  "possession_time_seconds",
  "red_zone_attempts",
  "red_zone_scores",
] as const;

export type NFLTeamStatField = (typeof NFL_TEAM_STAT_FIELDS)[number];

const NFL_TEAM_STAT_FIELD_SET: ReadonlySet<string> = new Set(NFL_TEAM_STAT_FIELDS);

export function isNFLTeamStatField(value: unknown): value is NFLTeamStatField {
  return typeof value === "string" && NFL_TEAM_STAT_FIELD_SET.has(value);
}

/**
 * Which team-stat fields only ever go **up** as a game is played.
 *
 * This is a settlement-correctness contract, not a style note. An at-least square on a monotone
 * counter may be settled `hit` the instant the feed clears the threshold, because nothing can take
 * it back. `yards_per_play` is a *ratio* — a team can average 6.1 at halftime and 5.2 at the
 * whistle — so an early hit on it would settle a square that later becomes false, and the cron
 * never re-opens a settled hit. Every ratio and every differential settles at Final only.
 */
export const NFL_MONOTONE_TEAM_STAT_FIELDS: ReadonlySet<NFLTeamStatField> = new Set<NFLTeamStatField>([
  "penalties",
  "penalty_yards",
  "turnovers",
  "third_down_conversions",
  "fourth_down_conversions",
  "total_yards",
  "first_downs",
  "rushing_yards",
  "net_passing_yards",
  "total_offensive_plays",
  "sacks",
  "defensive_touchdowns",
  "possession_time_seconds",
  "red_zone_attempts",
  "red_zone_scores",
]);

/**
 * The `/nfl/v1/stats` fields a Tier-2 "any player in this game" square may read. `touchdowns` is
 * synthetic — rushing + receiving + return + recovery, i.e. the same total `nfl_player_anytime_td`
 * already settles on — because no single provider field carries it.
 */
export const NFL_PLAYER_STAT_FIELDS = [
  "rushing_yards",
  "receiving_yards",
  "passing_yards",
  "receptions",
  "touchdowns",
  "field_goals_made",
  "long_field_goal_made",
  "total_tackles",
  "defensive_sacks",
  "defensive_interceptions",
  "punts_inside_20",
] as const;

export type NFLPlayerStatField = (typeof NFL_PLAYER_STAT_FIELDS)[number];

const NFL_PLAYER_STAT_FIELD_SET: ReadonlySet<string> = new Set(NFL_PLAYER_STAT_FIELDS);

export function isNFLPlayerStatField(value: unknown): value is NFLPlayerStatField {
  return typeof value === "string" && NFL_PLAYER_STAT_FIELD_SET.has(value);
}

// --- Label vocabulary ---------------------------------------------------------------------------

function formatThreshold(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Possession time is stored in seconds and never reads as one. `1800` → `"30+ minutes"`,
 * `1950` → `"32:30+"` — a whole number of minutes gets the word, anything else gets a clock.
 */
function formatPossessionThreshold(seconds: number, comparison: "at_least" | "at_most"): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  const suffix = comparison === "at_least" ? "+" : "";
  return remainder === 0
    ? `${minutes}${suffix} minutes`
    : `${minutes}:${String(remainder).padStart(2, "0")}${suffix}`;
}

/**
 * The predicate half of a Tier-1 label, e.g. `"commit 7+ penalties"`. The subject (`"The Eagles"`)
 * is prepended by `buildSquareLabel`, which is the only place that knows the team's display name.
 */
export function describeNFLTeamStat(
  field: NFLTeamStatField,
  threshold: number,
  comparison: "at_least" | "at_most"
): string {
  const value = formatThreshold(threshold);
  const singular = comparison === "at_least" && threshold === 1;

  if (comparison === "at_least") {
    switch (field) {
      case "penalties":
        return `commit ${value}+ penalties`;
      case "penalty_yards":
        return `are penalized ${value}+ yards`;
      case "turnovers":
        return singular ? "turn the ball over" : `turn the ball over ${value}+ times`;
      case "third_down_conversions":
        return `convert ${value}+ third downs`;
      case "fourth_down_conversions":
        return singular ? "convert a fourth down" : `convert ${value}+ fourth downs`;
      case "total_yards":
        return `gain ${value}+ total yards`;
      case "yards_per_play":
        return `average ${value}+ yards per play`;
      case "first_downs":
        return `pick up ${value}+ first downs`;
      case "rushing_yards":
        return `rush for ${value}+ yards`;
      case "net_passing_yards":
        return `pass for ${value}+ yards`;
      case "total_offensive_plays":
        return `run ${value}+ offensive plays`;
      case "sacks":
        return singular ? "are sacked" : `are sacked ${value}+ times`;
      case "defensive_touchdowns":
        return singular ? "score a defensive touchdown" : `score ${value}+ defensive touchdowns`;
      case "possession_time_seconds":
        return `hold the ball for ${formatPossessionThreshold(threshold, "at_least")}`;
      case "red_zone_attempts":
        return singular ? "reach the red zone" : `reach the red zone ${value}+ times`;
      case "red_zone_scores":
        return singular ? "score a red-zone touchdown" : `score ${value}+ red-zone touchdowns`;
    }
  }

  // Every at-most phrasing is inclusive of the threshold, because that is what the resolver
  // actually tests (`value <= threshold`) and what the sweep actually measured. "Held under 300"
  // would read better and would be a *different*, unmeasured predicate — the exact swap the plan
  // forbids.
  switch (field) {
    case "penalties":
      return threshold === 0 ? "are not flagged once" : `commit ${value} or fewer penalties`;
    case "penalty_yards":
      return `are penalized ${value} yards or fewer`;
    case "turnovers":
      return threshold === 0 ? "never turn the ball over" : `turn the ball over ${value} times or fewer`;
    case "third_down_conversions":
      return `convert ${value} or fewer third downs`;
    case "fourth_down_conversions":
      return threshold === 0 ? "never convert a fourth down" : `convert ${value} or fewer fourth downs`;
    case "total_yards":
      return `are held to ${value} total yards or fewer`;
    case "yards_per_play":
      return `average ${value} yards per play or fewer`;
    case "first_downs":
      return `are held to ${value} first downs or fewer`;
    case "rushing_yards":
      return `are held to ${value} rushing yards or fewer`;
    case "net_passing_yards":
      return `are held to ${value} passing yards or fewer`;
    case "total_offensive_plays":
      return `run ${value} offensive plays or fewer`;
    case "sacks":
      return threshold === 0 ? "are never sacked" : `are sacked ${value} times or fewer`;
    case "defensive_touchdowns":
      return "score no defensive touchdown";
    case "possession_time_seconds":
      return `hold the ball for ${formatPossessionThreshold(threshold, "at_most")} or less`;
    case "red_zone_attempts":
      return threshold === 0 ? "never reach the red zone" : `reach the red zone ${value} times or fewer`;
    case "red_zone_scores":
      return threshold === 0 ? "score no red-zone touchdown" : `score ${value} or fewer red-zone touchdowns`;
  }
}

/** The game-level twin: both teams' values added together. */
export function describeNFLCombinedTeamStat(
  field: NFLTeamStatField,
  threshold: number,
  comparison: "at_least" | "at_most"
): string {
  const value = formatThreshold(threshold);
  if (comparison === "at_most" && field === "turnovers" && threshold === 0) {
    return "Neither team turns the ball over.";
  }
  const noun: Record<NFLTeamStatField, string> = {
    penalties: "penalties",
    penalty_yards: "penalty yards",
    turnovers: "turnovers",
    third_down_conversions: "third-down conversions",
    fourth_down_conversions: "fourth-down conversions",
    total_yards: "total yards",
    yards_per_play: "yards per play",
    first_downs: "first downs",
    rushing_yards: "rushing yards",
    net_passing_yards: "passing yards",
    total_offensive_plays: "offensive plays",
    sacks: "sacks taken",
    defensive_touchdowns: "defensive touchdowns",
    possession_time_seconds: "seconds of possession",
    red_zone_attempts: "red-zone trips",
    red_zone_scores: "red-zone touchdowns",
  };
  return comparison === "at_least"
    ? `${value}+ combined ${noun[field]} in this game.`
    : `${value} or fewer combined ${noun[field]} in this game.`;
}

/** The Tier-2 "any player in this game" label, e.g. `"A 75+ yard rusher."` */
export function describeNFLPlayerStatMax(
  field: NFLPlayerStatField,
  threshold: number,
  scope: "any_player" | "both_teams"
): string {
  const value = formatThreshold(threshold);
  if (scope === "both_teams") {
    switch (field) {
      case "passing_yards":
        return `Both quarterbacks throw for ${value}+ yards.`;
      case "rushing_yards":
        return `Both teams get a ${value}+ yard rusher.`;
      case "receiving_yards":
        return `Both teams get a ${value}+ yard receiver.`;
      default:
        return `Both teams get a player with ${value}+ ${field.replace(/_/g, " ")}.`;
    }
  }

  switch (field) {
    case "rushing_yards":
      return `A ${value}-yard rusher.`;
    case "receiving_yards":
      return `A ${value}-yard receiver.`;
    case "passing_yards":
      return `A ${value}-yard passer.`;
    case "receptions":
      return `A receiver catches ${value}+ passes.`;
    case "touchdowns":
      return threshold <= 1 ? "Someone scores a touchdown." : `A player scores ${value}+ touchdowns.`;
    case "field_goals_made":
      return `A kicker makes ${value}+ field goals.`;
    case "long_field_goal_made":
      return `A made field goal of ${value}+ yards.`;
    case "total_tackles":
      return `A defender records ${value}+ tackles.`;
    case "defensive_sacks":
      return threshold <= 1 ? "A defender records a sack." : `A defender records ${value}+ sacks.`;
    case "defensive_interceptions":
      return threshold <= 1 ? "A defender picks off a pass." : `A defender picks off ${value}+ passes.`;
    case "punts_inside_20":
      return threshold <= 1 ? "A punt is downed inside the 20." : `${value}+ punts are downed inside the 20.`;
  }
}

/** The game-wide sum twin of the square above, e.g. `"4+ punts downed inside the 20."` */
export function describeNFLPlayerStatTotal(field: NFLPlayerStatField, threshold: number): string {
  const value = formatThreshold(threshold);
  switch (field) {
    case "punts_inside_20":
      return `${value}+ punts downed inside the 20.`;
    case "defensive_sacks":
      return `${value}+ sacks in this game.`;
    case "defensive_interceptions":
      return `${value}+ interceptions in this game.`;
    case "field_goals_made":
      return `${value}+ field goals made in this game.`;
    case "touchdowns":
      return `${value}+ touchdowns in this game.`;
    default:
      return `${value}+ combined ${field.replace(/_/g, " ")} in this game.`;
  }
}


// --- The slate ----------------------------------------------------------------------------------

export type NFLFlavorSquare = {
  resolver: SportsBingoResolver;
  /**
   * The realized 2025 regular-season rate for **this exact predicate at this exact threshold**.
   * Threshold and rate live on one line on purpose: a rate that has drifted away from its own
   * threshold is worse than a wrong threshold, because the win-rate estimator will price a board
   * off it with full confidence. Re-run the sweep and edit both together, never one.
   */
  baseRate: number;
  /** `1` = likelier in high-scoring games, `-1` = likelier in low-scoring ones, `0` = flat. */
  totalShade: 1 | -1 | 0;
  tier: 1 | 2 | 3;
};

/**
 * Per-team Tier-1 squares (`/nfl/v1/team_stats`), one entry per row of the plan's Tier-1 table.
 *
 * The `n` for every rate below is 544 team-games (272 games × 2), except where a field is absent
 * for teams with a zero — `sacks` and `fourth_down_conversions` come back `null` rather than `0`,
 * so their rates are computed over all 544 with the nulls counted as misses, which is what the
 * grader does too.
 */
function nflTeamFlavorSquares(team: TeamSide): NFLFlavorSquare[] {
  const tier1 = (resolver: SportsBingoResolver, baseRate: number, totalShade: 1 | -1 | 0 = 0): NFLFlavorSquare => ({
    resolver,
    baseRate,
    totalShade,
    tier: 1,
  });

  return [
    // Plan #1. Sketched as `>= 3`, which measures 0.941 — nearly automatic. 7 is the coin flip.
    tier1({ kind: "nfl_team_stat_at_least", team, field: "penalties", threshold: 7 }, 0.426),
    // Plan #2. Sketched at 75 yards (0.188). 50 is the coin flip.
    tier1({ kind: "nfl_team_stat_at_least", team, field: "penalty_yards", threshold: 50 }, 0.467),
    // Plan #4, at the plan's own threshold: a genuine long-shot-adjacent square, kept as-is.
    tier1({ kind: "nfl_team_stat_at_least", team, field: "turnovers", threshold: 2 }, 0.327),
    // The per-team complement of plan #5, and a better square than the game-level version because
    // it can hit for one team while the other is coughing it up.
    tier1({ kind: "nfl_team_stat_at_most", team, field: "turnovers", threshold: 0 }, 0.346),
    // Plan #7. Sketched at 6 (0.399) / 8 (0.121); 5 is the coin flip.
    tier1({ kind: "nfl_team_stat_at_least", team, field: "third_down_conversions", threshold: 5 }, 0.568),
    // Plan #8. Sketched "lean-lock"; it is really a coin flip once no-attempt games are counted.
    tier1({ kind: "nfl_team_stat_at_least", team, field: "fourth_down_conversions", threshold: 1 }, 0.568),
    // Plan #9, on target as sketched.
    tier1({ kind: "nfl_team_perfect_red_zone", team, minTrips: 3 }, 0.086),
    // Plan #10, RENAMED. See the module docstring: `attempts > scores` fires on a red-zone turnover
    // or failed downs too, not only on a field goal, so the label says what is measurable.
    tier1({ kind: "nfl_team_red_zone_trip_without_touchdown", team }, 0.801),
    // Plan #11. The game-level rate is 0.592 for *either* team; one named team is half of it.
    tier1({ kind: "nfl_team_possession_advantage", team, seconds: 300 }, 0.296),
    // Plan #12. Sketched at 35:00 (0.134); 30:00 is the coin flip.
    tier1({ kind: "nfl_team_stat_at_least", team, field: "possession_time_seconds", threshold: 1800 }, 0.506),
    // Plan #13. Sketched at 400 (0.189).
    tier1({ kind: "nfl_team_stat_at_least", team, field: "total_yards", threshold: 330 }, 0.513, 1),
    // Plan #14. Sketched "under 250" (0.176). Phrased inclusively because that is what is measured.
    tier1({ kind: "nfl_team_stat_at_most", team, field: "total_yards", threshold: 300 }, 0.373, -1),
    // Plan #15. Sketched at 6.0 (0.292).
    tier1({ kind: "nfl_team_stat_at_least", team, field: "yards_per_play", threshold: 5.4 }, 0.5, 1),
    // Plan #16. Sketched at 25 (0.156).
    tier1({ kind: "nfl_team_stat_at_least", team, field: "first_downs", threshold: 20 }, 0.48, 1),
    // Plan #17a. Sketched at 150 (0.233).
    tier1({ kind: "nfl_team_stat_at_least", team, field: "rushing_yards", threshold: 115 }, 0.496),
    // Plan #17b. Sketched at 300 (0.108).
    tier1({ kind: "nfl_team_stat_at_least", team, field: "net_passing_yards", threshold: 210 }, 0.476, 1),
    // Plan #19. Sketched at 70 (0.156).
    tier1({ kind: "nfl_team_stat_at_least", team, field: "total_offensive_plays", threshold: 62 }, 0.517),
    // Plan #20, unblocked by 8a Q2: `sacks` is sacks TAKEN. Sketched at 4 (0.235).
    tier1({ kind: "nfl_team_stat_at_least", team, field: "sacks", threshold: 3 }, 0.406),
    // Plan #18, on target as sketched. Note this is narrower than the existing
    // `nfl_non_offensive_touchdown`, which also counts return touchdowns.
    tier1({ kind: "nfl_team_stat_at_least", team, field: "defensive_touchdowns", threshold: 1 }, 0.121),
  ];
}

/** Game-level Tier-1, Tier-2 and Tier-3 squares. `n` = 272 games for every rate here. */
function nflGameFlavorSquares(): NFLFlavorSquare[] {
  const square = (
    tier: 1 | 2 | 3,
    resolver: SportsBingoResolver,
    baseRate: number,
    totalShade: 1 | -1 | 0 = 0
  ): NFLFlavorSquare => ({ resolver, baseRate, totalShade, tier });

  return [
    // --- Tier 1, game level -------------------------------------------------------------------
    // Plan #3. Sketched at 120 (0.320).
    square(1, { kind: "nfl_combined_team_stat_at_least", field: "penalty_yards", threshold: 95 }, 0.493),
    // Not in the plan's table, free once the parameterised kind exists: the flag-count twin.
    square(1, { kind: "nfl_combined_team_stat_at_least", field: "penalties", threshold: 13 }, 0.471),
    // Plan #6, on target as sketched.
    square(1, { kind: "nfl_combined_team_stat_at_least", field: "turnovers", threshold: 3 }, 0.401),
    // Plan #5, on target as sketched.
    square(1, { kind: "nfl_combined_team_stat_at_most", field: "turnovers", threshold: 0 }, 0.081),

    // --- Tier 2 — `/nfl/v1/stats`, zero new calls ----------------------------------------------
    // Plan #21. Sketched at 100 (0.324).
    square(2, { kind: "nfl_game_max_stat_at_least", field: "rushing_yards", threshold: 85, scope: "any_player" }, 0.482),
    // Plan #22, sketched "lean-lock" at 100 — which measures 0.426. 75 is the lean-lock.
    square(2, { kind: "nfl_game_max_stat_at_least", field: "receiving_yards", threshold: 75, scope: "any_player" }, 0.75, 1),
    // Plan #23. Sketched at 300 (0.221).
    square(2, { kind: "nfl_game_max_stat_at_least", field: "passing_yards", threshold: 260, scope: "any_player" }, 0.482, 1),
    // Plan #24. Sketched at 250 each (0.151).
    square(2, { kind: "nfl_game_max_stat_at_least", field: "passing_yards", threshold: 180, scope: "both_teams" }, 0.485, 1),
    // Plan #25, on target as sketched — a rare case where the hand guess was already right.
    square(2, { kind: "nfl_game_max_stat_at_least", field: "receptions", threshold: 10, scope: "any_player" }, 0.14),
    // Plan #26, on target as sketched.
    square(2, { kind: "nfl_game_max_stat_at_least", field: "touchdowns", threshold: 2, scope: "any_player" }, 0.526, 1),
    // Plan #27, on target as sketched.
    square(2, { kind: "nfl_game_max_stat_at_least", field: "long_field_goal_made", threshold: 50, scope: "any_player" }, 0.474),
    // Plan #28, on target as sketched.
    square(2, { kind: "nfl_game_max_stat_at_least", field: "field_goals_made", threshold: 3, scope: "any_player" }, 0.408),
    // Plan #29, narrowed to what is actually measurable. The plan sketched "a missed field goal
    // OR a missed extra point", but `extra_points_made` vs touchdowns cannot distinguish a missed
    // kick from a successful two-point conversion, so an XP clause would fire on a *made* play.
    // 8a's 0.460 was, on inspection of its own predicate, a missed-field-goal rate all along —
    // its extra-point clause could only ever evaluate against a kicker's (always zero) rushing and
    // receiving touchdowns. Its own kind rather than a max-stat: it compares two provider fields.
    square(2, { kind: "nfl_game_missed_field_goal" }, 0.46),
    // Plan #30, sketched "lean-lock" at 1 — which measures 0.956, i.e. nearly automatic. The
    // game-wide count at 3 is the square that was intended.
    square(2, { kind: "nfl_game_total_stat_at_least", field: "punts_inside_20", threshold: 3 }, 0.559),
    // Plan #31, on target as sketched. Needs the position join, which `resolveNFLPlayerProfiles`
    // already memoizes — but the box-score row carries `position_abbreviation` directly, so this
    // costs no request at all.
    square(2, { kind: "nfl_non_quarterback_pass_attempt" }, 0.074),
    // Plan #32, unblocked by 8a Q4. On target as sketched.
    square(2, { kind: "nfl_game_max_stat_at_least", field: "defensive_sacks", threshold: 2, scope: "any_player" }, 0.386),
    // Plan #33, unblocked by 8a Q4. Sketched at 10 (0.790 — a lean-lock, not a coin flip).
    square(2, { kind: "nfl_game_max_stat_at_least", field: "total_tackles", threshold: 12, scope: "any_player" }, 0.426),
    // Plan #34, unblocked by 8a Q4. Sketched as "a defender picks off a pass" (0.787). The
    // game-wide count at 2 is the coin flip the plan was reaching for.
    square(2, { kind: "nfl_game_total_stat_at_least", field: "defensive_interceptions", threshold: 2 }, 0.43),
    // Not in the plan's table; free once the total-stat kind exists, and a genuinely different
    // square from "a defender records 2+ sacks".
    square(2, { kind: "nfl_game_total_stat_at_least", field: "defensive_sacks", threshold: 5 }, 0.507),

    // --- Tier 3 — clock-and-score arithmetic over the existing plays walk -----------------------
    // Plan #35. Sketched at 5 minutes (0.191 measured over the full season, not the coin flip the
    // plan expected); 6 minutes is the coin flip.
    square(3, { kind: "nfl_first_score_within_minutes", minutes: 6 }, 0.467, 1),
    // Plan #36, on target as sketched.
    square(3, { kind: "nfl_score_in_final_minutes", segment: "first_half", minutes: 1 }, 0.647, 1),
    // Plan #37, sketched "lean-lock"; it is a coin flip. The two-minute window is kept because it
    // is the one every viewer already has a name for.
    square(3, { kind: "nfl_score_in_final_minutes", segment: "fourth_quarter", minutes: 2 }, 0.412, 1),
    // Plan #38, on target as sketched.
    square(3, { kind: "nfl_both_teams_lead" }, 0.596),
    // Plan #39.
    square(3, { kind: "nfl_lead_change_second_half" }, 0.379),
    // Plan #41.
    square(3, { kind: "nfl_tied_after_halftime" }, 0.268),
    // Plan #40, on target as sketched.
    square(3, { kind: "nfl_winner_trailed_in_fourth" }, 0.254),
    // Plan #42, on target as sketched. A scoring delta of exactly 8 — the boundary the Phase 4
    // corrupt-play guard deliberately permits. Do not tighten that guard to 7. Shipped grading
    // also counts a *separately booked* +2 that the feed types as a two-point try; re-measuring
    // under that wider rule (Phase E, below) moved this number by exactly nothing — 50/272 either
    // way — because no 2025 regular-season game booked one that way. Unchanged, and now measured
    // under the rule that actually grades it.
    square(3, { kind: "nfl_two_point_conversion" }, 0.184),
    // Plan #43. **Recalibrated 2026-08-18 (Phase E of
    // docs/prop-bingo-out-of-scope-followup-plan.md): 0.048 -> 0.044, n = 272.**
    //
    // The original 0.048 (13/272) was measured by a probe that still scored *any* +2 as a safety.
    // Shipped grading stopped doing that in Phase 3 — a +2 is attributed by play type, and a +2
    // nothing types voids rather than guessing — so the old number counted plays this square can
    // no longer hit on. Re-running the probe against the shipped predicates over the *same*
    // 272-game 2025 regular season gives 12/272 = 0.0441 hits, plus 1/272 unattributable (which
    // grades `void`, neither hit nor miss, so it stays in the denominator the board simulator
    // prices against). Artifact: docs/phase0-artifacts/phaseE-nfl-safety-recalibration-2026-08-18.json.
    //
    // **Read the size of this correction honestly.** It is one game. At n = 272 a 12/272 rate
    // carries a 95% interval of roughly 0.023-0.076, so 0.048 and 0.044 are not statistically
    // distinguishable here; what the re-measurement buys is that the number is no longer measured
    // by a rule the grader stopped using. Only a multi-season sample could separate them.
    square(3, { kind: "nfl_safety" }, 0.044),
    // Plan #44, sketched at the 2-yard line (0.695 — a lean-lock, not a coin flip). The 1 is.
    square(3, { kind: "nfl_goal_line_touchdown", yards: 1 }, 0.522, 1),
  ];
}

/**
 * Every flavor square for a game, in one list.
 *
 * **Plan #45 (`home_win_probability`, "the winner was once under 25% to win") is deliberately not
 * here.** 8a found the field populated on 98.2% of *archived* plays, which proves BDL retains it,
 * not that it is written while the game is being played — and a comeback square that only resolves
 * after the whistle is the one thing this square exists not to be. It ships when the Week-1 live
 * check in `docs/prop-bingo-nfl-phase8a-findings.md` §1 confirms live population.
 *
 * **Tier 4 (drive-segmented squares) is deliberately not here either.** The plan's ship gate was a
 * ≥98% reconciliation of reconstructed drive counts against the independently published
 * `team_stats.total_drives`. Measured over all 272 games: **32.0% exact, 87.5% within one drive**
 * (`tier4DriveReconstruction` in the sweep artifact). That is a decisive fail, so Tier 4 is dropped
 * exactly as the plan instructs, and squares 35–44 above cover the same emotional ground.
 */
export function buildNFLFlavorSquares(): NFLFlavorSquare[] {
  return [...nflTeamFlavorSquares("home"), ...nflTeamFlavorSquares("away"), ...nflGameFlavorSquares()];
}

/**
 * Which team a Tier-1 square is about, for the per-team cap in `pickCandidateSet`. `null` for
 * game-level squares, which that cap does not apply to.
 */
export function nflFlavorTeamSide(resolver: SportsBingoResolver): TeamSide | null {
  switch (resolver.kind) {
    case "nfl_team_stat_at_least":
    case "nfl_team_stat_at_most":
    case "nfl_team_perfect_red_zone":
    case "nfl_team_red_zone_trip_without_touchdown":
    case "nfl_team_possession_advantage":
      return resolver.team;
    default:
      return null;
  }
}

/**
 * Does this square read `/nfl/v1/team_stats`? Tier 1 is the only flavor family that costs a new
 * request, and the only one whose mid-game population is still unconfirmed (8a Q1) — so it is the
 * one the board-mix cap is written against.
 */
export function isNFLTeamStatsResolver(resolver: SportsBingoResolver): boolean {
  switch (resolver.kind) {
    case "nfl_team_stat_at_least":
    case "nfl_team_stat_at_most":
    case "nfl_combined_team_stat_at_least":
    case "nfl_combined_team_stat_at_most":
    case "nfl_team_perfect_red_zone":
    case "nfl_team_red_zone_trip_without_touchdown":
    case "nfl_team_possession_advantage":
      return true;
    default:
      return false;
  }
}

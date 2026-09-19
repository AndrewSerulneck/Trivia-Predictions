import { describe, expect, it } from "vitest";

import type { SportsBingoResolver } from "@/lib/sportsBingo";
import {
  auditSportsBingoBoardQuality,
  hasComposableSportsBingoCandidatePool,
  isBingoEarlyProgressResolver,
  type SportsBingoQualityCandidate,
} from "@/lib/sportsBingoQuality";

const NFL = "americanfootball_nfl";

function square(
  key: string,
  resolver: SportsBingoResolver,
  extras: Partial<SportsBingoQualityCandidate> = {}
): SportsBingoQualityCandidate {
  return { key, label: extras.label ?? key, resolver, supportLevel: "supported", ...extras };
}

function coreSquares(count = 16): SportsBingoQualityCandidate[] {
  return Array.from({ length: count }, (_, index) =>
    square(`total:${index}`, { kind: "game_total_over", line: 20.5 + index })
  );
}

function prop(
  playerId: number,
  marketKey: string,
  teamHint: "home" | "away",
  line = 0.5
): SportsBingoQualityCandidate {
  return square(
    `player_prop:${marketKey}:player ${playerId}::${playerId}:over:${line}`,
    { kind: "player_prop", player: `Player ${playerId}::${playerId}`, marketKey, direction: "over", line },
    { bucket: "player-prop", teamHint }
  );
}

function qualityBoard(): SportsBingoQualityCandidate[] {
  return [
    ...coreSquares(),
    prop(1, "passing_yards", "home", 249.5),
    prop(1, "passing_tds", "home", 1.5),
    prop(2, "rushing_yards", "home", 69.5),
    prop(2, "receptions", "home", 4.5),
    prop(3, "receiving_yards", "away", 74.5),
    prop(4, "rushing_attempts", "away", 14.5),
    prop(5, "passing_completions", "away", 21.5),
    prop(6, "kicking_points", "away", 6.5),
  ];
}

describe("sports Bingo Phase 5 board quality", () => {
  it("accepts a 24-square NFL board with eight props, six subjects, both teams and early movement", () => {
    const board = qualityBoard();
    const result = auditSportsBingoBoardQuality({ sportKey: NFL, squares: board, candidatePool: board });

    expect(result).toMatchObject({
      eligible: true,
      nonFreeCount: 24,
      playerPropCount: 8,
      distinctPlayerPropSubjects: 6,
      representedPlayerTeams: ["away", "home"],
      maxSquaresForOnePlayer: 2,
    });
    expect(result.earlyProgressOpportunities).toBeGreaterThanOrEqual(3);
  });

  it("rejects duplicate keys, repeated player ideas and unsupported resolvers", () => {
    const duplicateKey = qualityBoard();
    duplicateKey[1] = { ...duplicateKey[0] };
    expect(auditSportsBingoBoardQuality({ sportKey: NFL, squares: duplicateKey }).issues).toContain(
      "duplicate_resolver_key"
    );

    const repeatedIdea = qualityBoard();
    repeatedIdea[17] = prop(1, "passing_yards", "home", 274.5);
    expect(auditSportsBingoBoardQuality({ sportKey: NFL, squares: repeatedIdea }).issues).toContain(
      "duplicate_or_near_duplicate_axis"
    );

    const unsupported = qualityBoard();
    unsupported[0] = square("first-td", { kind: "nfl_player_first_td", player: "Player 1::1" });
    expect(auditSportsBingoBoardQuality({ sportKey: NFL, squares: unsupported }).issues).toContain(
      "unsupported_candidate"
    );
  });

  it("rejects player monopolies, one-sided rich pools and fewer than six prop subjects", () => {
    const monopoly = qualityBoard();
    monopoly[18] = prop(1, "interceptions", "away", 0.5);
    expect(auditSportsBingoBoardQuality({ sportKey: NFL, squares: monopoly }).issues).toContain(
      "player_square_cap"
    );

    const oneSided = qualityBoard().map((candidate) =>
      candidate.bucket === "player-prop" ? { ...candidate, teamHint: "home" as const } : candidate
    );
    const twoSidedPool = [...oneSided, prop(99, "receiving_yards", "away", 39.5)];
    expect(
      auditSportsBingoBoardQuality({ sportKey: NFL, squares: oneSided, candidatePool: twoSidedPool }).issues
    ).toContain("nfl_player_team_representation");

    const fourSubjects = [
      ...coreSquares(),
      prop(1, "passing_yards", "home", 249.5),
      prop(1, "passing_tds", "home", 1.5),
      prop(2, "rushing_yards", "home", 69.5),
      prop(2, "rushing_attempts", "home", 14.5),
      prop(3, "receiving_yards", "away", 74.5),
      prop(3, "receptions", "away", 4.5),
      prop(4, "passing_completions", "away", 21.5),
      prop(4, "interceptions", "away", 0.5),
    ];
    const sixSubjectPool = [
      ...fourSubjects,
      prop(5, "kicking_points", "away", 6.5),
      prop(6, "fg_made", "away", 1.5),
    ];
    expect(
      auditSportsBingoBoardQuality({ sportKey: NFL, squares: fourSubjects, candidatePool: sixSubjectPool }).issues
    ).toContain("nfl_distinct_prop_subjects");
  });

  it("requires at least three opportunities that can settle before Final", () => {
    const finalOnly = Array.from({ length: 24 }, (_, index) =>
      square(`spread:${index}`, {
        kind: "spread_more_than",
        team: index % 2 === 0 ? "home" : "away",
        line: index + 0.5,
      })
    );
    const result = auditSportsBingoBoardQuality({ sportKey: NFL, squares: finalOnly });
    expect(result.earlyProgressOpportunities).toBe(0);
    expect(result.issues).toContain("nfl_early_progress");

    expect(isBingoEarlyProgressResolver({ kind: "game_total_over", line: 40.5 })).toBe(true);
    expect(isBingoEarlyProgressResolver({ kind: "moneyline", team: "home" })).toBe(false);
    expect(
      isBingoEarlyProgressResolver({
        kind: "nfl_team_stat_at_least",
        team: "home",
        field: "first_downs",
        threshold: 20,
      })
    ).toBe(true);
  });

  it("fails availability preflight when 24 quality squares cannot be composed", () => {
    expect(hasComposableSportsBingoCandidatePool(NFL, qualityBoard())).toBe(true);

    const playerMonopolyPool = [
      ...coreSquares(21),
      prop(1, "passing_yards", "home", 249.5),
      prop(1, "passing_tds", "home", 1.5),
      prop(1, "rushing_yards", "home", 39.5),
      prop(1, "rushing_attempts", "home", 8.5),
      prop(1, "interceptions", "home", 0.5),
    ];
    expect(hasComposableSportsBingoCandidatePool(NFL, playerMonopolyPool)).toBe(false);

    const finalOnly = Array.from({ length: 24 }, (_, index) =>
      square(`spread:${index}`, {
        kind: "spread_keep_close",
        team: index % 2 === 0 ? "home" : "away",
        line: index + 0.5,
      })
    );
    expect(hasComposableSportsBingoCandidatePool(NFL, finalOnly)).toBe(false);

    const specialsOnly = [
      ...Array.from({ length: 18 }, (_, index) =>
        square(
          `special:${index}`,
          { kind: "game_total_over", line: 30.5 + index },
          { bucket: "special" }
        )
      ),
      ...coreSquares(6),
    ];
    expect(hasComposableSportsBingoCandidatePool(NFL, specialsOnly)).toBe(false);
  });
});

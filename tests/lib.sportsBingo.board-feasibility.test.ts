import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type MockResponsePayload = {
  status?: number;
  ok?: boolean;
  body: unknown;
};

function jsonResponse(payload: MockResponsePayload): Response {
  const { status = 200, ok = true, body } = payload;
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

const LINE_PATTERNS: number[][] = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

type ParsedResolver =
  | { kind: "free" }
  | { kind: "moneyline"; team: "home" | "away" }
  | { kind: "spread_more_than"; team: "home" | "away"; line: number }
  | { kind: "spread_keep_close"; team: "home" | "away"; line: number }
  | { kind: "game_total_over"; line: number }
  | { kind: "game_total_under"; line: number }
  | { kind: "team_total_over"; team: "home" | "away"; line: number }
  | { kind: "team_total_under"; team: "home" | "away"; line: number }
  | { kind: "player_prop"; marketKey: string; player: string; direction: "over" | "under"; line: number }
  | { kind: "team_triple_double"; team: "home" | "away" }
  | { kind: "any_triple_double" }
  | { kind: "replacement_auto" }
  | { kind: "unknown" };

function parseResolverFromSquareKey(key: string): ParsedResolver {
  if (key === "free") return { kind: "free" };
  if (key === "replacement_auto") return { kind: "replacement_auto" };
  if (key === "any_triple_double") return { kind: "any_triple_double" };

  const parts = key.split(":");
  const kind = parts[0] ?? "";

  if (kind === "moneyline") {
    const team = parts[1];
    if (team === "home" || team === "away") return { kind, team };
  }

  if (kind === "spread_more_than" || kind === "spread_keep_close") {
    const team = parts[1];
    const line = Number(parts[2]);
    if ((team === "home" || team === "away") && Number.isFinite(line)) {
      return { kind, team, line };
    }
  }

  if (kind === "game_total_over" || kind === "game_total_under") {
    const line = Number(parts[1]);
    if (Number.isFinite(line)) return { kind, line };
  }

  if (kind === "team_total_over" || kind === "team_total_under") {
    const team = parts[1];
    const line = Number(parts[2]);
    if ((team === "home" || team === "away") && Number.isFinite(line)) {
      return { kind, team, line };
    }
  }

  if (kind === "team_triple_double") {
    const team = parts[1];
    if (team === "home" || team === "away") return { kind, team };
  }

  if (kind === "player_prop" && parts.length >= 5) {
    const marketKey = parts[1] ?? "";
    const directionPart = parts[parts.length - 2] ?? "";
    const linePart = parts[parts.length - 1] ?? "";
    const player = parts.slice(2, parts.length - 2).join(":");
    const line = Number(linePart);

    if ((directionPart === "over" || directionPart === "under") && Number.isFinite(line) && marketKey && player) {
      return {
        kind,
        marketKey,
        player,
        direction: directionPart,
        line,
      };
    }
  }

  return { kind: "unknown" };
}

function marginBoundsFor(resolver: ParsedResolver): { lowerExclusive: number; upperExclusive: number } {
  switch (resolver.kind) {
    case "moneyline":
      return resolver.team === "home"
        ? { lowerExclusive: 0, upperExclusive: Number.POSITIVE_INFINITY }
        : { lowerExclusive: Number.NEGATIVE_INFINITY, upperExclusive: 0 };
    case "spread_more_than":
      return resolver.team === "home"
        ? { lowerExclusive: resolver.line, upperExclusive: Number.POSITIVE_INFINITY }
        : { lowerExclusive: Number.NEGATIVE_INFINITY, upperExclusive: -resolver.line };
    case "spread_keep_close":
      return resolver.team === "home"
        ? { lowerExclusive: -resolver.line, upperExclusive: Number.POSITIVE_INFINITY }
        : { lowerExclusive: Number.NEGATIVE_INFINITY, upperExclusive: resolver.line };
    default:
      return { lowerExclusive: Number.NEGATIVE_INFINITY, upperExclusive: Number.POSITIVE_INFINITY };
  }
}

function pairIsImpossible(a: ParsedResolver, b: ParsedResolver): boolean {
  const usesMargin = (resolver: ParsedResolver) =>
    resolver.kind === "moneyline" || resolver.kind === "spread_more_than" || resolver.kind === "spread_keep_close";

  if (usesMargin(a) || usesMargin(b)) {
    const aBounds = marginBoundsFor(a);
    const bBounds = marginBoundsFor(b);
    const lower = Math.max(aBounds.lowerExclusive, bBounds.lowerExclusive);
    const upper = Math.min(aBounds.upperExclusive, bBounds.upperExclusive);
    if (lower >= upper) {
      return true;
    }
  }

  if (
    a.kind === "game_total_over" &&
    b.kind === "game_total_under" &&
    a.line >= b.line
  ) {
    return true;
  }
  if (
    a.kind === "game_total_under" &&
    b.kind === "game_total_over" &&
    b.line >= a.line
  ) {
    return true;
  }

  const sameTeamTotalAxis =
    (a.kind === "team_total_over" || a.kind === "team_total_under") &&
    (b.kind === "team_total_over" || b.kind === "team_total_under") &&
    a.team === b.team;
  if (sameTeamTotalAxis) {
    if (a.kind === "team_total_over" && b.kind === "team_total_under" && a.line >= b.line) {
      return true;
    }
    if (a.kind === "team_total_under" && b.kind === "team_total_over" && b.line >= a.line) {
      return true;
    }
  }

  const samePlayerAxis =
    a.kind === "player_prop" &&
    b.kind === "player_prop" &&
    a.marketKey === b.marketKey &&
    a.player === b.player;
  if (samePlayerAxis) {
    if (a.direction === "over" && b.direction === "under" && a.line >= b.line) {
      return true;
    }
    if (a.direction === "under" && b.direction === "over" && b.line >= a.line) {
      return true;
    }
  }

  return false;
}

function lineIsPossible(squareKeys: string[]): boolean {
  const resolvers = squareKeys
    .map((key) => parseResolverFromSquareKey(key))
    .filter((resolver) => resolver.kind !== "free" && resolver.kind !== "replacement_auto");

  for (let i = 0; i < resolvers.length; i += 1) {
    for (let j = i + 1; j < resolvers.length; j += 1) {
      const a = resolvers[i];
      const b = resolvers[j];
      if (!a || !b) {
        continue;
      }
      if (pairIsImpossible(a, b)) {
        return false;
      }
    }
  }

  return true;
}

describe("sports bingo board feasibility", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ODDS_API_KEY = "test-odds-key";
    process.env.ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";
    process.env.BINGO_BOARD_SIM_TRIALS = "600";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds NBA boards with no impossible bingo lines and no combo-stat player props", async () => {
    const players = ["Jayson Tatum", "Jaylen Brown", "Jrue Holiday", "Derrick White", "Kristaps Porzingis"];

    const buildMarket = (key: string, baseLine: number) => ({
      key,
      outcomes: players.flatMap((player, index) => {
        const line = baseLine + index;
        return [
          { name: "Over", description: player, point: line, price: -112 },
          { name: "Under", description: player, point: line, price: -108 },
        ];
      }),
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          body: [
            {
              id: "nba-evt-2",
              sport_key: "basketball_nba",
              commence_time: "2030-02-01T00:00:00Z",
              home_team: "Boston Celtics",
              away_team: "Miami Heat",
              bookmakers: [
                {
                  title: "DraftKings",
                  markets: [
                    {
                      key: "h2h",
                      outcomes: [
                        { name: "Boston Celtics", price: -145 },
                        { name: "Miami Heat", price: 125 },
                      ],
                    },
                    {
                      key: "spreads",
                      outcomes: [
                        { name: "Boston Celtics", point: -4.5, price: -110 },
                        { name: "Miami Heat", point: 4.5, price: -110 },
                      ],
                    },
                    {
                      key: "totals",
                      outcomes: [
                        { name: "Over", point: 219.5, price: -110 },
                        { name: "Under", point: 219.5, price: -110 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          body: {
            id: "nba-evt-2",
            bookmakers: [
              {
                title: "DraftKings",
                markets: [
                  buildMarket("player_points", 21.5),
                  buildMarket("player_rebounds", 7.5),
                  buildMarket("player_assists", 5.5),
                  buildMarket("player_steals", 1.5),
                  buildMarket("player_blocks", 1.5),
                ],
              },
            ],
          },
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const { generateSportsBingoBoard } = await import("@/lib/sportsBingo");

    for (let run = 0; run < 4; run += 1) {
      const board = await generateSportsBingoBoard({
        gameId: "nba-evt-2",
        sportKey: "basketball_nba",
      });

      expect(board.squares.some((square) => square.label.toLowerCase().includes("triple-double"))).toBe(true);
      expect(
        board.squares.some((square) =>
          /points \+ rebounds|points \+ assists|rebounds \+ assists|points \+ rebounds \+ assists/i.test(square.label)
        )
      ).toBe(false);

      const byIndex = new Map<number, string>();
      for (const square of board.squares) {
        byIndex.set(square.index, square.key);
      }

      for (const line of LINE_PATTERNS) {
        const lineKeys = line.map((index) => byIndex.get(index) ?? "");
        expect(lineIsPossible(lineKeys)).toBe(true);
      }
    }
  });
});

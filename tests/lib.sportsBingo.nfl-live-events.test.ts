import { describe, expect, it } from "vitest";

import {
  buildNflLiveStatBroadcastPlan,
  classifyLiveDeltaEvent,
  classifyNflLiveDeltaEvent,
  isRegressedNflLiveStatRow,
  nflLiveStatFallbackPlayerId,
  readNflLiveStatTotals,
  EMPTY_NFL_LIVE_STAT_TOTALS,
  NFL_LIVE_STAT_BROADCAST_MAX_PER_SWEEP,
  NFL_LIVE_STAT_SPORT_KEY,
  NFL_LIVE_STAT_TYPE,
  NFL_LIVE_STAT_YARDS_POP_THRESHOLD,
  type LivePlayerStatRealtimeRow,
  type NflLiveStatLineInput,
  type NflLiveStatTotals,
} from "@/lib/sportsBingoLiveEvents";

/**
 * Phase 3 of docs/prop-bingo-nfl-activation-plan.md — NFL live-event parity.
 *
 * BallDontLie publishes no NFL webhook, so NFL boards had no `live-stats:` broadcast at all: a
 * square flipped once a minute and nothing else on the board ever moved. Phase 3 diffs the
 * `/nfl/v1/stats` snapshot the 1-minute sweep already pulls for grading and publishes the changed
 * players on the existing sport-keyed channel.
 *
 * Two invariants carry the whole design and are asserted here rather than described:
 *
 *  1. **Rows carry absolute totals, never deltas.** The sweep runs from the cron, from every user
 *     card poll and from the NBA/MLB webhook, on any number of warm instances that each hold their
 *     own previous-sweep map, so the same change *will* be broadcast twice. Absolute totals make
 *     the duplicate inert: the client re-derives the delta against its own last-seen row and a
 *     repeat yields zeros.
 *  2. **No previous snapshot → no rows.** A cold instance seeing a game mid-way must seed, not
 *     replay the whole first half as one burst of pops.
 */

const nflTotals = (overrides: Partial<NflLiveStatTotals> = {}): NflLiveStatTotals => ({
  ...EMPTY_NFL_LIVE_STAT_TOTALS,
  ...overrides,
});

const nflRow = (overrides: Partial<NflLiveStatTotals> = {}, rest: Partial<LivePlayerStatRealtimeRow> = {}): LivePlayerStatRealtimeRow => ({
  game_id: "odds-game-1",
  player_id: 4001,
  player_name: "Justin Jefferson",
  game_status: "In Progress",
  pts: 0,
  ast: 0,
  reb: 0,
  stl: 0,
  blk: 0,
  turnovers: 0,
  total_fantasy_points: 0,
  sport_key: NFL_LIVE_STAT_SPORT_KEY,
  stat_type: NFL_LIVE_STAT_TYPE,
  value: 0,
  nfl: nflTotals(overrides),
  ...rest,
});

const line = (playerName: string, overrides: Partial<NflLiveStatTotals> = {}, playerId: number | null = null): NflLiveStatLineInput => ({
  playerId,
  playerName,
  ...nflTotals(overrides),
});

const textsOf = (events: Array<{ text: string }>): string[] => events.map((event) => event.text);

describe("NFL live delta classification", () => {
  it("fires a distinct pop for each scoring family", () => {
    expect(textsOf(classifyNflLiveDeltaEvent(nflRow(), nflRow({ passingTouchdowns: 1 })))).toEqual(["TD PASS!"]);
    expect(textsOf(classifyNflLiveDeltaEvent(nflRow(), nflRow({ rushingTouchdowns: 1 })))).toEqual(["RUSHING TD!"]);
    expect(textsOf(classifyNflLiveDeltaEvent(nflRow(), nflRow({ receivingTouchdowns: 1 })))).toEqual(["TOUCHDOWN CATCH!"]);
    expect(textsOf(classifyNflLiveDeltaEvent(nflRow(), nflRow({ otherTouchdowns: 1 })))).toEqual(["TOUCHDOWN!"]);
    expect(textsOf(classifyNflLiveDeltaEvent(nflRow(), nflRow({ fieldGoalsMade: 1 })))).toEqual(["FIELD GOAL!"]);
  });

  it("fires on turnovers and sacks, from both sides of the ball", () => {
    expect(textsOf(classifyNflLiveDeltaEvent(nflRow(), nflRow({ defensiveInterceptions: 1 })))).toEqual(["INTERCEPTION!"]);
    expect(textsOf(classifyNflLiveDeltaEvent(nflRow(), nflRow({ passingInterceptions: 1 })))).toEqual(["PICKED OFF!"]);
    expect(textsOf(classifyNflLiveDeltaEvent(nflRow(), nflRow({ defensiveSacks: 1 })))).toEqual(["SACK!"]);
  });

  it("fires the 100-yard milestones on the crossing, not on every reading above it", () => {
    expect(
      textsOf(classifyNflLiveDeltaEvent(nflRow({ rushingYards: 88 }), nflRow({ rushingYards: 104 })))
    ).toEqual(["100 RUSH YARDS!"]);
    expect(
      textsOf(classifyNflLiveDeltaEvent(nflRow({ receivingYards: 96 }), nflRow({ receivingYards: 101 })))
    ).toEqual(["100 REC YARDS!"]);
    // Already past the line: the next carry must not re-fire the milestone.
    expect(
      textsOf(classifyNflLiveDeltaEvent(nflRow({ rushingYards: 104 }), nflRow({ rushingYards: 112 })))
    ).toEqual([]);
  });

  it("falls back to a chunk-yardage pop only above the threshold", () => {
    const below = NFL_LIVE_STAT_YARDS_POP_THRESHOLD - 1;
    expect(textsOf(classifyNflLiveDeltaEvent(nflRow(), nflRow({ receivingYards: below })))).toEqual([]);
    expect(
      textsOf(classifyNflLiveDeltaEvent(nflRow(), nflRow({ receivingYards: NFL_LIVE_STAT_YARDS_POP_THRESHOLD })))
    ).toEqual([`+${NFL_LIVE_STAT_YARDS_POP_THRESHOLD} YDS`]);
  });

  it("never lets a marquee event be replaced by the yardage fallback", () => {
    const events = classifyNflLiveDeltaEvent(nflRow(), nflRow({ receivingTouchdowns: 1, receivingYards: 62 }));
    expect(textsOf(events)).toEqual(["TOUCHDOWN CATCH!"]);
  });

  it("caps a catch-up burst at two pops for one row", () => {
    const events = classifyNflLiveDeltaEvent(
      nflRow(),
      nflRow({ rushingTouchdowns: 1, receivingTouchdowns: 1, otherTouchdowns: 1, fieldGoalsMade: 1 })
    );
    expect(events).toHaveLength(2);
  });

  it("is silent on a repeat of an already-seen row — this is what makes duplicate broadcasts safe", () => {
    const row = nflRow({ rushingTouchdowns: 2, rushingYards: 140 });
    expect(classifyNflLiveDeltaEvent(row, row)).toEqual([]);
  });

  it("treats a missing `nfl` block as all zeros rather than throwing", () => {
    const bare = nflRow();
    delete bare.nfl;
    expect(readNflLiveStatTotals(bare)).toEqual(EMPTY_NFL_LIVE_STAT_TOTALS);
    expect(classifyNflLiveDeltaEvent(bare, nflRow({ fieldGoalsMade: 1 }))).toHaveLength(1);
  });
});

describe("classifyLiveDeltaEvent routing", () => {
  it("routes NFL rows to the NFL rules and never through the basketball ones", () => {
    // A rushing touchdown puts 6 in `pts`, which is exactly what would trip `ptsDelta >= 3`.
    const previous = nflRow();
    const next = nflRow({ rushingTouchdowns: 1 }, { pts: 6, total_fantasy_points: 6, value: 6 });
    const events = classifyLiveDeltaEvent(previous, next);
    expect(textsOf(events)).toEqual(["RUSHING TD!"]);
    expect(textsOf(events)).not.toContain("3-POINTER!");
  });

  it("leaves the shipped NBA and MLB behavior untouched", () => {
    const nbaBase: LivePlayerStatRealtimeRow = {
      game_id: "g", player_id: 1, player_name: "A B", game_status: "In Progress",
      pts: 10, ast: 2, reb: 3, stl: 1, blk: 0, turnovers: 0, total_fantasy_points: 18,
      sport_key: "basketball_nba", stat_type: "fantasy_points_total", value: 18,
    };
    expect(textsOf(classifyLiveDeltaEvent(nbaBase, { ...nbaBase, pts: 13, value: 21 }))).toContain("3-POINTER!");
    expect(textsOf(classifyLiveDeltaEvent(nbaBase, { ...nbaBase, blk: 1, value: 20 }))).toContain("BLOCK!");
    expect(textsOf(classifyLiveDeltaEvent(nbaBase, { ...nbaBase, stl: 2, value: 20 }))).toContain("STEAL!");

    const mlbBase: LivePlayerStatRealtimeRow = { ...nbaBase, sport_key: "baseball_mlb", stat_type: "home_run", pts: 0, value: 0 };
    expect(textsOf(classifyLiveDeltaEvent(mlbBase, { ...mlbBase, value: 1 }))).toContain("HOME RUN!");
  });
});

describe("isRegressedNflLiveStatRow", () => {
  it("flags an out-of-order delivery so the client does not rewind its baseline", () => {
    const newer = nflRow({ receivingYards: 88, receptions: 6 });
    const stale = nflRow({ receivingYards: 61, receptions: 4 });
    expect(isRegressedNflLiveStatRow(newer, stale)).toBe(true);
    expect(isRegressedNflLiveStatRow(stale, newer)).toBe(false);
  });

  it("never fires for non-NFL rows, whose provider corrections are legitimate", () => {
    const previous: LivePlayerStatRealtimeRow = {
      game_id: "g", player_id: 1, player_name: "A B", game_status: "In Progress",
      pts: 12, ast: 0, reb: 0, stl: 0, blk: 0, turnovers: 0, total_fantasy_points: 12,
      sport_key: "basketball_nba", stat_type: "fantasy_points_total", value: 12,
    };
    expect(isRegressedNflLiveStatRow(previous, { ...previous, pts: 10, value: 10 })).toBe(false);
  });
});

describe("buildNflLiveStatBroadcastPlan", () => {
  const sweepOneLines = [
    line("Josh Allen", { passingYards: 120, passingTouchdowns: 1 }, 501),
    line("James Cook", { rushingYards: 40 }, 502),
  ];

  it("seeds and publishes nothing on a game it has never seen", () => {
    const plan = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1",
      gameStatus: "In Progress",
      lines: sweepOneLines,
      previousByPlayerKey: null,
    });
    expect(plan.rows).toEqual([]);
    expect(plan.droppedRows).toBe(0);
    expect(plan.nextByPlayerKey.size).toBe(2);
    expect(plan.nextByPlayerKey.get("josh allen")?.passingTouchdowns).toBe(1);
  });

  it("publishes only the players whose totals moved", () => {
    const seed = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1", gameStatus: "In Progress", lines: sweepOneLines, previousByPlayerKey: null,
    });
    const plan = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1",
      gameStatus: "In Progress",
      lines: [
        line("Josh Allen", { passingYards: 120, passingTouchdowns: 1 }, 501),
        line("James Cook", { rushingYards: 61, rushingTouchdowns: 1 }, 502),
      ],
      previousByPlayerKey: seed.nextByPlayerKey,
    });
    expect(plan.rows.map((row) => row.player_name)).toEqual(["James Cook"]);
    expect(plan.rows[0]?.nfl?.rushingTouchdowns).toBe(1);
    expect(plan.rows[0]?.sport_key).toBe(NFL_LIVE_STAT_SPORT_KEY);
    expect(plan.rows[0]?.game_id).toBe("odds-1");
    expect(plan.rows[0]?.game_status).toBe("In Progress");
  });

  it("publishes absolute totals, not deltas — the property that makes a duplicate broadcast inert", () => {
    const seed = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1", gameStatus: "In Progress", lines: sweepOneLines, previousByPlayerKey: null,
    });
    const nextLines = [line("Josh Allen", { passingYards: 205, passingTouchdowns: 2 }, 501), sweepOneLines[1]!];
    const plan = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1", gameStatus: "In Progress", lines: nextLines, previousByPlayerKey: seed.nextByPlayerKey,
    });
    // 205, not the 85-yard delta.
    expect(plan.rows[0]?.nfl?.passingYards).toBe(205);
    expect(plan.rows[0]?.nfl?.passingTouchdowns).toBe(2);

    // Replaying the same row a second time — a second instance broadcasting the same change —
    // classifies to nothing on a client that already saw it.
    const asRow = plan.rows[0]!;
    expect(classifyLiveDeltaEvent(asRow, asRow)).toEqual([]);
  });

  it("does not announce a box score simply adding an empty row for a player", () => {
    const seed = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1", gameStatus: "In Progress", lines: sweepOneLines, previousByPlayerKey: null,
    });
    const plan = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1",
      gameStatus: "In Progress",
      lines: [...sweepOneLines, line("Ray Davis", {}, 503)],
      previousByPlayerKey: seed.nextByPlayerKey,
    });
    expect(plan.rows).toEqual([]);
    expect(plan.nextByPlayerKey.has("ray davis")).toBe(true);
  });

  it("drops yardage before scores when the per-sweep cap bites", () => {
    const previous = new Map<string, NflLiveStatTotals>();
    const lines: NflLiveStatLineInput[] = [];
    for (let index = 0; index < NFL_LIVE_STAT_BROADCAST_MAX_PER_SWEEP + 4; index += 1) {
      const name = `Grinder ${index}`;
      previous.set(name.toLowerCase(), nflTotals());
      lines.push(line(name, { rushingYards: 3 }, 900 + index));
    }
    previous.set("late scorer", nflTotals());
    lines.push(line("Late Scorer", { receivingTouchdowns: 1 }, 999));

    const plan = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1", gameStatus: "In Progress", lines, previousByPlayerKey: previous,
    });
    expect(plan.rows).toHaveLength(NFL_LIVE_STAT_BROADCAST_MAX_PER_SWEEP);
    expect(plan.rows[0]?.player_name).toBe("Late Scorer");
    // 16 yardage-only movers + 1 scorer = 17 changed players, 12 published.
    expect(plan.droppedRows).toBe(5);
  });

  it("gives a player the box score left unidentified a stable positive id", () => {
    const seed = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1", gameStatus: "In Progress", lines: [line("Practice Squad Guy", {})], previousByPlayerKey: null,
    });
    const plan = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1",
      gameStatus: "In Progress",
      lines: [line("Practice Squad Guy", { otherTouchdowns: 1 })],
      previousByPlayerKey: seed.nextByPlayerKey,
    });
    const id = plan.rows[0]?.player_id ?? 0;
    // The client rejects ids that are not finite and positive.
    expect(Number.isFinite(id)).toBe(true);
    expect(id).toBeGreaterThan(0);
    expect(id).toBe(nflLiveStatFallbackPlayerId("practice squad guy"));
  });

  it("merges a player listed on more than one stat row without regressing a counter", () => {
    const plan = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1",
      gameStatus: "In Progress",
      lines: [line("Deebo Samuel", { rushingYards: 30 }, 601), line("Deebo Samuel", { receivingYards: 55 }, 601)],
      previousByPlayerKey: null,
    });
    expect(plan.nextByPlayerKey.get("deebo samuel")).toMatchObject({ rushingYards: 30, receivingYards: 55 });
  });

  it("end to end: a sweep's rows classify into the pop the play deserved", () => {
    const seed = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1",
      gameStatus: "In Progress",
      lines: [line("Puka Nacua", { receptions: 4, receivingYards: 48 }, 700)],
      previousByPlayerKey: null,
    });
    const plan = buildNflLiveStatBroadcastPlan({
      gameId: "odds-1",
      gameStatus: "In Progress",
      lines: [line("Puka Nacua", { receptions: 5, receivingYards: 71, receivingTouchdowns: 1 }, 700)],
      previousByPlayerKey: seed.nextByPlayerKey,
    });
    // The client's first sighting of a player is its baseline and pops nothing (documented
    // starvation rule); the row it holds from the previous sweep is what it diffs against.
    const clientPrevious = nflRow({ receptions: 4, receivingYards: 48 }, { player_id: 700, player_name: "Puka Nacua" });
    expect(textsOf(classifyLiveDeltaEvent(clientPrevious, plan.rows[0]!))).toEqual(["TOUCHDOWN CATCH!"]);
  });
});

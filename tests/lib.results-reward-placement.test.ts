import { describe, expect, it } from "vitest";
import {
  addDays,
  mondayOf,
  placeRewards,
  weeklyCycleLastDay,
  type PlacementCampaign,
  type PlacementLedgerRow,
  type PlacementSettlementRow,
} from "@/lib/results/rewardPlacement";
import type { ResultsGameRow } from "@/lib/results/types";

// docs/partner-results-page-plan.md §5b: every row of the placement table, plus DST weeks and
// late-night games that cross midnight UTC. Cases mirror the production rows checked read-only on
// 2026-10-16 (Phase 2 handoff §5): Garden State Bar's Wed/Thu/Fri weekly places reward and General
// Saloon's single-night and Sat→Mon points rewards.

const NY = "America/New_York";
const LA = "America/Los_Angeles";

const campaign = (overrides: Partial<PlacementCampaign> = {}): PlacementCampaign => ({
  id: "c-1",
  name: "Reward",
  winCondition: "points_threshold",
  rewardDefinitionId: null,
  recurringType: "weekly",
  scheduleType: "recurring",
  activeDays: [],
  endDay: undefined,
  endTime: undefined,
  pointsRequiredToWin: 100,
  placePrizes: null,
  winnerQuota: 1,
  gameWinnerSlots: null,
  ...overrides,
});

const ranked = (overrides: Partial<PlacementCampaign> = {}): PlacementCampaign =>
  campaign({
    id: "ranked",
    name: "Live Trivia Challenge",
    winCondition: "ranked_places",
    rewardDefinitionId: "live_trivia_challenge",
    activeDays: ["wed", "thu", "fri"],
    winnerQuota: 3,
    ...overrides,
  });

const win = (overrides: Partial<PlacementLedgerRow> = {}): PlacementLedgerRow => ({
  challengeId: "c-1",
  cycleStart: "2026-10-07T04:00:00+00:00",
  finalizedAt: "2026-10-10T03:00:00Z",
  place: null,
  username: "murph",
  points: 90,
  ...overrides,
});

const game = (overrides: Partial<ResultsGameRow> = {}): ResultsGameRow => ({
  competitionId: "live_trivia",
  gameKey: "sched-1:2026-10-09",
  date: "2026-10-09",
  startsAt: "2026-10-09T23:00:00.000Z",
  title: "Weekday Trivia",
  playerCount: 4,
  inProgress: false,
  winners: ["murph"],
  topScore: 90,
  ...overrides,
});

const place = (params: {
  ledger?: PlacementLedgerRow[];
  settlements?: PlacementSettlementRow[];
  campaigns: PlacementCampaign[];
  games?: ResultsGameRow[];
  venueTimeZone?: string;
  scheduleZones?: Map<string, string>;
}) =>
  placeRewards({
    ledger: params.ledger ?? [],
    settlements: params.settlements ?? [],
    campaigns: params.campaigns,
    venueTimeZone: params.venueTimeZone ?? NY,
    scheduleZones: params.scheduleZones,
    games: params.games ?? [],
    currentYear: 2026,
  });

describe("date helpers", () => {
  it("moves by whole days and finds the Monday, across DST changes", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-03-08", -1)).toBe("2026-03-07");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // Sunday → the Monday before
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
  });

  it("finds a weekly cycle's last game day", () => {
    expect(weeklyCycleLastDay("2026-10-07", ranked())).toBe("2026-10-09"); // Wed/Thu/Fri → Fri
    // Fri/Sat/Sun wrapping past the week: the Sunday.
    expect(weeklyCycleLastDay("2026-10-09", ranked({ activeDays: ["fri", "sat", "sun"] }))).toBe("2026-10-11");
    // Sat 16:00 → Mon 02:00: Monday's 2 AM close is Sunday night's tail.
    expect(
      weeklyCycleLastDay("2026-09-19", campaign({ scheduleType: "multi_day", activeDays: ["sat"], endDay: "mon", endTime: "02:00:00" })),
    ).toBe("2026-09-20");
    // …but an evening close on the end day counts that day.
    expect(
      weeklyCycleLastDay("2026-09-19", campaign({ scheduleType: "multi_day", activeDays: ["sat"], endDay: "mon", endTime: "22:00" })),
    ).toBe("2026-09-21");
    // No days known: the cycle's seventh day.
    expect(weeklyCycleLastDay("2026-10-07", campaign({ activeDays: [] }))).toBe("2026-10-13");
  });
});

describe("Live Trivia game_winner", () => {
  const gameWinner = campaign({ id: "gw", name: "Win tonight", winCondition: "game_winner", rewardDefinitionId: "live_trivia_challenge", recurringType: "daily" });

  it("sits on the game whose start is the cycle start, for a game crossing midnight UTC", () => {
    // 8:30 PM Eastern on Fri Oct 9 is 00:30 UTC on Oct 10: still the Oct 9 game.
    const lateGame = game({ gameKey: "sched-late:2026-10-09", startsAt: "2026-10-10T00:30:00.000Z" });
    const earlyGame = game({ gameKey: "sched-early:2026-10-09", startsAt: "2026-10-09T17:00:00.000Z" });
    const [item] = place({
      campaigns: [gameWinner],
      ledger: [win({ challengeId: "gw", cycleStart: "2026-10-10T00:30:00+00:00", finalizedAt: "2026-10-10T04:00:00Z" })],
      games: [earlyGame, lateGame],
    });
    expect(item.date).toBe("2026-10-09");
    expect(item.attach).toEqual({ kind: "game", competitionId: "live_trivia", gameKey: "sched-late:2026-10-09" });
    expect(item.cycleLabel).toBe("Fri, Oct 9");
    expect(item.howWon).toBe("Winner of the game");
  });

  it("falls back to the date's only Live Trivia game when the start moved (schedule edited since)", () => {
    const [item] = place({
      campaigns: [gameWinner],
      ledger: [win({ challengeId: "gw", cycleStart: "2026-10-09T22:00:00+00:00" })],
      games: [game({ startsAt: "2026-10-09T23:00:00.000Z" })],
    });
    expect(item.attach).toEqual({ kind: "game", competitionId: "live_trivia", gameKey: "sched-1:2026-10-09" });
  });

  it("is a day row when no game matches and the date has several games (or none)", () => {
    const two = place({
      campaigns: [gameWinner],
      ledger: [win({ challengeId: "gw", cycleStart: "2026-10-09T22:00:00+00:00" })],
      games: [game({ gameKey: "a:2026-10-09" }), game({ gameKey: "b:2026-10-09", startsAt: "2026-10-09T18:00:00.000Z" })],
    });
    expect(two[0].attach).toEqual({ kind: "day", date: "2026-10-09" });
    const none = place({ campaigns: [gameWinner], ledger: [win({ challengeId: "gw", cycleStart: "2026-10-09T22:00:00+00:00" })] });
    expect(none[0]).toEqual(expect.objectContaining({ date: "2026-10-09", attach: { kind: "day", date: "2026-10-09" } }));
  });

  it("dates a pinned reward in its games' own zone, not the venue's", () => {
    // 11:30 PM Pacific on Fri Oct 9 = 02:30 Eastern on Sat Oct 10.
    const pinned = { ...gameWinner, gameWinnerSlots: [{ scheduleId: "sched-west", weekday: "fri" }] };
    const westGame = game({ gameKey: "sched-west:2026-10-09", startsAt: "2026-10-10T06:30:00.000Z" });
    const [item] = place({
      campaigns: [pinned],
      ledger: [win({ challengeId: "gw", cycleStart: "2026-10-10T06:30:00+00:00", finalizedAt: "2026-10-10T09:00:00Z" })],
      games: [westGame],
      scheduleZones: new Map([["sched-west", LA]]),
    });
    expect(item.date).toBe("2026-10-09");
    expect(item.attach).toEqual({ kind: "game", competitionId: "live_trivia", gameKey: "sched-west:2026-10-09" });
  });

  it("never sits on another competition's game", () => {
    const [item] = place({
      campaigns: [gameWinner],
      ledger: [win({ challengeId: "gw", cycleStart: "2026-10-09T23:00:00+00:00" })],
      games: [game({ competitionId: "test_cup", gameKey: "cup:2026-10-09" })],
    });
    expect(item.attach).toEqual({ kind: "day", date: "2026-10-09" });
  });
});

describe("points_threshold, daily cadence", () => {
  const daily = campaign({ id: "daily", name: "Daily 500", recurringType: "daily", pointsRequiredToWin: 500 });

  it("sits on the day's game when the day has exactly one", () => {
    const [item] = place({
      campaigns: [daily],
      ledger: [win({ challengeId: "daily", cycleStart: "2026-10-09T04:00:00+00:00", finalizedAt: "2026-10-10T01:00:00Z" })],
      games: [game()],
    });
    expect(item.date).toBe("2026-10-09");
    expect(item.attach).toEqual({ kind: "game", competitionId: "live_trivia", gameKey: "sched-1:2026-10-09" });
    expect(item.cycleLabel).toBe("Fri, Oct 9");
    expect(item.howWon).toBe("Reach 500 points");
  });

  it("is a day row when the day has two games or none", () => {
    const ledger = [win({ challengeId: "daily", cycleStart: "2026-10-09T04:00:00+00:00" })];
    expect(place({ campaigns: [daily], ledger, games: [game({ gameKey: "a" }), game({ gameKey: "b" })] })[0].attach).toEqual({
      kind: "day",
      date: "2026-10-09",
    });
    expect(place({ campaigns: [daily], ledger })[0].attach).toEqual({ kind: "day", date: "2026-10-09" });
  });
});

describe("ranked_places and weekly cadence", () => {
  it("dates a Wed/Thu/Fri week on its Friday, places in order (Garden State Bar, week of Oct 7)", () => {
    const [item] = place({
      campaigns: [ranked()],
      ledger: [
        win({ challengeId: "ranked", place: 2, username: "kellygurl", points: 10, finalizedAt: "2026-10-14T23:09:05Z" }),
        win({ challengeId: "ranked", place: 1, username: "murph", points: 90, finalizedAt: "2026-10-14T23:09:05Z" }),
      ],
      settlements: [
        { challengeId: "ranked", cycleStart: "2026-10-07T04:00:00+00:00", outcome: "awarded", participantCount: 2, minPlayers: null, settledAt: "2026-10-14T23:09:06Z" },
      ],
    });
    expect(item.date).toBe("2026-10-09");
    expect(item.attach).toEqual({ kind: "week", weekStart: "2026-10-05" });
    expect(item.cycleLabel).toBe("Week of Wed, Oct 7");
    expect(item.howWon).toBe("Top 3 players each week");
    expect(item.winners).toEqual([
      { place: 1, username: "murph", points: 90 },
      { place: 2, username: "kellygurl", points: 10 },
    ]);
    expect(item.note).toBeNull();
  });

  it("shows a week that paid nobody, with why (a settlement and no ledger rows)", () => {
    const [item] = place({
      campaigns: [ranked()],
      settlements: [
        { challengeId: "ranked", cycleStart: "2026-09-30T04:00:00+00:00", outcome: "below_minimum", participantCount: 2, minPlayers: 4, settledAt: "2026-10-03T03:00:00Z" },
      ],
    });
    expect(item).toEqual(
      expect.objectContaining({ date: "2026-10-02", attach: { kind: "week", weekStart: "2026-09-28" }, winners: [], note: "Only 2 players — the minimum was 4." }),
    );
  });

  it("keeps a backfilled week on its own week, not the day it was backfilled", () => {
    const [item] = place({
      campaigns: [ranked()],
      ledger: [win({ challengeId: "ranked", cycleStart: "2026-08-05T04:00:00+00:00", place: 1, finalizedAt: "2026-10-14T23:09:05Z" })],
    });
    expect(item.date).toBe("2026-08-07");
    expect(item.attach).toEqual({ kind: "week", weekStart: "2026-08-03" });
  });

  it("is never dated after it happened: a weekly points reward reached on Saturday is Saturday's", () => {
    const fourDay = campaign({ activeDays: ["sat", "sun", "mon", "tue"] });
    const [item] = place({
      campaigns: [fourDay],
      ledger: [win({ cycleStart: "2026-10-10T20:00:00+00:00", finalizedAt: "2026-10-11T01:00:00Z" })],
    });
    expect(item.date).toBe("2026-10-10");
    expect(item.attach).toEqual({ kind: "week", weekStart: "2026-10-05" });
  });

  it("dates a Sat→Mon 2 AM challenge on its Sunday, even when finalized at the Monday close (General Saloon)", () => {
    const threeDay = campaign({ id: "3d", scheduleType: "multi_day", activeDays: ["sat"], endDay: "mon", endTime: "02:00:00" });
    const [item] = place({
      campaigns: [threeDay],
      ledger: [win({ challengeId: "3d", cycleStart: "2026-09-19T20:00:00+00:00", finalizedAt: "2026-09-21T06:00:00Z" })],
    });
    expect(item.date).toBe("2026-09-20");
    expect(item.attach).toEqual({ kind: "week", weekStart: "2026-09-14" });
  });

  it("keeps DST weeks on the right days (US DST ends Sun Nov 1, 2026; starts Sun Mar 8, 2026)", () => {
    const rows = [
      // Wed Oct 28 00:00 EDT and Wed Nov 4 00:00 EST.
      win({ challengeId: "ranked", cycleStart: "2026-10-28T04:00:00+00:00", place: 1, finalizedAt: "2026-11-01T05:00:00Z" }),
      win({ challengeId: "ranked", cycleStart: "2026-11-04T05:00:00+00:00", place: 1, finalizedAt: "2026-11-08T05:00:00Z" }),
      // Wed Mar 4 00:00 EST and Wed Mar 11 00:00 EDT.
      win({ challengeId: "ranked", cycleStart: "2026-03-04T05:00:00+00:00", place: 1, finalizedAt: "2026-03-08T05:00:00Z" }),
      win({ challengeId: "ranked", cycleStart: "2026-03-11T04:00:00+00:00", place: 1, finalizedAt: "2026-03-15T04:00:00Z" }),
    ];
    const items = place({ campaigns: [ranked()], ledger: rows });
    expect(items.map((item) => [item.date, item.attach])).toEqual([
      ["2026-11-06", { kind: "week", weekStart: "2026-11-02" }],
      ["2026-10-30", { kind: "week", weekStart: "2026-10-26" }],
      ["2026-03-13", { kind: "week", weekStart: "2026-03-09" }],
      ["2026-03-06", { kind: "week", weekStart: "2026-03-02" }],
    ]);
  });
});

describe("NFL Pick 'Em, monthly, yearly and one-off rewards", () => {
  it("puts an NFL reward in the week it was finalized", () => {
    const nfl = campaign({ id: "nfl", winCondition: "game_winner", rewardDefinitionId: "nfl_pickem_challenge", activeDays: ["thu", "fri", "sat", "sun", "mon", "tue", "wed"] });
    const [item] = place({
      campaigns: [nfl],
      // Week cycle from Thu Oct 8; finalized Tuesday Oct 13 morning.
      ledger: [win({ challengeId: "nfl", cycleStart: "2026-10-08T04:00:00+00:00", finalizedAt: "2026-10-13T14:00:00Z" })],
      games: [game({ date: "2026-10-08", gameKey: "sched-1:2026-10-08", startsAt: "2026-10-08T04:00:00.000Z" })],
    });
    expect(item.date).toBe("2026-10-13");
    expect(item.attach).toEqual({ kind: "week", weekStart: "2026-10-12" });
    expect(item.howWon).toBe("Most picks right");
  });

  it("puts a monthly, yearly or one-off reward on the day it was finalized", () => {
    const monthly = campaign({ id: "m", recurringType: "monthly" });
    const yearly = campaign({ id: "y", recurringType: "yearly" });
    const once = campaign({ id: "o", recurringType: "none" });
    const items = place({
      campaigns: [monthly, yearly, once],
      ledger: [
        win({ challengeId: "m", cycleStart: "2026-10-01T04:00:00+00:00", finalizedAt: "2026-10-12T02:00:00Z" }),
        win({ challengeId: "y", cycleStart: "2026-01-01T05:00:00+00:00", finalizedAt: "2026-09-03T18:00:00Z" }),
        win({ challengeId: "o", cycleStart: "1970-01-01T00:00:00+00:00", finalizedAt: "2026-08-01T15:00:00Z" }),
      ],
    });
    expect(items.map((item) => [item.rewardId, item.date, item.attach, item.cycleLabel])).toEqual([
      ["m", "2026-10-11", { kind: "day", date: "2026-10-11" }, "October 2026"],
      ["y", "2026-09-03", { kind: "day", date: "2026-09-03" }, "2026"],
      ["o", "2026-08-01", { kind: "day", date: "2026-08-01" }, "Won Sat, Aug 1"],
    ]);
  });
});

describe("rows and privacy", () => {
  it("groups a cycle's winners into one item and skips a reward deleted between reads", () => {
    const multi = campaign({ id: "multi", recurringType: "daily", winnerQuota: 2 });
    const items = place({
      campaigns: [multi],
      ledger: [
        win({ challengeId: "multi", cycleStart: "2026-10-09T04:00:00+00:00", username: "a", points: 120 }),
        win({ challengeId: "multi", cycleStart: "2026-10-09T04:00:00+00:00", username: null, points: 150 }),
        win({ challengeId: "gone", cycleStart: "2026-10-09T04:00:00+00:00" }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].winners).toEqual([
      { place: null, username: null, points: 150 },
      { place: null, username: "a", points: 120 },
    ]);
  });

  it("orders items newest date first", () => {
    const daily = campaign({ id: "d", recurringType: "daily" });
    const items = place({
      campaigns: [daily],
      ledger: [
        win({ challengeId: "d", cycleStart: "2026-10-01T04:00:00+00:00", finalizedAt: "2026-10-01T20:00:00Z" }),
        win({ challengeId: "d", cycleStart: "2026-10-09T04:00:00+00:00", finalizedAt: "2026-10-09T20:00:00Z" }),
      ],
    });
    expect(items.map((item) => item.date)).toEqual(["2026-10-09", "2026-10-01"]);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NFLPickEmGame, NFLWeek } from "@/lib/nflPickEm";
import {
  getTiebreakerGuess,
  getWeekTiebreakerGame,
  listTiebreakerGuesses,
  rankByTiebreakerProximity,
  settleWeekTiebreaker,
  submitTiebreakerGuess,
} from "@/lib/nflPickEmTiebreaker";

type MockRow = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, MockRow[]>,
  nextId: { value: 1 },
}));

// Minimal PostgREST-shaped query builder: enough of the chain this module uses
// (select/eq/in/order/upsert/update/returns/single/maybeSingle, plus a bare
// await on an update).
vi.mock("@/lib/supabaseAdmin", () => {
  const tableRows = (table: string): MockRow[] => {
    if (!db.tables[table]) db.tables[table] = [];
    return db.tables[table];
  };

  const createBuilder = (table: string) => {
    const filters: Array<(row: MockRow) => boolean> = [];
    let updateValues: MockRow | null = null;
    let override: MockRow[] | null = null;

    const apply = (): MockRow[] => {
      if (override) return override;
      const matched = tableRows(table).filter((row) => filters.every((predicate) => predicate(row)));
      if (updateValues) {
        for (const row of matched) Object.assign(row, updateValues);
      }
      return matched;
    };

    const settle = () => Promise.resolve({ data: apply(), error: null });

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      order: () => builder,
      update: (values: MockRow) => {
        updateValues = values;
        return builder;
      },
      upsert: (values: MockRow, options?: { onConflict?: string }) => {
        const keys = String(options?.onConflict ?? "")
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean);
        const rows = tableRows(table);
        const existing =
          keys.length > 0 ? rows.find((row) => keys.every((key) => row[key] === values[key])) : undefined;

        if (existing) {
          Object.assign(existing, values);
          override = [existing];
        } else {
          const now = new Date().toISOString();
          const inserted: MockRow = {
            id: `row-${db.nextId.value++}`,
            actual_total: null,
            created_at: now,
            updated_at: now,
            ...values,
          };
          rows.push(inserted);
          override = [inserted];
        }
        return builder;
      },
      returns: settle,
      single: () => {
        const rows = apply();
        return Promise.resolve(
          rows.length > 0 ? { data: rows[0], error: null } : { data: null, error: { message: "not found" } }
        );
      },
      maybeSingle: () => Promise.resolve({ data: apply()[0] ?? null, error: null }),
      then: (
        onFulfilled: (value: { data: MockRow[]; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => settle().then(onFulfilled, onRejected),
    };

    return builder;
  };

  return {
    supabaseAdmin: {
      from: (table: string) => createBuilder(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

const nflPickEm = vi.hoisted(() => ({
  games: [] as NFLPickEmGame[],
  week: null as NFLWeek | null,
}));

vi.mock("@/lib/nflPickEm", () => ({
  listNFLPickEmGames: vi.fn(async ({ weekId }: { weekId: string }) => {
    if (!nflPickEm.week || nflPickEm.week.id !== weekId) {
      throw new Error("NFL Week not found");
    }
    return { week: nflPickEm.week, games: nflPickEm.games };
  }),
}));

const WEEK: NFLWeek = {
  id: "week-1",
  season: 2024,
  weekNumber: 1,
  weekType: "regular",
  displayLabel: "Week 1",
  weekStartDate: "2024-09-05",
  weekEndDate: "2024-09-09",
  thursdayKickoff: "2024-09-05T20:20:00.000Z",
  status: "open",
  gamesCount: 3,
  syncedAt: null,
};

const makeGame = (params: {
  id: string;
  startsAt: string;
  home?: string;
  away?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  status?: NFLPickEmGame["status"];
}): NFLPickEmGame => ({
  id: params.id,
  sportSlug: "nfl",
  sportKey: "americanfootball_nfl",
  league: "NFL",
  homeTeamId: "1",
  awayTeamId: "2",
  homeTeam: params.home ?? "Buffalo Bills",
  awayTeam: params.away ?? "Miami Dolphins",
  startsAt: params.startsAt,
  isLocked: false,
  status: params.status ?? "scheduled",
  homeScore: params.homeScore ?? null,
  awayScore: params.awayScore ?? null,
  winnerTeam: null,
  periodLabel: null,
  nflWeekId: WEEK.id,
  weekNumber: WEEK.weekNumber,
  isThursdayGame: false,
  isSundayGame: false,
  isMondayGame: true,
  dayGroupKey: params.startsAt.slice(0, 10),
  dayGroupLabel: "Monday Night Football",
  isThursdayNightSection: false,
});

const THURSDAY_GAME = makeGame({
  id: "gm-thu",
  startsAt: "2024-09-05T20:20:00.000Z",
  home: "Kansas City Chiefs",
  away: "Baltimore Ravens",
});
const SUNDAY_GAME = makeGame({
  id: "gm-sun",
  startsAt: "2024-09-08T17:00:00.000Z",
  home: "San Francisco 49ers",
  away: "Dallas Cowboys",
});
const MONDAY_GAME = makeGame({
  id: "gm-mon",
  startsAt: "2024-09-09T20:15:00.000Z",
  home: "Buffalo Bills",
  away: "Miami Dolphins",
});

const BEFORE_LAST_KICKOFF = new Date("2024-09-09T18:00:00.000Z");
const AFTER_LAST_KICKOFF = new Date("2024-09-09T23:00:00.000Z");

const setNow = (now: Date): void => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
};

beforeEach(() => {
  db.tables = { nfl_pickem_tiebreakers: [] };
  db.nextId.value = 1;
  nflPickEm.week = WEEK;
  nflPickEm.games = [THURSDAY_GAME, SUNDAY_GAME, MONDAY_GAME];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getWeekTiebreakerGame", () => {
  it("picks the game with the latest kickoff", async () => {
    setNow(BEFORE_LAST_KICKOFF);

    const game = await getWeekTiebreakerGame("week-1");

    expect(game?.gameId).toBe("gm-mon");
    expect(game?.gameLabel).toBe("Miami Dolphins vs Buffalo Bills");
    expect(game?.weekNumber).toBe(1);
    expect(game?.isLocked).toBe(false);
    expect(game?.isFinal).toBe(false);
  });

  it("breaks kickoff ties by game_id ascending, whatever the input order", async () => {
    setNow(BEFORE_LAST_KICKOFF);

    const tieB = makeGame({ id: "gm-b", startsAt: "2024-09-09T20:15:00.000Z" });
    const tieA = makeGame({ id: "gm-a", startsAt: "2024-09-09T20:15:00.000Z" });

    nflPickEm.games = [tieB, tieA, SUNDAY_GAME];
    expect((await getWeekTiebreakerGame("week-1"))?.gameId).toBe("gm-a");

    nflPickEm.games = [tieA, tieB, SUNDAY_GAME];
    expect((await getWeekTiebreakerGame("week-1"))?.gameId).toBe("gm-a");
  });

  it("reports locked and final state from the game", async () => {
    setNow(AFTER_LAST_KICKOFF);
    nflPickEm.games = [
      SUNDAY_GAME,
      makeGame({
        id: "gm-mon",
        startsAt: "2024-09-09T20:15:00.000Z",
        homeScore: 27,
        awayScore: 20,
        status: "final",
      }),
    ];

    const game = await getWeekTiebreakerGame("week-1");

    expect(game?.isLocked).toBe(true);
    expect(game?.isFinal).toBe(true);
    expect(game?.homeScore).toBe(27);
    expect(game?.awayScore).toBe(20);
  });

  it("returns null when the week has no games", async () => {
    setNow(BEFORE_LAST_KICKOFF);
    nflPickEm.games = [];

    expect(await getWeekTiebreakerGame("week-1")).toBeNull();
    expect(await getWeekTiebreakerGame("")).toBeNull();
  });
});

describe("submitTiebreakerGuess", () => {
  const submit = (userId: string, predictedTotal: number) =>
    submitTiebreakerGuess({ userId, venueId: "venue-1", weekId: "week-1", predictedTotal });

  it("stores a guess before the tiebreaker game kicks off", async () => {
    setNow(BEFORE_LAST_KICKOFF);

    const guess = await submit("alice-id", 44);

    expect(guess).toMatchObject({
      userId: "alice-id",
      venueId: "venue-1",
      weekId: "week-1",
      gameId: "gm-mon",
      predictedTotal: 44,
      actualTotal: null,
    });
    expect(db.tables.nfl_pickem_tiebreakers).toHaveLength(1);
  });

  it("upserts on the unique key instead of creating a second row", async () => {
    setNow(BEFORE_LAST_KICKOFF);

    await submit("alice-id", 44);
    const updated = await submit("alice-id", 51);

    expect(db.tables.nfl_pickem_tiebreakers).toHaveLength(1);
    expect(updated.predictedTotal).toBe(51);

    // A different venue is an independent contest, so it gets its own row.
    await submitTiebreakerGuess({
      userId: "alice-id",
      venueId: "venue-2",
      weekId: "week-1",
      predictedTotal: 38,
    });
    expect(db.tables.nfl_pickem_tiebreakers).toHaveLength(2);
  });

  it("rejects a guess once the tiebreaker game has kicked off", async () => {
    setNow(AFTER_LAST_KICKOFF);

    await expect(submit("alice-id", 44)).rejects.toThrow(/already started/i);
    expect(db.tables.nfl_pickem_tiebreakers).toHaveLength(0);
  });

  it("range-checks the guess in code, not just in the constraint", async () => {
    setNow(BEFORE_LAST_KICKOFF);

    await expect(submit("alice-id", -1)).rejects.toThrow(/between 0 and 200/);
    await expect(submit("alice-id", 201)).rejects.toThrow(/between 0 and 200/);
    await expect(submit("alice-id", 44.5)).rejects.toThrow(/whole number/);
    expect(db.tables.nfl_pickem_tiebreakers).toHaveLength(0);
  });

  it("rejects when the week has no tiebreaker game", async () => {
    setNow(BEFORE_LAST_KICKOFF);
    nflPickEm.games = [];

    await expect(submit("alice-id", 44)).rejects.toThrow(/no tiebreaker game/i);
  });
});

describe("getTiebreakerGuess", () => {
  it("reads back the user's own guess, scoped to the venue", async () => {
    setNow(BEFORE_LAST_KICKOFF);
    await submitTiebreakerGuess({ userId: "alice-id", venueId: "venue-1", weekId: "week-1", predictedTotal: 44 });

    const own = await getTiebreakerGuess({ userId: "alice-id", venueId: "venue-1", weekId: "week-1" });
    expect(own?.predictedTotal).toBe(44);

    const otherVenue = await getTiebreakerGuess({ userId: "alice-id", venueId: "venue-2", weekId: "week-1" });
    expect(otherVenue).toBeNull();
  });
});

describe("listTiebreakerGuesses privacy", () => {
  const seedGuesses = async () => {
    setNow(BEFORE_LAST_KICKOFF);
    await submitTiebreakerGuess({ userId: "alice-id", venueId: "venue-1", weekId: "week-1", predictedTotal: 44 });
    await submitTiebreakerGuess({ userId: "bob-id", venueId: "venue-1", weekId: "week-1", predictedTotal: 51 });
    await submitTiebreakerGuess({ userId: "carol-id", venueId: "venue-2", weekId: "week-1", predictedTotal: 60 });
  };

  it("omits another user's predictedTotal key entirely before kickoff", async () => {
    await seedGuesses();

    const entries = await listTiebreakerGuesses({
      venueId: "venue-1",
      weekId: "week-1",
      revealFor: { userId: "alice-id" },
    });

    const alice = entries.find((entry) => entry.userId === "alice-id");
    const bob = entries.find((entry) => entry.userId === "bob-id");

    expect(alice?.isHidden).toBe(false);
    expect(alice?.predictedTotal).toBe(44);

    expect(bob?.isHidden).toBe(true);
    expect("predictedTotal" in (bob ?? {})).toBe(false);
    expect(JSON.stringify(bob)).not.toContain("predictedTotal");
  });

  it("reveals every guess once the tiebreaker game has kicked off", async () => {
    await seedGuesses();
    setNow(AFTER_LAST_KICKOFF);

    const entries = await listTiebreakerGuesses({
      venueId: "venue-1",
      weekId: "week-1",
      revealFor: { userId: "alice-id" },
    });

    expect(entries.map((entry) => entry.predictedTotal)).toEqual([44, 51]);
    expect(entries.every((entry) => entry.isHidden === false)).toBe(true);
  });

  it("reveals everything for server-internal callers and stays venue-scoped", async () => {
    await seedGuesses();

    const venueOne = await listTiebreakerGuesses({ venueId: "venue-1", weekId: "week-1", revealFor: "all" });
    expect(venueOne.map((entry) => entry.userId)).toEqual(["alice-id", "bob-id"]);
    expect(venueOne.every((entry) => typeof entry.predictedTotal === "number")).toBe(true);

    const venueTwo = await listTiebreakerGuesses({ venueId: "venue-2", weekId: "week-1", revealFor: "all" });
    expect(venueTwo.map((entry) => entry.userId)).toEqual(["carol-id"]);
  });
});

describe("settleWeekTiebreaker", () => {
  const finalGame = makeGame({
    id: "gm-mon",
    startsAt: "2024-09-09T20:15:00.000Z",
    homeScore: 27,
    awayScore: 20,
    status: "final",
  });

  const seedAndFinal = async () => {
    setNow(BEFORE_LAST_KICKOFF);
    await submitTiebreakerGuess({ userId: "alice-id", venueId: "venue-1", weekId: "week-1", predictedTotal: 44 });
    await submitTiebreakerGuess({ userId: "bob-id", venueId: "venue-2", weekId: "week-1", predictedTotal: 51 });
    setNow(AFTER_LAST_KICKOFF);
    nflPickEm.games = [SUNDAY_GAME, finalGame];
  };

  it("writes the final total onto every guess for the week, across venues", async () => {
    await seedAndFinal();

    const result = await settleWeekTiebreaker("week-1");

    expect(result).toMatchObject({ settled: true, gameId: "gm-mon", actualTotal: 47, updatedCount: 2 });
    expect(db.tables.nfl_pickem_tiebreakers.map((row) => row.actual_total)).toEqual([47, 47]);
  });

  it("is idempotent — a re-sweep changes nothing", async () => {
    await seedAndFinal();

    await settleWeekTiebreaker("week-1");
    const second = await settleWeekTiebreaker("week-1");

    expect(second).toMatchObject({ settled: true, actualTotal: 47, updatedCount: 0 });
    expect(db.tables.nfl_pickem_tiebreakers.map((row) => row.actual_total)).toEqual([47, 47]);
  });

  it("does not settle before the game is final", async () => {
    setNow(BEFORE_LAST_KICKOFF);
    await submitTiebreakerGuess({ userId: "alice-id", venueId: "venue-1", weekId: "week-1", predictedTotal: 44 });

    const result = await settleWeekTiebreaker("week-1");

    expect(result).toMatchObject({ settled: false, gameId: "gm-mon", actualTotal: null, updatedCount: 0 });
    expect(db.tables.nfl_pickem_tiebreakers[0].actual_total).toBeNull();
  });

  it("leaves guesses made against a different game alone", async () => {
    await seedAndFinal();
    db.tables.nfl_pickem_tiebreakers[1].game_id = "gm-moved";

    const result = await settleWeekTiebreaker("week-1");

    expect(result.updatedCount).toBe(1);
    expect(db.tables.nfl_pickem_tiebreakers[1].actual_total).toBeNull();
  });

  it("reports unsettled when the week has no games", async () => {
    setNow(AFTER_LAST_KICKOFF);
    nflPickEm.games = [];

    expect(await settleWeekTiebreaker("week-1")).toMatchObject({ settled: false, gameId: null, updatedCount: 0 });
  });
});

describe("rankByTiebreakerProximity", () => {
  it("rule 1 — the closer guess ranks better", () => {
    const order = rankByTiebreakerProximity(
      ["alice-id", "bob-id", "carol-id"],
      [
        { userId: "alice-id", predictedTotal: 60 },
        { userId: "bob-id", predictedTotal: 48 },
        { userId: "carol-id", predictedTotal: 30 },
      ],
      47
    );

    expect(order).toEqual(["bob-id", "alice-id", "carol-id"]);
  });

  it("rule 2 — on equal distance, the lower guess ranks better", () => {
    const order = rankByTiebreakerProximity(
      ["over-user", "under-user"],
      [
        { userId: "over-user", predictedTotal: 52 },
        { userId: "under-user", predictedTotal: 42 },
      ],
      47
    );

    expect(order).toEqual(["under-user", "over-user"]);
  });

  it("rule 3 — a user with no guess ranks below every user who guessed", () => {
    const order = rankByTiebreakerProximity(
      ["aaa-no-guess", "zzz-guessed"],
      [
        { userId: "zzz-guessed", predictedTotal: 120 },
        { userId: "aaa-no-guess", predictedTotal: null },
      ],
      47
    );

    // Alphabetically first, but a missing guess still loses to a wild one.
    expect(order).toEqual(["zzz-guessed", "aaa-no-guess"]);
  });

  it("rule 4 — identical guesses (and no guesses at all) fall back to userId ascending", () => {
    const identical = rankByTiebreakerProximity(
      ["zoe-id", "alice-id"],
      [
        { userId: "zoe-id", predictedTotal: 47 },
        { userId: "alice-id", predictedTotal: 47 },
      ],
      47
    );
    expect(identical).toEqual(["alice-id", "zoe-id"]);

    const noneGuessed = rankByTiebreakerProximity(["zoe-id", "alice-id"], [], 47);
    expect(noneGuessed).toEqual(["alice-id", "zoe-id"]);
  });

  it("rule 5 — an unsettled total orders by userId ascending and awards nothing on its own", () => {
    const order = rankByTiebreakerProximity(
      ["zoe-id", "alice-id"],
      [
        { userId: "zoe-id", predictedTotal: 47 },
        { userId: "alice-id", predictedTotal: 120 },
      ],
      null
    );

    expect(order).toEqual(["alice-id", "zoe-id"]);
  });

  it("is stable across re-runs and ignores guesses from users not in the tie", () => {
    const args = [
      ["bob-id", "alice-id"],
      [
        { userId: "alice-id", predictedTotal: 50 },
        { userId: "bob-id", predictedTotal: 50 },
        { userId: "carol-id", predictedTotal: 47 },
      ],
      47,
    ] as const;

    const first = rankByTiebreakerProximity(...args);
    const second = rankByTiebreakerProximity(...args);

    expect(first).toEqual(["alice-id", "bob-id"]);
    expect(second).toEqual(first);
  });
});

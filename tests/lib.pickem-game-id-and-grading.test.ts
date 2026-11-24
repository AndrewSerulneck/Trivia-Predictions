import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import saturday from "@/tests/fixtures/pickem-ncaaf/games-2026-10-24.json";

// Pick 'Em CR1.2 (docs/bingo-pickem-reliability-plan.md, findings F24–F28 in docs/fire-tv-app-plan.md):
// a game id embeds the feed's start time, so a moved game gets a new id. The player's pick must still
// show on it, a second pick on the same real game must not be saved or paid, grading waits for the real
// start, a postponed game is canceled (not a 0–0 push), win notifications use the venue's date, and a
// team-name match needs the same game time. Started from the CR1 reproduction test
// (docs/fire-tv-app-plan_CR1_evidence/pickem-game-id-and-grading-repro.test.ts.txt), which asserted the bugs.

vi.mock("server-only", () => ({}));

type MockRow = Record<string, unknown>;

const store = vi.hoisted(() => ({
  tables: {} as Record<string, MockRow[]>,
  fetchBallDontLieList: vi.fn(),
  pickReads: 0,
  cursorReads: 0,
  updateError: null as { message: string } | null,
  updateMatchesNothing: false,
}));

vi.mock("@/lib/balldontlie", () => ({
  fetchBallDontLieList: store.fetchBallDontLieList,
}));

vi.mock("@/lib/pickemPrizeLimit", () => ({ checkPickEmPrizePickLimit: vi.fn(() => Promise.resolve({ ok: true })) }));

vi.mock("@/lib/pickemPoints", () => ({
  PICKEM_POINTS_PER_CORRECT_PICK: 10,
  payPickEmPoints: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/venueGameSettings", () => ({
  DEFAULT_CFB_PICKEM_SCORING_MODE: "spread",
  getVenueGameSettings: vi.fn((venueId: string) =>
    Promise.resolve({ venueId, nflPickEmScoringMode: "standard", cfbPickEmScoringMode: "spread", pickWindows: {}, createdAt: null, updatedAt: null })
  ),
  getVenueNFLPickEmScoringMode: vi.fn(() => Promise.resolve("standard")),
  getVenueCollegeFootballPickEmScoringMode: vi.fn(() => Promise.resolve("spread")),
}));

vi.mock("@/lib/challengeCampaigns", () => ({
  applyChallengeCampaignPoints: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const createBuilder = (table: string) => {
    const filters: Array<(row: MockRow) => boolean> = [];
    let patch: MockRow | null = null;
    let insertRows: MockRow[] | null = null;
    const orderBy: Array<{ column: string; ascending: boolean }> = [];
    let limitTo: number | null = null;

    // Timestamps compare as instants, anything else (ids) as text.
    const compare = (a: unknown, b: unknown) => {
      const iso = /^\d{4}-\d{2}-\d{2}T/;
      if (iso.test(String(a)) && iso.test(String(b))) return Date.parse(String(a)) - Date.parse(String(b));
      return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    };
    const currentRows = () => store.tables[table] ?? [];
    const filteredRows = () => {
      const rows = currentRows().filter((row) => filters.every((filter) => filter(row)));
      rows.sort((a, b) => {
        for (const { column, ascending } of orderBy) {
          const cmp = compare(a[column], b[column]);
          if (cmp !== 0) return ascending ? cmp : -cmp;
        }
        return 0;
      });
      return limitTo === null ? rows : rows.slice(0, limitTo);
    };
    const resolve = () => {
      if (insertRows) {
        const rows = insertRows.map((row, index) => ({
          id: `inserted-${currentRows().length + index}`,
          created_at: new Date().toISOString(),
          ...row,
        }));
        store.tables[table] = [...currentRows(), ...rows];
        return Promise.resolve({ data: rows, error: null });
      }
      if (patch) {
        if (store.updateError) return Promise.resolve({ data: null, error: store.updateError });
        // A concurrent run graded the pick first: the conditional update changes no row.
        if (store.updateMatchesNothing) return Promise.resolve({ data: [], error: null });
        const rows = filteredRows();
        for (const row of rows) Object.assign(row, patch);
        return Promise.resolve({ data: rows.map((row) => ({ ...row })), error: null });
      }
      if (table === "pickem_picks") store.pickReads += 1;
      return Promise.resolve({ data: filteredRows(), error: null });
    };

    // Timestamps compare as instants (PostgREST compares timestamptz, not strings).
    const at = (value: unknown) => Date.parse(String(value ?? ""));
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      lte: (column: string, value: unknown) => {
        filters.push((row) => at(row[column]) <= at(value));
        return builder;
      },
      lt: (column: string, value: unknown) => {
        filters.push((row) => at(row[column]) < at(value));
        return builder;
      },
      gte: (column: string, value: unknown) => {
        filters.push((row) => at(row[column]) >= at(value));
        return builder;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        orderBy.push({ column, ascending: options?.ascending !== false });
        return builder;
      },
      // Only the settlement's keyset cursor: (starts_at, id) > (S, I).
      or: (expression: string) => {
        const match = /^starts_at\.gt\."([^"]+)",and\(starts_at\.eq\."([^"]+)",id\.gt\."([^"]+)"\)$/.exec(expression);
        if (!match || match[1] !== match[2]) throw new Error(`unexpected or(): ${expression}`);
        const [, startsAt, , id] = match;
        filters.push((row) => {
          const cmp = compare(row.starts_at, startsAt);
          return cmp > 0 || (cmp === 0 && compare(row.id, id) > 0);
        });
        store.cursorReads += 1;
        return builder;
      },
      limit: (count: number) => {
        limitTo = count;
        return builder;
      },
      returns: () => builder,
      maybeSingle: () => resolve().then(({ data, error }) => ({ data: data?.[0] ?? null, error })),
      single: () => resolve().then(({ data, error }) => ({ data: data?.[0] ?? null, error })),
      update: (value: MockRow) => {
        patch = value;
        return builder;
      },
      insert: (value: MockRow | MockRow[]) => {
        insertRows = Array.isArray(value) ? value : [value];
        return builder;
      },
      then: (
        onfulfilled?: ((value: { data: MockRow[] | null; error: { message: string } | null }) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null
      ) => resolve().then(onfulfilled, onrejected),
    };
    return builder;
  };

  return {
    supabaseAdmin: {
      from: (table: string) => createBuilder(table),
      rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    },
  };
});

import { clearVenueTimezoneCache } from "@/lib/timezone";
import { listPickEmGames, settlePendingPickEmPicks, submitPickEmPick } from "@/lib/pickem";

type Game = (typeof saturday)[number];
const bostonCollege = (saturday as Game[]).find((game) => game.id === 457383)!; // final: BC 49 at GT 27

const collegePick = (overrides: MockRow = {}): MockRow => ({
  id: "fresh",
  user_id: "user-1",
  venue_id: "venue-1",
  sport_slug: "ncaaf",
  sport_key: "americanfootball_ncaaf",
  league: "College Football",
  game_id: `${bostonCollege.id}__${bostonCollege.date}__x__y`,
  home_team_id: String(bostonCollege.home_team.id),
  away_team_id: String(bostonCollege.visitor_team.id),
  selected_team_id: String(bostonCollege.visitor_team.id),
  winning_team_id: null,
  game_label: `${bostonCollege.visitor_team.full_name} at ${bostonCollege.home_team.full_name}`,
  home_team: bostonCollege.home_team.full_name,
  away_team: bostonCollege.visitor_team.full_name,
  starts_at: bostonCollege.date,
  selected_team: bostonCollege.visitor_team.full_name,
  selected_side: "away",
  status: "pending",
  home_score: null,
  away_score: null,
  created_at: "2026-10-24T12:00:00.000Z",
  updated_at: "2026-10-24T12:00:00.000Z",
  resolved_at: null,
  reward_points: 10,
  reward_claimed_at: null,
  scoring_mode: "winner",
  ...overrides,
});

const pickById = (id: string) => store.tables.pickem_picks.find((row) => row.id === id)!;
const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

let warn: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  store.tables = { pickem_picks: [], notifications: [], venues: [{ id: "venue-1", timezone: "America/New_York" }] };
  clearVenueTimezoneCache();
  store.pickReads = 0;
  store.cursorReads = 0;
  store.updateError = null;
  store.updateMatchesNothing = false;
  store.fetchBallDontLieList.mockResolvedValue(saturday);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  warn.mockRestore();
  errorSpy.mockRestore();
});


// An NHL game, BallDontLie's shape (PR #48). Its Pick 'Em id moves when the feed's start time moves.
describe("Pick 'Em game id and grading guards (CR1.2)", () => {
  const OLD_ID = "3328426__2026-11-24T00:00:00.000Z__newjerseydevils__columbusbluejackets";
  const NEW_ID = "3328426__2026-11-24T01:00:00.000Z__newjerseydevils__columbusbluejackets";
  const nhlRow = (overrides: MockRow = {}): MockRow => ({
    id: 3328426,
    game_date: "2026-11-23",
    start_time_utc: "2026-11-24T00:00:00.000Z",
    home_team: { id: 1, full_name: "New Jersey Devils", tricode: "NJD" },
    away_team: { id: 9, full_name: "Columbus Blue Jackets", tricode: "CBJ" },
    home_score: 0,
    away_score: 0,
    game_state: "FUT",
    status_state: "scheduled",
    time_remaining: "00:00",
    ...overrides,
  });
  const nhlPick = (overrides: MockRow = {}): MockRow => ({
    ...collegePick(),
    id: "nhl",
    sport_slug: "nhl",
    sport_key: "icehockey_nhl",
    league: "NHL",
    game_id: OLD_ID,
    home_team_id: "1",
    away_team_id: "9",
    selected_team_id: "1",
    selected_team: "New Jersey Devils",
    selected_side: "home",
    home_team: "New Jersey Devils",
    away_team: "Columbus Blue Jackets",
    game_label: "x",
    starts_at: "2026-11-24T00:00:00.000Z",
    scoring_mode: null,
    ...overrides,
  });
  const feed = (...rows: MockRow[]) =>
    store.fetchBallDontLieList.mockImplementation((path: string) => Promise.resolve(path === "/nhl/v1/games" ? rows : []));
  const listNhl = () =>
    listPickEmGames({ sportSlug: "nhl", date: "2026-11-23", tzOffsetMinutes: 300, userId: "user-1", skipLines: true });
  const submitNhl = (pickTeam: string, venueId = "venue-1") =>
    submitPickEmPick({ userId: "user-1", venueId, sportSlug: "nhl", gameId: NEW_ID, pickTeam, date: "2026-11-23", tzOffsetMinutes: 300 });

  describe("F24: a moved start time keeps the player's one pick", () => {
    it("the list shows the pick on the game's new id and keeps it unlocked", async () => {
      store.tables.pickem_picks = [nhlPick()];
      feed(nhlRow({ start_time_utc: "2026-11-24T01:00:00.000Z" }));
      at("2026-11-23T18:00:00.000Z");
      const list = await listNhl();
      expect(list.games.map((g) => g.id)).toEqual([NEW_ID]);
      expect(list.games[0].userPickTeam).toBe("New Jersey Devils");
      expect(list.games[0].userPickId).toBe("nhl");
      expect(list.games[0].isLocked).toBe(false);
    });

    it("control: an unchanged time shows the pick", async () => {
      store.tables.pickem_picks = [nhlPick()];
      feed(nhlRow());
      at("2026-11-23T18:00:00.000Z");
      const list = await listNhl();
      expect(list.games[0].userPickTeam).toBe("New Jersey Devils");
    });

    it("a missing start_time_utc gives the noon fallback id (which then moves when the time is set)", async () => {
      feed(nhlRow({ start_time_utc: null }));
      at("2026-11-23T10:00:00.000Z");
      const before = await listPickEmGames({ sportSlug: "nhl", date: "2026-11-23", tzOffsetMinutes: 300, skipLines: true });
      expect(before.games[0].id).toBe("3328426__2026-11-23T12:00:00.000Z__newjerseydevils__columbusbluejackets");
    });

    it("a canceled pick under the old id is not carried to the new id", async () => {
      store.tables.pickem_picks = [nhlPick({ status: "canceled" })];
      feed(nhlRow({ start_time_utc: "2026-11-24T01:00:00.000Z" }));
      at("2026-11-23T18:00:00.000Z");
      const list = await listNhl();
      expect(list.games[0].userPickTeam).toBeUndefined();
    });

    it("picking the moved game switches the existing pick's side instead of saving a second pick", async () => {
      store.tables.pickem_picks = [nhlPick()];
      feed(nhlRow({ start_time_utc: "2026-11-24T01:00:00.000Z" }));
      at("2026-11-23T18:00:00.000Z");
      const pick = await submitNhl("Columbus Blue Jackets");
      expect(pick.id).toBe("nhl");
      expect(store.tables.pickem_picks).toHaveLength(1);
      expect(pickById("nhl").selected_team).toBe("Columbus Blue Jackets");
      expect(pickById("nhl").selected_side).toBe("away");
      expect(pickById("nhl").game_id).toBe(OLD_ID);
    });

    it("a moved game's pick locks at the game's current start, not the stored one", async () => {
      store.tables.pickem_picks = [nhlPick()];
      feed(nhlRow({ start_time_utc: "2026-11-24T01:00:00.000Z" }));
      // After the stored 00:00Z start, before the real 01:00Z one.
      at("2026-11-24T00:30:00.000Z");
      await submitNhl("Columbus Blue Jackets");
      expect(pickById("nhl").selected_team).toBe("Columbus Blue Jackets");
    });

    it("a pick on the same real game at another venue is refused", async () => {
      store.tables.pickem_picks = [nhlPick({ venue_id: "venue-2" })];
      feed(nhlRow({ start_time_utc: "2026-11-24T01:00:00.000Z" }));
      at("2026-11-23T18:00:00.000Z");
      await expect(submitNhl("Columbus Blue Jackets")).rejects.toThrow("You already made a pick for this game.");
      expect(store.tables.pickem_picks).toHaveLength(1);
    });

    it("after a canceled pick (e.g. postponed) the player can pick the rescheduled game", async () => {
      store.tables.pickem_picks = [nhlPick({ status: "canceled" })];
      feed(nhlRow({ start_time_utc: "2026-11-24T01:00:00.000Z" }));
      at("2026-11-23T18:00:00.000Z");
      await submitNhl("Columbus Blue Jackets");
      expect(store.tables.pickem_picks).toHaveLength(2);
      expect(store.tables.pickem_picks[1]).toMatchObject({ game_id: NEW_ID, status: "pending" });
    });

    it("two picks already saved on one real game (old id + new id): only one is graded and paid", async () => {
      store.tables.pickem_picks = [
        nhlPick({ id: "old", created_at: "2026-11-23T15:00:00.000Z" }),
        nhlPick({ id: "new", game_id: NEW_ID, starts_at: "2026-11-24T01:00:00.000Z", created_at: "2026-11-23T19:00:00.000Z" }),
      ];
      feed(nhlRow({ start_time_utc: "2026-11-24T01:00:00.000Z", home_score: 3, away_score: 2, game_state: "OFF", status_state: "final" }));
      at("2026-11-24T04:00:00.000Z");
      const result = await settlePendingPickEmPicks();
      expect(pickById("old").status).toBe("won"); // the first pick made
      expect(pickById("new").status).toBe("canceled");
      expect(result.won).toBe(1);
    });
  });

  describe("F25: grading waits for the game's real start", () => {
    it("a game moved later is not graded mid-game from the live score", async () => {
      // Stored start 00:00Z; real puck-drop 02:30Z; at 04:15Z the game is in progress, 1–0.
      store.tables.pickem_picks = [nhlPick()];
      feed(nhlRow({ start_time_utc: "2026-11-24T02:30:00.000Z", home_score: 1, away_score: 0, game_state: "LIVE", status_state: "in_progress", period: 2 }));
      at("2026-11-24T04:15:00.000Z");
      await settlePendingPickEmPicks();
      expect(pickById("nhl").status).toBe("pending");
    });

    it("the 4-hour rule still applies, counted from the real start", async () => {
      store.tables.pickem_picks = [nhlPick()];
      feed(nhlRow({ start_time_utc: "2026-11-24T02:30:00.000Z", home_score: 1, away_score: 0, game_state: "LIVE", status_state: "in_progress", period: 3 }));
      at("2026-11-24T06:31:00.000Z");
      await settlePendingPickEmPicks();
      expect(pickById("nhl").status).toBe("won");
    });
  });

  describe("F26: postponed is canceled, never a push", () => {
    it("a postponed game 0–0 is canceled", async () => {
      store.tables.pickem_picks = [nhlPick()];
      feed(nhlRow({ game_state: "PPD", status_state: "postponed" }));
      at("2026-11-24T04:30:00.000Z");
      const result = await settlePendingPickEmPicks();
      expect(pickById("nhl").status).toBe("canceled");
      expect(result.push).toBe(0);
    });

    it("NHL's game_state alone (no status_state) saying FUT keeps a 0–0 pick pending", async () => {
      store.tables.pickem_picks = [nhlPick()];
      feed(nhlRow({ game_state: "FUT", status_state: null }));
      at("2026-11-24T04:30:00.000Z");
      await settlePendingPickEmPicks();
      expect(pickById("nhl").status).toBe("pending");
    });

    it("NHL's PRE (pregame) is not started either", async () => {
      store.tables.pickem_picks = [nhlPick()];
      feed(nhlRow({ game_state: "PRE", status_state: null }));
      at("2026-11-24T04:30:00.000Z");
      await settlePendingPickEmPicks();
      expect(pickById("nhl").status).toBe("pending");
    });
  });

  describe("F27: win notifications use the venue's date", () => {
    it("a 7 PM ET game graded the same evening links to that ET date, with the sport", async () => {
      store.tables.pickem_picks = [nhlPick()]; // 00:00Z Nov 24 = 7 PM ET Nov 23
      feed(nhlRow({ home_score: 3, away_score: 2, game_state: "OFF", status_state: "final" }));
      at("2026-11-24T03:00:00.000Z"); // 10 PM ET Nov 23
      await settlePendingPickEmPicks();
      expect(store.tables.notifications).toHaveLength(1);
      expect(store.tables.notifications[0].link_url).toBe("/pickem?date=2026-11-23&sport=nhl");
    });

    it("graded the next ET day, it links to the game's ET date without the sport", async () => {
      store.tables.pickem_picks = [nhlPick()];
      feed(nhlRow({ home_score: 3, away_score: 2, game_state: "OFF", status_state: "final" }));
      at("2026-11-24T06:00:00.000Z"); // 1 AM ET Nov 24
      await settlePendingPickEmPicks();
      expect(store.tables.notifications[0].link_url).toBe("/pickem?date=2026-11-23");
    });
  });

  describe("F28: a team-name match needs the same game time", () => {
    // The pick's provider id isn't in the feed, so only the team-name fallback can find a game.
    const unlistedPick = () => nhlPick({ game_id: "999__2026-11-24T00:00:00.000Z__newjerseydevils__columbusbluejackets" });

    it("the same two teams two days later is a different game: the pick stays pending", async () => {
      store.tables.pickem_picks = [unlistedPick()];
      feed(nhlRow({ id: 3328500, start_time_utc: "2026-11-26T00:00:00.000Z", home_score: 4, away_score: 1, game_state: "OFF", status_state: "final" }));
      at("2026-11-26T04:00:00.000Z");
      await settlePendingPickEmPicks();
      expect(pickById("nhl").status).toBe("pending");
    });

    it("control: the same teams within 12 hours still match", async () => {
      store.tables.pickem_picks = [unlistedPick()];
      feed(nhlRow({ id: 3328500, start_time_utc: "2026-11-24T01:00:00.000Z", home_score: 4, away_score: 1, game_state: "OFF", status_state: "final" }));
      at("2026-11-24T04:00:00.000Z");
      await settlePendingPickEmPicks();
      expect(pickById("nhl").status).toBe("won");
    });
  });
});

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import conferences from "@/tests/fixtures/pickem-ncaaf/conferences.json";
import saturday from "@/tests/fixtures/pickem-ncaaf/games-2026-10-24.json";
import liveSample from "@/tests/fixtures/pickem-ncaaf/games-2026-10-31-sample.json";

// Pick 'Em Phase 2 (docs/pickem-college-football-and-prize-plan.md): College Football (FBS).
// Fixtures are real BallDontLie responses captured 2026-10-31: every game of Sat Oct 24, 2026
// (all final), a sample of Sat Oct 31 mid-afternoon (scheduled / halftime / OT / Q4 / final /
// FCS-only), and /ncaaf/v1/conferences.

vi.mock("server-only", () => ({}));

type MockRow = Record<string, unknown>;

const store = vi.hoisted(() => ({
  tables: {} as Record<string, MockRow[]>,
  fetchBallDontLieList: vi.fn(),
}));

vi.mock("@/lib/balldontlie", () => ({
  fetchBallDontLieList: store.fetchBallDontLieList,
}));

vi.mock("@/lib/venueGameSettings", () => ({
  DEFAULT_CFB_PICKEM_SCORING_MODE: "spread",
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

    const currentRows = () => store.tables[table] ?? [];
    const filteredRows = () => currentRows().filter((row) => filters.every((filter) => filter(row)));
    const resolve = () => {
      if (insertRows) {
        store.tables[table] = [...currentRows(), ...insertRows];
        return Promise.resolve({ data: insertRows, error: null });
      }
      if (patch) {
        const rows = filteredRows();
        for (const row of rows) Object.assign(row, patch);
        return Promise.resolve({ data: rows, error: null });
      }
      return Promise.resolve({ data: filteredRows(), error: null });
    };

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
        filters.push((row) => String(row[column] ?? "") <= String(value ?? ""));
        return builder;
      },
      gte: (column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? "") >= String(value ?? ""));
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      returns: () => builder,
      update: (value: MockRow) => {
        patch = value;
        return builder;
      },
      insert: (value: MockRow | MockRow[]) => {
        insertRows = Array.isArray(value) ? value : [value];
        return builder;
      },
      then: (
        onfulfilled?: ((value: { data: MockRow[]; error: null }) => unknown) | null,
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

import {
  collegeFootballGradeGate,
  COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS,
  FBS_CONFERENCE_IDS,
  formatCollegeFootballPeriodLabel,
  isFbsCollegeFootballGame,
  NFL_PICKEM_SIGNPOST,
} from "@/lib/pickemCollegeFootball";
import { listPickEmGames, listRegularPickEmSports, settlePendingPickEmPicks } from "@/lib/pickem";

type Game = (typeof saturday)[number];
const asRecord = (game: unknown) => game as Record<string, unknown>;
const byId = (games: Game[], id: number) => {
  const found = games.find((game) => game.id === id);
  if (!found) throw new Error(`fixture game ${id} missing`);
  return found;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  store.tables = { pickem_picks: [], notifications: [] };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FBS conference ids", () => {
  it("match the provider's /ncaaf/v1/conferences names", () => {
    const fbsNames = new Set([
      "ACC", "American", "Big 12", "Big Ten", "CUSA", "FBS Indep.", "MAC", "Mountain West", "Pac-12", "SEC", "Sun Belt",
    ]);
    const fromProvider = conferences.filter((c) => fbsNames.has(c.name)).map((c) => c.id).sort((a, b) => a - b);
    expect(fromProvider).toEqual([...FBS_CONFERENCE_IDS].sort((a, b) => a - b));
    expect(conferences.find((c) => c.name === "FCS Indep.")?.id).toBe(14);
    expect(FBS_CONFERENCE_IDS.has(14)).toBe(false);
  });
});

describe("isFbsCollegeFootballGame", () => {
  it("keeps a game with at least one FBS team and drops FCS-only games (real Saturday)", () => {
    const kept = (saturday as Game[]).filter((game) => isFbsCollegeFootballGame(asRecord(game)));
    expect(saturday).toHaveLength(97);
    expect(kept).toHaveLength(44);
    // Ball State (MAC) hosted Sacramento State (Big Sky, FCS): in.
    expect(kept.some((game) => game.id === 458084)).toBe(true);
    const fcsOnly = (liveSample as Game[]).find((game) => game.id === 458457);
    expect(fcsOnly && isFbsCollegeFootballGame(asRecord(fcsOnly))).toBe(false);
  });

  it("treats a team with no conference as not FBS", () => {
    expect(isFbsCollegeFootballGame({ home_team: { conference: null }, visitor_team: {} })).toBe(false);
    expect(isFbsCollegeFootballGame({ home_team: { conference: null }, visitor_team: { conference: 10 } })).toBe(true);
  });
});

describe("formatCollegeFootballPeriodLabel", () => {
  const label = (id: number) => formatCollegeFootballPeriodLabel(asRecord(byId(liveSample as Game[], id)));
  it("labels quarters, halftime and overtime from the provider's live fields", () => {
    expect(label(457403)).toBeNull(); // pre
    expect(label(458445)).toBe("Halftime"); // in, period 2, 0:00
    expect(label(458776)).toBe("OT · 0:00"); // in, period 5
    expect(label(457404)).toBe("Q4 · 12:28");
    expect(label(458097)).toBeNull(); // post
  });
});

describe("collegeFootballGradeGate", () => {
  const kickoff = Date.parse("2026-10-24T19:30:00.000Z");
  const final = { status: "post", statusState: "final" };
  const gate = (fields: { status: string | null; statusState: string | null }, homeScore: number | null, awayScore: number | null, afterMs: number) =>
    collegeFootballGradeGate({ ...fields, homeScore, awayScore, startsAtMs: kickoff, nowMs: kickoff + afterMs });

  it("grades only the provider's own final (post + final) with both scores", () => {
    expect(gate(final, 27, 49, 4 * 3600_000)).toBe("grade");
    expect(gate({ status: "POST", statusState: "Final" }, 27, 49, 4 * 3600_000)).toBe("grade");
    expect(gate(final, null, 49, 4 * 3600_000)).toBe("wait");
    // "post" alone, or "final" alone, is not enough.
    expect(gate({ status: "post", statusState: null }, 27, 49, 4 * 3600_000)).toBe("wait");
    expect(gate({ status: null, statusState: "final" }, 27, 49, 4 * 3600_000)).toBe("wait");
  });
  it("grades every captured overtime final (status_state stays 'final')", () => {
    const overtime = (saturday as Game[]).filter((game) => game.home_score_ot !== null || game.away_score_ot !== null);
    expect(overtime.length).toBeGreaterThan(0);
    for (const game of overtime) {
      expect(gate({ status: game.status, statusState: game.status_state }, game.home_score, game.away_score, 5 * 3600_000)).toBe("grade");
    }
  });
  it("never grades an unfinished game from its scores, however long it runs", () => {
    expect(gate({ status: "in", statusState: "in_progress" }, 27, 23, 5 * 3600_000)).toBe("wait");
  });
  it("cancels a called-off game at once, in any spelling and either field", () => {
    for (const fields of [
      { status: "post", statusState: "canceled" },
      { status: "post", statusState: "cancelled" },
      { status: "canceled", statusState: null },
      { status: "pre", statusState: "postponed" },
      { status: "post", statusState: "STATUS_POSTPONED" },
      { status: "post", statusState: "forfeit" },
      { status: "post", statusState: "abandoned" },
    ]) {
      expect(gate(fields, 0, 0, 60_000)).toBe("called_off");
      // Even with scores and a "final"-looking status beside it.
      expect(gate({ ...fields, status: fields.status ?? "post" }, 21, 14, 60_000)).toBe("called_off");
    }
  });
  it("a suspended or delayed game waits (it may resume), then cancels at 48 hours", () => {
    expect(gate({ status: "in", statusState: "suspended" }, 7, 3, 3600_000)).toBe("wait");
    expect(gate({ status: "in", statusState: "delayed" }, 7, 3, 3600_000)).toBe("wait");
    expect(gate({ status: "in", statusState: "suspended" }, 7, 3, COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS)).toBe("cancel");
  });
  it("never believes a 0–0 final: waits, then cancels at 48 hours", () => {
    expect(gate(final, 0, 0, 4 * 3600_000)).toBe("wait");
    expect(gate(final, 0, 0, COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS)).toBe("cancel");
    // A shutout is a real final.
    expect(gate(final, 0, 24, 4 * 3600_000)).toBe("grade");
  });
  it("cancels a pick with no final 48 hours after kickoff", () => {
    expect(gate({ status: "pre", statusState: "scheduled" }, 0, 0, COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS)).toBe("cancel");
  });
});

describe("College Football in the regular Pick 'Em sport list", () => {
  it("is offered, clickable, as 'College Football' / 'FBS'; NFL stays out", () => {
    const sports = listRegularPickEmSports();
    expect(sports.find((s) => s.slug === "ncaaf")).toMatchObject({
      label: "College Football",
      subtitle: "FBS",
      isClickable: true,
      isInSeason: true,
    });
    expect(sports.some((s) => s.slug === "nfl")).toBe(false);
  });
});

describe("listPickEmGames for College Football (normalised from the captured Saturday)", () => {
  it("lists only FBS games on the local day, home/visitor, scores and finals", async () => {
    store.fetchBallDontLieList.mockImplementation((path: string, query: URLSearchParams) => {
      expect(path).toBe("/ncaaf/v1/games");
      return Promise.resolve(query.get("dates[]") === "2026-10-24" ? saturday : []);
    });

    // US Eastern (EDT): getTimezoneOffset() = 240.
    const result = await listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-24", tzOffsetMinutes: 240 });

    const localDay = (iso: string) => new Date(Date.parse(iso) - 240 * 60_000).toISOString().slice(0, 10);
    const expected = (saturday as Game[]).filter(
      (game) => isFbsCollegeFootballGame(asRecord(game)) && localDay(game.date) === "2026-10-24"
    );
    expect(expected.length).toBeGreaterThan(30);
    expect(result.games).toHaveLength(expected.length);
    expect(result.games.every((game) => game.league === "College Football" && game.sportSlug === "ncaaf")).toBe(true);
    expect(result.games.every((game) => game.status === "final")).toBe(true);

    const gt = result.games.find((game) => game.homeTeam === "Georgia Tech Yellow Jackets");
    expect(gt).toMatchObject({
      awayTeam: "Boston College Eagles",
      homeScore: 27,
      awayScore: 49,
      winnerTeam: "Boston College Eagles",
      startsAt: "2026-10-24T19:30:00.000Z",
      periodLabel: null,
    });
    // The Friday-night game (02:30Z = Fri 10:30 pm Eastern) belongs to Friday, not Saturday.
    expect(result.games.some((game) => game.homeTeam === "Stanford Cardinal")).toBe(false);
  });
});

describe("settlePendingPickEmPicks grades college picks through the outright path", () => {
  const pickOn = (game: Game, side: "home" | "away", id = "pick-1"): MockRow => ({
    id,
    user_id: "user-1",
    venue_id: "venue-1",
    sport_slug: "ncaaf",
    sport_key: "americanfootball_ncaaf",
    league: "College Football",
    game_id: `${game.id}__${game.date}__x__y`,
    home_team_id: String(game.home_team.id),
    away_team_id: String(game.visitor_team.id),
    selected_team_id: String(side === "home" ? game.home_team.id : game.visitor_team.id),
    winning_team_id: null,
    game_label: `${game.visitor_team.full_name} at ${game.home_team.full_name}`,
    home_team: game.home_team.full_name,
    away_team: game.visitor_team.full_name,
    starts_at: game.date,
    selected_team: side === "home" ? game.home_team.full_name : game.visitor_team.full_name,
    selected_side: side,
    status: "pending",
    home_score: null,
    away_score: null,
    created_at: "2026-10-24T12:00:00.000Z",
    updated_at: "2026-10-24T12:00:00.000Z",
    resolved_at: null,
    reward_points: 10,
    reward_claimed_at: null,
  });

  it("wins and loses picks on a real final (Boston College 49, Georgia Tech 27)", async () => {
    const game = byId(saturday as Game[], 457383);
    store.tables.pickem_picks = [pickOn(game, "away", "right"), pickOn(game, "home", "wrong")];
    store.fetchBallDontLieList.mockResolvedValue(saturday);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T12:00:00.000Z"));

    const result = await settlePendingPickEmPicks();

    expect(result).toMatchObject({ settledCount: 2, won: 1, lost: 1 });
    const [right, wrong] = store.tables.pickem_picks;
    expect(right).toMatchObject({ status: "won", home_score: 27, away_score: 49, winning_team_id: String(game.visitor_team.id), reward_points: 10 });
    expect(wrong).toMatchObject({ status: "lost" });
  });

  it("leaves an in-progress game pending 5 hours after kickoff (no staleness shortcut)", async () => {
    const live = byId(liveSample as Game[], 457404); // Q4, 12:28 left
    store.tables.pickem_picks = [pickOn(live, "home")];
    store.fetchBallDontLieList.mockResolvedValue(liveSample);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.parse(live.date) + 5 * 3600_000));

    const result = await settlePendingPickEmPicks();

    expect(result.settledCount).toBe(0);
    expect(store.tables.pickem_picks[0].status).toBe("pending");
  });

  it("cancels a pick whose game has no final 48 hours after kickoff", async () => {
    const live = byId(liveSample as Game[], 457404);
    store.tables.pickem_picks = [pickOn(live, "home")];
    store.fetchBallDontLieList.mockResolvedValue(liveSample);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.parse(live.date) + COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS + 60_000));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await settlePendingPickEmPicks();

    expect(result.settledCount).toBe(1);
    expect(store.tables.pickem_picks[0]).toMatchObject({ status: "canceled", winning_team_id: null });
    warn.mockRestore();
  });
});

describe("settlePendingPickEmPicks never grades a called-off college game (Phase 7.3, F3)", () => {
  // Synthetic payloads built from a real final (Boston College 49 at Georgia Tech 27): the provider's
  // spelling for a called-off college game is unverified, so each plausible one is covered.
  const base = byId(saturday as Game[], 457383);
  const calledOff = (statusState: string, status = "post"): Game => ({
    ...base,
    status,
    status_state: statusState,
    home_score: 0,
    away_score: 0,
    home_score_q1: null, home_score_q2: null, home_score_q3: null, home_score_q4: null, home_score_ot: null,
    away_score_q1: null, away_score_q2: null, away_score_q3: null, away_score_q4: null, away_score_ot: null,
  } as unknown as Game);
  const pickOn = (game: Game, side: "home" | "away", id: string): MockRow => ({
    id,
    user_id: `user-${id}`,
    venue_id: "venue-1",
    sport_slug: "ncaaf",
    sport_key: "americanfootball_ncaaf",
    league: "College Football",
    game_id: `${game.id}__${game.date}__x__y`,
    home_team_id: String(game.home_team.id),
    away_team_id: String(game.visitor_team.id),
    selected_team_id: String(side === "home" ? game.home_team.id : game.visitor_team.id),
    winning_team_id: null,
    game_label: "BC at GT",
    home_team: game.home_team.full_name,
    away_team: game.visitor_team.full_name,
    starts_at: game.date,
    selected_team: side === "home" ? game.home_team.full_name : game.visitor_team.full_name,
    selected_side: side,
    status: "pending",
    home_score: null,
    away_score: null,
    created_at: "2026-10-24T12:00:00.000Z",
    updated_at: "2026-10-24T12:00:00.000Z",
    resolved_at: null,
    reward_points: 10,
    reward_claimed_at: null,
  });
  const settleWith = async (game: Game, atMs: number) => {
    store.tables.pickem_picks = [pickOn(game, "home", "home"), pickOn(game, "away", "away")];
    store.fetchBallDontLieList.mockResolvedValue([game]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(atMs));
    return settlePendingPickEmPicks();
  };

  for (const [status, statusState] of [
    ["post", "canceled"],
    ["post", "cancelled"],
    ["pre", "postponed"],
  ] as const) {
    it(`cancels winner-mode picks on a ${status}/${statusState} game right away (never a push)`, async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await settleWith(calledOff(statusState, status), Date.parse(base.date) + 3600_000);
      expect(result).toMatchObject({ settledCount: 2, won: 0, lost: 0, push: 0 });
      expect(store.tables.pickem_picks.map((row) => [row.status, row.winning_team_id])).toEqual([
        ["canceled", null],
        ["canceled", null],
      ]);
      expect(warn.mock.calls.some(([line]) => String(line).includes(`the provider says "${statusState}"`))).toBe(true);
      warn.mockRestore();
    });
  }

  it("a 0–0 'final' waits (one warning per game), then cancels 48 hours after kickoff", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const zeroFinal = calledOff("final");
    const early = await settleWith(zeroFinal, Date.parse(base.date) + 4 * 3600_000);
    expect(early.settledCount).toBe(0);
    expect(store.tables.pickem_picks.every((row) => row.status === "pending")).toBe(true);
    expect(warn.mock.calls.filter(([line]) => String(line).includes("not a gradeable final"))).toHaveLength(1);

    const late = await settleWith(zeroFinal, Date.parse(base.date) + COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS + 60_000);
    expect(late).toMatchObject({ settledCount: 2, won: 0, lost: 0, push: 0 });
    expect(store.tables.pickem_picks.every((row) => row.status === "canceled")).toBe(true);
    warn.mockRestore();
  });
});

describe("NFL signpost", () => {
  it("is rendered under the sport row and links to /nfl-pickem", () => {
    const source = readFileSync("components/pickem/PickEmGameList.tsx", "utf8");
    expect(source).toContain("NFL_PICKEM_SIGNPOST.href");
    expect(source).toContain("NFL_PICKEM_SIGNPOST.text");
    expect(NFL_PICKEM_SIGNPOST.href).toBe("/nfl-pickem");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import saturday from "@/tests/fixtures/pickem-ncaaf/games-2026-10-24.json";

// Pick 'Em Phase 7.4 (docs/pickem-college-football-and-prize-plan.md, finding F4): settlement reads
// only the 500 OLDEST started pending picks, and a pick whose game is outside the ±7-day score
// fetch can never be found. Such picks must be cancelled, or they fill the read and nobody is
// graded or paid. A college pick whose game the provider no longer lists still gets its 48-hour
// cancel, but never because of a failed or cut-off fetch.
//
// This mock honours order + limit (unlike the older settlement mocks), so the head-of-queue test
// fails on the pre-7.4 code: the 500-row read would hold only stuck picks.

vi.mock("server-only", () => ({}));

type MockRow = Record<string, unknown>;
type FailureBox = { failed: boolean };
type TruncationBox = { truncated: boolean };

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
        store.tables[table] = [...currentRows(), ...insertRows];
        return Promise.resolve({ data: insertRows, error: null });
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

import {
  collegeFootballMissingGameGate,
  COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS,
} from "@/lib/pickemCollegeFootball";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  PICKEM_SETTLE_PAGE_CAP,
  PICKEM_SETTLE_PAGE_SIZE,
  PICKEM_UNFINDABLE_PENDING_MS,
  settlePendingPickEmPicks,
} from "@/lib/pickem";

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

// A pick on a college game the provider doesn't list (neither id nor teams are in the fixture).
const missingCollegePick = (overrides: MockRow = {}): MockRow =>
  collegePick({
    id: "missing",
    game_id: "999999__2026-10-24T16:00:00.000Z__x__y",
    home_team_id: "9001",
    away_team_id: "9002",
    selected_team_id: "9002",
    home_team: "Nowhere State Owls",
    away_team: "Missing Tech Ghosts",
    game_label: "Missing Tech Ghosts at Nowhere State Owls",
    selected_team: "Missing Tech Ghosts",
    starts_at: "2026-10-24T16:00:00.000Z",
    ...overrides,
  });

// The live shape: NFL picks pending since 2026-07-30 (4 in production on 2026-11-01).
const stuckNflPicks = (count: number, userId = "user-stuck"): MockRow[] =>
  Array.from({ length: count }, (_, i) => ({
    ...collegePick(),
    id: `stuck-${userId}-${i}`,
    user_id: userId,
    sport_slug: "nfl",
    sport_key: "americanfootball_nfl",
    league: "NFL",
    game_id: `nfl-${i}__2026-07-30T20:20:00+00:00__a__b`,
    starts_at: i % 2 === 0 ? "2026-07-30T20:20:00+00:00" : "2026-08-02T13:00:00+00:00",
    scoring_mode: null,
  }));

const pickById = (id: string) => store.tables.pickem_picks.find((row) => row.id === id)!;
const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};
type LogSpy = { mock: { calls: unknown[][] } };
const logLines = (spy: LogSpy) => spy.mock.calls.map((call) => String(call[0]));
const staleLines = (spy: LogSpy) => logLines(spy).filter((line) => line.includes("stale-pending-canceled"));

let warn: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  store.tables = { pickem_picks: [], notifications: [] };
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

describe("stuck pending picks can't stop settlement (F4)", () => {
  it("cancels 600 unfindable picks and still grades the fresh one in the same run", async () => {
    store.tables.pickem_picks = [...stuckNflPicks(600), collegePick()];
    at("2026-10-25T12:00:00.000Z");

    const result = await settlePendingPickEmPicks();

    expect(pickById("fresh")).toMatchObject({ status: "won", home_score: 27, away_score: 49 });
    const stuck = store.tables.pickem_picks.filter((row) => row.id !== "fresh");
    expect(stuck.every((row) => row.status === "canceled" && row.winning_team_id === null)).toBe(true);
    expect(stuck.every((row) => row.resolved_at === "2026-10-25T12:00:00.000Z")).toBe(true);
    // Stuck picks are never counted as graded or paid.
    expect(result).toMatchObject({ pendingScanned: 1, settledCount: 1, won: 1 });
    expect(staleLines(warn)).toEqual([
      "[Pick 'Em] stale-pending-canceled count=600 oldest=2026-07-30T20:20:00+00:00 (game started over 8 days ago; outside the score window)",
    ]);
    expect(store.pickReads).toBe(2);
    // The score fetch is asked only for sports still pending after the cancel (no NFL request).
    const paths = store.fetchBallDontLieList.mock.calls.map((call) => String(call[0]));
    expect(paths.every((path) => path === "/ncaaf/v1/games")).toBe(true);
  });

  it("a normal run costs no extra request and logs nothing", async () => {
    store.tables.pickem_picks = [collegePick()];
    at("2026-10-25T12:00:00.000Z");

    await settlePendingPickEmPicks();

    expect(store.pickReads).toBe(1);
    expect(staleLines(warn)).toEqual([]);
  });

  it("keeps a pick inside the window: 7 days 23 hours after kickoff is not cancelled", async () => {
    const startsAt = "2026-10-20T12:00:00.000Z";
    store.tables.pickem_picks = [
      { ...stuckNflPicks(1)[0], id: "nfl-recent", starts_at: startsAt, game_id: `nfl-r__${startsAt}__a__b` },
    ];
    store.fetchBallDontLieList.mockResolvedValue([]);
    at(new Date(Date.parse(startsAt) + PICKEM_UNFINDABLE_PENDING_MS - 3600_000).toISOString());

    await settlePendingPickEmPicks();

    expect(pickById("nfl-recent").status).toBe("pending");
    expect(staleLines(warn)).toEqual([]);
  });

  it("a player's own settlement cancels only that player's stuck picks", async () => {
    store.tables.pickem_picks = [...stuckNflPicks(2, "user-a"), ...stuckNflPicks(2, "user-b")];
    at("2026-10-25T12:00:00.000Z");

    await settlePendingPickEmPicks({ userId: "user-a" });

    const byUser = (userId: string) => store.tables.pickem_picks.filter((row) => row.user_id === userId);
    expect(byUser("user-a").every((row) => row.status === "canceled")).toBe(true);
    expect(byUser("user-b").every((row) => row.status === "pending")).toBe(true);
  });

  it("a failed cancel is logged and never stops the run", async () => {
    store.tables.pickem_picks = [...stuckNflPicks(3)];
    store.updateError = { message: "database unavailable" };
    at("2026-10-25T12:00:00.000Z");

    const result = await settlePendingPickEmPicks();

    expect(result.pendingScanned).toBe(3);
    expect(logLines(errorSpy).some((line) => line.includes("stale-pending-cancel-failed"))).toBe(true);
    expect(staleLines(warn)).toEqual([]);
  });
});

// Phase 7.5.2 (F14): picks that may legitimately wait up to 48 h sit at the head of the
// oldest-first read; the read is paged by (starts_at, id) so they can't hide later finished games.
describe("the pending read is paged, so waiting picks can't clog settlement (F14)", () => {
  const SATURDAY_NOON = "2026-10-24T16:00:00.000Z";
  // A game the provider doesn't list, kicked off before Boston College: waits up to 48 h (complete fetch).
  const waitingPicks = (count: number): MockRow[] =>
    Array.from({ length: count }, (_, i) =>
      missingCollegePick({ id: `wait-${String(i).padStart(4, "0")}`, user_id: `user-w${i}`, starts_at: SATURDAY_NOON })
    );
  const finishedLater = () => collegePick({ id: "zz-later", user_id: "user-later" });

  it("600 waiting picks ahead of a finished game: the finished one is graded and paid", async () => {
    // Every waiting pick shares one kickoff, so the page boundary falls inside a tie on starts_at.
    store.tables.pickem_picks = [...waitingPicks(600), finishedLater()];
    at("2026-10-25T12:00:00.000Z");

    const result = await settlePendingPickEmPicks();

    expect(pickById("zz-later")).toMatchObject({ status: "won" });
    expect(store.tables.pickem_picks.filter((row) => row.status === "pending")).toHaveLength(600);
    expect(result).toMatchObject({ pendingScanned: 601, settledCount: 1, won: 1 });
    expect(store.pickReads).toBe(2);
    expect(store.cursorReads).toBe(1);
    // Each sport's scores are still fetched once per run, not once per page (college: one request
    // per day of the ±7-day window).
    expect(store.fetchBallDontLieList.mock.calls.length).toBe(15);
    expect(logLines(warn).some((line) => line.includes("settle-page-cap"))).toBe(false);
  });

  it("every pick is read once, even when a page ends inside a tie", async () => {
    store.tables.pickem_picks = waitingPicks(PICKEM_SETTLE_PAGE_SIZE * 2 + 3);
    at("2026-10-25T12:00:00.000Z");

    const result = await settlePendingPickEmPicks();

    expect(result.pendingScanned).toBe(PICKEM_SETTLE_PAGE_SIZE * 2 + 3);
    expect(store.pickReads).toBe(3);
  });

  it("a normal run (under one page) makes exactly one read and no cursor read", async () => {
    store.tables.pickem_picks = [...waitingPicks(PICKEM_SETTLE_PAGE_SIZE - 2), finishedLater()];
    at("2026-10-25T12:00:00.000Z");

    await settlePendingPickEmPicks();

    expect(store.pickReads).toBe(1);
    expect(store.cursorReads).toBe(0);
  });

  it("stops at the page cap and says so once", async () => {
    const cap = PICKEM_SETTLE_PAGE_SIZE * PICKEM_SETTLE_PAGE_CAP;
    store.tables.pickem_picks = [...waitingPicks(cap + 10), finishedLater()];
    at("2026-10-25T12:00:00.000Z");

    const result = await settlePendingPickEmPicks();

    expect(result.pendingScanned).toBe(cap);
    expect(store.pickReads).toBe(PICKEM_SETTLE_PAGE_CAP);
    expect(pickById("zz-later").status).toBe("pending");
    expect(logLines(warn).filter((line) => line.includes("settle-page-cap"))).toEqual([
      `[Pick 'Em] settle-page-cap scanned=${cap} oldest=${SATURDAY_NOON}`,
    ]);
  });

  it("the 8-day cancel still runs on the first page, before paging on", async () => {
    store.tables.pickem_picks = [...stuckNflPicks(PICKEM_SETTLE_PAGE_SIZE + 5), ...waitingPicks(3), finishedLater()];
    at("2026-10-25T12:00:00.000Z");

    const result = await settlePendingPickEmPicks();

    expect(staleLines(warn)).toHaveLength(1);
    expect(store.tables.pickem_picks.filter((row) => String(row.id).startsWith("stuck-")).every((row) => row.status === "canceled")).toBe(true);
    expect(pickById("zz-later").status).toBe("won");
    expect(result.pendingScanned).toBe(4);
  });
});

describe("a college pick whose game the provider doesn't list (F4)", () => {
  const kickoffMs = Date.parse("2026-10-24T16:00:00.000Z");
  const after = (ms: number) => at(new Date(kickoffMs + ms).toISOString());

  it("is cancelled 48 hours after kickoff when the fetch was complete", async () => {
    store.tables.pickem_picks = [missingCollegePick()];
    after(COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS + 60_000);

    const result = await settlePendingPickEmPicks();

    expect(pickById("missing")).toMatchObject({ status: "canceled", winning_team_id: null, home_score: null, scoring_mode: "winner" });
    expect(result).toMatchObject({ settledCount: 1, won: 0, lost: 0, push: 0 });
    expect(logLines(warn).some((line) => line.includes("the provider has no such game 48 hours after kickoff"))).toBe(true);
  });

  it("a spread pick is cancelled the same way (no line needed to cancel)", async () => {
    store.tables.pickem_picks = [missingCollegePick({ scoring_mode: "spread" })];
    after(COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS + 60_000);

    await settlePendingPickEmPicks();

    expect(pickById("missing")).toMatchObject({ status: "canceled", scoring_mode: "spread", home_spread: null });
  });

  it("waits before 48 hours", async () => {
    store.tables.pickem_picks = [missingCollegePick()];
    after(COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS - 60_000);

    await settlePendingPickEmPicks();

    expect(pickById("missing").status).toBe("pending");
  });

  it("never cancels on a failed provider reply (it reads as 'no games')", async () => {
    store.tables.pickem_picks = [missingCollegePick()];
    store.fetchBallDontLieList.mockImplementation(
      (_path: string, _query: URLSearchParams, _pages: number, _truncation: TruncationBox, failure: FailureBox) => {
        failure.failed = true;
        return Promise.resolve([]);
      }
    );
    after(COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS + 60_000);

    await settlePendingPickEmPicks();

    expect(pickById("missing").status).toBe("pending");
  });

  it("never cancels when one day's request threw", async () => {
    store.tables.pickem_picks = [missingCollegePick()];
    let calls = 0;
    store.fetchBallDontLieList.mockImplementation(() => {
      calls += 1;
      return calls === 3 ? Promise.reject(new Error("socket hang up")) : Promise.resolve(saturday);
    });
    after(COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS + 60_000);

    await settlePendingPickEmPicks();

    expect(pickById("missing").status).toBe("pending");
  });

  it("never cancels when a day was cut off at the page cap", async () => {
    store.tables.pickem_picks = [missingCollegePick()];
    store.fetchBallDontLieList.mockImplementation(
      (_path: string, _query: URLSearchParams, _pages: number, truncation: TruncationBox) => {
        truncation.truncated = true;
        return Promise.resolve(saturday);
      }
    );
    after(COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS + 60_000);

    await settlePendingPickEmPicks();

    expect(pickById("missing").status).toBe("pending");
  });

  it("other sports keep waiting for the 8-day cancel", async () => {
    const nfl = { ...stuckNflPicks(1)[0], id: "nfl-missing", starts_at: "2026-10-24T16:00:00.000Z" };
    store.tables.pickem_picks = [nfl];
    store.fetchBallDontLieList.mockResolvedValue([]);
    after(3 * 24 * 3600_000);

    await settlePendingPickEmPicks();

    expect(pickById("nfl-missing").status).toBe("pending");
  });
});

describe("collegeFootballMissingGameGate", () => {
  const kickoff = Date.parse("2026-10-24T16:00:00.000Z");
  it("cancels only on a complete fetch, 48 hours after kickoff", () => {
    const past = kickoff + COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS;
    expect(collegeFootballMissingGameGate({ scoresComplete: true, startsAtMs: kickoff, nowMs: past })).toBe("cancel");
    expect(collegeFootballMissingGameGate({ scoresComplete: true, startsAtMs: kickoff, nowMs: past - 1 })).toBe("wait");
    expect(collegeFootballMissingGameGate({ scoresComplete: false, startsAtMs: kickoff, nowMs: past + 864e5 })).toBe("wait");
    expect(collegeFootballMissingGameGate({ scoresComplete: true, startsAtMs: Number.NaN, nowMs: past })).toBe("wait");
  });
});

describe("a win is counted only by the run that graded it (F23)", () => {
  it("counts nothing, queues no notification and pays nothing when another run graded the pick first", async () => {
    store.tables.pickem_picks = [collegePick()];
    store.updateMatchesNothing = true;
    at("2026-10-25T12:00:00.000Z");

    const result = await settlePendingPickEmPicks({ userId: "user-1" });

    expect(result.won).toBe(0);
    expect(result.settledCount).toBe(0);
    expect(store.tables.notifications).toHaveLength(0);
    expect(result.payout).toBeNull();
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it("still counts and notifies the run that did grade it", async () => {
    store.tables.pickem_picks = [collegePick()];
    at("2026-10-25T12:00:00.000Z");

    const result = await settlePendingPickEmPicks();

    expect(result.settledCount).toBe(1);
    expect(result.won + result.lost).toBe(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 6 of the NFL Pick 'Em reward: the NFL-only accrual sweep that feeds
 * settled winning picks into the challenge-campaign engine.
 *
 * The behaviors pinned here are the ones that cost real money if they regress:
 * the accrual UNIT (correct picks, not the flat 10 points sitting on the row),
 * idempotency across repeated cron runs, and the guarantee that daily Pick 'Em's
 * own settlement/accrual path is untouched by any of this.
 */

type PickRow = {
  id: string;
  user_id: string;
  venue_id: string;
  starts_at: string;
  sport_slug: string;
  status: string;
  challenge_accrued_at: string | null;
};

type ApplyCall = {
  userId: string;
  venueId: string;
  gameType: string;
  basePoints: number;
  occurredAt?: Date;
  requireCampaignCreatedBeforeOccurrence?: boolean;
};

const store = vi.hoisted(() => ({
  picks: [] as PickRow[],
  applyCalls: [] as ApplyCall[],
  /** challengeId -> created_at, consulted by the applyChallengeCampaignPoints stand-in. */
  campaigns: [] as Array<{ id: string; venueId: string; createdAtMs: number }>,
  /** `${challengeId}|${userId}|${venueId}` -> accumulated progress. */
  progress: new Map<string, number>(),
  stampShouldFail: false,
}));

// Faithful-enough stand-in: filters the venue's campaigns the way the real
// function does (venue scope + the Phase-6 created-at guard) and ACCUMULATES
// progress, which is the property idempotency has to defend against.
const applyChallengeCampaignPoints = vi.hoisted(() =>
  vi.fn(async (params: ApplyCall) => {
    store.applyCalls.push(params);
    const occurredMs = (params.occurredAt ?? new Date()).getTime();
    const eligible = store.campaigns.filter(
      (c) =>
        c.venueId === params.venueId &&
        (!params.requireCampaignCreatedBeforeOccurrence || occurredMs >= c.createdAtMs)
    );
    const campaignUpdates = eligible.map((c) => {
      const key = `${c.id}|${params.userId}|${params.venueId}`;
      const next = (store.progress.get(key) ?? 0) + params.basePoints;
      store.progress.set(key, next);
      return { challengeId: c.id, progress: next, won: false };
    });
    return { finalPoints: params.basePoints, multiplierApplied: 1, campaignUpdates };
  })
);

vi.mock("@/lib/challengeCampaigns", () => ({ applyChallengeCampaignPoints }));

// lib/nflPickEm.ts pulls in the whole NFL stack; the sweep only needs the slug.
vi.mock("@/lib/nflPickEm", () => ({ NFL_PICKEM_SPORT_SLUG: "nfl" }));

// Minimal chainable stand-in for the two shapes the sweep uses: a filtered
// select over pickem_picks, and an update(...).in("id", ids).
vi.mock("@/lib/supabaseAdmin", () => {
  const makeBuilder = () => {
    const eqs: Array<[string, unknown]> = [];
    const isNulls: string[] = [];
    let updatePayload: Record<string, unknown> | null = null;
    let ascending = true;
    let limit = Number.POSITIVE_INFINITY;

    const builder: Record<string, unknown> = {};
    const self = () => builder;
    builder.select = vi.fn(self);
    builder.eq = vi.fn((col: string, val: unknown) => {
      eqs.push([col, val]);
      return builder;
    });
    builder.is = vi.fn((col: string, val: unknown) => {
      if (val === null) isNulls.push(col);
      return builder;
    });
    builder.order = vi.fn((_col: string, opts?: { ascending?: boolean }) => {
      ascending = opts?.ascending !== false;
      return builder;
    });
    builder.limit = vi.fn((n: number) => {
      limit = n;
      return builder;
    });
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      updatePayload = payload;
      return builder;
    });
    builder.in = vi.fn((col: string, ids: string[]) => {
      if (updatePayload && col === "id") {
        if (store.stampShouldFail) {
          return Promise.resolve({ error: { message: "stamp failed" } });
        }
        for (const row of store.picks) {
          if (ids.includes(row.id)) {
            row.challenge_accrued_at = String(updatePayload.challenge_accrued_at ?? "");
          }
        }
      }
      return Promise.resolve({ error: null });
    });
    builder.returns = vi.fn(() => {
      const matched = store.picks
        .filter((row) =>
          eqs.every(([col, val]) => (row as unknown as Record<string, unknown>)[col] === val)
        )
        .filter((row) =>
          isNulls.every((col) => (row as unknown as Record<string, unknown>)[col] === null)
        )
        .sort((a, b) =>
          ascending
            ? a.starts_at.localeCompare(b.starts_at)
            : b.starts_at.localeCompare(a.starts_at)
        )
        .slice(0, limit)
        .map((row) => ({
          id: row.id,
          user_id: row.user_id,
          venue_id: row.venue_id,
          starts_at: row.starts_at,
        }));
      return Promise.resolve({ data: matched, error: null });
    });
    return builder;
  };
  return { supabaseAdmin: { from: vi.fn(() => makeBuilder()) } };
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { accrueNFLPickEmChallengePoints } from "@/lib/nflPickEmRewardAccrual";

const SUNDAY_KICKOFF = "2026-09-13T17:00:00.000Z";
const MONDAY_KICKOFF = "2026-09-14T00:15:00.000Z";

const makePick = (overrides: Partial<PickRow> = {}): PickRow => ({
  id: `pick-${store.picks.length + 1}`,
  user_id: "user-1",
  venue_id: "venue-1",
  starts_at: SUNDAY_KICKOFF,
  sport_slug: "nfl",
  status: "won",
  challenge_accrued_at: null,
  ...overrides,
});

const seedPicks = (...rows: Array<Partial<PickRow>>) => {
  for (const row of rows) store.picks.push(makePick(row));
};

const progressFor = (challengeId: string, userId = "user-1", venueId = "venue-1") =>
  store.progress.get(`${challengeId}|${userId}|${venueId}`) ?? 0;

describe("accrueNFLPickEmChallengePoints", () => {
  beforeEach(() => {
    store.picks = [];
    store.applyCalls = [];
    store.progress = new Map();
    store.stampShouldFail = false;
    // Created well before every kickoff used below unless a test says otherwise.
    store.campaigns = [
      { id: "camp-nfl", venueId: "venue-1", createdAtMs: Date.parse("2026-09-01T00:00:00.000Z") },
    ];
    applyChallengeCampaignPoints.mockClear();
  });

  it("accrues 1 point per correct pick, not the flat 10 on the row", async () => {
    seedPicks({ id: "p1" }, { id: "p2" }, { id: "p3" });

    const report = await accrueNFLPickEmChallengePoints();

    expect(report.picksAccrued).toBe(3);
    expect(store.applyCalls).toHaveLength(1);
    expect(store.applyCalls[0].basePoints).toBe(3);
    expect(store.applyCalls[0].gameType).toBe("nfl-pickem");
    // The trap: 3 correct picks × 10 reward_points = 30.
    expect(progressFor("camp-nfl")).toBe(3);
    expect(progressFor("camp-nfl")).not.toBe(30);
  });

  it("accrues once when the sweep runs twice (idempotency marker)", async () => {
    seedPicks({ id: "p1" }, { id: "p2" });

    await accrueNFLPickEmChallengePoints();
    const second = await accrueNFLPickEmChallengePoints();

    expect(second.picksScanned).toBe(0);
    expect(second.picksAccrued).toBe(0);
    expect(store.applyCalls).toHaveLength(1);
    expect(progressFor("camp-nfl")).toBe(2);
    expect(store.picks.every((row) => row.challenge_accrued_at !== null)).toBe(true);
  });

  it("leaves picks un-stamped (so the next run retries) when accrual throws", async () => {
    seedPicks({ id: "p1" });
    applyChallengeCampaignPoints.mockRejectedValueOnce(new Error("engine down"));

    const report = await accrueNFLPickEmChallengePoints();

    expect(report.picksAccrued).toBe(0);
    expect(report.errors).toHaveLength(1);
    expect(store.picks[0].challenge_accrued_at).toBeNull();
  });

  // `canceled` is the terminal status the settlement sweep writes for a spread
  // pick it could not grade (no locked line / no final scores past the staleness
  // window). A voided pick must never accrue toward a real prize.
  it("ignores lost, pending, push and canceled picks", async () => {
    seedPicks(
      { id: "lost", status: "lost" },
      { id: "pending", status: "pending" },
      { id: "push", status: "push" },
      { id: "canceled", status: "canceled" }
    );

    const report = await accrueNFLPickEmChallengePoints();

    expect(report.picksScanned).toBe(0);
    expect(store.applyCalls).toHaveLength(0);
    expect(progressFor("camp-nfl")).toBe(0);
  });

  it("never touches daily Pick 'Em picks", async () => {
    seedPicks(
      { id: "nba-win", sport_slug: "nba" },
      { id: "mlb-win", sport_slug: "mlb" },
      { id: "nfl-win" }
    );

    const report = await accrueNFLPickEmChallengePoints();

    expect(report.picksAccrued).toBe(1);
    expect(store.applyCalls).toHaveLength(1);
    // Only the NFL row is stamped; the daily rows are untouched, so
    // claimPickEmDailyReward's own accrual path still sees them exactly as before.
    expect(store.picks.find((r) => r.id === "nba-win")?.challenge_accrued_at).toBeNull();
    expect(store.picks.find((r) => r.id === "mlb-win")?.challenge_accrued_at).toBeNull();
    expect(store.picks.find((r) => r.id === "nfl-win")?.challenge_accrued_at).not.toBeNull();
  });

  it("passes the pick's own kickoff as occurredAt, not now", async () => {
    seedPicks({ id: "p1", starts_at: SUNDAY_KICKOFF }, { id: "p2", starts_at: MONDAY_KICKOFF });

    await accrueNFLPickEmChallengePoints();

    // One call per kickoff — a Sunday game and a Monday game can fall in
    // different NFL weeks and must not be collapsed into one occurredAt.
    expect(store.applyCalls).toHaveLength(2);
    const occurred = store.applyCalls.map((call) => call.occurredAt?.toISOString());
    expect(occurred).toEqual([SUNDAY_KICKOFF, MONDAY_KICKOFF]);
  });

  it("asks the engine to skip campaigns created after the pick's kickoff", async () => {
    seedPicks({ id: "p1" });
    store.campaigns = [
      // Created the day AFTER the game — a partner setting up a reward mid-week.
      { id: "camp-late", venueId: "venue-1", createdAtMs: Date.parse("2026-09-14T12:00:00.000Z") },
    ];

    const report = await accrueNFLPickEmChallengePoints();

    expect(store.applyCalls[0].requireCampaignCreatedBeforeOccurrence).toBe(true);
    expect(progressFor("camp-late")).toBe(0);
    expect(report.campaignUpdates).toBe(0);
    // Still stamped: the pick is processed, just not creditable.
    expect(store.picks[0].challenge_accrued_at).not.toBeNull();
  });

  it("keeps venues separate — venue A picks never credit a venue B campaign", async () => {
    store.campaigns.push({
      id: "camp-b",
      venueId: "venue-2",
      createdAtMs: Date.parse("2026-09-01T00:00:00.000Z"),
    });
    seedPicks({ id: "a1", venue_id: "venue-1" }, { id: "b1", venue_id: "venue-2" });

    await accrueNFLPickEmChallengePoints();

    expect(progressFor("camp-nfl", "user-1", "venue-1")).toBe(1);
    expect(progressFor("camp-nfl", "user-1", "venue-2")).toBe(0);
    expect(progressFor("camp-b", "user-1", "venue-2")).toBe(1);
    expect(progressFor("camp-b", "user-1", "venue-1")).toBe(0);
  });

  it("groups per user, so two users' picks accrue independently", async () => {
    seedPicks({ id: "u1a" }, { id: "u1b" }, { id: "u2a", user_id: "user-2" });

    await accrueNFLPickEmChallengePoints();

    expect(progressFor("camp-nfl", "user-1")).toBe(2);
    expect(progressFor("camp-nfl", "user-2")).toBe(1);
  });

  it("reports a stamp failure instead of re-accruing inside the same run", async () => {
    seedPicks({ id: "p1" });
    store.stampShouldFail = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const report = await accrueNFLPickEmChallengePoints();
    consoleError.mockRestore();

    expect(report.picksAccrued).toBe(1);
    expect(store.applyCalls).toHaveLength(1);
    expect(report.errors[0].message).toContain("stamp failed");
  });
});

/**
 * The main regression risk of Phase 6 is collateral damage to daily Pick 'Em,
 * which shares `pickem_picks` and the `settlePendingPickEmPicks` sweep. The
 * behavioral assertions above cover the sweep's read side; these are static
 * tripwires over lib/pickem.ts itself, because daily accrual runs behind a
 * player-initiated claim that no unit test in this repo can drive end-to-end.
 */
describe("daily Pick 'Em is untouched by NFL reward accrual", () => {
  const pickemSource = readFileSync(resolve(process.cwd(), "lib/pickem.ts"), "utf8");

  it("still accrues daily Pick 'Em points under gameType 'pickem'", () => {
    expect(pickemSource).toContain("applyChallengeCampaignPoints");
    expect(pickemSource).toContain('gameType: "pickem"');
  });

  it("keeps challenge accrual out of the shared settlement sweep", () => {
    const start = pickemSource.indexOf("export async function settlePendingPickEmPicks");
    expect(start).toBeGreaterThan(-1);
    const next = pickemSource.indexOf("\nexport async function", start + 1);
    const body = pickemSource.slice(start, next === -1 ? undefined : next);
    // Phase 6 deliberately chose a separate NFL-only sweep over an inline branch
    // here. If accrual ever moves into this function, the NFL sweep's marker no
    // longer guards it and the same pick can be counted twice.
    expect(body).not.toContain("applyChallengeCampaignPoints");
    expect(body).not.toContain("challenge_accrued_at");
  });
});

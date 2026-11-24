// Carousel data for the venue TV (docs/fire-tv-app-plan.md Phase 9 steps 5 and 7).
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

import {
  getVenueScreenCarousel,
  localDayBounds,
  summarizeVenuePicks,
  TV_CAROUSEL_DATA_ENABLED,
  tvPrizeHeadline,
} from "@/lib/venueScreenCarousel";
import { hasPointsTarget, isCampaignWindowOpen } from "@/lib/challengeCampaigns";
import { debugCarousel, EMPTY_CAROUSEL } from "@/lib/venueScreenCarouselShared";
import { applyVenueScreenDebugMode } from "@/lib/venueScreenDebug";
import type { VenueScreenState } from "@/lib/venueScreen";
import { parseVenueScreenDebugMode, VENUE_SCREEN_DEBUG_MODES } from "@/lib/venueScreenTiming";
import { TV_PICKEM_BOARD_SIZE } from "@/lib/tvSportsRelevance";
import { countVenueScreenStateRequest, resetVenueScreenUsageCounter } from "@/lib/venueScreenUsageCounter";

const now = Date.parse("2026-11-22T20:00:00.000Z");

describe("launch switch", () => {
  it("is on since the carousel screens shipped (Phase 11)", () => {
    expect(TV_CAROUSEL_DATA_ENABLED).toBe(true);
  });
});

describe("summarizeVenuePicks", () => {
  const today = { startMs: Date.parse("2026-11-22T05:00:00.000Z"), endMs: Date.parse("2026-11-23T05:00:00.000Z") };
  const row = (over: Record<string, unknown>) => ({
    user_id: "u1",
    sport_key: "nfl",
    game_id: "1392356__2026-11-22T18:00:00.000Z__Minnesota Vikings__Green Bay Packers",
    selected_side: "home" as const,
    status: "pending",
    starts_at: "2026-11-22T18:00:00.000Z",
    users: { username: "Ann" },
    ...over,
  });
  it("counts each side per game, keyed like the shared sports copy", () => {
    const { counts } = summarizeVenuePicks(
      [row({}), row({ user_id: "u2", selected_side: "away" }), row({ user_id: "u3" })],
      today,
    );
    expect(counts.get("/nfl/v1/games#1392356")).toEqual({ home: 2, away: 1 });
  });
  it("keeps only today's picks for the top 5, and reads the embedded username either way", () => {
    const { todaysPicks } = summarizeVenuePicks(
      [
        row({ status: "won" }),
        row({ user_id: "u2", status: "lost", users: [{ username: "Bo" }] }),
        row({ user_id: "u3", status: "won", starts_at: "2026-11-22T02:00:00.000Z" }), // last night
      ],
      today,
    );
    expect(todaysPicks).toEqual([
      { userId: "u1", username: "Ann", status: "won" },
      { userId: "u2", username: "Bo", status: "lost" },
    ]);
  });
});

describe("tvPrizeHeadline", () => {
  const base = {
    id: "p",
    name: "Regulars",
    venue_ids: [],
    reward_definition_id: null,
    prize_type: null,
    prize_kind: null,
    prize_menu_item: null,
    prize_menu_item_name: null,
    prize_discount_kind: null,
    prize_discount_value: null,
    prize_gift_certificate_amount: null,
    points_required_to_win: null,
  };
  it("says the prize the way its gift card does", () => {
    expect(tvPrizeHeadline({ ...base, prize_kind: "gift_card", prize_gift_certificate_amount: 25 })).toBe("$25 Gift Card");
    expect(tvPrizeHeadline({ ...base, prize_kind: "gift_card" })).toBe("Gift Card");
    expect(
      tvPrizeHeadline({ ...base, prize_kind: "menu_item", prize_menu_item: "appetizer", prize_discount_kind: "percent", prize_discount_value: 100 }),
    ).toBe("Free Appetizer");
    expect(tvPrizeHeadline({ ...base, prize_type: "free_appetizer" })).toBe("Free Appetizer");
    expect(tvPrizeHeadline(base)).toBeNull();
  });
});

describe("debug modes (Phase 9 step 7)", () => {
  const realIdle = {
    ok: true,
    mode: "idle",
    venue: { id: "v", name: "Bar" },
    liveTrivia: null,
    categoryBlitz: null,
    idle: { nextLiveTrivia: null, sponsorSlots: [], ...EMPTY_CAROUSEL },
    updatedAt: now,
  } as VenueScreenState;
  const idleOf = (mode: string) => {
    const state = applyVenueScreenDebugMode(realIdle, parseVenueScreenDebugMode(mode), now);
    if (state.mode !== "idle") throw new Error(`expected idle, got ${state.mode}`);
    return state.idle;
  };

  it("every new mode parses", () => {
    for (const mode of ["pregame-hour", "carousel", "carousel-weeknight", "carousel-empty"]) {
      expect(VENUE_SCREEN_DEBUG_MODES).toContain(mode);
      expect(parseVenueScreenDebugMode(mode)).toBe(mode);
    }
  });

  it("carousel fills every slide; the next game sits outside the pre-game hour", () => {
    const idle = idleOf("carousel");
    expect(idle.pickEm?.games.length).toBeGreaterThan(TV_PICKEM_BOARD_SIZE);
    expect(idle.pickEm?.leaders).toHaveLength(5);
    expect(idle.allTimeLeaderboard).toHaveLength(10);
    expect(idle.prizes).toHaveLength(3);
    expect(Date.parse(idle.nextLiveTrivia?.startsAt ?? "") - now).toBeGreaterThan(60 * 60_000);
  });

  it("carousel-weeknight is an NBA + NHL board; carousel-empty leaves only Get the app", () => {
    expect(new Set(idleOf("carousel-weeknight").pickEm?.games.map((game) => game.league))).toEqual(new Set(["NBA", "NHL"]));
    expect(idleOf("carousel-empty")).toEqual({ nextLiveTrivia: null, sponsorSlots: [], ...EMPTY_CAROUSEL });
  });

  it("fixtures keep missing scores unknown and Prize wording", () => {
    const games = debugCarousel("sunday", now).pickEm?.games ?? [];
    for (const game of games.filter((entry) => entry.status === "scheduled")) {
      expect(game.homeScore).toBeNull();
      expect(game.awayScore).toBeNull();
    }
    expect(readFileSync("lib/venueScreenCarouselShared.ts", "utf8")).not.toMatch(/"[^"]*\bReward\b[^"]*"/);
  });
});

describe("localDayBounds: the venue's real midnight (CR1.4, F21)", () => {
  it("half- and quarter-hour zones get midnight to the minute; New York and DST days still work", () => {
    const at = Date.parse("2026-11-24T10:07:00.000Z");
    expect(localDayBounds(at, "Asia/Kolkata")).toEqual({
      startMs: Date.parse("2026-11-23T18:30:00.000Z"),
      endMs: Date.parse("2026-11-24T18:30:00.000Z"),
    });
    expect(localDayBounds(at, "Asia/Kathmandu").startMs).toBe(Date.parse("2026-11-23T18:15:00.000Z"));
    expect(localDayBounds(at, "America/St_Johns").startMs).toBe(Date.parse("2026-11-24T03:30:00.000Z"));
    expect(localDayBounds(at, "America/New_York")).toEqual({
      startMs: Date.parse("2026-11-24T05:00:00.000Z"),
      endMs: Date.parse("2026-11-25T05:00:00.000Z"),
    });
    // 2026-11-01: New York falls back, a 25-hour day.
    const fallBack = localDayBounds(Date.parse("2026-11-01T16:00:00.000Z"), "America/New_York");
    expect(fallBack).toEqual({ startMs: Date.parse("2026-11-01T04:00:00.000Z"), endMs: Date.parse("2026-11-02T05:00:00.000Z") });
  });
});

describe("usage counter (Phase 9 step 2)", () => {
  it("logs one summary line per 10 minutes, with no venue ids", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    resetVenueScreenUsageCounter(now);
    countVenueScreenStateRequest({ mode: "idle", durationMs: 80, bytes: 1500 }, now + 1_000);
    countVenueScreenStateRequest({ mode: "idle", durationMs: 120, bytes: 2500 }, now + 2_000);
    expect(info).not.toHaveBeenCalled();
    countVenueScreenStateRequest({ mode: "live-trivia-pregame", durationMs: 40, bytes: 500 }, now + 10 * 60_000);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toBe(
      "[tv-state] minutes=10 requests=3 idle=2 live-trivia-pregame=1 avgMs=80 maxMs=120 avgBytes=1500 maxBytes=2500",
    );
    info.mockRestore();
  });
});

describe("TV Prizes slide: real targets, open prizes only (CR1.1)", () => {
  it("shows a points target only for progress + points_threshold", () => {
    expect(hasPointsTarget("progress", "points_threshold")).toBe(true);
    expect(hasPointsTarget("progress", null)).toBe(true);
    expect(hasPointsTarget("progress", "game_winner")).toBe(false);
    expect(hasPointsTarget("leaderboard", "points_threshold")).toBe(false);
    expect(hasPointsTarget("progress", "ranked_places")).toBe(false);
  });
  it("drops closed and not-yet-open prizes", () => {
    const nowMs = Date.parse("2026-11-24T12:00:00.000Z");
    const one = { scheduleType: "one_time" as const, recurringType: "none" as const };
    expect(isCampaignWindowOpen({ ...one, startDate: "2026-11-20", endDate: "2026-11-23" }, nowMs)).toBe(false);
    expect(isCampaignWindowOpen({ ...one, startDate: "2026-11-30", endDate: "2026-12-02" }, nowMs)).toBe(false);
    expect(isCampaignWindowOpen({ ...one, startDate: "2026-11-20", endDate: "2026-11-30" }, nowMs)).toBe(true);
    expect(isCampaignWindowOpen({ scheduleType: "recurring" as never, recurringType: "none" as const }, nowMs)).toBe(true);
  });
});

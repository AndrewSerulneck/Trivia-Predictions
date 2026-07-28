import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 0 of docs/nfl-pickem-reward-plan.md: challenge_campaigns.nfl_week_scope
// must round-trip through createChallengeCampaign -> listChallengeCampaigns
// unchanged. No validation logic lives here yet (Phase 3 owns that) — this
// only proves the column plumbing (select list, row mapper, insert row) is
// wired correctly end to end, the same way gameWinnerSlots was proven when
// that column was added.

type CampaignRow = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => ({
  campaigns: [] as CampaignRow[],
}));

const DEFAULT_ROW: Record<string, unknown> = {
  image_url: null,
  image_scale: 1,
  image_focus_x: 50,
  image_focus_y: 50,
  image_fit: "cover",
  venue_ids: [],
  schedule_type: "recurring",
  active_days: [],
  start_date: null,
  start_time: null,
  end_day: null,
  end_time: null,
  end_date: null,
  challenge_mode: "progress",
  leaderboard_display_limit: 10,
  leaderboard_tiebreaker: "first_to_score",
  point_multiplier: 1,
  points_required_to_win: 100,
  recurring_type: "none",
  display_order: null,
  winner_user_id: null,
  prize_type: null,
  prize_gift_certificate_amount: null,
  is_active: true,
  created_by_owner_id: null,
  win_condition: "points_threshold",
  winner_quota: 1,
  game_winner_slots: null,
  nfl_week_scope: null,
  reward_definition_id: null,
  prize_kind: null,
  prize_menu_item: null,
  prize_menu_item_name: null,
  prize_discount_kind: null,
  prize_discount_value: null,
};

const from = vi.hoisted(() =>
  vi.fn((table: string) => {
    let op: "insert" | "select" | null = null;
    let insertPayload: Record<string, unknown> | null = null;

    const builder = {
      insert(payload: Record<string, unknown>) {
        op = "insert";
        insertPayload = payload;
        return builder;
      },
      select() {
        if (!op) op = "select";
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      eq() {
        return builder;
      },
      is() {
        return builder;
      },
      or() {
        return builder;
      },
      async single() {
        if (table === "challenge_campaigns" && op === "insert" && insertPayload) {
          const row: CampaignRow = {
            ...DEFAULT_ROW,
            ...insertPayload,
            id: `camp-${store.campaigns.length + 1}`,
            created_at: new Date().toISOString(),
          };
          store.campaigns.push(row);
          return { data: row, error: null };
        }
        return { data: null, error: { message: "unsupported single()" } };
      },
      async returns() {
        if (table === "challenge_campaigns" && op === "select") {
          return { data: store.campaigns, error: null };
        }
        return { data: [], error: null };
      },
    };
    return builder;
  })
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from } }));

import { createChallengeCampaign, listChallengeCampaigns } from "@/lib/challengeCampaigns";
import type { NFLWeekScope } from "@/types";

beforeEach(() => {
  store.campaigns.length = 0;
  from.mockClear();
});

describe("challenge_campaigns.nfl_week_scope round trip", () => {
  it("carries an nfl-pickem campaign's week scope through create -> list unchanged", async () => {
    const nflWeekScope: NFLWeekScope = { kind: "weekly", season: 2026 };

    const created = await createChallengeCampaign({
      name: "NFL Pick 'Em Weekly Challenge",
      rules: "Get the most correct picks this week.",
      gameTypes: ["nfl-pickem"],
      nflWeekScope,
    });

    expect(created.gameTypes).toEqual(["nfl-pickem"]);
    expect(created.nflWeekScope).toEqual(nflWeekScope);

    const listed = await listChallengeCampaigns({ includeInactive: true, includeResolved: true });
    expect(listed).toHaveLength(1);
    expect(listed[0].gameTypes).toEqual(["nfl-pickem"]);
    expect(listed[0].nflWeekScope).toEqual(nflWeekScope);
  });

  it("round-trips a season-long scope with fromWeek", async () => {
    const nflWeekScope: NFLWeekScope = { kind: "season", season: 2026, fromWeek: 7 };

    await createChallengeCampaign({
      name: "NFL Pick 'Em Season Challenge",
      rules: "Most correct picks all season.",
      gameTypes: ["nfl-pickem"],
      nflWeekScope,
    });

    const listed = await listChallengeCampaigns({ includeInactive: true, includeResolved: true });
    expect(listed[0].nflWeekScope).toEqual(nflWeekScope);
  });

  it("defaults nflWeekScope to null for every non-NFL reward", async () => {
    await createChallengeCampaign({
      name: "Live Trivia Challenge",
      rules: "Get the most points.",
      gameTypes: ["live-trivia"],
    });

    const listed = await listChallengeCampaigns({ includeInactive: true, includeResolved: true });
    expect(listed[0].nflWeekScope).toBeNull();
  });
});

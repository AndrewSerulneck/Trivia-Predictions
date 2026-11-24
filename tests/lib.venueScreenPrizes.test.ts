// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let rows: Array<Record<string, unknown>> = [];
vi.mock("@/lib/supabaseAdmin", () => {
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "select", "eq", "is", "or", "order"]) chain[name] = () => chain;
  chain.limit = () => chain;
  chain.returns = () => Promise.resolve({ data: rows, error: null });
  return { supabaseAdmin: chain };
});

import { readPrizes } from "@/lib/venueScreenCarousel";

const prize = (over: Record<string, unknown>) => ({
  id: "p1",
  name: "Prize",
  reward_definition_id: null,
  venue_ids: [],
  prize_type: null,
  prize_kind: "menu_item",
  prize_menu_item: "appetizer",
  prize_menu_item_name: null,
  prize_discount_kind: "free",
  prize_discount_value: null,
  prize_gift_certificate_amount: null,
  points_required_to_win: 1,
  challenge_mode: "progress",
  win_condition: "points_threshold",
  schedule_type: "recurring",
  recurring_type: "none",
  start_date: null,
  start_time: null,
  end_date: null,
  end_time: null,
  ...over,
});

describe("readPrizes (CR1.1)", () => {
  beforeEach(() => {
    rows = [];
  });
  it("hides the placeholder target of game-winner and leaderboard prizes", async () => {
    rows = [
      prize({ id: "a", win_condition: "game_winner", points_required_to_win: 1 }),
      prize({ id: "b", challenge_mode: "leaderboard", points_required_to_win: 100 }),
      prize({ id: "c", points_required_to_win: 500 }),
    ];
    const out = await readPrizes("v1");
    expect(out?.map((p) => p.pointsRequired)).toEqual([null, null, 500]);
  });
  it("drops a one-time prize whose end date has passed", async () => {
    rows = [prize({ id: "old", schedule_type: "one_time", start_date: "2020-01-01", end_date: "2020-01-02" }), prize({ id: "ok" })];
    const out = await readPrizes("v1");
    expect(out?.map((p) => p.id)).toEqual(["ok"]);
  });
});

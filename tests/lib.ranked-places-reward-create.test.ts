import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/live-trivia-weekly-places-reward-plan.md Phase 3 — what createChallengeCampaign writes
// for a weekly places reward, the place-win notification, and the player panels' pinned
// "text only, never a gauge" rendering until Phase 4's standings card.

const read = (path: string): string => readFileSync(join(__dirname, "..", path), "utf8");

const writes = vi.hoisted(() => ({ insert: [] as Record<string, unknown>[] }));
const rpcResult = vi.hoisted(() => ({ data: [{ status: "awarded", winners_awarded: 2 }] as unknown, error: null as unknown }));
const createNotification = vi.hoisted(() => vi.fn(async () => undefined));

const from = vi.hoisted(() =>
  vi.fn((table: string) => {
    let payload: Record<string, unknown> = {};
    const builder = {
      insert(row: Record<string, unknown>) {
        writes.insert.push(row);
        payload = row;
        return builder;
      },
      select: () => builder,
      async single() {
        if (table !== "challenge_campaigns") return { data: null, error: { message: "unexpected table" } };
        return {
          data: { id: "camp-1", created_at: "2026-10-14T00:00:00Z", name: "R", rules: "r", winner_user_id: null, ...payload },
          error: null,
        };
      },
    };
    return builder;
  }),
);
const rpc = vi.hoisted(() => vi.fn(async () => rpcResult));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from, rpc } }));
vi.mock("@/lib/notifications", () => ({ createNotification }));

import { awardRankedCyclePlaces, createChallengeCampaign } from "@/lib/challengeCampaigns";
import type { RewardPlacePrize } from "@/types";

const giftCard = (place: number, amount: number): RewardPlacePrize => ({
  place,
  prizeKind: "gift_card",
  prizeGiftCertificateAmount: amount,
  prizeMenuItem: null,
  prizeMenuItemName: null,
  prizeDiscountKind: null,
  prizeDiscountValue: null,
  prizePosValueCents: null,
  prizePosDelivery: null,
});

beforeEach(() => {
  writes.insert.length = 0;
  createNotification.mockClear();
  rpc.mockClear();
});

describe("createChallengeCampaign — place_prizes / min_players", () => {
  it("writes the ladder in its stored shape and the minimum, and reads them back", async () => {
    const campaign = await createChallengeCampaign({
      name: "Live Trivia Challenge",
      rules: "Finish top 2.",
      winCondition: "ranked_places",
      recurringType: "weekly",
      activeDays: ["wed", "thu", "fri"],
      winnerQuota: 2,
      placePrizes: [giftCard(1, 30), giftCard(2, 20)],
      minPlayers: 4,
    });
    const row = writes.insert[0];
    expect(row.win_condition).toBe("ranked_places");
    expect(row.prize_kind).toBeNull();
    expect(row.min_players).toBe(4);
    expect(row.place_prizes).toEqual([
      expect.objectContaining({ place: 1, prize_kind: "gift_card", prize_gift_certificate_amount: 30 }),
      expect.objectContaining({ place: 2, prize_kind: "gift_card", prize_gift_certificate_amount: 20 }),
    ]);
    expect(campaign.placePrizes?.map((prize) => prize.prizeGiftCertificateAmount)).toEqual([30, 20]);
    expect(campaign.minPlayers).toBe(4);
  });

  it("never sends either column for an ordinary reward (the database check pairs them with the win condition)", async () => {
    await createChallengeCampaign({ name: "R", rules: "Earn 500.", prizeKind: "gift_card", prizeGiftCertificateAmount: 25 });
    await createChallengeCampaign({ name: "R", rules: "Win.", winCondition: "game_winner", placePrizes: [], minPlayers: null });
    for (const row of writes.insert) {
      expect(row).not.toHaveProperty("place_prizes");
      expect(row).not.toHaveProperty("min_players");
    }
  });
});

describe("awardRankedCyclePlaces — the place-win notification", () => {
  it("names each winner's place and that place's prize", async () => {
    await awardRankedCyclePlaces({
      campaign: { id: "camp-1", name: "Live Trivia Challenge", placePrizes: [giftCard(1, 30), giftCard(2, 20)] },
      venueId: "venue-1",
      cycleStart: new Date("2026-10-07T04:00:00.000Z"),
      places: [
        { place: 1, userId: "u-a", totalPoints: 90, reachedAt: "2026-10-09T02:00:00Z" },
        { place: 2, userId: "u-b", totalPoints: 10, reachedAt: "2026-10-09T02:05:00Z" },
      ],
      participantCount: 2,
      now: new Date("2026-10-10T03:00:00.000Z"),
    });
    expect(createNotification.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      expect.objectContaining({
        userId: "u-a",
        linkUrl: "/redeem-prizes",
        message: 'You finished 1st in "Live Trivia Challenge" and won a $30 gift card! Tap here to view your coupon before it expires.',
      }),
      expect.objectContaining({
        userId: "u-b",
        message: 'You finished 2nd in "Live Trivia Challenge" and won a $20 gift card! Tap here to view your coupon before it expires.',
      }),
    ]);
  });
});

describe("player panels — a weekly places reward shows text only until Phase 4", () => {
  it("the venue Rewards card never draws a points gauge for it", () => {
    expect(read("components/venue/VenueChallengesPanel.tsx")).toContain(
      'challenge.winCondition === "game_winner" || challenge.winCondition === "ranked_places" ? (',
    );
  });

  it("the reward Details popup has no gauge and no 'N of 3 rewards left' line for it", () => {
    const src = read("components/venue/VenueHubClient.tsx");
    expect(src).toContain('selectedChallenge.winCondition !== "ranked_places" &&');
    expect(src).toMatch(/selectedChallenge\.winCondition === "ranked_places"\s*\?\s*""/);
  });

  it("the Redeem Prizes 'Active Rewards' list has no gauge for it", () => {
    const src = read("components/challenges/ChallengeRedeemPanel.tsx");
    expect(src).toContain('const isRankedPlaces = campaign.winCondition === "ranked_places";');
    expect(src).toContain(") : isRankedPlaces ? null : (");
  });
});

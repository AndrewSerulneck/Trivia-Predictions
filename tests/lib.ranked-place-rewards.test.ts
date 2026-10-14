import { describe, expect, it } from "vitest";

import {
  normalizePlacePrizes,
  orderWeekStandings,
  rankedPlacesRpcPayload,
  rankWeekPlaces,
  serializePlacePrizes,
  type WeekPlayerTotal,
} from "@/lib/rankedPlaceRewards";
import type { RewardPlacePrize } from "@/types";

// docs/live-trivia-weekly-places-reward-plan.md §5b — the one home of who places where.

const t = (userId: string, totalPoints: number, reachedAt: string | null): WeekPlayerTotal => ({
  userId,
  totalPoints,
  reachedAt,
});

describe("rankWeekPlaces", () => {
  it("ranks by total points, highest first", () => {
    const result = rankWeekPlaces({
      totals: [t("b", 140, "2026-08-06T23:00:00Z"), t("a", 410, "2026-08-07T23:00:00Z"), t("c", 50, "2026-08-05T23:00:00Z")],
      placeCount: 3,
    });
    expect(result.outcome).toBe("awarded");
    expect(result.places.map((p) => [p.place, p.userId, p.totalPoints])).toEqual([
      [1, "a", 410],
      [2, "b", 140],
      [3, "c", 50],
    ]);
    expect(result.tiebreakUnresolved).toBe(false);
  });

  it("breaks a tie by who reached the total first (D1)", () => {
    const result = rankWeekPlaces({
      totals: [t("late", 200, "2026-10-14T23:59:00Z"), t("early", 200, "2026-10-14T23:30:00Z")],
      placeCount: 3,
    });
    expect(result.places.map((p) => p.userId)).toEqual(["early", "late"]);
    expect(result.tiebreakUnresolved).toBe(false);
  });

  it("excludes players with 0 points but counts them as participants (D2)", () => {
    const result = rankWeekPlaces({
      totals: [t("scorer", 110, "2026-08-28T23:00:00Z"), t("zero", 0, null)],
      placeCount: 3,
    });
    expect(result.places.map((p) => p.userId)).toEqual(["scorer"]);
    expect(result.participantCount).toBe(2);
  });

  it("pays every filled place when there are fewer scorers than places", () => {
    const result = rankWeekPlaces({ totals: [t("only", 50, "2026-08-14T23:00:00Z")], placeCount: 3 });
    expect(result.outcome).toBe("awarded");
    expect(result.places).toHaveLength(1);
    expect(result.places[0]).toMatchObject({ place: 1, userId: "only" });
  });

  it("takes only placeCount places", () => {
    const result = rankWeekPlaces({
      totals: [t("a", 30, "2026-08-01T00:00:00Z"), t("b", 20, "2026-08-01T00:00:00Z"), t("c", 10, "2026-08-01T00:00:00Z")],
      placeCount: 2,
    });
    expect(result.places.map((p) => p.userId)).toEqual(["a", "b"]);
  });

  it("reports no_scorers when nobody scored", () => {
    expect(rankWeekPlaces({ totals: [t("zero", 0, null)], placeCount: 3 })).toEqual({
      places: [],
      participantCount: 1,
      outcome: "no_scorers",
      tiebreakUnresolved: false,
    });
    expect(rankWeekPlaces({ totals: [], placeCount: 3 }).outcome).toBe("no_scorers");
  });

  it("falls back to user id and flags it when total and time are both equal", () => {
    const same = "2026-10-14T23:30:00Z";
    const result = rankWeekPlaces({ totals: [t("zz", 100, same), t("aa", 100, same)], placeCount: 3 });
    expect(result.places.map((p) => p.userId)).toEqual(["aa", "zz"]);
    expect(result.tiebreakUnresolved).toBe(true);
  });

  it("flags a fallback at the boundary between the last paid place and the first left out", () => {
    const same = "2026-10-14T23:30:00Z";
    const result = rankWeekPlaces({ totals: [t("a", 300, same), t("b", 100, same), t("c", 100, same)], placeCount: 2 });
    expect(result.places.map((p) => p.userId)).toEqual(["a", "b"]);
    expect(result.tiebreakUnresolved).toBe(true);
  });

  it("does not flag an identical tie below the paid places", () => {
    const same = "2026-10-14T23:30:00Z";
    const result = rankWeekPlaces({
      totals: [t("a", 300, same), t("b", 200, same), t("c", 50, same), t("d", 50, same)],
      placeCount: 2,
    });
    expect(result.tiebreakUnresolved).toBe(false);
  });

  describe("partner minimum", () => {
    const totals = [t("a", 300, "2026-10-14T23:00:00Z"), t("b", 0, null)];

    it("pays nobody when fewer players took part than the minimum", () => {
      expect(rankWeekPlaces({ totals, placeCount: 3, minPlayers: 3 })).toEqual({
        places: [],
        participantCount: 2,
        outcome: "below_minimum",
        tiebreakUnresolved: false,
      });
    });

    it("counts non-scoring participants toward the minimum", () => {
      const result = rankWeekPlaces({ totals, placeCount: 3, minPlayers: 2 });
      expect(result.outcome).toBe("awarded");
      expect(result.places.map((p) => p.userId)).toEqual(["a"]);
    });

    it("null means no minimum", () => {
      expect(rankWeekPlaces({ totals, placeCount: 3, minPlayers: null }).outcome).toBe("awarded");
    });
  });

  it("merges duplicate rows for one player", () => {
    const result = rankWeekPlaces({
      totals: [t("a", 50, "2026-10-14T23:00:00Z"), t("a", 60, "2026-10-16T23:00:00Z"), t("b", 100, "2026-10-15T23:00:00Z")],
      placeCount: 3,
    });
    expect(result.participantCount).toBe(2);
    expect(result.places[0]).toMatchObject({ userId: "a", totalPoints: 110, reachedAt: "2026-10-16T23:00:00Z" });
  });

  it("orderWeekStandings returns every scorer in place order", () => {
    expect(
      orderWeekStandings([t("x", 10, "2026-10-14T23:00:00Z"), t("y", 0, null), t("z", 40, "2026-10-14T23:00:00Z")]).map(
        (r) => r.userId,
      ),
    ).toEqual(["z", "x"]);
  });

  it("builds the RPC payload", () => {
    const { places } = rankWeekPlaces({ totals: [t("u1", 30, "2026-10-14T23:00:00Z")], placeCount: 1 });
    expect(rankedPlacesRpcPayload(places)).toEqual([{ user_id: "u1", place: 1, points: 30 }]);
  });
});

describe("place_prizes shape", () => {
  const ladder: RewardPlacePrize[] = [
    {
      place: 2,
      prizeKind: "menu_item",
      prizeGiftCertificateAmount: null,
      prizeMenuItem: "appetizer",
      prizeMenuItemName: null,
      prizeDiscountKind: "percent",
      prizeDiscountValue: 100,
      prizePosValueCents: null,
      prizePosDelivery: null,
    },
    {
      place: 1,
      prizeKind: "gift_card",
      prizeGiftCertificateAmount: 30,
      prizeMenuItem: null,
      prizeMenuItemName: null,
      prizeDiscountKind: null,
      prizeDiscountValue: null,
      prizePosValueCents: null,
      prizePosDelivery: null,
    },
  ];

  it("round-trips, ordered 1st first", () => {
    const stored = serializePlacePrizes(ladder);
    expect(stored.map((p) => p.place)).toEqual([1, 2]);
    expect(stored[0]).toMatchObject({ prize_kind: "gift_card", prize_gift_certificate_amount: 30 });
    expect(normalizePlacePrizes(JSON.parse(JSON.stringify(stored)))).toEqual([ladder[1], ladder[0]]);
  });

  it("rejects anything that is not a 1..n ladder of known prizes", () => {
    expect(normalizePlacePrizes(null)).toBeNull();
    expect(normalizePlacePrizes({})).toBeNull();
    expect(normalizePlacePrizes([])).toBeNull();
    expect(normalizePlacePrizes([{ place: 2, prize_kind: "gift_card" }])).toBeNull();
    expect(normalizePlacePrizes([{ place: 1, prize_kind: "wine" }])).toBeNull();
    expect(
      normalizePlacePrizes([1, 2, 3, 4].map((place) => ({ place, prize_kind: "gift_card", prize_gift_certificate_amount: 5 }))),
    ).toBeNull();
    expect(
      normalizePlacePrizes([{ place: 1, prize_kind: "gift_card" }, { place: 1, prize_kind: "gift_card" }]),
    ).toBeNull();
  });

  it("never reads a forged delivery as a gift card on the stored side", () => {
    const [prize] = normalizePlacePrizes([{ place: 1, prize_kind: "gift_card", prize_pos_delivery: "bogus" }]) ?? [];
    expect(prize.prizePosDelivery).toBeNull();
  });
});

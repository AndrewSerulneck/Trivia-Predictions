// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import type { ChallengeCampaignWin } from "@/types";

// Phase 4 of docs/live-trivia-weekly-places-reward-plan.md: a weekly places coupon says its place.

const { PrizeWalletPanel } = await import("@/components/prizes/PrizeWalletPanel");

const win = (overrides: Partial<ChallengeCampaignWin> = {}): ChallengeCampaignWin => ({
  challengeId: "camp-1",
  redemptionId: "red-1",
  venueId: "venue-1",
  challengeName: "Weekly Trivia Champions",
  challengeRules: "",
  winnerUserId: "user-1",
  prizeKind: "gift_card",
  prizeGiftCertificateAmount: 30,
  prizeExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  claimedAt: new Date().toISOString(),
  place: 1,
  ...overrides,
});

const installFetch = (wins: ChallengeCampaignWin[]) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const body = String(input).startsWith("/api/challenge-campaigns/redeem") ? { ok: true, wins } : { ok: true, wins: [] };
      return new Response(JSON.stringify(body));
    }),
  );

beforeEach(() => {
  window.localStorage.setItem("tp:user-id", "user-1");
  window.localStorage.setItem("tp:venue-id", "venue-1");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("PrizeWalletPanel — weekly places coupons", () => {
  it("shows '1st place' from the coupon's own place when the reward's sentence is gone (edited or deleted reward)", async () => {
    installFetch([win({ place: 1 }), win({ redemptionId: "red-2", place: 3, prizeGiftCertificateAmount: 10 })]);
    render(createElement(PrizeWalletPanel));
    expect(await screen.findByText("1st place: Weekly Trivia Champions")).not.toBeNull();
    expect(screen.getByText("3rd place: Weekly Trivia Champions")).not.toBeNull();
  });

  it("keeps the reward's own sentence when it has one (it names the place already)", async () => {
    installFetch([win({ place: 2, winDescription: "You finished 2nd in Live Trivia the week of Oct 7" })]);
    render(createElement(PrizeWalletPanel));
    expect(await screen.findByText("You finished 2nd in Live Trivia the week of Oct 7")).not.toBeNull();
  });

  it("a coupon with no place reads exactly as before", async () => {
    installFetch([win({ place: null })]);
    render(createElement(PrizeWalletPanel));
    expect(await screen.findByText("Won from: Weekly Trivia Champions")).not.toBeNull();
  });
});

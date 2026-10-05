// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { formatCouponDate } from "@/lib/liveCouponClock";
import type { ChallengeCampaignWin } from "@/types";

// docs/reward-live-redemption-plan.md Phase 2, end to end at the wallet: the list stays calm, the
// coupon shown to staff (RedeemModal) is live — server time, guest, venue — and Phase 1's
// once-only 409 never shows a success flourish. Real timers + a fake fetch.

const { PrizeWalletPanel } = await import("@/components/prizes/PrizeWalletPanel");

const DAY_MS = 86_400_000;
// A server clock three days ahead of this machine, so the test can tell whose time is on screen.
const serverNowMs = () => Date.now() + 3 * DAY_MS;

const win = (overrides: Partial<ChallengeCampaignWin> = {}): ChallengeCampaignWin => ({
  challengeId: "camp-1",
  redemptionId: "red-1",
  venueId: "venue-1",
  challengeName: "Live Trivia Challenge",
  challengeRules: "Win the Live Trivia game",
  winnerUserId: "user-1",
  prizeKind: "gift_card",
  prizeGiftCertificateAmount: 25,
  prizeExpiresAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
  claimedAt: new Date().toISOString(),
  winDescription: "You won Live Trivia on Tue, Sep 29",
  ...overrides,
});

type RedeemReply = { status: number; body: Record<string, unknown> };

const installFetch = (walletWins: ChallengeCampaignWin[], redeem: RedeemReply, walletServerNow = serverNowMs()) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (url.startsWith("/api/prizes/redeem-challenge")) return reply(redeem.status, redeem.body);
    if (url.startsWith("/api/challenge-campaigns/redeem")) {
      return reply(200, { ok: true, wins: walletWins, serverNowMs: walletServerNow, venueName: "The Tap Room" });
    }
    return reply(200, { ok: true, wins: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
};

const openCoupon = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Redeem" }));
  return screen.getByRole("dialog", { name: "Confirm redemption" });
};

beforeEach(() => {
  window.localStorage.setItem("tp:user-id", "user-1");
  window.localStorage.setItem("tp:venue-id", "venue-1");
  window.localStorage.setItem("tp:username", "Rick");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("PrizeWalletPanel — the live coupon", () => {
  it("keeps the wallet list calm: nothing moves until a coupon is opened", async () => {
    installFetch([win()], { status: 200, body: { ok: true } });
    const { container } = render(createElement(PrizeWalletPanel));
    await screen.findByRole("button", { name: "Redeem" });
    expect(container.querySelector("[data-live-coupon]")).toBeNull();
    expect(container.querySelector("[data-live-coupon-band]")).toBeNull();
    expect(container.querySelector("[data-live-coupon-clock]")).toBeNull();
  });

  it("opens the coupon live: server time and date, the guest, the venue, and the staff tip", async () => {
    const serverNow = serverNowMs();
    installFetch([win()], { status: 200, body: { ok: true } }, serverNow);
    render(createElement(PrizeWalletPanel));

    const dialog = await openCoupon();
    const live = within(dialog).getByRole("group", { name: "Live coupon" });

    expect(within(live).getByText("GIFT CARD")).not.toBeNull();
    expect(live.querySelector("[data-live-coupon-date]")?.textContent).toBe(formatCouponDate(serverNow));
    expect(live.querySelector("[data-live-coupon-clock]")?.textContent).toMatch(/^\d{1,2}:\d{2}:\d{2} (AM|PM)$/);
    expect(live.querySelector("[data-live-coupon-holder]")?.textContent).toBe("Rick · The Tap Room");
    expect(within(live).getByText(/Staff: tap the coupon/)).not.toBeNull();
    // Plan A's "what you won it for" line is still on the coupon.
    expect(within(live).getByText("You won Live Trivia on Tue, Sep 29")).not.toBeNull();
  });

  it("makes zero extra requests to go live", async () => {
    const calls = installFetch([win()], { status: 200, body: { ok: true } });
    render(createElement(PrizeWalletPanel));
    await openCoupon();
    expect(calls.map((call) => call.url.split("?")[0])).toEqual(["/api/prizes", "/api/challenge-campaigns/redeem"]);
  });

  it("falls back to the phone's clock when an older server sends no time or venue", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        const body = url.startsWith("/api/challenge-campaigns/redeem") ? { ok: true, wins: [win()] } : { ok: true, wins: [] };
        return new Response(JSON.stringify(body));
      }),
    );
    render(createElement(PrizeWalletPanel));
    const dialog = await openCoupon();
    const live = within(dialog).getByRole("group", { name: "Live coupon" });
    expect(live.querySelector("[data-live-coupon-date]")?.textContent).toBe(formatCouponDate(Date.now()));
    expect(live.querySelector("[data-live-coupon-holder]")?.textContent).toBe("Rick");
  });
});

describe("PrizeWalletPanel — confirming a live coupon", () => {
  it("sends the exact coupon, then shows Redeemed! and drops the live coupon", async () => {
    const calls = installFetch([win()], { status: 200, body: { ok: true, result: { redeemed: true } } });
    const { container } = render(createElement(PrizeWalletPanel));
    await openCoupon();

    fireEvent.click(screen.getByRole("button", { name: "Confirm Redemption" }));

    expect(await screen.findByText("Redeemed!")).not.toBeNull();
    expect(container.ownerDocument.querySelector("[data-live-coupon]")).toBeNull();
    const post = calls.find((call) => call.url === "/api/prizes/redeem-challenge");
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      userId: "user-1",
      venueId: "venue-1",
      challengeId: "camp-1",
      redemptionId: "red-1",
    });
  });

  it("an already-redeemed 409 closes the live coupon, refreshes the wallet, and shows NO success flourish", async () => {
    const calls = installFetch([win()], {
      status: 409,
      body: { ok: false, code: "already_redeemed", error: "This prize was already redeemed." },
    });
    const { container } = render(createElement(PrizeWalletPanel));
    await openCoupon();

    fireEvent.click(screen.getByRole("button", { name: "Confirm Redemption" }));

    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(screen.getAllByRole("alert")[0].textContent).toBe("This prize was already redeemed.");
    expect(screen.queryByText("Redeemed!")).toBeNull();
    // A spent coupon must not stay up looking live to staff.
    expect(screen.queryByRole("dialog", { name: "Confirm redemption" })).toBeNull();
    expect(container.ownerDocument.querySelector("[data-live-coupon]")).toBeNull();
    expect(calls.filter((call) => call.url.startsWith("/api/challenge-campaigns/redeem")).length).toBe(2);
  });

  it("a non-409 failure keeps the live coupon up with the message so the guest can retry", async () => {
    installFetch([win()], { status: 503, body: { ok: false, error: "Prize redemption is temporarily unavailable." } });
    render(createElement(PrizeWalletPanel));
    const dialog = await openCoupon();

    fireEvent.click(screen.getByRole("button", { name: "Confirm Redemption" }));

    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(screen.queryByText("Redeemed!")).toBeNull();
    expect(within(dialog).getByRole("group", { name: "Live coupon" })).not.toBeNull();
  });
});

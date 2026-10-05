// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PosConnectionsSheet, POS_RESULT_MESSAGES } from "@/components/owner/pos/PosConnectionsSheet";
import type { PosConnectionStatus } from "@/lib/pos/types";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";
import type { ChallengeCampaignWin } from "@/types";

// docs/pos-rewards-integration-plan.md Phase 2 — what a guest and a partner see:
//   * the prize wallet's Square path (offer → "Get my Square gift card" → number + barcode;
//     an issued card reopens straight onto its number; "Redeem the normal way" still works);
//   * the Point of Sale sheet's connect result, location picker and two-tap Disconnect.
// createElement instead of JSX (*.test.ts glob).

const { PrizeWalletPanel } = await import("@/components/prizes/PrizeWalletPanel");

const DAY_MS = 86_400_000;
const GIFT_CARD = { gan: "7783 3200 1234 5678", amountCents: 2500, balanceCents: 2500, state: "ACTIVE" };

const win = (overrides: Partial<ChallengeCampaignWin> = {}): ChallengeCampaignWin => ({
  challengeId: "camp-1",
  redemptionId: "red-1",
  venueId: "venue-1",
  challengeName: "Live Trivia Challenge",
  challengeRules: "",
  winnerUserId: "user-1",
  prizeKind: "gift_card",
  prizeGiftCertificateAmount: 25,
  prizeExpiresAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
  claimedAt: new Date().toISOString(),
  ...overrides,
});

const installFetch = (wins: ChallengeCampaignWin[], giftCardReply: { status: number; body: unknown }) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
      if (url.startsWith("/api/prizes/square-gift-card")) return reply(giftCardReply.status, giftCardReply.body);
      if (url.startsWith("/api/challenge-campaigns/redeem")) return reply(200, { ok: true, wins, serverNowMs: Date.now(), venueName: "The Tap Room" });
      return reply(200, { ok: true, wins: [] });
    }),
  );
  return calls;
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

describe("Prize wallet — Square gift card", () => {
  it("offers the Square card, creates it on tap, and shows the number + barcode inside the live frame", async () => {
    const calls = installFetch([win({ squareGiftCard: "available" })], { status: 200, body: { ok: true, giftCard: GIFT_CARD } });
    render(createElement(PrizeWalletPanel));
    fireEvent.click(await screen.findByRole("button", { name: "Redeem" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm redemption" });
    expect(within(dialog).getByText("Pay with a Square gift card")).not.toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Confirm Redemption" })).toBeNull();
    expect(calls.some((c) => c.url.startsWith("/api/prizes/square-gift-card"))).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "Get my Square gift card" }));
    expect(await within(dialog).findByLabelText("Gift card number")).not.toBeNull();
    expect(within(dialog).getByLabelText("Gift card number").textContent).toBe("7783 3200 1234 5678");
    expect(within(dialog).getByRole("img", { name: "Gift card barcode" })).not.toBeNull();
    expect(within(dialog).getByText("$25.00 left")).not.toBeNull();
    expect(dialog.querySelector("[data-live-coupon] [data-square-gift-card]")).not.toBeNull();

    const post = calls.find((c) => c.url.startsWith("/api/prizes/square-gift-card"));
    expect(JSON.parse(String(post?.init?.body))).toEqual({ userId: "user-1", venueId: "venue-1", redemptionId: "red-1" });
    // The number lives only in component state — never in storage.
    expect(JSON.stringify({ ...window.localStorage })).not.toContain("7783");
  });

  it("still lets staff redeem the normal way before a card exists", async () => {
    installFetch([win({ squareGiftCard: "available" })], { status: 200, body: { ok: true, giftCard: GIFT_CARD } });
    render(createElement(PrizeWalletPanel));
    fireEvent.click(await screen.findByRole("button", { name: "Redeem" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm redemption" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Redeem the normal way/ }));
    expect(within(dialog).getByRole("button", { name: "Confirm Redemption" })).not.toBeNull();
  });

  it("an issued card shows 'Show gift card' in the list — even past the coupon's expiry — and opens onto its number", async () => {
    const calls = installFetch(
      [win({ squareGiftCard: "issued", prizeRedeemedAt: new Date().toISOString(), prizeExpiresAt: new Date(Date.now() - DAY_MS).toISOString() })],
      { status: 200, body: { ok: true, giftCard: { ...GIFT_CARD, balanceCents: 900 } } },
    );
    render(createElement(PrizeWalletPanel));
    fireEvent.click(await screen.findByRole("button", { name: "Show gift card" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm redemption" });
    expect(await within(dialog).findByText("$9.00 left")).not.toBeNull();
    expect(calls.filter((c) => c.url.startsWith("/api/prizes/square-gift-card"))).toHaveLength(1);
  });

  it("a spent card reads 'Used'", async () => {
    installFetch([win({ squareGiftCard: "used", prizeRedeemedAt: new Date().toISOString() })], { status: 200, body: {} });
    render(createElement(PrizeWalletPanel));
    expect(await screen.findByText("Used")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Show gift card" })).toBeNull();
  });

  it("closes and explains when the coupon was already redeemed the normal way", async () => {
    installFetch([win({ squareGiftCard: "available" })], { status: 409, body: { ok: false, code: "already_redeemed", error: "This prize was already redeemed." } });
    render(createElement(PrizeWalletPanel));
    fireEvent.click(await screen.findByRole("button", { name: "Redeem" }));
    fireEvent.click(screen.getByRole("button", { name: "Get my Square gift card" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("This prize was already redeemed.")).not.toBeNull();
  });

  it("offers Try again when Square is unreachable", async () => {
    installFetch([win({ squareGiftCard: "available" })], { status: 502, body: { ok: false, code: "square_error", error: "Couldn't reach Square right now. Please try again in a minute." } });
    render(createElement(PrizeWalletPanel));
    fireEvent.click(await screen.findByRole("button", { name: "Redeem" }));
    fireEvent.click(screen.getByRole("button", { name: "Get my Square gift card" }));
    expect(await screen.findByRole("button", { name: "Try again" })).not.toBeNull();
  });
});

// ── Partner: Point of Sale sheet ─────────────────────────────────────────────────────────

const fakeNav = (): UseOwnerSheetResult => ({
  sheet: "pos",
  step: null,
  displayStepFor: () => null,
  openSheet: vi.fn(),
  goToStep: vi.fn(),
  correctStep: vi.fn(),
  goBack: vi.fn(),
  closeSheet: vi.fn(),
});

const VENUE = { id: "venue-1", name: "The Pub" };

const square = (overrides: Partial<PosConnectionStatus>): PosConnectionStatus => ({
  provider: "square",
  label: "Square",
  pitch: "pitch",
  state: "connected",
  merchantName: "Pub LLC",
  connectedAt: "2026-10-05T00:00:00Z",
  ...overrides,
});

const routeFetch = (routes: Record<string, unknown>) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
      return new Response(JSON.stringify(key ? routes[key] : {}), { status: 200 });
    }),
  );
  return calls;
};

describe("Point of Sale sheet — Square", () => {
  it("shows the connect result sentence", async () => {
    routeFetch({ "/api/owner/pos?": { ok: true, statuses: [square({})] } });
    render(createElement(PosConnectionsSheet, { nav: fakeNav(), venue: VENUE, posResult: "denied" }));
    expect(screen.getByText(POS_RESULT_MESSAGES.denied.text).getAttribute("role")).toBe("status");
    expect(await screen.findByText(/Menu-item prizes keep the normal coupon/)).not.toBeNull();
  });

  it("asks a multi-location account which location issues gift cards, then reloads", async () => {
    const calls = routeFetch({
      "/api/owner/pos/square/locations?": { ok: true, locations: [{ id: "L1", name: "Main", address: "1 Main St" }, { id: "L2", name: "Patio", address: null }] },
      "/api/owner/pos/square/locations": { ok: true },
      "/api/owner/pos?": { ok: true, statuses: [square({ needsLocation: true })] },
    });
    render(createElement(PosConnectionsSheet, { nav: fakeNav(), venue: VENUE }));
    const select = await screen.findByLabelText("Which location issues gift cards?");
    fireEvent.change(select, { target: { value: "L2" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this location" }));
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith("/api/owner/pos?"))).toHaveLength(2));
    const save = calls.find((c) => c.init?.method === "POST");
    expect(JSON.parse(String(save?.init?.body))).toEqual({ venueId: "venue-1", locationId: "L2" });
  });

  it("Disconnect needs two taps", async () => {
    const calls = routeFetch({ "/api/owner/pos/square/disconnect": { ok: true }, "/api/owner/pos?": { ok: true, statuses: [square({})] } });
    render(createElement(PosConnectionsSheet, { nav: fakeNav(), venue: VENUE }));
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    expect(calls.some((c) => c.url.includes("disconnect"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Tap again to disconnect" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("disconnect"))).toBe(true));
  });
});

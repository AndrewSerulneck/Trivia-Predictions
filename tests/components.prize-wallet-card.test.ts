// @vitest-environment jsdom
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ChallengeCampaignWin } from "@/types";
import { findAllPrizeCardActions, findPrizeCardAction, flipPrizeCards } from "@/tests/helpers/prizeCardBack";

// docs/prize-gift-card-redesign-plan.md Phase 3: Redeem Prizes draws every prize as the one
// PrizeCard, with one muted line and one white action under it. Which button shows is unchanged.
// createElement instead of JSX (*.test.ts glob).

const { PrizeWalletPanel } = await import("@/components/prizes/PrizeWalletPanel");
const { PRIZE_CARD } = await import("@/lib/themeTokens");

const DAY_MS = 86_400_000;

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

const installFetch = (wins: ChallengeCampaignWin[], venueName: string | null = "The Tap Room") =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.startsWith("/api/challenge-campaigns/redeem")
        ? { ok: true, wins, serverNowMs: Date.now(), venueName }
        : { ok: true, wins: [] };
      return new Response(JSON.stringify(body));
    }),
  );

const cards = (root: ParentNode = document) => Array.from(root.querySelectorAll("[data-prize-card]"));

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

describe("Redeem Prizes — every prize is the one gift card", () => {
  it("draws gift cards, menu items and every legacy prize as PrizeCard", async () => {
    installFetch([
      win({ redemptionId: "a", prizeGiftCertificateAmount: 25 }),
      win({ redemptionId: "b", prizeKind: "menu_item", prizeGiftCertificateAmount: null, prizeMenuItem: "appetizer", prizeDiscountKind: "percent", prizeDiscountValue: 100 }),
      win({ redemptionId: "c", prizeKind: null, prizeType: "wine_bottle", prizeGiftCertificateAmount: null }),
      win({ redemptionId: "d", prizeKind: null, prizeType: "free_appetizer", prizeGiftCertificateAmount: null }),
      win({ redemptionId: "e", prizeKind: null, prizeType: "gift_certificate", prizeGiftCertificateAmount: 10 }),
    ]);
    render(createElement(PrizeWalletPanel));
    await findAllPrizeCardActions("Redeem");
    expect(cards().map((card) => card.querySelector("[data-prize-card-headline]")?.textContent)).toEqual([
      "$25",
      "Free Appetizer",
      "Bottle of Wine",
      "Free Appetizer",
      "$10",
    ]);
    // The venue comes from the wallet response — zero extra requests.
    expect(cards()[0].querySelector("[data-prize-card-venue]")?.textContent).toBe("The Tap Room");
    expect(screen.getAllByRole("button", { name: "Redeem" })).toHaveLength(5);
  });

  it("shows no venue line (never an id) when the wallet sent no venue name", async () => {
    installFetch([win()], null);
    render(createElement(PrizeWalletPanel));
    await findPrizeCardAction("Redeem");
    expect(cards()[0].querySelector("[data-prize-card-venue]")?.textContent).toBe("");
  });

  it("puts the expiry and 'Tap the card for details' in one muted line under the card (plan §2.8)", async () => {
    installFetch([win({ winDescription: "You won Live Trivia on Tue, Sep 29", prizeExpiresAt: new Date(Date.now() + 12 * 3_600_000).toISOString() })]);
    render(createElement(PrizeWalletPanel));
    await flipPrizeCards();
    const item = document.querySelector("[data-prize-wallet-item]") as HTMLElement;
    const meta = item.querySelector(":scope > div:last-child") as HTMLElement;
    expect(meta.textContent).toBe("Expires today! · Tap the card for details");
    expect(within(meta).getByText("Expires today!").className).toContain("text-red-400");
    // What it was won for moved onto the back of the card.
    const back = item.querySelector("[data-prize-card-back]") as HTMLElement;
    expect(meta.textContent).not.toContain("You won Live Trivia");
    expect(within(back).getByText("You won Live Trivia on Tue, Sep 29")).not.toBeNull();
    // "Awarded {date}" is gone (plan §1 default, Q2).
    expect(item.textContent).not.toContain("Awarded");
  });

  it("the action is on the back only: nothing under the card, hidden until the card flips", async () => {
    installFetch([win()]);
    render(createElement(PrizeWalletPanel));
    await screen.findByRole("button", { name: "Show details" });
    // Face-up, the back (and its Redeem) is aria-hidden and inert.
    expect(screen.queryByRole("button", { name: "Redeem" })).toBeNull();
    const back = document.querySelector("[data-prize-card-back]") as HTMLElement;
    expect(back.getAttribute("aria-hidden")).toBe("true");
    expect(back.hasAttribute("inert")).toBe(true);
    const item = document.querySelector("[data-prize-wallet-item]") as HTMLElement;
    expect(Array.from(item.querySelectorAll("button")).every((button) => item.querySelector("[data-prize-card]")?.contains(button))).toBe(true);
    // A tap on the card turns it over to the button.
    fireEvent.click(item.querySelector("[data-prize-card-flipper]") as HTMLElement);
    expect(screen.getByRole("button", { name: "Redeem" }).hasAttribute("data-prize-card-action")).toBe(true);
  });

  it("a redeemed prize has no button; its card says Redeemed and its back keeps the details", async () => {
    const redeemedAt = new Date(2026, 9, 15, 21, 42).toISOString();
    installFetch([win({ prizeRedeemedAt: redeemedAt, winDescription: "You won Live Trivia on Tue, Sep 29" })]);
    render(createElement(PrizeWalletPanel));
    await screen.findByText("Redeemed");
    await flipPrizeCards();
    expect(screen.queryByRole("button", { name: "Redeem" })).toBeNull();
    expect(document.querySelector("[data-prize-card-action]")).toBeNull();
    expect(document.querySelector("[data-prize-card-status]")?.getAttribute("data-prize-card-status")).toBe("redeemed");
    // The line under the card drops the expiry countdown...
    const item = document.querySelector("[data-prize-wallet-item]") as HTMLElement;
    expect((item.querySelector(":scope > div:last-child") as HTMLElement).textContent).toBe("Tap the card for details");
    // ...and the back says when it was redeemed (date AND time) with every detail at full contrast.
    const back = item.querySelector("[data-prize-card-back]") as HTMLElement;
    expect(back.querySelector("[data-prize-card-stamp]")?.textContent).toMatch(/^Redeemed Oct 15, 2026,? 9:42\sPM$/);
    expect(back.querySelector('[data-prize-card-back-row="for"]')?.textContent).toContain("You won Live Trivia");
    expect(back.className).not.toMatch(/opacity-60|grayscale/);
  });

  it("a legacy gift certificate never offers 'Show gift card' (unchanged decision)", async () => {
    installFetch([win({ prizeKind: null, prizeType: "gift_certificate", squareGiftCard: "issued", prizeRedeemedAt: new Date().toISOString() })]);
    render(createElement(PrizeWalletPanel));
    await screen.findByText("Redeemed");
    await flipPrizeCards();
    expect(screen.queryByRole("button", { name: "Show gift card" })).toBeNull();
    expect(document.querySelector("[data-prize-card-action]")).toBeNull();
  });

  it("the action is the PRIZE_CARD action pill, and Redeem still opens the live sheet with the large card", async () => {
    installFetch([win()]);
    render(createElement(PrizeWalletPanel));
    const redeem = await findPrizeCardAction("Redeem");
    expect(redeem.className).toContain(PRIZE_CARD.action);
    expect(redeem.className).toContain("!rounded-full");
    expect(redeem.className).toContain("tp-player-hit-target");
    fireEvent.click(redeem);
    const dialog = screen.getByRole("dialog", { name: "Confirm redemption" });
    expect(within(dialog).getByText("Show this to staff, then tap Confirm Redemption.")).not.toBeNull();
    const large = dialog.querySelector("[data-live-coupon] [data-prize-card]");
    expect(large?.querySelector("[data-prize-card-headline]")?.className).toContain("text-6xl");
    expect(within(dialog).getByRole("button", { name: "Confirm Redemption" })).not.toBeNull();
    // The sheet's card flips to its details too, but has no button: Confirm Redemption is the one redeem.
    fireEvent.click(large?.querySelector("[data-prize-card-flipper]") as HTMLElement);
    expect(large?.getAttribute("data-prize-card-flipped")).toBe("true");
    expect(large?.querySelector('[data-prize-card-back-row="for"]')).not.toBeNull();
    expect(dialog.querySelector("[data-prize-card-action]")).toBeNull();
    // Opening the sheet (and flipping in it) redeemed nothing.
    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(posts).toHaveLength(0);
  });

  it("drops the old list heading and has a short empty state", async () => {
    installFetch([]);
    render(createElement(PrizeWalletPanel));
    expect(await screen.findByText("No prizes yet. Win a Reward here and it will show up in this list.")).not.toBeNull();
    expect(screen.queryByText(/Click "Redeem"/)).toBeNull();
  });
});

describe("Redeem Prizes — the old coupon look is gone", () => {
  const dir = join(process.cwd(), "components/prizes");
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));

  it("no dashed or double rules anywhere in components/prizes", () => {
    for (const { name, text } of sources) {
      expect(text, name).not.toMatch(/border-dashed|border-double/);
    }
  });

  it("no per-prize colour themes (rose wine, emerald appetizer, indigo menu item, amber gift card)", () => {
    const wallet = readFileSync(join(dir, "PrizeWalletPanel.tsx"), "utf8");
    const square = readFileSync(join(dir, "SquareGiftCardPanel.tsx"), "utf8");
    for (const text of [wallet, square]) {
      expect(text).not.toMatch(/from-(rose|emerald|amber|indigo)-950/);
      expect(text).not.toMatch(/border-(rose|emerald|amber)-[57]00\/60/);
    }
    for (const gone of ["WineCoupon", "AppetizerCoupon", "GiftCertificateCoupon", "GiftCardCoupon", "MenuItemCoupon", "ChallengeCoupon"]) {
      expect(wallet).not.toContain(gone);
    }
  });
});

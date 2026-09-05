// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NFLTiebreakerCard } from "@/components/nfl-pickem/NFLTiebreakerCard";
import { PrizeWalletPanel } from "@/components/prizes/PrizeWalletPanel";

vi.mock("@/lib/storage", () => ({ getUserId: () => "user", getVenueId: () => "venue" }));
const presence = { capturePresenceFailure: () => null, isInteractionBlocked: false };
vi.mock("@/components/venue/VenuePresenceBoundary", () => ({ useVenuePresence: () => presence }));
vi.mock("@/components/ui/BouncingBallLoader", () => ({ BouncingBallLoader: () => React.createElement("p", null, "Loading") }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const response = (body: unknown) => ({ ok: true, json: async () => body });

it("locks tiebreaker saves synchronously, retains a failed guess, and announces retry success", async () => {
  let resolveSave!: (value: unknown) => void;
  const fetch = vi.fn().mockResolvedValueOnce(response({ ok: true, game: { gameId: "g", homeTeam: "Bills", awayTeam: "Jets", startsAt: "2026-09-10T20:00:00Z", isLocked: false } }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }))
    .mockResolvedValueOnce(response({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  render(React.createElement(NFLTiebreakerCard, { venueId: "venue", userId: "user", weekId: "week" }));
  const input = await screen.findByLabelText("Predicted total points");
  fireEvent.change(input, { target: { value: "42" } });
  const button = screen.getByRole("button", { name: "Save" });
  act(() => { button.click(); button.click(); });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await act(async () => resolveSave(response({ ok: false, error: "Try again" })));
  expect(screen.getByRole("alert").textContent).toBe("Try again");
  expect((input as HTMLInputElement).value).toBe("42");
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Tiebreaker saved"));
  expect(fetch).toHaveBeenCalledTimes(3);
});

describe("coupon redemption", () => {
  it("keeps the coupon visible on failure and while refreshing a successful redemption", async () => {
    let resolveRedeem!: (value: unknown) => void;
    let posts = 0;
    const win = { challengeId: "c", challengeName: "Trivia", prizeKind: "gift_card", prizeType: "gift_certificate", prizeValue: 10, prizeTitle: "Gift card", venueName: "Test Venue", claimedAt: null, prizeExpiresAt: "2099-01-01" };
    const fetch = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "POST") { posts++; return new Promise(resolve => { resolveRedeem = resolve; }); }
      return Promise.resolve(response({ ok: true, wins: url.includes("challenge-campaigns") ? [win] : [] }));
    });
    vi.stubGlobal("fetch", fetch);
    render(React.createElement(PrizeWalletPanel));
    const redeem = await screen.findByRole("button", { name: /redeem/i });
    fireEvent.click(redeem);
    const confirm = screen.getByRole("button", { name: "Confirm Redemption" });
    act(() => { confirm.click(); confirm.click(); });
    expect(posts).toBe(1);
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    await act(async () => resolveRedeem(response({ ok: false, error: "Connection failed" })));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getAllByRole("alert").some(el => el.textContent === "Connection failed")).toBe(true);
    fireEvent.click(confirm);
    await act(async () => resolveRedeem(response({ ok: true })));
    expect(posts).toBe(2);
    expect(screen.getByRole("dialog").textContent).toContain("Redeemed!");
  });
});

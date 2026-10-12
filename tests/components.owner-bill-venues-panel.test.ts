// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BillVenuesPanel } from "@/components/owner/billing/BillVenuesPanel";
import type { AddVenueQuote, BillAccount } from "@/lib/multiVenueBilling";

// Multi-venue billing Phase 5 — the Billing page's "Venues on this bill" card against MOCKED fetches
// (never the real routes: dev shares the live database and live Stripe).

const ACCOUNT: BillAccount = {
  venues: [
    { id: "v-anchor", name: "Anchor Bar", state: "billed", isAnchor: true, removeAt: null },
    { id: "v-two", name: "Second Bar", state: "billed", isAnchor: false, removeAt: null },
    { id: "v-three", name: "Third Bar", state: "leaving", isAnchor: false, removeAt: "2026-10-20T12:00:00.000Z" },
    { id: "v-four", name: "Fourth Bar", state: "removed", isAnchor: false, removeAt: "2026-09-20T12:00:00.000Z" },
  ],
  billedVenueCount: 2,
  breakdown: [
    { venues: 1, unitAmountCents: 10000, subtotalCents: 10000 },
    { venues: 1, unitAmountCents: 7500, subtotalCents: 7500 },
  ],
  nextMonthlyListCents: 17500,
  nextMonthlyTotalCents: 17500,
};

const QUOTE: AddVenueQuote = {
  currentVenueCount: 2,
  venueNumber: 3,
  thisVenueCents: 7500,
  newMonthlyListCents: 25000,
  newMonthlyTotalCents: 25000,
  dueTodayCents: 2268,
  prorationDate: 1_760_000_000,
  currentPeriodEnd: "2026-10-20T12:00:00.000Z",
  discountLabel: null,
};

type Reply = { status: number; body: unknown };
type Call = { url: string; body: Record<string, unknown> | null };

const installFetch = (replies: Record<string, Reply[]>): Call[] => {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      calls.push({ url: String(url), body: init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null });
      const key = Object.keys(replies).find((k) => String(url).includes(k)) ?? "";
      const queue = replies[key] ?? [{ status: 500, body: null }];
      const reply = queue.length > 1 ? queue.shift()! : queue[0]!;
      return { status: reply.status, ok: reply.status < 400, json: async () => reply.body };
    })
  );
  return calls;
};

const renderPanel = (
  onChanged = vi.fn(),
  bill = { isManual: false, cancelAtPeriodEnd: false, status: "active" },
  account: BillAccount = ACCOUNT
) =>
  render(
    createElement(BillVenuesPanel, {
      account,
      billVenueId: "v-anchor",
      bill,
      periodEnd: "2026-10-20T12:00:00.000Z",
      onChanged,
    })
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BillVenuesPanel", () => {
  it("shows the band line, the next bill and each venue's state and action", () => {
    installFetch({});
    renderPanel();
    expect(screen.getByText("1 × $100 · 1 × $75")).toBeTruthy();
    expect(screen.getByText("$175.00/mo")).toBeTruthy();
    expect(screen.getByText("Leaving Oct 20")).toBeTruthy();
    expect(screen.getByText("Not on your bill")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add back" })).toBeTruthy();
  });

  it("asks before Remove, sends one keyed request, and reports the result", async () => {
    const calls = installFetch({
      "/venues/remove": [{ status: 200, body: { ok: true, change: { action: "remove", venueId: "v-two", removeAt: "2026-10-20T12:00:00.000Z", billedVenueCount: 1 } } }],
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onChanged = vi.fn();
    renderPanel(onChanged);
    const second = screen.getAllByRole("button", { name: "Remove" })[1];
    fireEvent.click(second);
    expect(calls).toHaveLength(0); // declined the question
    fireEvent.click(second);
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("Second Bar stays live until Oct 20, then leaves your bill."));
    expect(confirm.mock.calls[1][0]).toContain("no refund");
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ venueId: "v-two" });
    expect(String(calls[0].body?.idempotencyKey)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("Undo needs no question; a refusal shows the server's words", async () => {
    const calls = installFetch({
      "/venues/remove": [{ status: 409, body: { ok: false, code: "change_in_progress", error: "Another change is going through." } }],
    });
    const confirm = vi.spyOn(window, "confirm");
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await screen.findByText("Another change is going through.");
    expect(confirm).not.toHaveBeenCalled();
    expect(calls[0].body).toMatchObject({ venueId: "v-three", action: "undo" });
  });

  it("Add back quotes first, pays with readdVenueId and the quote's prorationDate, and re-asks with the SAME key", async () => {
    const calls = installFetch({
      "/add/quote": [{ status: 200, body: { ok: true, quote: QUOTE } }],
      "/venues/add": [
        { status: 202, body: { ok: true, status: "requires_action", hostedInvoiceUrl: "https://invoice.stripe.com/i/abc" } },
        { status: 200, body: { ok: true, status: "paid", venueId: "v-four", chargedTodayCents: 2268 } },
      ],
    });
    const onChanged = vi.fn();
    renderPanel(onChanged);
    fireEvent.click(screen.getByRole("button", { name: "Add back" }));
    const pay = await screen.findByRole("button", { name: "Add back — pay $22.68 now" });
    expect(calls[0].url).toBe("/api/owner/venues/add/quote?venueId=v-anchor");
    fireEvent.click(pay);
    const link = await screen.findByRole("link", { name: "Open Stripe's secure page" });
    expect(link.getAttribute("href")).toBe("https://invoice.stripe.com/i/abc");
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("Fourth Bar is back on your bill and live for players."));
    const posts = calls.filter((c) => c.url === "/api/owner/venues/add");
    expect(posts).toHaveLength(2);
    expect(posts[0].body).toMatchObject({ venueId: "v-anchor", readdVenueId: "v-four", prorationDate: QUOTE.prorationDate });
    expect(posts[1].body?.idempotencyKey).toBe(posts[0].body?.idempotencyKey);
    expect(posts[0].body).not.toHaveProperty("venueName");
  });

  it("offers no actions on a check-billed bill", () => {
    installFetch({});
    renderPanel(vi.fn(), { isManual: true, cancelAtPeriodEnd: false, status: "active" });
    expect(screen.queryByRole("button")).toBeNull();
  });

  // Phase 6.7: a venue whose old bill ended is listed with the same Add back, and never a Subscribe.
  const LAPSED_ACCOUNT: BillAccount = {
    ...ACCOUNT,
    venues: [
      { id: "v-anchor", name: "Anchor Bar", state: "billed", isAnchor: true, removeAt: null },
      { id: "v-lapsed", name: "Lapsed Bar", state: "lapsed", isAnchor: false, removeAt: null },
    ],
    billedVenueCount: 1,
  };

  it("a lapsed venue says its old bill ended and Add back pays through the live bill's anchor", async () => {
    const calls = installFetch({
      "/add/quote": [{ status: 200, body: { ok: true, quote: QUOTE } }],
      "/venues/add": [{ status: 200, body: { ok: true, status: "paid", venueId: "v-lapsed", chargedTodayCents: 2268 } }],
    });
    const onChanged = vi.fn();
    renderPanel(onChanged, undefined, LAPSED_ACCOUNT);
    expect(screen.getByText("Not on your bill — its old bill ended")).toBeTruthy();
    expect(screen.queryByText(/subscribe/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add back" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add back — pay $22.68 now" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("Lapsed Bar is back on your bill and live for players."));
    const post = calls.find((c) => c.url === "/api/owner/venues/add");
    expect(post?.body).toMatchObject({ venueId: "v-anchor", readdVenueId: "v-lapsed", quotedVenueCents: QUOTE.thisVenueCents });
  });

  it("on a check-billed bill a lapsed venue has no button and tells the partner to email", () => {
    installFetch({});
    renderPanel(vi.fn(), { isManual: true, cancelAtPeriodEnd: false, status: "active" }, LAPSED_ACCOUNT);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Email partnerships@hightopchallenge\.com/)).toBeTruthy();
  });
});

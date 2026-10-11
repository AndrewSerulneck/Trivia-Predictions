// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddVenueSheet, type AddedVenue } from "@/components/owner/add-venue/AddVenueSheet";
import type { AddVenueQuote } from "@/lib/multiVenueBilling";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// Multi-venue billing Phase 4 — the Add-a-venue sheet, end to end against MOCKED fetches. The real
// POST /api/owner/venues/add is never reached from a test: dev shares the live database and live Stripe.
// The signup address and map screens talk to Google, so they are replaced by two buttons that answer
// the way those screens do (onPatch / onChange).

vi.mock("@/components/signup/steps/AddressStep", async () => {
  const React = await import("react");
  return {
    AddressStep: ({ onPatch }: { onPatch: (patch: Record<string, unknown>) => void }) =>
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () =>
            onPatch({
              venueName: "Murphy's Tap House",
              street: "12 Main St",
              city: "Denver",
              state: "CO",
              zipCode: "80202",
              placeId: "place-1",
              latitude: 39.74,
              longitude: -104.99,
            }),
        },
        "Fill address",
      ),
  };
});

vi.mock("@/components/signup/steps/GeofenceStep", async () => {
  const React = await import("react");
  return {
    GeofenceStep: ({ onChange }: { onChange: (value: Record<string, unknown>) => void }) =>
      React.createElement(
        "button",
        { type: "button", onClick: () => onChange({ lat: 39.74, lng: -104.99, radius: 150, source: "lookup" }) },
        "Set pin",
      ),
  };
});

const QUOTE: AddVenueQuote = {
  currentVenueCount: 1,
  venueNumber: 2,
  thisVenueCents: 7500,
  newMonthlyListCents: 17500,
  newMonthlyTotalCents: 17500,
  dueTodayCents: 2268,
  prorationDate: 1_760_000_000,
  currentPeriodEnd: "2026-10-20T12:00:00.000Z",
  discountLabel: null,
};

type Reply = { status: number; body: unknown };
const quoteOk = (): Reply => ({ status: 200, body: { ok: true, quote: QUOTE } });

type Calls = { quotes: number; posts: Array<Record<string, unknown>> };

/** Routes the quote GET and the add POST to scripted answers. */
const installFetch = (opts: { quotes: Reply[]; adds: Reply[] }): Calls => {
  const calls: Calls = { quotes: 0, posts: [] };
  const quotes = [...opts.quotes];
  const adds = [...opts.adds];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const reply = String(url).includes("/quote")
        ? (calls.quotes++, quotes.length > 1 ? quotes.shift()! : quotes[0]!)
        : (calls.posts.push(JSON.parse(init?.body ?? "{}") as Record<string, unknown>), adds.length > 1 ? adds.shift()! : adds[0]!);
      return { status: reply.status, ok: reply.status < 400, json: async () => reply.body };
    }),
  );
  return calls;
};

const Harness = (props: { onAdded: (a: AddedVenue) => void; onPendingClosed: () => void; closeSheet: () => void }) => {
  const [step, setStep] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const nav: UseOwnerSheetResult = {
    sheet: open ? "add-venue" : null,
    step,
    displayStepFor: () => step,
    openSheet: vi.fn(),
    goToStep: (next) => setStep(next),
    correctStep: (next) => setStep(next),
    goBack: (previous) => setStep(previous),
    closeSheet: () => {
      props.closeSheet();
      setOpen(false);
    },
  };
  return createElement(AddVenueSheet, {
    nav,
    venueId: "venue-a",
    onAdded: props.onAdded,
    onPendingClosed: props.onPendingClosed,
  });
};

const setup = () => {
  const handlers = { onAdded: vi.fn(), onPendingClosed: vi.fn(), closeSheet: vi.fn() };
  render(createElement(Harness, handlers));
  return handlers;
};

/** Address → map → review, waiting out the step slides. */
const goToReview = async () => {
  fireEvent.click(await screen.findByText("Fill address"));
  fireEvent.click(screen.getByRole("button", { name: /^next/i }));
  fireEvent.click(await screen.findByText("Set pin"));
  fireEvent.click(screen.getByRole("button", { name: /^next/i }));
  await screen.findByText("Review & pay");
};

const confirmButton = () => screen.findByRole("button", { name: /add venue — pay \$22\.68 now/i });

beforeEach(() => {
  // The step slide plays its exit phase on a timer; reduced motion swaps screens instantly.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.removeAttribute("style");
  document.body.className = "";
});

describe("AddVenueSheet — up-front check", () => {
  it("explains a bill that can't take a venue before asking for anything", async () => {
    installFetch({
      quotes: [{ status: 409, body: { ok: false, code: "offline_bill", error: "Your account is billed by check. Email us." } }],
      adds: [],
    });
    setup();
    expect(await screen.findByText(/billed by check/i)).toBeTruthy();
    expect(screen.queryByText("Fill address")).toBeNull();
  });

  it("links a billing problem to Billing", async () => {
    installFetch({
      quotes: [{ status: 409, body: { ok: false, code: "bill_not_active", error: "Your subscription isn't active right now." } }],
      adds: [],
    });
    setup();
    const link = await screen.findByRole("link", { name: /go to billing/i });
    expect(link.getAttribute("href")).toBe("/owner/billing");
  });

  it("does not lock the partner out when billing is only briefly unavailable", async () => {
    installFetch({ quotes: [{ status: 503, body: { ok: false, code: "stripe_unavailable", error: "x" } }], adds: [] });
    setup();
    expect(await screen.findByText("Fill address")).toBeTruthy();
  });
});

describe("AddVenueSheet — paying", () => {
  it("shows Stripe's numbers, sends one keyed POST with the quote's proration date, then hands the venue to the page", async () => {
    const calls = installFetch({
      quotes: [quoteOk()],
      adds: [{ status: 200, body: { ok: true, status: "paid", additionId: "a1", venueId: "venue-b", chargedTodayCents: 2268 } }],
    });
    const handlers = setup();
    await goToReview();

    expect(screen.getByText("$75.00/mo")).toBeTruthy();
    expect(screen.getByText("$175.00/mo")).toBeTruthy();
    expect(screen.getByText("$22.68")).toBeTruthy();
    expect(screen.getByText(/through Oct 20/)).toBeTruthy();

    fireEvent.click(await confirmButton());
    await waitFor(() => expect(handlers.onAdded).toHaveBeenCalledTimes(1));

    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0]).toMatchObject({
      venueId: "venue-a",
      venueName: "Murphy's Tap House",
      prorationDate: QUOTE.prorationDate,
      radius: 150,
    });
    expect(String(calls.posts[0]?.idempotencyKey)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(handlers.onAdded).toHaveBeenCalledWith({ venueId: "venue-b", venueName: "Murphy's Tap House" });
    expect(handlers.closeSheet).toHaveBeenCalled();
    expect(handlers.onPendingClosed).not.toHaveBeenCalled();
  });

  it("a declined card changes nothing, points to Billing, and the next Confirm is a NEW attempt", async () => {
    const calls = installFetch({
      quotes: [quoteOk()],
      adds: [{ status: 402, body: { ok: false, code: "card_declined", error: "Your card was declined. Update it in Billing, then try again." } }],
    });
    const handlers = setup();
    await goToReview();

    fireEvent.click(await confirmButton());
    expect(await screen.findByText(/card was declined/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /go to billing/i }).getAttribute("href")).toBe("/owner/billing");
    expect(handlers.onAdded).not.toHaveBeenCalled();

    fireEvent.click(await confirmButton());
    await waitFor(() => expect(calls.posts).toHaveLength(2));
    expect(calls.posts[1]?.idempotencyKey).not.toBe(calls.posts[0]?.idempotencyKey);
  });

  it("3-D Secure: shows Stripe's page, and 'I've paid' re-asks with the SAME key until it is paid", async () => {
    const calls = installFetch({
      quotes: [quoteOk()],
      adds: [
        {
          status: 202,
          body: { ok: true, status: "requires_action", additionId: "a1", hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_1/test_abc" },
        },
        { status: 200, body: { ok: true, status: "paid", additionId: "a1", venueId: "venue-b", chargedTodayCents: 2268 } },
      ],
    });
    const handlers = setup();
    await goToReview();

    fireEvent.click(await confirmButton());
    const open = await screen.findByRole("link", { name: /open the secure payment page/i });
    expect(open.getAttribute("href")).toBe("https://invoice.stripe.com/i/acct_1/test_abc");
    expect(open.getAttribute("target")).toBe("_blank");
    expect(open.getAttribute("rel")).toContain("noopener");

    fireEvent.click(screen.getByRole("button", { name: /i've paid — check now/i }));
    await waitFor(() => expect(handlers.onAdded).toHaveBeenCalledTimes(1));
    expect(calls.posts).toHaveLength(2);
    expect(calls.posts[1]?.idempotencyKey).toBe(calls.posts[0]?.idempotencyKey);
  });

  it("an unconfirmed payment never invites a second attempt: 'Check again' re-asks with the same key", async () => {
    const calls = installFetch({
      quotes: [quoteOk()],
      adds: [
        { status: 503, body: { ok: false, code: "payment_unconfirmed", error: "We couldn't confirm the payment yet." } },
        { status: 200, body: { ok: true, status: "paid", additionId: "a1", venueId: "venue-b", chargedTodayCents: 2268 } },
      ],
    });
    const handlers = setup();
    await goToReview();

    fireEvent.click(await confirmButton());
    expect(await screen.findByText(/couldn't confirm the payment/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /add venue — pay/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /check again/i }));
    await waitFor(() => expect(handlers.onAdded).toHaveBeenCalledTimes(1));
    expect(calls.posts[1]?.idempotencyKey).toBe(calls.posts[0]?.idempotencyKey);
  });

  it("closing while a payment is still being confirmed tells the page it will appear on its own", async () => {
    installFetch({
      quotes: [quoteOk()],
      adds: [
        {
          status: 202,
          body: { ok: true, status: "requires_action", additionId: "a1", hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_1/test_abc" },
        },
      ],
    });
    const handlers = setup();
    await goToReview();
    fireEvent.click(await confirmButton());
    await screen.findByRole("link", { name: /open the secure payment page/i });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(handlers.onPendingClosed).toHaveBeenCalledTimes(1);
    expect(handlers.closeSheet).toHaveBeenCalled();
    // The payment is on its way: the partner is not asked to "discard" anything.
    expect(screen.queryByText("Discard this venue?")).toBeNull();
  });

  it("an old price is refreshed before anyone is charged", async () => {
    const calls = installFetch({ quotes: [quoteOk()], adds: [{ status: 200, body: { ok: true, status: "paid", additionId: "a", venueId: "v", chargedTodayCents: 1 } }] });
    setup();
    await goToReview();
    const button = await confirmButton();

    const real = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(real + 11 * 60 * 1000);
    fireEvent.click(button);

    await waitFor(() => expect(calls.quotes).toBeGreaterThanOrEqual(3));
    expect(calls.posts).toHaveLength(0);
    expect(await screen.findByText(/we refreshed the price/i)).toBeTruthy();
  });
});

describe("AddVenueSheet — leaving", () => {
  it("asks before throwing away typed answers", async () => {
    installFetch({ quotes: [quoteOk()], adds: [] });
    const handlers = setup();
    fireEvent.click(await screen.findByText("Fill address"));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByText("Discard this venue?")).toBeTruthy();
    expect(handlers.closeSheet).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(handlers.closeSheet).toHaveBeenCalled();
  });

  it("closes straight away when nothing was typed", async () => {
    installFetch({ quotes: [quoteOk()], adds: [] });
    const handlers = setup();
    await screen.findByText("Fill address");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    expect(handlers.closeSheet).toHaveBeenCalled();
  });

  it("won't move past the address screen without one", async () => {
    installFetch({ quotes: [quoteOk()], adds: [] });
    setup();
    await screen.findByText("Fill address");
    fireEvent.click(screen.getByRole("button", { name: /^next/i }));
    expect(await screen.findByText(/venue name/i)).toBeTruthy();
    expect(screen.queryByText("Set pin")).toBeNull();
  });
});

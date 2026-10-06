// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { POS_RESULT_MESSAGES, PosConnectionsSheet, posConnectHref, SQUARE_ATTENTION_TEXT } from "@/components/owner/pos/PosConnectionsSheet";
import type { PosConnectionStatus } from "@/lib/pos/types";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// docs/pos-rewards-integration-plan.md Phase 1 — the Point of Sale sheet (?sheet=pos).
// createElement instead of JSX (*.test.ts glob).

const fakeNav = (overrides: Partial<UseOwnerSheetResult> = {}): UseOwnerSheetResult => ({
  sheet: null,
  step: null,
  displayStepFor: () => null,
  openSheet: vi.fn(),
  goToStep: vi.fn(),
  correctStep: vi.fn(),
  goBack: vi.fn(),
  closeSheet: vi.fn(),
  ...overrides,
});

const VENUE = { id: "venue-1", name: "The Pub" };

const status = (overrides: Partial<PosConnectionStatus>): PosConnectionStatus => ({
  provider: "square",
  label: "Square",
  pitch: "Square pitch",
  state: "coming_soon",
  merchantName: null,
  connectedAt: null,
  ...overrides,
});

const stubFetch = (body: unknown, ok = true) => {
  const fetchMock = vi.fn(async () => ({ ok, json: async () => body }) as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PosConnectionsSheet", () => {
  it("renders nothing and fetches nothing unless ?sheet=pos", () => {
    const fetchMock = stubFetch({ ok: true, statuses: [] });
    render(createElement(PosConnectionsSheet, { nav: fakeNav({ sheet: "store" }), venue: VENUE }));
    expect(screen.queryByText("Point of Sale")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads this venue's statuses once on open and shows each state", async () => {
    const fetchMock = stubFetch({
      ok: true,
      statuses: [
        status({ provider: "square", label: "Square", state: "connected", merchantName: "Pub LLC" }),
        status({ provider: "clover", label: "Clover", state: "not_connected" }),
        status({ provider: "toast", label: "Toast", state: "coming_soon" }),
      ],
    });
    render(createElement(PosConnectionsSheet, { nav: fakeNav({ sheet: "pos" }), venue: VENUE }));
    expect(await screen.findByText("Connected to Pub LLC")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect" }).getAttribute("href")).toBe(posConnectHref("clover", "venue-1"));
    expect(screen.getByText("Coming soon")).toBeTruthy();
    // Statuses once, plus the Phase 2f "Rewards redeemed" list's single read.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("/api/owner/pos?venueId=venue-1", { cache: "no-store" });
    expect(fetchMock).toHaveBeenCalledWith("/api/owner/pos/redeemed?venueId=venue-1", { cache: "no-store" });
  });

  it("Phase 2c: a Square connection that needs attention explains itself and offers Reconnect and Disconnect", async () => {
    stubFetch({ ok: true, statuses: [status({ provider: "square", state: "needs_attention", merchantName: "Pub LLC" })] });
    render(createElement(PosConnectionsSheet, { nav: fakeNav({ sheet: "pos" }), venue: VENUE }));
    expect(await screen.findByText(SQUARE_ATTENTION_TEXT)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reconnect" }).getAttribute("href")).toBe(posConnectHref("square", "venue-1"));
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  });

  it("Phase 2c: says why an account that can't issue US-dollar gift cards wasn't connected", () => {
    stubFetch({ ok: true, statuses: [] });
    render(createElement(PosConnectionsSheet, { nav: fakeNav({ sheet: "pos" }), venue: VENUE, posResult: "not_eligible" }));
    expect(screen.getByText(POS_RESULT_MESSAGES.not_eligible.text)).toBeTruthy();
    expect(POS_RESULT_MESSAGES.not_eligible.text).toContain("US dollars");
  });

  it("Phase 2c: the location picker greys out a location that can't issue our gift cards", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const body = url.startsWith("/api/owner/pos/square/locations")
        ? { ok: true, locations: [{ id: "L1", name: "Main", address: null, eligible: true }, { id: "L2", name: "Toronto", address: null, eligible: false }] }
        : { ok: true, statuses: [status({ provider: "square", state: "connected", needsLocation: true })] };
      return { ok: true, json: async () => body } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(PosConnectionsSheet, { nav: fakeNav({ sheet: "pos" }), venue: VENUE }));
    const toronto = (await screen.findByText(/Toronto/)) as HTMLOptionElement;
    expect(toronto.disabled).toBe(true);
    expect(toronto.textContent).toContain("(must be a US location using US dollars)");
    expect((screen.getByText("Main") as HTMLOptionElement).disabled).toBe(false);
  });

  it("shows the error with a Retry that asks again", async () => {
    const fetchMock = stubFetch({ ok: false, error: "nope" }, false);
    render(createElement(PosConnectionsSheet, { nav: fakeNav({ sheet: "pos" }), venue: VENUE }));
    expect(await screen.findByText("nope")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

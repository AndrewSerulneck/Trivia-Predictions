// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  POS_RESULT_MESSAGES,
  PosConnectionsSheet,
  posConnectHref,
  SQUARE_ATTENTION_TEXT,
  SQUARE_OTHER_ENV_DEV_TEXT,
  SQUARE_OTHER_ENV_LIVE_TEXT,
} from "@/components/owner/pos/PosConnectionsSheet";
import { SQUARE_OTHER_ENVIRONMENT_RESULT_TEXT } from "@/lib/posStaffInstructions";
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
    // Statuses once. The Phase 2f "Rewards redeemed" list was removed (Andrew, 2026-10-07).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/owner/pos?venueId=venue-1", { cache: "no-store" });
  });

  it("Phase 2c: a Square connection that needs attention explains itself and offers Reconnect and Disconnect", async () => {
    stubFetch({ ok: true, statuses: [status({ provider: "square", state: "needs_attention", merchantName: "Pub LLC" })] });
    render(createElement(PosConnectionsSheet, { nav: fakeNav({ sheet: "pos" }), venue: VENUE }));
    expect(await screen.findByText(SQUARE_ATTENTION_TEXT)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reconnect" }).getAttribute("href")).toBe(posConnectHref("square", "venue-1"));
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  });

  // docs/square-dev-test-venue-plan.md Phase 1 — the exact copy is the plan's.
  describe("environment guard", () => {
    it("on the dev server, the live site's connection gets one line, a neutral badge, and no Reconnect/Disconnect", async () => {
      stubFetch({ ok: true, statuses: [status({ provider: "square", state: "other_environment", otherEnvironment: "production" })] });
      render(createElement(PosConnectionsSheet, { nav: fakeNav({ sheet: "pos" }), venue: VENUE }));
      expect(await screen.findByText("Connected on the live site.")).toBeTruthy();
      expect(
        screen.getByText("Test Square on your test venue — reconnecting here would replace this venue's real Square connection."),
      ).toBeTruthy();
      expect(SQUARE_OTHER_ENV_DEV_TEXT.title).toBe("Connected on the live site.");
      const badge = screen.getByText("Live site");
      expect(badge.className).not.toContain("amber");
      expect(badge.className).not.toContain("rose");
      expect(screen.queryByRole("link", { name: /Connect|Reconnect/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
      expect(screen.queryByText(SQUARE_ATTENTION_TEXT)).toBeNull();
      expect(screen.queryByText("Reconnect needed")).toBeNull();
      // Nothing to set up from this server either.
      expect(screen.queryByText("Set up Square")).toBeNull();
    });

    it("on the live site, a dev sandbox row says it is a test connection", async () => {
      stubFetch({ ok: true, statuses: [status({ provider: "square", state: "other_environment", otherEnvironment: "sandbox" })] });
      render(createElement(PosConnectionsSheet, { nav: fakeNav({ sheet: "pos" }), venue: VENUE }));
      expect(await screen.findByText("Test connection from the dev server.")).toBeTruthy();
      expect(screen.getByText("It only works there and never touches real money.")).toBeTruthy();
      expect(SQUARE_OTHER_ENV_LIVE_TEXT.body).toBe("It only works there and never touches real money.");
      expect(screen.getByText("Test")).toBeTruthy();
      expect(screen.queryByRole("link", { name: /Connect|Reconnect/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
    });

    it("a normal Square row still offers Connect and the setup checklist", async () => {
      stubFetch({ ok: true, statuses: [status({ provider: "square", state: "not_connected" })] });
      render(createElement(PosConnectionsSheet, { nav: fakeNav({ sheet: "pos" }), venue: VENUE }));
      expect((await screen.findByRole("link", { name: "Connect" })).getAttribute("href")).toBe(posConnectHref("square", "venue-1"));
      expect(screen.getByText("Set up Square")).toBeTruthy();
      expect(screen.queryByText("Live site")).toBeNull();
    });

    it("the connect banner explains a refused cross-server connect", () => {
      stubFetch({ ok: true, statuses: [] });
      render(createElement(PosConnectionsSheet, { nav: fakeNav({ sheet: "pos" }), venue: VENUE, posResult: "other_environment" }));
      expect(SQUARE_OTHER_ENVIRONMENT_RESULT_TEXT).toBe(
        "This venue's Square is managed from the other server, so nothing was changed. Use your test venue to test Square.",
      );
      expect(screen.getByText(SQUARE_OTHER_ENVIRONMENT_RESULT_TEXT).getAttribute("role")).toBe("status");
      expect(POS_RESULT_MESSAGES.other_environment.tone).toBe("bad");
    });
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

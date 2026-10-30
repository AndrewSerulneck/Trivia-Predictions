// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PartnerMessagesSheet } from "@/components/owner/messages/PartnerMessagesSheet";
import { PARTNER_MESSAGE_COPY } from "@/lib/partnerMessageRules";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// Phase 10.2 (F3, F5): no endless spinner without a venue; a send that came back without a status
// shows "Sent" and reads the status once more. createElement, not JSX (*.test.ts glob).

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/owner/dashboard",
  useSearchParams: () => new URLSearchParams("sheet=messages"),
}));

const nav: UseOwnerSheetResult = {
  sheet: "messages",
  step: null,
  displayStepFor: () => null,
  openSheet: vi.fn(),
  goToStep: vi.fn(),
  correctStep: vi.fn(),
  goBack: vi.fn(),
  closeSheet: vi.fn(),
};

const STATUS = { cap: 2, remaining: 2, paused: false, recent: [] };
const AFTER = { cap: 2, remaining: 1, paused: false, recent: [] };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("PartnerMessagesSheet", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("with no venue shows a line, not the loader, and asks for nothing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(PartnerMessagesSheet, { nav, venue: null }));
    expect(screen.getByText(PARTNER_MESSAGE_COPY.noVenue)).toBeTruthy();
    // The loader is a role="status" too: the line must be the only one on screen.
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0].textContent).toBe(PARTNER_MESSAGE_COPY.noVenue);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a success without a status shows Sent and reloads the status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({ ok: true, status: STATUS }))
      .mockResolvedValueOnce(reply({ ok: true, messageId: "m-1", devices: 3, status: null }))
      .mockResolvedValueOnce(reply({ ok: true, status: AFTER }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(PartnerMessagesSheet, { nav, venue: { id: "venue-1", name: "The Hightop" } }));

    const box = await screen.findByPlaceholderText(PARTNER_MESSAGE_COPY.placeholder);
    fireEvent.change(box, { target: { value: "Wings tonight!" } });
    fireEvent.click(screen.getByRole("button", { name: PARTNER_MESSAGE_COPY.send }));
    fireEvent.click(screen.getByRole("button", { name: PARTNER_MESSAGE_COPY.confirmSend }));

    await screen.findByText(PARTNER_MESSAGE_COPY.sent(3));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(String(fetchMock.mock.calls[2][0])).toContain("/api/owner/messages?venueId=venue-1");
    expect(screen.queryByText(/Couldn't send/)).toBeNull();
    expect(screen.getByText(PARTNER_MESSAGE_COPY.sent(3))).toBeTruthy();
  });
});

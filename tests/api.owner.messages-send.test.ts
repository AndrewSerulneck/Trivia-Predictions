import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 10.2 (F3): once a message is recorded the reply is a success, even if reading the status afterwards fails.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireOwnerAuth: vi.fn(),
  sendVenueMessage: vi.fn(),
  getVenueMessageStatus: vi.fn(),
}));
vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/push/venueMessages", () => ({
  sendVenueMessage: mocks.sendVenueMessage,
  getVenueMessageStatus: mocks.getVenueMessageStatus,
  VenueMessagesUnavailableError: class VenueMessagesUnavailableError extends Error {},
}));

import { POST } from "@/app/api/owner/messages/route";

const post = () =>
  POST(
    new Request("http://localhost/api/owner/messages", {
      method: "POST",
      body: JSON.stringify({ venueId: "venue-1", text: "Wings tonight!" }),
    }),
  );

describe("POST /api/owner/messages", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED", "true");
    mocks.requireOwnerAuth.mockReset().mockResolvedValue({ ownerId: "owner-1", venueIds: ["venue-1"] });
    mocks.sendVenueMessage.mockReset().mockResolvedValue({ ok: true, messageId: "m-1", devices: 4 });
    mocks.getVenueMessageStatus.mockReset();
  });

  it("answers ok with the status when everything works", async () => {
    const status = { cap: 2, remaining: 1, paused: false, recent: [] };
    mocks.getVenueMessageStatus.mockResolvedValue(status);
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, messageId: "m-1", devices: 4, status });
  });

  it("still answers ok (status null) when only the status read throws after the send", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getVenueMessageStatus.mockRejectedValue(new Error("db down"));
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, messageId: "m-1", devices: 4, status: null });
    expect(log).toHaveBeenCalledWith("[OwnerMessages] status-after-send-failed", "db down");
    expect(mocks.sendVenueMessage).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("a send that throws is still the only 500", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendVenueMessage.mockRejectedValue(new Error("boom"));
    const res = await post();
    expect(res.status).toBe(500);
    log.mockRestore();
  });
});

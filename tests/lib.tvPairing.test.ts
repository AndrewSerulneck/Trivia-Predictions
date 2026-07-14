import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

import { normalizePairingCode, pairingRowStatus } from "@/lib/tvPairing";

type Row = Parameters<typeof pairingRowStatus>[0];

function row(overrides: Partial<Row> = {}): Row {
  return {
    code: "XK49PM",
    venue_id: null,
    created_at: "2026-08-01T00:00:00.000Z",
    expires_at: "2026-08-01T00:10:00.000Z",
    claimed_at: null,
    consumed_at: null,
    ...overrides,
  };
}

const BEFORE_EXPIRY = Date.parse("2026-08-01T00:05:00.000Z");
const AFTER_EXPIRY = Date.parse("2026-08-01T00:11:00.000Z");

describe("normalizePairingCode", () => {
  it("uppercases and strips whitespace/hyphens (display form → stored form)", () => {
    expect(normalizePairingCode("xk4-9pm")).toBe("XK49PM");
    expect(normalizePairingCode("  XK4 9PM ")).toBe("XK49PM");
    expect(normalizePairingCode("")).toBe("");
  });
});

describe("pairingRowStatus", () => {
  it("is pending when unclaimed and unexpired", () => {
    expect(pairingRowStatus(row(), BEFORE_EXPIRY)).toBe("pending");
  });

  it("is claimed once a venue is bound and it hasn't expired/consumed", () => {
    expect(
      pairingRowStatus(row({ venue_id: "venue-1", claimed_at: "2026-08-01T00:02:00.000Z" }), BEFORE_EXPIRY),
    ).toBe("claimed");
  });

  it("is expired once past the TTL, even if it was claimed", () => {
    expect(pairingRowStatus(row(), AFTER_EXPIRY)).toBe("expired");
    expect(
      pairingRowStatus(row({ venue_id: "venue-1", claimed_at: "2026-08-01T00:02:00.000Z" }), AFTER_EXPIRY),
    ).toBe("expired");
  });

  it("is consumed (highest precedence) once used, regardless of expiry", () => {
    expect(
      pairingRowStatus(
        row({ venue_id: "venue-1", claimed_at: "x", consumed_at: "2026-08-01T00:03:00.000Z" }),
        BEFORE_EXPIRY,
      ),
    ).toBe("consumed");
    // consumed wins even after the TTL
    expect(
      pairingRowStatus(row({ consumed_at: "2026-08-01T00:03:00.000Z" }), AFTER_EXPIRY),
    ).toBe("consumed");
  });
});

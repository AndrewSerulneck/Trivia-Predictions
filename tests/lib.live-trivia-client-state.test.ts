import { describe, expect, it } from "vitest";
import {
  evaluateLiveTriviaStatePayload,
  resolveLiveTriviaVenueContext,
} from "@/lib/liveTriviaClientState";

describe("resolveLiveTriviaVenueContext", () => {
  it("prefers route venue ID over stored venue ID", () => {
    const result = resolveLiveTriviaVenueContext({
      routeVenueId: "venue-route",
      storedVenueId: "venue-stored",
    });
    expect(result).toEqual({ venueId: "venue-route", source: "route" });
  });

  it("falls back to stored venue ID when route venue ID is missing", () => {
    const result = resolveLiveTriviaVenueContext({
      routeVenueId: "",
      storedVenueId: "venue-stored",
    });
    expect(result).toEqual({ venueId: "venue-stored", source: "storage" });
  });

  it("returns none when both route and stored venue IDs are missing", () => {
    const result = resolveLiveTriviaVenueContext({
      routeVenueId: "",
      storedVenueId: "",
    });
    expect(result).toEqual({ venueId: "", source: "none" });
  });
});

describe("evaluateLiveTriviaStatePayload", () => {
  it("returns live state when game is active", () => {
    const result = evaluateLiveTriviaStatePayload({
      ok: true,
      state: {
        isGameActive: true,
        nextSchedule: null,
      },
    });
    expect(result.kind).toBe("live");
    expect(result.label).toBe("Live Now");
  });

  it("returns upcoming state when next schedule start time is valid", () => {
    const result = evaluateLiveTriviaStatePayload({
      ok: true,
      state: {
        isGameActive: false,
        nextSchedule: {
          startTime: "2026-05-31T22:45:00.000Z",
          timezone: "America/New_York",
        },
      },
    });
    expect(result.kind).toBe("upcoming");
    expect(result.nextStartAtMs).toBe(Date.parse("2026-05-31T22:45:00.000Z"));
  });

  it("returns TBD when next schedule exists without start time", () => {
    const result = evaluateLiveTriviaStatePayload({
      ok: true,
      state: {
        isGameActive: false,
        nextSchedule: {
          startTime: "",
          timezone: "America/New_York",
        },
      },
    });
    expect(result.kind).toBe("tbd");
    expect(result.failureReason).toBe("missing_next_start");
  });

  it("returns unavailable when next schedule start time is invalid", () => {
    const result = evaluateLiveTriviaStatePayload({
      ok: true,
      state: {
        isGameActive: false,
        nextSchedule: {
          startTime: "not-a-date",
          timezone: "America/New_York",
        },
      },
    });
    expect(result.kind).toBe("unavailable");
    expect(result.failureReason).toBe("invalid_next_start");
  });

  it("returns unavailable when payload is non-ok", () => {
    const result = evaluateLiveTriviaStatePayload({
      ok: false,
      state: null,
    });
    expect(result.kind).toBe("unavailable");
    expect(result.failureReason).toBe("non_ok_payload");
  });
});

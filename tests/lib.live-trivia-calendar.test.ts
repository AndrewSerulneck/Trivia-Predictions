// "Add to calendar" (docs/cancelled-prizes-pick-windows-away-mode-plan.md, Phase C3): the .ics text, the
// link, and GET /api/trivia/live/calendar (every word from the schedule and venue row, never the URL).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUpcomingScheduleOccurrence: vi.fn(),
  venue: {
    name: "Pacific Street",
    display_name: null as string | null,
    street: "1010 Pacific St",
    address: null,
    city: "Brooklyn",
    state: "NY",
    zip_code: "11238",
  } as Record<string, string | null> | null,
}));

vi.mock("@/lib/liveShowdownEngine", () => ({ findUpcomingScheduleOccurrence: mocks.findUpcomingScheduleOccurrence }));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.venue, error: null }) }) }),
    }),
  },
}));

import { GET } from "@/app/api/trivia/live/calendar/route";
import { buildLiveTriviaIcs, liveTriviaCalendarPath, venueCalendarLocation } from "@/lib/liveTriviaCalendar";

const SCHEDULE = "8b1f6a52-1c1e-4d4e-9a63-0d3f7c2b1a90";
const START = Date.parse("2026-11-13T01:00:00Z"); // Thu 8:00 PM in New York

beforeEach(() => {
  mocks.findUpcomingScheduleOccurrence.mockReset().mockResolvedValue({
    scheduleId: SCHEDULE,
    venueId: "bar-1",
    occurrenceDate: "2026-11-12",
    startMs: START,
    endMs: START + 90 * 60_000,
    timezone: "America/New_York",
  });
});

describe("buildLiveTriviaIcs", () => {
  it("one event in UTC with a 1-hour alert and CRLF lines", () => {
    const ics = buildLiveTriviaIcs({
      scheduleId: SCHEDULE,
      venueId: "bar-1",
      venueName: "Pacific Street",
      location: "Pacific Street, 1010 Pacific St, Brooklyn, NY 11238",
      startMs: START,
      endMs: START + 90 * 60_000,
      nowMs: Date.parse("2026-11-09T12:00:00Z"),
    });
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.split("\r\n").filter(Boolean)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Hightop Challenge//Live Trivia//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${SCHEDULE}-20261113T010000Z@hightop`,
      "DTSTAMP:20261109T120000Z",
      "DTSTART:20261113T010000Z",
      "DTEND:20261113T023000Z",
      "SUMMARY:Live Trivia at Pacific Street",
      "LOCATION:Pacific Street\\, 1010 Pacific St\\, Brooklyn\\, NY 11238",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT1H",
      "DESCRIPTION:Live Trivia at Pacific Street",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ]);
  });

  it("escapes text and folds long lines at 75 octets", () => {
    const ics = buildLiveTriviaIcs({
      scheduleId: SCHEDULE,
      venueId: "bar-1",
      venueName: "Joe's; Bar\\Grill",
      location: "x".repeat(200),
      startMs: START,
      endMs: START + 1,
    });
    expect(ics).toContain("SUMMARY:Live Trivia at Joe's\\; Bar\\\\Grill");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`LOCATION:${"x".repeat(200)}`);
  });

  it("no venue name: plain title, no location line", () => {
    const ics = buildLiveTriviaIcs({ scheduleId: SCHEDULE, venueId: "bar-1", venueName: null, location: "", startMs: START, endMs: START + 1 });
    expect(ics).toContain("SUMMARY:Live Trivia\r\n");
    expect(ics).not.toContain("LOCATION:");
  });
});

describe("venueCalendarLocation and the link", () => {
  it("joins the parts, or keeps a street that is already a full address", () => {
    expect(venueCalendarLocation({ name: "Pacific Street", street: "1010 Pacific St", city: "Brooklyn", state: "NY", zipCode: "11238" })).toBe(
      "Pacific Street, 1010 Pacific St, Brooklyn, NY 11238",
    );
    expect(venueCalendarLocation({ name: "Bar", street: "1 Main St, Hoboken, NJ 07030, USA", city: "Hoboken" })).toBe(
      "Bar, 1 Main St, Hoboken, NJ 07030, USA",
    );
    expect(venueCalendarLocation({ name: null })).toBe("");
  });

  it("the link names the venue, the schedule and the start", () => {
    expect(liveTriviaCalendarPath("bar-1", SCHEDULE, START)).toBe(
      `/api/trivia/live/calendar?venueId=bar-1&scheduleId=${SCHEDULE}&start=2026-11-13T01%3A00%3A00.000Z`,
    );
  });
});

describe("GET /api/trivia/live/calendar", () => {
  const get = (query: string) => GET(new Request(`https://play.example/api/trivia/live/calendar?${query}`));

  it("serves the game from the live schedule and the venue row", async () => {
    const res = await get(`venueId=bar-1&scheduleId=${SCHEDULE}&start=2026-11-13T01:00:00.000Z`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
    const ics = await res.text();
    expect(ics).toContain("SUMMARY:Live Trivia at Pacific Street");
    expect(ics).toContain("DTSTART:20261113T010000Z");
    expect(mocks.findUpcomingScheduleOccurrence).toHaveBeenCalledWith("bar-1", SCHEDULE, START, expect.any(Number));
  });

  it("ignores any text in the URL", async () => {
    const res = await get(`venueId=bar-1&scheduleId=${SCHEDULE}&start=2026-11-13T01:00:00.000Z&title=Free+money&location=evil`);
    const ics = await res.text();
    expect(ics).not.toMatch(/Free money|evil/);
  });

  it("a game that isn't on, or a malformed link, is 404", async () => {
    mocks.findUpcomingScheduleOccurrence.mockResolvedValue(null);
    expect((await get(`venueId=bar-1&scheduleId=${SCHEDULE}&start=2026-11-13T01:00:00.000Z`)).status).toBe(404);
    expect((await get(`venueId=bar-1&scheduleId=nope&start=2026-11-13T01:00:00.000Z`)).status).toBe(404);
    expect((await get(`venueId=&scheduleId=${SCHEDULE}&start=x`)).status).toBe(404);
  });
});

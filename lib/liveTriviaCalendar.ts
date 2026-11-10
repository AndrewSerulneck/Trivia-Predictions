// "Add to calendar" for the next Live Trivia game (docs/cancelled-prizes-pick-windows-away-mode-plan.md,
// Phase C3). Pure and client-safe: the .ics text and the link that serves it.
//
// The file is served by GET /api/trivia/live/calendar (built from the live schedule and the venue row,
// never from text in the URL) rather than made in the browser: inside the iPhone app the share sheet has
// no "Add to Calendar", while Safari opening a text/calendar link shows the phone's own add sheet. So the
// app opens the link in the phone's browser and the website follows it.

export const LIVE_TRIVIA_CALENDAR_PATH = "/api/trivia/live/calendar";

/** The link for one game: the venue, the schedule and the start Venue Home showed. */
export const liveTriviaCalendarPath = (venueId: string, scheduleId: string, startMs: number): string => {
  const params = new URLSearchParams({ venueId, scheduleId, start: new Date(startMs).toISOString() });
  return `${LIVE_TRIVIA_CALENDAR_PATH}?${params.toString()}`;
};

const clean = (value: string | null | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();

/**
 * "Pacific Street, 1010 Pacific St, Brooklyn, NY 11238". Some venues keep the whole formatted address in
 * `street`; then it is used as it is.
 */
export const venueCalendarLocation = (venue: {
  name: string | null;
  street?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}): string => {
  const street = clean(venue.street) || clean(venue.address);
  let address = street;
  if (!street.includes(",")) {
    const stateZip = [clean(venue.state), clean(venue.zipCode)].filter(Boolean).join(" ");
    address = [street, clean(venue.city), stateZip].filter(Boolean).join(", ");
  }
  return [clean(venue.name), address].filter(Boolean).join(", ");
};

/** RFC 5545 TEXT: backslash, semicolon, comma and line breaks are escaped. */
const escapeText = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** 20261112T010000Z */
const icsUtc = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Lines longer than 75 octets continue on the next line after a space (RFC 5545 §3.1). */
const fold = (line: string): string => {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
};

export type LiveTriviaCalendarEvent = {
  scheduleId: string;
  venueId: string;
  venueName: string | null;
  location: string;
  startMs: number;
  endMs: number;
  nowMs?: number;
};

/** One VEVENT with a 1-hour alert (the same lead as Remind me). CRLF line endings. */
export const buildLiveTriviaIcs = (event: LiveTriviaCalendarEvent): string => {
  const summary = event.venueName ? `Live Trivia at ${clean(event.venueName)}` : "Live Trivia";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hightop Challenge//Live Trivia//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // Stable per game, so adding it twice updates one event instead of making two.
    `UID:${event.scheduleId}-${icsUtc(event.startMs)}@hightop`,
    `DTSTAMP:${icsUtc(event.nowMs ?? Date.now())}`,
    `DTSTART:${icsUtc(event.startMs)}`,
    `DTEND:${icsUtc(event.endMs)}`,
    `SUMMARY:${escapeText(summary)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT1H",
    `DESCRIPTION:${escapeText(summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
};

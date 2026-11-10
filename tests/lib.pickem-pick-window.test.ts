import { describe, expect, it } from "vitest";
import {
  applyPickWindowChanges,
  formatPickWindowInstant,
  formatPickWindowTime,
  nextPickWindowOpeningMs,
  pickAheadHorizonMs,
  pickWindowViewForGame,
  pickWindowViewForGames,
  parseStoredPickWindows,
  pickWindowInstanceAt,
  pickWindowLengthMinutes,
  pickWindowOpenWeekdays,
  pickWindowStatusForGame,
  readPickEmPickWindow,
  toStoredPickWindows,
  type PickEmPickWindow,
} from "@/lib/pickemPickWindow";

// Pick windows (docs/cancelled-prizes-pick-windows-away-mode-plan.md B1): the pure rules. A window
// instance covers every game from its opening until the next opening; the latest opening at or before
// kickoff is the game's. Times are the bar's wall clock, so DST weeks keep the partner's hours.

const ET = "America/New_York";
const PT = "America/Los_Angeles";
const ms = (iso: string) => Date.parse(iso);
const iso = (value: number) => new Date(value).toISOString();
const win = (openDay: string, openTime: string, closeDay: string, closeTime: string): PickEmPickWindow =>
  readPickEmPickWindow({ openDay, openTime, closeDay, closeTime })!;

const MON_WED = win("mon", "00:00", "wed", "23:59");

describe("which window instance covers a game", () => {
  it("a Saturday game belongs to that week's Mon-Wed window (Eastern daylight time)", () => {
    const instance = pickWindowInstanceAt(MON_WED, ms("2026-10-31T19:00:00Z"), ET); // Sat 3 pm EDT
    expect(iso(instance.opensAtMs)).toBe("2026-10-26T04:00:00.000Z"); // Mon 12:00 AM EDT
    expect(iso(instance.closesAtMs)).toBe("2026-10-29T03:59:00.000Z"); // Wed 11:59 PM EDT
  });

  it("a game exactly at the opening is covered by it; one minute earlier, by the week before", () => {
    expect(iso(pickWindowInstanceAt(MON_WED, ms("2026-10-26T04:00:00Z"), ET).opensAtMs)).toBe("2026-10-26T04:00:00.000Z");
    expect(iso(pickWindowInstanceAt(MON_WED, ms("2026-10-26T03:59:00Z"), ET).opensAtMs)).toBe("2026-10-19T04:00:00.000Z");
  });

  it("a game on the opening day but before the opening time belongs to the week before", () => {
    const window = win("sat", "12:00", "sat", "13:00");
    const instance = pickWindowInstanceAt(window, ms("2026-10-31T15:00:00Z"), ET); // Sat 11 am EDT
    expect(iso(instance.opensAtMs)).toBe("2026-10-24T16:00:00.000Z");
  });

  it("keeps wall-clock hours across the autumn DST change (EDT open, EST close)", () => {
    // US clocks fall back Sun 2026-11-01 2:00 AM. Window Thu 12:00 AM - Mon 11:59 PM.
    const window = win("thu", "00:00", "mon", "23:59");
    const instance = pickWindowInstanceAt(window, ms("2026-11-01T18:00:00Z"), ET); // Sun 1 pm EST
    expect(iso(instance.opensAtMs)).toBe("2026-10-29T04:00:00.000Z"); // Thu 12:00 AM EDT (UTC-4)
    expect(iso(instance.closesAtMs)).toBe("2026-11-03T04:59:00.000Z"); // Mon 11:59 PM EST (UTC-5)
  });

  it("keeps wall-clock hours across the spring DST change (EST open, EDT close)", () => {
    // US clocks spring forward Sun 2027-03-14 2:00 AM. Window Sat 8:00 PM - Sun 12:00 PM.
    const window = win("sat", "20:00", "sun", "12:00");
    const instance = pickWindowInstanceAt(window, ms("2027-03-14T17:00:00Z"), ET); // Sun 1 pm EDT
    expect(iso(instance.opensAtMs)).toBe("2027-03-14T01:00:00.000Z"); // Sat 8:00 PM EST
    expect(iso(instance.closesAtMs)).toBe("2027-03-14T16:00:00.000Z"); // Sun 12:00 PM EDT
    expect(instance.closesAtMs - instance.opensAtMs).toBe(15 * 3_600_000); // 16 wall-clock hours, one skipped
  });

  it("a window may wrap the week (Thu 8 PM - Mon 1 AM)", () => {
    const window = win("thu", "20:00", "mon", "01:00");
    const instance = pickWindowInstanceAt(window, ms("2026-11-08T18:00:00Z"), ET); // Sun 1 pm EST
    expect(iso(instance.opensAtMs)).toBe("2026-11-06T01:00:00.000Z"); // Thu 8:00 PM EST
    expect(iso(instance.closesAtMs)).toBe("2026-11-09T06:00:00.000Z"); // Mon 1:00 AM EST
  });

  it("a close earlier on the opening day means next week's (Mon 6 PM - Mon 10 AM)", () => {
    const window = win("mon", "18:00", "mon", "10:00");
    expect(pickWindowLengthMinutes(window)).toBe(7 * 24 * 60 - 8 * 60);
    const instance = pickWindowInstanceAt(window, ms("2026-11-04T17:00:00Z"), ET); // Wed noon EST
    expect(iso(instance.opensAtMs)).toBe("2026-11-02T23:00:00.000Z"); // Mon 6:00 PM EST
    expect(iso(instance.closesAtMs)).toBe("2026-11-09T15:00:00.000Z"); // next Mon 10:00 AM EST
  });

  it("uses the bar's own time zone", () => {
    const instance = pickWindowInstanceAt(MON_WED, ms("2026-11-07T20:00:00Z"), PT); // Sat noon PST
    expect(iso(instance.opensAtMs)).toBe("2026-11-02T08:00:00.000Z"); // Mon 12:00 AM PST
    expect(iso(instance.closesAtMs)).toBe("2026-11-05T07:59:00.000Z"); // Wed 11:59 PM PST
  });
});

describe("whether picks are open now", () => {
  const kickoffMs = ms("2026-10-31T19:00:00Z"); // Sat; window Mon 04:00Z - Thu 03:59Z
  const status = (nowIso: string) => pickWindowStatusForGame({ window: MON_WED, kickoffMs, nowMs: ms(nowIso), timeZone: ET });

  it("is open from the opening up to (not including) the close", () => {
    expect(status("2026-10-26T03:59:59Z").isOpen).toBe(false);
    expect(status("2026-10-26T04:00:00Z").isOpen).toBe(true);
    expect(status("2026-10-28T20:00:00Z").isOpen).toBe(true);
    expect(status("2026-10-29T03:58:59Z").isOpen).toBe(true);
    expect(status("2026-10-29T03:59:00Z").isOpen).toBe(false);
  });

  it("is closed on game day for a Mon-Wed window, and for next week's games until next Monday", () => {
    expect(status("2026-10-31T15:00:00Z").isOpen).toBe(false);
    const nextSat = pickWindowStatusForGame({
      window: MON_WED,
      kickoffMs: ms("2026-11-07T19:00:00Z"),
      nowMs: ms("2026-10-31T15:00:00Z"),
      timeZone: ET,
    });
    expect(nextSat.isOpen).toBe(false);
    expect(iso(nextSat.opensAtMs)).toBe("2026-11-02T05:00:00.000Z"); // Mon 12:00 AM EST (after the change)
  });

  it("a game inside its own window is open until it closes (kickoff lock is separate)", () => {
    const tuesdayGame = pickWindowStatusForGame({
      window: MON_WED,
      kickoffMs: ms("2026-10-27T23:00:00Z"), // Tue 7 pm EDT
      nowMs: ms("2026-10-27T12:00:00Z"),
      timeZone: ET,
    });
    expect(tuesdayGame.isOpen).toBe(true);
  });
});

describe("words", () => {
  it("formats 12-hour times", () => {
    expect(formatPickWindowTime("00:00")).toBe("12:00 AM");
    expect(formatPickWindowTime("09:05")).toBe("9:05 AM");
    expect(formatPickWindowTime("12:00")).toBe("12:00 PM");
    expect(formatPickWindowTime("23:59")).toBe("11:59 PM");
  });
});

describe("shape", () => {
  it("refuses a malformed window, and one that opens and closes at the same moment", () => {
    expect(readPickEmPickWindow({ openDay: "mon", openTime: "0:00", closeDay: "wed", closeTime: "23:59" })).toBeNull();
    expect(readPickEmPickWindow({ openDay: "monday", openTime: "00:00", closeDay: "wed", closeTime: "23:59" })).toBeNull();
    expect(readPickEmPickWindow({ openDay: "mon", openTime: "00:00", closeDay: "mon", closeTime: "00:00" })).toBeNull();
    expect(readPickEmPickWindow(null)).toBeNull();
  });

  it("round-trips the stored jsonb and applies per-sport changes", () => {
    const stored = toStoredPickWindows({ ncaaf: MON_WED });
    expect(stored).toEqual({ ncaaf: { open_day: "mon", open_time: "00:00", close_day: "wed", close_time: "23:59" } });
    expect(parseStoredPickWindows(stored)).toEqual({ ncaaf: MON_WED });
    expect(parseStoredPickWindows(null)).toEqual({});
    expect(parseStoredPickWindows([stored])).toEqual({});

    const nfl = win("tue", "09:00", "thu", "20:00");
    expect(applyPickWindowChanges({ ncaaf: MON_WED }, { nfl, ncaaf: null })).toEqual({ nfl });
  });
});

describe("pick ahead (B2)", () => {
  it("the next opening is a week later on the wall clock, across a DST change", () => {
    // Thu 2026-10-29 12:00 AM EDT → Thu 2026-11-05 12:00 AM EST: 7 days + 1 hour.
    const window = win("thu", "00:00", "sat", "23:59");
    expect(iso(nextPickWindowOpeningMs(window, ms("2026-10-29T04:00:00Z"), ET))).toBe("2026-11-05T05:00:00.000Z");
    // Spring: Sat 2027-03-13 8 PM EST → Sat 2027-03-20 8 PM EDT: 7 days - 1 hour.
    const spring = win("sat", "20:00", "sun", "12:00");
    expect(iso(nextPickWindowOpeningMs(spring, ms("2027-03-14T01:00:00Z"), ET))).toBe("2027-03-21T00:00:00.000Z");
  });

  it("while a window is open, the reach stops at its last covered moment; shut, it is a week", () => {
    const tuesdayNoon = ms("2026-11-03T17:00:00Z"); // Tue noon EST, inside Mon-Wed
    expect(iso(pickAheadHorizonMs({ window: MON_WED, nowMs: tuesdayNoon, timeZone: ET }))).toBe("2026-11-09T04:59:59.999Z"); // next Mon 12:00 AM EST, less 1 ms
    const thursdayNoon = ms("2026-11-05T17:00:00Z"); // shut since Wed 11:59 PM
    expect(pickAheadHorizonMs({ window: MON_WED, nowMs: thursdayNoon, timeZone: ET })).toBe(thursdayNoon + 7 * 86_400_000);
  });

  it("never reaches more than seven days even when the open window covers longer", () => {
    const window = win("mon", "18:00", "mon", "10:00"); // open almost all week
    const wednesday = ms("2026-11-04T17:00:00Z");
    expect(pickAheadHorizonMs({ window, nowMs: wednesday, timeZone: ET })).toBeLessThanOrEqual(wednesday + 7 * 86_400_000);
  });

  it("formats an instant on the bar's clock with a plain space", () => {
    expect(formatPickWindowInstant(ms("2026-11-05T04:59:00Z"), ET)).toBe("Wed 11:59 PM");
    expect(formatPickWindowInstant(ms("2026-11-02T08:00:00Z"), PT)).toBe("Mon 12:00 AM");
  });

  it("one line per state: close while open, open before, closed after", () => {
    const saturdayGame = ms("2026-11-07T20:00:00Z"); // Sat 3 pm EST, window Mon 11/2 - Wed 11/4
    const view = (now: string) => pickWindowViewForGame({ window: MON_WED, kickoffMs: saturdayGame, nowMs: ms(now), timeZone: ET });
    expect(view("2026-11-03T17:00:00Z")).toEqual({
      opensAt: "2026-11-02T05:00:00.000Z",
      closesAt: "2026-11-05T04:59:00.000Z",
      isOpen: true,
      line: "Picks close Wed 11:59 PM",
    });
    expect(view("2026-11-01T17:00:00Z")).toMatchObject({ isOpen: false, line: "Picks open Mon 12:00 AM" });
    expect(view("2026-11-05T17:00:00Z")).toMatchObject({ isOpen: false, line: "Picks closed" });
  });

  it("a list's facts skip started games and use the first game still to start", () => {
    const facts = pickWindowViewForGames({
      window: MON_WED,
      nowMs: ms("2026-11-05T17:00:00Z"), // Thu: this week's window is shut
      timeZone: ET,
      games: [
        { id: "started", startsAt: "2026-11-05T16:00:00Z", isLocked: true },
        { id: "next-mon", startsAt: "2026-11-09T17:00:00Z", isLocked: false }, // next window, opens Mon
        { id: "sat", startsAt: "2026-11-07T20:00:00Z", isLocked: false },
      ],
    });
    expect(facts.view?.line).toBe("Picks closed"); // Saturday's game comes first
    expect([...facts.closedLines.entries()]).toEqual([
      ["next-mon", "Picks open Mon 12:00 AM"],
      ["sat", "Picks closed"],
    ]);
    expect(pickWindowViewForGames({ window: MON_WED, nowMs: 0, timeZone: ET, games: [] }).view).toBeNull();
  });
});

describe("which weekdays a window is open on", () => {
  const days = (window: PickEmPickWindow) => [...pickWindowOpenWeekdays(window)].sort();
  it("a window that wraps round to its own opening day covers all seven", () => {
    expect(days(win("mon", "12:00", "mon", "08:00"))).toEqual(["fri", "mon", "sat", "sun", "thu", "tue", "wed"]);
  });
  it("a same-day window is that day only", () => {
    expect(days(win("mon", "08:00", "mon", "12:00"))).toEqual(["mon"]);
  });
  it("Mon 12 AM to Wed 11:59 PM is Mon to Wed", () => {
    expect(days(win("mon", "00:00", "wed", "23:59"))).toEqual(["mon", "tue", "wed"]);
  });
  it("a close at exactly 12 AM leaves its day out", () => {
    expect(days(win("mon", "00:00", "thu", "00:00"))).toEqual(["mon", "tue", "wed"]);
  });
  it("a window can run over the weekend into the next week", () => {
    expect(days(win("fri", "18:00", "mon", "00:00"))).toEqual(["fri", "sat", "sun"]);
  });
});

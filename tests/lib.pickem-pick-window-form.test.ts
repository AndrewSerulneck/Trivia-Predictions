import { describe, expect, it } from "vitest";
import {
  DEFAULT_PICK_WINDOW,
  PICK_WINDOW_FORM_SPORTS,
  PICK_WINDOW_SAME_TIME_MESSAGE,
  describePickWindow,
  pickWindowChangesFromDrafts,
  pickWindowDraftsError,
  pickWindowShown,
} from "@/lib/pickemPickWindowForm";
import { pickemPrizePickWindowNotice } from "@/lib/pickemPrizeWizard";
import { readPickEmPickWindowChanges, type PickEmPickWindow } from "@/lib/pickemPickWindow";

// Away-mode plan Phase B4: the Game Settings pick-window form and the Pick 'Em Prize wizard's one line.
const MON_WED: PickEmPickWindow = DEFAULT_PICK_WINDOW;
const TZ = "America/New_York";

describe("pick-window form", () => {
  it("lists College Football and NFL Pick 'Em first, every Pick 'Em sport once", () => {
    const slugs = PICK_WINDOW_FORM_SPORTS.map((sport) => sport.slug);
    expect(slugs.slice(0, 2)).toEqual(["ncaaf", "nfl"]);
    expect(new Set(slugs).size).toBe(8);
  });

  it("describes a window in the bar's words", () => {
    expect(describePickWindow(MON_WED)).toBe("Mon 12:00 AM – Wed 11:59 PM");
  });

  it("shows the draft, else the saved window, else always open", () => {
    expect(pickWindowShown({}, {}, "ncaaf")).toBeNull();
    expect(pickWindowShown({ ncaaf: MON_WED }, {}, "ncaaf")).toEqual(MON_WED);
    expect(pickWindowShown({ ncaaf: MON_WED }, { ncaaf: null }, "ncaaf")).toBeNull();
  });

  it("sends only the sports that changed, in the shape the save accepts", () => {
    expect(pickWindowChangesFromDrafts({}, {})).toBeNull();
    expect(pickWindowChangesFromDrafts({ ncaaf: MON_WED }, { ncaaf: { ...MON_WED } })).toBeNull();
    expect(pickWindowChangesFromDrafts({}, { nba: null })).toBeNull();
    const changes = pickWindowChangesFromDrafts(
      { ncaaf: MON_WED },
      { ncaaf: null, nfl: { ...MON_WED, closeDay: "thu" }, nba: null },
    );
    expect(changes).toEqual({ ncaaf: null, nfl: { ...MON_WED, closeDay: "thu" } });
    expect(readPickEmPickWindowChanges(changes)).toEqual(changes);
  });

  it("refuses a window that opens and closes at the same moment", () => {
    expect(pickWindowDraftsError({ ncaaf: MON_WED })).toBeNull();
    expect(pickWindowDraftsError({ ncaaf: { ...MON_WED, closeDay: "mon", closeTime: "00:00" } })).toBe(
      PICK_WINDOW_SAME_TIME_MESSAGE,
    );
  });
});

describe("Pick 'Em Prize wizard: pick-window notice", () => {
  // Tue, Nov 10 2026, 12:00 PM Eastern.
  const nowMs = Date.parse("2026-11-10T17:00:00Z");
  const base = { today: "2026-11-10", timeZone: TZ, nowMs };
  const college = { sports: ["ncaaf" as const], leagues: [] };

  it("says nothing without a window for a scoped sport", () => {
    expect(
      pickemPrizePickWindowNotice({ ...base, scope: college, prizeWindow: { kind: "weekday", weekday: "sat" }, pickWindows: {} }),
    ).toBeNull();
    expect(
      pickemPrizePickWindowNotice({
        ...base,
        scope: { sports: ["nba"], leagues: [] },
        prizeWindow: { kind: "weekday", weekday: "sat" },
        pickWindows: { ncaaf: MON_WED },
      }),
    ).toBeNull();
  });

  it("says nothing when every prize day is a window day", () => {
    expect(
      pickemPrizePickWindowNotice({ ...base, scope: college, prizeWindow: { kind: "weekday", weekday: "tue" }, pickWindows: { ncaaf: MON_WED } }),
    ).toBeNull();
  });

  it("says nothing for a window that wraps round the week (Mon 12 PM to Mon 8 AM is open every day)", () => {
    const wrapping: PickEmPickWindow = { openDay: "mon", openTime: "12:00", closeDay: "mon", closeTime: "08:00" };
    expect(
      pickemPrizePickWindowNotice({ ...base, scope: college, prizeWindow: { kind: "weekday", weekday: "sat" }, pickWindows: { ncaaf: wrapping } }),
    ).toBeNull();
  });

  it("names the window when a prize day is outside it (a league counts as its sport)", () => {
    const line = "College Football picks are open Mon 12:00 AM – Wed 11:59 PM only (Game Settings).";
    expect(
      pickemPrizePickWindowNotice({ ...base, scope: college, prizeWindow: { kind: "weekday", weekday: "sat" }, pickWindows: { ncaaf: MON_WED } }),
    ).toBe(line);
    expect(
      pickemPrizePickWindowNotice({
        ...base,
        scope: { sports: [], leagues: ["americanfootball_ncaaf"] },
        prizeWindow: { kind: "day", date: "2026-11-14" },
        pickWindows: { ncaaf: MON_WED },
      }),
    ).toBe(line);
  });

  it("says the first day's picks already closed", () => {
    // Thu, Nov 12: this week's window closed Wed 11:59 PM.
    const thursday = { today: "2026-11-12", timeZone: TZ, nowMs: Date.parse("2026-11-12T17:00:00Z") };
    expect(
      pickemPrizePickWindowNotice({ ...thursday, scope: college, prizeWindow: { kind: "day", date: "2026-11-14" }, pickWindows: { ncaaf: MON_WED } }),
    ).toBe("College Football picks for Sat, Nov 14 closed Wed 11:59 PM.");
    // Next week's Saturday is still ahead of its window.
    expect(
      pickemPrizePickWindowNotice({ ...thursday, scope: college, prizeWindow: { kind: "day", date: "2026-11-21" }, pickWindows: { ncaaf: MON_WED } }),
    ).toBe("College Football picks are open Mon 12:00 AM – Wed 11:59 PM only (Game Settings).");
  });
});

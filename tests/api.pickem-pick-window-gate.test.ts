import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Pick windows on the server (docs/cancelled-prizes-pick-windows-away-mode-plan.md B1): the gate
// (lib/pickemPickWindowGate.ts) fails OPEN on our own read errors, refuses a closed window with a named
// error, and every pick write path asks it; the routes answer that error with 409.

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  settingsFail: false,
  pickWindows: {} as Record<string, unknown>,
  submitError: null as Error | null,
  clearError: null as Error | null,
}));

vi.mock("@/lib/venueGameSettings", () => ({
  getVenueGameSettings: vi.fn(async (venueId: string) => {
    if (state.settingsFail) throw new Error("settings down");
    return { venueId, pickWindows: state.pickWindows };
  }),
}));
vi.mock("@/lib/timezone", () => ({ getVenueTimezone: vi.fn(async () => "America/New_York") }));

vi.mock("@/lib/pickem", () => ({
  clearPickEmPick: vi.fn(async () => {
    if (state.clearError) throw state.clearError;
    return { cleared: true };
  }),
  listUserPickEmPicks: vi.fn(async () => []),
  settlePendingPickEmPicks: vi.fn(async () => null),
  submitPickEmPick: vi.fn(async () => {
    if (state.submitError) throw state.submitError;
    return { id: "pick-1" };
  }),
}));
vi.mock("@/lib/nflPickEm", () => ({
  clearNFLPick: vi.fn(async () => {
    if (state.clearError) throw state.clearError;
  }),
  submitNFLPickEmPick: vi.fn(async () => {
    if (state.submitError) throw state.submitError;
    return { id: "pick-1", gameId: "g1", selectedTeam: "A", status: "pending" };
  }),
}));
vi.mock("@/lib/serverSession", () => ({
  isSessionEnforced: () => false,
  readSession: () => "player-1",
  resolveRequestUserId: () => ({ userId: "player-1", forbidden: false }),
}));
vi.mock("@/lib/venuePresence", () => ({
  maybeRequireActiveVenuePresence: vi.fn(async () => null),
  maybeRequireActiveVenuePresenceForUser: vi.fn(async () => null),
  venuePresenceErrorResponse: vi.fn(() => null),
}));

import { POST as postNFLPick } from "@/app/api/nfl-pickem/picks/route";
import { POST as postPick } from "@/app/api/pickem/picks/route";
import {
  PickEmPickWindowClosedError,
  assertPickEmPickWindowOpen,
  assertPickEmPickWindowOpenAtVenue,
  isPickEmPickWindowClosedError,
} from "@/lib/pickemPickWindowGate";
import type { PickEmPickWindow } from "@/lib/pickemPickWindow";
import { getVenueTimezone } from "@/lib/timezone";

const MON_WED: PickEmPickWindow = { openDay: "mon", openTime: "00:00", closeDay: "wed", closeTime: "23:59" };
const SATURDAY_GAME = "2026-10-31T19:00:00Z";
const SATURDAY_NOON_MS = Date.parse("2026-10-31T16:00:00Z");
const TUESDAY_MS = Date.parse("2026-10-27T16:00:00Z");

beforeEach(() => {
  state.settingsFail = false;
  state.pickWindows = {};
  state.submitError = null;
  state.clearError = null;
  vi.clearAllMocks();
});

describe("the pick-window gate", () => {
  it("refuses a closed window with a named error: closed for good, or when this game's window opens", async () => {
    const refuse = (startsAt: string) =>
      assertPickEmPickWindowOpen({
        venueId: "venue-1",
        sportSlug: "ncaaf",
        startsAt,
        windows: { ncaaf: MON_WED },
        nowMs: SATURDAY_NOON_MS,
      }).catch((error: unknown) => error);
    // This Saturday's game: its Mon–Wed window has passed; next Monday's window is for later games.
    const passed = await refuse(SATURDAY_GAME);
    expect(isPickEmPickWindowClosedError(passed)).toBe(true);
    expect((passed as Error).message).toBe("Picks closed.");
    // Next Saturday's game: its window opens Monday.
    expect(((await refuse("2026-11-07T19:00:00Z")) as Error).message).toBe("Picks open Mon 12:00 AM.");
  });

  it("allows an open window, a sport with no window, no settings and an unreadable kickoff", async () => {
    const base = { venueId: "venue-1", sportSlug: "ncaaf", startsAt: SATURDAY_GAME };
    await expect(assertPickEmPickWindowOpen({ ...base, windows: { ncaaf: MON_WED }, nowMs: TUESDAY_MS })).resolves.toBeUndefined();
    await expect(assertPickEmPickWindowOpen({ ...base, windows: { nfl: MON_WED }, nowMs: SATURDAY_NOON_MS })).resolves.toBeUndefined();
    await expect(assertPickEmPickWindowOpen({ ...base, windows: null, nowMs: SATURDAY_NOON_MS })).resolves.toBeUndefined();
    await expect(
      assertPickEmPickWindowOpen({ ...base, startsAt: "soon", windows: { ncaaf: MON_WED }, nowMs: SATURDAY_NOON_MS }),
    ).resolves.toBeUndefined();
  });

  it("reads the bar's time zone only when the sport has a window", async () => {
    await assertPickEmPickWindowOpen({ venueId: "venue-1", sportSlug: "nba", startsAt: SATURDAY_GAME, windows: {} });
    expect(getVenueTimezone).not.toHaveBeenCalled();
  });

  it("fails OPEN when the settings read fails, and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.settingsFail = true;
    state.pickWindows = { ncaaf: MON_WED };
    await expect(
      assertPickEmPickWindowOpenAtVenue({ venueId: "venue-1", sportSlug: "ncaaf", startsAt: SATURDAY_GAME }),
    ).resolves.toBeUndefined();
    expect(String(warn.mock.calls[0]?.[0])).toContain("pick-window-read-failed");
    warn.mockRestore();
  });
});

describe("the pick routes answer a closed window with 409", () => {
  const closed = () => new PickEmPickWindowClosedError("Picks open Mon 12:00 AM.");
  const jsonPost = (body: Record<string, unknown>) =>
    new Request("http://x/api", { method: "POST", body: JSON.stringify(body) });

  it("POST /api/pickem/picks, making and clearing", async () => {
    state.submitError = closed();
    const made = await postPick(jsonPost({ venueId: "venue-1", sportSlug: "ncaaf", gameId: "g1", pickTeam: "A" }));
    expect(made.status).toBe(409);
    expect(await made.json()).toEqual({ ok: false, error: "Picks open Mon 12:00 AM." });

    state.clearError = closed();
    expect((await postPick(jsonPost({ action: "clear", gameId: "g1" }))).status).toBe(409);
  });

  it("POST /api/nfl-pickem/picks, making and clearing", async () => {
    state.submitError = closed();
    const body = { venueId: "venue-1", weekId: "w1", gameId: "g1", pickTeam: "A" };
    const made = await postNFLPick(jsonPost(body));
    expect(made.status).toBe(409);
    expect(await made.json()).toEqual({ ok: false, error: "Picks open Mon 12:00 AM." });

    state.clearError = closed();
    expect((await postNFLPick(jsonPost({ ...body, action: "clear" }))).status).toBe(409);
  });

  it("other errors keep their old status", async () => {
    state.submitError = new Error("Picks are locked for this game because it has already started.");
    expect((await postPick(jsonPost({ venueId: "venue-1", sportSlug: "ncaaf", gameId: "g1", pickTeam: "A" }))).status).toBe(400);
    expect((await postNFLPick(jsonPost({ venueId: "venue-1", weekId: "w1", gameId: "g1", pickTeam: "A" }))).status).toBe(400);
  });
});

describe("every pick write asks the window (contract)", () => {
  const source = (path: string) => readFileSync(path, "utf8");
  const body = (text: string, start: string, end: string) => {
    const from = text.indexOf(start);
    expect(from).toBeGreaterThan(-1);
    const to = text.indexOf(end, from + start.length);
    return text.slice(from, to === -1 ? undefined : to);
  };

  it("regular Pick 'Em: make/change and clear", () => {
    const pickem = source("lib/pickem.ts");
    const submit = body(pickem, "export async function submitPickEmPick", "\nasync function resolvePickScoringMode");
    expect(submit).toContain("readVenueGameSettingsForPick(venueId)");
    expect(submit).toContain("assertPickEmPickWindowOpen(");
    // The window check comes before any write.
    expect(submit.indexOf("assertPickEmPickWindowOpen(")).toBeLessThan(submit.indexOf(".update("));
    const clear = body(pickem, "export async function clearPickEmPick", "\nexport async function listUserPickEmPicks");
    expect(clear.indexOf("assertPickEmPickWindowOpenAtVenue(")).toBeGreaterThan(-1);
    expect(clear.indexOf("assertPickEmPickWindowOpenAtVenue(")).toBeLessThan(clear.indexOf(".delete()"));
  });

  it("NFL Pick 'Em: make/change and clear", () => {
    const nfl = source("lib/nflPickEm.ts");
    const submit = body(nfl, "export async function submitNFLPickEmPick", "\nasync function findNFLWeekContaining");
    expect(submit).toContain("readVenueGameSettingsForPick(params.venueId)");
    expect(submit).toContain("sportSlug: NFL_PICKEM_SPORT_SLUG");
    expect(submit.indexOf("assertPickEmPickWindowOpen(")).toBeGreaterThan(-1);
    expect(submit.indexOf("assertPickEmPickWindowOpen(")).toBeLessThan(submit.indexOf(".update("));
    const clear = body(nfl, "export async function clearNFLPick", "\n// ====");
    expect(clear.indexOf("assertPickEmPickWindowOpenAtVenue(")).toBeGreaterThan(-1);
    expect(clear.indexOf("assertPickEmPickWindowOpenAtVenue(")).toBeLessThan(clear.indexOf(".delete()"));
  });

  it("the Pick 'Em Prize tiebreaker guess", () => {
    const route = source("app/api/pickem/prize-tiebreaker/route.ts");
    const post = body(route, "export async function POST", "\nexport async function");
    expect(post.indexOf("assertPickEmPickWindowOpenAtVenue(")).toBeGreaterThan(-1);
    expect(post.indexOf("assertPickEmPickWindowOpenAtVenue(")).toBeLessThan(post.indexOf("savePickEmPrizeGuess("));
    expect(post).toContain("isPickEmPickWindowClosedError(error)");
  });
});

// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// N3 follow-up: the first load can be the server's stale pre-game feed copy, so a list with a started, unfinished
// game reloads once after FRESH_RECHECK_DELAY_MS, and only once.

vi.mock("@/lib/storage", () => ({ getUserId: () => "user-1", getUsername: () => "guest", getVenueId: () => "venue-1" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement("a", { href }, children),
}));
const presence = { capturePresenceFailure: () => null, isInteractionBlocked: false };
vi.mock("@/components/venue/VenuePresenceBoundary", () => ({ useVenuePresence: () => presence }));
vi.mock("@/components/venue/AppBar", () => ({ GameAppBar: () => null }));
vi.mock("@/components/ui/HightopLoader", () => ({ HightopLoader: () => React.createElement("p", null, "Loading") }));
vi.mock("@/components/ui/InlineSlotAdClient", () => ({ InlineSlotAdClient: () => null }));
vi.mock("@/components/ui/CoinFXCanvas", () => ({ CoinFXCanvas: () => null }));
vi.mock("@/components/social-share/ShareWinButton", () => ({ ShareWinButton: () => null }));

import { FRESH_RECHECK_DELAY_MS, needsFreshRecheck, PickEmGameList } from "@/components/pickem/PickEmGameList";

const keyOf = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const TODAY = keyOf(0);
const SPORTS = [
  { slug: "ncaaf", label: "College Football", subtitle: "FBS", isInSeason: true, isClickable: true },
  { slug: "mlb", label: "MLB", subtitle: "Baseball", isInSeason: true, isClickable: true },
];
const game = (id: string) => ({
  id,
  sportSlug: "ncaaf",
  sportKey: "americanfootball_ncaaf",
  league: "College Football",
  homeTeam: `Home ${id}`,
  awayTeam: `Away ${id}`,
  startsAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
  isLocked: false,
  status: "scheduled",
  homeScore: null,
  awayScore: null,
  winnerTeam: null,
});

type GamesReply = Record<string, unknown>;
const stubFetch = (reply: (url: URL) => GamesReply | Promise<GamesReply>) => {
  const gamesCalls: URL[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    let body: unknown = { ok: true };
    if (url.pathname === "/api/pickem/sports") body = { ok: true, sports: SPORTS };
    else if (url.pathname === "/api/pickem/games") {
      gamesCalls.push(url);
      body = { ok: true, ...(await reply(url)) };
    }
    return { ok: true, json: async () => body, text: async () => JSON.stringify(body) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return gamesCalls;
};
const sportOf = (url: URL) => SPORTS.find((s) => s.slug === url.searchParams.get("sportSlug")) ?? SPORTS[0];

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const wait = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});

describe("needsFreshRecheck", () => {
  it("is true only when a game has started and isn't final", () => {
    expect(needsFreshRecheck([{ status: "scheduled" }, { status: "live" }])).toBe(true);
    expect(needsFreshRecheck([{ status: "scheduled" }, { status: "final" }])).toBe(false);
    expect(needsFreshRecheck([])).toBe(false);
  });
});

describe("Pick 'Em list rechecks a stale first load (N3 follow-up)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a list with a live game reloads once, 5 s later, and shows the fresh copy", async () => {
    let n = 0;
    const calls = stubFetch((url) => {
      n += 1;
      return n === 1
        ? { sport: sportOf(url), date: TODAY, games: [{ ...game("a"), status: "live", isLocked: true }] }
        : { sport: sportOf(url), date: TODAY, games: [{ ...game("a"), status: "final", isLocked: true, homeTeam: "Fresh a" }] };
    });
    render(React.createElement(PickEmGameList, { initialSportSlug: "ncaaf", initialDate: TODAY }));
    await screen.findByText("Away a");
    expect(calls).toHaveLength(1);
    await wait(FRESH_RECHECK_DELAY_MS - 500);
    expect(calls).toHaveLength(1);
    await wait(1_000);
    expect(calls).toHaveLength(2);
    await screen.findByText("Fresh a");
    await wait(FRESH_RECHECK_DELAY_MS * 2);
    expect(calls).toHaveLength(2);
  });

  it("a list with no started game doesn't reload", async () => {
    const calls = stubFetch((url) => ({ sport: sportOf(url), date: TODAY, games: [game("a")] }));
    render(React.createElement(PickEmGameList, { initialSportSlug: "ncaaf", initialDate: TODAY }));
    await screen.findByText("Away a");
    await wait(FRESH_RECHECK_DELAY_MS * 2);
    expect(calls).toHaveLength(1);
  });
});

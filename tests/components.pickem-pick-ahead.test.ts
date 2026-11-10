// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Away-mode plan R9: the server picks the day, and the list follows it instead of loading twice.

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

import { PickEmGameList } from "@/components/pickem/PickEmGameList";

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

describe("Pick 'Em list follows the day the server served (R9)", () => {
  it("a deep link to a future day for a sport with no window loads once and lands on today", async () => {
    const calls = stubFetch((url) => ({ sport: sportOf(url), date: TODAY, games: [game("a")] }));
    render(React.createElement(PickEmGameList, { initialSportSlug: "ncaaf", initialDate: keyOf(2) }));
    await screen.findByText("Away a");
    await waitFor(() => expect(screen.getByText(/\(Today\)/)).toBeTruthy());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get("date")).toBe(keyOf(2));
  });

  it("a background reply for another day changes nothing", async () => {
    let n = 0;
    stubFetch((url) => {
      n += 1;
      return n === 1
        ? { sport: sportOf(url), date: TODAY, games: [game("a")], pickAheadThrough: keyOf(3) }
        : { sport: sportOf(url), date: keyOf(1), games: [game("b")], pickAheadThrough: undefined };
    });
    render(React.createElement(PickEmGameList, { initialSportSlug: "ncaaf", initialDate: TODAY }));
    await screen.findByText("Away a");
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(n).toBeGreaterThan(1);
    expect(screen.getByText("Away a")).toBeTruthy();
    expect(screen.queryByText("Away b")).toBeNull();
    expect((screen.getByLabelText("Next day") as HTMLButtonElement).disabled).toBe(false);
  });

  it("switching sport turns the next-day arrow off at once", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubFetch(async (url) => {
      if (url.searchParams.get("sportSlug") === "mlb") await gate;
      return { sport: sportOf(url), date: TODAY, games: [game("a")], pickAheadThrough: keyOf(3) };
    });
    render(React.createElement(PickEmGameList, { initialSportSlug: "ncaaf", initialDate: TODAY }));
    await screen.findByText("Away a");
    expect((screen.getByLabelText("Next day") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText("MLB"));
    expect((screen.getByLabelText("Next day") as HTMLButtonElement).disabled).toBe(true);
    release();
  });
});

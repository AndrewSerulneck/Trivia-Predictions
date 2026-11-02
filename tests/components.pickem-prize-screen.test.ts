// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pick 'Em plan Phase 6: the games list prints a Pick 'Em Prize line from the games response (no request of
// its own), blocks NEW picks once a limit is used up, and shows the tiebreaker card for a "most right" prize.

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
import { PickEmPrizeTiebreakerCard } from "@/components/pickem/PickEmPrizeTiebreakerCard";
import type { PickEmGamePrize } from "@/lib/pickemPrizeLine";

const today = new Date();
const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const SPORT = { slug: "ncaaf", label: "College Football", subtitle: "FBS", isInSeason: true, isClickable: true };
const game = (id: string, overrides: Record<string, unknown> = {}) => ({
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
  scoringMode: "standard",
  ...overrides,
});
const TIERS_PRIZE: PickEmGamePrize = {
  campaignId: "prize-1",
  kind: "tiers",
  when: "today",
  target: null,
  minPicks: null,
  limit: 20,
  tierCorrects: [12, 15, 18],
  picksLeft: 14,
  limitMessage: null,
  hasTiebreaker: false,
};

const calls: string[] = [];
function stubFetch(gamesBody: Record<string, unknown>, extra: (url: string, init?: RequestInit) => unknown = () => undefined) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const custom = extra(url, init);
    if (custom !== undefined) return { ok: true, json: async () => custom, text: async () => JSON.stringify(custom) };
    let body: unknown = { ok: true };
    if (url.startsWith("/api/pickem/sports")) body = { ok: true, sports: [SPORT] };
    else if (url.startsWith("/api/pickem/games")) body = { ok: true, sport: SPORT, date: todayKey, ...gamesBody };
    return { ok: true, json: async () => body, text: async () => JSON.stringify(body) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Pick 'Em games list: the prize line", () => {
  it("prints each prize line from the games response, with picks left", async () => {
    stubFetch({ games: [game("a")], prizes: [TIERS_PRIZE] });
    render(React.createElement(PickEmGameList, { initialSportSlug: "ncaaf", initialDate: todayKey }));
    const lines = await screen.findByTestId("pickem-prize-lines");
    expect(lines.textContent).toBe("Prize today: 12, 15 or 18 of 20 right · 14 picks left");
    // The prize rides on the games request: nothing else is asked for it.
    expect(calls.some((url) => url.includes("prize"))).toBe(false);
  });

  it("shows no prize line when the bar has none", async () => {
    stubFetch({ games: [game("a")], prizes: [] });
    render(React.createElement(PickEmGameList, { initialSportSlug: "ncaaf", initialDate: todayKey }));
    await screen.findByText("Away a");
    expect(screen.queryByTestId("pickem-prize-lines")).toBeNull();
  });

  it("a used-up limit says why and blocks a NEW pick, but not a pick already made", async () => {
    const message = "This bar's prize counts your first 20 college football picks today, and you've already used all 20.";
    const fetchMock = stubFetch({
      games: [game("fresh", { pickLimitReached: true }), game("made", { pickLimitReached: false, userPickTeam: "Away made", userPickStatus: "pending" })],
      prizes: [{ ...TIERS_PRIZE, picksLeft: 0, limitMessage: message }],
    });
    render(React.createElement(PickEmGameList, { initialSportSlug: "ncaaf", initialDate: todayKey }));
    const freshAway = await screen.findByText("Away fresh");
    expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);

    fireEvent.click(freshAway.closest("button") as HTMLButtonElement);
    expect(fetchMock.mock.calls.some(([url, init]) => String(url) === "/api/pickem/picks" && (init as RequestInit | undefined)?.method === "POST")).toBe(false);
    expect((freshAway.closest("button") as HTMLButtonElement).getAttribute("aria-disabled")).toBe("true");

    // The pick already made can still be changed.
    const madeHome = screen.getByText("Home made").closest("button") as HTMLButtonElement;
    expect(madeHome.getAttribute("aria-disabled")).toBe("false");
  });
});

describe("Pick 'Em games list: the tiebreaker card", () => {
  const MOST_RIGHT: PickEmGamePrize = {
    campaignId: "prize-2",
    kind: "most_right",
    when: "today",
    target: null,
    minPicks: 5,
    limit: null,
    tierCorrects: [],
    picksLeft: null,
    limitMessage: null,
    hasTiebreaker: true,
  };

  it("appears for a 'most right' prize that runs today, using the prize's own route", async () => {
    stubFetch({ games: [game("a")], prizes: [MOST_RIGHT] }, (url) =>
      url.startsWith("/api/pickem/prize-tiebreaker")
        ? { ok: true, game: { gameId: "g9", homeTeam: "Tigers", awayTeam: "Bulldogs", startsAt: new Date(Date.now() + 9 * 3600_000).toISOString(), isLocked: false }, guess: null }
        : undefined,
    );
    render(React.createElement(PickEmGameList, { initialSportSlug: "ncaaf", initialDate: todayKey }));
    expect(await screen.findByText("How many total points will be scored in Bulldogs at Tigers?")).toBeTruthy();
    expect(calls.filter((url) => url.startsWith("/api/pickem/prize-tiebreaker?"))).toHaveLength(1);
    expect(calls.find((url) => url.startsWith("/api/pickem/prize-tiebreaker?"))).toContain("campaignId=prize-2");
  });

  it("is not asked for when no prize has a tiebreaker", async () => {
    stubFetch({ games: [game("a")], prizes: [TIERS_PRIZE] });
    render(React.createElement(PickEmGameList, { initialSportSlug: "ncaaf", initialDate: todayKey }));
    await screen.findByText("Away a");
    expect(calls.some((url) => url.includes("prize-tiebreaker"))).toBe(false);
  });
});

describe("PickEmPrizeTiebreakerCard", () => {
  const response = (body: unknown) => ({ ok: true, json: async () => body });
  const open = { gameId: "g", homeTeam: "Tigers", awayTeam: "Bulldogs", startsAt: "2099-11-07T23:00:00Z", isLocked: false };

  it("saves a guess to the Pick 'Em Prize route and confirms it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ ok: true, game: open, guess: null }))
      .mockResolvedValueOnce(response({ ok: true, guess: { predictedTotal: 61 } }));
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(PickEmPrizeTiebreakerCard, { venueId: "venue-1", userId: "user-1", campaignId: "prize-2" }));
    const input = await screen.findByLabelText("Predicted total points");
    fireEvent.change(input, { target: { value: "61" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Your guess of 61 is saved")).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/pickem/prize-tiebreaker");
    expect(JSON.parse(String(init.body))).toEqual({ userId: "user-1", venueId: "venue-1", campaignId: "prize-2", predictedTotal: 61 });
  });

  it("refuses a number outside 0–400 without asking the server", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ ok: true, game: open, guess: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(PickEmPrizeTiebreakerCard, { venueId: "venue-1", userId: "user-1", campaignId: "prize-2" }));
    fireEvent.change(await screen.findByLabelText("Predicted total points"), { target: { value: "401" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter a whole number between 0 and 400.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("once the game has started it shows the saved guess and no input", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ ok: true, game: { ...open, isLocked: true }, guess: { predictedTotal: 58 } })));
    render(React.createElement(PickEmPrizeTiebreakerCard, { venueId: "venue-1", userId: "user-1", campaignId: "prize-2" }));
    expect(await screen.findByText("Your guess: 58")).toBeTruthy();
    expect(screen.queryByLabelText("Predicted total points")).toBeNull();
  });

  it("renders nothing when there is no tiebreaker today", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: "This prize has no tiebreaker today." }) }));
    const { container } = render(React.createElement(PickEmPrizeTiebreakerCard, { venueId: "venue-1", userId: "user-1", campaignId: "prize-2" }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResultsSheet } from "@/components/owner/results/ResultsSheet";
import type { OwnerSheetId } from "@/lib/ownerSheetParams";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// docs/partner-results-page-plan.md Phase 4: the Results sheet is ONE timeline. It reads once per page,
// only while open, and fetches a game / player / reward only when it is tapped.

const GAME = {
  competitionId: "live_trivia",
  gameKey: "sched-1:2026-10-16",
  date: "2026-10-16",
  startsAt: null,
  title: "Friday Night Trivia",
  playerCount: 14,
  inProgress: false,
  winners: ["bobby_t"],
  topScore: 1240,
};

const CARD_REWARD = {
  rewardId: "rw-game",
  name: "Free appetizer",
  howWon: "Winner of the game",
  cycleStart: "2026-10-16T23:00:00Z",
  cycleLabel: "Fri, Oct 16",
  date: "2026-10-16",
  attach: { kind: "game", competitionId: "live_trivia", gameKey: "sched-1:2026-10-16" },
  winners: [{ place: null, username: "bobby_t", points: 1240 }],
  note: null,
};

const WEEK_REWARD = {
  rewardId: "rw-week",
  name: "Top players this week",
  howWon: "Top 3 players each week",
  cycleStart: "2026-10-12T04:00:00Z",
  cycleLabel: "Week of Mon, Oct 12",
  date: "2026-10-18",
  attach: { kind: "week", weekStart: "2026-10-12" },
  winners: [
    { place: 1, username: "bobby_t", points: 2100 },
    { place: 2, username: "kate99", points: 1900 },
  ],
  note: null,
};

const ORPHAN_REWARD = {
  rewardId: "rw-nfl",
  name: "NFL Pick 'Em",
  howWon: "Most picks right",
  cycleStart: "2026-10-05T04:00:00Z",
  cycleLabel: "Week of Mon, Oct 5",
  date: "2026-10-06",
  attach: { kind: "day", date: "2026-10-06" },
  winners: [{ place: null, username: "pickmaster", points: 11 }],
  note: null,
};

const standing = (rank: number, username: string | null, score: number, entry: string | null) => ({ rank, username, score, entry });
const STANDINGS = [
  ...Array.from({ length: 12 }, (_, i) => standing(i + 1, `player_${i + 1}`, 1300 - i * 10, `tok-${i + 1}`)),
  standing(13, null, 100, null),
];

const BREAKDOWN = {
  rows: [
    { group: "Round 1", label: "Q1", detail: "Which singer recorded Hound Dog?", outcome: "right", points: 10 },
    { group: "Round 1", label: "Q2", detail: "Capital of Peru?", outcome: "wrong", points: 0 },
    { group: "Round 2", label: "Q1", detail: "Largest planet?", outcome: "right", points: 10 },
  ],
  total: 20,
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const makeFetch = () =>
  vi.fn(async (url: string) => {
    if (url.startsWith("/api/owner/results?")) {
      return json({ ok: true, games: [GAME], rewards: [CARD_REWARD, WEEK_REWARD, ORPHAN_REWARD], nextBefore: null, firstGameDate: "2026-08-05" });
    }
    if (url.includes("/breakdown?")) return json({ ok: true, ...BREAKDOWN });
    if (url.startsWith("/api/owner/results/games/")) return json({ ok: true, game: GAME, standings: STANDINGS, rewards: [CARD_REWARD] });
    if (url.startsWith("/api/owner/history/rewards/")) {
      return json({
        ok: true,
        reward: {
          rewardId: "rw-game",
          name: "Free appetizer",
          howWon: "Winner of the game",
          isActive: true,
          truncated: false,
          cycles: [
            { cycleStart: "2026-10-16T23:00:00Z", label: "Fri, Oct 16", note: null, winners: [{ place: null, username: "bobby_t", points: 1240, prize: "Free appetizer", redeemed: false }] },
          ],
        },
      });
    }
    return json({ ok: false, error: "nope" });
  });

// A minimal in-memory stand-in for useOwnerSheet's URL mirroring. `toggle` closes/reopens it.
const Host = ({ initiallyOpen, initialStep = null }: { initiallyOpen: boolean; initialStep?: string | null }) => {
  const [sheet, setSheet] = useState<OwnerSheetId | null>(initiallyOpen ? "history" : null);
  const [step, setStep] = useState<string | null>(initialStep);
  const nav: UseOwnerSheetResult = {
    sheet,
    step,
    displayStepFor: (id) => (id === sheet ? step : null),
    openSheet: (id, next) => {
      setSheet(id);
      setStep(next ?? null);
    },
    goToStep: (next) => setStep(next),
    correctStep: (next) => setStep(next),
    goBack: (previous) => setStep(previous),
    closeSheet: () => {
      setSheet(null);
      setStep(null);
    },
  };
  return createElement(
    "div",
    null,
    createElement("button", { type: "button", onClick: () => setSheet((now) => (now ? null : "history")) }, "toggle"),
    createElement("div", { "data-testid": "step" }, step ?? "list"),
    createElement(ResultsSheet, { nav, venue: { id: "venue-1", name: "Garden State Bar" } }),
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const urls = (mock: ReturnType<typeof makeFetch>) => mock.mock.calls.map((call) => call[0]);

describe("ResultsSheet", () => {
  it("requests nothing while closed", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(Host, { initiallyOpen: false }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is one page, one request: a titled sheet, the game card with its winner and reward, and the week reward row", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(Host, { initiallyOpen: true }));
    await screen.findByText(/Live Trivia · Friday Night Trivia/);
    expect(urls(fetchMock)).toEqual(["/api/owner/results?venueId=venue-1"]);
    expect(screen.getByText("Garden State Bar")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull(); // no tabs
    expect(screen.getByText("14 players")).toBeTruthy();
    expect(screen.getByText(/🏆 bobby_t · 1,240 pts/)).toBeTruthy(); // unit from the registry
    expect(screen.getByText("🎁 Free appetizer → bobby_t")).toBeTruthy(); // a reward won AT the game
    expect(screen.getByText("🎁 Top players this week")).toBeTruthy();
    expect(screen.getByText("1st bobby_t · 2nd kate99")).toBeTruthy();
  });

  it("opens a game on tap with ONE request: the full standings, the search, a non-tappable deleted player", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(Host, { initiallyOpen: true }));
    fireEvent.click(await screen.findByRole("button", { name: /Live Trivia · Friday Night Trivia/ }));
    await screen.findByText("player_12");
    expect(urls(fetchMock)[1]).toBe("/api/owner/results/games/live_trivia/sched-1%3A2026-10-16?venueId=venue-1");
    expect(urls(fetchMock)).toHaveLength(2);
    expect(screen.getByTestId("step").textContent).toBe("game");
    // everyone, not the top 10
    expect(screen.getAllByRole("listitem").filter((li) => /^#\d/.test(li.textContent ?? "")).length).toBe(13);
    expect(screen.getByText("Deleted player").closest("button")).toBeNull();
    expect(screen.getByText("player_1").closest("button")).not.toBeNull();
    expect(screen.getByText("🎁 Free appetizer")).toBeTruthy(); // rewards won at this game

    fireEvent.change(screen.getByLabelText("Find a player"), { target: { value: "ER_1" } });
    expect(screen.getByText("player_1")).toBeTruthy();
    expect(screen.getByText("player_12")).toBeTruthy();
    expect(screen.queryByText("player_2")).toBeNull();
    fireEvent.change(screen.getByLabelText("Find a player"), { target: { value: "zzz" } });
    expect(screen.getByText(/No player matches/)).toBeTruthy();
  });

  it("opens a player's breakdown by entry token, shows right/wrong with the total, and Back keeps the search without a refetch", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(Host, { initiallyOpen: true }));
    fireEvent.click(await screen.findByRole("button", { name: /Live Trivia · Friday Night Trivia/ }));
    await screen.findByText("player_12");
    fireEvent.change(screen.getByLabelText("Find a player"), { target: { value: "player_3" } });
    fireEvent.click(screen.getByText("player_3").closest("button") as HTMLElement);

    await screen.findByText("Which singer recorded Hound Dog?");
    expect(urls(fetchMock)[2]).toBe(
      "/api/owner/results/games/live_trivia/sched-1%3A2026-10-16/breakdown?venueId=venue-1&entry=tok-3",
    );
    expect(screen.getByText("Round 1")).toBeTruthy();
    expect(screen.getByText("Round 2")).toBeTruthy();
    expect(screen.getAllByRole("img", { name: "Right" })).toHaveLength(2);
    expect(screen.getAllByRole("img", { name: "Wrong" })).toHaveLength(1);
    const total = screen.getByText("Total").parentElement as HTMLElement;
    expect(total.textContent).toContain("20 pts");

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    await waitFor(() => expect(screen.getByTestId("step").textContent).toBe("game"));
    expect(((await screen.findByLabelText("Find a player")) as HTMLInputElement).value).toBe("player_3");
    expect(urls(fetchMock)).toHaveLength(3); // the game was not read again
  });

  it("shows a reward with no game on the timeline as its own row, and opens its history", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(Host, { initiallyOpen: true }));
    await screen.findByText(/Live Trivia · Friday Night Trivia/);
    expect(screen.queryByText("🎁 NFL Pick 'Em")).toBeNull(); // its week (Oct 5 – 11) starts folded shut
    fireEvent.click(screen.getByRole("button", { name: /Oct 5 – 11/ }));
    await screen.findByText("🎁 NFL Pick 'Em");
    fireEvent.click(screen.getByRole("button", { name: /NFL Pick 'Em/ }));
    await screen.findByText(/Not redeemed yet/);
    expect(urls(fetchMock)[1]).toBe("/api/owner/history/rewards/rw-nfl?venueId=venue-1");
    expect(screen.getByTestId("step").textContent).toBe("prize");
  });

  it("an old `?sheet=history&step=reward` link (bookmark, open tab) lands on the timeline with the step cleared", async () => {
    vi.stubGlobal("fetch", makeFetch());
    render(createElement(Host, { initiallyOpen: true, initialStep: "reward" }));
    await waitFor(() => expect(screen.getByTestId("step").textContent).toBe("list"));
    await screen.findByText(/Live Trivia · Friday Night Trivia/);
  });

  it("a reload on a detail step the page forgot corrects to the timeline", async () => {
    vi.stubGlobal("fetch", makeFetch());
    render(createElement(Host, { initiallyOpen: true, initialStep: "player" }));
    await waitFor(() => expect(screen.getByTestId("step").textContent).toBe("list"));
    await screen.findByText(/Live Trivia · Friday Night Trivia/);
  });

  it("shows the empty state, and a failed first page can be retried", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return calls === 1 ? json({ ok: false, error: "Couldn't load results." }) : json({ ok: true, games: [], rewards: [], nextBefore: null });
      }),
    );
    render(createElement(Host, { initiallyOpen: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByText(/No results yet/);
  });

  it("Show more asks for the page before the cursor; one that lands after a close and reopen never replaces the fresh page", async () => {
    let releaseOlder: (response: Response) => void = () => {};
    const older = new Promise<Response>((resolve) => {
      releaseOlder = resolve;
    });
    const OLD = { ...GAME, gameKey: "sched-1:2026-09-04", date: "2026-09-04", title: "Old Timers Night" };
    const paged = vi.fn(async (url: string) => {
      if (url.includes("before=")) return older;
      return json({ ok: true, games: [GAME], rewards: [], nextBefore: "2026-10-16" });
    });
    vi.stubGlobal("fetch", paged);
    render(createElement(Host, { initiallyOpen: true }));
    await screen.findByText(/Friday Night Trivia/);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(paged).toHaveBeenCalledTimes(2));
    expect(paged.mock.calls[1]?.[0]).toBe("/api/owner/results?venueId=venue-1&before=2026-10-16");

    fireEvent.click(screen.getByRole("button", { name: "toggle" })); // close
    fireEvent.click(screen.getByRole("button", { name: "toggle" })); // reopen: timeline resets
    await waitFor(() => expect(paged).toHaveBeenCalledTimes(3));
    releaseOlder(json({ ok: true, games: [OLD], rewards: [], nextBefore: null }));
    await screen.findByText(/Friday Night Trivia/);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Old Timers Night/)).toBeNull();
  });
});

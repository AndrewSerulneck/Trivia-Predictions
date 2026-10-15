// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GameResultsSheet } from "@/components/owner/history/GameResultsSheet";
import type { OwnerSheetId } from "@/lib/ownerSheetParams";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// docs/live-trivia-weekly-places-reward-plan.md §5f (Phase 8): the Game Results sheet reads only while
// open, only for the selected venue, and mirrors the detail screen into `step`.

const GAME = {
  scheduleId: "sched-1",
  occurrenceDate: "2026-10-09",
  scheduleName: "Weekday Trivia",
  playerCount: 5,
  inProgress: false,
  topPoints: 90,
  winners: ["murph"],
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn(async (url: string) => {
  if (url.startsWith("/api/owner/history?") && url.includes("kind=games")) return json({ ok: true, games: [GAME], nextBefore: null });
  if (url.startsWith("/api/owner/history?") && url.includes("kind=rewards")) return json({ ok: true, rewards: [], nextBefore: null });
  if (url.startsWith("/api/owner/history/games/")) {
    return json({
      ok: true,
      game: { ...GAME, standings: [{ rank: 1, username: "murph", points: 90 }, { rank: 2, username: "kellygurl", points: 10 }] },
    });
  }
  return json({ ok: false, error: "nope" });
});

// A minimal in-memory stand-in for useOwnerSheet's URL mirroring. `toggle` closes/reopens it.
const Host = ({ initiallyOpen }: { initiallyOpen: boolean }) => {
  const [sheet, setSheet] = useState<OwnerSheetId | null>(initiallyOpen ? "history" : null);
  const [step, setStep] = useState<string | null>(null);
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
    createElement(GameResultsSheet, { nav, venue: { id: "venue-1", name: "Garden State Bar" } }),
  );
};

afterEach(() => {
  cleanup();
  fetchMock.mockClear();
  vi.unstubAllGlobals();
});

describe("GameResultsSheet", () => {
  it("requests nothing while closed", async () => {
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(Host, { initiallyOpen: false }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the venue's games, opens a game's standings, and loads Rewards only when that tab is chosen", async () => {
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(Host, { initiallyOpen: true }));
    await screen.findByText(/murph · 90 pts/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/owner/history?venueId=venue-1&kind=games");
    expect(screen.getByText("5 players")).toBeTruthy();
    expect(screen.getByText("Fri, Oct 9")).toBeTruthy(); // the day heading above the game

    fireEvent.click(screen.getByRole("button", { name: /Weekday Trivia/ }));
    await screen.findByText("kellygurl");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/owner/history/games/sched-1?venueId=venue-1&date=2026-10-09");

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    await screen.findByRole("tab", { name: "Rewards" });
    fireEvent.click(screen.getByRole("tab", { name: "Rewards" }));
    await screen.findByText("No reward has been won here yet.");
    expect(fetchMock.mock.calls.map((call) => call[0])).toContain("/api/owner/history?venueId=venue-1&kind=rewards");
  });

  it("a Show more that lands after the sheet was closed and reopened never replaces the fresh first page", async () => {
    let releaseOlder: (response: Response) => void = () => {};
    const older = new Promise<Response>((resolve) => {
      releaseOlder = resolve;
    });
    const OLD_GAME = { ...GAME, occurrenceDate: "2026-09-04", winners: ["oldtimer"] };
    const paged = vi.fn(async (url: string) => {
      if (url.includes("before=")) return older;
      return json({ ok: true, games: [GAME], nextBefore: "2026-10-09" });
    });
    vi.stubGlobal("fetch", paged);
    render(createElement(Host, { initiallyOpen: true }));
    await screen.findByText(/murph · 90 pts/);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(paged).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "toggle" })); // close
    fireEvent.click(screen.getByRole("button", { name: "toggle" })); // reopen: lists reset
    await waitFor(() => expect(paged).toHaveBeenCalledTimes(3));
    releaseOlder(json({ ok: true, games: [OLD_GAME], nextBefore: null }));
    await screen.findByText(/murph · 90 pts/);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/oldtimer/)).toBeNull();
  });
});

describe("GameResultsSheet grouping (Andrew, 2026-10-14)", () => {
  const game = (occurrenceDate: string, winner: string) => ({ ...GAME, occurrenceDate, winners: [winner] });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups by month, week and day, with only the newest month and week open", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T16:00:00Z"));
    const games = [game("2026-10-09", "murph"), game("2026-10-01", "early_oct"), game("2026-09-25", "september")];
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true, games, nextBefore: null, firstGameDate: "2026-08-05" })));
    render(createElement(Host, { initiallyOpen: true }));

    await screen.findByText(/murph · 90 pts/);
    const october = screen.getByRole("button", { name: /October 2026/ });
    expect(october.getAttribute("aria-expanded")).toBe("true");
    expect(october.textContent).toContain("2 games");
    expect(screen.getByRole("button", { name: /Oct 5 – 11/ }).getAttribute("aria-expanded")).toBe("true");
    // Older week and month are folded shut: their games aren't on screen.
    expect(screen.getByRole("button", { name: /Oct 1 – 4/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/early_oct/)).toBeNull();
    const september = screen.getByRole("button", { name: /September 2026/ });
    expect(september.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/september ·/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^2026/ })).toBeNull(); // under a year: no year headings

    fireEvent.click(september);
    fireEvent.click(screen.getByRole("button", { name: /Sep 21 – 27/ }));
    expect(screen.getByText(/september · 90 pts/)).toBeTruthy();
    fireEvent.click(october); // and the newest month folds shut too
    expect(screen.queryByText(/murph · 90 pts/)).toBeNull();
  });

  it("adds year headings once the venue's first game is more than a year old", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-10-14T16:00:00Z"));
    const games = [game("2027-10-13", "murph"), game("2026-12-30", "last_year")];
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true, games, nextBefore: "2026-12-30", firstGameDate: "2026-08-05" })));
    render(createElement(Host, { initiallyOpen: true }));

    await screen.findByText(/murph · 90 pts/);
    expect(screen.getByRole("button", { name: /^2027/ }).getAttribute("aria-expanded")).toBe("true");
    // More pages exist and 2026 starts before the oldest loaded game, so its count is open-ended.
    expect(screen.getByRole("button", { name: /^2026/ }).textContent).toContain("1+ games");
    expect(screen.getByRole("button", { name: /^October/ })).toBeTruthy(); // no year repeated under a year
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PastWinnersSheet } from "@/components/owner/history/PastWinnersSheet";
import type { OwnerSheetId } from "@/lib/ownerSheetParams";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// docs/live-trivia-weekly-places-reward-plan.md §5f (Phase 8): the Past Winners sheet reads only while
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
    createElement(PastWinnersSheet, { nav, venue: { id: "venue-1", name: "Garden State Bar" } }),
  );
};

afterEach(() => {
  cleanup();
  fetchMock.mockClear();
  vi.unstubAllGlobals();
});

describe("PastWinnersSheet", () => {
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
    expect(screen.getByText(/Weekday Trivia · 5 players/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Fri, Oct 9/ }));
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

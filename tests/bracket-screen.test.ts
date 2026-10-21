// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { entryOf, makeTournament, replayGames } from "./fixtures/brackets/view";
import { handleNativeBackPress, resetNativeBackHandlersForTest } from "@/components/navigation/nativeBackButton";
import type { BracketTournamentView } from "@/lib/bracketsEntries";
import { emptyPicks } from "@/lib/brackets/tree";

// Phase 8 — the March Madness screen end to end against a fake network (docs/squares-and-brackets-plan.md):
// load, fill out a region, drafts saved on each step, copy from another venue, the locked view with
// right / wrong marks, standings with Find a player, and the cost rule that nothing polls.
// createElement, not JSX.

vi.mock("@/components/venue/AppBar", () => ({
  GameAppBar: ({ onExit }: { onExit?: () => void }) => createElement("button", { type: "button", onClick: onExit }, "Exit game"),
}));
vi.mock("@/components/ui/HightopLoader", () => ({ HightopLoader: () => createElement("div", null, "loading") }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/storage", () => ({ getUserId: () => "user-1", getVenueId: () => "venue-1" }));

const { BracketGame } = await import("@/components/bracket/BracketGame");
const { haptic } = await import("@/lib/haptics");

type Standing = { rank: number; username: string; score: number; maxPossible: number; pickCount: number; mine: boolean };

type Calls = {
  state: number;
  standings: number;
  entries: Array<Record<string, unknown>>;
  copies: Array<Record<string, unknown>>;
};

const installFetch = (server: {
  tournaments: BracketTournamentView[];
  standings?: Standing[];
  entryStatus?: number;
  entryOutcome?: string;
  stateStatus?: number;
  /** Called before each entry save is answered: return a promise to make the save slow. */
  holdEntry?: (index: number) => Promise<void> | undefined;
}) => {
  const calls: Calls = { state: 0, standings: 0, entries: [], copies: [] };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/bracket/state")) {
        calls.state += 1;
        return server.stateStatus ? json({ ok: false }, server.stateStatus) : json({ ok: true, tournaments: server.tournaments });
      }
      if (url.startsWith("/api/bracket/standings")) {
        calls.standings += 1;
        return json({ ok: true, standings: server.standings ?? [], championshipTotal: null });
      }
      if (url.startsWith("/api/bracket/entry")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.entries.push(body);
        await server.holdEntry?.(calls.entries.length);
        if (server.entryStatus && server.entryStatus !== 200) return json({ ok: false, outcome: server.entryOutcome }, server.entryStatus);
        return json({ ok: true, outcome: "saved", savedAt: "2027-03-15T10:00:00.000Z" });
      }
      if (url.startsWith("/api/bracket/copy")) {
        calls.copies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        // The copy lands: the next state read carries the copied bracket.
        const [first] = server.tournaments;
        const winners = replayGames("men").winnerSeats;
        server.tournaments = [
          {
            ...first,
            kinds: { ...first.kinds, main: { ...first.kinds.main, mine: entryOf(winners), copyFrom: [] } },
          },
        ];
        return json({ ok: true, outcome: "saved", savedAt: "2027-03-15T10:00:00.000Z" });
      }
      return json({ ok: false }, 404);
    }),
  );
  return calls;
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const mountScreen = async (onBack?: () => void) => {
  render(createElement(BracketGame, { onBack }));
  await advance(0);
  await flush();
};
const click = async (element: HTMLElement) => {
  await act(async () => fireEvent.click(element));
  await flush();
  await flush();
};
const button = (name: string | RegExp) => screen.getByRole("button", { name });

// Open, men's main, with a lock a week away on the fake clock.
const LOCK = "2099-03-18T16:15:00.000Z";
const openMen = (over: Partial<BracketTournamentView["kinds"]["main"]> = {}) =>
  makeTournament({ id: "t-men", gender: "men", main: { phase: "open", lockAt: LOCK, ...over } });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(new Date("2099-03-15T20:00:00Z"));
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
  vi.mocked(haptic).mockClear();
});
afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  cleanup();
  resetNativeBackHandlersForTest();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("before and around the brackets", () => {
  it("says the brackets open soon when none is selectable", async () => {
    installFetch({ tournaments: [] });
    await mountScreen();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Brackets open/);
  });

  it("shows an error with a retry when the first read fails", async () => {
    const calls = installFetch({ tournaments: [], stateStatus: 503 });
    await mountScreen();
    expect(screen.getByRole("heading", { name: "The bracket didn't load" })).toBeTruthy();
    await click(button("Try again"));
    expect(calls.state).toBe(2);
  });
});

describe("filling out a bracket", () => {
  it("opens on a summary with the lock time and a Fill out button", async () => {
    installFetch({ tournaments: [openMen()] });
    await mountScreen();
    expect(screen.getByRole("heading", { name: "Fill out your bracket" })).toBeTruthy();
    expect(screen.getByText(/0 of 63 picks made/)).toBeTruthy();
    expect(screen.getByText(/Picks lock/)).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Standings/ })).toBeNull();
  });

  it("picks teams, shows progress, and saves the draft when the step changes", async () => {
    const calls = installFetch({ tournaments: [openMen()] });
    await mountScreen();
    await click(button("Fill out my bracket"));
    // East is first; the first game offers seeds 1 and 16.
    expect(screen.getByRole("tab", { name: /East/ }).getAttribute("aria-selected")).toBe("true");
    // While filling out, the page is the bracket: no switcher or headline above the games.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Men's bracket · 2026/);
    const first = screen.getAllByRole("group")[0];
    const choices = within(first).getAllByRole("button");
    expect(choices).toHaveLength(2);
    await click(choices[0]);
    expect(choices[0].getAttribute("aria-pressed")).toBe("true");
    expect(haptic).toHaveBeenCalledWith("selection");
    expect(screen.getByText(/^1 of 63 picks/)).toBeTruthy();
    // Nothing is sent on a tap — only when the step changes.
    expect(calls.entries).toHaveLength(0);
    await click(button("Next"));
    expect(calls.entries).toHaveLength(1);
    const sent = calls.entries[0] as { picks: Array<number | null>; tiebreaker: number | null; tournamentId: string; kind: string; venueId: string; userId: string };
    expect(sent.picks[0]).toBe(0);
    expect(sent.picks.filter((seat) => seat !== null)).toHaveLength(1);
    expect(sent).toMatchObject({ tournamentId: "t-men", kind: "main", venueId: "venue-1", userId: "user-1", tiebreaker: null });
    expect(screen.getByRole("tab", { name: /West/ }).getAttribute("aria-selected")).toBe("true");
    // A step that changed nothing doesn't save again.
    await click(button("Next"));
    expect(calls.entries).toHaveLength(1);
  });

  it("offers a later game only the teams picked in the games before it, and clears them when a pick changes", async () => {
    installFetch({ tournaments: [openMen()] });
    await mountScreen();
    await click(button("Fill out my bracket"));
    const games = () => screen.getAllByRole("group");
    // Round of 32's first game starts empty.
    const round32 = () => games()[8];
    expect(within(round32()).queryAllByRole("button")).toHaveLength(0);
    await click(within(games()[0]).getAllByRole("button")[0]); // seat 0
    await click(within(games()[1]).getAllByRole("button")[1]); // seat 3
    expect(within(round32()).getAllByRole("button")).toHaveLength(2);
    await click(within(round32()).getAllByRole("button")[0]); // advance seat 0
    expect(screen.getByText(/^3 of 63 picks/)).toBeTruthy();
    // Changing the first game to the other team removes the advanced pick above it.
    await click(within(games()[0]).getAllByRole("button")[1]);
    expect(screen.getByText(/^2 of 63 picks/)).toBeTruthy();
  });

  it("finishes with a tiebreaker and saves the whole bracket", async () => {
    const calls = installFetch({ tournaments: [openMen({ mine: entryOf(replayGames("men").winnerSeats.map((seat, slot) => (slot < 62 ? seat : seat))) })] });
    await mountScreen();
    await click(button("Edit my bracket"));
    await click(screen.getByRole("tab", { name: /Finish/ }));
    expect(screen.getByRole("heading", { name: "Your bracket is complete" })).toBeTruthy();
    const input = screen.getByLabelText("Tiebreaker") as HTMLInputElement;
    await act(async () => fireEvent.change(input, { target: { value: "151" } }));
    await click(button("Save bracket"));
    expect(calls.entries).toHaveLength(1);
    expect(calls.entries[0]).toMatchObject({ tiebreaker: 151, kind: "main" });
    expect(haptic).toHaveBeenCalledWith("success");
    // Back on the summary, which now reads from the saved entry without another state read.
    expect(screen.getByRole("heading", { name: "Your bracket is in" })).toBeTruthy();
    expect(button("Edit my bracket")).toBeTruthy();
  });

  it("refuses a tiebreaker that isn't a number from 0 to 400", async () => {
    const calls = installFetch({ tournaments: [openMen()] });
    await mountScreen();
    await click(button("Fill out my bracket"));
    await click(screen.getByRole("tab", { name: /Finish/ }));
    const input = screen.getByLabelText("Tiebreaker") as HTMLInputElement;
    await act(async () => fireEvent.change(input, { target: { value: "12a" } }));
    expect((button("Save bracket") as HTMLButtonElement).disabled).toBe(true);
    expect(calls.entries).toHaveLength(0);
  });

  it("tells the player when picks have just locked, and re-reads the state", async () => {
    const calls = installFetch({ tournaments: [openMen()], entryStatus: 409, entryOutcome: "locked" });
    await mountScreen();
    await click(button("Fill out my bracket"));
    await click(within(screen.getAllByRole("group")[0]).getAllByRole("button")[0]);
    await click(button("Next"));
    expect(screen.getByRole("alert").textContent).toContain("locked");
    expect(haptic).not.toHaveBeenCalledWith("success");
    expect(calls.state).toBe(2);
  });

  it("saves a draft before leaving the game", async () => {
    const onBack = vi.fn();
    const calls = installFetch({ tournaments: [openMen()] });
    await mountScreen(onBack);
    await click(button("Fill out my bracket"));
    await click(within(screen.getAllByRole("group")[0]).getAllByRole("button")[0]);
    await click(button("Exit game"));
    expect(calls.entries).toHaveLength(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("sends the newest picks when Back is tapped during a slow save, and waits for them", async () => {
    const onBack = vi.fn();
    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = installFetch({ tournaments: [openMen()], holdEntry: (index) => (index === 1 ? slow : undefined) });
    await mountScreen(onBack);
    await click(button("Fill out my bracket"));
    await click(within(screen.getAllByRole("group")[0]).getAllByRole("button")[0]);
    await click(button("Next")); // save 1 starts and stays open
    expect(calls.entries).toHaveLength(1);
    await click(within(screen.getAllByRole("group")[1]).getAllByRole("button")[0]); // a newer pick while the save is out
    await click(button("Exit game"));
    expect(onBack).not.toHaveBeenCalled();
    await act(async () => release());
    await advance(0);
    await flush();
    expect(calls.entries).toHaveLength(2);
    expect((calls.entries[1].picks as Array<number | null>).filter((seat) => seat !== null)).toHaveLength(2);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("saves the bracket when Save is tapped during a background save", async () => {
    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = installFetch({
      tournaments: [openMen({ mine: entryOf(replayGames("men").winnerSeats) })],
      holdEntry: (index) => (index === 1 ? slow : undefined),
    });
    await mountScreen();
    await click(button("Edit my bracket"));
    await click(screen.getByRole("tab", { name: /Finish/ }));
    const input = screen.getByLabelText("Tiebreaker") as HTMLInputElement;
    await act(async () => fireEvent.change(input, { target: { value: "150" } }));
    // The tab goes to the background (save 1, held) and Save is tapped before the screen shows "Saving…".
    await act(async () => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
      fireEvent.click(button("Save bracket"));
    });
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    expect(calls.entries).toHaveLength(1);
    await act(async () => release());
    await advance(0);
    await flush();
    expect(calls.entries).toHaveLength(2);
    expect(haptic).toHaveBeenCalledWith("success");
    expect(haptic).not.toHaveBeenCalledWith("warning");
    expect(screen.getByRole("heading", { name: "Your bracket is in" })).toBeTruthy();
  });

  it("goes back a step on Android's Back inside the app, then leaves", async () => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
    installFetch({ tournaments: [openMen()] });
    await mountScreen();
    await click(button("Fill out my bracket"));
    await click(button("Next"));
    expect(screen.getByRole("tab", { name: /West/ }).getAttribute("aria-selected")).toBe("true");
    const fallbacks = { goBack: vi.fn(), minimize: vi.fn() };
    await act(async () => handleNativeBackPress(true, fallbacks));
    await flush();
    expect(screen.getByRole("tab", { name: /East/ }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("copying from another venue", () => {
  const copyFrom = [{ venueId: "venue-2", venueName: "The Tap Room", pickCount: 63 }];

  it("copies in one tap when nothing is picked here, then reads the result once", async () => {
    const calls = installFetch({ tournaments: [openMen({ copyFrom })] });
    await mountScreen();
    await click(button(/Copy my picks from The Tap Room/));
    expect(calls.copies).toEqual([{ venueId: "venue-1", userId: "user-1", tournamentId: "t-men", kind: "main", fromVenueId: "venue-2" }]);
    expect(calls.state).toBe(2);
    expect(screen.getByRole("heading", { name: "Your bracket is in" })).toBeTruthy();
  });

  it("asks before replacing picks that are already here", async () => {
    const mine = entryOf(emptyPicks().map((_, slot) => (slot < 5 ? 0 : null)));
    const calls = installFetch({ tournaments: [openMen({ copyFrom, mine })] });
    await mountScreen();
    await click(button(/Copy my picks from The Tap Room/));
    expect(calls.copies).toHaveLength(0);
    expect(screen.getByRole("alert").textContent).toContain("replaces");
    await click(button("Cancel"));
    expect(screen.queryByRole("alert")).toBeNull();
    await click(button(/Copy my picks from The Tap Room/));
    await click(button("Copy picks"));
    expect(calls.copies).toHaveLength(1);
  });
});

describe("after the lock", () => {
  const winners = replayGames("men").winnerSeats;

  it("shows right and wrong marks, the score and the still-alive count", async () => {
    const picks = winners.map((seat) => seat);
    // One wrong pick in the Round of 64, the rest right.
    const loser = (winners[0] as number) % 2 === 0 ? (winners[0] as number) + 1 : (winners[0] as number) - 1;
    picks[0] = loser;
    for (let slot = 32; slot < 63; slot += 1) if (picks[slot] === winners[0]) picks[slot] = null;
    const mine = entryOf(picks, { score: 1400, maxPossible: 1400 });
    installFetch({ tournaments: [makeTournament({ id: "t-men", gender: "men", main: { phase: "complete", mine } })] });
    await mountScreen();
    expect(screen.getByRole("heading", { name: "Final standings" })).toBeTruthy();
    // Points and best possible are both 1,400 here; a perfect bracket is 1,920.
    expect(screen.getAllByText("1,400", { selector: "p" })).toHaveLength(2);
    expect(screen.getByText("1,920", { selector: "p" })).toBeTruthy();
    expect(screen.getByText(/\d+ right · 1 wrong · 0 still alive/)).toBeTruthy();
    expect(screen.getAllByText(/^Wrong$/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: "Edit my bracket" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save bracket" })).toBeNull();
  });

  it("opens on the standings when the player has no bracket, and finds a player", async () => {
    const standings: Standing[] = [
      { rank: 1, username: "Maverick", score: 900, maxPossible: 900, pickCount: 63, mine: false },
      { rank: 2, username: "goose", score: 700, maxPossible: 800, pickCount: 63, mine: false },
      { rank: 3, username: "me", score: 100, maxPossible: 300, pickCount: 40, mine: true },
    ];
    const calls = installFetch({
      tournaments: [makeTournament({ id: "t-men", main: { phase: "locked" } })],
      standings,
    });
    await mountScreen();
    expect(calls.standings).toBe(1);
    expect(screen.getByText("You're #3 of 3")).toBeTruthy();
    expect(screen.getByText("me (you)")).toBeTruthy();
    const search = screen.getByRole("searchbox");
    await act(async () => fireEvent.change(search, { target: { value: "goo" } }));
    expect(screen.getByText("goose")).toBeTruthy();
    expect(screen.queryByText("Maverick")).toBeNull();
    await act(async () => fireEvent.change(search, { target: { value: "nobody" } }));
    expect(screen.getByText(/No player named/)).toBeTruthy();
  });

  it("never exposes a user id in anything it sends or shows", async () => {
    const standings: Standing[] = [{ rank: 1, username: "Maverick", score: 900, maxPossible: 900, pickCount: 63, mine: false }];
    installFetch({ tournaments: [makeTournament({ id: "t-men", main: { phase: "locked" } })], standings });
    await mountScreen();
    expect(document.body.innerHTML).not.toContain("user-1");
  });
});

describe("switching brackets", () => {
  it("shows a switcher only when there is a choice, and lands on the same kind of bracket", async () => {
    const men = makeTournament({ id: "t-men", gender: "men", main: { phase: "open", lockAt: LOCK } });
    const women = makeTournament({ id: "t-women", gender: "women", main: { phase: "open", lockAt: LOCK }, second: { phase: "not_open" } });
    installFetch({ tournaments: [men, women] });
    await mountScreen();
    const group = screen.getByRole("group", { name: "Tournament" });
    expect(within(group).getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByRole("group", { name: "Bracket" })).toBeNull();
    expect(screen.getByText(/Men's bracket · 2026/)).toBeTruthy();
    await click(within(group).getByRole("button", { name: "Women's" }));
    expect(screen.getByText(/Women's bracket · 2026/)).toBeTruthy();
  });

  it("offers the second chance beside the main bracket once it opens", async () => {
    const men = makeTournament({ id: "t-men", main: { phase: "locked" }, second: { phase: "open", lockAt: LOCK } });
    installFetch({ tournaments: [men], standings: [] });
    await mountScreen();
    // The unfinished open bracket comes first.
    expect(screen.getByText(/Men's second chance/)).toBeTruthy();
    const group = screen.getByRole("group", { name: "Bracket" });
    await click(within(group).getByRole("button", { name: "Bracket" }));
    expect(screen.getByText(/Men's bracket · 2026/)).toBeTruthy();
  });
});

describe("cost", () => {
  it("does not poll: ten minutes with the page open is still one state read", async () => {
    const calls = installFetch({ tournaments: [openMen()] });
    await mountScreen();
    await advance(10 * 60_000);
    expect(calls.state).toBe(1);
    expect(calls.standings).toBe(0);
  });

  it("reads once more at the moment a live bracket locks", async () => {
    const calls = installFetch({ tournaments: [openMen({ lockAt: "2099-03-15T20:10:00.000Z" })] });
    await mountScreen();
    await advance(11 * 60_000);
    expect(calls.state).toBe(2);
  });

  it("catches up on returning to a tab that has been away for a while, and not before", async () => {
    const calls = installFetch({ tournaments: [openMen()] });
    await mountScreen();
    await advance(60_000);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(calls.state).toBe(1);
    await advance(5 * 60_000);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await flush();
    expect(calls.state).toBe(2);
  });
});

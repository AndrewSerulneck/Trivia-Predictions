import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const tournamentsMock = vi.fn();
const gamesMock = vi.fn();
vi.mock("@/lib/bracketsStore", () => ({
  listCurrentBracketTournaments: (...args: unknown[]) => tournamentsMock(...args),
  getBracketGamesFor: (...args: unknown[]) => gamesMock(...args),
  getBracketTournament: vi.fn(),
  tournamentNowMs: (t: { clockOffsetSeconds: number }, now: number) => now - t.clockOffsetSeconds * 1000,
}));
const entriesRead = vi.fn();
vi.mock("@/lib/supabaseAdmin", () => {
  const builder: Record<string, unknown> = {};
  for (const name of ["from", "select", "eq", "in", "gt", "order"]) builder[name] = () => builder;
  builder.limit = () => entriesRead();
  return { supabaseAdmin: builder };
});
vi.mock("@/lib/timezone", () => ({ getVenueTimezone: async () => "America/New_York" }));

import { BracketTvScreen } from "@/components/venue-screen/BracketTvScreen";
import { buildBracketTvPayload, BRACKET_TV_TOP, type BracketTvEntry, type BracketTvTournament } from "@/lib/bracketsTv";
import { clearBracketTvCache, getBracketTvPayload } from "@/lib/bracketsTvRead";
import { roundOfSlot, seatsOfRound1Slot } from "@/lib/brackets/tree";
import { getVenueScreenPollIntervalMs } from "@/lib/venueScreenTiming";
import { selectVenueScreenState, type VenueScreenSelectionInput, type VenueScreenState } from "@/lib/venueScreen";
import { replayGames } from "@/tests/fixtures/brackets/view";

// Phase 9b — March Madness on the venue TV: when it shows, what it carries, and what it costs.

const TZ = "America/New_York";
const full = replayGames("men");
const round1Tips = full.views
  .filter((game) => game.slot !== null && roundOfSlot(game.slot) === 1)
  .map((game) => Date.parse(String(game.tipAt)));
const FIRST_TIP = Math.min(...round1Tips);
// One minute after the last first-round tip: that day's games are on the TV, earlier upsets are decided.
const AS_OF = Math.max(...round1Tips) + 60_000;
const live = replayGames("men", AS_OF);

/** A decided first-round upset: [slot, loser seat]. */
const upsets = live.views.flatMap((game): Array<[number, number]> => {
  if (game.slot === null || roundOfSlot(game.slot) !== 1 || !game.winnerSide || !game.home || !game.away) return [];
  const winner = game.winnerSide === "home" ? game.home : game.away;
  const loser = game.winnerSide === "home" ? game.away : game.home;
  if (winner.seed === null || loser.seed === null || winner.seed <= loser.seed) return [];
  return [[game.slot, seatsOfRound1Slot(game.slot)[game.winnerSide === "home" ? 1 : 0]]];
});

const tournament = (over: Partial<BracketTvTournament> = {}): BracketTvTournament => ({
  id: "t-men",
  gender: "men",
  season: 2025,
  winnerSeats: live.winnerSeats,
  championshipTotal: null,
  games: live.views,
  locks: { main: FIRST_TIP - 60_000, second: null },
  nowMs: AS_OF,
  ...over,
});

const entry = (username: string, picks: Array<number | null>, score: number, over: Partial<BracketTvEntry> = {}): BracketTvEntry => ({
  tournamentId: "t-men",
  kind: "main",
  entryId: `e-${username}`,
  username,
  score,
  tiebreaker: null,
  submittedAt: "2026-03-18T12:00:00.000Z",
  picks,
  ...over,
});

const perfect = entry("ann", full.winnerSeats, 320);
const busted = entry(
  "bo",
  Array.from({ length: 63 }, (_, slot) => upsets.find(([s]) => s === slot)?.[1] ?? null),
  0,
);

describe("buildBracketTvPayload", () => {
  it("ranks the venue's brackets, lists today's games and names the upset that busted brackets here", () => {
    expect(upsets.length).toBeGreaterThan(0);
    const payload = buildBracketTvPayload({ tournaments: [tournament()], entries: [busted, perfect], timeZone: TZ });
    expect(payload).not.toBeNull();
    expect(payload?.title).toBe("Men's bracket 2026");
    expect(payload?.complete).toBe(false);
    expect(payload?.entries).toBe(2);
    expect(payload?.standings.map((row) => [row.rank, row.username])).toEqual([[1, "ann"], [2, "bo"]]);
    expect(payload?.games.length).toBeGreaterThan(0);
    expect(payload?.upset).toMatchObject({ busted: 1, of: 2 });
    const upset = payload?.upset;
    if (!upset?.winner.seed || !upset.loser.seed) throw new Error("seeded upset expected");
    expect(upset.winner.seed).toBeGreaterThan(upset.loser.seed);
  });

  it("shows at most the top 10 and never carries a player or entry id", () => {
    const many = Array.from({ length: 14 }, (_, i) => entry(`p${i}`, full.winnerSeats, 100 - i, { entryId: `secret-${i}` }));
    const payload = buildBracketTvPayload({ tournaments: [tournament()], entries: many, timeZone: TZ });
    expect(payload?.standings).toHaveLength(BRACKET_TV_TOP);
    expect(JSON.stringify(payload)).not.toContain("secret-");
  });

  it("stays off before the lock and with no entries here", () => {
    expect(buildBracketTvPayload({ tournaments: [tournament({ locks: { main: AS_OF + 1, second: null } })], entries: [perfect], timeZone: TZ })).toBeNull();
    expect(buildBracketTvPayload({ tournaments: [tournament()], entries: [], timeZone: TZ })).toBeNull();
  });

  it("shows the bracket with the most entries here", () => {
    const second = [entry("x", full.winnerSeats, 0, { kind: "second" }), entry("y", full.winnerSeats, 0, { kind: "second" })];
    const payload = buildBracketTvPayload({
      tournaments: [tournament({ locks: { main: FIRST_TIP - 60_000, second: FIRST_TIP } })],
      entries: [perfect, ...second],
      timeZone: TZ,
    });
    expect(payload?.title).toBe("Men's second chance 2026");
  });

  it("says final standings once the championship is decided", () => {
    const done = tournament({ winnerSeats: full.winnerSeats, games: full.views });
    expect(buildBracketTvPayload({ tournaments: [done], entries: [perfect], timeZone: TZ })?.complete).toBe(true);
  });
});

describe("selectVenueScreenState with March Madness", () => {
  const venue = { id: "v1", name: "Pub", displayName: null, screenBrandImageUrl: null, screenBrandPrimary: null, screenBrandSecondary: null };
  const idleLive = { isGameActive: false, nextSchedule: null } as unknown as VenueScreenSelectionInput["liveTrivia"];
  const noBlitz = { session: null, round: null, leaderboard: null, nextStartsAt: null, nextRoundStartsAt: null };
  const bracket = buildBracketTvPayload({ tournaments: [tournament()], entries: [perfect], timeZone: TZ });

  it("replaces the idle screen, and is idle without a payload", () => {
    expect(selectVenueScreenState({ venue, liveTrivia: idleLive, categoryBlitz: noBlitz, bracket, updatedAt: AS_OF }).mode).toBe("bracket");
    expect(selectVenueScreenState({ venue, liveTrivia: idleLive, categoryBlitz: noBlitz, bracket: null, updatedAt: AS_OF }).mode).toBe("idle");
  });

  it("never beats a live Live Trivia game", () => {
    const liveTrivia = { ...idleLive, isGameActive: true, activePhase: "answering", secondsRemaining: 10, totalRounds: 3, currentRound: 1, scheduleId: "s", occurrenceDate: "d", leaderboard: null, isFinalResultsWindow: false, activeQuestion: null, revealedAnswer: null, currentRoundCategory: null, venueName: null } as unknown as VenueScreenSelectionInput["liveTrivia"];
    expect(selectVenueScreenState({ venue, liveTrivia, categoryBlitz: noBlitz, bracket, updatedAt: AS_OF }).mode).toBe("live-trivia");
  });

  it("polls no faster than results can change", () => {
    const state = selectVenueScreenState({ venue, liveTrivia: idleLive, categoryBlitz: noBlitz, bracket, updatedAt: AS_OF });
    expect(getVenueScreenPollIntervalMs(state)).toBe(30_000);
  });
});

describe("getBracketTvPayload (cost)", () => {
  const inWindow = Date.parse("2027-03-20T20:00:00.000Z");
  const record = {
    id: "t-men",
    gender: "men",
    season: 2025,
    purpose: "live",
    clockOffsetSeconds: Math.round((inWindow - AS_OF) / 1000),
    regionNames: [null, null, null, null],
    winnerSeats: live.winnerSeats,
    championshipTotal: null,
    mainLockAt: new Date(FIRST_TIP - 60_000).toISOString(),
    secondLockAt: null,
  };
  const row = { id: "e1", tournament_id: "t-men", kind: "main", score: 10, tiebreaker: null, submitted_at: "x", picks: full.winnerSeats, users: { username: "ann" } };

  beforeEach(() => {
    tournamentsMock.mockReset();
    gamesMock.mockReset();
    entriesRead.mockReset();
    clearBracketTvCache();
    vi.unstubAllEnvs();
  });

  it("does no I/O with the flag off, or outside the bracket window", async () => {
    expect(await getBracketTvPayload("v-off", inWindow)).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "true");
    expect(await getBracketTvPayload("v-out", Date.parse("2026-10-20T20:00:00.000Z"))).toBeNull();
    expect(tournamentsMock).not.toHaveBeenCalled();
    expect(entriesRead).not.toHaveBeenCalled();
  });

  it("shares one tournaments read per 15 s and re-reads a venue's entries only when a result changes", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "true");
    tournamentsMock.mockResolvedValue({ ok: true, value: [record] });
    gamesMock.mockResolvedValue({ ok: true, value: new Map([["t-men", []]]) });
    entriesRead.mockResolvedValue({ data: [row], error: null });

    expect(await getBracketTvPayload("v1", inWindow)).not.toBeNull();
    await getBracketTvPayload("v2", inWindow + 1_000);
    await getBracketTvPayload("v1", inWindow + 5_000);
    expect(tournamentsMock).toHaveBeenCalledTimes(1);
    expect(entriesRead).toHaveBeenCalledTimes(2);

    // A new tournaments read with nothing decided since: v1's entries are kept.
    await getBracketTvPayload("v1", inWindow + 16_000);
    expect(tournamentsMock).toHaveBeenCalledTimes(2);
    expect(entriesRead).toHaveBeenCalledTimes(2);

    // A game is decided: v1's entries are read again.
    const next = [...live.winnerSeats];
    next[next.findIndex((seat) => seat === null)] = 0;
    tournamentsMock.mockResolvedValue({ ok: true, value: [{ ...record, winnerSeats: next }] });
    await getBracketTvPayload("v1", inWindow + 32_000);
    expect(entriesRead).toHaveBeenCalledTimes(3);
  });

  it("hides itself on a failed read", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "true");
    vi.spyOn(console, "error").mockImplementation(() => {});
    tournamentsMock.mockResolvedValue({ ok: false, error: "boom" });
    expect(await getBracketTvPayload("v-fail", inWindow)).toBeNull();
  });
});

describe("BracketTvScreen", () => {
  it("draws the standings, the upset and today's games", () => {
    const payload = buildBracketTvPayload({ tournaments: [tournament()], entries: [busted, perfect], timeZone: TZ });
    if (!payload?.upset) throw new Error("payload with an upset expected");
    const state = {
      ok: true,
      mode: "bracket",
      venue: { id: "v1", name: "Pub" },
      liveTrivia: null,
      categoryBlitz: null,
      idle: null,
      bracket: payload,
      updatedAt: AS_OF,
    } as VenueScreenState as Extract<VenueScreenState, { mode: "bracket" }>;
    const html = renderToStaticMarkup(React.createElement(BracketTvScreen, { state, accent: "#fcd34d" }));
    expect(html).toContain("Men&#x27;s bracket 2026");
    expect(html).toContain("ann");
    expect(html).toContain("bo");
    expect(html).toContain(`Upset · ${payload.upset.round}`);
    expect(html).toContain("Busted 1 of 2 brackets here");
    expect(html).toContain("Today&#x27;s games");
  });
});

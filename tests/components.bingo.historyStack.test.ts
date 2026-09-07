import { describe, expect, it } from "vitest";
import {
  BINGO_GAME_BUFFER_MS,
  mergeLiveCardUpdates,
  resolveHistoryStackEntry,
  type BingoCard,
} from "@/components/bingo/bingoBoardShared";

/**
 * Phase 13 of docs/prop-bingo-code-review-fix-plan.md, finding 1.
 *
 * The past-day board stack used to hard-code `isLive: false` for every entry, so a 10pm game
 * viewed after local midnight — still genuinely running, but now on "yesterday" — rendered a
 * "Starts 10:00 PM" badge and opened the "Final Board · No bingo this game" modal.
 *
 * `SportsBingoHome` can't be rendered cheaply (realtime subscription, portals, PWA hooks), and
 * the failure is invisible to a headless pass either way — both the wrong badge and the wrong
 * modal paint fine. So the rule itself is pinned here, at the pure helper the stack is built
 * from. The open handler in `SportsBingoHome` branches on the SAME normalized status this
 * returns, so a live past-day board opening the live modal follows from these assertions.
 */

const HOUR_MS = 60 * 60 * 1000;

function makeCard(overrides: Partial<BingoCard> = {}): BingoCard {
  return {
    id: "card-1",
    userId: "user-1",
    venueId: "venue-1",
    gameId: "game-1",
    gameLabel: "Away @ Home",
    sportKey: "americanfootball_nfl",
    homeTeam: "Home",
    awayTeam: "Away",
    startsAt: new Date().toISOString(),
    status: "active",
    boardProbability: 0.2,
    rewardPoints: 0,
    createdAt: new Date().toISOString(),
    squares: [],
    ...overrides,
  };
}

describe("resolveHistoryStackEntry — past-day board stack", () => {
  const now = Date.UTC(2026, 8, 7, 5, 5); // 12:05am local for a UTC-5 player

  it("keeps a started board inside the buffer window LIVE, not 'Starts …'", () => {
    // The regression: 10pm kickoff, viewed 2h05m later on its own (now past) calendar day.
    const entry = resolveHistoryStackEntry(
      makeCard({ startsAt: new Date(now - 2 * HOUR_MS - 5 * 60_000).toISOString() }),
      now
    );
    expect(entry.isLive).toBe(true);
    expect(entry.card.status).toBe("active");
  });

  it("normalizes a stale `active` row past the buffer to lost, and not live", () => {
    const card = makeCard({ startsAt: new Date(now - BINGO_GAME_BUFFER_MS - 60_000).toISOString() });
    const entry = resolveHistoryStackEntry(card, now);
    expect(entry.card.status).toBe("lost");
    expect(entry.isLive).toBe(false);
    // Normalization copies; the caller's row is never mutated in place.
    expect(entry.card).not.toBe(card);
    expect(card.status).toBe("active");
  });

  it("treats the buffer boundary itself as over (>=, matching the today-stack partition)", () => {
    const entry = resolveHistoryStackEntry(
      makeCard({ startsAt: new Date(now - BINGO_GAME_BUFFER_MS).toISOString() }),
      now
    );
    expect(entry.card.status).toBe("lost");
    expect(entry.isLive).toBe(false);
  });

  it("does not mark an unstarted board live", () => {
    const entry = resolveHistoryStackEntry(
      makeCard({ startsAt: new Date(now + HOUR_MS).toISOString() }),
      now
    );
    expect(entry.isLive).toBe(false);
    expect(entry.card.status).toBe("active");
  });

  it("leaves an already-settled board alone and never marks it live", () => {
    for (const status of ["won", "lost", "canceled"] as const) {
      const card = makeCard({ status, startsAt: new Date(now - HOUR_MS).toISOString() });
      const entry = resolveHistoryStackEntry(card, now);
      expect(entry.isLive).toBe(false);
      expect(entry.card).toBe(card);
      expect(entry.card.status).toBe(status);
    }
  });

  it("does not copy the card when nothing needs normalizing", () => {
    const card = makeCard({ startsAt: new Date(now - HOUR_MS).toISOString() });
    expect(resolveHistoryStackEntry(card, now).card).toBe(card);
  });

  it("treats a malformed startsAt as neither live nor stale", () => {
    const card = makeCard({ startsAt: "not-a-date" });
    const entry = resolveHistoryStackEntry(card, now);
    expect(entry.isLive).toBe(false);
    expect(entry.card.status).toBe("active");
    expect(entry.card).toBe(card);
  });
});

/**
 * Phase 14.5 of docs/prop-bingo-code-review-fix-plan.md.
 *
 * `historyCards` is a write-once day-scoped fetch. A board still running on its own (now past)
 * calendar day is also in the live `cards` window and already subscribed, so its updates are
 * arriving — `mergeLiveCardUpdates` lands them. The identity-stability rule (return `existing`
 * by reference when nothing overlaps) is load-bearing for perf, not correctness, so it is
 * pinned here where a later refactor can't break it silently.
 */
describe("mergeLiveCardUpdates — live updates into the past-day stack", () => {
  it("returns `existing` by identity when no incoming id matches (the common case)", () => {
    const existing = [makeCard({ id: "a" }), makeCard({ id: "b" })];
    const incoming = [makeCard({ id: "c" }), makeCard({ id: "d" })];
    expect(mergeLiveCardUpdates(existing, incoming)).toBe(existing);
  });

  it("returns `existing` by identity when either side is empty", () => {
    const existing = [makeCard({ id: "a" })];
    expect(mergeLiveCardUpdates(existing, [])).toBe(existing);
    expect(mergeLiveCardUpdates([], [makeCard({ id: "a" })])).toEqual([]);
  });

  it("patches a matching row in place, taking the incoming object wholesale", () => {
    const stale = makeCard({ id: "a", status: "active", squares: [] });
    const other = makeCard({ id: "b" });
    const fresh = makeCard({ id: "a", status: "won" });
    const merged = mergeLiveCardUpdates([stale, other], [fresh, makeCard({ id: "z" })]);
    expect(merged).not.toBe([stale, other]);
    expect(merged[0]).toBe(fresh);
    expect(merged[0].status).toBe("won");
    // Non-matching existing rows keep their identity.
    expect(merged[1]).toBe(other);
  });

  it("never appends an incoming row that is not already in `existing`", () => {
    const existing = [makeCard({ id: "a" })];
    const incoming = [makeCard({ id: "a" }), makeCard({ id: "new-from-main-fetch" })];
    const merged = mergeLiveCardUpdates(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged.map((c) => c.id)).toEqual(["a"]);
  });
});

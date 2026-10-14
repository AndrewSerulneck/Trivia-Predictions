import { describe, expect, it } from "vitest";

import { composeRankedCard, type RankedPlaceCardState } from "@/lib/rankedPlaceCard";

// The words on the venue Rewards card for a weekly places reward (Phase 4,
// docs/live-trivia-weekly-places-reward-plan.md §5e): every state the card can be in.

const state = (overrides: Partial<RankedPlaceCardState> = {}): RankedPlaceCardState => ({
  weekStart: "2026-10-07T04:00:00.000Z",
  phase: "live",
  placeCount: 3,
  minPlayers: null,
  participantCount: 4,
  gamesLeft: 1,
  lastGameDay: "Friday",
  viewer: { rank: 2, points: 140 },
  outcome: null,
  settledMinPlayers: null,
  winners: [],
  viewerPlace: null,
  ...overrides,
});

describe("live week", () => {
  it("no scores yet", () => {
    const copy = composeRankedCard(state({ participantCount: 0, viewer: { rank: null, points: 0 }, gamesLeft: 3 }));
    expect(copy.status).toBe("in_progress");
    expect(copy.lines).toEqual([
      "No scores yet this week. Play Live Trivia to get on the board.",
      "3 games left this week. The last one is Friday.",
    ]);
  });

  it("ranked: names the viewer's place and the game that decides it", () => {
    expect(composeRankedCard(state()).lines).toEqual(["You're 2nd with 140 pts this week.", "Friday's game decides it."]);
  });

  it("ranked outside the prize places says how many win", () => {
    const outside = composeRankedCard(state({ viewer: { rank: 5, points: 30 } })).lines;
    expect(outside).toContain("You're 5th with 30 pts this week.");
    expect(outside).toContain("Only the top 3 win a prize.");
    expect(composeRankedCard(state({ placeCount: 1, viewer: { rank: 2, points: 30 } })).lines).toContain(
      "Only 1st place wins a prize.",
    );
  });

  it("someone else has scored, the viewer hasn't", () => {
    expect(composeRankedCard(state({ viewer: { rank: null, points: 0 } })).lines[0]).toBe("You haven't scored yet this week.");
  });

  it("signed out: no personal line", () => {
    expect(composeRankedCard(state({ viewer: null })).lines).toEqual(["Friday's game decides it."]);
  });

  it("several games left, one left, none left", () => {
    expect(composeRankedCard(state({ gamesLeft: 2 })).lines).toContain("2 games left this week. The last one is Friday.");
    expect(composeRankedCard(state({ gamesLeft: 1, lastGameDay: null })).lines).toContain("One game left this week.");
    expect(composeRankedCard(state({ gamesLeft: 0 })).lines).toContain(
      "That was the week's last game. Winners are named shortly.",
    );
  });

  it("minimum players: how many so far, then reached", () => {
    expect(composeRankedCard(state({ minPlayers: 4, participantCount: 3 })).lines).toContain(
      "Needs at least 4 players this week — 3 so far.",
    );
    expect(composeRankedCard(state({ minPlayers: 4, participantCount: 4 })).lines).toContain(
      "Minimum of 4 players reached.",
    );
  });
});

describe("settled week", () => {
  const settled = (overrides: Partial<RankedPlaceCardState> = {}) =>
    state({ phase: "settled", outcome: "awarded", gamesLeft: 0, viewer: null, ...overrides });

  it("won: tells the winner where the prize is", () => {
    const copy = composeRankedCard(
      settled({ viewerPlace: 1, winners: [{ place: 1, username: "Snooker" }, { place: 2, username: "Kuch" }] }),
    );
    expect(copy.status).toBe("week_complete");
    expect(copy.lines).toEqual([
      "You finished 1st. Your prize is in Redeem Prizes.",
      "This week's winners: 1st Snooker, 2nd Kuch.",
    ]);
  });

  it("not won: lists the winners, with a stand-in for a deleted account", () => {
    expect(
      composeRankedCard(settled({ winners: [{ place: 1, username: "Snooker" }, { place: 2, username: null }] })).lines,
    ).toEqual(["This week's winners: 1st Snooker, 2nd Champion."]);
  });

  it("nobody scored", () => {
    expect(composeRankedCard(settled({ outcome: "no_scorers" })).lines).toEqual([
      "Nobody scored this week, so no prizes were awarded.",
    ]);
  });

  it("below the minimum: uses the minimum in force when the week settled", () => {
    expect(
      composeRankedCard(settled({ outcome: "below_minimum", participantCount: 2, settledMinPlayers: 4, minPlayers: 6 })).lines,
    ).toEqual(["Not enough players this week — 2 played, 4 needed. No prizes were awarded."]);
  });
});

describe("other phases", () => {
  it("a reward that starts next week", () => {
    expect(composeRankedCard(state({ phase: "not_live" }))).toEqual({
      status: "upcoming",
      lines: ["Starts with next week's games."],
    });
  });

  it("no games this week adds nothing to the description", () => {
    expect(composeRankedCard(state({ phase: "no_games" }))).toEqual({ status: "idle", lines: [] });
  });
});

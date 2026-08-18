import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 6 of docs/mlb-prop-bingo-validation-plan.md.
//
// `applyMlbWebhookPropEvent` / `applyMlbPlayerSnapshotEvent` are the two functions that turn a
// live event off the MLB webhook stream into a `sports_bingo_squares` update. Nothing else in the
// 2026-08-18 MLB investigation (R1-R4) touched this path: it reads only `resolver.currentCount`
// and never touches the stats snapshot, so none of those fixes could have affected it, and none of
// the verification so far exercised it either.
//
// **What this file proves and does not prove**, per the plan's own instruction for this phase:
// it proves the two functions above increment/settle the right squares for a synthetic sequence
// of events, against an in-memory Supabase double (`createSupabaseAdminDouble`, the same one the
// NFL settlement tests use). It does NOT and CANNOT prove the live webhook stream ever calls these
// functions with real events at all — that is a separate system with no offline harness. Treat a
// green run here as "the accumulation logic is correct", not as "MLB live squares work end to end".

type Row = Record<string, unknown>;

const store = vi.hoisted(() => ({
  db: { sports_bingo_cards: [] as Row[], sports_bingo_squares: [] as Row[], notifications: [] as Row[] },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({ applyChallengeCampaignPoints: vi.fn() }));

vi.mock("@/lib/supabaseAdmin", async () => {
  const { createSupabaseAdminDouble } = await import("./helpers/bingoSupabaseDouble");
  return { supabaseAdmin: createSupabaseAdminDouble(store.db as unknown as Record<string, Row[]>) };
});

const GAME_ID = "5059601";
const HOME = "Kansas City Royals";
const AWAY = "Los Angeles Angels";
const STARTS_AT = new Date(Date.now() - 60 * 60 * 1000).toISOString();

let squareSequence = 0;

function seedCard(cardId = "card-1"): void {
  store.db.sports_bingo_cards.push({
    id: cardId,
    user_id: "user-1",
    venue_id: "venue-1",
    game_id: GAME_ID,
    game_label: `${AWAY} @ ${HOME}`,
    sport_key: "baseball_mlb",
    home_team: HOME,
    away_team: AWAY,
    starts_at: STARTS_AT,
    status: "active",
    board_probability: 0.25,
    reward_points: 50,
    reward_claimed_at: null,
    near_win_notified_at: null,
    won_notified_at: null,
    won_line: null,
    settled_at: null,
    created_at: STARTS_AT,
    updated_at: null,
    last_cron_processed_at: null,
  });
}

function seedSquare(params: {
  cardId?: string;
  resolver: Row;
  playerId?: number | null;
  eventType?: string | null;
  status?: string;
}): string {
  squareSequence += 1;
  const id = `square-${squareSequence}`;
  store.db.sports_bingo_squares.push({
    id,
    card_id: params.cardId ?? "card-1",
    square_index: squareSequence,
    label: "square",
    resolver: params.resolver,
    probability: 0.4,
    is_free: false,
    square_type: params.playerId ? "player_stat" : "generic",
    player_id: params.playerId ?? null,
    event_type: params.eventType ?? null,
    status: params.status ?? "pending",
    created_at: STARTS_AT,
    resolved_at: null,
  });
  return id;
}

function squareRow(id: string): Row {
  const row = store.db.sports_bingo_squares.find((square) => square.id === id);
  if (!row) {
    throw new Error(`no such square: ${id}`);
  }
  return row;
}

function resolverOf(id: string): Row {
  return squareRow(id).resolver as Row;
}

beforeEach(() => {
  vi.resetModules();
  squareSequence = 0;
  store.db.sports_bingo_cards = [];
  store.db.sports_bingo_squares = [];
  store.db.notifications = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function applyWebhookEvent(overrides: Partial<{
  gameId: string;
  eventType: "groundout" | "flyout" | "strikeout" | "hit" | "home_run" | "walk" | "hit_by_pitch" | "rbi" | "stolen_base" | "pitcher_out" | "earned_run" | "hit_allowed";
  playerId: number | null;
  playerName: string;
  teamName: string;
  pitchCount: number | null;
}>) {
  const { applyMlbWebhookPropEvent } = await import("@/lib/sportsBingo");
  return applyMlbWebhookPropEvent({
    gameId: GAME_ID,
    eventType: "hit",
    playerId: null,
    playerName: "",
    teamName: "",
    pitchCount: null,
    ...overrides,
  });
}

async function applySnapshotEvent(overrides: Partial<{
  gameId: string;
  playerId: number;
  playerName: string;
  gameStatus: string;
  batterStats: Partial<{ h: number; homeRuns: number; rbi: number; stolenBases: number; strikeoutsAsBatter: number }>;
  pitcherStats: Partial<{ strikeouts: number; outs: number; earnedRuns: number; hitsAllowed: number }>;
}>) {
  const { applyMlbPlayerSnapshotEvent } = await import("@/lib/sportsBingo");
  return applyMlbPlayerSnapshotEvent({
    gameId: GAME_ID,
    playerId: 0,
    playerName: "",
    ...overrides,
    batterStats: { h: 0, homeRuns: 0, rbi: 0, stolenBases: 0, strikeoutsAsBatter: 0, ...overrides.batterStats },
    pitcherStats: { strikeouts: 0, outs: 0, earnedRuns: 0, hitsAllowed: 0, ...overrides.pitcherStats },
  } as Parameters<typeof applyMlbPlayerSnapshotEvent>[0]);
}

describe("applyMlbWebhookPropEvent — player_event squares, direct (player_id + event_type) path", () => {
  it("increments a player_event_at_least square on a matching hit and hits it once the threshold clears", async () => {
    seedCard();
    const squareId = seedSquare({
      resolver: {
        kind: "mlb_webhook_player_event_at_least",
        player: "Bobby Witt Jr.::30",
        event: "hit",
        threshold: 2,
        currentCount: 0,
      },
      playerId: 30,
      eventType: "mlb.batter.hit",
    });

    const first = await applyWebhookEvent({ eventType: "hit", playerId: 30, playerName: "Bobby Witt Jr.", teamName: HOME });
    expect(first.updatedSquares).toBe(1);
    expect(first.completedSquares).toBe(0);
    expect(squareRow(squareId).status).toBe("pending");
    expect((resolverOf(squareId) as { currentCount: number }).currentCount).toBe(1);

    const second = await applyWebhookEvent({ eventType: "hit", playerId: 30, playerName: "Bobby Witt Jr.", teamName: HOME });
    expect(second.completedSquares).toBe(1);
    expect(squareRow(squareId).status).toBe("hit");
    expect((resolverOf(squareId) as { currentCount: number }).currentCount).toBe(2);
  });

  it("counts a home run toward a hit-event square via the home_run/hit alias", async () => {
    seedCard();
    const squareId = seedSquare({
      resolver: { kind: "mlb_webhook_player_event_at_least", player: "Bobby Witt Jr.::30", event: "hit", threshold: 1, currentCount: 0 },
      playerId: 30,
      eventType: "mlb.batter.hit",
    });

    await applyWebhookEvent({ eventType: "home_run", playerId: 30, playerName: "Bobby Witt Jr.", teamName: HOME });

    expect(squareRow(squareId).status).toBe("hit");
  });

  it("does not credit an unrelated player's matching event", async () => {
    seedCard();
    const squareId = seedSquare({
      resolver: { kind: "mlb_webhook_player_event_at_least", player: "Bobby Witt Jr.::30", event: "hit", threshold: 1, currentCount: 0 },
      playerId: 30,
      eventType: "mlb.batter.hit",
    });

    await applyWebhookEvent({ eventType: "hit", playerId: 99, playerName: "Someone Else", teamName: HOME });

    expect(squareRow(squareId).status).toBe("pending");
    expect((resolverOf(squareId) as { currentCount: number }).currentCount).toBe(0);
  });

  it("turns a player_event_at_most square to miss the instant the ceiling is exceeded", async () => {
    seedCard();
    const squareId = seedSquare({
      resolver: { kind: "mlb_webhook_player_event_at_most", player: "Kris Bubic::45", event: "earned_run", threshold: 2, currentCount: 2 },
      playerId: 45,
      eventType: "mlb.player.earned_run",
    });

    await applyWebhookEvent({ eventType: "earned_run", playerId: 45, playerName: "Kris Bubic", teamName: HOME });

    expect(squareRow(squareId).status).toBe("miss");
    expect((resolverOf(squareId) as { currentCount: number }).currentCount).toBe(3);
  });

  it("leaves a player_event_at_most square pending while still within the ceiling", async () => {
    seedCard();
    const squareId = seedSquare({
      resolver: { kind: "mlb_webhook_player_event_at_most", player: "Kris Bubic::45", event: "earned_run", threshold: 3, currentCount: 1 },
      playerId: 45,
      eventType: "mlb.player.earned_run",
    });

    await applyWebhookEvent({ eventType: "earned_run", playerId: 45, playerName: "Kris Bubic", teamName: HOME });

    expect(squareRow(squareId).status).toBe("pending");
  });
});

describe("applyMlbWebhookPropEvent — team_event squares, the fallback loop", () => {
  // Team-event squares carry no `player_id`, so they are never reached by the direct query and
  // must fall out of the per-card `for` loop keyed on `resolveTeamSideFromEvent`.
  it("increments a team_event_at_least square only for the matching team side", async () => {
    seedCard();
    const homeSquare = seedSquare({
      resolver: { kind: "mlb_webhook_team_event_at_least", team: "home", event: "home_run", threshold: 2, currentCount: 0 },
    });
    const awaySquare = seedSquare({
      resolver: { kind: "mlb_webhook_team_event_at_least", team: "away", event: "home_run", threshold: 2, currentCount: 0 },
    });

    await applyWebhookEvent({ eventType: "home_run", playerId: 30, playerName: "Bobby Witt Jr.", teamName: HOME });

    expect((resolverOf(homeSquare) as { currentCount: number }).currentCount).toBe(1);
    expect((resolverOf(awaySquare) as { currentCount: number }).currentCount).toBe(0);
  });

  it("resolves team side by fuzzy team-name match, not exact string equality", async () => {
    seedCard();
    const squareId = seedSquare({
      resolver: { kind: "mlb_webhook_team_event_at_least", team: "away", event: "hit", threshold: 1, currentCount: 0 },
    });

    // The webhook feed's team name casing/spelling need not match the card's stored name exactly.
    await applyWebhookEvent({ eventType: "hit", playerId: 7, playerName: "Mike Trout", teamName: AWAY.toUpperCase() });

    expect(squareRow(squareId).status).toBe("hit");
  });

  it("credits quick_out_under_3_pitches only for a qualifying out under the pitch-count ceiling", async () => {
    seedCard();
    const squareId = seedSquare({
      resolver: { kind: "mlb_webhook_team_event_at_least", team: "home", event: "quick_out_under_3_pitches", threshold: 1, currentCount: 0 },
    });

    // Not an out event at all — must not count.
    await applyWebhookEvent({ eventType: "hit", playerId: 30, playerName: "Bobby Witt Jr.", teamName: HOME, pitchCount: 1 });
    expect(squareRow(squareId).status).toBe("pending");

    // An out, but not a quick one (3+ pitches) — must not count.
    await applyWebhookEvent({ eventType: "strikeout", playerId: 30, playerName: "Bobby Witt Jr.", teamName: HOME, pitchCount: 4 });
    expect(squareRow(squareId).status).toBe("pending");

    // A qualifying quick out.
    await applyWebhookEvent({ eventType: "groundout", playerId: 30, playerName: "Bobby Witt Jr.", teamName: HOME, pitchCount: 2 });
    expect(squareRow(squareId).status).toBe("hit");
  });

  it("ignores events for a different game entirely", async () => {
    seedCard();
    const squareId = seedSquare({
      resolver: { kind: "mlb_webhook_team_event_at_least", team: "home", event: "hit", threshold: 1, currentCount: 0 },
    });

    const result = await applyWebhookEvent({ gameId: "9999999", eventType: "hit", playerId: 30, playerName: "Bobby Witt Jr.", teamName: HOME });

    expect(result.updatedSquares).toBe(0);
    expect(squareRow(squareId).status).toBe("pending");
  });

  it("does not touch squares that already settled", async () => {
    seedCard();
    const squareId = seedSquare({
      resolver: { kind: "mlb_webhook_team_event_at_least", team: "home", event: "hit", threshold: 1, currentCount: 1 },
      status: "hit",
    });

    await applyWebhookEvent({ eventType: "hit", playerId: 30, playerName: "Bobby Witt Jr.", teamName: HOME });

    // currentCount is unchanged — the square was skipped, not re-processed.
    expect((resolverOf(squareId) as { currentCount: number }).currentCount).toBe(1);
  });
});

describe("applyMlbPlayerSnapshotEvent — box-score snapshot squares", () => {
  it("sets currentCount to the snapshot's running total, not an increment", async () => {
    seedCard();
    const squareId = seedSquare({
      resolver: { kind: "mlb_webhook_player_event_at_least", player: "Bobby Witt Jr.::30", event: "hit", threshold: 2, currentCount: 0 },
      playerId: 30,
    });

    await applySnapshotEvent({ playerId: 30, playerName: "Bobby Witt Jr.", batterStats: { h: 3 } });

    expect((resolverOf(squareId) as { currentCount: number }).currentCount).toBe(3);
    // A snapshot only ever writes `currentCount`; it never touches `status` directly — that is
    // `refreshSportsBingoProgress`'s job when it next reads the resolver.
    expect(squareRow(squareId).status).toBe("pending");
  });

  it("reads the correct stat field per resolver event kind", async () => {
    seedCard();
    const hits = seedSquare({
      resolver: { kind: "mlb_webhook_player_event_at_least", player: "Bobby Witt Jr.::30", event: "hit", threshold: 1, currentCount: 0 },
      playerId: 30,
    });
    const homeRuns = seedSquare({
      resolver: { kind: "mlb_webhook_player_event_at_least", player: "Bobby Witt Jr.::30", event: "home_run", threshold: 1, currentCount: 0 },
      playerId: 30,
    });
    const pitcherOuts = seedSquare({
      resolver: { kind: "mlb_webhook_player_event_at_least", player: "Bobby Witt Jr.::30", event: "pitcher_out", threshold: 1, currentCount: 0 },
      playerId: 30,
    });

    await applySnapshotEvent({
      playerId: 30,
      playerName: "Bobby Witt Jr.",
      batterStats: { h: 2, homeRuns: 1 },
      pitcherStats: { outs: 5 },
    });

    expect((resolverOf(hits) as { currentCount: number }).currentCount).toBe(2);
    expect((resolverOf(homeRuns) as { currentCount: number }).currentCount).toBe(1);
    expect((resolverOf(pitcherOuts) as { currentCount: number }).currentCount).toBe(5);
  });

  it("skips a square whose resolved count would not change, and does not count it as updated", async () => {
    seedCard();
    seedSquare({
      resolver: { kind: "mlb_webhook_player_event_at_least", player: "Bobby Witt Jr.::30", event: "hit", threshold: 2, currentCount: 1 },
      playerId: 30,
    });

    const result = await applySnapshotEvent({ playerId: 30, playerName: "Bobby Witt Jr.", batterStats: { h: 1 } });

    expect(result.updatedSquares).toBe(0);
  });

  it("does not touch a different player's square, even for the same game", async () => {
    seedCard();
    const squareId = seedSquare({
      resolver: { kind: "mlb_webhook_player_event_at_least", player: "Bobby Witt Jr.::30", event: "hit", threshold: 1, currentCount: 0 },
      playerId: 30,
    });

    await applySnapshotEvent({ playerId: 99, playerName: "Someone Else", batterStats: { h: 5 } });

    expect((resolverOf(squareId) as { currentCount: number }).currentCount).toBe(0);
  });

  it("no-ops on a malformed event rather than throwing", async () => {
    seedCard();
    seedSquare({
      resolver: { kind: "mlb_webhook_player_event_at_least", player: "Bobby Witt Jr.::30", event: "hit", threshold: 1, currentCount: 0 },
      playerId: 30,
    });

    const result = await applySnapshotEvent({ playerId: 0, playerName: "", batterStats: { h: 5 } });

    expect(result.updatedSquares).toBe(0);
  });
});

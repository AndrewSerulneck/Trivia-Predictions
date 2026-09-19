import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "@/tests/fixtures/bingo-brunswick-grove-2026-09-09.json";
import type { SportsBingoResolver } from "@/lib/sportsBingo";
import type { Row } from "@/tests/helpers/bingoSupabaseDouble";

const store = vi.hoisted(() => ({
  db: { sports_bingo_cards: [] as Row[], sports_bingo_squares: [] as Row[], notifications: [] as Row[] },
  broadcasts: [] as Array<{ channel: string; event: string }>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({ applyChallengeCampaignPoints: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", async () => {
  const { createSupabaseAdminDouble } = await import("@/tests/helpers/bingoSupabaseDouble");
  return { supabaseAdmin: {
    ...createSupabaseAdminDouble(store.db),
    channel: (name: string) => ({ send: async (payload: { event: string }) => {
      store.broadcasts.push({ channel: name, event: payload.event });
      return "ok";
    } }),
  } };
});

const resolvers = fixture.squares.map(square => square.resolver as SportsBingoResolver);
const completeInput = () => ({
  game: structuredClone(fixture.provider.game.rows[0]),
  homeTeam: fixture.card.home_team,
  awayTeam: fixture.card.away_team,
  statRows: structuredClone(fixture.provider.stats.rows) as Array<Record<string, unknown>>,
  teamStatRows: structuredClone(fixture.provider.teamStats.rows),
  designationRows: structuredClone(fixture.provider.designations.rows),
  plays: structuredClone(fixture.provider.plays.rows),
  resolvers,
});
const seedActiveBoard = () => {
  store.db.sports_bingo_cards = [{ ...fixture.card, user_id: "incident-player-redacted", status: "active", settled_at: null }];
  store.db.sports_bingo_squares = fixture.squares.map(square => ({
    ...structuredClone(square), status: square.is_free ? "hit" : "pending", resolved_at: null,
  }));
};
function installProvider(input: ReturnType<typeof completeInput>) {
  vi.stubEnv("BALLDONTLIE_API_KEY", "offline-test");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    const data = path.endsWith("/games") ? [input.game] : path.endsWith("/team_stats") ? input.teamStatRows
      : path.endsWith("/stats") ? input.statRows : path.endsWith("/plays") ? input.plays
      : path.endsWith("/player_designations") ? input.designationRows : [];
    return Response.json({ data, meta: { next_cursor: null } });
  }));
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-10T12:20:09.000Z"));
  store.db.sports_bingo_cards = [];
  store.db.sports_bingo_squares = [];
  store.db.notifications = [];
  store.broadcasts = [];
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected network access in offline incident replay"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Brunswick Grove original board — Phase 1 evidence, no production repair", () => {
  it("accounts for all original squares and agrees with every official resolver outcome", async () => {
    const { gradeResolversAgainstCompletedNFLGame, boardStatusesMakeALine } = await import("@/lib/sportsBingo");
    expect(fixture.squares.map(square => square.square_index)).toEqual(Array.from({ length: 25 }, (_, index) => index));
    expect(fixture.squares.filter(square => square.is_free)).toHaveLength(1);
    const results = gradeResolversAgainstCompletedNFLGame(completeInput());
    const differences = fixture.squares.filter((square, index) => results[index].status !== square.expected);
    expect(differences.map(square => square.square_index)).toEqual([]);
    // Third column is [2, 7, 12, 17, 22], independently checked from the board layout.
    expect([2, 7, 12, 17, 22].map(index => fixture.squares[index].expected)).toEqual(["hit", "hit", "hit", "hit", "hit"]);
    expect(boardStatusesMakeALine(fixture.squares.map(square => ({ index: square.square_index, hit: square.expected === "hit" })))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps a board active during a provider outage instead of losing it at the old 12-hour cutoff", async () => {
    seedActiveBoard();
    const { refreshSportsBingoProgress } = await import("@/lib/sportsBingo");
    expect(await refreshSportsBingoProgress()).toMatchObject({ scannedCards: 1, settledLosses: 0 });
    expect(store.db.sports_bingo_cards[0].status).toBe("active");
    expect(store.db.sports_bingo_squares.filter(square => square.status === "pending")).toHaveLength(24);
  });

  it("does not revisit the captured lost card even with bypassCache", async () => {
    store.db.sports_bingo_cards = [{ ...fixture.card, user_id: "incident-player-redacted" }];
    store.db.sports_bingo_squares = structuredClone(fixture.squares);
    const { refreshSportsBingoProgress } = await import("@/lib/sportsBingo");
    expect(await refreshSportsBingoProgress({ bypassCache: true })).toMatchObject({ scannedCards: 0, updatedSquares: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  // Regressions converted from Phase 1 expected failures after implementing the fixes.
  it("D1: routes the persisted nfl key to NFL provider data before timeout", async () => {
    seedActiveBoard();
    vi.stubEnv("BALLDONTLIE_API_KEY", "offline-test");
    vi.setSystemTime(new Date("2026-09-10T03:40:00Z"));
    const { refreshSportsBingoProgress } = await import("@/lib/sportsBingo");
    await refreshSportsBingoProgress();
    expect(fetch).toHaveBeenCalled();
  });

  it("D2: a participating player with zero receptions wins the original zero-reception square", async () => {
    const { gradeResolversAgainstCompletedNFLGame } = await import("@/lib/sportsBingo");
    expect(fixture.provider.designations.rows.find(row => row.player_id === 13874289)?.did_not_play).toBe(false);
    expect(gradeResolversAgainstCompletedNFLGame(completeInput())[17].status).toBe("hit");
  });

  it("D3: an absent required stat on a present player row must not produce a made-up zero hit", async () => {
    const { gradeResolversAgainstCompletedNFLGame } = await import("@/lib/sportsBingo");
    const input = completeInput();
    // Deliberate incomplete-feed variant of the real Holani row; not claimed as historical input.
    const row = input.statRows.find(row => (row.player as { id: number }).id === 278427)!;
    delete row.long_rushing;
    expect(["pending", "void"]).toContain(gradeResolversAgainstCompletedNFLGame(input)[13].status);
  });

  it("D4: a partial play fetch failure cannot prove a final no-score condition", async () => {
    // Model a successful first page and failed second page, using the real captured plays.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("cursor=")) return new Response("", { status: 503 });
      return Response.json({ data: fixture.provider.plays.rows.slice(0, 10), meta: { next_cursor: 123 } });
    }));
    const { fetchBallDontLieList } = await import("@/lib/ballDontLieClient");
    const { gradeResolversAgainstCompletedNFLGame } = await import("@/lib/sportsBingo");
    const truncation = { truncated: false };
    const plays = await fetchBallDontLieList<Record<string, unknown>>("/nfl/v1/plays", new URLSearchParams({ game_id: "1392216" }), { maxPages: 4, truncation });
    expect(truncation.truncated).toBe(true);
    expect(plays).toEqual([]);
    const results = gradeResolversAgainstCompletedNFLGame({ ...completeInput(), plays, resolvers: [{ kind: "nfl_player_first_td", player: "Eli Raridon" }] });
    expect(["pending", "void"]).toContain(results[0].status);
  });

  it("records the inside-20 versus downed wording conflict without rewriting the saved resolver", () => {
    expect(fixture.squares[1].labelDispute?.literalExpected).toBe("miss");
    expect(fixture.squares[1].expected).toBe("hit");
    expect(fixture.provider.plays.rows.filter(play => play.type_slug === "punt" && /downed by/i.test(play.text))).toHaveLength(1);
  });

  it("recovers a partial final across real sweeps and rechecks a previously wrong provisional hit", async () => {
    seedActiveBoard();
    const input = completeInput();
    const realDesignations = input.designationRows;
    input.designationRows = [];
    input.teamStatRows[0].net_passing_yards = 211; // Explicit correction variant, not historical evidence.
    installProvider(input);
    const { refreshSportsBingoProgress } = await import("@/lib/sportsBingo");
    await refreshSportsBingoProgress();
    expect(store.db.sports_bingo_cards[0].status).toBe("active");
    expect(store.db.sports_bingo_squares[0].status).toBe("hit");
    expect(store.db.sports_bingo_squares[17].status).toBe("pending");
    vi.advanceTimersByTime(61_000);
    await refreshSportsBingoProgress({ bypassCache: true });
    expect(store.db.sports_bingo_cards[0].status).toBe("active");
    input.designationRows = realDesignations;
    input.teamStatRows = completeInput().teamStatRows;
    vi.advanceTimersByTime(61_000);
    expect(await refreshSportsBingoProgress({ bypassCache: true })).toMatchObject({ settledWins: 1 });
    expect(store.db.sports_bingo_squares.map(square => square.status)).toEqual(fixture.squares.map(square => square.expected));
    expect(store.db.sports_bingo_cards[0].status).toBe("won");
  });

  it("persists an explicit void reason if final participation evidence never arrives", async () => {
    seedActiveBoard(); const input = completeInput(); input.designationRows = []; installProvider(input);
    const { refreshSportsBingoProgress } = await import("@/lib/sportsBingo");
    await refreshSportsBingoProgress();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(await refreshSportsBingoProgress({ bypassCache: true })).toMatchObject({ settledLosses: 1 });
    expect(store.db.sports_bingo_squares[17].status).toBe("void");
    expect(store.db.sports_bingo_cards[0].grading_state).toMatchObject({ reasons: { "17": "grace_expired:participation_or_player_row_missing" } });
  });

  it("a newer game snapshot replaces a stale score cache before final grading", async () => {
    seedActiveBoard(); const input = completeInput(); installProvider(input);
    const { refreshSportsBingoProgress } = await import("@/lib/sportsBingo");
    await refreshSportsBingoProgress();
    input.game.home_team_score = 60;
    vi.advanceTimersByTime(61_000);
    await refreshSportsBingoProgress({ bypassCache: true });
    expect(store.db.sports_bingo_squares[3].status).toBe("hit");
  });

  it("D7: an NFL cron sweep that updates squares publishes the card_updated channel the board listens to", async () => {
    seedActiveBoard();
    // Explicit dispatch-corrected variant isolates delivery from D1. No stored fixture is changed.
    // Keep the original persisted short key, exercising dispatch and delivery together.
    vi.setSystemTime(new Date("2026-09-10T03:40:00Z"));
    vi.stubEnv("BALLDONTLIE_API_KEY", "offline-test");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const pathname = new URL(url).pathname;
      const data = pathname.endsWith("/games") ? fixture.provider.game.rows
        : pathname.endsWith("/team_stats") ? fixture.provider.teamStats.rows
        : pathname.endsWith("/stats") ? fixture.provider.stats.rows
        : pathname.endsWith("/plays") ? fixture.provider.plays.rows : pathname.endsWith("/player_designations") ? fixture.provider.designations.rows : [];
      return Response.json({ data, meta: { next_cursor: null } });
    }));
    const { refreshSportsBingoProgress } = await import("@/lib/sportsBingo");
    expect(await refreshSportsBingoProgress()).toMatchObject({ updatedSquares: 24 });
    expect(store.broadcasts).toContainEqual({ channel: "bingo-game:1392216", event: "card_updated" });
    expect(store.db.sports_bingo_cards[0].status).toBe("active");
    vi.advanceTimersByTime(61_000);
    expect(await refreshSportsBingoProgress({ bypassCache: true })).toMatchObject({ settledWins: 1 });
    expect(store.db.sports_bingo_squares.map(square => square.status)).toEqual(fixture.squares.map(square => square.expected));
    expect(store.db.sports_bingo_cards[0].status).toBe("won");
    const notifications = store.db.notifications.length;
    expect(await refreshSportsBingoProgress({ bypassCache: true })).toMatchObject({ settledWins: 0 });
    expect(store.db.notifications).toHaveLength(notifications);
  });
});

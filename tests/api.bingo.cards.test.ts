import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listUserSportsBingoCards: vi.fn(),
  listUserSportsBingoCardDates: vi.fn(),
  generateSportsBingoBoard: vi.fn(),
  createSportsBingoCard: vi.fn(),
}));

vi.mock("@/lib/sportsBingo", () => ({
  listUserSportsBingoCards: mocks.listUserSportsBingoCards,
  listUserSportsBingoCardDates: mocks.listUserSportsBingoCardDates,
  generateSportsBingoBoard: mocks.generateSportsBingoBoard,
  createSportsBingoCard: mocks.createSportsBingoCard,
}));

import { GET, POST } from "@/app/api/bingo/cards/route";

describe("/api/bingo/cards", () => {
  beforeEach(() => {
    mocks.listUserSportsBingoCards.mockReset();
    mocks.listUserSportsBingoCardDates.mockReset();
    mocks.generateSportsBingoBoard.mockReset();
    mocks.createSportsBingoCard.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Regression for the code-review fix: an untrimmed/mis-cased sportKey must not bypass the NFL
  // activation gate. Before the fix, " americanfootball_nfl" (leading space) or
  // "AMERICANFOOTBALL_NFL" (upper case) failed the `=== NFL_SPORT_KEY` check in
  // resolveLeagueBlockReason and sailed through even with the flag off.
  it("POST generate normalizes sportKey before the league gate, blocking a disguised NFL key", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "");

    const response = await POST(
      new Request("http://localhost/api/bingo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", gameId: "game-1", sportKey: " AmericanFootball_NFL " }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("NFL Sports Bingo is coming soon.");
    expect(mocks.generateSportsBingoBoard).not.toHaveBeenCalled();
  });

  it("POST play normalizes sportKey before the league gate, blocking a disguised NFL key", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "");

    const response = await POST(
      new Request("http://localhost/api/bingo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "play",
          userId: "u1",
          venueId: "venue-1",
          gameId: "game-1",
          sportKey: " AmericanFootball_NFL ",
          squares: [{ index: 0, key: "moneyline:home", isFree: false }],
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("NFL Sports Bingo is coming soon.");
    expect(mocks.createSportsBingoCard).not.toHaveBeenCalled();
  });

  it("GET returns empty list when userId missing", async () => {
    const response = await GET(new Request("http://localhost/api/bingo/cards"));
    const body = (await response.json()) as { ok: boolean; cards: unknown[] };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.cards).toEqual([]);
    expect(mocks.listUserSportsBingoCards).not.toHaveBeenCalled();
  });

  it("GET returns card list for user", async () => {
    mocks.listUserSportsBingoCards.mockResolvedValue([{ id: "card-1" }]);

    const response = await GET(new Request("http://localhost/api/bingo/cards?userId=u1&includeSettled=true"));
    const body = (await response.json()) as { ok: boolean; cards: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]?.id).toBe("card-1");
    expect(mocks.listUserSportsBingoCards).toHaveBeenCalledWith({
      userId: "u1",
      includeSettled: true,
      refreshProgress: false,
    });
  });

  it("GET active view is read-only by default", async () => {
    mocks.listUserSportsBingoCards.mockResolvedValue([{ id: "card-1" }]);

    const response = await GET(
      new Request("http://localhost/api/bingo/cards?userId=u1&includeSettled=false&activeView=true")
    );

    expect(response.status).toBe(200);
    expect(mocks.listUserSportsBingoCards).toHaveBeenCalledWith({
      userId: "u1",
      includeSettled: false,
      refreshProgress: false,
    });
  });

  it("GET can explicitly request progress refresh for active cards", async () => {
    mocks.listUserSportsBingoCards.mockResolvedValue([{ id: "card-1" }]);

    const response = await GET(
      new Request("http://localhost/api/bingo/cards?userId=u1&includeSettled=false&refreshProgress=true")
    );

    expect(response.status).toBe(200);
    expect(mocks.listUserSportsBingoCards).toHaveBeenCalledWith({
      userId: "u1",
      includeSettled: false,
      refreshProgress: true,
    });
  });

  it("GET settled card reads never trigger progress refresh", async () => {
    mocks.listUserSportsBingoCards.mockResolvedValue([{ id: "card-1" }]);

    const response = await GET(
      new Request("http://localhost/api/bingo/cards?userId=u1&includeSettled=true&refreshProgress=true")
    );

    expect(response.status).toBe(200);
    expect(mocks.listUserSportsBingoCards).toHaveBeenCalledWith({
      userId: "u1",
      includeSettled: true,
      refreshProgress: false,
    });
  });

  // Phase 5a — the calendar's day filter has to run in SQL. `tzOffsetMinutes` follows
  // Date.getTimezoneOffset(): minutes to ADD to local time to reach UTC, so UTC-4 sends 240 and
  // local midnight on 2026-09-06 is 04:00Z that same day.
  it("GET translates date + tzOffsetMinutes into a half-open UTC starts_at window", async () => {
    mocks.listUserSportsBingoCards.mockResolvedValue([]);

    const response = await GET(
      new Request(
        "http://localhost/api/bingo/cards?userId=u1&includeSettled=true&date=2026-09-06&tzOffsetMinutes=240"
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.listUserSportsBingoCards).toHaveBeenCalledWith({
      userId: "u1",
      includeSettled: true,
      refreshProgress: false,
      startsAtFrom: "2026-09-06T04:00:00.000Z",
      startsAtTo: "2026-09-07T04:00:00.000Z",
    });
  });

  it("GET handles a negative tz offset (east of UTC) without drifting a day", async () => {
    mocks.listUserSportsBingoCards.mockResolvedValue([]);

    await GET(
      new Request(
        "http://localhost/api/bingo/cards?userId=u1&includeSettled=true&date=2026-09-06&tzOffsetMinutes=-540"
      )
    );

    expect(mocks.listUserSportsBingoCards).toHaveBeenCalledWith({
      userId: "u1",
      includeSettled: true,
      refreshProgress: false,
      startsAtFrom: "2026-09-05T15:00:00.000Z",
      startsAtTo: "2026-09-06T15:00:00.000Z",
    });
  });

  // Silently ignoring a bad `date` would hand a past-day view the player's whole history, which
  // reads as a data bug rather than a bad request.
  it("GET rejects a malformed date instead of falling back to every card", async () => {
    const response = await GET(new Request("http://localhost/api/bingo/cards?userId=u1&date=09-06-2026"));
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("YYYY-MM-DD");
    expect(mocks.listUserSportsBingoCards).not.toHaveBeenCalled();
  });

  // `Date.UTC(2026, 1, 30)` silently rolls to March 2, so shape-only validation would return
  // the wrong day's boards with a 200. The round-trip check rejects it.
  it("GET rejects a calendar-impossible date (2026-02-30) instead of rolling it over", async () => {
    const response = await GET(new Request("http://localhost/api/bingo/cards?userId=u1&date=2026-02-30"));
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("YYYY-MM-DD");
    expect(mocks.listUserSportsBingoCards).not.toHaveBeenCalled();
  });

  it("GET accepts a real calendar day (2026-02-28)", async () => {
    mocks.listUserSportsBingoCards.mockResolvedValue([]);

    const response = await GET(
      new Request("http://localhost/api/bingo/cards?userId=u1&date=2026-02-28&tzOffsetMinutes=0")
    );

    expect(response.status).toBe(200);
    expect(mocks.listUserSportsBingoCards).toHaveBeenCalledWith({
      userId: "u1",
      includeSettled: true,
      refreshProgress: false,
      startsAtFrom: "2026-02-28T00:00:00.000Z",
      startsAtTo: "2026-03-01T00:00:00.000Z",
    });
  });

  it("GET still returns 200 with cards (and no activeDates) when the calendar-dates query fails", async () => {
    mocks.listUserSportsBingoCards.mockResolvedValue([{ id: "card-1" }]);
    mocks.listUserSportsBingoCardDates.mockRejectedValue(new Error("calendar query blew up"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(
      new Request("http://localhost/api/bingo/cards?userId=u1&includeDates=true&tzOffsetMinutes=240")
    );
    const body = (await response.json()) as { ok: boolean; cards: Array<{ id: string }>; activeDates?: string[] };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.cards).toHaveLength(1);
    expect(body.activeDates).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("GET omits the starts_at window entirely when no date is given", async () => {
    mocks.listUserSportsBingoCards.mockResolvedValue([]);

    await GET(new Request("http://localhost/api/bingo/cards?userId=u1&includeSettled=true"));

    const call = mocks.listUserSportsBingoCards.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("startsAtFrom");
    expect(call).not.toHaveProperty("startsAtTo");
  });

  it("GET returns activeDates only when includeDates is requested", async () => {
    mocks.listUserSportsBingoCards.mockResolvedValue([]);
    mocks.listUserSportsBingoCardDates.mockResolvedValue(["2026-09-05", "2026-09-06"]);

    const withoutDates = await GET(new Request("http://localhost/api/bingo/cards?userId=u1"));
    const withoutBody = (await withoutDates.json()) as { activeDates?: string[] };
    expect(withoutBody.activeDates).toBeUndefined();
    expect(mocks.listUserSportsBingoCardDates).not.toHaveBeenCalled();

    const withDates = await GET(
      new Request("http://localhost/api/bingo/cards?userId=u1&includeDates=true&tzOffsetMinutes=240")
    );
    const withBody = (await withDates.json()) as { activeDates?: string[] };

    expect(withBody.activeDates).toEqual(["2026-09-05", "2026-09-06"]);
    expect(mocks.listUserSportsBingoCardDates).toHaveBeenCalledWith({ userId: "u1", tzOffsetMinutes: 240 });
  });

  it("POST generate returns board preview", async () => {
    mocks.generateSportsBingoBoard.mockResolvedValue({ game: { id: "game-1" }, squares: [] });

    const response = await POST(
      new Request("http://localhost/api/bingo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", gameId: "game-1", sportKey: "basketball_nba" }),
      })
    );
    const body = (await response.json()) as { ok: boolean; board: { game: { id: string } } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.board.game.id).toBe("game-1");
    expect(mocks.generateSportsBingoBoard).toHaveBeenCalledWith({
      gameId: "game-1",
      sportKey: "basketball_nba",
      generationMode: "preview",
    });
  });

  it("POST play returns 400 when payload missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/bingo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "play", userId: "u1", venueId: "venue-1" }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("required");
  });

  it("POST play creates card", async () => {
    mocks.createSportsBingoCard.mockResolvedValue({ id: "card-2" });

    const response = await POST(
      new Request("http://localhost/api/bingo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "play",
          userId: "u1",
          venueId: "venue-1",
          gameId: "game-1",
          sportKey: "basketball_nba",
          squares: [{ index: 0, key: "moneyline:home", isFree: false }],
        }),
      })
    );

    const body = (await response.json()) as { ok: boolean; card: { id: string } };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.card.id).toBe("card-2");
    expect(mocks.createSportsBingoCard).toHaveBeenCalledWith({
      userId: "u1",
      venueId: "venue-1",
      gameId: "game-1",
      sportKey: "basketball_nba",
      squares: [{ index: 0, key: "moneyline:home", isFree: false }],
    });
  });
});

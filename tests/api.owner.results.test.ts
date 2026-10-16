import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/partner-results-page-plan.md §5e: GET /api/owner/results goes through withOwnerVenue — a
// signed-in partner AND a venueId they control, checked BEFORE any read — and is never cached.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<{ ownerId: string; venueIds: string[] }> => ({ ownerId: "owner-1", venueIds: ["venue-1"] })),
  page: vi.fn(async (_params: Record<string, unknown>) => ({ games: [], rewards: [], nextBefore: null })),
  game: vi.fn(async (_params: Record<string, unknown>) => ({ game: { title: "Weekday Trivia" }, standings: [], rewards: [] })),
  breakdown: vi.fn(async (_params: Record<string, unknown>) => ({ rows: [], total: 0 })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.auth }));
vi.mock("@/lib/results/ownerResults", () => ({
  getResultsTimelinePage: mocks.page,
  getResultsGameScreen: mocks.game,
  getResultsBreakdown: mocks.breakdown,
}));

import { GET } from "@/app/api/owner/results/route";
import { GET as GET_GAME } from "@/app/api/owner/results/games/[competition]/[gameKey]/route";
import { GET as GET_BREAKDOWN } from "@/app/api/owner/results/games/[competition]/[gameKey]/breakdown/route";
import { decodeResultsPathParam } from "@/lib/results/pathParams";
import { ResultsNotFoundError, ResultsUnavailableError } from "@/lib/results/errors";

const get = (query: string) => GET(new Request(`http://localhost/api/owner/results?${query}`));

beforeEach(() => {
  mocks.auth.mockClear();
  mocks.page.mockClear();
  mocks.game.mockClear();
  mocks.breakdown.mockClear();
});

describe("GET /api/owner/results", () => {
  it("passes a signed-out request's 401 through and reads nothing", async () => {
    mocks.auth.mockImplementationOnce(async () => {
      throw new Response(JSON.stringify({ ok: false, code: "no_session" }), { status: 401 });
    });
    expect((await get("venueId=venue-1")).status).toBe(401);
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it("needs a venueId, and refuses another partner's venue with 403, before reading anything", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("venueId=venue-2")).status).toBe(403);
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it("reads one page for the partner's venue, uncached, with the cursor", async () => {
    const response = await get("venueId=venue-1&before=2026-09-01");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, games: [], rewards: [], nextBefore: null });
    expect(mocks.page).toHaveBeenCalledWith({ venueId: "venue-1", before: "2026-09-01" });

    await get("venueId=venue-1");
    expect(mocks.page).toHaveBeenLastCalledWith({ venueId: "venue-1", before: null });
  });

  it("maps not-deployed to 503, not-found to 404 and any other failure to a generic 500", async () => {
    mocks.page.mockRejectedValueOnce(new ResultsUnavailableError("Past games aren't available yet."));
    expect((await get("venueId=venue-1")).status).toBe(503);
    mocks.page.mockRejectedValueOnce(new ResultsNotFoundError("nope"));
    expect((await get("venueId=venue-1")).status).toBe(404);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.page.mockRejectedValueOnce(new Error("relation users does not exist"));
    const failed = await get("venueId=venue-1");
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("relation");
    spy.mockRestore();
  });
});

const GAME_KEY = "78a0e374-f3f1-4605-af35-89deb8040660:2026-10-14";
const ENCODED_KEY = encodeURIComponent(GAME_KEY);
const routeParams = (gameKey = ENCODED_KEY) => ({ params: Promise.resolve({ competition: "live_trivia", gameKey }) });
const getGame = (query: string, gameKey?: string) =>
  GET_GAME(new Request(`http://localhost/api/owner/results/games/live_trivia/${ENCODED_KEY}?${query}`), routeParams(gameKey));
const getBreakdown = (query: string) =>
  GET_BREAKDOWN(
    new Request(`http://localhost/api/owner/results/games/live_trivia/${ENCODED_KEY}/breakdown?${query}`),
    routeParams(),
  );

describe("GET /api/owner/results/games/[competition]/[gameKey]", () => {
  it("checks the partner and the venue before reading", async () => {
    mocks.auth.mockImplementationOnce(async () => {
      throw new Response(JSON.stringify({ ok: false, code: "no_session" }), { status: 401 });
    });
    expect((await getGame("venueId=venue-1")).status).toBe(401);
    expect((await getGame("")).status).toBe(400);
    expect((await getGame("venueId=venue-2")).status).toBe(403);
    expect(mocks.game).not.toHaveBeenCalled();
  });

  it("reads the game with its decoded key, uncached", async () => {
    const response = await getGame("venueId=venue-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, game: { title: "Weekday Trivia" }, standings: [], rewards: [] });
    expect(mocks.game).toHaveBeenCalledWith({ venueId: "venue-1", competitionId: "live_trivia", gameKey: GAME_KEY });
    // An already-decoded key passes through unchanged.
    await getGame("venueId=venue-1", GAME_KEY);
    expect(mocks.game).toHaveBeenLastCalledWith({ venueId: "venue-1", competitionId: "live_trivia", gameKey: GAME_KEY });
  });

  it("maps another venue's game to 404", async () => {
    mocks.game.mockRejectedValueOnce(new ResultsNotFoundError("That game wasn't found."));
    expect((await getGame("venueId=venue-1")).status).toBe(404);
  });
});

describe("GET /api/owner/results/games/[competition]/[gameKey]/breakdown", () => {
  it("checks the partner and the venue before reading", async () => {
    expect((await getBreakdown("entry=abc")).status).toBe(400);
    expect((await getBreakdown("venueId=venue-2&entry=abc")).status).toBe(403);
    expect(mocks.breakdown).not.toHaveBeenCalled();
  });

  it("passes the entry token through, uncached", async () => {
    const response = await getBreakdown("venueId=venue-1&entry=AAAAAAAAAAAAAAAAAAAAAA");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, rows: [], total: 0 });
    expect(mocks.breakdown).toHaveBeenCalledWith({
      venueId: "venue-1",
      competitionId: "live_trivia",
      gameKey: GAME_KEY,
      entry: "AAAAAAAAAAAAAAAAAAAAAA",
    });
  });

  it("answers 503 without tokens and 404 for a token that matches nobody", async () => {
    mocks.breakdown.mockRejectedValueOnce(new ResultsUnavailableError("Player breakdowns aren't available."));
    expect((await getBreakdown("venueId=venue-1&entry=x")).status).toBe(503);
    mocks.breakdown.mockRejectedValueOnce(new ResultsNotFoundError("That player wasn't found."));
    expect((await getBreakdown("venueId=venue-1&entry=x")).status).toBe(404);
  });
});

describe("decodeResultsPathParam", () => {
  it("decodes once, passes plain values through, and turns a broken escape into a value nothing accepts", () => {
    expect(decodeResultsPathParam(ENCODED_KEY)).toBe(GAME_KEY);
    expect(decodeResultsPathParam(GAME_KEY)).toBe(GAME_KEY);
    expect(decodeResultsPathParam("%E0%A4%A")).toBe("");
    expect(decodeResultsPathParam(undefined)).toBe("");
  });
});

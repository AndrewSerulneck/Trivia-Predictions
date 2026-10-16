import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/partner-results-page-plan.md §5e: GET /api/owner/results goes through withOwnerVenue — a
// signed-in partner AND a venueId they control, checked BEFORE any read — and is never cached.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<{ ownerId: string; venueIds: string[] }> => ({ ownerId: "owner-1", venueIds: ["venue-1"] })),
  page: vi.fn(async (_params: Record<string, unknown>) => ({ games: [], rewards: [], nextBefore: null })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.auth }));
vi.mock("@/lib/results/ownerResults", () => ({ getResultsTimelinePage: mocks.page }));

import { GET } from "@/app/api/owner/results/route";
import { ResultsNotFoundError, ResultsUnavailableError } from "@/lib/results/errors";

const get = (query: string) => GET(new Request(`http://localhost/api/owner/results?${query}`));

beforeEach(() => {
  mocks.auth.mockClear();
  mocks.page.mockClear();
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

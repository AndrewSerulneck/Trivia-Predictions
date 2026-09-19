import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  listPickEmGames: vi.fn(),
  listRegularPickEmSports: vi.fn(),
  settlePendingPickEmPicks: vi.fn(),
}));

vi.mock("@/lib/pickem", () => mocks);

import { GET as gamesGET } from "@/app/api/pickem/games/route";
import { GET as sportsGET } from "@/app/api/pickem/sports/route";

describe("regular Pick 'Em discovery routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("serves only the regular discovery list", async () => {
    mocks.listRegularPickEmSports.mockReturnValue([{ slug: "nba", label: "Basketball" }]);
    const response = await sportsGET();
    expect(await response.json()).toEqual({ ok: true, sports: [{ slug: "nba", label: "Basketball" }] });
  });

  it("refuses a stale NFL request before it can reach the retired daily game endpoint", async () => {
    const response = await gamesGET(new Request("http://localhost/api/pickem/games?sportSlug=nfl"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "NFL Pick 'Em is available at /nfl-pickem." });
    expect(mocks.listPickEmGames).not.toHaveBeenCalled();
  });
});

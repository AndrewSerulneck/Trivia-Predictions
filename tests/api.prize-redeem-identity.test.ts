import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/reward-live-redemption-plan.md Phase 1, bug 1: every prize route took `userId` from the
// body/query and trusted it, and proxy.ts lets all /api/* through — so anyone who knew a
// player's id could list or spend that player's prizes. Each route now binds the claim to the
// signed `tp_sess` cookie (resolveRequestUserId). The REAL serverSession runs here with a
// SESSION_SECRET set, exactly as in production.

const mocks = vi.hoisted(() => ({
  redeemChallengePrize: vi.fn(),
  listChallengeCampaignWinsForUser: vi.fn(),
  claimChallengeCampaignPrize: vi.fn(),
  attachRewardWinDescriptions: vi.fn(),
  attachRewardDescriptions: vi.fn(),
  getChallengeCampaignSnapshotForUser: vi.fn(),
  listChallengeCampaigns: vi.fn(),
  attachLeaderboardSnapshotsToCampaigns: vi.fn(),
  maybeRequireActiveVenuePresence: vi.fn(),
  claimPrizeWin: vi.fn(),
  listUserPrizeWins: vi.fn(),
  getWeeklyPrizeForVenue: vi.fn(),
  from: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => {
  class PrizeRedeemUnavailableError extends Error {}
  return {
    PrizeRedeemUnavailableError,
    redeemChallengePrize: mocks.redeemChallengePrize,
    listChallengeCampaignWinsForUser: mocks.listChallengeCampaignWinsForUser,
    claimChallengeCampaignPrize: mocks.claimChallengeCampaignPrize,
    getChallengeCampaignSnapshotForUser: mocks.getChallengeCampaignSnapshotForUser,
    listChallengeCampaigns: mocks.listChallengeCampaigns,
    attachLeaderboardSnapshotsToCampaigns: mocks.attachLeaderboardSnapshotsToCampaigns,
  };
});
vi.mock("@/lib/rewards", () => ({
  attachRewardWinDescriptions: mocks.attachRewardWinDescriptions,
  attachRewardDescriptions: mocks.attachRewardDescriptions,
}));
vi.mock("@/lib/venuePresence", () => ({
  maybeRequireActiveVenuePresence: mocks.maybeRequireActiveVenuePresence,
  venuePresenceErrorResponse: () => null,
}));
vi.mock("@/lib/competition", () => ({
  claimPrizeWin: mocks.claimPrizeWin,
  listUserPrizeWins: mocks.listUserPrizeWins,
  getWeeklyPrizeForVenue: mocks.getWeeklyPrizeForVenue,
  getCurrentWeekStartDate: () => "2026-10-05",
}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: mocks.from } }));

import { createSessionCookie } from "@/lib/serverSession";
import { POST as REDEEM } from "@/app/api/prizes/redeem-challenge/route";
import { GET as WALLET, POST as CLAIM } from "@/app/api/challenge-campaigns/redeem/route";
import { GET as PRIZES, POST as PRIZES_CLAIM } from "@/app/api/prizes/route";
import { GET as HAS_UNCLAIMED } from "@/app/api/prizes/has-unclaimed/route";
import { GET as PROGRESS } from "@/app/api/challenge-campaigns/route";
import { PrizeRedeemUnavailableError } from "@/lib/challengeCampaigns";

const ME = "11111111-1111-1111-1111-111111111111";
const VICTIM = "22222222-2222-2222-2222-222222222222";

const sessionCookieFor = (userId: string): string =>
  createSessionCookie(userId).split(";")[0];

const post = (url: string, body: unknown, cookie?: string) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const get = (url: string, cookie?: string) => new Request(url, { headers: cookie ? { cookie } : {} });

let previousSecret: string | undefined;

beforeEach(() => {
  previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret";
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.redeemChallengePrize.mockResolvedValue({ redeemed: true, redeemedAt: "2026-10-05T20:00:00.000Z" });
  mocks.listChallengeCampaignWinsForUser.mockResolvedValue([]);
  mocks.attachRewardWinDescriptions.mockImplementation(async (wins: unknown[]) => wins);
  mocks.claimChallengeCampaignPrize.mockResolvedValue({ claimed: true, challengeName: "x" });
  mocks.maybeRequireActiveVenuePresence.mockResolvedValue(undefined);
  mocks.claimPrizeWin.mockResolvedValue({ claimed: true, rewardPoints: 0, prizeTitle: "x" });
  mocks.listUserPrizeWins.mockResolvedValue([]);
  mocks.getWeeklyPrizeForVenue.mockResolvedValue(null);
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = previousSecret;
});

describe("POST /api/prizes/redeem-challenge — identity", () => {
  const body = { userId: VICTIM, venueId: "venue-a", challengeId: "c-1", redemptionId: "r-1" };

  it("403s a forged userId (signed in as someone else) and redeems nothing", async () => {
    const res = await REDEEM(post("http://x/api/prizes/redeem-challenge", body, sessionCookieFor(ME)));
    expect(res.status).toBe(403);
    expect(mocks.redeemChallengePrize).not.toHaveBeenCalled();
    expect(mocks.maybeRequireActiveVenuePresence).not.toHaveBeenCalled();
  });

  it("403s a userId with no session at all", async () => {
    const res = await REDEEM(post("http://x/api/prizes/redeem-challenge", body));
    expect(res.status).toBe(403);
    expect(mocks.redeemChallengePrize).not.toHaveBeenCalled();
  });

  it("403s a tampered session cookie", async () => {
    const forged = sessionCookieFor(VICTIM).replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    const res = await REDEEM(post("http://x/api/prizes/redeem-challenge", body, forged));
    expect(res.status).toBe(403);
    expect(mocks.redeemChallengePrize).not.toHaveBeenCalled();
  });

  it("redeems for the session's own player, passing the exact coupon id through", async () => {
    const res = await REDEEM(
      post("http://x/api/prizes/redeem-challenge", { ...body, userId: ME }, sessionCookieFor(ME)),
    );
    expect(res.status).toBe(200);
    expect(mocks.maybeRequireActiveVenuePresence).toHaveBeenCalledWith({ userId: ME, venueId: "venue-a" });
    expect(mocks.redeemChallengePrize).toHaveBeenCalledWith({
      userId: ME,
      venueId: "venue-a",
      challengeId: "c-1",
      redemptionId: "r-1",
    });
  });

  it("409s an already-redeemed coupon instead of showing a second success", async () => {
    mocks.redeemChallengePrize.mockResolvedValue({ redeemed: false, redeemedAt: "2026-10-05T19:00:00.000Z" });
    const res = await REDEEM(
      post("http://x/api/prizes/redeem-challenge", { ...body, userId: ME }, sessionCookieFor(ME)),
    );
    expect(res.status).toBe(409);
    const payload = (await res.json()) as { ok: boolean; code: string };
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("already_redeemed");
  });

  it("400s (not 500s) a coupon that can't be found", async () => {
    mocks.redeemChallengePrize.mockRejectedValue(new Error("No redemption record found for this prize."));
    const res = await REDEEM(
      post("http://x/api/prizes/redeem-challenge", { ...body, userId: ME }, sessionCookieFor(ME)),
    );
    expect(res.status).toBe(400);
  });

  it("503s when redeeming is unavailable (RPC missing) — fails closed", async () => {
    mocks.redeemChallengePrize.mockRejectedValue(new PrizeRedeemUnavailableError());
    const res = await REDEEM(
      post("http://x/api/prizes/redeem-challenge", { ...body, userId: ME }, sessionCookieFor(ME)),
    );
    expect(res.status).toBe(503);
  });
});

describe("GET/POST /api/challenge-campaigns/redeem — identity", () => {
  it("403s listing another player's wallet", async () => {
    const res = await WALLET(get(`http://x/api/challenge-campaigns/redeem?userId=${VICTIM}&venueId=v`, sessionCookieFor(ME)));
    expect(res.status).toBe(403);
    expect(mocks.listChallengeCampaignWinsForUser).not.toHaveBeenCalled();
  });

  it("lists the session player's own wallet", async () => {
    const res = await WALLET(get(`http://x/api/challenge-campaigns/redeem?userId=${ME}&venueId=v`, sessionCookieFor(ME)));
    expect(res.status).toBe(200);
    expect(mocks.listChallengeCampaignWinsForUser).toHaveBeenCalledWith({ userId: ME, venueId: "v" });
  });

  it("403s claiming another player's prize", async () => {
    const res = await CLAIM(
      post("http://x/api/challenge-campaigns/redeem", { userId: VICTIM, venueId: "v", challengeId: "c" }, sessionCookieFor(ME)),
    );
    expect(res.status).toBe(403);
    expect(mocks.claimChallengeCampaignPrize).not.toHaveBeenCalled();
  });
});

describe("/api/prizes and /api/prizes/has-unclaimed — identity", () => {
  it("403s reading another player's weekly prize wins", async () => {
    const res = await PRIZES(get(`http://x/api/prizes?userId=${VICTIM}&venueId=v`, sessionCookieFor(ME)));
    expect(res.status).toBe(403);
    expect(mocks.listUserPrizeWins).not.toHaveBeenCalled();
  });

  it("still serves the anonymous weekly-prize read (no userId, no session)", async () => {
    const res = await PRIZES(get("http://x/api/prizes?venueId=v"));
    expect(res.status).toBe(200);
    expect(mocks.getWeeklyPrizeForVenue).toHaveBeenCalled();
    expect(mocks.listUserPrizeWins).not.toHaveBeenCalled();
  });

  it("403s claiming another player's weekly prize", async () => {
    const res = await PRIZES_CLAIM(
      post("http://x/api/prizes", { action: "claim", userId: VICTIM, prizeWinId: "w" }, sessionCookieFor(ME)),
    );
    expect(res.status).toBe(403);
    expect(mocks.claimPrizeWin).not.toHaveBeenCalled();
  });

  it("claims for the session player", async () => {
    const res = await PRIZES_CLAIM(
      post("http://x/api/prizes", { action: "claim", userId: ME, prizeWinId: "w" }, sessionCookieFor(ME)),
    );
    expect(res.status).toBe(200);
    expect(mocks.claimPrizeWin).toHaveBeenCalledWith({ userId: ME, prizeWinId: "w" });
  });

  it("403s probing another player's unclaimed-prize flag", async () => {
    const res = await HAS_UNCLAIMED(get(`http://x/api/prizes/has-unclaimed?userId=${VICTIM}&venueId=v`, sessionCookieFor(ME)));
    expect(res.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("counts only this venue's coupons for the session player's own flag", async () => {
    const filters: Record<string, Array<[string, string, unknown]>> = {};
    mocks.from.mockImplementation((table: string) => {
      const log: Array<[string, string, unknown]> = (filters[table] = []);
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "not", "gt"]) {
        chain[method] = (column: string, ...rest: unknown[]) => {
          log.push([method, column, rest[rest.length - 1]]);
          return chain;
        };
      }
      chain.then = (resolve: (value: { count: number }) => unknown) => resolve({ count: table === "challenge_campaign_redemptions" ? 1 : 0 });
      return chain;
    });
    const res = await HAS_UNCLAIMED(get(`http://x/api/prizes/has-unclaimed?userId=${ME}&venueId=venue-a`, sessionCookieFor(ME)));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { hasUnclaimed: boolean }).hasUnclaimed).toBe(true);
    expect(filters.challenge_campaign_redemptions).toContainEqual(["eq", "winner_user_id", ME]);
    expect(filters.challenge_campaign_redemptions).toContainEqual(["eq", "venue_id", "venue-a"]);
  });
});

describe("GET /api/challenge-campaigns — progress identity", () => {
  beforeEach(() => {
    mocks.getChallengeCampaignSnapshotForUser.mockResolvedValue([]);
    mocks.listChallengeCampaigns.mockResolvedValue([]);
    mocks.attachLeaderboardSnapshotsToCampaigns.mockImplementation(async ({ campaigns }: { campaigns: unknown[] }) => campaigns);
    mocks.attachRewardDescriptions.mockImplementation(async (campaigns: unknown[]) => campaigns);
  });

  it("serves the public listing, never the victim's progress, for a forged userId", async () => {
    const res = await PROGRESS(get(`http://x/api/challenge-campaigns?userId=${VICTIM}&venueId=v`, sessionCookieFor(ME)));
    expect(res.status).toBe(200);
    expect(mocks.getChallengeCampaignSnapshotForUser).not.toHaveBeenCalled();
    expect(mocks.listChallengeCampaigns).toHaveBeenCalled();
  });

  it("serves the session player's own progress", async () => {
    const res = await PROGRESS(get(`http://x/api/challenge-campaigns?userId=${ME}&venueId=v`, sessionCookieFor(ME)));
    expect(res.status).toBe(200);
    expect(mocks.getChallengeCampaignSnapshotForUser).toHaveBeenCalledWith({ userId: ME, venueId: "v" });
  });
});

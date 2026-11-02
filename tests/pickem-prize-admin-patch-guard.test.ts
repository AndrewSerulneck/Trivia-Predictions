import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Pick 'Em plan Phase 7.6.1 (F21, docs/pickem-college-football-and-prize-plan.md): Admin Rewards' legacy
// `challenge-campaigns` PATCH knows nothing of the save lease or the overlap rule (D6), so on a Pick 'Em
// Prize it may only rename, re-image, reorder or turn the prize off. Enable (single or bulk) and Edit's
// full re-send are refused before updateChallengeCampaign runs.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  getChallengeCampaignDefinitionId: vi.fn(),
  updateChallengeCampaign: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({ requireAdminAuth: mocks.requireAdminAuth }));
vi.mock("@/lib/challengeCampaigns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/challengeCampaigns")>()),
  getChallengeCampaignDefinitionId: mocks.getChallengeCampaignDefinitionId,
  updateChallengeCampaign: mocks.updateChallengeCampaign,
}));
vi.mock("@/lib/ads", () => ({ recordAdClick: vi.fn(), recordAdImpression: vi.fn() }));

import { PATCH } from "@/app/api/admin/route";
import {
  PICKEM_PRIZE_ADMIN_EDIT_MESSAGE,
  PICKEM_PRIZE_DEFINITION_ID,
  pickemPrizeAdminPatchRefusal,
} from "@/lib/pickemPrizes";
import { REWARD_PICKEM_ADMIN_EDIT_MESSAGE } from "@/lib/rewards";

const PRIZE_ID = "11111111-2222-4333-8444-555555555555";

const patch = (body: Record<string, unknown>) =>
  PATCH(
    new Request("http://localhost/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "challenge-campaigns", id: PRIZE_ID, ...body }),
    }),
  );

// What the admin edit form re-sends on save (ChallengesSection handleCreateOrEdit).
const EDIT_FORM_FIELDS: Record<string, unknown> = {
  rules: "Most picks right wins.",
  venueIds: ["venue-a"],
  scheduleType: "single_day",
  activeDays: ["sat"],
  startDate: "2026-11-07",
  startTime: "00:00",
  endDay: "sun",
  endTime: "23:59",
  endDate: "2026-11-07",
  gameTypes: ["pickem"],
  challengeMode: "progress",
  leaderboardDisplayLimit: 10,
  leaderboardTiebreaker: "first_to_score",
  pointMultiplier: 1,
  pointsRequiredToWin: 5,
  recurringType: "none",
  winnerUserId: null,
  prizeType: null,
  prizeGiftCertificateAmount: null,
  winnerQuota: 3,
};

describe("pickemPrizeAdminPatchRefusal", () => {
  it("allows a rename, a new picture, a reorder and turning the prize off", () => {
    expect(pickemPrizeAdminPatchRefusal({ resource: "challenge-campaigns", id: PRIZE_ID, name: "Saturday picks" })).toBeNull();
    expect(
      pickemPrizeAdminPatchRefusal({
        id: PRIZE_ID,
        imageUrl: "https://example.com/a.png",
        imageScale: 1.2,
        imageFocusX: 40,
        imageFocusY: 60,
        imageFit: "cover",
      }),
    ).toBeNull();
    expect(pickemPrizeAdminPatchRefusal({ id: PRIZE_ID, displayOrder: 20 })).toBeNull();
    expect(pickemPrizeAdminPatchRefusal({ id: PRIZE_ID, displayOrder: null })).toBeNull();
    expect(pickemPrizeAdminPatchRefusal({ id: PRIZE_ID, isActive: false })).toBeNull();
    expect(pickemPrizeAdminPatchRefusal({ id: PRIZE_ID, name: undefined, isActive: undefined })).toBeNull();
  });

  it("refuses turning it back on", () => {
    expect(pickemPrizeAdminPatchRefusal({ id: PRIZE_ID, isActive: true })).toBe(PICKEM_PRIZE_ADMIN_EDIT_MESSAGE);
    expect(pickemPrizeAdminPatchRefusal({ id: PRIZE_ID, isActive: "true" })).toBe(PICKEM_PRIZE_ADMIN_EDIT_MESSAGE);
  });

  it.each(Object.entries(EDIT_FORM_FIELDS))("refuses a change to %s", (field, value) => {
    expect(pickemPrizeAdminPatchRefusal({ id: PRIZE_ID, name: "Saturday picks", [field]: value })).toBe(
      PICKEM_PRIZE_ADMIN_EDIT_MESSAGE,
    );
  });

  it("refuses a field it has never heard of (allowlist, not denylist)", () => {
    expect(pickemPrizeAdminPatchRefusal({ id: PRIZE_ID, pickemScope: { sports: ["ncaaf"] } })).toBe(
      PICKEM_PRIZE_ADMIN_EDIT_MESSAGE,
    );
  });

  it("is the message lib/rewards.ts names", () => {
    expect(REWARD_PICKEM_ADMIN_EDIT_MESSAGE).toBe(PICKEM_PRIZE_ADMIN_EDIT_MESSAGE);
  });
});

describe("PATCH /api/admin resource=challenge-campaigns on a Pick 'Em Prize", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.requireAdminAuth.mockResolvedValue({ ok: true, status: 200 });
    mocks.getChallengeCampaignDefinitionId.mockResolvedValue(PICKEM_PRIZE_DEFINITION_ID);
    mocks.updateChallengeCampaign.mockImplementation(async (input: Record<string, unknown>) => input);
  });

  it("refuses Enable with a 409 and never writes", async () => {
    const response = await patch({ isActive: true });
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(response.status).toBe(409);
    expect(body).toEqual({ ok: false, error: REWARD_PICKEM_ADMIN_EDIT_MESSAGE });
    expect(mocks.getChallengeCampaignDefinitionId).toHaveBeenCalledWith(PRIZE_ID);
    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
  });

  it("refuses the edit form's full re-send, even when only the name changed", async () => {
    const response = await patch({ name: "Renamed", isActive: true, ...EDIT_FORM_FIELDS });
    expect(response.status).toBe(409);
    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
  });

  it("can't give it a second venue (the sweep skips a prize not for exactly one venue)", async () => {
    const response = await patch({ venueIds: ["venue-a", "venue-b"] });
    expect(response.status).toBe(409);
    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
  });

  it("can't change \"Get N right\"'s N", async () => {
    const response = await patch({ pointsRequiredToWin: 1 });
    expect(response.status).toBe(409);
    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
  });

  it("lets Disable through without reading the row", async () => {
    const response = await patch({ isActive: false });
    expect(response.status).toBe(200);
    expect(mocks.getChallengeCampaignDefinitionId).not.toHaveBeenCalled();
    expect(mocks.updateChallengeCampaign).toHaveBeenCalledWith(expect.objectContaining({ id: PRIZE_ID, isActive: false }));
  });

  it("lets a rename and a reorder through without reading the row", async () => {
    expect((await patch({ name: "Saturday picks" })).status).toBe(200);
    expect((await patch({ displayOrder: 30 })).status).toBe(200);
    expect(mocks.getChallengeCampaignDefinitionId).not.toHaveBeenCalled();
    expect(mocks.updateChallengeCampaign).toHaveBeenCalledTimes(2);
  });

  it("leaves every other prize kind as it was (Enable and Edit still work)", async () => {
    mocks.getChallengeCampaignDefinitionId.mockResolvedValue("live_trivia_challenge");
    expect((await patch({ isActive: true })).status).toBe(200);
    mocks.getChallengeCampaignDefinitionId.mockResolvedValue(null);
    expect((await patch({ name: "Legacy", ...EDIT_FORM_FIELDS })).status).toBe(200);
    expect(mocks.updateChallengeCampaign).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the row can't be read", async () => {
    mocks.getChallengeCampaignDefinitionId.mockRejectedValue(new Error("read failed"));
    const response = await patch({ isActive: true });
    expect(response.status).toBe(500);
    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
  });
});

describe("contract", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("the route checks a Pick 'Em Prize before its only updateChallengeCampaign call", () => {
    const route = read("app/api/admin/route.ts");
    const update = route.indexOf("await updateChallengeCampaign(");
    expect(update).toBeGreaterThan(-1);
    expect(route.indexOf("await updateChallengeCampaign(", update + 1)).toBe(-1);
    const guard = route.lastIndexOf("pickemPrizeAdminPatchRefusal(body)", update);
    expect(guard).toBeGreaterThan(-1);
    expect(route.slice(guard, update)).toContain("PICKEM_PRIZE_DEFINITION_ID");
  });

  it("the admin list hides Edit and disables Enable on a Pick 'Em Prize row", () => {
    const section = read("components/admin/sections/ChallengesSection.tsx");
    expect(section).toMatch(/c\.rewardDefinitionId === PICKEM_PRIZE_DEFINITION_ID \? null : \(\s*<button\s+onClick=\{\(\) => beginEdit\(c\)\}/);
    expect(section).toMatch(/disabled=\{!c\.isActive && c\.rewardDefinitionId === PICKEM_PRIZE_DEFINITION_ID\}/);
  });
});

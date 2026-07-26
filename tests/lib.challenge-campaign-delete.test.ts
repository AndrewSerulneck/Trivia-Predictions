import { beforeEach, describe, expect, it, vi } from "vitest";

// Removing a reward is the one destructive path in the Rewards system, and what
// it does to coupons players are holding is the whole point:
//
//   * mode "archive" — is_active = false. Every awarded coupon keeps working.
//   * mode "delete"  — a real DELETE. UNREDEEMED coupons are voided (that is
//     what the partner chose); ALREADY-REDEEMED ones survive as detached history
//     via `on delete set null` plus the award-time name/prize snapshot.
//
// See docs/rewards-slot-picker-review-fixes-plan.md Phase 5 and
// supabase/migrations/20260726120000_rewards_detachable_redemptions.sql.

type Redemption = {
  id: string;
  challenge_id: string | null;
  prize_redeemed_at: string | null;
};

// ── In-memory DB ─────────────────────────────────────────────────────────
const store = vi.hoisted(() => ({
  campaigns: new Map<string, { id: string; is_active: boolean }>(),
  redemptions: [] as Redemption[],
}));

// Minimal chainable fake mirroring the .select/.update/.delete/.eq/.is surface
// deleteChallengeCampaign actually calls. Resolves on await via `.then`.
const from = vi.hoisted(() =>
  vi.fn((table: string) => {
    let op: "select" | "update" | "delete" | null = null;
    let updatePayload: Record<string, unknown> | null = null;
    let eqValue: string | null = null;
    let inField: string | null = null;
    let inValues: string[] | null = null;
    // Set by `.is("prize_redeemed_at", null)` — the unredeemed-only filter.
    let unredeemedOnly = false;

    const builder = {
      select(fields?: string) {
        op = "select";
        if (fields) void fields;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        op = "update";
        updatePayload = payload;
        return builder;
      },
      delete() {
        op = "delete";
        return builder;
      },
      eq(_field: string, value: string) {
        eqValue = value;
        return builder;
      },
      in(field: string, values: string[]) {
        inField = field;
        inValues = values;
        return builder;
      },
      is(field: string, value: null) {
        if (field === "prize_redeemed_at" && value === null) unredeemedOnly = true;
        return builder;
      },
      returns() {
        return builder;
      },
      then(resolve: (value: unknown) => void) {
        if (table === "challenge_campaign_redemptions" && op === "select") {
          const rows = store.redemptions
            .filter((r) => r.challenge_id === eqValue)
            .filter((r) => !unredeemedOnly || r.prize_redeemed_at === null);
          const data = unredeemedOnly
            ? rows.map((r) => ({ id: r.id }))
            : rows.map((r) => ({ prize_redeemed_at: r.prize_redeemed_at }));
          resolve({ data, error: null });
          return;
        }
        if (table === "challenge_campaign_redemptions" && op === "delete") {
          for (let i = store.redemptions.length - 1; i >= 0; i -= 1) {
            const row = store.redemptions[i];
            if (inField === "id" && inValues) {
              if (!inValues.includes(row.id)) continue;
            } else {
              if (row.challenge_id !== eqValue) continue;
              if (unredeemedOnly && row.prize_redeemed_at !== null) continue;
            }
            store.redemptions.splice(i, 1);
          }
          resolve({ error: null });
          return;
        }
        if (table === "challenge_campaigns" && op === "update") {
          const campaign = eqValue ? store.campaigns.get(eqValue) : undefined;
          if (campaign && updatePayload) Object.assign(campaign, updatePayload);
          resolve({ error: null });
          return;
        }
        if (table === "challenge_campaigns" && op === "delete") {
          if (eqValue) {
            store.campaigns.delete(eqValue);
            // Mirrors the FK's `on delete set null`: surviving redemption rows
            // are detached rather than destroyed.
            for (const row of store.redemptions) {
              if (row.challenge_id === eqValue) row.challenge_id = null;
            }
          }
          resolve({ error: null });
          return;
        }
        resolve({ error: null });
      },
    };
    return builder;
  })
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from } }));

import {
  deleteChallengeCampaign,
  getChallengeCampaignRedemptionCounts,
} from "@/lib/challengeCampaigns";

beforeEach(() => {
  store.campaigns.clear();
  store.redemptions.length = 0;
  from.mockClear();
});

describe("getChallengeCampaignRedemptionCounts", () => {
  it("splits awarded prizes into unredeemed and redeemed", async () => {
    store.campaigns.set("camp-1", { id: "camp-1", is_active: true });
    store.redemptions.push(
      { id: "r1", challenge_id: "camp-1", prize_redeemed_at: null },
      { id: "r2", challenge_id: "camp-1", prize_redeemed_at: "2026-07-24T00:00:00.000Z" },
      { id: "r3", challenge_id: "camp-1", prize_redeemed_at: null },
      { id: "other", challenge_id: "camp-2", prize_redeemed_at: null }
    );

    expect(await getChallengeCampaignRedemptionCounts("camp-1")).toEqual({
      awarded: 3,
      unredeemed: 2,
      redeemed: 1,
    });
  });

  it("reports zeroes for a reward that never paid out", async () => {
    store.campaigns.set("camp-1", { id: "camp-1", is_active: true });
    expect(await getChallengeCampaignRedemptionCounts("camp-1")).toEqual({
      awarded: 0,
      unredeemed: 0,
      redeemed: 0,
    });
  });
});

describe("deleteChallengeCampaign", () => {
  it("archives by default, leaving the campaign and every coupon intact", async () => {
    // The default matters: a caller that forgets the mode must get the
    // recoverable behavior, never the destructive one.
    store.campaigns.set("camp-1", { id: "camp-1", is_active: true });
    store.redemptions.push({ id: "r1", challenge_id: "camp-1", prize_redeemed_at: null });

    const result = await deleteChallengeCampaign("camp-1");

    expect(result.outcome).toBe("archived");
    expect(store.campaigns.get("camp-1")?.is_active).toBe(false);
    expect(store.redemptions).toHaveLength(1);
    expect(store.redemptions[0].challenge_id).toBe("camp-1");
  });

  it("archives on request without touching any coupon", async () => {
    store.campaigns.set("camp-1", { id: "camp-1", is_active: true });
    store.redemptions.push(
      { id: "r1", challenge_id: "camp-1", prize_redeemed_at: null },
      { id: "r2", challenge_id: "camp-1", prize_redeemed_at: "2026-07-24T00:00:00.000Z" }
    );

    const result = await deleteChallengeCampaign("camp-1", { mode: "archive" });

    expect(result).toEqual({
      outcome: "archived",
      awarded: 2,
      unredeemed: 1,
      redeemed: 1,
      redeemedKept: 1,
    });
    expect(store.campaigns.has("camp-1")).toBe(true);
    expect(store.redemptions).toHaveLength(2);
  });

  it("hard-deletes a campaign with no redemption history", async () => {
    store.campaigns.set("camp-1", { id: "camp-1", is_active: true });

    const result = await deleteChallengeCampaign("camp-1", { mode: "delete" });

    expect(result.outcome).toBe("deleted");
    expect(result.awarded).toBe(0);
    expect(store.campaigns.has("camp-1")).toBe(false);
  });

  it("voids unredeemed coupons but KEEPS redeemed ones as detached history", async () => {
    // The core promise of the delete path: the venue's record of what it actually
    // handed out survives, while coupons nobody used are voided with the reward.
    store.campaigns.set("camp-1", { id: "camp-1", is_active: true });
    store.redemptions.push(
      { id: "unredeemed", challenge_id: "camp-1", prize_redeemed_at: null },
      { id: "redeemed", challenge_id: "camp-1", prize_redeemed_at: "2026-07-24T00:00:00.000Z" }
    );

    const result = await deleteChallengeCampaign("camp-1", { mode: "delete" });

    expect(result).toEqual({
      outcome: "deleted",
      awarded: 2,
      unredeemed: 1,
      redeemed: 1,
      redeemedKept: 1,
    });
    expect(store.campaigns.has("camp-1")).toBe(false);
    expect(store.redemptions).toHaveLength(1);
    expect(store.redemptions[0].id).toBe("redeemed");
    // Detached, not dangling — the row no longer points at a deleted campaign.
    expect(store.redemptions[0].challenge_id).toBeNull();
  });

  it("never touches another reward's coupons", async () => {
    store.campaigns.set("camp-1", { id: "camp-1", is_active: true });
    store.redemptions.push(
      { id: "mine", challenge_id: "camp-1", prize_redeemed_at: null },
      { id: "theirs", challenge_id: "camp-2", prize_redeemed_at: null }
    );

    await deleteChallengeCampaign("camp-1", { mode: "delete" });

    expect(store.redemptions).toHaveLength(1);
    expect(store.redemptions[0].id).toBe("theirs");
    expect(store.redemptions[0].challenge_id).toBe("camp-2");
  });

  it("requires an id", async () => {
    await expect(deleteChallengeCampaign("   ", { mode: "delete" })).rejects.toThrow(
      "Challenge id is required."
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Partner Self-Serve Signup — Phase 5 touched ONE shared thing:
 * `createAdminVenue` grew optional `hidden` / `selfServeCreatedAt` inputs so
 * POST /api/owner/signup can create a hidden, sweepable venue in a single
 * insert instead of an insert followed by an UPDATE.
 *
 * Two claims are made about that change, and both are load-bearing:
 *
 *   1. Existing admin callers are unaffected — neither column appears in the
 *      insert at all when the inputs are omitted, so `hidden` keeps its `false`
 *      column default and `self_serve_created_at` stays null. Admin's
 *      Activate-a-Venue flow must not start creating invisible venues.
 *   2. When signup passes them, BOTH land in the same insert. A venue created
 *      hidden but unstamped is one Phase 6's sweep may never reap and the
 *      Stripe webhook may never reveal — a permanently invisible row.
 */

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: mocks.from },
}));

import { createAdminVenue } from "@/lib/admin";

const VENUE_ROW = {
  id: "venue-the-anchor",
  name: "The Anchor",
  display_name: "The Anchor",
  logo_text: null,
  icon_emoji: null,
  street: "1 Main St",
  address: "1 Main St, Denver, CO 80202, United States",
  city: "Denver",
  state: "CO",
  zip_code: "80202",
  country: "United States",
  county: null,
  region: null,
  latitude: 39.7392,
  longitude: -104.9903,
  radius: 150,
  place_id: "place-123",
  screen_enabled: true,
  screen_brand_image_url: null,
  screen_brand_primary: null,
  screen_brand_secondary: null,
  screen_sponsor_rotation_enabled: false,
};

const BASE_INPUT = {
  name: "The Anchor",
  street: "1 Main St",
  city: "Denver",
  state: "CO",
  zipCode: "80202",
  country: "United States",
  latitude: 39.7392,
  longitude: -104.9903,
  radius: 150,
};

const insertedPayload = (): Record<string, unknown> =>
  mocks.insert.mock.calls[0]?.[0] as Record<string, unknown>;

beforeEach(() => {
  mocks.insert.mockReset();
  mocks.from.mockReset();

  // createAdminVenue first probes `venues` for id uniqueness (select→eq→
  // maybeSingle), then inserts (insert→select→single).
  mocks.from.mockImplementation(() => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    insert: (payload: Record<string, unknown>) => {
      mocks.insert(payload);
      return { select: () => ({ single: async () => ({ data: VENUE_ROW, error: null }) }) };
    },
  }));
});

describe("createAdminVenue — self-serve inputs", () => {
  it("omits both columns entirely when an admin caller passes neither", async () => {
    await createAdminVenue(BASE_INPUT);

    const payload = insertedPayload();
    expect(payload).not.toHaveProperty("hidden");
    expect(payload).not.toHaveProperty("self_serve_created_at");
  });

  it("writes hidden and self_serve_created_at in the SAME insert when signup passes them", async () => {
    const stamp = "2026-09-07T12:00:00.000Z";
    await createAdminVenue({ ...BASE_INPUT, hidden: true, selfServeCreatedAt: stamp });

    // One insert, both fields — never an insert plus a follow-up UPDATE, which
    // would leave a visible unstamped row behind if the second call failed.
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(insertedPayload()).toMatchObject({ hidden: true, self_serve_created_at: stamp });
  });

  it("honours an explicit hidden: false without inventing a stamp", async () => {
    await createAdminVenue({ ...BASE_INPUT, hidden: false });

    const payload = insertedPayload();
    expect(payload.hidden).toBe(false);
    expect(payload).not.toHaveProperty("self_serve_created_at");
  });
});

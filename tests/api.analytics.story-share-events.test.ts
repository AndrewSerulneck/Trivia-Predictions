import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  storyUpsert: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

import { POST } from "@/app/api/analytics/events/route";

function createUserVenueQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({
    data: { id: "00000000-0000-4000-8000-000000000001" },
    error: null,
  });
  return query;
}

describe("POST /api/analytics/events story share events", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.storyUpsert.mockReset();
    mocks.storyUpsert.mockResolvedValue({ error: null });

    mocks.from.mockImplementation((table: string) => {
      if (table === "users") {
        return createUserVenueQuery();
      }
      if (table === "story_share_events") {
        return {
          upsert: mocks.storyUpsert,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("persists story-share funnel events with sanitized metadata", async () => {
    const response = await POST(
      new Request("http://localhost/api/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [{
            requestId: "10000000-1000-4000-8000-100000000001",
            type: "story_share_completed",
            storyShareId: "story-flow-1",
            userId: "00000000-0000-4000-8000-000000000001",
            venueId: "venue-a",
            gameType: "category-blitz",
            templateVariant: "champion",
            shareStatus: "unsupported",
            fallbackRecommended: true,
            resultReason: "Web Share API is unavailable.",
            finalRank: 1,
            finalPoints: 240,
            correctRate: 92,
            isChampion: true,
            occurredAt: "2026-07-11T20:00:00.000Z",
          }],
        }),
      })
    );

    const body = await response.json() as { ok: boolean; accepted: number };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, accepted: 1 });
    expect(mocks.storyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: "10000000-1000-4000-8000-100000000001",
        story_share_id: "story-flow-1",
        user_id: "00000000-0000-4000-8000-000000000001",
        venue_id: "venue-a",
        game_type: "category-blitz",
        event_type: "story_share_completed",
        event_at: "2026-07-11T20:00:00.000Z",
        template_variant: "champion",
        share_status: "unsupported",
        fallback_recommended: true,
        result_reason: "Web Share API is unavailable.",
        final_rank: 1,
        final_points: 240,
        correct_rate: 92,
        is_champion: true,
      }),
      { onConflict: "event_id" }
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prop Bingo code-review fix plan, Phase 10 (finding 3).
 *
 * The Phase 1 retirement removed `inline` from AD_PLACEMENTS["sports-bingo"], so every legacy
 * Bingo inline row became unsaveable at the lib layer — isAdTypeSupportedForPage and the trigger
 * check both throw — which is what made those rows permanently uneditable. updateAdminAdvertisement
 * now skips exactly those two checks when the save leaves the row INACTIVE, so an admin can wind a
 * legacy row down. Everything else about the guard must stay put: an active save still throws here,
 * creation is still impossible, and other invalid placements are still refused even when inactive.
 */

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: mocks.from },
}));

import { createAdminAdvertisement, updateAdminAdvertisement } from "@/lib/admin";

const RETIRED_ROW = {
  id: "ad-legacy",
  slot: "inline-content",
  slot_key: "sports-bingo-inline",
  page_key: "sports-bingo",
  ad_type: "inline",
  display_trigger: "on-load",
  advertiser_name: "Legacy Partner",
  image_url: "https://example.com/a.png",
  click_url: "https://example.com",
  alt_text: "Legacy",
  width: 300,
  height: 250,
  active: false,
  start_date: "2026-01-01",
};

const baseInput = {
  id: "ad-legacy",
  slot: "inline-content" as const,
  pageKey: "sports-bingo" as const,
  adType: "inline" as const,
  advertiserName: "Legacy Partner",
  imageUrl: "https://example.com/a.png",
  clickUrl: "https://example.com",
  altText: "Legacy",
  width: 300,
  height: 250,
  startDate: "2026-01-01",
};

describe("updateAdminAdvertisement — retired Bingo inline wind-down", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  function mockUpdateChain() {
    const single = vi.fn().mockResolvedValue({ data: RETIRED_ROW, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ update });
    return { update };
  }

  it("saves a legacy Bingo inline ad when it is being deactivated", async () => {
    const { update } = mockUpdateChain();

    const result = await updateAdminAdvertisement({ ...baseInput, active: false });

    expect(result.id).toBe("ad-legacy");
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.active).toBe(false);
    // The retired placement is written back as-is, not silently rewritten to some other slot.
    expect(payload.page_key).toBe("sports-bingo");
    expect(payload.ad_type).toBe("inline");
    expect(payload.slot).toBe("inline-content");
  });

  it("still refuses to save a legacy Bingo inline ad as active", async () => {
    mockUpdateChain();

    await expect(updateAdminAdvertisement({ ...baseInput, active: true })).rejects.toThrow(
      /not supported on page "sports-bingo"/
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not relax validation for other unsupported placements just because they are inactive", async () => {
    mockUpdateChain();

    await expect(
      updateAdminAdvertisement({
        ...baseInput,
        // speed-trivia genuinely has no inline slot either — but it is not the retired
        // Bingo combination, so the relaxation must not apply to it.
        pageKey: "speed-trivia",
        adType: "inline",
        slot: "inline-content",
        active: false,
      })
    ).rejects.toThrow(/is not supported on page/);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("still refuses to CREATE a Bingo inline ad, inactive or not", async () => {
    mockUpdateChain();

    await expect(
      createAdminAdvertisement({
        slot: "inline-content",
        pageKey: "sports-bingo",
        adType: "inline",
        advertiserName: "New Partner",
        imageUrl: "https://example.com/a.png",
        clickUrl: "https://example.com",
        altText: "New",
        width: 300,
        height: 250,
        active: false,
        startDate: "2026-01-01",
      })
    ).rejects.toThrow(/not supported on page "sports-bingo"/);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

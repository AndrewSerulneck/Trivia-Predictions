import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  createAdminAdvertisement: vi.fn(),
  updateAdminAdvertisement: vi.fn(),
  listAdminAdvertisementsByIds: vi.fn(),
  bulkSetAdminAdvertisementsActive: vi.fn(),
  bulkDeleteAdminAdvertisements: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/admin", () => ({
  createAdminAdvertisement: mocks.createAdminAdvertisement,
  updateAdminAdvertisement: mocks.updateAdminAdvertisement,
  listAdminAdvertisementsByIds: mocks.listAdminAdvertisementsByIds,
  bulkSetAdminAdvertisementsActive: mocks.bulkSetAdminAdvertisementsActive,
  bulkDeleteAdminAdvertisements: mocks.bulkDeleteAdminAdvertisements,
}));

vi.mock("@/lib/ads", () => ({
  recordAdClick: vi.fn(),
  recordAdImpression: vi.fn(),
}));

import { PATCH, POST } from "@/app/api/admin/route";

const adPayload = (overrides: Record<string, unknown>) => ({
  resource: "ads",
  id: "ad-legacy",
  slot: "inline-content",
  pageKey: "sports-bingo",
  adType: "inline",
  advertiserName: "Legacy Partner",
  imageUrl: "https://example.com/a.png",
  clickUrl: "https://example.com",
  altText: "Legacy",
  width: 300,
  height: 250,
  startDate: "2026-01-01",
  ...overrides,
});

const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/admin", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("admin ads — retired Bingo inline slot guard", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.requireAdminAuth.mockResolvedValue({ ok: true, status: 200 });
  });

  it("refuses to create a new Bingo inline ad", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adPayload({ active: false })),
      })
    );
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("retired");
    expect(mocks.createAdminAdvertisement).not.toHaveBeenCalled();
  });

  it("refuses a PATCH that would leave the row an ACTIVE Bingo inline ad", async () => {
    const response = await PATCH(patchRequest(adPayload({ active: true })));
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("retired");
    expect(mocks.updateAdminAdvertisement).not.toHaveBeenCalled();
  });

  it("allows winding a legacy Bingo inline ad down to inactive", async () => {
    mocks.updateAdminAdvertisement.mockResolvedValue({ id: "ad-legacy", active: false });

    const response = await PATCH(patchRequest(adPayload({ active: false })));
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.updateAdminAdvertisement).toHaveBeenCalledTimes(1);
  });

  it("allows moving a legacy Bingo inline ad off the retired combination while active", async () => {
    mocks.updateAdminAdvertisement.mockResolvedValue({ id: "ad-legacy", active: true });

    const response = await PATCH(
      patchRequest(adPayload({ active: true, adType: "banner", slot: "mobile-adhesion" }))
    );

    expect(response.status).toBe(200);
    expect(mocks.updateAdminAdvertisement).toHaveBeenCalledTimes(1);
  });

  it("skips retired ids on bulk enable and reports them back", async () => {
    mocks.listAdminAdvertisementsByIds.mockResolvedValue([
      { id: "ad-legacy", pageKey: "sports-bingo", adType: "inline", slot: "inline-content", slotKey: "sports-bingo-inline" },
      { id: "ad-ok", pageKey: "pickem", adType: "banner", slot: "mobile-adhesion", slotKey: "pickem-banner" },
    ]);
    mocks.bulkSetAdminAdvertisementsActive.mockResolvedValue(1);

    const response = await PATCH(
      patchRequest({ resource: "ads-bulk", action: "enable", ids: ["ad-legacy", "ad-ok"] })
    );
    const body = (await response.json()) as { ok: boolean; updated: number; skippedRetired?: number; skippedRetiredIds?: string[] };

    expect(response.status).toBe(200);
    expect(mocks.bulkSetAdminAdvertisementsActive).toHaveBeenCalledWith(["ad-ok"], true);
    expect(body.updated).toBe(1);
    expect(body.skippedRetired).toBe(1);
    expect(body.skippedRetiredIds).toEqual(["ad-legacy"]);
  });

  it("does not call the enable helper when every selected id is retired", async () => {
    mocks.listAdminAdvertisementsByIds.mockResolvedValue([
      { id: "ad-legacy", pageKey: "sports-bingo", adType: "inline", slot: "inline-content", slotKey: "sports-bingo-inline" },
    ]);

    const response = await PATCH(patchRequest({ resource: "ads-bulk", action: "enable", ids: ["ad-legacy"] }));
    const body = (await response.json()) as { ok: boolean; updated: number; skippedRetired?: number };

    expect(response.status).toBe(200);
    expect(mocks.bulkSetAdminAdvertisementsActive).not.toHaveBeenCalled();
    expect(body.updated).toBe(0);
    expect(body.skippedRetired).toBe(1);
  });

  it("leaves bulk disable unguarded", async () => {
    mocks.bulkSetAdminAdvertisementsActive.mockResolvedValue(1);

    const response = await PATCH(patchRequest({ resource: "ads-bulk", action: "disable", ids: ["ad-legacy"] }));

    expect(response.status).toBe(200);
    expect(mocks.listAdminAdvertisementsByIds).not.toHaveBeenCalled();
    expect(mocks.bulkSetAdminAdvertisementsActive).toHaveBeenCalledWith(["ad-legacy"], false);
  });

  it("leaves bulk delete unguarded", async () => {
    mocks.bulkDeleteAdminAdvertisements.mockResolvedValue(1);

    const response = await PATCH(patchRequest({ resource: "ads-bulk", action: "delete", ids: ["ad-legacy"] }));

    expect(response.status).toBe(200);
    expect(mocks.listAdminAdvertisementsByIds).not.toHaveBeenCalled();
    expect(mocks.bulkDeleteAdminAdvertisements).toHaveBeenCalledWith(["ad-legacy"]);
  });
});

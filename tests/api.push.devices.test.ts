// POST /api/push/devices (docs/native-app-store-plan.md Phase 5.1): bound to the signed session, app only
// for register, and every write scoped to the player's own phone.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSessionEnforced: vi.fn(() => true),
  resolveRequestUserId: vi.fn(() => ({ userId: "user-1" as string | null, forbidden: false })),
  registerPushDevice: vi.fn(),
  updatePushPreferences: vi.fn(),
  unregisterPushDevice: vi.fn(),
}));

vi.mock("@/lib/serverSession", () => ({
  isSessionEnforced: mocks.isSessionEnforced,
  resolveRequestUserId: mocks.resolveRequestUserId,
}));
vi.mock("@/lib/push/devices", async () => {
  const actual = await vi.importActual<typeof import("@/lib/push/devices")>("@/lib/push/devices");
  return {
    isValidPushToken: actual.isValidPushToken,
    registerPushDevice: mocks.registerPushDevice,
    updatePushPreferences: mocks.updatePushPreferences,
    unregisterPushDevice: mocks.unregisterPushDevice,
  };
});
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

import { POST } from "@/app/api/push/devices/route";

const TOKEN = `fcm-${"a".repeat(40)}`;
const APP_UA = "Mozilla/5.0 HightopChallengeApp/1.2.0 (android)";
const PREFS = { games: true, prizes: true, results: false };

const post = (body: Record<string, unknown>, userAgent = APP_UA) =>
  POST(
    new Request("https://play.example/api/push/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": userAgent },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  mocks.isSessionEnforced.mockReturnValue(true);
  mocks.resolveRequestUserId.mockReturnValue({ userId: "user-1", forbidden: false });
  mocks.registerPushDevice.mockResolvedValue({ ok: true, preferences: PREFS });
  mocks.updatePushPreferences.mockResolvedValue({ ok: true, preferences: PREFS });
  mocks.unregisterPushDevice.mockResolvedValue({ ok: true });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/push/devices", () => {
  it("refuses outright without sessions (the dev server shares the production database)", async () => {
    mocks.isSessionEnforced.mockReturnValue(false);
    const res = await post({ action: "register", token: TOKEN });
    expect(res.status).toBe(503);
    expect(mocks.registerPushDevice).not.toHaveBeenCalled();
  });

  it("a forged userId is 403 and no session is 401", async () => {
    mocks.resolveRequestUserId.mockReturnValue({ userId: null, forbidden: true });
    expect((await post({ action: "register", token: TOKEN, userId: "someone-else" })).status).toBe(403);
    mocks.resolveRequestUserId.mockReturnValue({ userId: null, forbidden: false });
    expect((await post({ action: "register", token: TOKEN })).status).toBe(401);
    expect(mocks.registerPushDevice).not.toHaveBeenCalled();
  });

  it("rejects a malformed token", async () => {
    for (const token of [undefined, "short", `has space ${"a".repeat(30)}`, 42]) {
      expect((await post({ action: "register", token })).status).toBe(400);
    }
  });

  it("register: only from the app, with platform and version from the User-Agent, never the body", async () => {
    expect((await post({ action: "register", token: TOKEN }, "Mozilla/5.0 Safari")).status).toBe(400);
    const res = await post({ action: "register", token: TOKEN, platform: "ios", appVersion: "9.9.9" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, preferences: PREFS });
    expect(mocks.registerPushDevice).toHaveBeenCalledWith({
      userId: "user-1",
      token: TOKEN,
      platform: "android",
      appVersion: "1.2.0",
    });
  });

  it("preferences: passes only boolean switches it knows", async () => {
    await post({ action: "preferences", token: TOKEN, preferences: { results: false, games: "yes", marketing: true } });
    expect(mocks.updatePushPreferences).toHaveBeenCalledWith({ userId: "user-1", token: TOKEN, changes: { results: false } });
    mocks.updatePushPreferences.mockResolvedValue({ ok: false, error: "not_found" });
    expect((await post({ action: "preferences", token: TOKEN, preferences: { games: false } })).status).toBe(404);
  });

  it("unregister removes the session player's phone", async () => {
    const res = await post({ action: "unregister", token: TOKEN });
    expect(res.status).toBe(200);
    expect(mocks.unregisterPushDevice).toHaveBeenCalledWith({ userId: "user-1", token: TOKEN });
  });

  it("an unknown action is 400", async () => {
    expect((await post({ action: "spam", token: TOKEN })).status).toBe(400);
  });
});

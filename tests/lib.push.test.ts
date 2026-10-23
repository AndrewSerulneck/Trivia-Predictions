// Phase 5.1 (docs/native-app-store-plan.md): phone push — categories, the FCM sender, the outbox, the
// "Live Trivia starts soon" sweep and the app-side client.
import { generateKeyPairSync, createVerify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  findStartingOccurrences: vi.fn(),
  getVenueDisplayName: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/lib/liveShowdownEngine", () => ({ findStartingOccurrences: mocks.findStartingOccurrences }));
vi.mock("@/lib/venueDisplayName", () => ({ getVenueDisplayName: mocks.getVenueDisplayName }));

import { buildFcmMessage, classifyFcmError, resetFcmCacheForTests, sendPushMessages } from "@/lib/push/fcm";
import { pushesFromClaimedRows, sendPendingNotificationPushes } from "@/lib/push/outbox";
import { gameReminderBody, sendLiveGameStartPushes, GAME_REMINDER_TITLE } from "@/lib/push/gameReminders";
import { pushCategoryForNotification, safePushPath } from "@/lib/pushCategories";
import {
  disablePushForSignOut,
  enablePush,
  isPushAvailable,
  pushPathFromTap,
  shouldAskForPush,
  syncPushRegistration,
  toPushPermission,
} from "@/lib/nativePush";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SERVICE_ACCOUNT = {
  type: "service_account",
  project_id: "hightop-test",
  client_email: "sender@hightop-test.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};
const TOKEN = (n: number) => `token-${n}-${"x".repeat(30)}`;

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** fetch stub: Google's OAuth endpoint, then FCM sends answered by `fcm(token)`. */
const stubGoogle = (fcm: (token: string) => Response) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return jsonResponse(200, { access_token: "access-1", expires_in: 3600 });
    }
    const body = JSON.parse(String(init?.body)) as { message: { token: string } };
    return fcm(body.message.token);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

beforeEach(() => {
  resetFcmCacheForTests();
  process.env.FCM_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify(SERVICE_ACCOUNT)).toString("base64");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FCM_SERVICE_ACCOUNT_JSON;
});

describe("push categories", () => {
  it("anything that links to the prize wallet is a prize; everything else is a result", () => {
    expect(pushCategoryForNotification("/redeem-prizes")).toBe("prizes");
    expect(pushCategoryForNotification("/redeem-prizes?prize=1")).toBe("prizes");
    expect(pushCategoryForNotification("/redeem-prizes-elsewhere")).toBe("results");
    expect(pushCategoryForNotification("/pickem")).toBe("results");
    expect(pushCategoryForNotification(null)).toBe("results");
  });

  it("a tapped push only ever opens a path on our own site", () => {
    expect(safePushPath("/redeem-prizes")).toBe("/redeem-prizes");
    expect(safePushPath("/venue/abc?x=1")).toBe("/venue/abc?x=1");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "javascript:alert(1)", "", "/a\nb", 42, null]) {
      expect(safePushPath(bad)).toBeNull();
    }
  });
});

describe("FCM sender", () => {
  it("signs a valid RS256 JWT for the messaging scope, sends one call per phone, and caches the login", async () => {
    const fetchMock = stubGoogle(() => jsonResponse(200, { name: "projects/x/messages/1" }));
    const results = await sendPushMessages([
      { token: TOKEN(1), body: "You won!", path: "/redeem-prizes" },
      { token: TOKEN(2), title: "Live Trivia starts soon", body: "8:00 PM" },
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    await sendPushMessages([{ token: TOKEN(3), body: "again" }]);

    const oauthCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("oauth2"));
    expect(oauthCalls).toHaveLength(1);
    const assertion = new URLSearchParams(String(oauthCalls[0][1]?.body)).get("assertion") ?? "";
    const [header, claims, signature] = assertion.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    const decoded = JSON.parse(Buffer.from(claims, "base64url").toString()) as Record<string, unknown>;
    expect(decoded.iss).toBe(SERVICE_ACCOUNT.client_email);
    expect(decoded.scope).toBe("https://www.googleapis.com/auth/firebase.messaging");

    const sendCall = fetchMock.mock.calls.find(([url]) => String(url).includes("fcm.googleapis.com"));
    expect(String(sendCall?.[0])).toBe("https://fcm.googleapis.com/v1/projects/hightop-test/messages:send");
    expect((sendCall?.[1]?.headers as Record<string, string>).Authorization).toBe("Bearer access-1");
  });

  it("marks only truly dead tokens dead, and never retries", async () => {
    const fcmError = (status: number, errorCode: string, message = "") =>
      jsonResponse(status, {
        error: { status: errorCode, message, details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }] },
      });
    const fetchMock = stubGoogle((token) => {
      if (token === TOKEN(1)) return fcmError(404, "UNREGISTERED");
      if (token === TOKEN(2)) return fcmError(400, "INVALID_ARGUMENT", "The registration token is not a valid FCM registration token");
      if (token === TOKEN(3)) return fcmError(400, "INVALID_ARGUMENT", "Invalid JSON payload");
      if (token === TOKEN(4)) return fcmError(429, "QUOTA_EXCEEDED");
      return jsonResponse(404, { error: { status: "NOT_FOUND", message: "Requested entity was not found." } });
    });
    const results = await sendPushMessages([1, 2, 3, 4, 5].map((n) => ({ token: TOKEN(n), body: "x" })));
    expect(results.map((r) => (r.ok ? "ok" : r.dead ? "dead" : "kept"))).toEqual(["dead", "dead", "kept", "kept", "kept"]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("fcm.googleapis.com"))).toHaveLength(5);
  });

  it("classifies errors without the details block too", () => {
    expect(classifyFcmError(404, { error: { status: "UNREGISTERED" } })).toEqual({ dead: true, code: "UNREGISTERED" });
    expect(classifyFcmError(500, null)).toEqual({ dead: false, code: "HTTP_500" });
  });

  it("builds a message the website can route: the path rides in data, never a URL", () => {
    expect(buildFcmMessage({ token: TOKEN(1), body: "Hi", path: "/pickem" })).toEqual({
      message: {
        token: TOKEN(1),
        notification: { body: "Hi" },
        data: { path: "/pickem" },
        android: { priority: "HIGH", notification: { sound: "default" } },
        apns: { payload: { aps: { sound: "default" } } },
      },
    });
  });

  it("refuses to send without a credential", async () => {
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    await expect(sendPushMessages([{ token: TOKEN(1), body: "x" }])).rejects.toThrow(/not configured/);
  });
});

describe("notification outbox", () => {
  const row = (over: Partial<Record<string, unknown>>) => ({
    notification_id: "n1",
    message: "You won a prize!",
    link_url: "/redeem-prizes",
    device_id: "d1",
    token: TOKEN(1),
    notify_prizes: true,
    notify_results: true,
    ...over,
  });

  it("applies each phone's switches by category", () => {
    const { messages, muted } = pushesFromClaimedRows([
      row({ device_id: "d1" }),
      row({ device_id: "d2", notify_prizes: false }),
      row({ device_id: "d3", link_url: "/pickem", notify_results: false }),
      row({ device_id: "d4", link_url: "/pickem", notify_prizes: false }),
      row({ device_id: "d5", message: "   " }),
    ]);
    expect(messages.map((m) => m.deviceId)).toEqual(["d1", "d4"]);
    expect(messages[1]).toMatchObject({ body: "You won a prize!", path: "/pickem" });
    expect(muted).toBe(3);
  });

  it("does nothing at all while push isn't configured", async () => {
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    expect(await sendPendingNotificationPushes()).toMatchObject({ skipped: "not-configured" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("claims, sends, and disables the dead phones in one write", async () => {
    mocks.rpc.mockResolvedValue({
      data: [row({ device_id: "d1", token: TOKEN(1) }), row({ device_id: "d2", token: TOKEN(2) })],
      error: null,
    });
    const update = vi.fn(() => ({ in: vi.fn().mockResolvedValue({ error: null }) }));
    mocks.from.mockReturnValue({ update });
    stubGoogle((token) =>
      token === TOKEN(2) ? jsonResponse(404, { error: { status: "UNREGISTERED" } }) : jsonResponse(200, {}),
    );
    const report = await sendPendingNotificationPushes();
    expect(mocks.rpc).toHaveBeenCalledWith("claim_notification_pushes", { p_window_seconds: 900, p_limit: 500 });
    expect(report).toMatchObject({ claimedRows: 2, sent: 1, failed: 1, disabledDevices: 1 });
    expect(mocks.from).toHaveBeenCalledWith("push_devices");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ disabled_reason: "fcm-dead-token" }));
  });

  it("throws (for the cron to report) when the claim fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
    await expect(sendPendingNotificationPushes()).rejects.toThrow("function missing");
  });
});

describe("Live Trivia starts soon", () => {
  const START = Date.parse("2026-10-24T00:00:00Z"); // 8:00 PM in New York

  it("says the local start time and the venue", () => {
    expect(gameReminderBody(START, "America/New_York", "Pacific Street")).toBe("8:00 PM at Pacific Street. Tap to play.");
    expect(gameReminderBody(START, "Not/AZone", null)).toBe("Starts at 8:00 PM. Tap to play.");
  });

  it("claims each game once and sends only to that venue's opted-in phones", async () => {
    mocks.findStartingOccurrences.mockResolvedValue([
      { scheduleId: "s1", occurrenceDate: "2026-10-23", venueId: "v1", numRounds: 3, startMs: START, endMs: START + 1, timezone: "America/New_York" },
      { scheduleId: "s2", occurrenceDate: "2026-10-23", venueId: "v2", numRounds: 3, startMs: START, endMs: START + 1, timezone: "America/New_York" },
    ]);
    // s2 was already claimed by an earlier run.
    const upsert = vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: [{ schedule_id: "s1", occurrence_date: "2026-10-23" }], error: null }) }));
    const deviceQuery = {
      in: vi.fn(() => deviceQuery),
      is: vi.fn(() => deviceQuery),
      eq: vi.fn(() => deviceQuery),
      gte: vi.fn().mockResolvedValue({ data: [{ id: "d1", token: TOKEN(1), venue_id: "v1" }], error: null }),
    };
    mocks.from.mockImplementation((table: string) =>
      table === "push_game_reminders" ? { upsert } : { select: vi.fn(() => deviceQuery) },
    );
    mocks.getVenueDisplayName.mockResolvedValue("Pacific Street");
    const fetchMock = stubGoogle(() => jsonResponse(200, {}));

    const report = await sendLiveGameStartPushes(START - 25 * 60_000);
    expect(report).toMatchObject({ upcoming: 2, claimed: 1, sent: 1, failed: 0 });
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: "schedule_id,occurrence_date", ignoreDuplicates: true });
    expect(deviceQuery.in).toHaveBeenCalledWith("venue_id", ["v1"]);
    expect(deviceQuery.eq).toHaveBeenCalledWith("notify_games", true);
    const sent = fetchMock.mock.calls.find(([url]) => String(url).includes("fcm.googleapis.com"));
    expect(JSON.parse(String(sent?.[1]?.body))).toMatchObject({
      message: {
        token: TOKEN(1),
        notification: { title: GAME_REMINDER_TITLE, body: "8:00 PM at Pacific Street. Tap to play." },
        data: { path: "/venue/v1" },
      },
    });
  });

  it("reads nothing while push isn't configured", async () => {
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    expect(await sendLiveGameStartPushes()).toMatchObject({ skipped: "not-configured" });
    expect(mocks.findStartingOccurrences).not.toHaveBeenCalled();
  });
});

describe("app-side client (lib/nativePush.ts)", () => {
  type Store = Record<string, string>;
  const stubApp = (nativePromise: ReturnType<typeof vi.fn>, plugins = ["FirebaseMessaging"], store: Store = {}) => {
    const localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    };
    const win = {
      navigator: { userAgent: "Mozilla HightopChallengeApp/1.0.0 (android)" },
      Capacitor: { isNativePlatform: () => true, isPluginAvailable: (n: string) => plugins.includes(n), nativePromise },
      localStorage,
    };
    vi.stubGlobal("window", win);
    vi.stubGlobal("navigator", win.navigator);
    vi.stubGlobal("document", { cookie: "tp_user_id=user-1" });
    return store;
  };

  it("is inert on the website: no plugin, no request", async () => {
    vi.stubGlobal("window", { navigator: { userAgent: "Mozilla Safari" } });
    vi.stubGlobal("navigator", { userAgent: "Mozilla Safari" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(isPushAvailable()).toBe(false);
    await disablePushForSignOut();
    await syncPushRegistration();
    expect(await shouldAskForPush()).toBe(false);
    expect((await enablePush()).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps the plugin's permission words", () => {
    expect(toPushPermission({ receive: "granted" })).toBe("granted");
    expect(toPushPermission({ receive: "prompt-with-rationale" })).toBe("prompt");
    expect(toPushPermission({ receive: "denied" })).toBe("denied");
    expect(toPushPermission(null)).toBe("unavailable");
  });

  it("opens only our own path from a tap", () => {
    expect(pushPathFromTap({ actionId: "tap", notification: { data: { path: "/redeem-prizes" } } })).toBe("/redeem-prizes");
    expect(pushPathFromTap({ notification: { data: { path: "https://evil.example" } } })).toBeNull();
    expect(pushPathFromTap({})).toBeNull();
  });

  it("Turn on: asks the phone, registers, remembers the yes; Sign Out undoes all of it", async () => {
    const nativePromise = vi.fn(async (_plugin: string, method: string) => {
      if (method === "requestPermissions" || method === "checkPermissions") return { receive: "granted" };
      if (method === "getToken") return { token: TOKEN(9) };
      return {};
    });
    const store = stubApp(nativePromise);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { ok: true, preferences: { games: true, prizes: true, results: true } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await shouldAskForPush()).toBe(true);
    const result = await enablePush();
    expect(result).toEqual({ ok: true, preferences: { games: true, prizes: true, results: true } });
    expect(store["htc:push-opt-in"]).toBe("1");
    const registerBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(registerBody).toMatchObject({ action: "register", token: TOKEN(9), userId: "user-1" });
    expect(await shouldAskForPush()).toBe(false);

    // Same player, token and day: the refresh sends nothing.
    await syncPushRegistration();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await disablePushForSignOut();
    const unregister = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(unregister).toMatchObject({ action: "unregister", token: TOKEN(9) });
    expect(nativePromise).toHaveBeenCalledWith("FirebaseMessaging", "deleteToken", {});
    expect(store["htc:push-opt-in"]).toBeUndefined();
    expect(store["htc:push-registered"]).toBeUndefined();
  });

  it("a phone that says no stays unregistered", async () => {
    const nativePromise = vi.fn(async () => ({ receive: "denied" }));
    stubApp(nativePromise);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await enablePush()).toEqual({ ok: false, reason: "denied" });
    expect(await shouldAskForPush()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// Phone push notifications in the app (docs/native-app-store-plan.md Phase 5.1) — the ONLY code that
// talks to the shell's `FirebaseMessaging` plugin (@capacitor-firebase/messaging) and to
// POST /api/push/devices.
//
// The website never runs any of this: every entry point checks `hasNativeCapability("FirebaseMessaging")`
// first and returns at once (no request, no storage read) in a browser or an app build from before push.
//
// Two separate yeses are needed before a phone is registered:
//   1. the player taps "Turn on" (the card on Venue Home after their first points, or the account menu) —
//      stored on the phone as OPT_IN_KEY. Android 12 and older grant the OS permission silently, so this
//      is what keeps push from starting without the player asking for it;
//   2. the phone's own permission prompt (iPhone, Android 13+).
// After that, the app refreshes the registration at most once a day per player and token
// (`syncPushRegistration`), so `last_seen_at` stays current at ~1 request per player per day.
//
// Sign Out (`performSignOut`) calls `disablePushForSignOut` BEFORE the session cookie is cleared: the
// server removes the phone, the plugin deletes its token, and the opt-in is forgotten, so the next player
// on this phone is asked again.

import { addNativeListener, callNative, hasNativeCapability } from "@/lib/nativeApp";
import { safePushPath, type PushCategory, type PushPreferences } from "@/lib/pushCategories";
import { getUserId } from "@/lib/storage";

const PLUGIN = "FirebaseMessaging";
const DEVICES_ENDPOINT = "/api/push/devices";
const OPT_IN_KEY = "htc:push-opt-in";
const REGISTERED_KEY = "htc:push-registered";
const ASK_DISMISSED_KEY = "htc:push-ask-dismissed-at";
/** "Not now" keeps the card away this long. */
export const PUSH_ASK_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
/** A native call that hangs (an iPhone build with no APNs setup) must never hang a screen or Sign Out. */
const NATIVE_CALL_TIMEOUT_MS = 8000;

export type PushPermission = "granted" | "denied" | "prompt" | "unavailable";

export type EnablePushResult =
  | { ok: true; preferences: PushPreferences }
  | { ok: false; reason: "unavailable" | "signed-out" | "denied" | "failed" };

let cachedPreferences: { token: string; preferences: PushPreferences } | null = null;

const readKey = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeKey = (key: string, value: string | null): void => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private storage off: the app just asks again next time.
  }
};

const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Native push timed out.")), NATIVE_CALL_TIMEOUT_MS)),
  ]);

/** True only inside an app build that contains the push plugin. */
export const isPushAvailable = (): boolean => hasNativeCapability(PLUGIN);

/** Has the player on this phone turned push on? */
export const isPushOptedIn = (): boolean => isPushAvailable() && readKey(OPT_IN_KEY) === "1";

/** Pure: the plugin's permission answer in our three words. Exported for tests. */
export const toPushPermission = (result: unknown): PushPermission => {
  const receive = (result as { receive?: unknown } | null)?.receive;
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  if (receive === "prompt" || receive === "prompt-with-rationale") return "prompt";
  return "unavailable";
};

export const readPushPermission = async (): Promise<PushPermission> => {
  if (!isPushAvailable()) return "unavailable";
  try {
    return toPushPermission(await withTimeout(callNative(PLUGIN, "checkPermissions")));
  } catch {
    return "unavailable";
  }
};

const readToken = async (): Promise<string | null> => {
  try {
    const result = (await withTimeout(callNative(PLUGIN, "getToken"))) as { token?: unknown } | null;
    return typeof result?.token === "string" && result.token.length >= 20 ? result.token : null;
  } catch {
    return null;
  }
};

const todayKey = (): string => new Date().toISOString().slice(0, 10);

const registeredToken = (): string | null => {
  const stored = readKey(REGISTERED_KEY);
  const token = stored?.split("|")[1];
  return token && token.length >= 20 ? token : null;
};

type DevicesReply = { ok?: boolean; preferences?: PushPreferences };

const postDevices = async (body: Record<string, unknown>, keepalive = false): Promise<DevicesReply | null> => {
  try {
    const response = await fetch(DEVICES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, userId: getUserId() ?? undefined }),
      keepalive,
    });
    const reply = (await response.json().catch(() => null)) as DevicesReply | null;
    return response.ok && reply?.ok ? reply : null;
  } catch {
    return null;
  }
};

const register = async (userId: string, token: string): Promise<PushPreferences | null> => {
  const reply = await postDevices({ action: "register", token });
  if (!reply?.preferences) return null;
  writeKey(REGISTERED_KEY, `${userId}|${token}|${todayKey()}`);
  cachedPreferences = { token, preferences: reply.preferences };
  return reply.preferences;
};

/**
 * The player said yes ("Turn on"). Asks the phone for permission (the system prompt appears only on an
 * iPhone or Android 13+, only the first time), then registers this phone.
 */
export const enablePush = async (): Promise<EnablePushResult> => {
  if (!isPushAvailable()) return { ok: false, reason: "unavailable" };
  const userId = getUserId();
  if (!userId) return { ok: false, reason: "signed-out" };
  let permission: PushPermission;
  try {
    permission = toPushPermission(await callNative(PLUGIN, "requestPermissions"));
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "failed" };
  const token = await readToken();
  if (!token) return { ok: false, reason: "failed" };
  const preferences = await register(userId, token);
  if (!preferences) return { ok: false, reason: "failed" };
  writeKey(OPT_IN_KEY, "1");
  writeKey(ASK_DISMISSED_KEY, null);
  return { ok: true, preferences };
};

/**
 * Keeps an opted-in phone's registration fresh: re-registers when the player, the token or the day
 * changed. Does nothing (no native call) on the website, before opt-in, or when signed out.
 */
export const syncPushRegistration = async (options: { force?: boolean } = {}): Promise<void> => {
  if (!isPushOptedIn()) return;
  const userId = getUserId();
  if (!userId) return;
  if ((await readPushPermission()) !== "granted") return;
  const token = await readToken();
  if (!token) return;
  if (!options.force && readKey(REGISTERED_KEY) === `${userId}|${token}|${todayKey()}`) return;
  await register(userId, token);
};

/** This phone's three switches, for the account menu. Null when push is off here or can't be read. */
export const loadPushPreferences = async (): Promise<PushPreferences | null> => {
  if (!isPushOptedIn()) return null;
  const userId = getUserId();
  if (!userId) return null;
  const token = await readToken();
  if (!token) return null;
  if (cachedPreferences?.token === token) return cachedPreferences.preferences;
  return register(userId, token);
};

/** Flips one switch. Returns all three as saved, or null when it couldn't be saved. */
export const setPushPreference = async (category: PushCategory, value: boolean): Promise<PushPreferences | null> => {
  if (!isPushOptedIn()) return null;
  const token = registeredToken() ?? (await readToken());
  if (!token) return null;
  const reply = await postDevices({ action: "preferences", token, preferences: { [category]: value } });
  if (!reply?.preferences) return null;
  cachedPreferences = { token, preferences: reply.preferences };
  return reply.preferences;
};

/** Should Venue Home show the "Get a heads-up?" card? (App with push, not on yet, not blocked, not snoozed.) */
export const shouldAskForPush = async (nowMs: number = Date.now()): Promise<boolean> => {
  if (!isPushAvailable() || isPushOptedIn()) return false;
  const dismissedAt = Number(readKey(ASK_DISMISSED_KEY) ?? "");
  if (Number.isFinite(dismissedAt) && dismissedAt > 0 && nowMs - dismissedAt < PUSH_ASK_SNOOZE_MS) return false;
  const permission = await readPushPermission();
  return permission === "prompt" || permission === "granted";
};

export const dismissPushAsk = (nowMs: number = Date.now()): void => {
  writeKey(ASK_DISMISSED_KEY, String(nowMs));
};

/**
 * Sign Out: remove this phone from the server (while the session cookie is still valid), delete the
 * plugin's token and forget the opt-in. Resolves at once on the website. The caller bounds the wait.
 */
export const disablePushForSignOut = async (): Promise<void> => {
  if (!isPushAvailable()) return;
  const token = registeredToken();
  writeKey(OPT_IN_KEY, null);
  writeKey(REGISTERED_KEY, null);
  cachedPreferences = null;
  if (!token) return;
  await Promise.allSettled([
    postDevices({ action: "unregister", token }, true),
    withTimeout(callNative(PLUGIN, "deleteToken")),
  ]);
};

/** Pure: the page a tapped push should open, from the plugin's event. Exported for tests. */
export const pushPathFromTap = (event: unknown): string | null => {
  const data = (event as { notification?: { data?: unknown } } | null)?.notification?.data;
  return safePushPath((data as { path?: unknown } | null)?.path);
};

/** Calls `open(path)` when the player taps one of our pushes (also the one that launched the app). */
export const onPushTapped = (open: (path: string) => void): (() => void) | null =>
  addNativeListener(PLUGIN, "notificationActionPerformed", (event) => {
    const path = pushPathFromTap(event);
    if (path) open(path);
  });

/** Calls `refresh()` when Firebase rotates this phone's token. */
export const onPushTokenChanged = (refresh: () => void): (() => void) | null =>
  addNativeListener(PLUGIN, "tokenReceived", () => refresh());

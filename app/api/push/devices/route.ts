import { NextResponse } from "next/server";
import { parseNativeUserAgent } from "@/lib/nativeApp";
import {
  isValidPushToken,
  registerPushDevice,
  unregisterPushDevice,
  updatePushPreferences,
} from "@/lib/push/devices";
import { PUSH_CATEGORIES, type PushPreferences } from "@/lib/pushCategories";
import { isSessionEnforced, resolveRequestUserId } from "@/lib/serverSession";

// POST /api/push/devices — the app's phone registry (docs/native-app-store-plan.md Phase 5.1).
// Body: { action: "register" | "preferences" | "unregister", token, userId?, preferences? }.
//   register    — this phone, for the signed-in player; returns its switches. App only: the platform
//                 and version come from the app's User-Agent, never the body.
//   preferences — changes some of { games, prizes, results } on this phone; returns them all.
//   unregister  — removes this phone (Sign Out, before the session cookie is cleared).
//
// The player is the SIGNED tp_sess session's (resolveRequestUserId; a different body userId is 403),
// and every write is scoped to that player's own phones (lib/push/devices.ts). Refuses outright (503)
// without SESSION_SECRET: the local dev server shares the production database, so an unverified claim
// must never write a real player's phone.

type DevicesBody = {
  action?: unknown;
  token?: unknown;
  userId?: unknown;
  preferences?: unknown;
};

const NO_STORE = { "Cache-Control": "no-store" };

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

const parsePreferenceChanges = (value: unknown): Partial<PushPreferences> | null => {
  if (!value || typeof value !== "object") return null;
  const changes: Partial<PushPreferences> = {};
  for (const category of PUSH_CATEGORIES) {
    const next = (value as Record<string, unknown>)[category];
    if (typeof next === "boolean") changes[category] = next;
  }
  return Object.keys(changes).length > 0 ? changes : null;
};

export async function POST(request: Request) {
  if (!isSessionEnforced()) {
    console.error("[Push] session-not-enforced");
    return json({ ok: false, error: "Notifications are unavailable right now." }, 503);
  }

  const body = (await request.json().catch(() => ({}))) as DevicesBody;
  const claimed = typeof body.userId === "string" ? body.userId : null;
  const { userId, forbidden } = resolveRequestUserId(request, claimed);
  if (forbidden) return json({ ok: false, error: "Forbidden." }, 403);
  if (!userId) return json({ ok: false, error: "Please sign in again." }, 401);

  if (!isValidPushToken(body.token)) return json({ ok: false, error: "Invalid device." }, 400);
  const token = body.token;

  if (body.action === "register") {
    const app = parseNativeUserAgent(request.headers.get("user-agent"));
    if (!app) return json({ ok: false, error: "Notifications need the Hightop Challenge app." }, 400);
    const result = await registerPushDevice({ userId, token, platform: app.platform, appVersion: app.version });
    if (!result.ok) {
      console.error("[Push] register-failed", { error: result.error });
      return json({ ok: false, error: "Couldn't turn on notifications." }, result.error === "user_not_found" ? 401 : 500);
    }
    return json({ ok: true, preferences: result.preferences });
  }

  if (body.action === "preferences") {
    const changes = parsePreferenceChanges(body.preferences);
    const result = await updatePushPreferences({ userId, token, changes: changes ?? {} });
    if (!result.ok) {
      if (result.error === "not_found") return json({ ok: false, error: "This phone isn't registered." }, 404);
      console.error("[Push] preferences-failed", { error: result.error });
      return json({ ok: false, error: "Couldn't save that." }, result.error === "user_not_found" ? 401 : 500);
    }
    return json({ ok: true, preferences: result.preferences });
  }

  if (body.action === "unregister") {
    const result = await unregisterPushDevice({ userId, token });
    return json({ ok: result.ok }, result.ok ? 200 : 500);
  }

  return json({ ok: false, error: "Unknown action." }, 400);
}

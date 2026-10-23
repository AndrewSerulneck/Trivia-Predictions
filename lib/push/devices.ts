import "server-only";
import { chunkIds } from "@/lib/postgrestIds";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEFAULT_PUSH_PREFERENCES, type PushCategory, type PushPreferences } from "@/lib/pushCategories";

// The phone registry (docs/native-app-store-plan.md Phase 5.1): the ONLY writer of push_devices.
// Called from POST /api/push/devices with the signed session's user id — never a client-supplied one.
//
// A phone row is owned by a player's ACCOUNT (any of their venue profiles), or by the one venue profile
// when it has no account (legacy). Every read and write here is scoped to that owner, so a player can
// only change or remove their own phone, whatever token they send.

export type PushPlatform = "ios" | "android";

type DeviceRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  notify_games: boolean;
  notify_prizes: boolean;
  notify_results: boolean;
};

type Owner = { userId: string; accountId: string | null; venueId: string | null };

export type PushDeviceResult =
  | { ok: true; preferences: PushPreferences }
  | { ok: false; error: "unavailable" | "user_not_found" | "not_found" | "write_failed" };

const PREFERENCE_COLUMN: Record<PushCategory, "notify_games" | "notify_prizes" | "notify_results"> = {
  games: "notify_games",
  prizes: "notify_prizes",
  results: "notify_results",
};

const defaultPreferenceColumns = (): Record<(typeof PREFERENCE_COLUMN)[PushCategory], boolean> => ({
  notify_games: DEFAULT_PUSH_PREFERENCES.games,
  notify_prizes: DEFAULT_PUSH_PREFERENCES.prizes,
  notify_results: DEFAULT_PUSH_PREFERENCES.results,
});

const DEVICE_COLUMNS = "id, user_id, account_id, notify_games, notify_prizes, notify_results";

const preferencesOf = (row: DeviceRow): PushPreferences => ({
  games: row.notify_games,
  prizes: row.notify_prizes,
  results: row.notify_results,
});

/** A FCM registration token as the app sends it: printable, no spaces, 20–4096 characters. */
export const isValidPushToken = (value: unknown): value is string =>
  typeof value === "string" && value.length >= 20 && value.length <= 4096 && /^[\x21-\x7e]+$/.test(value);

export const isPushPlatform = (value: unknown): value is PushPlatform => value === "ios" || value === "android";

/** The shell's version as the UA carries it ("1.0.0"), or null. */
export const normalizeAppVersion = (value: unknown): string | null =>
  typeof value === "string" && /^\d{1,4}(?:\.\d{1,4}){0,2}$/.test(value) ? value : null;

const loadOwner = async (userId: string): Promise<Owner | null> => {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, account_id, venue_id")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; account_id: string | null; venue_id: string | null };
  return { userId: row.id, accountId: row.account_id ?? null, venueId: row.venue_id ?? null };
};

/** PostgREST filter for "rows this player owns". Ids come from our own users row, never the request. */
const ownerFilter = (owner: Owner): string =>
  owner.accountId ? `user_id.eq.${owner.userId},account_id.eq.${owner.accountId}` : `user_id.eq.${owner.userId}`;

const sameOwner = (row: DeviceRow, owner: Owner): boolean =>
  owner.accountId ? row.account_id === owner.accountId : row.account_id === null && row.user_id === owner.userId;

/**
 * Registers (or refreshes) this phone for the signed-in player. Same token again = the same row, with
 * its last-seen time, venue and version updated. A token that last belonged to another player (a shared
 * phone whose sign-out never reached us) starts again from the default preferences.
 */
export const registerPushDevice = async (input: {
  userId: string;
  token: string;
  platform: PushPlatform;
  appVersion: string | null;
}): Promise<PushDeviceResult> => {
  const admin = supabaseAdmin;
  if (!admin) return { ok: false, error: "unavailable" };
  const owner = await loadOwner(input.userId);
  if (!owner) return { ok: false, error: "user_not_found" };

  const nowIso = new Date().toISOString();
  const base = {
    user_id: owner.userId,
    account_id: owner.accountId,
    venue_id: owner.venueId,
    platform: input.platform,
    app_version: input.appVersion,
    last_seen_at: nowIso,
    disabled_at: null,
    disabled_reason: null,
  };

  const updateExisting = async (): Promise<PushDeviceResult | null> => {
    const { data: existing, error: readError } = await admin
      .from("push_devices")
      .select(DEVICE_COLUMNS)
      .eq("token", input.token)
      .maybeSingle();
    if (readError) return { ok: false, error: "write_failed" };
    if (!existing) return null;
    const row = existing as DeviceRow;
    const reset = sameOwner(row, owner) ? {} : defaultPreferenceColumns();
    const { data, error } = await admin
      .from("push_devices")
      .update({ ...base, ...reset })
      .eq("id", row.id)
      .select(DEVICE_COLUMNS)
      .maybeSingle();
    if (error || !data) return { ok: false, error: "write_failed" };
    return { ok: true, preferences: preferencesOf(data as DeviceRow) };
  };

  const updated = await updateExisting();
  if (updated) return updated;

  const { data, error } = await admin
    .from("push_devices")
    .insert({ ...base, token: input.token, created_at: nowIso })
    .select(DEVICE_COLUMNS)
    .maybeSingle();
  if (!error && data) return { ok: true, preferences: preferencesOf(data as DeviceRow) };
  // Two registrations raced and the other inserted first: take the update path once.
  if (error?.code === "23505") return (await updateExisting()) ?? { ok: false, error: "write_failed" };
  return { ok: false, error: "write_failed" };
};

/** Changes some of this phone's switches. Only the player's own phone; anything else is not_found. */
export const updatePushPreferences = async (input: {
  userId: string;
  token: string;
  changes: Partial<PushPreferences>;
}): Promise<PushDeviceResult> => {
  const admin = supabaseAdmin;
  if (!admin) return { ok: false, error: "unavailable" };
  const owner = await loadOwner(input.userId);
  if (!owner) return { ok: false, error: "user_not_found" };

  const patch: Partial<Record<(typeof PREFERENCE_COLUMN)[PushCategory], boolean>> = {};
  for (const [category, column] of Object.entries(PREFERENCE_COLUMN) as Array<[PushCategory, (typeof PREFERENCE_COLUMN)[PushCategory]]>) {
    const value = input.changes[category];
    if (typeof value === "boolean") patch[column] = value;
  }

  // No change asked for = just read the switches back.
  const { data, error } =
    Object.keys(patch).length > 0
      ? await admin
          .from("push_devices")
          .update(patch)
          .eq("token", input.token)
          .or(ownerFilter(owner))
          .select(DEVICE_COLUMNS)
          .maybeSingle()
      : await admin
          .from("push_devices")
          .select(DEVICE_COLUMNS)
          .eq("token", input.token)
          .or(ownerFilter(owner))
          .maybeSingle();
  if (error) return { ok: false, error: "write_failed" };
  if (!data) return { ok: false, error: "not_found" };
  return { ok: true, preferences: preferencesOf(data as DeviceRow) };
};

/** Removes this phone (sign-out). Only the player's own phone; an unknown token is already gone. */
export const unregisterPushDevice = async (input: { userId: string; token: string }): Promise<{ ok: boolean }> => {
  const admin = supabaseAdmin;
  if (!admin) return { ok: false };
  const owner = await loadOwner(input.userId);
  if (!owner) return { ok: true };
  const { error } = await admin.from("push_devices").delete().eq("token", input.token).or(ownerFilter(owner));
  return { ok: !error };
};

/** Stops sending to phones Firebase said are gone. One write per 150 phones (chunkIds). */
export const disablePushDevices = async (deviceIds: readonly string[], reason: string): Promise<void> => {
  const admin = supabaseAdmin;
  if (!admin || deviceIds.length === 0) return;
  const disabledAt = new Date().toISOString();
  for (const chunk of chunkIds(Array.from(new Set(deviceIds)))) {
    const { error } = await admin
      .from("push_devices")
      .update({ disabled_at: disabledAt, disabled_reason: reason.slice(0, 64) })
      .in("id", chunk);
    if (error) console.error("[Push] disable-failed", { count: chunk.length });
  }
};

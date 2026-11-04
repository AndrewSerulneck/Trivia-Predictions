import "server-only";
import { decryptSocialToken, encryptSocialToken, socialTokenContext } from "@/lib/social/crypto";
import { metaAppSecret } from "@/lib/social/metaConfig";
import { fetchInstagramAccounts, revokeMetaApp, type MetaInstagramAccount } from "@/lib/social/metaGraph";
import { SOCIAL_MEDIA_BUCKET, SOCIAL_PENDING_CHOICE_TTL_MS } from "@/lib/social/socialPublishRules";
import type { InstagramAccountChoice, InstagramConnectionView } from "@/lib/social/socialTypes";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// social_connections (docs/partner-social-promo-plan.md Phase 5). The ONLY code that reads or writes
// access_token_enc. A token is decrypted only inside this module and handed straight to a Graph call
// (lib/social/metaGraph.ts); no route ever returns one, and nothing here logs one.

const TABLE = "social_connections";
const PROVIDER = "instagram";
/** Posts that still need a connection (anything not published, failed or cancelled). */
const OPEN_POST_STATUSES = ["scheduled", "uploading", "publishing", "processing"];

/** Every column except the token: what the routes may read. */
const PUBLIC_COLUMNS = "id, venue_id, provider, status, meta_user_id, page_id, external_account_id, display_name, account_choices, connected_at";

type ConnectionRow = {
  id: string;
  venue_id: string;
  provider: string;
  status: "active" | "choose_account" | "reconnect_needed";
  meta_user_id: string;
  page_id: string | null;
  external_account_id: string | null;
  display_name: string | null;
  account_choices: unknown;
  connected_at: string;
};

export type InstagramConnection = {
  id: string;
  venueId: string;
  status: ConnectionRow["status"];
  metaUserId: string;
  instagramId: string | null;
  username: string | null;
  choices: InstagramAccountChoice[];
  connectedAt: string;
};

const db = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  return supabaseAdmin;
};

const parseChoices = (value: unknown): InstagramAccountChoice[] =>
  Array.isArray(value)
    ? value
        .map((entry) => entry as Partial<InstagramAccountChoice>)
        .filter((entry): entry is InstagramAccountChoice => typeof entry.instagramId === "string" && entry.instagramId.length > 0)
        .map((entry) => ({ instagramId: entry.instagramId, username: entry.username ?? null, pageName: entry.pageName ?? null }))
    : [];

const toConnection = (row: ConnectionRow): InstagramConnection => ({
  id: row.id,
  venueId: row.venue_id,
  status: row.status,
  metaUserId: row.meta_user_id,
  instagramId: row.external_account_id,
  username: row.display_name,
  choices: parseChoices(row.account_choices),
  connectedAt: row.connected_at,
});

/** "@name" without the @, or null. */
const cleanUsername = (value: string | null): string | null => (value ? value.replace(/^@+/, "") || null : null);

/**
 * The venue's Instagram connection, or null. A pending choice older than an hour is deleted here
 * (it holds a user token the partner never finished using) and reads as "not connected".
 */
export const loadInstagramConnection = async (venueId: string, nowMs: number = Date.now()): Promise<InstagramConnection | null> => {
  const { data, error } = await db().from(TABLE).select(PUBLIC_COLUMNS).eq("venue_id", venueId).eq("provider", PROVIDER).maybeSingle();
  if (error) throw new Error(`Failed to load the Instagram connection: ${error.message}`);
  if (!data) return null;
  const connection = toConnection(data as ConnectionRow);
  if (connection.status === "choose_account" && Date.parse(connection.connectedAt) + SOCIAL_PENDING_CHOICE_TTL_MS < nowMs) {
    await db().from(TABLE).delete().eq("id", connection.id).eq("status", "choose_account");
    return null;
  }
  return connection;
};

export const connectionView = (connection: InstagramConnection | null): InstagramConnectionView => {
  if (!connection) return { state: "not_connected" };
  if (connection.status === "choose_account") return { state: "choose_account", choices: connection.choices };
  if (connection.status === "reconnect_needed") return { state: "reconnect_needed", username: connection.username };
  return { state: "connected", username: connection.username };
};

/** The active connection's Page token, decrypted for one Graph call. Throws (fails closed) on any mismatch. */
export const instagramPageToken = async (connection: InstagramConnection): Promise<string> => {
  if (connection.status !== "active") throw new Error("The Instagram connection is not active.");
  const { data, error } = await db().from(TABLE).select("access_token_enc").eq("id", connection.id).eq("status", "active").maybeSingle();
  if (error || !data) throw new Error("The Instagram connection could not be read.");
  return decryptSocialToken(String((data as { access_token_enc: string }).access_token_enc), socialTokenContext(connection.venueId, PROVIDER, "page_token"));
};

type SaveBase = { venueId: string; ownerId: string; metaUserId: string; scopes: string[] };

/** Connect (or reconnect) the venue to one Instagram account. Replaces whatever row was there. */
export const saveInstagramConnection = async (input: SaveBase & { account: MetaInstagramAccount }): Promise<void> => {
  const now = new Date().toISOString();
  const { error } = await db()
    .from(TABLE)
    .upsert(
      {
        venue_id: input.venueId,
        provider: PROVIDER,
        status: "active",
        meta_user_id: input.metaUserId,
        page_id: input.account.pageId,
        external_account_id: input.account.instagramId,
        display_name: cleanUsername(input.account.username),
        access_token_enc: encryptSocialToken(input.account.pageToken, socialTokenContext(input.venueId, PROVIDER, "page_token")),
        token_expires_at: null,
        account_choices: [],
        scopes: input.scopes,
        last_error: null,
        connected_by_owner_id: input.ownerId,
        connected_at: now,
        updated_at: now,
      },
      { onConflict: "venue_id,provider" },
    );
  if (error) throw new Error(`Failed to save the Instagram connection: ${error.message}`);
};

/** Several Instagram accounts granted: keep the user token (encrypted) and the names until the partner picks. */
export const savePendingInstagramChoice = async (
  input: SaveBase & { userToken: string; expiresInS: number | null; accounts: MetaInstagramAccount[] },
): Promise<void> => {
  const now = new Date();
  const choices: InstagramAccountChoice[] = input.accounts.map((account) => ({
    instagramId: account.instagramId,
    username: cleanUsername(account.username),
    pageName: account.pageName,
  }));
  const { error } = await db()
    .from(TABLE)
    .upsert(
      {
        venue_id: input.venueId,
        provider: PROVIDER,
        status: "choose_account",
        meta_user_id: input.metaUserId,
        page_id: null,
        external_account_id: null,
        display_name: null,
        access_token_enc: encryptSocialToken(input.userToken, socialTokenContext(input.venueId, PROVIDER, "user_token")),
        token_expires_at: input.expiresInS ? new Date(now.getTime() + input.expiresInS * 1000).toISOString() : null,
        account_choices: choices,
        scopes: input.scopes,
        last_error: null,
        connected_by_owner_id: input.ownerId,
        connected_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "venue_id,provider" },
    );
  if (error) throw new Error(`Failed to save the Instagram account choice: ${error.message}`);
};

export type ChooseResult = "connected" | "not_found" | "expired" | "reconnect" | "error";

/** The partner picked one of the pending accounts: fetch that Page's token (one Graph call) and connect it. */
export const chooseInstagramAccount = async (input: { venueId: string; ownerId: string; instagramId: string }): Promise<ChooseResult> => {
  const connection = await loadInstagramConnection(input.venueId);
  if (!connection || connection.status !== "choose_account") return "expired";
  if (!connection.choices.some((choice) => choice.instagramId === input.instagramId)) return "not_found";
  const secret = metaAppSecret();
  if (!secret) return "error";

  const { data, error } = await db().from(TABLE).select("access_token_enc, scopes").eq("id", connection.id).eq("status", "choose_account").maybeSingle();
  if (error || !data) return "expired";
  const row = data as { access_token_enc: string; scopes: string[] | null };
  const userToken = decryptSocialToken(row.access_token_enc, socialTokenContext(input.venueId, PROVIDER, "user_token"));

  const accounts = await fetchInstagramAccounts(userToken, secret);
  if (!accounts.ok) {
    console.warn("[SocialInstagram] choose-accounts-failed", { kind: accounts.error.kind, code: accounts.error.code });
    return accounts.error.kind === "token" || accounts.error.kind === "permission" ? "reconnect" : "error";
  }
  const account = accounts.data.find((entry) => entry.instagramId === input.instagramId);
  if (!account) return "not_found";
  await saveInstagramConnection({
    venueId: input.venueId,
    ownerId: input.ownerId,
    metaUserId: connection.metaUserId,
    scopes: row.scopes ?? [],
    account,
  });
  return "connected";
};

/** Meta refused the token: the sheet shows "Reconnect Instagram". The token is kept until they do. */
export const markInstagramReconnectNeeded = async (connectionId: string, reason: string): Promise<void> => {
  await db()
    .from(TABLE)
    .update({ status: "reconnect_needed", last_error: reason.slice(0, 200), updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("status", "active");
};

/**
 * Stop everything that still needs these connections: posts not yet final are cancelled, their
 * files deleted and their captions cleared (privacy policy: kept only until published or cancelled).
 */
const cancelOpenPosts = async (connectionIds: string[]): Promise<void> => {
  if (connectionIds.length === 0) return;
  const { error } = await db()
    .from("social_posts")
    .update({ status: "cancelled", caption: "", media_path: null, error: null, updated_at: new Date().toISOString() })
    .in("connection_id", connectionIds)
    .in("status", OPEN_POST_STATUSES);
  if (error) throw new Error(`Failed to cancel posts: ${error.message}`);
};

/** Delete the stored files of these posts (best effort; a leftover file is swept later). */
export const deleteSocialMedia = async (paths: string[]): Promise<void> => {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return;
  const { error } = await db().storage.from(SOCIAL_MEDIA_BUCKET).remove(clean);
  if (error) console.warn("[SocialInstagram] media-delete-failed", { count: clean.length });
};

/** Remove the app for a Facebook user if no venue still uses that login. Best effort. */
const revokeIfUnused = async (metaUserId: string): Promise<void> => {
  const secret = metaAppSecret();
  if (!secret) return;
  const { count, error } = await db().from(TABLE).select("id", { count: "exact", head: true }).eq("meta_user_id", metaUserId);
  if (error || (count ?? 0) > 0) return;
  const revoked = await revokeMetaApp(metaUserId, secret);
  if (!revoked.ok) console.warn("[SocialInstagram] revoke-failed", { kind: revoked.error.kind, code: revoked.error.code });
};

const removeConnections = async (rows: { id: string }[]): Promise<number> => {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return 0;
  const { data: open } = await db().from("social_posts").select("media_path").in("connection_id", ids).in("status", OPEN_POST_STATUSES);
  const paths = (open ?? []).map((row) => String((row as { media_path: string | null }).media_path ?? "")).filter(Boolean);
  await cancelOpenPosts(ids);
  await deleteSocialMedia(paths);
  const { error } = await db().from(TABLE).delete().in("id", ids);
  if (error) throw new Error(`Failed to delete connections: ${error.message}`);
  return ids.length;
};

/** "Disconnect" in the sheet: delete the token and row, cancel open posts, and remove the app if unused. */
export const disconnectInstagram = async (venueId: string): Promise<boolean> => {
  const { data, error } = await db().from(TABLE).select("id, meta_user_id").eq("venue_id", venueId).eq("provider", PROVIDER);
  if (error) throw new Error(`Failed to load the Instagram connection: ${error.message}`);
  const rows = (data ?? []) as { id: string; meta_user_id: string }[];
  const removed = await removeConnections(rows);
  for (const metaUserId of new Set(rows.map((row) => row.meta_user_id))) await revokeIfUnused(metaUserId);
  return removed > 0;
};

/**
 * Meta's deauthorize / data-deletion callbacks (lib/social/metaCallbacks.ts): the partner removed the
 * app or asked Facebook to delete their data. Every connection made with that Facebook login goes, on
 * every venue and provider. No revoke call: Meta already removed the app.
 */
export const removeMetaUserSocialConnections = async (metaUserId: string): Promise<number> => {
  const { data, error } = await db().from(TABLE).select("id").eq("meta_user_id", metaUserId);
  if (error) throw new Error(`Failed to load connections: ${error.message}`);
  return removeConnections((data ?? []) as { id: string }[]);
};

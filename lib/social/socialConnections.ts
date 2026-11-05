import "server-only";
import { decryptSocialToken, encryptSocialToken, socialTokenContext } from "@/lib/social/crypto";
import { metaAppSecret } from "@/lib/social/metaConfig";
import {
  fetchInstagramAccounts,
  fetchMetaPages,
  publishablePagesOf,
  revokeMetaApp,
  type GraphResult,
  type MetaInstagramAccount,
  type MetaPage,
} from "@/lib/social/metaGraph";
import {
  META_ID,
  SOCIAL_MEDIA_BUCKET,
  SOCIAL_PENDING_CHOICE_TTL_MS,
  socialPostMayBeLive,
  type SocialGoneConnection,
  type SocialPostMarks,
} from "@/lib/social/socialPublishRules";
import type {
  FacebookConnectionView,
  FacebookPageChoice,
  InstagramAccountChoice,
  InstagramConnectionView,
  SocialProvider,
} from "@/lib/social/socialTypes";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// social_connections (docs/partner-social-promo-plan.md Phases 5–6): one 'instagram' and one 'facebook'
// row per venue, both made by the same Facebook login. The ONLY code that reads or writes
// access_token_enc. A token is decrypted only inside this module and handed straight to a Graph call
// (lib/social/metaGraph.ts); no route ever returns one, and nothing here logs one.
//
// Phase 11 (plan §5.5): one store for both providers. The two rows have the same shape —
// external_account_id = the Instagram account id or the Page id, display_name = the @username (no @) or
// the Page's name, the token = that Page's token (it does not expire). What differs per provider lives in
// PROVIDERS. The token AAD slots are `social:<provider>:<venue>:page_token` / `user_token`
// (socialTokenContext); changing them would make every stored token unreadable.

const TABLE = "social_connections";
const LOG = "[SocialConnections]";
/** Posts that still need a connection (anything not published, failed or cancelled). */
const OPEN_POST_STATUSES = ["scheduled", "uploading", "publishing", "processing"];
/** The open statuses no request holds. Only these are ever cancelled (Phase 19). */
const UNCLAIMED_OPEN_STATUSES = ["scheduled", "uploading", "processing"];

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

type SocialChoices = { instagram: InstagramAccountChoice; facebook: FacebookPageChoice };
/** One account the partner may pick when the login granted several. */
export type SocialChoice<P extends SocialProvider = SocialProvider> = SocialChoices[P];

export type SocialConnection<P extends SocialProvider = SocialProvider> = {
  id: string;
  venueId: string;
  provider: P;
  status: ConnectionRow["status"];
  metaUserId: string;
  /** What posts go to: the Instagram account id, or the Page id. Null while a choice is pending. */
  accountId: string | null;
  /** The @username without the @, or the Page's name. */
  displayName: string | null;
  choices: SocialChoice<P>[];
  connectedAt: string;
};

/** The one account a connection posts to: the Instagram account (via its Page) or the Page itself. */
export type ConnectedAccount = { pageId: string; accountId: string; displayName: string | null; pageToken: string };

type ProviderSpec<P extends SocialProvider> = {
  /** As the partner reads it, in error messages. */
  label: string;
  /** One stored choice back from account_choices, or null; its id is checked against META_ID after. */
  parseChoice: (entry: Record<string, unknown>) => SocialChoice<P> | null;
  /** The accounts this user token could connect to, as connect saves them (one Graph call). */
  fetchChoices: (userToken: string, secret: string) => Promise<GraphResult<ConnectedAccount[]>>;
};

const db = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  return supabaseAdmin;
};

/** "@name" without the @, or null. */
const cleanUsername = (value: string | null): string | null => (value ? value.replace(/^@+/, "") || null : null);

export const instagramConnectedAccount = (account: MetaInstagramAccount): ConnectedAccount => ({
  pageId: account.pageId,
  accountId: account.instagramId,
  displayName: cleanUsername(account.username),
  pageToken: account.pageToken,
});

export const facebookConnectedAccount = (page: MetaPage): ConnectedAccount => ({
  pageId: page.pageId,
  accountId: page.pageId,
  displayName: page.pageName,
  pageToken: page.pageToken,
});

export const instagramChoicesOf = (accounts: MetaInstagramAccount[]): InstagramAccountChoice[] =>
  accounts.map((account) => ({ instagramId: account.instagramId, username: cleanUsername(account.username), pageName: account.pageName }));

export const facebookChoicesOf = (pages: MetaPage[]): FacebookPageChoice[] => pages.map((page) => ({ pageId: page.pageId, pageName: page.pageName }));

const nullableText = (value: unknown): string | null => (typeof value === "string" ? value : null);

const PROVIDERS: { [P in SocialProvider]: ProviderSpec<P> } = {
  instagram: {
    label: "Instagram",
    parseChoice: (entry) =>
      typeof entry.instagramId === "string"
        ? { instagramId: entry.instagramId, username: nullableText(entry.username), pageName: nullableText(entry.pageName) }
        : null,
    fetchChoices: async (userToken, secret) => {
      const accounts = await fetchInstagramAccounts(userToken, secret);
      return accounts.ok ? { ok: true, data: accounts.data.map(instagramConnectedAccount) } : accounts;
    },
  },
  facebook: {
    label: "Facebook",
    parseChoice: (entry) => (typeof entry.pageId === "string" ? { pageId: entry.pageId, pageName: nullableText(entry.pageName) } : null),
    fetchChoices: async (userToken, secret) => {
      const pages = await fetchMetaPages(userToken, secret);
      return pages.ok ? { ok: true, data: publishablePagesOf(pages.data).map(facebookConnectedAccount) } : pages;
    },
  },
};

/** The id the partner picks a choice by: Meta's Instagram account id, or the Page id. */
const choiceId = (choice: SocialChoice): string => ("instagramId" in choice ? choice.instagramId : choice.pageId);

const parseChoices = <P extends SocialProvider>(provider: P, value: unknown): SocialChoice<P>[] => {
  if (!Array.isArray(value)) return [];
  const parse: ProviderSpec<P>["parseChoice"] = PROVIDERS[provider].parseChoice;
  return value
    .map((entry) => (entry && typeof entry === "object" ? parse(entry as Record<string, unknown>) : null))
    .filter((choice): choice is SocialChoice<P> => choice !== null && META_ID.test(choiceId(choice)));
};

/**
 * The venue's connection for one provider, or null. A pending choice older than an hour is deleted here
 * (it holds a user token the partner never finished using) and reads as "not connected".
 */
export const loadConnection = async <P extends SocialProvider>(venueId: string, provider: P, nowMs: number = Date.now()): Promise<SocialConnection<P> | null> => {
  const { data, error } = await db().from(TABLE).select(PUBLIC_COLUMNS).eq("venue_id", venueId).eq("provider", provider).maybeSingle();
  if (error) throw new Error(`Failed to load the ${PROVIDERS[provider].label} connection: ${error.message}`);
  if (!data) return null;
  const row = data as ConnectionRow;
  const connection: SocialConnection<P> = {
    id: row.id,
    venueId: row.venue_id,
    provider,
    status: row.status,
    metaUserId: row.meta_user_id,
    accountId: row.external_account_id,
    displayName: row.display_name,
    choices: parseChoices(provider, row.account_choices),
    connectedAt: row.connected_at,
  };
  if (connection.status === "choose_account" && Date.parse(connection.connectedAt) + SOCIAL_PENDING_CHOICE_TTL_MS < nowMs) {
    await db().from(TABLE).delete().eq("id", connection.id).eq("status", "choose_account");
    return null;
  }
  return connection;
};

export const connectionView = (connection: SocialConnection<"instagram"> | null): InstagramConnectionView => {
  if (!connection) return { state: "not_connected" };
  if (connection.status === "choose_account") return { state: "choose_account", choices: connection.choices };
  if (connection.status === "reconnect_needed") return { state: "reconnect_needed", username: connection.displayName };
  return { state: "connected", username: connection.displayName };
};

export const facebookConnectionView = (connection: SocialConnection<"facebook"> | null): FacebookConnectionView => {
  if (!connection) return { state: "not_connected" };
  if (connection.status === "choose_account") return { state: "choose_page", choices: connection.choices };
  if (connection.status === "reconnect_needed") return { state: "reconnect_needed", pageName: connection.displayName };
  return { state: "connected", pageName: connection.displayName };
};

/** The active connection's Page token, decrypted for one Graph call. Throws (fails closed) on any mismatch. */
export const connectionToken = async (connection: SocialConnection): Promise<string> => {
  const { label } = PROVIDERS[connection.provider];
  if (connection.status !== "active") throw new Error(`The ${label} connection is not active.`);
  const { data, error } = await db().from(TABLE).select("access_token_enc").eq("id", connection.id).eq("status", "active").maybeSingle();
  if (error || !data) throw new Error(`The ${label} connection could not be read.`);
  return decryptSocialToken(String((data as { access_token_enc: string }).access_token_enc), socialTokenContext(connection.venueId, connection.provider, "page_token"));
};

export type SaveBase = { venueId: string; ownerId: string; metaUserId: string; scopes: string[] };

/**
 * One social_connections row exactly as connect / choose save it. Every row built here has the same
 * keys, so several can go to PostgREST in one upsert (plan §5.4, Phase 10).
 */
export type SocialConnectionRow = {
  venue_id: string;
  provider: SocialProvider;
  status: "active" | "choose_account";
  meta_user_id: string;
  page_id: string | null;
  external_account_id: string | null;
  display_name: string | null;
  access_token_enc: string;
  token_expires_at: string | null;
  account_choices: SocialChoice[];
  scopes: string[];
  last_error: null;
  connected_by_owner_id: string;
  connected_at: string;
  updated_at: string;
};

/** Connect (or reconnect) one provider to one account. Pure apart from encryption, which throws before anything is written. */
export const connectionRow = (provider: SocialProvider, base: SaveBase, account: ConnectedAccount, now: Date = new Date()): SocialConnectionRow => ({
  venue_id: base.venueId,
  provider,
  status: "active",
  meta_user_id: base.metaUserId,
  page_id: account.pageId,
  external_account_id: account.accountId,
  display_name: account.displayName,
  access_token_enc: encryptSocialToken(account.pageToken, socialTokenContext(base.venueId, provider, "page_token")),
  token_expires_at: null,
  account_choices: [],
  scopes: base.scopes,
  last_error: null,
  connected_by_owner_id: base.ownerId,
  connected_at: now.toISOString(),
  updated_at: now.toISOString(),
});

/** Several accounts granted: keep the user token (encrypted, its own AAD) and the names until the partner picks. */
export const pendingChoiceRow = <P extends SocialProvider>(
  provider: P,
  base: SaveBase,
  pending: { userToken: string; expiresInS: number | null },
  choices: SocialChoice<P>[],
  now: Date = new Date(),
): SocialConnectionRow => ({
  venue_id: base.venueId,
  provider,
  status: "choose_account",
  meta_user_id: base.metaUserId,
  page_id: null,
  external_account_id: null,
  display_name: null,
  access_token_enc: encryptSocialToken(pending.userToken, socialTokenContext(base.venueId, provider, "user_token")),
  token_expires_at: pending.expiresInS ? new Date(now.getTime() + pending.expiresInS * 1000).toISOString() : null,
  account_choices: choices,
  scopes: base.scopes,
  last_error: null,
  connected_by_owner_id: base.ownerId,
  connected_at: now.toISOString(),
  updated_at: now.toISOString(),
});

/**
 * Save rows built above in ONE upsert. PostgREST runs one request as one statement in one transaction,
 * so every row lands or none does; each replaces whatever row that venue + provider had.
 */
export const saveSocialConnections = async (rows: SocialConnectionRow[]): Promise<void> => {
  if (rows.length === 0) return;
  const { error } = await db().from(TABLE).upsert(rows, { onConflict: "venue_id,provider" });
  if (error) throw new Error(`Failed to save the social connections: ${error.message}`);
};

export type ChooseResult = "connected" | "not_found" | "expired" | "reconnect" | "error";

/**
 * The partner picked one of the pending accounts (an Instagram account or a Page) by its id: fetch that
 * account's Page token with the kept user token (one Graph call) and connect it.
 */
export const chooseConnection = async (provider: SocialProvider, venueId: string, ownerId: string, id: string): Promise<ChooseResult> => {
  const connection = await loadConnection(venueId, provider);
  if (!connection || connection.status !== "choose_account") return "expired";
  if (!connection.choices.some((choice) => choiceId(choice) === id)) return "not_found";
  const secret = metaAppSecret();
  if (!secret) return "error";

  const { data, error } = await db().from(TABLE).select("access_token_enc, scopes").eq("id", connection.id).eq("status", "choose_account").maybeSingle();
  if (error || !data) return "expired";
  const row = data as { access_token_enc: string; scopes: string[] | null };
  const userToken = decryptSocialToken(row.access_token_enc, socialTokenContext(venueId, provider, "user_token"));

  const accounts = await PROVIDERS[provider].fetchChoices(userToken, secret);
  if (!accounts.ok) {
    console.warn(`${LOG} choose-fetch-failed`, { provider, kind: accounts.error.kind, code: accounts.error.code });
    return accounts.error.kind === "token" || accounts.error.kind === "permission" ? "reconnect" : "error";
  }
  const account = accounts.data.find((entry) => entry.accountId === id);
  if (!account) return "not_found";
  await saveSocialConnections([connectionRow(provider, { venueId, ownerId, metaUserId: connection.metaUserId, scopes: row.scopes ?? [] }, account)]);
  return "connected";
};

/** Meta refused the token: the sheet shows "Reconnect". The token is kept until they do. Either provider. */
export const markSocialReconnectNeeded = async (connectionId: string, reason: string): Promise<void> => {
  await db()
    .from(TABLE)
    .update({ status: "reconnect_needed", last_error: reason.slice(0, 200), updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("status", "active");
};

/**
 * A login shows the venue's earlier rows for these providers can no longer post (plan §5.4 Phase 10,
 * §5.9 Phase 15): the partner switched the provider off (`declined at reconnect`), or granted it but the
 * same Facebook user no longer has an account / a Page they may post to (`no account at reconnect`).
 * /me/permissions and /me/accounts are that Facebook user's, not one token's, so the venue's ACTIVE rows
 * made by the same user are gone too: mark them "Reconnect" now rather than at the next failed post. A
 * row from another Facebook user is left alone (their token says nothing about this login).
 * One filtered update per reason (at most 2 per login); returns how many rows changed.
 */
export const markGoneReconnectNeeded = async (venueId: string, metaUserId: string, gone: SocialGoneConnection[]): Promise<number> => {
  const byReason = new Map<string, SocialProvider[]>();
  for (const { provider, reason } of gone) byReason.set(reason, [...(byReason.get(reason) ?? []), provider]);
  let marked = 0;
  for (const [reason, providers] of byReason) {
    const { data, error } = await db()
      .from(TABLE)
      .update({ status: "reconnect_needed", last_error: reason, updated_at: new Date().toISOString() })
      .eq("venue_id", venueId)
      .eq("meta_user_id", metaUserId)
      .eq("status", "active")
      .in("provider", providers)
      .select("id");
    if (error) throw new Error(`Failed to mark gone connections: ${error.message}`);
    marked += (data ?? []).length;
  }
  return marked;
};

type OpenPostRow = SocialPostMarks & { id: string; media_path: string | null };

/**
 * End every post that still needs these connections (Disconnect, Meta's deauthorize / data deletion). Each
 * loses its caption and file (privacy policy: kept only until published or cancelled) and ends as:
 *   - may be live (socialPostMayBeLive: a request holds it, or media_publish / the Reel finish was sent) →
 *     failed "unconfirmed", so Recent posts says "Not confirmed" and the partner checks before posting again;
 *   - anything else → cancelled.
 * One read, then at most two updates over the ids it found (never one per post), each fenced on what the read
 * saw (plan §5.13, Phase 19): a post claimed or marked since the read is never cancelled (the request holding
 * it finishes it), and a post that request has already finished is never overwritten. A request whose post is
 * ended here is fenced out of its next write (lostClaim in socialPosts.ts), so nothing is written over it.
 * Returns the stored files of the posts this ended, for the caller to delete.
 */
const endOpenPosts = async (connectionIds: string[]): Promise<string[]> => {
  if (connectionIds.length === 0) return [];
  const { data, error } = await db()
    .from("social_posts")
    .select("id, provider, status, container_id, external_post_id, media_path")
    .in("connection_id", connectionIds)
    .in("status", OPEN_POST_STATUSES);
  if (error) throw new Error(`Failed to load open posts: ${error.message}`);
  const open = (data ?? []) as OpenPostRow[];
  const live = open.filter(socialPostMayBeLive).map((row) => row.id);
  const notLive = open.filter((row) => !socialPostMayBeLive(row)).map((row) => row.id);
  const now = new Date().toISOString();
  const ended = new Set<string>();

  if (notLive.length > 0) {
    const { data: cancelled, error: cancelError } = await db()
      .from("social_posts")
      .update({ status: "cancelled", caption: "", media_path: null, error: null, updated_at: now })
      .in("id", notLive)
      // Still not live: no request holds it and nothing was sent (on an open post only the marks set external_post_id).
      .in("status", UNCLAIMED_OPEN_STATUSES)
      .is("external_post_id", null)
      .select("id");
    if (cancelError) throw new Error(`Failed to cancel posts: ${cancelError.message}`);
    for (const row of (cancelled ?? []) as { id: string }[]) ended.add(row.id);
  }
  if (live.length > 0) {
    const { data: unconfirmed, error: liveError } = await db()
      .from("social_posts")
      // The mark (a container / video id; container_id keeps it) never outlives the post, as in finish().
      .update({ status: "failed", error: "unconfirmed", caption: "", media_path: null, claimed_at: null, external_post_id: null, updated_at: now })
      .in("id", live)
      .in("status", OPEN_POST_STATUSES)
      .select("id");
    if (liveError) throw new Error(`Failed to end posts: ${liveError.message}`);
    const rows = (unconfirmed ?? []) as { id: string }[];
    for (const row of rows) ended.add(row.id);
    if (rows.length > 0) console.warn(`${LOG} ended-unconfirmed`, { count: rows.length });
  }
  return open.filter((row) => ended.has(row.id)).map((row) => row.media_path ?? "");
};

/** Delete the stored files of these posts (best effort; a leftover file is swept later). */
export const deleteSocialMedia = async (paths: string[]): Promise<void> => {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return;
  const { error } = await db().storage.from(SOCIAL_MEDIA_BUCKET).remove(clean);
  if (error) console.warn(`${LOG} media-delete-failed`, { count: clean.length });
};

/** Remove the app for a Facebook user if no venue still uses that login. Best effort. */
const revokeIfUnused = async (metaUserId: string): Promise<void> => {
  const secret = metaAppSecret();
  if (!secret) return;
  const { count, error } = await db().from(TABLE).select("id", { count: "exact", head: true }).eq("meta_user_id", metaUserId);
  if (error || (count ?? 0) > 0) return;
  const revoked = await revokeMetaApp(metaUserId, secret);
  if (!revoked.ok) console.warn(`${LOG} revoke-failed`, { kind: revoked.error.kind, code: revoked.error.code });
};

const removeConnections = async (rows: { id: string }[]): Promise<number> => {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return 0;
  await deleteSocialMedia(await endOpenPosts(ids));
  const { error } = await db().from(TABLE).delete().in("id", ids);
  if (error) throw new Error(`Failed to delete connections: ${error.message}`);
  return ids.length;
};

/** "Disconnect" in the sheet: delete the token and row, end open posts (endOpenPosts), and remove the app if unused. */
export const disconnectConnection = async (venueId: string, provider: SocialProvider): Promise<boolean> => {
  const { data, error } = await db().from(TABLE).select("id, meta_user_id").eq("venue_id", venueId).eq("provider", provider);
  if (error) throw new Error(`Failed to load the ${provider} connection: ${error.message}`);
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

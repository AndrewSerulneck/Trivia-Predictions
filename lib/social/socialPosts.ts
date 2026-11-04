import "server-only";
import { metaAppSecret } from "@/lib/social/metaConfig";
import {
  createInstagramContainer,
  fetchContainerStatus,
  fetchInstagramPermalink,
  publishInstagramContainer,
  type GraphError,
  type InstagramContainerInput,
} from "@/lib/social/metaGraph";
import {
  deleteSocialMedia,
  instagramPageToken,
  markInstagramReconnectNeeded,
  type InstagramConnection,
} from "@/lib/social/socialConnections";
import {
  containerStep,
  postErrorFor,
  SOCIAL_CONTAINER_TTL_MS,
  SOCIAL_DAILY_POST_CAP,
  SOCIAL_MEDIA_BUCKET,
  SOCIAL_PUBLISH_LEASE_MS,
  SOCIAL_RECENT_POSTS,
  SOCIAL_UPLOAD_ABANDON_MS,
  socialMaxBytes,
  socialMediaPath,
  socialMediaType,
} from "@/lib/social/socialPublishRules";
import type { SocialPostErrorCode, SocialPostFormat, SocialPostStatus, SocialPostView } from "@/lib/social/socialTypes";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// social_posts: Instagram "Post now" (docs/partner-social-promo-plan.md Phase 5).
//
//   uploading ──(publish: claim)──▶ publishing ──container──▶ processing ──FINISHED──▶ publishing ──▶ published
//                                        │ image: publish at once ─────────────────────────────────▶ published
//                                        └─ any refusal ─▶ failed
//
// Every move is a CONDITIONAL update on the current status, so two requests (a double tap, the poll
// racing the sheet re-opening) can never both create a container or both call media_publish. A
// request that claims a post and then dies leaves it "publishing"; after SOCIAL_PUBLISH_LEASE_MS
// another request may take it over (claimed_at).
//
// Cost per post: create = 1 insert + 1 signed upload URL; publish = 1 storage list + 1 signed read URL
// + 1–2 Graph calls; each Reel check = 1 read + 1 Graph call (≤30 per Reel). Finished posts lose their
// file and caption (privacy policy) and keep only what "Recent posts" shows.

const TABLE = "social_posts";
const COLUMNS =
  "id, venue_id, provider, external_account_id, connection_id, template_id, format, caption, media_path, media_type, status, claimed_at, cover_ms, container_id, external_post_id, permalink, error, created_at";

type PostRow = {
  id: string;
  venue_id: string;
  provider: string;
  external_account_id: string | null;
  connection_id: string | null;
  template_id: string;
  format: SocialPostFormat;
  caption: string;
  media_path: string | null;
  media_type: string;
  status: SocialPostStatus;
  claimed_at: string | null;
  cover_ms: number | null;
  container_id: string | null;
  external_post_id: string | null;
  permalink: string | null;
  error: SocialPostErrorCode | null;
  created_at: string;
};

const db = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  return supabaseAdmin;
};

export const postView = (row: PostRow): SocialPostView => ({
  id: row.id,
  format: row.format,
  templateId: row.template_id,
  status: row.status,
  permalink: row.permalink,
  error: row.error,
  createdAt: row.created_at,
});

const loadPost = async (venueId: string, postId: string): Promise<PostRow | null> => {
  const { data, error } = await db().from(TABLE).select(COLUMNS).eq("id", postId).eq("venue_id", venueId).maybeSingle();
  if (error) throw new Error(`Failed to load the post: ${error.message}`);
  return (data as PostRow | null) ?? null;
};

/** Move a post from one status to the next only if it is still where we left it. Null = someone else moved it. */
const moveIf = async (postId: string, from: SocialPostStatus, patch: Partial<PostRow> & { published_at?: string }, extra?: { claimedBefore?: string }): Promise<PostRow | null> => {
  let query = db()
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("status", from);
  if (extra?.claimedBefore) query = query.lt("claimed_at", extra.claimedBefore);
  const { data, error } = await query.select(COLUMNS).maybeSingle();
  if (error) throw new Error(`Failed to update the post: ${error.message}`);
  return (data as PostRow | null) ?? null;
};

/** A final state: the file goes and the caption is cleared (kept only until published or cancelled). */
const finish = async (row: PostRow, outcome: { status: "published" | "failed"; error?: SocialPostErrorCode; mediaId?: string; permalink?: string | null }): Promise<PostRow> => {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from(TABLE)
    .update({
      status: outcome.status,
      error: outcome.error ?? null,
      external_post_id: outcome.mediaId ?? row.external_post_id,
      permalink: outcome.permalink ?? row.permalink,
      published_at: outcome.status === "published" ? now : null,
      caption: "",
      media_path: null,
      claimed_at: null,
      updated_at: now,
    })
    .eq("id", row.id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to finish the post: ${error.message}`);
  if (row.media_path) await deleteSocialMedia([row.media_path]);
  return (data as PostRow | null) ?? row;
};

/** A Graph refusal: fail the post, and flag the connection when Meta refused the token itself. */
const fail = async (row: PostRow, connection: InstagramConnection, graph: GraphError): Promise<PostRow> => {
  console.warn("[SocialInstagram] post-failed", { postId: row.id, kind: graph.kind, code: graph.code, subcode: graph.subcode });
  if (graph.kind === "token" || graph.kind === "permission") await markInstagramReconnectNeeded(connection.id, `graph ${graph.kind} ${graph.code ?? ""}`);
  return finish(row, { status: "failed", error: postErrorFor(graph.kind) });
};

// ── Create ───────────────────────────────────────────────────────────────────────────────

export type CreatePostInput = {
  venueId: string;
  ownerId: string;
  connection: InstagramConnection;
  format: SocialPostFormat;
  templateId: string;
  scheduleId: string | null;
  prizeIds: string[];
  musicId: string | null;
  caption: string;
  coverMs: number | null;
};

/** Posts made for this venue in the last 24 h (the daily cap). */
export const postsLeftToday = async (venueId: string, nowMs: number = Date.now()): Promise<number> => {
  const since = new Date(nowMs - 24 * 60 * 60_000).toISOString();
  const { count, error } = await db()
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueId)
    .gte("created_at", since)
    .neq("status", "cancelled");
  if (error) throw new Error(`Failed to count posts: ${error.message}`);
  return Math.max(0, SOCIAL_DAILY_POST_CAP - (count ?? 0));
};

/** The row + a signed upload URL for the browser (the file never passes through Vercel). */
export const createInstagramPost = async (input: CreatePostInput): Promise<{ postId: string; uploadUrl: string }> => {
  const id = crypto.randomUUID();
  const path = socialMediaPath(id, input.format);
  const { error } = await db().from(TABLE).insert({
    id,
    venue_id: input.venueId,
    provider: "instagram",
    external_account_id: input.connection.instagramId,
    connection_id: input.connection.id,
    template_id: input.templateId,
    schedule_id: input.scheduleId,
    prize_ids: input.prizeIds,
    music_id: input.format === "reel" ? input.musicId : null,
    format: input.format,
    caption: input.format === "story" ? "" : input.caption,
    media_path: path,
    media_type: socialMediaType(input.format),
    status: "uploading",
    cover_ms: input.format === "reel" ? input.coverMs : null,
    created_by_owner_id: input.ownerId,
  });
  if (error) throw new Error(`Failed to create the post: ${error.message}`);

  const signed = await db().storage.from(SOCIAL_MEDIA_BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data?.signedUrl) {
    // Nothing was uploaded and nothing reached Meta: drop the row so it doesn't count against the cap.
    await db().from(TABLE).delete().eq("id", id).eq("status", "uploading");
    throw new Error("Failed to create the upload URL.");
  }
  return { postId: id, uploadUrl: signed.data.signedUrl };
};

// ── Publish ──────────────────────────────────────────────────────────────────────────────

/** The uploaded file, checked: there, the right size for its format. */
const uploadedFileOk = async (row: PostRow): Promise<boolean> => {
  if (!row.media_path) return false;
  const slash = row.media_path.lastIndexOf("/");
  const folder = row.media_path.slice(0, slash);
  const name = row.media_path.slice(slash + 1);
  const { data, error } = await db().storage.from(SOCIAL_MEDIA_BUCKET).list(folder, { search: name, limit: 1 });
  if (error) throw new Error("Failed to check the uploaded file.");
  const file = (data ?? []).find((entry) => entry.name === name);
  const size = Number((file?.metadata as { size?: unknown } | undefined)?.size ?? 0);
  return Boolean(file) && size > 0 && size <= socialMaxBytes(row.format);
};

const containerInput = (row: PostRow, url: string): InstagramContainerInput => {
  if (row.format === "reel") return { kind: "reel", videoUrl: url, caption: row.caption, coverMs: row.cover_ms };
  if (row.format === "story") return { kind: "story", imageUrl: url };
  return { kind: "image", imageUrl: url, caption: row.caption };
};

/** Publish a FINISHED container we hold the claim for, then finish the post. */
const publishClaimed = async (row: PostRow, connection: InstagramConnection, pageToken: string, secret: string): Promise<PostRow> => {
  if (!row.container_id || !row.external_account_id) return finish(row, { status: "failed", error: "failed" });
  const published = await publishInstagramContainer({ instagramId: row.external_account_id, containerId: row.container_id, pageToken, secret });
  if (!published.ok) {
    if (published.error.kind === "not_ready") {
      return (await moveIf(row.id, "publishing", { status: "processing", claimed_at: null })) ?? row;
    }
    return fail(row, connection, published.error);
  }
  const permalink = await fetchInstagramPermalink({ mediaId: published.data, pageToken, secret });
  console.info("[SocialInstagram] published", { postId: row.id, format: row.format });
  return finish(row, { status: "published", mediaId: published.data, permalink });
};

export type PublishOutcome = { ok: true; post: SocialPostView } | { ok: false; code: "not_found" | "not_uploaded" | "busy" | "not_connected" | "not_configured" };

/**
 * "Post now" after the upload: claim the post, give Meta a 1-hour signed URL, create the container.
 * A picture is published in the same request; a Reel goes to "processing" and the sheet polls.
 */
export const publishInstagramPost = async (input: { venueId: string; postId: string; connection: InstagramConnection }): Promise<PublishOutcome> => {
  const secret = metaAppSecret();
  if (!secret) return { ok: false, code: "not_configured" };
  const existing = await loadPost(input.venueId, input.postId);
  if (!existing) return { ok: false, code: "not_found" };
  if (existing.status !== "uploading") return { ok: true, post: postView(existing) };
  if (input.connection.status !== "active" || existing.external_account_id !== input.connection.instagramId) {
    return { ok: false, code: "not_connected" };
  }
  if (!(await uploadedFileOk(existing))) return { ok: false, code: "not_uploaded" };

  const claimed = await claim(existing, Date.now());
  if (!claimed) return { ok: false, code: "busy" };
  return { ok: true, post: postView(await createContainerFor(claimed, input.connection, secret)) };
};

const createContainerFor = async (row: PostRow, connection: InstagramConnection, secret: string): Promise<PostRow> => {
  let pageToken: string;
  try {
    pageToken = await instagramPageToken(connection);
  } catch {
    return finish(row, { status: "failed", error: "reconnect" });
  }
  const signed = row.media_path ? await db().storage.from(SOCIAL_MEDIA_BUCKET).createSignedUrl(row.media_path, 60 * 60) : null;
  if (!signed || signed.error || !signed.data?.signedUrl) return finish(row, { status: "failed", error: "upload_missing" });

  const container = await createInstagramContainer({
    instagramId: row.external_account_id ?? "",
    pageToken,
    secret,
    media: containerInput(row, signed.data.signedUrl),
  });
  if (!container.ok) return fail(row, connection, container.error);

  if (row.format === "reel") {
    return (await moveIf(row.id, "publishing", { status: "processing", container_id: container.data, claimed_at: null })) ?? row;
  }
  // Pictures are usually ready at once; "not ready" drops back to processing for the next check.
  const withContainer = (await moveIf(row.id, "publishing", { container_id: container.data })) ?? { ...row, container_id: container.data };
  return publishClaimed(withContainer, connection, pageToken, secret);
};

/**
 * Take a post for this request: from its current status to "publishing" with a fresh claimed_at. A post
 * already "publishing" can be taken only once its lease has run out. Null = another request has it.
 */
const claim = async (row: PostRow, nowMs: number): Promise<PostRow | null> =>
  moveIf(
    row.id,
    row.status,
    { status: "publishing", claimed_at: new Date(nowMs).toISOString() },
    row.status === "publishing" ? { claimedBefore: new Date(nowMs - SOCIAL_PUBLISH_LEASE_MS).toISOString() } : undefined,
  );

/**
 * One step forward for a post that isn't final yet (the sheet's poll, and "Recent posts" on open).
 * processing: one status check; FINISHED → claim → publish. publishing past its lease: taken over.
 * uploading for over an hour: failed (the tab closed mid-upload). A container over 24 h old: expired.
 */
const advanceInstagramPost = async (row: PostRow, connection: InstagramConnection | null, nowMs: number = Date.now()): Promise<PostRow> => {
  const age = nowMs - Date.parse(row.created_at);

  if (row.status === "uploading") {
    if (age < SOCIAL_UPLOAD_ABANDON_MS) return row;
    const claimed = await claim(row, nowMs);
    return claimed ? finish(claimed, { status: "failed", error: "upload_missing" }) : row;
  }
  if (row.status !== "processing" && row.status !== "publishing") return row;
  if (row.status === "publishing" && row.claimed_at && Date.parse(row.claimed_at) + SOCIAL_PUBLISH_LEASE_MS > nowMs) return row;

  if (age > SOCIAL_CONTAINER_TTL_MS) {
    const claimed = await claim(row, nowMs);
    return claimed ? finish(claimed, { status: "failed", error: "expired" }) : row;
  }

  const secret = metaAppSecret();
  if (!secret) return row;
  if (!connection || connection.status !== "active" || connection.instagramId !== row.external_account_id) {
    // Disconnected (or another account connected) while it was in flight: nothing can finish it.
    const claimed = await claim(row, nowMs);
    return claimed ? finish(claimed, { status: "failed", error: "reconnect" }) : row;
  }

  // A stale "publishing" with no container died before creating one: start again from the file.
  if (!row.container_id) {
    if (row.status !== "publishing") return row;
    const retaken = await claim(row, nowMs);
    return retaken ? createContainerFor(retaken, connection, secret) : row;
  }

  let pageToken: string;
  try {
    pageToken = await instagramPageToken(connection);
  } catch {
    return row;
  }
  const status = await fetchContainerStatus({ containerId: row.container_id, pageToken, secret });
  if (!status.ok) {
    if (status.error.kind === "network" || status.error.kind === "other") return row;
    const claimed = await claim(row, nowMs);
    return claimed ? fail(claimed, connection, status.error) : row;
  }

  const step = containerStep(status.data);
  if (step === "wait") {
    // A stale "publishing" whose container is still processing goes back to waiting.
    return row.status === "publishing" ? ((await moveIf(row.id, "publishing", { status: "processing", claimed_at: null })) ?? row) : row;
  }
  const claimed = await claim(row, nowMs);
  if (!claimed) return row;
  if (step === "publish") return publishClaimed(claimed, connection, pageToken, secret);
  // Published by a request that died before recording it: no media id to link, but it is live.
  if (step === "already_published") return finish(claimed, { status: "published" });
  return finish(claimed, { status: "failed", error: step === "expired" ? "expired" : "media_rejected" });
};

/** GET one post for the sheet's poll, moving it one step forward first. */
export const pollInstagramPost = async (input: { venueId: string; postId: string; connection: InstagramConnection | null }): Promise<SocialPostView | null> => {
  const row = await loadPost(input.venueId, input.postId);
  if (!row) return null;
  return postView(await advanceInstagramPost(row, input.connection));
};

/** "Recent posts" for the sheet. At most two unfinished ones are moved forward (≤2 Graph calls). */
export const listRecentInstagramPosts = async (venueId: string, connection: InstagramConnection | null): Promise<SocialPostView[]> => {
  const { data, error } = await db()
    .from(TABLE)
    .select(COLUMNS)
    .eq("venue_id", venueId)
    .eq("provider", "instagram")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(SOCIAL_RECENT_POSTS);
  if (error) throw new Error(`Failed to load posts: ${error.message}`);
  const rows = (data ?? []) as PostRow[];
  let advanced = 0;
  const out: SocialPostView[] = [];
  for (const row of rows) {
    const open = row.status === "uploading" || row.status === "processing" || row.status === "publishing";
    if (open && advanced < 2) {
      advanced += 1;
      out.push(postView(await advanceInstagramPost(row, connection)));
    } else {
      out.push(postView(row));
    }
  }
  return out;
};

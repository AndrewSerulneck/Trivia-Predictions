import "server-only";
import { metaAppSecret } from "@/lib/social/metaConfig";
import {
  createInstagramContainer,
  fetchContainerStatus,
  fetchFacebookReelStatus,
  fetchInstagramPermalink,
  finishFacebookReel,
  publishFacebookPhoto,
  publishInstagramContainer,
  startFacebookReel,
  uploadFacebookReel,
  type GraphError,
  type InstagramContainerInput,
} from "@/lib/social/metaGraph";
import { connectionToken, deleteSocialMedia, loadConnection, markSocialReconnectNeeded, type SocialConnection } from "@/lib/social/socialConnections";
import {
  containerStep,
  facebookReelStep,
  finishSent,
  isUnsure,
  postErrorFor,
  publishSent,
  SOCIAL_CONTAINER_TTL_MS,
  SOCIAL_FACEBOOK_REEL_TTL_MS,
  SOCIAL_DAILY_POST_CAP,
  SOCIAL_MEDIA_BUCKET,
  SOCIAL_PUBLISH_LEASE_MS,
  SOCIAL_RECENT_POSTS,
  SOCIAL_UPLOAD_ABANDON_MS,
  socialMaxBytes,
  socialMediaPath,
  socialMediaType,
} from "@/lib/social/socialPublishRules";
import type { SocialPostErrorCode, SocialPostFormat, SocialPostStatus, SocialPostView, SocialProvider } from "@/lib/social/socialTypes";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// social_posts: Instagram "Post now" (docs/partner-social-promo-plan.md Phase 5) and Facebook Page
// "Post now" (Phase 6; its own section at the bottom). Instagram:
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
// Phase 9 (plan §5.3), so a slow request can't write over a post it no longer owns and a lost answer
// never reads as "failed":
//   * claimed_at is the claim's fencing token. Every write made under a claim also matches
//     status = 'publishing' AND claimed_at = ours (updateClaimed; moveIf is the only update here). If it
//     matches nothing, the claim was lost: log lost-claim, keep the file (the new owner may need it),
//     make no more Graph calls, and answer the post as it is now.
//   * The lease is renewed (one fenced write) just before each call Meta can't undo: media_publish, the
//     Facebook photo and the Facebook Reel finish. The claiming routes stop at maxDuration = 90 s, well
//     inside the 150 s lease (SOCIAL_ROUTE_MAX_DURATION_S, contract test).
//   * One of those calls made after the post's id is saved that gets no clear answer (isUnsure) never
//     fails the post: it goes back to "processing" with its file, and the poll asks Meta.
//
// Phase 14 (plan §5.8): Instagram's media_publish goes out AT MOST ONCE per post. The lease-renewing write
// just before it sets external_post_id = container_id (publishSent). A marked post is never published
// again, by the poll or by a request that claimed it after reading an older row. Only Meta's clear "not
// ready" clears the mark. A marked post that still reads FINISHED waits SOCIAL_INSTAGRAM_CONFIRM_MS from
// its updated_at (the send), then ends "unconfirmed"; so does one that can't be asked any more (container
// TTL, connection gone, status read refused). It is never given a "didn't post" reason without Meta's answer.
//
// Phase 19 (plan §5.13): nothing that may be live is hidden or posted twice. A throw once the claim was tried
// answers "unsure" (publishFromClaim), never the route's "try again", so the panel polls the post instead of
// making a second one. Disconnect and Meta's deauthorize end a post that may be live (socialPostMayBeLive in
// socialPublishRules.ts) as "unconfirmed", not "cancelled" (socialConnections.ts).
//
// Cost per post: create = 1 insert + 1 signed upload URL; publish = 1 storage list + 1 signed read URL
// + 1–3 Graph calls + 2–4 writes; each Reel check = 1 read + 1 Graph call (≤30 per Reel). Finished posts
// lose their file and caption (privacy policy) and keep only what "Recent posts" shows.

const TABLE = "social_posts";
const COLUMNS =
  "id, venue_id, provider, external_account_id, connection_id, template_id, format, caption, media_path, media_type, status, claimed_at, cover_ms, container_id, external_post_id, permalink, error, created_at, updated_at";

type PostRow = {
  id: string;
  venue_id: string;
  provider: SocialProvider;
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
  /**
   * Set by every write (moveIf). On a post marked publishSent it is when media_publish was sent (Phase 14):
   * the unsure write sets it and later non-final writes keep it (keepSentAt). One exception: a claim that
   * finds the post already marked (the publishClaimed guard) moves it on by that request's status read.
   */
  updated_at: string;
};

/** A post this request holds the claim for: "publishing", with the claimed_at it wrote (the fencing token). */
type ClaimedRow = PostRow & { status: "publishing"; claimed_at: string };

type PostPatch = Partial<PostRow> & { published_at?: string | null };

type FinalOutcome = { status: "published" | "failed"; error?: SocialPostErrorCode; mediaId?: string; permalink?: string | null };

const db = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  return supabaseAdmin;
};

export const postView = (row: PostRow): SocialPostView => ({
  id: row.id,
  provider: row.provider,
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

const asClaimed = (row: PostRow | null): ClaimedRow | null =>
  row && row.status === "publishing" && typeof row.claimed_at === "string" ? (row as ClaimedRow) : null;

/**
 * Move a post from one status to the next only if it is still where we left it. Null = someone else moved
 * it. `claimedAt` fences the write on the claim we saw; `claimedBefore` takes over an expired lease.
 * updated_at is now unless the patch keeps it (keepSentAt, Phase 14).
 */
const moveIf = async (postId: string, from: SocialPostStatus, patch: PostPatch, guard?: { claimedBefore?: string; claimedAt?: string }): Promise<PostRow | null> => {
  let query = db()
    .from(TABLE)
    .update({ updated_at: new Date().toISOString(), ...patch })
    .eq("id", postId)
    .eq("status", from);
  if (guard?.claimedBefore) query = query.lt("claimed_at", guard.claimedBefore);
  if (guard?.claimedAt) query = query.eq("claimed_at", guard.claimedAt);
  const { data, error } = await query.select(COLUMNS).maybeSingle();
  if (error) throw new Error(`Failed to update the post: ${error.message}`);
  return (data as PostRow | null) ?? null;
};

/** A write under our claim. Null = the claim was lost (taken over after the lease, or cancelled by a disconnect). */
const updateClaimed = (row: ClaimedRow, patch: PostPatch): Promise<PostRow | null> =>
  moveIf(row.id, "publishing", patch, { claimedAt: row.claimed_at });

/**
 * The claim was lost: stop here, keep the file (the new owner may need it), answer the post as it is now.
 * Also how a request learns that Disconnect / Meta's deauthorize ended its post mid-call (Phase 19): it
 * writes nothing over that "unconfirmed" or "cancelled".
 */
const lostClaim = async (row: PostRow): Promise<PostRow> => {
  console.warn("[SocialPost] lost-claim", { postId: row.id, provider: row.provider });
  return (await loadPost(row.venue_id, row.id)) ?? row;
};

/** Renew the lease just before a call Meta can't undo. Null = the claim was lost: don't make the call. */
const renew = async (row: ClaimedRow, patch: PostPatch = {}): Promise<ClaimedRow | null> =>
  asClaimed(await updateClaimed(row, { ...patch, claimed_at: new Date().toISOString() }));

/** Hand the post back to the poll: "processing", no claim. */
const toProcessing = async (row: ClaimedRow, patch: PostPatch = {}): Promise<PostRow> =>
  (await updateClaimed(row, { ...patch, status: "processing", claimed_at: null })) ?? lostClaim(row);

// publishSent (Instagram, Phase 14) and finishSent (Facebook Reel, Phase 9) live in socialPublishRules.ts, so
// Disconnect (socialConnections.ts) reads the same marks as this module (Phase 19).

/** A non-final write to a marked post keeps updated_at, the time media_publish was sent (the confirm window's start). */
const keepSentAt = (row: PostRow): PostPatch => (publishSent(row) ? { updated_at: row.updated_at } : {});

/** A final state: the file goes and the caption is cleared (kept only until published or cancelled). */
const finish = async (row: ClaimedRow, outcome: FinalOutcome): Promise<PostRow> => {
  const done = await updateClaimed(row, {
    status: outcome.status,
    error: outcome.error ?? null,
    // An Instagram mark held the container id, not a media id: it never outlives the post.
    external_post_id: outcome.mediaId ?? (publishSent(row) ? null : row.external_post_id),
    permalink: outcome.permalink ?? row.permalink,
    published_at: outcome.status === "published" ? new Date().toISOString() : null,
    caption: "",
    media_path: null,
    claimed_at: null,
  });
  if (!done) return lostClaim(row);
  if (row.media_path) await deleteSocialMedia([row.media_path]);
  return done;
};

/**
 * A Graph refusal: fail the post, and flag the connection when Meta refused the token itself. `error`
 * defaults to the refusal's own reason; a refused status read of a post that may be live passes "unconfirmed".
 */
const fail = async (row: ClaimedRow, connection: { id: string }, graph: GraphError, error: SocialPostErrorCode = postErrorFor(graph.kind)): Promise<PostRow> => {
  console.warn("[SocialPost] post-failed", { postId: row.id, provider: row.provider, kind: graph.kind, code: graph.code, subcode: graph.subcode });
  if (graph.kind === "token" || graph.kind === "permission") await markSocialReconnectNeeded(connection.id, `graph ${graph.kind} ${graph.code ?? ""}`);
  return finish(row, { status: "failed", error });
};

/** A call Meta can't undo got no clear answer after the post's id was saved: the poll asks Meta what happened. */
const unsure = (row: ClaimedRow, step: "media_publish" | "reel_upload" | "reel_finish", graph: GraphError): Promise<PostRow> => {
  console.warn("[SocialPost] unsure", { postId: row.id, provider: row.provider, step, kind: graph.kind, code: graph.code, httpStatus: graph.httpStatus });
  return toProcessing(row);
};

// ── Create ───────────────────────────────────────────────────────────────────────────────

export type CreatePostInput = {
  venueId: string;
  ownerId: string;
  connection: SocialConnection;
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

/**
 * The row + a signed upload URL for the browser (the file never passes through Vercel), for the provider
 * of `input.connection`. Facebook Pages take a Post or a Reel (no Stories, plan §4.6); the caller checks
 * providerSupportsFormat.
 */
export const createSocialPost = async (input: CreatePostInput): Promise<{ postId: string; uploadUrl: string }> => {
  const id = crypto.randomUUID();
  const path = socialMediaPath(id, input.format);
  const { error } = await db().from(TABLE).insert({
    id,
    venue_id: input.venueId,
    provider: input.connection.provider,
    external_account_id: input.connection.accountId,
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

// ── Claims ───────────────────────────────────────────────────────────────────────────────

/**
 * Take a post for this request: from its current status to "publishing" with a fresh claimed_at. A post
 * already "publishing" can be taken only once its lease has run out. Null = another request has it.
 */
const claim = async (row: PostRow, nowMs: number): Promise<ClaimedRow | null> =>
  asClaimed(
    await moveIf(
      row.id,
      row.status,
      { status: "publishing", claimed_at: new Date(nowMs).toISOString() },
      row.status === "publishing" ? { claimedBefore: new Date(nowMs - SOCIAL_PUBLISH_LEASE_MS).toISOString() } : undefined,
    ),
  );

/** Claim the post and end it with no Graph call. Unchanged if another request has it. */
const claimAndFinish = async (row: PostRow, nowMs: number, outcome: FinalOutcome): Promise<PostRow> => {
  const claimed = await claim(row, nowMs);
  return claimed ? finish(claimed, outcome) : row;
};

/** Another request holds this post and its lease hasn't run out. */
const leaseHeld = (row: PostRow, nowMs: number): boolean =>
  row.status === "publishing" && row.claimed_at !== null && Date.parse(row.claimed_at) + SOCIAL_PUBLISH_LEASE_MS > nowMs;

/**
 * A stale "publishing" (its request died) whose Meta side is still working goes back to waiting, without a
 * claim: one write, fenced on the claimed_at we saw, so it can't undo a request that has just taken it over.
 * A post whose media_publish was sent keeps its send time (Phase 14).
 */
const releaseStale = async (row: PostRow): Promise<PostRow> =>
  row.status === "publishing" && row.claimed_at
    ? ((await moveIf(row.id, "publishing", { status: "processing", claimed_at: null, ...keepSentAt(row) }, { claimedAt: row.claimed_at })) ?? row)
    : row;

const isOpen = (row: PostRow): boolean => row.status === "uploading" || row.status === "processing" || row.status === "publishing";

/**
 * The first steps of a poll, the same for both providers and in this order (plan §5.5, Phase 11):
 * an upload left for an hour → failed; not open → as it is; another request's lease still held → as it
 * is. "continue" = the provider's own steps decide. What comes next differs ON PURPOSE (Phase 9) —
 * Instagram: TTL → wrong account → container; Facebook: no video id → only Meta's answer fails a Reel.
 */
const advanceCommon = async (row: PostRow, nowMs: number): Promise<PostRow | "continue"> => {
  if (row.status === "uploading") {
    return nowMs - Date.parse(row.created_at) < SOCIAL_UPLOAD_ABANDON_MS ? row : claimAndFinish(row, nowMs, { status: "failed", error: "upload_missing" });
  }
  if (!isOpen(row) || leaseHeld(row, nowMs)) return row;
  return "continue";
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

/**
 * Publish a FINISHED container we hold the claim for, then finish the post. media_publish goes out at
 * most once (Phase 14): the claimed row is checked for the mark, and the mark is set in the same fenced
 * write that renews the lease, just before the call.
 */
const publishClaimed = async (row: ClaimedRow, connection: SocialConnection<"instagram">, pageToken: string, secret: string): Promise<PostRow> => {
  const containerId = row.container_id;
  const instagramId = row.external_account_id;
  if (!containerId || !instagramId) return finish(row, { status: "failed", error: "failed" });
  // Another request sent it after this one read the container (its answer lost): never a second one.
  if (publishSent(row)) return toProcessing(row, keepSentAt(row));
  const live = await renew(row, { external_post_id: containerId });
  if (!live) return lostClaim(row);
  const published = await publishInstagramContainer({ instagramId, containerId, pageToken, secret });
  if (!published.ok) {
    // Meta's clear "not ready": nothing went out, so the next FINISHED publishes normally.
    if (published.error.kind === "not_ready") return toProcessing(live, { external_post_id: null });
    // It may be on Instagram: the poll asks the container (PUBLISHED → published; FINISHED → wait, then
    // unconfirmed). It keeps the mark, so it is never published again.
    if (isUnsure(published.error)) return unsure(live, "media_publish", published.error);
    return fail(live, connection, published.error);
  }
  const permalink = await fetchInstagramPermalink({ mediaId: published.data, pageToken, secret });
  console.info("[SocialInstagram] published", { postId: row.id, format: row.format });
  return finish(live, { status: "published", mediaId: published.data, permalink });
};

/**
 * `unsure` (Phase 19): something threw once the claim had been tried, so Meta may already have the post. The
 * route never says "try again" for it; the panel polls `postId` instead. Every other `ok: false` came before
 * the claim, when nothing can have reached Meta.
 */
export type PublishOutcome =
  | { ok: true; post: SocialPostView }
  | { ok: false; code: "not_found" | "not_uploaded" | "busy" | "not_connected" | "not_configured" }
  | { ok: false; code: "unsure"; postId: string };

/**
 * Claim the post and run this provider's publish steps (plan §5.13, Phase 19). From the claim on, a throw (a
 * DB write whose answer was lost, say, after media_publish or the Facebook photo went out) may come after Meta
 * took the post, so it answers `unsure` instead of throwing to the route's "try again". The claim itself is
 * inside on purpose: if its answer is lost it may still have landed, and a later poll would then publish the
 * post. The post is left as it is; the poll resolves it (Instagram asks the container; a Facebook photo left
 * "publishing" ends "unconfirmed"; a stale lease is taken over after SOCIAL_PUBLISH_LEASE_MS).
 */
const publishFromClaim = async (row: PostRow, steps: (claimed: ClaimedRow) => Promise<PostRow>): Promise<PublishOutcome> => {
  try {
    const claimed = await claim(row, Date.now());
    if (!claimed) return { ok: false, code: "busy" };
    return { ok: true, post: postView(await steps(claimed)) };
  } catch (error) {
    console.error("[SocialPost] publish-unsure", { postId: row.id, provider: row.provider, error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, code: "unsure", postId: row.id };
  }
};

/**
 * "Post now" after the upload: claim the post, give Meta a 1-hour signed URL, create the container.
 * A picture is published in the same request; a Reel goes to "processing" and the sheet polls.
 */
const publishInstagramPost = async (input: { row: PostRow; connection: SocialConnection<"instagram"> }): Promise<PublishOutcome> => {
  const secret = metaAppSecret();
  if (!secret) return { ok: false, code: "not_configured" };
  const existing = input.row;
  if (existing.provider !== "instagram") return { ok: false, code: "not_found" };
  if (existing.status !== "uploading") return { ok: true, post: postView(existing) };
  if (input.connection.status !== "active" || existing.external_account_id !== input.connection.accountId) {
    return { ok: false, code: "not_connected" };
  }
  if (!(await uploadedFileOk(existing))) return { ok: false, code: "not_uploaded" };
  return publishFromClaim(existing, (claimed) => createContainerFor(claimed, input.connection, secret));
};

const createContainerFor = async (row: ClaimedRow, connection: SocialConnection<"instagram">, secret: string): Promise<PostRow> => {
  let pageToken: string;
  try {
    pageToken = await connectionToken(connection);
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
  // No container id saved yet: even an unsure create can't go live (media_publish needs the id).
  if (!container.ok) return fail(row, connection, container.error);

  if (row.format === "reel") return toProcessing(row, { container_id: container.data });
  // Pictures are usually ready at once; "not ready" drops back to processing for the next check. A lost
  // save stops here, before media_publish (the container on its own never goes live).
  const withContainer = asClaimed(await updateClaimed(row, { container_id: container.data }));
  if (!withContainer) return lostClaim(row);
  return publishClaimed(withContainer, connection, pageToken, secret);
};

/**
 * One step forward for a post that isn't final yet (the sheet's poll, and "Recent posts" on open).
 * processing: one status check; FINISHED → claim → publish. publishing past its lease: taken over.
 * uploading for over an hour: failed (the tab closed mid-upload). A container over 24 h old: expired.
 */
const advanceInstagramPost = async (row: PostRow, connection: SocialConnection<"instagram"> | null, nowMs: number = Date.now()): Promise<PostRow> => {
  const common = await advanceCommon(row, nowMs);
  if (common !== "continue") return common;
  // Phase 14: once media_publish was sent the post may be live, so ending it without Meta's answer says
  // "unconfirmed", never a "didn't post" reason.
  const sent = publishSent(row);
  const endWithout = (error: SocialPostErrorCode) => claimAndFinish(row, nowMs, { status: "failed", error: sent ? "unconfirmed" : error });
  if (nowMs - Date.parse(row.created_at) > SOCIAL_CONTAINER_TTL_MS) return endWithout("expired");

  const secret = metaAppSecret();
  if (!secret) return row;
  if (!connection || connection.status !== "active" || connection.accountId !== row.external_account_id) {
    // Disconnected (or another account connected) while it was in flight: nothing can finish it.
    return endWithout("reconnect");
  }

  // A stale "publishing" with no container died before saving one, so media_publish was never called
  // (it needs the saved id): start again from the file.
  if (!row.container_id) {
    if (row.status !== "publishing") return row;
    const retaken = await claim(row, nowMs);
    return retaken ? createContainerFor(retaken, connection, secret) : row;
  }

  let pageToken: string;
  try {
    pageToken = await connectionToken(connection);
  } catch {
    return row;
  }
  const status = await fetchContainerStatus({ containerId: row.container_id, pageToken, secret });
  if (!status.ok) {
    if (status.error.kind === "network" || status.error.kind === "other") return row;
    // A refused status read says nothing about whether a sent media_publish went through.
    const claimed = await claim(row, nowMs);
    return claimed ? fail(claimed, connection, status.error, sent ? "unconfirmed" : postErrorFor(status.error.kind)) : row;
  }

  const step = containerStep(status.data, { publishSent: sent, sinceSentMs: nowMs - Date.parse(row.updated_at) });
  // A stale "publishing" whose container is still processing (or whose sent publish isn't confirmed yet)
  // goes back to waiting. A marked one is never republished, however it got here.
  if (step === "wait") return releaseStale(row);
  const claimed = await claim(row, nowMs);
  if (!claimed) return row;
  if (step === "publish") return publishClaimed(claimed, connection, pageToken, secret);
  // Published by a request that died (or lost Meta's answer) before recording it: no media id to link, but it is live.
  if (step === "already_published") return finish(claimed, { status: "published" });
  if (step === "unconfirmed") {
    console.warn("[SocialPost] unconfirmed", { postId: row.id, provider: row.provider, step: "media_publish" });
    return finish(claimed, { status: "failed", error: "unconfirmed" });
  }
  return finish(claimed, { status: "failed", error: step === "expired" ? "expired" : "media_rejected" });
};

/** "Recent posts" for the sheet, both providers. At most two unfinished ones are moved forward, side by side. */
export const listRecentSocialPosts = async (
  venueId: string,
  connections: { instagram: SocialConnection<"instagram"> | null; facebook: SocialConnection<"facebook"> | null },
): Promise<SocialPostView[]> => {
  const { data, error } = await db()
    .from(TABLE)
    .select(COLUMNS)
    .eq("venue_id", venueId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(SOCIAL_RECENT_POSTS);
  if (error) throw new Error(`Failed to load posts: ${error.message}`);
  const rows = (data ?? []) as PostRow[];
  // In parallel, so the route stays well inside its 90 s maxDuration (each step is ≤3 Graph calls of ≤20 s).
  let budget = 2;
  const moved = await Promise.all(
    rows.map((row) => {
      if (!isOpen(row) || budget === 0) return row;
      budget -= 1;
      return row.provider === "facebook" ? advanceFacebookPost(row, connections.facebook) : advanceInstagramPost(row, connections.instagram);
    }),
  );
  return moved.map(postView);
};

// ── Facebook Page (Phase 6) ──────────────────────────────────────────────────────────────
//
//   Post (photo): uploading ──claim──▶ publishing ──POST /{page}/photos──▶ published   (one call)
//   Reel:         uploading ──claim──▶ publishing ──start (video id saved)──upload──finish──▶ processing
//                 processing ──status: publishing complete──▶ published  (· error ▶ failed · 1 h ▶ ended)
//
// The same conditional moves as Instagram. Differences that matter:
//   * A photo is published by ONE call with no container to ask about afterwards, so a photo whose call
//     got no clear answer, or one left "publishing" by a request that died, is failed as "unconfirmed",
//     never retried (it may already be on the Page; a retry could post it twice).
//   * A Reel is ONE video object (its id is saved before the upload), so it can never post twice. Its
//     finish is sent at most once: external_post_id is set to the video id in the fenced write just before
//     the call. If the upload's answer was lost, the poll sends that first finish once Meta shows the
//     whole file (send_finish). Neither the upload nor the finish is ever repeated (Meta's docs don't say
//     a repeat is harmless; checked 2026-11-04). Only Meta's own answer fails a Reel with a video id; past
//     the hour with no answer it is "unconfirmed" if finish was sent, "expired" if not.

const sendReelFinish = async (row: ClaimedRow, connection: SocialConnection<"facebook">, pageToken: string, secret: string): Promise<PostRow> => {
  const videoId = row.container_id;
  const pageId = row.external_account_id;
  if (!videoId || !pageId) return finish(row, { status: "failed", error: "failed" });
  // Another request sent it after this one read Meta's status (found in Phase 14): never a second finish.
  if (finishSent(row)) return toProcessing(row);
  // One fenced write renews the lease and marks finish as sent, just before the call Meta can't undo.
  const live = await renew(row, { external_post_id: videoId });
  if (!live) return lostClaim(row);
  const finished = await finishFacebookReel({ pageId, videoId, pageToken, secret, description: row.caption });
  if (finished.ok) return toProcessing(live);
  if (isUnsure(finished.error)) return unsure(live, "reel_finish", finished.error);
  return fail(live, connection, finished.error);
};

const createFacebookFor = async (row: ClaimedRow, connection: SocialConnection<"facebook">, secret: string): Promise<PostRow> => {
  let pageToken: string;
  try {
    pageToken = await connectionToken(connection);
  } catch {
    return finish(row, { status: "failed", error: "reconnect" });
  }
  const pageId = row.external_account_id ?? "";
  const signed = row.media_path ? await db().storage.from(SOCIAL_MEDIA_BUCKET).createSignedUrl(row.media_path, 60 * 60) : null;
  if (!signed || signed.error || !signed.data?.signedUrl) return finish(row, { status: "failed", error: "upload_missing" });
  const fileUrl = signed.data.signedUrl;

  if (row.format !== "reel") {
    const live = await renew(row);
    if (!live) return lostClaim(row);
    const photo = await publishFacebookPhoto({ pageId, pageToken, secret, imageUrl: fileUrl, caption: row.caption });
    if (!photo.ok) {
      if (isUnsure(photo.error)) {
        console.warn("[SocialPost] unsure", { postId: row.id, provider: row.provider, step: "photo", kind: photo.error.kind, code: photo.error.code, httpStatus: photo.error.httpStatus });
        return finish(live, { status: "failed", error: "unconfirmed" });
      }
      return fail(live, connection, photo.error);
    }
    console.info("[SocialFacebook] published", { postId: row.id, format: row.format });
    return finish(live, { status: "published", mediaId: photo.data.postId, permalink: photo.data.permalink });
  }

  // No video id yet: even an unsure start can't go live (nothing is uploaded or finished without the id).
  const started = await startFacebookReel({ pageId, pageToken, secret });
  if (!started.ok) return fail(row, connection, started.error);
  const withVideo = asClaimed(await updateClaimed(row, { container_id: started.data }));
  if (!withVideo) return lostClaim(row);
  const uploaded = await uploadFacebookReel({ videoId: started.data, pageToken, fileUrl });
  if (!uploaded.ok) {
    // Meta may have the file: the poll sends finish once Meta shows the whole upload (send_finish).
    if (isUnsure(uploaded.error)) return unsure(withVideo, "reel_upload", uploaded.error);
    return fail(withVideo, connection, uploaded.error);
  }
  return sendReelFinish(withVideo, connection, pageToken, secret);
};

/** Facebook "Post now" after the upload. A photo is published in this request; a Reel goes to "processing". */
const publishFacebookPost = async (input: { row: PostRow; connection: SocialConnection<"facebook"> }): Promise<PublishOutcome> => {
  const secret = metaAppSecret();
  if (!secret) return { ok: false, code: "not_configured" };
  const existing = input.row;
  if (existing.provider !== "facebook") return { ok: false, code: "not_found" };
  if (existing.status !== "uploading") return { ok: true, post: postView(existing) };
  if (input.connection.status !== "active" || existing.external_account_id !== input.connection.accountId) {
    return { ok: false, code: "not_connected" };
  }
  if (existing.format === "story") return { ok: false, code: "not_found" };
  if (!(await uploadedFileOk(existing))) return { ok: false, code: "not_uploaded" };
  return publishFromClaim(existing, (claimed) => createFacebookFor(claimed, input.connection, secret));
};

/** One step forward for a Facebook post that isn't final yet (the sheet's poll, and Recent posts). */
const advanceFacebookPost = async (row: PostRow, connection: SocialConnection<"facebook"> | null, nowMs: number = Date.now()): Promise<PostRow> => {
  const common = await advanceCommon(row, nowMs);
  if (common !== "continue") return common;

  // No video id: a photo, whose one publish call may have reached the Page (never retried), or a Reel that
  // stopped before its video id was saved (nothing was uploaded or finished, so it can't be on the Page).
  if (!row.container_id) {
    return claimAndFinish(row, nowMs, { status: "failed", error: row.format === "reel" ? "failed" : "unconfirmed" });
  }

  // A Reel with a video id: only Meta's own answer fails it. While Meta can't be asked it waits (a
  // reconnect to the same Page lets the next check answer); past the hour it is ended.
  const pastTtl = nowMs - Date.parse(row.created_at) > SOCIAL_FACEBOOK_REEL_TTL_MS;
  const outOfTime = () => claimAndFinish(row, nowMs, { status: "failed", error: finishSent(row) ? "unconfirmed" : "expired" });
  const cantAsk = (): Promise<PostRow> => (pastTtl ? outOfTime() : Promise.resolve(row));

  const secret = metaAppSecret();
  if (!secret || !connection || connection.status !== "active" || connection.accountId !== row.external_account_id) return cantAsk();
  let pageToken: string;
  try {
    pageToken = await connectionToken(connection);
  } catch {
    return cantAsk();
  }
  const status = await fetchFacebookReelStatus({ videoId: row.container_id, pageToken, secret });
  if (!status.ok) {
    // A refusal of the status read says nothing about the Reel itself; a refused token is flagged.
    if (status.error.kind === "token" || status.error.kind === "permission") {
      await markSocialReconnectNeeded(connection.id, `graph ${status.error.kind} ${status.error.code ?? ""}`);
    }
    return cantAsk();
  }

  const step = facebookReelStep(status.data.status, { finishSent: finishSent(row) });
  if (step === "wait" || (step === "send_finish" && pastTtl)) return pastTtl ? outOfTime() : releaseStale(row);
  const claimed = await claim(row, nowMs);
  if (!claimed) return row;
  if (step === "send_finish") return sendReelFinish(claimed, connection, pageToken, secret);
  if (step === "published") {
    console.info("[SocialFacebook] published", { postId: row.id, format: row.format });
    return finish(claimed, { status: "published", mediaId: row.container_id, permalink: status.data.permalink });
  }
  return finish(claimed, { status: "failed", error: step === "expired" ? "expired" : "media_rejected" });
};

// ── Either provider (what the routes call) ───────────────────────────────────────────────

/**
 * Publish whichever provider the post is for, with that venue's connection for it. The post is read
 * once here and handed to the provider step (plan §5.12, Phase 18). loadPost filters by venue_id, so a
 * row from another venue comes back as null (no second venue check needed, Phase 21).
 */
export const publishSocialPost = async (input: { venueId: string; postId: string }): Promise<PublishOutcome> => {
  const row = await loadPost(input.venueId, input.postId);
  if (!row) return { ok: false, code: "not_found" };
  if (row.provider === "facebook") {
    const connection = await loadConnection(input.venueId, "facebook");
    return connection ? publishFacebookPost({ row, connection }) : { ok: false, code: "not_connected" };
  }
  const connection = await loadConnection(input.venueId, "instagram");
  return connection ? publishInstagramPost({ row, connection }) : { ok: false, code: "not_connected" };
};

/** The sheet's poll for either provider: one connection read for the post's provider, one step forward. */
export const pollSocialPost = async (input: { venueId: string; postId: string }): Promise<SocialPostView | null> => {
  const row = await loadPost(input.venueId, input.postId);
  if (!row) return null;
  if (row.provider === "facebook") return postView(await advanceFacebookPost(row, await loadConnection(input.venueId, "facebook")));
  return postView(await advanceInstagramPost(row, await loadConnection(input.venueId, "instagram")));
};

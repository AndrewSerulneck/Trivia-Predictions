"use client";

import { useEffect, useRef, useState } from "react";
import { HightopLoader } from "@/components/ui/HightopLoader";
import { SOCIAL_POST_COPY as COPY } from "@/lib/promo/promoCopy";
import { SOCIAL_POLL_INTERVAL_MS, SOCIAL_POLL_MAX_MS } from "@/lib/social/socialPublishRules";
import type {
  CreateSocialPostBody,
  CreateSocialPostResponse,
  InstagramConnectionView,
  InstagramStatusResponse,
  SocialPostFormat,
  SocialPostResponse,
  SocialPostView,
} from "@/lib/social/socialTypes";

// Instagram "Post now" inside Share to social (docs/partner-social-promo-plan.md Phase 5). Rendered by
// ShareToSocialSheet only while NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED is on (lib/social/flags.ts).
//
// Cost: ONE GET per sheet open (connection + recent posts + today's count). Posting = 1 create + the
// file PUT straight to private storage (never through Vercel) + 1 publish; a Reel then checks every
// 10 s for at most 5 minutes (≤30 GETs, each one Graph call). Nothing runs while the sheet is closed.

export type InstagramPostPanelProps = {
  open: boolean;
  venueId: string;
  format: SocialPostFormat;
  /** The finished picture or Reel; null while it is being made (or before Make Reel). */
  media: { blob: Blob; fileName: string } | null;
  caption: string;
  templateId: string | null;
  scheduleId: string | null;
  prizeIds: readonly string[];
  musicId: string | null;
  /** `?socialResult=` after Meta sent the partner back, only when it was for this venue. */
  connectResult: string | null;
};

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: InstagramStatusResponse };
type Sending =
  | { phase: "idle" }
  | { phase: "uploading" | "sending" | "processing"; blob: Blob }
  | { phase: "done"; blob: Blob; post: SocialPostView }
  | { phase: "error"; blob: Blob; message: string }
  | { phase: "slow"; blob: Blob };

const FINAL = new Set(["published", "failed", "cancelled"]);

const secondaryButton =
  "min-h-11 rounded-xl border border-ht-hairline px-4 text-sm font-black text-ht-primary disabled:opacity-50";

const readJson = async <T,>(response: Response): Promise<(T & { ok: true }) | { ok: false; error?: string; code?: string }> =>
  ((await response.json().catch(() => ({ ok: false }))) as (T & { ok: true }) | { ok: false; error?: string; code?: string });

const errorText = (post: SocialPostView): string => (post.error ? COPY.errors[post.error] : COPY.errors.failed);

const resultText = (result: string | null): string | null =>
  result && Object.hasOwn(COPY.results, result) ? COPY.results[result as keyof typeof COPY.results] : null;

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      resolve();
    });
  });

export const InstagramPostPanel = ({
  open,
  venueId,
  format,
  media,
  caption,
  templateId,
  scheduleId,
  prizeIds,
  musicId,
  connectResult,
}: InstagramPostPanelProps) => {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [sending, setSending] = useState<Sending>({ phase: "idle" });
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(resultText(connectResult));
  const pollRef = useRef<AbortController | null>(null);

  // One GET per open (and after connect / choose / disconnect). Nothing while closed.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/owner/social/instagram?venueId=${encodeURIComponent(venueId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await readJson<InstagramStatusResponse>(response);
        if (!controller.signal.aborted) setLoad(body.ok ? { status: "ready", data: body } : { status: "error" });
      } catch {
        if (!controller.signal.aborted) setLoad({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [open, venueId, reload]);

  // A closed sheet stops any Reel check; the post carries on at Meta and shows up in Recent posts.
  useEffect(() => {
    if (open) return;
    pollRef.current?.abort();
    pollRef.current = null;
  }, [open]);
  useEffect(() => () => pollRef.current?.abort(), []);

  const connection: InstagramConnectionView | null = load.status === "ready" ? load.data.connection : null;
  const left = load.status === "ready" ? load.data.postsLeftToday : 0;

  const remember = (post: SocialPostView) =>
    setLoad((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            data: {
              ...current.data,
              posts: [post, ...current.data.posts.filter((entry) => entry.id !== post.id)].slice(0, 5),
            },
          }
        : current,
    );

  const poll = async (postId: string, blob: Blob) => {
    pollRef.current?.abort();
    const controller = new AbortController();
    pollRef.current = controller;
    const started = Date.now();
    while (!controller.signal.aborted && Date.now() - started < SOCIAL_POLL_MAX_MS) {
      await sleep(SOCIAL_POLL_INTERVAL_MS, controller.signal);
      if (controller.signal.aborted) return;
      try {
        const response = await fetch(
          `/api/owner/social/posts/${encodeURIComponent(postId)}?venueId=${encodeURIComponent(venueId)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = await readJson<SocialPostResponse>(response);
        if (!body.ok) continue;
        remember(body.post);
        if (FINAL.has(body.post.status)) {
          setSending(
            body.post.status === "published" ? { phase: "done", blob, post: body.post } : { phase: "error", blob, message: errorText(body.post) },
          );
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
    }
    if (!controller.signal.aborted) setSending({ phase: "slow", blob });
  };

  const postNow = async () => {
    if (!media || !templateId || sending.phase === "uploading" || sending.phase === "sending" || sending.phase === "processing") return;
    const blob = media.blob;
    setNotice(null);
    setSending({ phase: "uploading", blob });
    const fail = (message: string) => setSending({ phase: "error", blob, message });
    try {
      const createBody: CreateSocialPostBody = {
        venueId,
        provider: "instagram",
        format,
        templateId,
        scheduleId,
        prizeIds: [...prizeIds],
        musicId,
        caption,
        withPrize: prizeIds.length > 0,
        byteSize: blob.size,
      };
      const created = await readJson<CreateSocialPostResponse>(
        await fetch("/api/owner/social/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createBody),
        }),
      );
      if (!created.ok) {
        if (created.code === "reconnect" || created.code === "not_connected") setReload((n) => n + 1);
        return fail(created.error ?? COPY.errors.failed);
      }

      // Straight to the private bucket with the signed URL (what supabase-js uploadToSignedUrl sends).
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", blob, media.fileName);
      const uploaded = await fetch(created.uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
      if (!uploaded.ok) return fail(COPY.errors.upload_missing);

      setSending({ phase: "sending", blob });
      const published = await readJson<SocialPostResponse>(
        await fetch(`/api/owner/social/posts/${encodeURIComponent(created.postId)}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ venueId }),
        }),
      );
      if (!published.ok) return fail(published.error ?? COPY.errors.failed);
      remember(published.post);
      setLoad((current) =>
        current.status === "ready" ? { status: "ready", data: { ...current.data, postsLeftToday: Math.max(0, current.data.postsLeftToday - 1) } } : current,
      );
      if (published.post.status === "published") return setSending({ phase: "done", blob, post: published.post });
      if (published.post.status === "failed") {
        if (published.post.error === "reconnect") setReload((n) => n + 1);
        return fail(errorText(published.post));
      }
      setSending({ phase: "processing", blob });
      await poll(published.post.id, blob);
    } catch {
      fail(COPY.errors.failed);
    }
  };

  const choose = async (instagramId: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/owner/social/instagram/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, instagramId }),
      });
      const body = await readJson<{ connection: InstagramConnectionView }>(response);
      setNotice(body.ok ? COPY.results.connected : (body.error ?? COPY.results.error));
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/owner/social/instagram?venueId=${encodeURIComponent(venueId)}`, { method: "DELETE" });
      const body = await readJson<{ connection: InstagramConnectionView }>(response);
      setNotice(body.ok ? null : (body.error ?? COPY.results.error));
      setConfirmDisconnect(false);
      setSending({ phase: "idle" });
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const connectHref = `/api/owner/social/meta/connect?venueId=${encodeURIComponent(venueId)}`;
  const forThisMedia = sending.phase !== "idle" && media?.blob === sending.blob ? sending : null;
  const inFlight = forThisMedia?.phase === "uploading" || forThisMedia?.phase === "sending" || forThisMedia?.phase === "processing";
  const alreadyPosted = forThisMedia?.phase === "done";

  return (
    <section className="space-y-3 rounded-2xl border border-ht-hairline p-3" aria-label={COPY.heading}>
      <h3 className="text-xs font-black uppercase tracking-[0.12em] text-ht-muted">{COPY.heading}</h3>

      {notice ? (
        <p role="status" className="text-sm font-bold text-ht-primary">
          {notice}
        </p>
      ) : null}

      {load.status === "loading" ? <HightopLoader size="sm" className="py-3" /> : null}
      {load.status === "error" ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm font-bold text-ht-rose-300">
            {COPY.loadFailed}
          </p>
          <button type="button" onClick={() => setReload((n) => n + 1)} className={secondaryButton}>
            {COPY.retry}
          </button>
        </div>
      ) : null}

      {connection?.state === "not_connected" || connection?.state === "reconnect_needed" ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ht-muted">
            {connection.state === "reconnect_needed" ? COPY.reconnectHint : COPY.intro}
          </p>
          <p className="text-xs font-semibold text-ht-muted">{COPY.requirement}</p>
          <a href={connectHref} className={`${secondaryButton} inline-flex items-center justify-center`}>
            {connection.state === "reconnect_needed" ? COPY.reconnect : COPY.connect}
          </a>
        </div>
      ) : null}

      {connection?.state === "choose_account" ? (
        <div className="space-y-2">
          <p className="text-sm font-bold text-ht-primary">{COPY.chooseHeading}</p>
          {connection.choices.map((choice) => (
            <button
              key={choice.instagramId}
              type="button"
              disabled={busy}
              onClick={() => void choose(choice.instagramId)}
              className="flex min-h-11 w-full flex-col items-start justify-center rounded-xl border border-ht-hairline bg-ht-elevated px-3 py-2 text-left disabled:opacity-50"
            >
              <span className="text-sm font-black text-ht-primary">{choice.username ? `@${choice.username}` : choice.pageName}</span>
              {choice.username && choice.pageName ? <span className="text-xs font-semibold text-ht-muted">{choice.pageName}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {connection?.state === "connected" ? (
        <div className="space-y-2">
          <p className="text-sm font-bold text-ht-primary">{COPY.connectedAs(connection.username)}</p>
          {format === "story" ? <p className="text-xs font-semibold text-ht-muted">{COPY.storyNoCaption}</p> : null}
          {format === "reel" && !media ? <p className="text-xs font-semibold text-ht-muted">{COPY.makeReelFirst}</p> : null}
          {left <= 0 ? (
            <p className="text-xs font-semibold text-ht-muted">{COPY.noneLeft}</p>
          ) : (
            <button
              type="button"
              onClick={() => void postNow()}
              disabled={!media || !templateId || inFlight || alreadyPosted}
              className={`${secondaryButton} w-full`}
            >
              {alreadyPosted ? COPY.posted : COPY.postNow(format)}
            </button>
          )}
          {forThisMedia?.phase === "uploading" || forThisMedia?.phase === "sending" || forThisMedia?.phase === "processing" ? (
            <p role="status" className="text-sm font-bold text-ht-primary">
              {COPY[forThisMedia.phase]}
            </p>
          ) : null}
          {forThisMedia?.phase === "slow" ? (
            <p role="status" className="text-sm font-semibold text-ht-muted">
              {COPY.stillProcessing}
            </p>
          ) : null}
          {forThisMedia?.phase === "done" ? (
            <p role="status" className="text-sm font-bold text-ht-primary">
              {COPY.posted}{" "}
              {forThisMedia.post.permalink ? (
                <a href={forThisMedia.post.permalink} target="_blank" rel="noopener noreferrer" className="underline">
                  {COPY.view}
                </a>
              ) : null}
            </p>
          ) : null}
          {forThisMedia?.phase === "error" ? (
            <p role="alert" className="text-sm font-bold text-ht-rose-300">
              {forThisMedia.message}
            </p>
          ) : null}
          {left > 0 ? <p className="text-xs font-semibold text-ht-muted">{COPY.leftToday(left)}</p> : null}
        </div>
      ) : null}

      {load.status === "ready" && load.data.posts.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-ht-muted">{COPY.recentHeading}</p>
          <ul className="space-y-1">
            {load.data.posts.map((post) => (
              <li key={post.id} className="flex items-center justify-between gap-2 text-sm font-semibold text-ht-primary">
                <span className="min-w-0 truncate">
                  {COPY.formats[post.format]} · {new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                {post.status === "published" && post.permalink ? (
                  <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-black underline">
                    {COPY.view}
                  </a>
                ) : (
                  <span className="shrink-0 text-xs font-bold text-ht-muted">{COPY.status[post.status]}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {connection && connection.state !== "not_connected" ? (
        confirmDisconnect ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ht-muted">{COPY.disconnectConfirm}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmDisconnect(false)} className={secondaryButton}>
                {COPY.cancel}
              </button>
              <button type="button" disabled={busy} onClick={() => void disconnect()} className={`${secondaryButton} text-ht-rose-300`}>
                {COPY.disconnect}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDisconnect(true)} className="text-xs font-bold text-ht-muted underline">
            {COPY.disconnect}
          </button>
        )
      ) : null}
    </section>
  );
};

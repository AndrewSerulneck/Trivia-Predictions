"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { HightopLoader } from "@/components/ui/HightopLoader";
import { promoCaption, type PromoCaptionInput } from "@/lib/promo/promoCaptions";
import { SOCIAL_POST_COPY as COPY } from "@/lib/promo/promoCopy";
import { SOCIAL_POLL_INTERVAL_MS, SOCIAL_POLL_MAX_MS, SOCIAL_RECENT_POSTS, socialCaptionProblem } from "@/lib/social/socialPublishRules";
import {
  providerSupportsFormat,
  type CreateSocialPostBody,
  type CreateSocialPostResponse,
  type SocialPostFormat,
  type SocialPostResponse,
  type SocialPostView,
  type SocialProvider,
  type SocialStatusResponse,
} from "@/lib/social/socialTypes";

// "Post now" to Instagram (Phase 5) and a Facebook Page (Phase 6) inside Share to social
// (docs/partner-social-promo-plan.md). NOT rendered today (D32: Share already opens Instagram on a
// phone); kept ready, behind NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED (lib/social/flags.ts), for when
// posting comes back as one small option on the sheet.
//
// Cost: ONE GET per sheet open (both connections + recent posts + today's count). Posting = 1 create +
// the file PUT straight to private storage (never through Vercel) + 1 publish, per destination; a Reel
// then checks every 10 s for at most 5 minutes (≤30 GETs, each one Graph call). Nothing runs while the
// sheet is closed.

export type SocialPostNowPanelProps = {
  open: boolean;
  venueId: string;
  format: SocialPostFormat;
  /** The finished picture or Reel; null while it is being made (or before Make Reel). */
  media: { blob: Blob; fileName: string } | null;
  /** What the suggested caption is made from; null until a game is picked. The panel owns the caption box (D38). */
  captionInput: PromoCaptionInput | null;
  templateId: string | null;
  scheduleId: string | null;
  prizeIds: readonly string[];
  musicId: string | null;
};

const PROVIDERS: readonly SocialProvider[] = ["instagram", "facebook"];

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: SocialStatusResponse };
type Sending =
  | { phase: "idle" }
  | { phase: "uploading" | "sending" | "processing"; blob: Blob }
  | { phase: "done"; blob: Blob; post: SocialPostView }
  | { phase: "error"; blob: Blob; message: string }
  | { phase: "slow"; blob: Blob };

/** One destination's connection, the same shape for both providers. */
type Destination =
  | { state: "not_connected" }
  | { state: "reconnect_needed" }
  | { state: "choose"; choices: { id: string; title: string; subtitle: string | null }[] }
  | { state: "connected"; label: string };

const FINAL = new Set(["published", "failed", "cancelled"]);
const IDLE: Record<SocialProvider, Sending> = { instagram: { phase: "idle" }, facebook: { phase: "idle" } };

const secondaryButton =
  "min-h-11 rounded-xl border border-ht-hairline px-4 text-sm font-black text-ht-primary disabled:opacity-50";

type Refusal = { ok: false; error?: string; code?: string };

const readJson = async <T,>(response: Response): Promise<(T & { ok: true }) | Refusal> =>
  ((await response.json().catch(() => ({ ok: false }))) as (T & { ok: true }) | Refusal);

/**
 * The publish step's answer doesn't say the post didn't go out (Phase 19): the route's `unsure` (it failed after
 * the claim), or no readable answer at all (the connection dropped, or the request was stopped mid-call). Our
 * route words every clear refusal (`error`). The panel then polls the post; it never offers "try again".
 */
const publishUnclear = (answer: Refusal | null): boolean => answer === null || answer.code === "unsure" || !answer.error;

const errorText = (post: SocialPostView): string => {
  if (post.error === "unconfirmed") return COPY.errors.unconfirmed(COPY.providers[post.provider]);
  return post.error ? COPY.errors[post.error] : COPY.errors.failed;
};

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

const destinationOf = (data: SocialStatusResponse, provider: SocialProvider): Destination => {
  if (provider === "instagram") {
    const view = data.instagram;
    if (view.state === "choose_account") {
      return {
        state: "choose",
        choices: view.choices.map((choice) => ({
          id: choice.instagramId,
          title: choice.username ? `@${choice.username}` : (choice.pageName ?? choice.instagramId),
          subtitle: choice.username ? choice.pageName : null,
        })),
      };
    }
    if (view.state === "connected") return { state: "connected", label: COPY.connectedAs.instagram(view.username) };
    return { state: view.state };
  }
  const view = data.facebook;
  if (view.state === "choose_page") {
    return { state: "choose", choices: view.choices.map((choice) => ({ id: choice.pageId, title: choice.pageName ?? choice.pageId, subtitle: null })) };
  }
  if (view.state === "connected") return { state: "connected", label: COPY.connectedAs.facebook(view.pageName) };
  return { state: view.state };
};

export const SocialPostNowPanel = ({
  open,
  venueId,
  format,
  media,
  captionInput,
  templateId,
  scheduleId,
  prizeIds,
  musicId,
}: SocialPostNowPanelProps) => {
  // The panel reads its own connect result (`?socialResult=` after Meta sends the partner back), only for this
  // venue, so nothing outside it has to remember the wiring (Phase 16). DashboardBody is inside the dashboard's
  // Suspense boundary.
  const searchParams = useSearchParams();
  const connectResult = searchParams.get("socialVenue") === venueId ? searchParams.get("socialResult") : null;
  const suggestedCaption = captionInput ? promoCaption(captionInput) : "";
  const [edited, setEdited] = useState<{ base: string; text: string } | null>(null);
  // An edit is kept only while the suggestion it was made from still stands (a new game / prize tick restarts it).
  const caption = edited && edited.base === suggestedCaption ? edited.text : suggestedCaption;
  // Per provider (Phase 20): Instagram's hashtag / @ limits don't block Facebook. Stories have no caption.
  const captionProblems: Record<SocialProvider, string | null> = {
    instagram: format === "story" ? null : socialCaptionProblem(caption, "instagram"),
    facebook: format === "story" ? null : socialCaptionProblem(caption, "facebook"),
  };
  const captionMessages = [...new Set(Object.values(captionProblems).filter((problem): problem is string => Boolean(problem)))];
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [sending, setSending] = useState<Record<SocialProvider, Sending>>(IDLE);
  const [confirmDisconnect, setConfirmDisconnect] = useState<SocialProvider | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(resultText(connectResult));
  const pollRefs = useRef<Partial<Record<SocialProvider, AbortController>>>({});

  // The notice is read once, then the two connect params leave the URL (Phase 20), so it doesn't come back when the
  // panel remounts or the page reloads. `sheet=social` stays. replaceState, not router.push: a sheet step is never
  // pushed (navigation plan), and `history.state` is kept as PartnerMessageSheet does.
  useEffect(() => {
    if (!connectResult) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("socialResult");
    url.searchParams.delete("socialVenue");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [connectResult]);

  // One GET per open (and after connect / choose / disconnect). Nothing while closed.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/owner/social/status?venueId=${encodeURIComponent(venueId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await readJson<SocialStatusResponse>(response);
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
    for (const controller of Object.values(pollRefs.current)) controller?.abort();
    pollRefs.current = {};
  }, [open]);
  useEffect(() => () => Object.values(pollRefs.current).forEach((controller) => controller?.abort()), []);

  const left = load.status === "ready" ? load.data.postsLeftToday : 0;
  const setFor = (provider: SocialProvider, next: Sending) => setSending((current) => ({ ...current, [provider]: next }));

  const remember = (post: SocialPostView) =>
    setLoad((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            data: { ...current.data, posts: [post, ...current.data.posts.filter((entry) => entry.id !== post.id)].slice(0, SOCIAL_RECENT_POSTS) },
          }
        : current,
    );

  const poll = async (provider: SocialProvider, postId: string, blob: Blob) => {
    pollRefs.current[provider]?.abort();
    const controller = new AbortController();
    pollRefs.current[provider] = controller;
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
          setFor(
            provider,
            body.post.status === "published" ? { phase: "done", blob, post: body.post } : { phase: "error", blob, message: errorText(body.post) },
          );
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
    }
    if (!controller.signal.aborted) setFor(provider, { phase: "slow", blob });
  };

  const postNow = async (provider: SocialProvider) => {
    const current = sending[provider];
    if (!media || !templateId || captionProblems[provider] || current.phase === "uploading" || current.phase === "sending" || current.phase === "processing") return;
    // Still waiting on Meta's answer for this very picture / Reel (Phase 19): another tap could post it twice.
    if (current.phase === "slow" && current.blob === media.blob) return;
    const blob = media.blob;
    setNotice(null);
    setFor(provider, { phase: "uploading", blob });
    const fail = (message: string) => setFor(provider, { phase: "error", blob, message });
    try {
      const createBody: CreateSocialPostBody = {
        venueId,
        provider,
        format,
        templateId,
        scheduleId,
        prizeIds: [...prizeIds],
        musicId,
        caption: format === "story" ? "" : caption,
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

      setFor(provider, { phase: "sending", blob });
      const usedOne = () =>
        setLoad((state) =>
          state.status === "ready" ? { status: "ready", data: { ...state.data, postsLeftToday: Math.max(0, state.data.postsLeftToday - 1) } } : state,
        );
      let published: (SocialPostResponse & { ok: true }) | Refusal | null;
      try {
        published = await readJson<SocialPostResponse>(
          await fetch(`/api/owner/social/posts/${encodeURIComponent(created.postId)}/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ venueId }),
          }),
        );
      } catch {
        published = null;
      }
      if (published === null || !published.ok) {
        if (!publishUnclear(published)) return fail(published?.error ?? COPY.errors.failed);
        // Meta may already have it (Phase 19): wait for the post's own answer, like "processing". The Post button
        // stays off until it is final, so a second tap can't post it twice.
        usedOne();
        setFor(provider, { phase: "processing", blob });
        await poll(provider, created.postId, blob);
        return;
      }
      remember(published.post);
      usedOne();
      if (published.post.status === "published") return setFor(provider, { phase: "done", blob, post: published.post });
      if (published.post.status === "failed") {
        if (published.post.error === "reconnect") setReload((n) => n + 1);
        return fail(errorText(published.post));
      }
      setFor(provider, { phase: "processing", blob });
      await poll(provider, published.post.id, blob);
    } catch {
      fail(COPY.errors.failed);
    }
  };

  const choose = async (provider: SocialProvider, id: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/owner/social/${provider}/choose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(provider === "facebook" ? { venueId, pageId: id } : { venueId, instagramId: id }),
      });
      const body = await readJson<object>(response);
      setNotice(body.ok ? COPY.results.connected : (body.error ?? COPY.results.error));
      setReload((n) => n + 1);
    } catch {
      setNotice(COPY.results.error);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (provider: SocialProvider) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/owner/social/${provider}?venueId=${encodeURIComponent(venueId)}`, { method: "DELETE" });
      const body = await readJson<{ connection: unknown }>(response);
      if (!body.ok) {
        // Keep the confirm open so the partner can try again.
        setNotice(body.error ?? COPY.results.error);
        return;
      }
      setNotice(null);
      setConfirmDisconnect(null);
      setFor(provider, { phase: "idle" });
      setReload((n) => n + 1);
    } catch {
      setNotice(COPY.results.error);
    } finally {
      setBusy(false);
    }
  };

  const connectHref = `/api/owner/social/meta/connect?venueId=${encodeURIComponent(venueId)}`;
  const destinations = load.status === "ready" ? PROVIDERS.map((provider) => ({ provider, destination: destinationOf(load.data, provider) })) : [];
  const nothingConnected = destinations.length > 0 && destinations.every((entry) => entry.destination.state === "not_connected");

  const renderDestination = (provider: SocialProvider, destination: Destination) => {
    const name = COPY.providers[provider];
    const state = sending[provider];
    const forThisMedia = state.phase !== "idle" && media?.blob === state.blob ? state : null;
    const inFlight = forThisMedia?.phase === "uploading" || forThisMedia?.phase === "sending" || forThisMedia?.phase === "processing";
    // No answer yet after the poll's 5 minutes: it may still go live, so the same media isn't offered again (Phase 19).
    const stillWaiting = forThisMedia?.phase === "slow";
    const alreadyPosted = forThisMedia?.phase === "done";
    const supported = providerSupportsFormat(provider, format);

    return (
      <div key={provider} className="space-y-2 border-t border-ht-hairline pt-3 first:border-t-0 first:pt-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-caption font-black uppercase tracking-wider text-ht-muted">{COPY.rowHeading[provider]}</p>
          {destination.state === "connected" ? (
            <p className="min-w-0 truncate text-sm font-bold text-ht-primary">{destination.label}</p>
          ) : null}
        </div>

        {destination.state === "not_connected" || destination.state === "reconnect_needed" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ht-muted">
              {destination.state === "reconnect_needed" ? COPY.reconnectHint(name) : COPY.notConnected}
            </p>
            <a href={connectHref} className={`${secondaryButton} inline-flex shrink-0 items-center justify-center`}>
              {destination.state === "reconnect_needed" ? COPY.reconnect : COPY.connectOne}
            </a>
          </div>
        ) : null}

        {destination.state === "choose" ? (
          <div className="space-y-2">
            <p className="text-sm font-bold text-ht-primary">{COPY.chooseHeading[provider]}</p>
            {destination.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                disabled={busy}
                onClick={() => void choose(provider, choice.id)}
                className="flex min-h-11 w-full flex-col items-start justify-center rounded-xl border border-ht-hairline bg-ht-elevated px-3 py-2 text-left disabled:opacity-50"
              >
                <span className="text-sm font-black text-ht-primary">{choice.title}</span>
                {choice.subtitle ? <span className="text-xs font-semibold text-ht-muted">{choice.subtitle}</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        {destination.state === "connected" ? (
          <>
            {!supported ? <p className="text-xs font-semibold text-ht-muted">{COPY.facebookNoStory}</p> : null}
            {supported && provider === "instagram" && format === "story" ? (
              <p className="text-xs font-semibold text-ht-muted">{COPY.storyNoCaption}</p>
            ) : null}
            {supported && format === "reel" && !media ? <p className="text-xs font-semibold text-ht-muted">{COPY.makeReelFirst}</p> : null}
            {supported && left > 0 ? (
              <button
                type="button"
                onClick={() => void postNow(provider)}
                disabled={!media || !templateId || Boolean(captionProblems[provider]) || inFlight || stillWaiting || alreadyPosted}
                className={`${secondaryButton} w-full`}
              >
                {alreadyPosted ? COPY.posted(name) : COPY.postNow(name, format)}
              </button>
            ) : null}
            {forThisMedia?.phase === "uploading" ? (
              <p role="status" className="text-sm font-bold text-ht-primary">
                {COPY.uploading}
              </p>
            ) : null}
            {forThisMedia?.phase === "sending" || forThisMedia?.phase === "processing" ? (
              <p role="status" className="text-sm font-bold text-ht-primary">
                {COPY[forThisMedia.phase](name)}
              </p>
            ) : null}
            {forThisMedia?.phase === "slow" ? (
              <p role="status" className="text-sm font-semibold text-ht-muted">
                {COPY.stillProcessing(name)}
              </p>
            ) : null}
            {forThisMedia?.phase === "done" && forThisMedia.post.permalink ? (
              <a href={forThisMedia.post.permalink} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-ht-primary underline">
                {COPY.view(name)}
              </a>
            ) : null}
            {forThisMedia?.phase === "error" ? (
              <p role="alert" className="text-sm font-bold text-ht-rose-300">
                {forThisMedia.message}
              </p>
            ) : null}
          </>
        ) : null}

        {destination.state !== "not_connected" ? (
          confirmDisconnect === provider ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ht-muted">{COPY.disconnectConfirm(name)}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setConfirmDisconnect(null); setNotice(null); }} className={secondaryButton}>
                  {COPY.cancel}
                </button>
                <button type="button" disabled={busy} onClick={() => void disconnect(provider)} className={`${secondaryButton} text-ht-rose-300`}>
                  {COPY.disconnect}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDisconnect(provider)} className="text-xs font-bold text-ht-muted underline">
              {COPY.disconnect}
            </button>
          )
        ) : null}
      </div>
    );
  };

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

      {!nothingConnected && load.status === "ready" && format !== "story" ? (
        <div className="space-y-1">
          <label htmlFor="post-now-caption" className="block text-caption font-black uppercase tracking-wider text-ht-muted">
            {COPY.captionLabel}
          </label>
          <textarea
            id="post-now-caption"
            value={caption}
            rows={5}
            onChange={(event) => setEdited({ base: suggestedCaption, text: event.target.value })}
            className="w-full rounded-xl border border-ht-hairline bg-ht-elevated px-3 py-2 text-sm font-semibold text-ht-primary"
          />
          {captionMessages.map((message) => (
            <p key={message} role="alert" className="text-sm font-bold text-ht-rose-300">
              {message}
            </p>
          ))}
        </div>
      ) : null}

      {nothingConnected ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ht-muted">{COPY.intro}</p>
          <p className="text-xs font-semibold text-ht-muted">{COPY.requirement}</p>
          <a href={connectHref} className={`${secondaryButton} inline-flex items-center justify-center`}>
            {COPY.connect}
          </a>
        </div>
      ) : (
        destinations.map((entry) => renderDestination(entry.provider, entry.destination))
      )}

      {load.status === "ready" && !nothingConnected ? (
        <p className="text-xs font-semibold text-ht-muted">{left > 0 ? COPY.leftToday(left) : COPY.noneLeft}</p>
      ) : null}

      {load.status === "ready" && load.data.posts.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-ht-muted">{COPY.recentHeading}</p>
          <ul className="space-y-1">
            {load.data.posts.map((post) => (
              <li key={post.id} className="flex items-center justify-between gap-2 text-sm font-semibold text-ht-primary">
                <span className="min-w-0 truncate">
                  {COPY.providers[post.provider]} · {COPY.formats[post.format]} ·{" "}
                  {new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                {post.status === "published" && post.permalink ? (
                  <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-black underline">
                    {COPY.view(COPY.providers[post.provider])}
                  </a>
                ) : (
                  <span className="shrink-0 text-xs font-bold text-ht-muted">
                    {post.status === "failed" && post.error === "unconfirmed" ? COPY.notConfirmed : COPY.status[post.status]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

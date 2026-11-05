"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionLoad } from "@/components/owner/dashboard/LiveGamesSection";
import { fetchVenueShareDetails, patchVenueShareDetails } from "@/lib/venueShareDetailsClient";
import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";
import { HightopLoader } from "@/components/ui/HightopLoader";
import type { OwnerCompetition } from "@/lib/ownerRewardDisplay";
import { PROMO_SIZES, SHARE_SOCIAL_COPY as COPY, type PromoSize } from "@/lib/promo/promoCopy";
import type { PromoFormat } from "@/lib/promo/promoEndCard";
import { prizesForGame } from "@/lib/promo/promoPrizes";
import { renderPromoPicture } from "@/lib/promo/promoRender";
import type { ReelInput, ReelScene } from "@/lib/promo/promoReelRender";
import { canMakeReel } from "@/lib/promo/promoReelSupport";
import { DEFAULT_PROMO_MUSIC_ID, PROMO_MUSIC } from "@/lib/promo/promoSounds";
import { promoFocusOption, promoOptions, type PromoFocus } from "@/lib/promo/promoSubjects";
import { promoTemplateFor } from "@/lib/promo/promoTemplates";
import { saveStoryImageToDownloads } from "@/lib/socialShare/platform/webStoryPlatform";
import { canShareStoryFile, createStoryShareFile, shareStoryImage } from "@/lib/socialShare/sharePipeline";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";
import {
  formatInstagramHandle,
  INSTAGRAM_HANDLE_INVALID_MESSAGE,
  parseInstagramHandle,
  SHARE_DETAILS_COPY,
  type VenueShareDetails,
} from "@/lib/venueShareDetails";
import type { OwnerSchedule } from "@/types";

// Share to social (docs/partner-social-promo-plan.md Phases 1–2, `?sheet=social`). ONE screen: pick a
// game, tick the prizes to show, pick Post, Story or Reel (+ music), check the preview, then
// Share or Download. One design per game, so there is no "pick a design" step (plan §4.4).
//
// "On the picture" ticks (prizes, bar name, address, Instagram handle) are for this post only; they never change
// the venue's "On shared pictures" setting for players' share pictures (Andrew, 2026-11-04). The one
// write is saving a handle when the venue has none yet. The Instagram "Post now" box was removed from
// this sheet (Andrew, 2026-11-04); its code (SocialPostNowPanel: Instagram + Facebook Page, lib/social/*) stays, switched off.
// To bring it back (Phase 16: one switch): set SOCIAL_POST_NOW_ON_SHEET = true in lib/social/flags.ts and render, under
// the Share / Download buttons when that flag is on (Phase 19: only through postNowProps, which is unit-tested):
//   <SocialPostNowPanel {...postNowProps({ open, venueId, venueName, isReel, pictureFormat: format, musicId, media, option, template, shownPrizes })} />
// Never pass `format` or `pictureVenueName` straight through: `format` is "story" while a Reel is picked, and the
// caption names the bar even with "Bar name" unticked (components/owner/social/postNowProps.ts).
// The panel reads its own connect result and owns its caption box; the sheet stays caption-free with Post now off (D34).
//
// Cost: no request of its own. The games and prizes are the dashboard's already-loaded lists, the
// venue's saved handle is ShareDetailsPanel's one cached GET, and the picture and Reel are made
// on the partner's device (lib/promo/promoRender.ts, lib/promo/promoReelRender.ts). A Reel's only
// downloads are the video library (loaded on the first preview or Make Reel) and two small sound
// files, both cached by the browser.

export type ShareToSocialSheetProps = {
  nav: UseOwnerSheetResult;
  venueId: string;
  venueName: string;
  games: SectionLoad<OwnerSchedule>;
  rewards: SectionLoad<OwnerCompetition>;
  /** "Now" for upcoming-vs-past, as the dashboard stamped it. */
  nowMs: number;
  /** The game or prize just created: the sheet opens on it (plan §4.5). Null = the first game. */
  focus?: PromoFocus | null;
};

type Media = { blob: Blob; url: string; fileName: string; fileType: string; canShare: boolean };
type Picture = { key: string; blob: Blob; url: string; canShare: boolean };
type Reel =
  | { key: string; status: "making"; progress: number }
  | { key: string; status: "ready"; media: Media }
  | { key: string; status: "error"; unsupported: boolean };

const loadReelRenderer = () => import("@/lib/promo/promoReelRender");

const newAudioContext = (): AudioContext | null => {
  const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  try {
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
};

const chipClass = (on: boolean): string =>
  `flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm font-bold transition ${
    on ? "border-ht-cyan-500 bg-ht-cyan-500/10 text-ht-primary" : "border-ht-hairline bg-ht-elevated text-ht-muted"
  }`;

const Check = ({ on }: { on: boolean }) => (
  <span
    aria-hidden="true"
    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-caption font-black ${
      on ? "border-ht-cyan-500 bg-ht-cyan-500 text-slate-950" : "border-ht-hairline text-transparent"
    }`}
  >
    ✓
  </span>
);

/** A tick's label ("Bar name") over what it puts on the picture ("The Pour House"). */
const Labelled = ({ label, value, note }: { label: string; value?: string; note?: string }) => (
  <span className="min-w-0">
    <span className="block text-caption font-black uppercase tracking-wider text-ht-muted">{label}</span>
    {value ? <span className="block break-words text-ht-primary">{value}</span> : null}
    {note ? <span className="block break-words text-xs font-semibold text-ht-muted">{note}</span> : null}
  </span>
);

const Heading = ({ children }: { children: string }) => (
  <h3 className="text-xs font-black uppercase tracking-[0.12em] text-ht-muted">{children}</h3>
);

export const ShareToSocialSheet = ({
  nav,
  venueId,
  venueName,
  games,
  rewards,
  nowMs,
  focus = null,
}: ShareToSocialSheetProps) => {
  const open = nav.sheet === "social";
  const [optionKey, setOptionKey] = useState<string | null>(null);
  const [hiddenPrizeIds, setHiddenPrizeIds] = useState<readonly string[]>([]);
  const [size, setSize] = useState<PromoSize>("post");
  const [musicId, setMusicId] = useState<string | null>(DEFAULT_PROMO_MUSIC_ID || null);
  const [reelSupported, setReelSupported] = useState<boolean | null>(null);
  const [reel, setReel] = useState<Reel | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [loadedDetails, setLoadedDetails] = useState<{ venueId: string; details: VenueShareDetails } | null>(null);
  const [detailsLoad, setDetailsLoad] = useState<{ venueId: string; state: "error" } | null>(null);
  const [detailsAttempt, setDetailsAttempt] = useState(0);
  // The ticks are "this post only" (D33/D36): they start name on, handle on when saved, address off, whatever the
  // venue's "On shared pictures" setting (for players' pictures) says. Pinned in tests/components.share-to-social-sheet.test.ts.
  const [showName, setShowName] = useState(true);
  const [showAddress, setShowAddress] = useState(false);
  /** null = the default: on when the venue has a handle saved. */
  const [showHandle, setShowHandle] = useState<boolean | null>(null);
  const [handleDraft, setHandleDraft] = useState("");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [savingHandle, setSavingHandle] = useState(false);
  const [picture, setPicture] = useState<Picture | null>(null);
  const [renderError, setRenderError] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sceneRef = useRef<{ key: string; scene: Promise<ReelScene> } | null>(null);
  const stopPreviewRef = useRef<(() => void) | null>(null);

  // A closed sheet starts fresh next time (adjust-during-render, react-hooks/set-state-in-effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setOptionKey(null);
      setHiddenPrizeIds([]);
      setShowName(true);
      setShowAddress(false);
      setShowHandle(null);
      setHandleDraft("");
      setHandleError(null);
      setSize("post");
      setMusicId(DEFAULT_PROMO_MUSIC_ID || null);
      setReel(null);
      setPreviewKey(null);
      setNotice("");
      setRenderError(false);
    }
  }

  const ready = games.status === "ready" && rewards.status === "ready";
  const failed = games.status === "error" || rewards.status === "error";
  const prizeSources = useMemo(() => (rewards.status === "ready" ? rewards.items : []), [rewards]);
  const options = useMemo(
    () => promoOptions({ schedules: games.status === "ready" ? games.items : [], prizes: prizeSources, nowMs }),
    [games, prizeSources, nowMs],
  );
  const focusOption = useMemo(() => promoFocusOption(options, prizeSources, focus), [options, prizeSources, focus]);
  const option = options.find((entry) => entry.key === optionKey) ?? focusOption ?? options[0] ?? null;
  const template = option ? promoTemplateFor(option.game) : null;
  const gamePrizes = useMemo(
    () => (option ? prizesForGame(prizeSources, option.game, option.scheduleId) : []),
    [option, prizeSources],
  );
  const shownPrizes = gamePrizes.filter((prize) => !hiddenPrizeIds.includes(prize.id));
  const details = loadedDetails?.venueId === venueId ? loadedDetails.details : null;
  const detailsFailed = !details && detailsLoad?.venueId === venueId;
  const savedHandle = details?.instagramHandle ?? null;
  const handleOn = showHandle ?? Boolean(savedHandle);
  const draftHandle = parseInstagramHandle(handleDraft);
  const typedHandle = draftHandle.ok ? draftHandle.handle : null;
  const pictureVenueName = showName ? venueName : null;
  const venueAddress = details?.address ?? null;
  const pictureAddress = showAddress ? venueAddress : null;
  // Only a SAVED handle goes on the picture or Reel (Phase 17): typing never redraws or discards a finished Reel.
  const handle = handleOn ? savedHandle : null;


  // A Reel's still preview (and its poster) is the Story picture: the Reel ends on that very frame.
  const format: PromoFormat = size === "reel" ? "story" : size;
  const renderKey = JSON.stringify([option?.key, format, shownPrizes.map((prize) => prize.id), pictureVenueName, pictureAddress, handle, renderAttempt]);
  const showPicture = picture?.key === renderKey ? picture : null;
  const isReel = size === "reel" && reelSupported === true;
  const reelKey = JSON.stringify([option?.key, shownPrizes.map((prize) => prize.id), pictureVenueName, pictureAddress, handle, musicId]);
  const currentReel = reel?.key === reelKey ? reel : null;
  const readyReel = currentReel?.status === "ready" ? currentReel.media : null;
  const previewing = isReel && previewKey === reelKey;
  const sizes = PROMO_SIZES.filter((entry) => entry !== "reel" || reelSupported === true);

  // Draw the picture whenever what it shows changes. On the device; nothing is sent anywhere.
  useEffect(() => {
    if (!open || !option || !template) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      renderPromoPicture({
        format,
        template,
        when: option.when,
        venueName: pictureVenueName,
        venueAddress: pictureAddress,
        instagramHandle: handle,
        prizes: shownPrizes,
      }).then(
        (blob) => {
          if (cancelled) return;
          const file = createStoryShareFile({ blob, fileName: "preview.jpg", fileType: "image/jpeg" });
          setRenderError(false);
          setPicture({ key: renderKey, blob, url: URL.createObjectURL(blob), canShare: canShareStoryFile(file) });
        },
        () => {
          if (!cancelled) setRenderError(true);
        },
      );
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // renderKey captures every input the picture shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, renderKey]);

  // Each picture's / Reel's object URL is released when it is replaced or the sheet unmounts.
  useEffect(() => {
    const url = picture?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [picture?.url]);
  const reelUrl = reel?.status === "ready" ? reel.media.url : null;
  useEffect(
    () => () => {
      if (reelUrl) URL.revokeObjectURL(reelUrl);
    },
    [reelUrl],
  );

  // The venue's saved Instagram handle: ShareDetailsPanel's cached GET, at most one per venue per visit.
  useEffect(() => {
    if (!open || !venueId) return;
    let cancelled = false;
    fetchVenueShareDetails(venueId).then(
      (next) => {
        if (cancelled) return;
        setLoadedDetails({ venueId, details: next });
        setDetailsLoad(null);
      },
      () => {
        if (!cancelled) setDetailsLoad({ venueId, state: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, venueId, detailsAttempt]);

  // Can this browser make video? Checked once, with nothing downloaded (lib/promo/promoReelSupport.ts).
  useEffect(() => {
    if (!open || reelSupported !== null) return;
    let cancelled = false;
    void canMakeReel().then((ok) => {
      if (!cancelled) setReelSupported(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [open, reelSupported]);

  const haltPreview = useCallback(() => {
    const stop = stopPreviewRef.current;
    stopPreviewRef.current = null;
    stop?.();
  }, []);

  // A changed Reel (game, prizes, name, music), another size or a closed sheet stops the preview and
  // cancels a Reel being made: it would no longer match what the partner picked.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
      haltPreview();
    },
    [open, size, reelKey, haltPreview],
  );

  const reelInput: ReelInput | null =
    option && template
      ? { template, when: option.when, venueName: pictureVenueName, venueAddress: pictureAddress, instagramHandle: handle, prizes: shownPrizes, musicId }
      : null;

  /** One prepared Reel (fonts, sounds, layout, mix) per choice, shared by the preview and Make Reel. */
  const sceneFor = (key: string, input: ReelInput): Promise<ReelScene> => {
    if (sceneRef.current?.key === key) return sceneRef.current.scene;
    const scene = loadReelRenderer().then((renderer) => renderer.prepareReel(input));
    sceneRef.current = { key, scene };
    scene.catch(() => {
      if (sceneRef.current?.scene === scene) sceneRef.current = null;
    });
    return scene;
  };

  const playPreview = async () => {
    if (!reelInput) return;
    haltPreview();
    // Made in the tap itself, before any await: iPhones only play sound started from a tap.
    const audio = newAudioContext();
    void audio?.resume().catch(() => undefined);
    const key = reelKey;
    let player: (() => void) | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      player?.();
      void audio?.close().catch(() => undefined);
      setPreviewKey((current) => (current === key ? null : current));
    };
    stopPreviewRef.current = finish;
    setPreviewKey(key);
    try {
      const renderer = await loadReelRenderer();
      const scene = await sceneFor(key, reelInput);
      const canvas = previewCanvasRef.current;
      if (done || !canvas) return finish();
      player = await renderer.playReelPreview(scene, canvas, audio, finish);
      if (done) player();
    } catch {
      finish();
      setReel({ key, status: "error", unsupported: false });
    }
  };

  const makeReel = async () => {
    if (!reelInput || !template) return;
    haltPreview();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const key = reelKey;
    setReel({ key, status: "making", progress: 0 });
    try {
      const renderer = await loadReelRenderer();
      const scene = await sceneFor(key, reelInput);
      const blob = await renderer.encodeReel(scene, {
        signal: controller.signal,
        onProgress: (progress) =>
          setReel((current) => (current?.key === key && current.status === "making" ? { ...current, progress } : current)),
      });
      if (controller.signal.aborted) throw new DOMException("Reel cancelled.", "AbortError");
      const fileName = `hightop-${template.fileSlug}-reel.mp4`;
      const file = createStoryShareFile({ blob, fileName, fileType: "video/mp4" });
      setReel({
        key,
        status: "ready",
        media: { blob, url: URL.createObjectURL(blob), fileName, fileType: "video/mp4", canShare: canShareStoryFile(file) },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        // Left behind by a change: clear it so coming back to this choice offers Make Reel again.
        setReel((current) => (current?.key === key && current.status === "making" ? null : current));
      } else {
        setReel({ key, status: "error", unsupported: error instanceof Error && error.name === "ReelUnsupportedError" });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const pictureFileName = template ? `hightop-${template.fileSlug}-${format}.jpg` : "hightop-post.jpg";
  const media: Media | null = isReel
    ? readyReel
    : showPicture
      ? { blob: showPicture.blob, url: showPicture.url, fileName: pictureFileName, fileType: "image/jpeg", canShare: showPicture.canShare }
      : null;

  const share = async () => {
    if (!media || busy) return;
    setBusy(true);
    // No caption: partners write their own in Instagram after Share or Download (Andrew, 2026-11-04).
    const result = await shareStoryImage({
      blob: media.blob,
      fileName: media.fileName,
      fileType: media.fileType,
      title: template?.name,
    });
    if (result.status === "shared") setNotice("");
    else if (result.status === "unsupported" || result.status === "failed") {
      saveStoryImageToDownloads({ blob: media.blob, fileName: media.fileName });
      setNotice(COPY.shareUnavailable);
    }
    setBusy(false);
  };

  const download = async () => {
    if (!media) return;
    const saved = saveStoryImageToDownloads({ blob: media.blob, fileName: media.fileName });
    setNotice(saved.status === "saved" ? COPY.saved : isReel ? COPY.reelFailed : COPY.renderFailed);
  };

  /** Saves a first handle for the venue (players' "On shared pictures" choices are sent back unchanged). */
  const saveHandle = async () => {
    if (!details || savingHandle) return;
    if (!typedHandle) {
      setHandleError(INSTAGRAM_HANDLE_INVALID_MESSAGE);
      return;
    }
    const savingVenueId = venueId;
    setSavingHandle(true);
    setHandleError(null);
    try {
      const saved = await patchVenueShareDetails(savingVenueId, { ...details, instagramHandle: typedHandle });
      setLoadedDetails({ venueId: savingVenueId, details: saved });
      setHandleDraft("");
    } catch (error) {
      setHandleError(error instanceof Error ? error.message : SHARE_DETAILS_COPY.saveFailed);
    } finally {
      setSavingHandle(false);
    }
  };

  const togglePrize = (id: string) =>
    setHiddenPrizeIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  return (
    <OwnerSheet open={open} onRequestClose={nav.closeSheet} eyebrow={venueName} title={COPY.sheetTitle} size="tall">
      <div className="space-y-5">
        <p className="text-sm font-semibold text-ht-muted">{COPY.intro}</p>

        {!ready && !failed ? <HightopLoader size="sm" className="py-6" /> : null}
        {failed ? (
          <p role="alert" className="text-sm font-bold text-ht-rose-300">
            {COPY.loadFailed}
          </p>
        ) : null}
        {ready && options.length === 0 ? (
          <p role="status" className="text-sm font-bold text-ht-muted">
            {COPY.noGames}
          </p>
        ) : null}

        {ready && option && template ? (
          <>
            <section className="space-y-2" aria-label={COPY.gameHeading}>
              <Heading>{COPY.gameHeading}</Heading>
              <div className="space-y-2">
                {options.map((entry) => {
                  const on = entry.key === option.key;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setOptionKey(entry.key);
                        setHiddenPrizeIds([]);
                        setNotice("");
                      }}
                      className={chipClass(on)}
                    >
                      <span className="min-w-0 break-words">{entry.label}</span>
                      <Check on={on} />
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2" aria-label={COPY.pictureHeading}>
              <Heading>{COPY.pictureHeading}</Heading>
              <div className="space-y-2">
                {gamePrizes.map((prize) => {
                  const on = !hiddenPrizeIds.includes(prize.id);
                  return (
                    <button
                      key={prize.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => togglePrize(prize.id)}
                      className={chipClass(on)}
                    >
                      <Labelled label={COPY.prizeLabel} value={prize.headline} note={prize.howToWin} />
                      <Check on={on} />
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-pressed={showName}
                  onClick={() => setShowName((on) => !on)}
                  className={chipClass(showName)}
                >
                  <Labelled label={COPY.nameLabel} value={venueName} />
                  <Check on={showName} />
                </button>
                {venueAddress ? (
                  <button
                    type="button"
                    aria-pressed={showAddress}
                    onClick={() => setShowAddress((on) => !on)}
                    className={chipClass(showAddress)}
                  >
                    <Labelled label={COPY.addressLabel} value={venueAddress} />
                    <Check on={showAddress} />
                  </button>
                ) : null}
                {detailsFailed ? (
                  <div role="alert" className="flex items-center justify-between gap-3">
                    <p className="text-footnote font-semibold text-ht-muted">{COPY.detailsLoadFailed}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setDetailsLoad(null);
                        setDetailsAttempt((n) => n + 1);
                      }}
                      className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-black text-ht-cyan-300"
                    >
                      {COPY.detailsRetry}
                    </button>
                  </div>
                ) : null}
                {details ? (
                  <button
                    type="button"
                    aria-pressed={handleOn}
                    onClick={() => {
                      setShowHandle(!handleOn);
                      setHandleError(null);
                    }}
                    className={chipClass(handleOn)}
                  >
                    <Labelled
                      label={COPY.instagramHandle}
                      value={savedHandle ? formatInstagramHandle(savedHandle) : undefined}
                    />
                    <Check on={handleOn} />
                  </button>
                ) : null}
                {details && handleOn && !savedHandle ? (
                  <div className="space-y-1">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        aria-label={COPY.instagramHandle}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={handleDraft}
                        onChange={(event) => {
                          setHandleDraft(event.target.value);
                          setHandleError(null);
                        }}
                        placeholder={SHARE_DETAILS_COPY.handlePlaceholder}
                        className="min-w-0 flex-1 rounded-xl border border-ht-hairline bg-ht-elevated px-3 py-2.5 text-base font-semibold text-ht-primary"
                      />
                      <button
                        type="button"
                        onClick={() => void saveHandle()}
                        disabled={savingHandle || !typedHandle}
                        className="min-h-11 shrink-0 rounded-xl border border-ht-hairline px-4 text-sm font-black text-ht-primary disabled:opacity-50"
                      >
                        {savingHandle ? COPY.savingHandle : COPY.saveHandle}
                      </button>
                    </div>
                    {handleError || !draftHandle.ok ? (
                      <p role="alert" className="text-xs font-bold text-ht-rose-300">
                        {handleError ?? INSTAGRAM_HANDLE_INVALID_MESSAGE}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="space-y-2" aria-label={COPY.formatHeading}>
              <Heading>{COPY.formatHeading}</Heading>
              <div className={`grid gap-2 ${sizes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {sizes.map((entry) => {
                  const on = entry === size;
                  return (
                    <button
                      key={entry}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setSize(entry);
                        setNotice("");
                      }}
                      className={`min-h-12 rounded-xl border px-3 py-2 text-center text-sm font-black ${
                        on ? "border-ht-cyan-500 bg-ht-cyan-500/10 text-ht-primary" : "border-ht-hairline bg-ht-elevated text-ht-muted"
                      }`}
                    >
                      <span className="block">{COPY.formats[entry]}</span>
                      <span className="block text-xs font-semibold text-ht-muted">{COPY.formatHints[entry]}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {isReel ? (
              <section className="space-y-2" aria-label={COPY.musicHeading}>
                <Heading>{COPY.musicHeading}</Heading>
                <div className="grid grid-cols-2 gap-2">
                  {[...PROMO_MUSIC.map((track) => ({ id: track.id as string | null, name: track.name })), { id: null, name: COPY.noMusic }].map(
                    (track) => {
                      const on = track.id === musicId;
                      return (
                        <button
                          key={track.id ?? "none"}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            setMusicId(track.id);
                            setNotice("");
                          }}
                          className={chipClass(on)}
                        >
                          <span className="min-w-0 break-words">{track.name}</span>
                          <Check on={on} />
                        </button>
                      );
                    },
                  )}
                </div>
                <p className="text-xs font-semibold text-ht-muted">{COPY.musicHint}</p>
              </section>
            ) : null}

            <section className="space-y-2" aria-label={COPY.previewHeading}>
              <Heading>{COPY.previewHeading}</Heading>
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-ht-elevated p-3">
                {isReel ? (
                  // Played live on this canvas (half size is plenty on screen); hidden when not playing.
                  <canvas
                    ref={previewCanvasRef}
                    width={540}
                    height={960}
                    aria-label={`${template.name} ${COPY.formats.reel.toLowerCase()}`}
                    className={`h-auto w-full max-w-[15rem] rounded-xl shadow-ht-card ${previewing ? "block" : "hidden"}`}
                  />
                ) : null}
                {isReel && readyReel && !previewing ? (
                  <video
                    key={readyReel.url}
                    src={readyReel.url}
                    poster={showPicture?.url}
                    controls
                    playsInline
                    className="h-auto w-full max-w-[15rem] rounded-xl shadow-ht-card"
                  />
                ) : previewing ? null : renderError && !showPicture ? (
                  <div className="space-y-2 py-8 text-center">
                    <p role="alert" className="text-sm font-bold text-ht-rose-300">
                      {COPY.renderFailed}
                    </p>
                    <button
                      type="button"
                      onClick={() => setRenderAttempt((n) => n + 1)}
                      className="min-h-11 rounded-xl border border-ht-hairline px-4 text-sm font-black text-ht-primary"
                    >
                      {COPY.retry}
                    </button>
                  </div>
                ) : picture ? (
                  // The last picture stays up (dimmed) while the next one is drawn; Share/Download wait for it.
                  <img
                    src={picture.url}
                    alt={`${template.name} ${COPY.formats[size].toLowerCase()}`}
                    aria-busy={!showPicture}
                    className={`h-auto w-full rounded-xl shadow-ht-card transition-opacity ${
                      format === "story" ? "max-w-[15rem]" : "max-w-[20rem]"
                    } ${showPicture ? "opacity-100" : "opacity-50"}`}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-10">
                    <HightopLoader size="sm" />
                    <p className="text-xs font-semibold text-ht-muted">{COPY.making}</p>
                  </div>
                )}
                {isReel && !readyReel ? (
                  <button
                    type="button"
                    onClick={() => (previewing ? haltPreview() : void playPreview())}
                    disabled={currentReel?.status === "making"}
                    className="min-h-11 rounded-xl border border-ht-hairline px-4 text-sm font-black text-ht-primary disabled:opacity-50"
                  >
                    {previewing ? COPY.stopPreview : COPY.playPreview}
                  </button>
                ) : null}
              </div>
              {gamePrizes.length > 0 && shownPrizes.length === 0 ? (
                <p className="text-xs font-semibold text-ht-muted">{COPY.noPrizeShown}</p>
              ) : null}
            </section>

            {notice ? (
              <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-300">
                {notice}
              </p>
            ) : null}

            {isReel && currentReel?.status === "making" ? (
              <div role="status" className="space-y-2">
                <p className="text-sm font-bold text-ht-primary">
                  {COPY.makingReel} {Math.round(currentReel.progress * 100)}%
                </p>
                <progress
                  max={100}
                  value={Math.round(currentReel.progress * 100)}
                  aria-label={COPY.makingReel}
                  className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-ht-cyan-500 [&::-webkit-progress-bar]:bg-ht-hairline [&::-webkit-progress-value]:bg-ht-cyan-500"
                />
              </div>
            ) : null}
            {isReel && currentReel?.status === "error" ? (
              <p role="alert" className="text-sm font-bold text-ht-rose-300">
                {currentReel.unsupported ? COPY.reelUnsupported : COPY.reelFailed}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {isReel && !readyReel ? (
                <button
                  type="button"
                  onClick={() => void makeReel()}
                  disabled={currentReel?.status === "making"}
                  className="min-h-12 rounded-xl bg-ht-cyan-500 px-4 text-sm font-black text-slate-950 disabled:opacity-60 sm:col-span-2"
                >
                  {COPY.makeReel}
                </button>
              ) : null}
              {media?.canShare ? (
                <button
                  type="button"
                  onClick={() => void share()}
                  disabled={busy}
                  className="min-h-12 rounded-xl bg-ht-cyan-500 px-4 text-sm font-black text-slate-950 disabled:opacity-60"
                >
                  {COPY.share}
                </button>
              ) : null}
              {isReel && !readyReel ? null : (
                <button
                  type="button"
                  onClick={() => void download()}
                  disabled={!media}
                  className={`min-h-12 rounded-xl px-4 text-sm font-black disabled:opacity-50 ${
                    media?.canShare ? "border border-ht-hairline text-ht-primary" : "bg-ht-cyan-500 text-slate-950"
                  }`}
                >
                  {COPY.download}
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </OwnerSheet>
  );
};

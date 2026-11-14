"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { withIntroDisabled } from "@/components/venue-screen/stingerTimeline";
import { HightopLoader } from "@/components/ui/HightopLoader";
import { Dropdown } from "@/components/ui/Dropdown";
import { displayCodePath, displayShortUrl, displayShortUrlLabel } from "@/lib/displayCode";
import { gameUrl } from "@/lib/domainSplit";
import { ownerAuthRecoveryPath } from "@/lib/ownerAuthCodes";

// The venue screen is built for a TV/desktop 16:9 viewport, not a narrow mobile
// one — loading it at the preview box's native (~350px) width makes it reflow
// with oversized, clipped text instead of a true thumbnail. Render it at a
// fixed TV-like width and scale the whole iframe down with CSS instead.
const PREVIEW_SOURCE_WIDTH = 1280;
const PREVIEW_SOURCE_HEIGHT = 720;

type Venue = { id: string; name: string; displayCode?: string | null };

// Partners set up a display only by its Display URL, the short link
// hightopchallenge.com/tv/<code> (docs/live-trivia-pregame-and-display-cleanup-plan.md,
// Phase 4; code pairing was removed, D4). Copy is pinned by
// tests/owner-display-page-contract.test.ts.
const OwnerDisplayPage = () => {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showFireStick, setShowFireStick] = useState(false);
  const [displayExpanded, setDisplayExpanded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/owner/venues?with=displayCode");
        if (res.status === 401) {
          const body = (await res.json().catch(() => ({}))) as { code?: string };
          router.push(ownerAuthRecoveryPath(body.code));
          return;
        }
        const json = (await res.json()) as { ok: boolean; venues?: Venue[] };
        const loaded = json.venues ?? [];
        setVenues(loaded);
        setSelectedVenueId((prev) => prev || loaded[0]?.id || "");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const selectedVenue = venues.find((v) => v.id === selectedVenueId);
  // The venue screen is a game route — under the domain split it lives on `play.`
  // (gameUrl resolves to the current apex while the split is off). The preview
  // loads it directly; partners copy the short link, which redirects to it.
  const screenUrl = selectedVenueId ? gameUrl(`/venue/${selectedVenueId}/screen`) : "";
  const displayCode = selectedVenue?.displayCode ?? null;
  const copyUrl = displayCode ? displayShortUrl(displayCode) : screenUrl;
  const shownUrl = displayCode ? displayShortUrlLabel(displayCode) : screenUrl;

  const handleCopy = async () => {
    if (!copyUrl) return;
    try {
      await navigator.clipboard.writeText(copyUrl);
      setCopied(true);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS context) — the URL is still
      // visible and selectable for manual copy.
    }
  };

  return (
    <OwnerShell
      title="Venue Display"
      subtitle="Put the follow-along screen on your TVs"
      maxWidth="lg"
      variant="dark"
      backTo={{ href: "/owner/dashboard", label: "Dashboard", preferHref: true }}
    >
      <div className="space-y-5">
        {venues.length > 1 ? (
          <div className="flex justify-end">
            <Dropdown
              value={selectedVenueId}
              onChange={setSelectedVenueId}
              options={venues.map((v) => ({ value: v.id, label: v.name }))}
              ariaLabel="Select venue"
              size="sm"
              className="min-h-11 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
            />
          </div>
        ) : null}

        {loading ? (
          <HightopLoader size="lg" className="py-10" />
        ) : !selectedVenueId ? (
          <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
            <p className="text-sm font-semibold text-ht-muted">No venue found for this account.</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-4 shadow-ht-card">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">Display URL</p>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5">
                {/* Wraps before "/tv/" on narrow phones, so the code itself is never cut off. */}
                <span
                  className="min-w-0 flex-1 select-all break-words font-mono text-base font-bold text-ht-primary"
                  title={copyUrl}
                >
                  {displayCode ? (
                    <>
                      {shownUrl.slice(0, -displayCodePath(displayCode).length)}
                      <wbr />
                      <span className="whitespace-nowrap">{displayCodePath(displayCode)}</span>
                    </>
                  ) : (
                    shownUrl
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="min-h-11 shrink-0 rounded-lg border border-ht-soft bg-ht-cyan-500 px-4 text-sm font-black text-slate-950"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <ol className="mt-4 space-y-2 text-sm font-semibold text-ht-secondary">
                <li>Step 1: Copy the display URL into your device&apos;s web browser.</li>
                <li>Step 2: Screen mirror your device with a TV or projector.</li>
              </ol>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowFireStick((v) => !v)}
                  aria-expanded={showFireStick}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-bold text-ht-primary"
                >
                  Amazon Fire Stick
                  <span className="text-ht-muted">{showFireStick ? "−" : "+"}</span>
                </button>
                {showFireStick ? (
                  <ol className="mt-3 list-decimal space-y-1.5 pl-8 pr-3 text-sm font-semibold text-ht-secondary">
                    <li>
                      Open <span className="text-ht-primary">Silk Browser</span> (free in the Fire TV app store).
                    </li>
                    <li>
                      Select the address bar. Scan the QR code beside the keyboard with your phone and paste the
                      display URL, or type it.
                    </li>
                    <li>Bookmark it for next time.</li>
                  </ol>
                ) : null}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-ht-hairline bg-ht-surface shadow-ht-card">
              <div className="flex items-center justify-between px-4 pt-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">Preview</p>
                <FullscreenExpander url={screenUrl} onExpandedChange={setDisplayExpanded} />
              </div>
              <div className="mt-3">
                <ScaledPreview url={screenUrl} paused={displayExpanded} />
              </div>
            </div>
          </>
        )}
      </div>
    </OwnerShell>
  );
};

// Vendor-prefixed Fullscreen API surfaces that lib.dom doesn't type (older
// WebKit). Kept as a narrow local extension so we stay off `any`.
type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};
type WebkitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};

// How long the Close control stays visible before it fades, and how long a tap
// keeps it visible again — standard video-player "chrome" behavior.
const CONTROLS_HIDE_DELAY_MS = 3_500;

// "Expand" gives the owner an edge-to-edge TV view from their phone, in
// whatever orientation the phone is physically held — vertical shows a
// portrait-fit view, horizontal shows a full landscape view. No orientation
// forcing/locking: the embedded venue screen's own fit-to-viewport
// (ViewportFitCanvas) already scales correctly to whatever window it measures,
// so this component just needs to give it a full-bleed window and get out of
// the way. Embedding the screen in an iframe keeps the tap's user-gesture in
// this document, which the Fullscreen API requires.
function FullscreenExpander({
  url,
  onExpandedChange,
}: {
  url: string;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const fsRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  // True only when THIS component's requestFullscreen() succeeded and hasn't
  // exited yet. `fullscreenchange` fires globally for any element on the page,
  // so without this the teardown below would close this overlay in reaction to
  // unrelated fullscreen state elsewhere.
  const enteredFullscreenRef = useRef(false);
  // Close button starts visible on expand, fades after CONTROLS_HIDE_DELAY_MS,
  // and reappears on any tap/pointer interaction with the overlay.
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimeoutRef = useRef<number | null>(null);

  // Let the parent pause the background ScaledPreview iframe's polling while
  // this overlay's own iframe is up, so /api/venue-screen/state isn't hit by
  // two iframes at once.
  useEffect(() => {
    onExpandedChange(expanded);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!enteredFullscreenRef.current) return;
      const doc = document as WebkitFullscreenDocument;
      const fsEl = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      // Only react when *this* component's fsRef is the element that left
      // fullscreen — not any other fullscreen state change on the page (e.g.
      // some other component's video player exiting fullscreen shouldn't close
      // this overlay).
      if (fsEl === fsRef.current) return;
      enteredFullscreenRef.current = false;
      setExpanded(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  const scheduleControlsHide = useCallback(() => {
    if (hideTimeoutRef.current !== null) window.clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY_MS);
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  useEffect(() => {
    if (expanded) return;
    if (hideTimeoutRef.current !== null) window.clearTimeout(hideTimeoutRef.current);
  }, [expanded]);

  const handleExpand = async () => {
    setExpanded(true);
    revealControls();
    // Let the overlay leave `display:none` first — the Fullscreen API refuses a
    // request on an unrendered element. One frame keeps us well inside the
    // transient-activation window the request also needs.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const el = fsRef.current as WebkitFullscreenElement | null;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      enteredFullscreenRef.current = true;
    } catch {
      // Fullscreen refused (e.g. iOS Safari on a <div>) — the fixed overlay
      // still covers the viewport, which is enough; no orientation forcing is
      // needed either way.
    }
  };

  const handleClose = () => {
    const doc = document as WebkitFullscreenDocument;
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen();
    } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen();
    } else {
      // No real fullscreen was granted — just drop the overlay.
      setExpanded(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleExpand()}
        className="text-xs font-bold text-ht-cyan-300 underline underline-offset-2"
      >
        Expand
      </button>

      <div
        ref={fsRef}
        className={expanded ? "fixed inset-0 z-[60] bg-black" : "hidden"}
        onPointerDown={revealControls}
      >
        {expanded ? (
          <>
            {/* pointer-events-none: this is a passive display, not something the
                owner interacts with — taps should reveal the Close control
                (handled by the wrapper above), not be swallowed by the iframe. */}
            <iframe
              src={url}
              title="Venue display full screen"
              allow="autoplay; fullscreen"
              className="pointer-events-none absolute left-0 top-0 h-full w-full max-w-none border-0"
            />
            <button
              type="button"
              onClick={handleClose}
              className={`absolute right-5 top-5 z-10 flex min-h-12 items-center gap-2 rounded-full border-2 border-white/70 bg-black/80 px-5 text-base font-black text-white shadow-lg shadow-black/40 transition-opacity duration-300 ${
                controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              ✕ Close
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}

function ScaledPreview({ url, paused }: { url: string; paused: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateBox = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    updateBox();

    const observer = new ResizeObserver(updateBox);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Scale by whichever dimension is tighter so the 16:9 content always fits
  // fully in the box, instead of assuming the container is already a perfect
  // 16:9 (aspect-ratio CSS support/rounding can't be relied on for that).
  const scale = Math.min(box.width / PREVIEW_SOURCE_WIDTH, box.height / PREVIEW_SOURCE_HEIGHT);
  // The thumbnail skips the intro stinger; the owner sees it when they tap Expand.
  const previewUrl = withIntroDisabled(url);
  const left = (box.width - PREVIEW_SOURCE_WIDTH * scale) / 2;
  const top = (box.height - PREVIEW_SOURCE_HEIGHT * scale) / 2;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-black"
      style={{ aspectRatio: `${PREVIEW_SOURCE_WIDTH} / ${PREVIEW_SOURCE_HEIGHT}` }}
    >
      {scale > 0 && !paused ? (
        <iframe
          src={previewUrl}
          title="Venue display preview"
          loading="lazy"
          className="pointer-events-none absolute origin-top-left border-0"
          style={{
            left,
            top,
            width: PREVIEW_SOURCE_WIDTH,
            height: PREVIEW_SOURCE_HEIGHT,
            // Override the global `iframe { max-width: 100% }` reset (app/globals.css)
            // — this iframe is deliberately oversized (TV-width) and shrunk via the
            // transform below; max-width:100% would otherwise clamp it back down to
            // the container's width before the scale is applied, rendering a
            // near-empty sliver of content in the corner instead of a full preview.
            maxWidth: "none",
            transform: `scale(${scale})`,
          }}
        />
      ) : null}
    </div>
  );
}

export default OwnerDisplayPage;

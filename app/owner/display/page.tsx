"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { Dropdown } from "@/components/ui/Dropdown";
import { gameUrl } from "@/lib/domainSplit";
import { normalizePairingCode } from "@/lib/tvPairingShared";

// The venue screen is built for a TV/desktop 16:9 viewport, not a narrow mobile
// one — loading it at the preview box's native (~350px) width makes it reflow
// with oversized, clipped text instead of a true thumbnail. Render it at a
// fixed TV-like width and scale the whole iframe down with CSS instead.
const PREVIEW_SOURCE_WIDTH = 1280;
const PREVIEW_SOURCE_HEIGHT = 720;

type Venue = { id: string; name: string };

const OwnerDisplayPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showManualSetup, setShowManualSetup] = useState(false);
  const [displayExpanded, setDisplayExpanded] = useState(false);

  // "Link a TV" claim form state — pre-filled from a `/tv` page's QR deep-link
  // (?code=XK49PM) so scanning it lands ready to tap once.
  const [pairingCode, setPairingCode] = useState(() =>
    normalizePairingCode(searchParams.get("code") ?? ""),
  );
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/owner/venues");
        if (res.status === 401) {
          router.push("/owner/login");
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
  // (gameUrl resolves to the current apex while the split is off).
  const displayUrl = selectedVenueId ? gameUrl(`/venue/${selectedVenueId}/screen`) : "";

  const handleCopy = async () => {
    if (!displayUrl) return;
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS context) — the URL is still
      // visible and selectable in the input for manual copy.
    }
  };

  const handleClaim = async () => {
    if (!selectedVenueId) return;
    const code = normalizePairingCode(pairingCode);
    if (!code) {
      setClaimMessage({ text: "Enter the code shown on your TV.", kind: "error" });
      return;
    }
    setClaiming(true);
    setClaimMessage(null);
    try {
      const res = await fetch("/api/owner/tv-pair/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, venueId: selectedVenueId }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setClaimMessage({ text: json.error ?? "Couldn't link that TV. Please try again.", kind: "error" });
        return;
      }
      setClaimMessage({ text: "TV linked! It should switch to your venue screen in a few seconds.", kind: "success" });
      setPairingCode("");
    } catch {
      setClaimMessage({ text: "Network error. Please try again.", kind: "error" });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <OwnerShell title="Venue Display" subtitle="Put the follow-along screen on your TVs" maxWidth="lg" variant="dark">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/owner/dashboard"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ht-exit-border bg-gradient-to-br from-ht-exit-from via-ht-exit-via to-ht-exit-to px-4 text-sm font-black text-ht-exit-text"
          >
            ← Dashboard
          </Link>

          {venues.length > 1 ? (
            <Dropdown
              value={selectedVenueId}
              onChange={setSelectedVenueId}
              options={venues.map((v) => ({ value: v.id, label: v.name }))}
              ariaLabel="Select venue"
              size="sm"
              className="min-h-11 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
            />
          ) : null}
        </div>

        {loading ? (
          <p className="text-center text-sm font-semibold text-ht-muted">Loading…</p>
        ) : !selectedVenueId ? (
          <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
            <p className="text-sm font-semibold text-ht-muted">No venue found for this account.</p>
          </div>
        ) : (
          <>
            {/* Link a TV — primary flow (Phase 5b). The TV shows a code at /tv;
                the owner types (or QR-scans) it in here. */}
            <div className="rounded-2xl border border-indigo-400/40 bg-ht-surface p-4 shadow-ht-card">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-indigo-300">
                Link a TV — {selectedVenue?.name ?? "your venue"}
              </p>
              <p className="mt-2 text-sm font-semibold text-ht-secondary">
                On the TV&apos;s browser, go to <span className="font-mono text-ht-primary">hightopchallenge.com/tv</span>.
                It&apos;ll show that TV&apos;s own one-time code — enter it below to link it to{" "}
                {selectedVenue?.name ?? "your venue"}.
              </p>
              <p className="mt-1.5 text-xs font-semibold text-ht-muted">
                Each device or browser needs its own one-time link. If you switch devices (e.g. Fire
                Stick → Apple TV) or open a different browser, just repeat this step — nothing is lost.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(normalizePairingCode(e.target.value))}
                  placeholder="XK49PM"
                  maxLength={6}
                  className="min-h-11 flex-1 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-center font-mono text-lg font-black uppercase tracking-[0.2em] text-ht-primary outline-none focus:border-ht-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => void handleClaim()}
                  disabled={claiming || pairingCode.length !== 6}
                  className="min-h-11 shrink-0 rounded-xl border border-ht-soft bg-ht-cyan-500 px-5 text-sm font-black text-slate-950 disabled:opacity-50"
                >
                  {claiming ? "Linking…" : "Link TV"}
                </button>
              </div>

              {claimMessage ? (
                <div
                  className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${
                    claimMessage.kind === "success"
                      ? "bg-ht-emerald-500/15 text-ht-emerald-300"
                      : "bg-ht-rose-500/15 text-ht-rose-300"
                  }`}
                >
                  {claimMessage.text}
                </div>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-2xl border border-ht-hairline bg-ht-surface shadow-ht-card">
              <div className="flex items-center justify-between px-4 pt-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">Preview</p>
                <FullscreenExpander url={displayUrl} onExpandedChange={setDisplayExpanded} />
              </div>
              <div className="mt-3">
                <ScaledPreview url={displayUrl} paused={displayExpanded} />
              </div>
            </div>

            {/* Manual setup — demoted secondary path (was the primary QR/URL flow
                before Phase 5b). Still useful for previewing on a phone or as a
                fallback if /tv pairing isn't available. */}
            <div className="rounded-2xl border border-ht-hairline bg-ht-surface shadow-ht-card">
              <button
                type="button"
                onClick={() => setShowManualSetup((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-xs font-black uppercase tracking-[0.14em] text-ht-muted">
                  Manual setup (QR / direct URL)
                </span>
                <span className="text-ht-muted">{showManualSetup ? "−" : "+"}</span>
              </button>

              {showManualSetup ? (
                <div className="space-y-4 border-t border-ht-hairline p-4 pt-4">
                  <div className="flex items-center gap-2 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5">
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-ht-secondary"
                      title={displayUrl}
                    >
                      {displayUrl}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopy()}
                      className="shrink-0 rounded-lg border border-ht-soft bg-ht-cyan-500 px-3 py-1.5 text-xs font-black text-slate-950"
                    >
                      {copied ? "Copied ✓" : "Copy"}
                    </button>
                  </div>

                  <p className="text-sm font-semibold text-ht-secondary">
                    Type this URL into the browser on your TV, or type this URL into a device that is paired
                    with your TV.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Native TV apps (Amazon/Google/Apple TV) don't exist yet — this is browser-URL only for now. */}
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
          src={url}
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

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { OwnerShell } from "@/components/owner/OwnerShell";
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
            <select
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              className="min-h-11 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
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
                It&apos;ll show a code — enter it below.
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
                <a
                  href={displayUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-ht-cyan-300 underline underline-offset-2"
                >
                  Open full screen
                </a>
              </div>
              <div className="mt-3">
                <ScaledPreview url={displayUrl} />
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
                  {/* QR panel — the one intentional white surface (needs a clean quiet zone to scan across a room). */}
                  <div className="flex justify-center rounded-[14px] bg-white p-3">
                    <QRCodeSVG value={displayUrl} size={208} level="M" marginSize={0} />
                  </div>

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
                    Scan this QR code (or type the URL) directly into the TV&apos;s browser. No camera on the
                    TV? Open the link on your phone first to confirm it looks right, then type it into the TV
                    browser.
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

function ScaledPreview({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => setScale(el.clientWidth / PREVIEW_SOURCE_WIDTH);
    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-black"
      style={{ aspectRatio: `${PREVIEW_SOURCE_WIDTH} / ${PREVIEW_SOURCE_HEIGHT}` }}
    >
      {scale > 0 ? (
        <iframe
          src={url}
          title="Venue display preview"
          loading="lazy"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ExplodingLogo } from "@/components/ui/ExplodingLogo";
import { gameUrl, marketingUrl } from "@/lib/domainSplit";

// This is the ONE page owners type on a TV remote (hightopchallenge.com/tv), so
// it's public (no auth cookies exist on a TV) and built for across-the-room
// readability rather than the mobile-first dashboard shell. Once paired, the
// venueId is cached in this browser's localStorage so a power-cycled TV
// auto-resumes straight to its screen without re-pairing.
const STORAGE_KEY = "tp_tv_venue_id";
const POLL_INTERVAL_MS = 3000;
// Auto-resume waits this long before navigating away, so the "not your venue?"
// escape hatch below is actually clickable instead of flashing off-screen.
const AUTO_RESUME_DELAY_MS = 4000;

type Phase = "resuming" | "minting" | "pending" | "claimed" | "expired" | "error";

// Group "XK49PM" as "XK4-9PM" — purely cosmetic, easier to read/say across a room.
function formatCodeForDisplay(code: string): string {
  if (code.length !== 6) return code;
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

const TvPairPage = () => {
  const [phase, setPhase] = useState<Phase>("resuming");
  const [code, setCode] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const pollTimeoutRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const clearPoll = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const redirectToVenueScreen = useCallback((venueId: string) => {
    window.localStorage.setItem(STORAGE_KEY, venueId);
    window.location.href = gameUrl(`/venue/${venueId}/screen`);
  }, []);

  const pollCode = useCallback(
    (activeCode: string) => {
      const tick = async () => {
        if (cancelledRef.current) return;
        try {
          const res = await fetch(`/api/tv-pair/${encodeURIComponent(activeCode)}`, { cache: "no-store" });
          const json = (await res.json()) as { status?: string; venueId?: string };

          if (json.status === "claimed" && json.venueId) {
            setPhase("claimed");
            redirectToVenueScreen(json.venueId);
            return;
          }
          if (json.status === "expired" || res.status === 404) {
            setPhase("expired");
            return;
          }
          // pending / consumed(shouldn't happen here) → keep polling.
        } catch {
          // Transient network error — keep polling rather than failing hard;
          // a TV browser's connection can blip without anyone around to retry.
        }
        if (!cancelledRef.current) {
          pollTimeoutRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        }
      };
      void tick();
    },
    [redirectToVenueScreen],
  );

  const mintCode = useCallback(async () => {
    clearPoll();
    setPhase("minting");
    setErrorMessage("");
    try {
      const res = await fetch("/api/tv-pair", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; code?: string; error?: string };
      if (!json.ok || !json.code) {
        setErrorMessage(json.error ?? "Couldn't generate a pairing code.");
        setPhase("error");
        return;
      }
      setCode(json.code);
      setPhase("pending");
      pollCode(json.code);
    } catch {
      setErrorMessage("Network error. Please try again.");
      setPhase("error");
    }
  }, [clearPoll, pollCode]);

  useEffect(() => {
    cancelledRef.current = false;
    // A previously-paired TV auto-resumes straight to its venue screen — no
    // re-pairing needed after a power cycle. A short delay keeps the "not your
    // venue?" escape hatch below actually clickable instead of navigating away
    // before it can render.
    const storedVenueId = window.localStorage.getItem(STORAGE_KEY);
    if (storedVenueId) {
      setPhase("resuming");
      const timeout = window.setTimeout(() => {
        if (!cancelledRef.current) redirectToVenueScreen(storedVenueId);
      }, AUTO_RESUME_DELAY_MS);
      return () => {
        cancelledRef.current = true;
        window.clearTimeout(timeout);
      };
    }
    void mintCode();
    return () => {
      cancelledRef.current = true;
      clearPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const handleUnlink = () => {
    cancelledRef.current = true; // cancel any pending auto-resume redirect
    window.localStorage.removeItem(STORAGE_KEY);
    cancelledRef.current = false;
    void mintCode();
  };

  // Deep-link a phone can scan: lands the owner on the claim screen with the
  // code pre-filled, ready to tap once. /owner/* is a marketing-classified
  // route (lives on the apex even under the domain split).
  const claimDeepLink = code ? marketingUrl(`/owner/display?code=${encodeURIComponent(code)}`) : "";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ht-canvas px-8 py-12 text-center">
      <ExplodingLogo width={260} />

      {phase === "resuming" ? (
        <p className="mt-10 text-2xl font-bold text-ht-muted">Resuming your venue screen…</p>
      ) : phase === "minting" ? (
        <p className="mt-10 text-2xl font-bold text-ht-muted">Loading…</p>
      ) : phase === "error" ? (
        <div className="mt-10 max-w-xl">
          <p className="text-2xl font-bold text-ht-rose-300">{errorMessage || "Something went wrong."}</p>
          <button
            type="button"
            onClick={() => void mintCode()}
            className="mt-6 rounded-2xl border border-ht-soft bg-ht-cyan-500 px-8 py-4 text-xl font-black text-slate-950"
          >
            Try again
          </button>
        </div>
      ) : phase === "expired" ? (
        <div className="mt-10 max-w-xl">
          <p className="text-2xl font-bold text-ht-muted">This code expired.</p>
          <button
            type="button"
            onClick={() => void mintCode()}
            className="mt-6 rounded-2xl border border-ht-soft bg-ht-cyan-500 px-8 py-4 text-xl font-black text-slate-950"
          >
            Get a new code
          </button>
        </div>
      ) : (
        <div className="mt-10 flex max-w-3xl flex-col items-center gap-8">
          <div>
            <p className="text-xl font-bold uppercase tracking-[0.3em] text-ht-cyan-300">
              Link this TV
            </p>
            <p
              className="mt-4 font-black tracking-[0.15em] text-ht-primary"
              style={{ fontSize: "clamp(3.5rem, 10vw, 7rem)" }}
            >
              {formatCodeForDisplay(code)}
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-8">
            <div className="rounded-2xl bg-white p-4">
              <QRCodeSVG value={claimDeepLink} size={180} level="M" marginSize={0} />
            </div>
            <div className="max-w-sm text-left">
              <p className="text-lg font-bold text-ht-secondary">
                On your phone, open the Partner Dashboard → Venue Display, and enter this code —
                or scan the QR code to jump straight there.
              </p>
              <p className="mt-3 text-sm font-semibold text-ht-muted">
                This screen updates automatically once you link it.
              </p>
            </div>
          </div>

          {phase === "claimed" ? (
            <p className="text-lg font-bold text-ht-emerald-300">Linked! Loading your venue screen…</p>
          ) : null}
        </div>
      )}

      <button
        type="button"
        onClick={handleUnlink}
        className="mt-16 text-xs font-semibold text-ht-muted underline underline-offset-2"
      >
        Not your venue? Get a new code
      </button>
    </div>
  );
};

export default TvPairPage;

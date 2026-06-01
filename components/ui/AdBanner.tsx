"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { Advertisement } from "@/types";
import type { AdPageKey } from "@/types";
import { getVenueId } from "@/lib/storage";
import { trackAdClick, trackAdView } from "@/lib/analytics";
import { lookupSlotId } from "@/lib/adSlotRegistry";

const IMPRESSION_THROTTLE_MS = 1000 * 60 * 30;

function resolvePageKey(pathname: string | null): AdPageKey | undefined {
  if (!pathname || pathname === "/" || pathname === "/join") {
    return "join";
  }
  if (pathname.startsWith("/venue/")) {
    return "venue";
  }
  if (pathname.startsWith("/trivia/live")) {
    return "live-trivia";
  }
  if (pathname.startsWith("/trivia")) {
    return "speed-trivia";
  }
  if (pathname.startsWith("/bingo")) {
    return "sports-bingo";
  }
  if (pathname.startsWith("/pickem")) {
    return "pickem";
  }
  if (pathname.startsWith("/fantasy")) {
    return "fantasy";
  }
  if (pathname.startsWith("/predictions")) {
    return "pickem";
  }
  return "global";
}

export function AdBanner({ ad, variant = "default" }: { ad: Advertisement; variant?: "default" | "adhesion" }) {
  const sentForId = useRef<string | null>(null);
  const pathname = usePathname();
  const pageKey = resolvePageKey(pathname);
  const venueId = getVenueId() ?? undefined;

  useEffect(() => {
    if (!ad.id || sentForId.current === ad.id) {
      return;
    }

    const storageKey = `tp:ad-impression:${ad.id}`;
    const now = Date.now();
    try {
      const lastSentRaw = sessionStorage.getItem(storageKey);
      const lastSentAt = lastSentRaw ? Number.parseInt(lastSentRaw, 10) : 0;
      if (Number.isFinite(lastSentAt) && lastSentAt > 0 && now - lastSentAt < IMPRESSION_THROTTLE_MS) {
        sentForId.current = ad.id;
        return;
      }
      sessionStorage.setItem(storageKey, String(now));
    } catch {
      // Ignore storage failures and still attempt to record impressions.
    }

    sentForId.current = ad.id;
    trackAdView({ adId: ad.id, referrerPage: pathname ?? undefined });
    void fetch("/api/ads/impression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adId: ad.id, pageKey, venueId }),
    });
  }, [ad.id, pageKey, pathname, venueId]);

  const isAdhesion = variant === "adhesion";
  const slotId = lookupSlotId(ad.pageKey, ad.slot, ad.displayTrigger, ad.roundNumber ?? undefined);
  const slotLabel = slotId ?? ad.slot;

  const clickParams = new URLSearchParams({ id: ad.id });
  if (pageKey) {
    clickParams.set("pageKey", pageKey);
  }
  if (venueId) {
    clickParams.set("venueId", venueId);
  }

  return (
    <aside
      className={
        isAdhesion
          ? "rounded-ht-xl border border-ht-border-soft bg-ht-elevated/95 p-2 shadow-[0_8px_24px_rgba(15,23,42,0.22)] backdrop-blur"
          : "rounded-ht-xl border border-ht-border-hairline bg-ht-elevated p-3 shadow-ht-card"
      }
    >
      <div className={isAdhesion ? "mb-1 flex items-center justify-between" : "mb-2 flex items-center justify-between"}>
        <p className={isAdhesion ? "text-[9px] font-semibold uppercase tracking-wide text-ht-fg-muted" : "text-[10px] font-semibold uppercase tracking-wide text-ht-fg-muted"}>
          Sponsored
        </p>
        <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-300">
          {slotLabel}
        </span>
      </div>
      <a
        href={`/api/ads/click?${clickParams.toString()}`}
        target="_blank"
        rel="noreferrer noopener"
        className="block"
        onClick={() => trackAdClick({ adId: ad.id, referrerPage: pathname ?? undefined }, true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ad.imageUrl}
          alt={ad.altText}
          width={ad.width}
          height={ad.height}
          className={
            isAdhesion
              ? "h-auto max-h-[64px] w-full rounded-md border border-ht-border-hairline object-contain"
              : "h-auto w-full rounded-md border border-ht-border-hairline object-cover"
          }
        />
      </a>
    </aside>
  );
}

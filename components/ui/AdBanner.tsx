"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { Advertisement } from "@/types";
import type { AdPageKey } from "@/types";
import { getVenueId } from "@/lib/storage";

const IMPRESSION_THROTTLE_MS = 1000 * 60 * 30;

function resolvePageKey(pathname: string | null): AdPageKey | undefined {
  if (!pathname || pathname === "/" || pathname === "/join") {
    return "join";
  }
  if (pathname.startsWith("/venue/")) {
    return "venue";
  }
  if (pathname.startsWith("/trivia")) {
    return "trivia";
  }
  if (pathname.startsWith("/predictions")) {
    return "sports-predictions";
  }
  if (pathname.startsWith("/bingo")) {
    return "sports-bingo";
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
    void fetch("/api/ads/impression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adId: ad.id, pageKey, venueId }),
    });
  }, [ad.id, pageKey, venueId]);

  const isAdhesion = variant === "adhesion";

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
          ? "rounded-xl border border-slate-300 bg-white/95 p-2 shadow-[0_8px_24px_rgba(15,23,42,0.22)] backdrop-blur"
          : "rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      }
    >
      <p className={isAdhesion ? "mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500" : "mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500"}>
        Sponsored
      </p>
      <a href={`/api/ads/click?${clickParams.toString()}`} target="_blank" rel="noreferrer noopener" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ad.imageUrl}
          alt={ad.altText}
          width={ad.width}
          height={ad.height}
          className={
            isAdhesion
              ? "h-auto max-h-[64px] w-full rounded-md border border-slate-100 object-contain"
              : "h-auto w-full rounded-md border border-slate-100 object-cover"
          }
        />
      </a>
    </aside>
  );
}

"use client";

import { useEffect, useRef } from "react";
import type { Advertisement } from "@/types";

const IMPRESSION_THROTTLE_MS = 1000 * 60 * 30;

export function AdBanner({ ad }: { ad: Advertisement }) {
  const sentForId = useRef<string | null>(null);

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
      body: JSON.stringify({ adId: ad.id }),
    });
  }, [ad.id]);

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sponsored</p>
      <a href={`/api/ads/click?id=${encodeURIComponent(ad.id)}`} target="_blank" rel="noreferrer noopener" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ad.imageUrl}
          alt={ad.altText}
          width={ad.width}
          height={ad.height}
          className="h-auto w-full rounded-md border border-slate-100 object-cover"
        />
      </a>
    </aside>
  );
}

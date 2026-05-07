"use client";

import { useEffect, useRef, useState } from "react";
import { AdBanner } from "@/components/ui/AdBanner";
import { incrementAdCounter } from "@/lib/adFrequency";
import type { AdDisplayTrigger, AdPageKey, AdSlot, AdType, Advertisement } from "@/types";

type SlotResponse = {
  ok: boolean;
  ad?: Advertisement | null;
  error?: string;
};

export function InlineSlotAdClient({
  slot = "leaderboard-sidebar",
  venueId,
  pageKey,
  adType,
  displayTrigger,
  placementKey,
  roundNumber,
  sequenceIndex,
  excludeAdIds,
  allowAnyVenue = false,
  showPlaceholder = true,
}: {
  slot?: AdSlot;
  venueId?: string;
  pageKey?: AdPageKey;
  adType?: AdType;
  displayTrigger?: AdDisplayTrigger;
  placementKey?: string;
  roundNumber?: number;
  sequenceIndex?: number;
  excludeAdIds?: string[];
  allowAnyVenue?: boolean;
  showPlaceholder?: boolean;
}) {
  const [ad, setAd] = useState<Advertisement | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Track whether we've already fetched so props re-renders (e.g. parent
  // re-renders that don't change any meaningful prop) don't cause a second
  // fetch that would cause the ad to flicker.
  const fetchedRef = useRef(false);
  // Stable string key derived from the props that actually matter for the query.
  const stableKey = [
    slot,
    venueId ?? "",
    pageKey ?? "",
    adType ?? "",
    displayTrigger ?? "",
    placementKey ?? "",
    String(roundNumber ?? ""),
    String(sequenceIndex ?? ""),
    (excludeAdIds ?? []).slice().sort().join(","),
    allowAnyVenue ? "1" : "0",
  ].join("|");

  const prevKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Only re-fetch when the query parameters actually change.
    if (fetchedRef.current && prevKeyRef.current === stableKey) {
      return;
    }
    prevKeyRef.current = stableKey;
    fetchedRef.current = true;

    const counterKey = `inline:${slot}:${pageKey ?? ""}:${placementKey ?? ""}:${roundNumber ?? ""}:${sequenceIndex ?? ""}`;
    const counter = incrementAdCounter(counterKey);

    const params = new URLSearchParams({ slot });
    if (venueId) {
      params.set("venueId", venueId);
    }
    if (pageKey) {
      params.set("pageKey", pageKey);
    }
    if (adType) {
      params.set("adType", adType);
    }
    if (displayTrigger) {
      params.set("displayTrigger", displayTrigger);
    }
    if (placementKey) {
      params.set("placementKey", placementKey);
    }
    if (Number.isFinite(roundNumber)) {
      params.set("roundNumber", String(Math.round(Number(roundNumber))));
    }
    if (Number.isFinite(sequenceIndex)) {
      params.set("sequenceIndex", String(Math.round(Number(sequenceIndex))));
    }
    if (excludeAdIds && excludeAdIds.length > 0) {
      params.set("excludeAdIds", excludeAdIds.join(","));
    }
    if (allowAnyVenue) {
      params.set("allowAnyVenue", "1");
    }
    params.set("clientCounter", String(counter));

    const load = async () => {
      try {
        const response = await fetch(`/api/ads/slot?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as SlotResponse;
        if (payload.ok) {
          // Keep slot output in sync with server matching to avoid stale ads
          // persisting when placement/variant filters no longer match.
          setAd(payload.ad ?? null);
        }
      } catch {
        // Keep the existing ad visible on network error.
      } finally {
        setLoaded(true);
      }
    };

    void load();
    // stableKey encodes all meaningful props — it's safe to use as the sole dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKey]);

  if (ad) {
    return <AdBanner ad={ad} />;
  }

  if (!showPlaceholder || !loaded) {
    return null;
  }

  return (
    <a
      href="/advertise"
      className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
      aria-label="Open Hightop Challenge advertising intake form"
    >
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100/80 p-6 text-center transition-colors hover:bg-slate-100">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ad Placeholder</p>
        <p className="mt-2 max-w-md text-sm text-slate-700">
          To advertise on Hightop Challenge, please reach out to adinfo@hightopchallenge.com.
        </p>
      </div>
    </a>
  );
}

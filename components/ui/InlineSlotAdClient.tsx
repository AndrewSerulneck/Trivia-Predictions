"use client";

import { useEffect, useState } from "react";
import { AdBanner } from "@/components/ui/AdBanner";
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
  placeholderLabel = "Ad Placeholder",
  placeholderDetails,
  showPlacementDebug = false,
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
  placeholderLabel?: string;
  placeholderDetails?: string;
  showPlacementDebug?: boolean;
}) {
  const [ad, setAd] = useState<Advertisement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
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

    const load = async () => {
      try {
        const response = await fetch(`/api/ads/slot?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as SlotResponse;
        if (payload.ok) {
          setAd(payload.ad ?? null);
        } else {
          setAd(null);
        }
      } catch {
        setAd(null);
      } finally {
        setLoaded(true);
      }
    };

    void load();
  }, [slot, venueId, pageKey, adType, displayTrigger, placementKey, roundNumber, sequenceIndex, excludeAdIds, allowAnyVenue]);

  if (ad) {
    return (
      <div className="space-y-2">
        {showPlacementDebug ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{placeholderLabel}</p>
            {placeholderDetails ? <p className="mt-1 text-xs text-amber-800">{placeholderDetails}</p> : null}
          </div>
        ) : null}
        <AdBanner ad={ad} />
      </div>
    );
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
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{placeholderLabel}</p>
        {placeholderDetails ? (
          <p className="mt-1 text-xs font-medium text-slate-600">{placeholderDetails}</p>
        ) : null}
        <p className="mt-2 max-w-md text-sm text-slate-700">
          To advertise on Hightop Challenge, please reach out to adinfo@hightopchallenge.com.
        </p>
      </div>
    </a>
  );
}

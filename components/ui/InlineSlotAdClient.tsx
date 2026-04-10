"use client";

import { useEffect, useState } from "react";
import { AdBanner } from "@/components/ui/AdBanner";
import type { AdSlot, Advertisement } from "@/types";

type SlotResponse = {
  ok: boolean;
  ad?: Advertisement | null;
  error?: string;
};

export function InlineSlotAdClient({
  slot = "leaderboard-sidebar",
  venueId,
  showPlaceholder = true,
}: {
  slot?: AdSlot;
  venueId?: string;
  showPlaceholder?: boolean;
}) {
  const [ad, setAd] = useState<Advertisement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ slot });
    if (venueId) {
      params.set("venueId", venueId);
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
  }, [slot, venueId]);

  if (ad) {
    return <AdBanner ad={ad} />;
  }

  if (!showPlaceholder || !loaded) {
    return null;
  }

  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100/80 p-6 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ad Placeholder</p>
      <p className="mt-1 text-lg font-semibold text-slate-700">Banner Advertisement Slot</p>
      <p className="mt-2 max-w-md text-sm text-slate-600">This is a placeholder for a venue banner ad.</p>
      <p className="mt-2 max-w-md text-sm text-slate-700">
        To advertise on Hightop Challenge, please reach out to advertising@hightopchallenge.com.
      </p>
    </div>
  );
}

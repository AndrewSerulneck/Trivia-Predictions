"use client";

import { useEffect, useId, useState } from "react";
import { AdBanner } from "@/components/ui/AdBanner";
import { releaseAdTier, requestAdTier, subscribeAdTierChange } from "@/components/ui/adPriority";
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
  const [hasPriority, setHasPriority] = useState(false);
  const ownerId = useId();

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

  useEffect(() => {
    if (!ad) {
      releaseAdTier(ownerId);
      setHasPriority(false);
      return;
    }

    const syncPriority = () => {
      const granted = requestAdTier("other", ownerId);
      setHasPriority(granted);
    };

    syncPriority();
    const unsubscribe = subscribeAdTierChange(syncPriority);
    return () => {
      unsubscribe();
      releaseAdTier(ownerId);
      setHasPriority(false);
    };
  }, [ad, ownerId]);

  if (ad && hasPriority) {
    return <AdBanner ad={ad} />;
  }

  if (ad && !hasPriority) {
    return null;
  }

  if (!showPlaceholder || !loaded) {
    return null;
  }

  return (
    <a
      href="https://mail.google.com/mail/?view=cm&fs=1&to=adinfo@hightopchallenge.com&su=Advertising%20Inquiry%20-%20Hightop%20Challenge"
      className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
      aria-label="Contact Hightop Challenge advertising via email"
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

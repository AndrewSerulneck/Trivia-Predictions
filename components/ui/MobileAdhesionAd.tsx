"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AdBanner } from "@/components/ui/AdBanner";
import { isLandingPopupGateActive, releaseAdTier, requestAdTier, subscribeAdTierChange } from "@/components/ui/adPriority";
import { getVenueId } from "@/lib/storage";
import { isVenueTransitionGateActive } from "@/lib/venueGameTransition";
import type { AdPageKey, Advertisement } from "@/types";

type SlotResponse = {
  ok: boolean;
  ad?: Advertisement | null;
  error?: string;
};

function isAdminRoute(pathname: string | null): boolean {
  return Boolean(pathname?.startsWith("/admin"));
}

function resolvePageKey(pathname: string | null): AdPageKey {
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

export function MobileAdhesionAd() {
  const pathname = usePathname();
  const ownerId = useId();
  const [ad, setAd] = useState<Advertisement | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showDismissButton, setShowDismissButton] = useState(false);
  const [hasPriority, setHasPriority] = useState(false);
  const activeVenueRef = useRef<string>("");

  const loadAd = useCallback(async (venueId: string, pageKey: AdPageKey) => {
    const params = new URLSearchParams({ slot: "mobile-adhesion" });
    if (venueId) {
      params.set("venueId", venueId);
    }
    params.set("pageKey", pageKey);
    params.set("adType", "banner");
    params.set("displayTrigger", "on-load");

    try {
      const response = await fetch(`/api/ads/slot?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as SlotResponse;
      if (!payload.ok) {
        setAd(null);
        setIsDismissed(false);
        setShowDismissButton(false);
        return;
      }
      const nextAd = payload.ad ?? null;
      setAd(nextAd);
      setIsDismissed(false);
      setShowDismissButton(false);
    } catch {
      setAd(null);
      setIsDismissed(false);
      setShowDismissButton(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || isAdminRoute(pathname)) {
      return;
    }

    const venueId = getVenueId() ?? "";
    const pageKey = resolvePageKey(pathname);
    if (ad && activeVenueRef.current === venueId) {
      return;
    }

    activeVenueRef.current = venueId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch updates local ad state after network response.
    void loadAd(venueId, pageKey);
  }, [ad, loadAd, pathname]);

  useEffect(() => {
    if (!ad) {
      return;
    }
    const delaySeconds = Number.isFinite(ad.dismissDelaySeconds)
      ? Math.max(0, Math.round(ad.dismissDelaySeconds))
      : 3;
    const timer = window.setTimeout(() => {
      setShowDismissButton(true);
    }, delaySeconds * 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [ad]);

  useEffect(() => {
    if (typeof window === "undefined" || !ad || isDismissed || isAdminRoute(pathname)) {
      releaseAdTier(ownerId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting local priority state when this ad is ineligible.
      setHasPriority(false);
      return;
    }

    const syncPriority = () => {
      if (isLandingPopupGateActive() || isVenueTransitionGateActive()) {
        releaseAdTier(ownerId);
        setHasPriority(false);
        return;
      }
      const granted = requestAdTier("mobile-adhesion", ownerId);
      setHasPriority(granted);
    };

    syncPriority();
    const unsubscribe = subscribeAdTierChange(syncPriority);
    return () => {
      unsubscribe();
      releaseAdTier(ownerId);
      setHasPriority(false);
    };
  }, [ad, isDismissed, ownerId, pathname]);

  if (!ad || isAdminRoute(pathname) || isDismissed || !hasPriority) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-2 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}
    >
      <div className="relative mx-auto w-full max-w-md pointer-events-auto">
        {showDismissButton ? (
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="tp-clean-button absolute -top-2 right-1 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 shadow"
            aria-label="Close ad"
          >
            x
          </button>
        ) : null}
        <AdBanner ad={ad} variant="adhesion" />
      </div>
    </div>
  );
}

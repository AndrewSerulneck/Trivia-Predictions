"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AdBanner } from "@/components/ui/AdBanner";
import { isLandingPopupGateActive, releaseAdTier, requestAdTier, subscribeAdTierChange } from "@/components/ui/adPriority";
import { getVenueId } from "@/lib/storage";
import { isVenueTransitionGateActive } from "@/lib/venueGameTransition";
import type { AdDisplayTrigger, AdPageKey, Advertisement } from "@/types";

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

function getRoundVariantMax(pageKey: AdPageKey): number {
  if (pageKey === "live-trivia") return 12;
  if (pageKey === "speed-trivia" || pageKey === "trivia") return 3;
  return 1;
}

function normalizeRoundVariant(pageKey: AdPageKey, roundNumber?: number): number | undefined {
  if (!Number.isFinite(roundNumber)) return undefined;
  const max = getRoundVariantMax(pageKey);
  const safeRound = Math.max(1, Math.floor(Number(roundNumber)));
  return ((safeRound - 1) % max) + 1;
}

export function MobileAdhesionAd() {
  const pathname = usePathname();
  const ownerId = useId();
  const [ad, setAd] = useState<Advertisement | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showDismissButton, setShowDismissButton] = useState(false);
  const [hasPriority, setHasPriority] = useState(false);
  const [awaitingScrollTrigger, setAwaitingScrollTrigger] = useState(false);
  const activeVenueRef = useRef<string>("");
  const scrollTriggerFiredRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const maxScrollTopRef = useRef(0);

  const SCROLL_TRIGGER_PX = 120;

  const loadAd = useCallback(async (
    venueId: string,
    pageKey: AdPageKey,
    displayTrigger: AdDisplayTrigger,
    roundNumber?: number
  ) => {
    const params = new URLSearchParams({ slot: "mobile-adhesion" });
    if (venueId) {
      params.set("venueId", venueId);
    }
    params.set("pageKey", pageKey);
    params.set("adType", "banner");
    params.set("displayTrigger", displayTrigger);
    if (Number.isFinite(roundNumber)) {
      params.set("roundNumber", String(Math.floor(Number(roundNumber))));
    }

    try {
      const response = await fetch(`/api/ads/slot?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as SlotResponse;
      if (!payload.ok) {
        setAd(null);
        return null;
      }
      const nextAd = payload.ad ?? null;
      setAd(nextAd);
      return nextAd;
    } catch {
      setAd(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || isAdminRoute(pathname)) {
      return;
    }

    const currentPageKey = resolvePageKey(pathname);
    if (currentPageKey !== "speed-trivia" && currentPageKey !== "live-trivia" && currentPageKey !== "trivia") {
      return;
    }

    const venueId = getVenueId() ?? "";
    const loadRoundBanner = (roundNumber?: number) => {
      const normalizedRound = normalizeRoundVariant(currentPageKey, roundNumber);
      if (!normalizedRound) return;
      void loadAd(venueId, currentPageKey, "round-end", normalizedRound).then((nextAd) => {
        if (!nextAd) return;
        setIsDismissed(false);
        setShowDismissButton(false);
      });
    };

    const onLegacyRoundComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ roundNumber?: number } | undefined>).detail;
      loadRoundBanner(detail?.roundNumber);
    };
    const onRoundBannerEvent = (event: Event) => {
      const detail =
        (event as CustomEvent<{ roundNumber?: number; pageKey?: AdPageKey } | undefined>).detail ?? {};
      if (detail.pageKey && detail.pageKey !== currentPageKey) {
        return;
      }
      loadRoundBanner(detail.roundNumber);
    };

    window.addEventListener("tp:trivia-round-complete", onLegacyRoundComplete as EventListener);
    window.addEventListener("tp:trivia-round-banner", onRoundBannerEvent as EventListener);
    return () => {
      window.removeEventListener("tp:trivia-round-complete", onLegacyRoundComplete as EventListener);
      window.removeEventListener("tp:trivia-round-banner", onRoundBannerEvent as EventListener);
    };
  }, [loadAd, pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || isAdminRoute(pathname)) {
      return;
    }

    const venueId = getVenueId() ?? "";
    const pageKey = resolvePageKey(pathname);
    const routeKey = `${pageKey}:${venueId}`;
    if (activeVenueRef.current === routeKey) {
      return;
    }

    activeVenueRef.current = routeKey;
    scrollTriggerFiredRef.current = false;
    maxScrollTopRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route changes should reset transient banner UI state.
    setAwaitingScrollTrigger(false);
    setIsDismissed(false);
    setShowDismissButton(false);

    void (async () => {
      const initialAd = await loadAd(venueId, pageKey, "on-load");
      if (initialAd) {
        setAwaitingScrollTrigger(false);
        return;
      }
      setAwaitingScrollTrigger(true);
    })();
  }, [loadAd, pathname]);

  useEffect(() => {
    if (!awaitingScrollTrigger || isAdminRoute(pathname)) {
      return;
    }
    const venueId = getVenueId() ?? "";
    const pageKey = resolvePageKey(pathname);

    const onScroll = (event: Event) => {
      if (scrollTriggerFiredRef.current) {
        return;
      }
      if (scrollRafRef.current !== null) {
        return;
      }
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const target = event.target;
        let scrollTop = 0;
        if (target instanceof HTMLElement) {
          scrollTop = target.scrollTop;
        } else {
          scrollTop = window.scrollY;
        }
        maxScrollTopRef.current = Math.max(maxScrollTopRef.current, scrollTop);
        if (maxScrollTopRef.current < SCROLL_TRIGGER_PX) {
          return;
        }

        scrollTriggerFiredRef.current = true;
        console.info("[tp-ads] mobile adhesion on-scroll threshold hit", {
          pageKey,
          thresholdPx: SCROLL_TRIGGER_PX,
          scrollTop: maxScrollTopRef.current,
        });
        void (async () => {
          const nextAd = await loadAd(venueId, pageKey, "on-scroll");
          if (nextAd) {
            setIsDismissed(false);
            setShowDismissButton(false);
          }
          setAwaitingScrollTrigger(false);
        })();
      });
    };

    const gameSurface = document.querySelector<HTMLElement>("[data-venue-game-surface]");
    const pageMain = document.querySelector<HTMLElement>(".tp-page-main");
    const onWindowScroll = () => onScroll(new Event("scroll"));

    window.addEventListener("scroll", onWindowScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    gameSurface?.addEventListener("scroll", onScroll, { passive: true });
    pageMain?.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onWindowScroll);
      document.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      gameSurface?.removeEventListener("scroll", onScroll);
      pageMain?.removeEventListener("scroll", onScroll);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [awaitingScrollTrigger, loadAd, pathname]);

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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[1600] px-2 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}
    >
      <div className="relative mx-auto w-full max-w-md pointer-events-auto">
        {showDismissButton ? (
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="tp-clean-button absolute -top-2 right-1 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-ht-border-soft bg-ht-elevated-2 text-sm font-semibold text-ht-fg-secondary shadow"
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

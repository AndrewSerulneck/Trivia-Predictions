"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getVenueId } from "@/lib/storage";
import { isVenueTransitionGateActive } from "@/lib/venueGameTransition";
import { releaseAdTier, requestAdTier, setLandingPopupGate } from "@/components/ui/adPriority";
import { setScrollLock } from "@/lib/scrollLock";
import { incrementAdCounter } from "@/lib/adFrequency";
import type { Advertisement, AdPageKey } from "@/types";

type PopupTrigger = "popup-on-entry" | "popup-on-scroll" | "popup-round-end";

type SlotResponse = {
  ok: boolean;
  ad?: Advertisement | null;
  error?: string;
};

type PopupState = {
  open: boolean;
  trigger: PopupTrigger;
  ad: Advertisement;
};

type PopupGuaranteeMeta = {
  guaranteed: boolean;
};

const TRIVIA_ROUND_ENDED_ACTIVE_KEY = "tp:trivia:round-ended-active:v1";

function isTriviaRoundEndedActive(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.sessionStorage.getItem(TRIVIA_ROUND_ENDED_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

function resolvePageKey(pathname: string | null): AdPageKey | null {
  if (!pathname || pathname === "/" || pathname === "/join") {
    return "join";
  }
  if (/^\/venue\/[^/]+/.test(pathname)) {
    return "venue";
  }
  if (pathname.startsWith("/trivia")) {
    return "trivia";
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
  return null;
}

function cooldownStorageKey(trigger: PopupTrigger, roundNumber?: number): string {
  if (trigger === "popup-round-end" && Number.isFinite(roundNumber)) {
    const safeRound = Math.max(1, Math.min(3, Math.round(Number(roundNumber))));
    return `tp:popup-last-shown:${trigger}:r${safeRound}`;
  }
  return `tp:popup-last-shown:${trigger}`;
}

function readLastShownAt(trigger: PopupTrigger, roundNumber?: number): number {
  if (typeof window === "undefined") {
    return 0;
  }
  try {
    const value = window.sessionStorage.getItem(cooldownStorageKey(trigger, roundNumber));
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeLastShownAt(trigger: PopupTrigger, timestamp: number, roundNumber?: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(cooldownStorageKey(trigger, roundNumber), String(timestamp));
  } catch {
    // Ignore session storage failures.
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForWindowLoadReady(timeoutMs = 5000): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  if (document.readyState !== "complete") {
    await new Promise<void>((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener("load", onLoad);
        window.clearTimeout(timeoutId);
        resolve();
      };
      const onLoad = () => finish();
      const timeoutId = window.setTimeout(finish, Math.max(1200, timeoutMs));
      window.addEventListener("load", onLoad, { once: true });
    });
  }
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
  await wait(140);
}

async function waitForVenueHomeReady(pathname: string | null, timeoutMs = 6000): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  await waitForWindowLoadReady(timeoutMs);
  try {
    const raw = window.sessionStorage.getItem("tp:venue-home-ready:v1");
    if (raw) {
      const parsed = JSON.parse(raw) as { path?: string; at?: number };
      const readyPath = String(parsed.path ?? "");
      const at = Number(parsed.at ?? 0);
      const expectedPath = String(pathname ?? "");
      if (
        (!expectedPath || !readyPath || readyPath === expectedPath) &&
        Number.isFinite(at) &&
        at > 0 &&
        Date.now() - at <= 15000
      ) {
        return;
      }
    }
  } catch {
    // Ignore storage parsing failures.
  }
  await new Promise<void>((resolve) => {
    let resolved = false;
    const expectedPath = String(pathname ?? "");
    const finish = () => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener("tp:venue-home-ready", onReady as EventListener);
      window.clearTimeout(timeoutId);
      resolve();
    };
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string } | undefined>).detail;
      const readyPath = String(detail?.path ?? "");
      if (!expectedPath || !readyPath || readyPath === expectedPath) {
        finish();
      }
    };
    const timeoutId = window.setTimeout(finish, Math.max(1800, timeoutMs));
    window.addEventListener("tp:venue-home-ready", onReady as EventListener);
  });
}

export function PopupAds() {
  const pathname = usePathname();
  const popupOwnerId = useId();
  const [popup, setPopup] = useState<PopupState | null>(null);
  const guaranteeMetaRef = useRef<PopupGuaranteeMeta>({ guaranteed: false });
  const scrollTriggeredRef = useRef<Record<string, boolean>>({});
  const dismissedByTriggerRef = useRef<Record<PopupTrigger, boolean>>({
    "popup-on-entry": false,
    "popup-on-scroll": false,
    "popup-round-end": false,
  });
  const popupOpenRef = useRef(false);
  const popupOpeningRef = useRef(false);
  const pageReadyRef = useRef(false);
  const pendingRoundPopupQueueRef = useRef<number[]>([]);
  const scrollRafRef = useRef<number | null>(null);
  const maxObservedScrollPxRef = useRef<Record<string, number>>({});

  useEffect(() => {
    popupOpenRef.current = Boolean(popup?.open);
  }, [popup?.open]);

  const loadSlotAd = useCallback(async (slot: "popup-on-entry" | "popup-on-scroll", options: {
    pageKey: AdPageKey;
    displayTrigger: "on-load" | "on-scroll" | "round-end";
    roundNumber?: number;
  }) => {
    const venueId = typeof window !== "undefined" ? getVenueId() : "";
    const counterKey = `popup:${slot}:${options.pageKey}`;
    const counter = incrementAdCounter(counterKey);

    const params = new URLSearchParams({ slot });
    if (venueId) {
      params.set("venueId", venueId);
    }
    params.set("pageKey", options.pageKey);
    params.set("adType", "popup");
    params.set("displayTrigger", options.displayTrigger);
    params.set("clientCounter", String(counter));
    if (Number.isFinite(options.roundNumber)) {
      params.set("roundNumber", String(Math.round(Number(options.roundNumber))));
    }

    const response = await fetch(`/api/ads/slot?${params.toString()}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as SlotResponse;
    if (!payload.ok) {
      throw new Error(payload.error ?? "Unable to load ad slot.");
    }
    return payload.ad ?? null;
  }, []);

  const showPopup = useCallback(
    async (trigger: PopupTrigger, options: {
      pageKey: AdPageKey;
      displayTrigger: "on-load" | "on-scroll" | "round-end";
      roundNumber?: number;
    }): Promise<boolean> => {
      if (typeof window === "undefined") {
        return false;
      }
      if (popupOpenRef.current || popupOpeningRef.current) {
        return false;
      }
      if (isVenueTransitionGateActive()) {
        return false;
      }
      if (dismissedByTriggerRef.current[trigger]) {
        return false;
      }
      if (trigger === "popup-round-end" && !isTriviaRoundEndedActive()) {
        return false;
      }
      popupOpeningRef.current = true;

      try {
        const slot = trigger === "popup-on-scroll" ? "popup-on-scroll" : "popup-on-entry";
        const ad = await loadSlotAd(slot, options);
        if (!ad) {
          return false;
        }
        const guaranteed = Number(ad.frequencyInterval ?? 1) === 1 && Number(ad.popupCooldownSeconds ?? 0) <= 0;
        guaranteeMetaRef.current = { guaranteed };

        const cooldownSeconds = Number.isFinite(ad.popupCooldownSeconds)
          ? Math.max(0, Math.round(ad.popupCooldownSeconds))
          : 180;
        const now = Date.now();
        const lastShownAt = readLastShownAt(trigger, options.roundNumber);
        if (cooldownSeconds > 0 && lastShownAt > 0 && now - lastShownAt < cooldownSeconds * 1000) {
          return false;
        }

        if (popupOpenRef.current) {
          return false;
        }

        const hasPriority = guaranteed ? true : requestAdTier("popup", popupOwnerId);
        if (!hasPriority) {
          return false;
        }

        writeLastShownAt(trigger, now, options.roundNumber);
        popupOpenRef.current = true;
        setPopup({
          open: true,
          trigger,
          ad,
        });
        return true;
      } catch {
        return false;
      } finally {
        popupOpeningRef.current = false;
      }
    },
    [loadSlotAd, popupOwnerId]
  );

  const closePopup = useCallback(() => {
    if (popup) {
      const shouldSuppressTrigger = popup.trigger !== "popup-round-end";
      if (shouldSuppressTrigger) {
        dismissedByTriggerRef.current[popup.trigger] = true;
      }
      if (popup.trigger === "popup-on-entry") {
        dismissedByTriggerRef.current["popup-on-scroll"] = true;
        setLandingPopupGate(false);
      }
    }
    // Release scroll lock immediately on close — don't wait for the effect cycle.
    setScrollLock(`popup-ad:${popupOwnerId}`, false);
    popupOpenRef.current = false;
    popupOpeningRef.current = false;
    if (!guaranteeMetaRef.current.guaranteed) {
      releaseAdTier(popupOwnerId);
    }
    guaranteeMetaRef.current = { guaranteed: false };
    setPopup((prev) => (prev ? { ...prev, open: false } : prev));
  }, [popup, popupOwnerId]);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      dismissedByTriggerRef.current = {
        "popup-on-entry": false,
        "popup-on-scroll": false,
        "popup-round-end": false,
      };
      pageReadyRef.current = false;
      popupOpenRef.current = false;
      popupOpeningRef.current = false;
      releaseAdTier(popupOwnerId);
      setLandingPopupGate(false);
      setPopup(null);
    }, 0);

    const pageKey = resolvePageKey(pathname);
    if (!pageKey || pathname.startsWith("/admin")) {
      setLandingPopupGate(false);
      return () => {
        window.clearTimeout(resetTimer);
      };
    }
    pageReadyRef.current = false;
    setLandingPopupGate(true);

    let cancelled = false;
    void (async () => {
      try {
        await waitForWindowLoadReady();
        if (cancelled) {
          setLandingPopupGate(false);
          return;
        }
        // Never allow venue-page popups to "catch up" after a game-card tap
        // starts a transition gate; that can block entering trivia.
        if (pageKey === "venue" && isVenueTransitionGateActive()) {
          setLandingPopupGate(false);
          return;
        }
        // Trivia landing popups may race with initial transition completion.
        // Wait briefly only on trivia routes.
        if (pageKey === "trivia") {
          const gateStart = Date.now();
          while (!cancelled && isVenueTransitionGateActive() && Date.now() - gateStart < 7000) {
            await wait(120);
          }
        }
        if (cancelled || isVenueTransitionGateActive()) {
          setLandingPopupGate(false);
          return;
        }
        pageReadyRef.current = true;
        await wait(260);
        if (cancelled) {
          setLandingPopupGate(false);
          return;
        }
        const opened = await showPopup("popup-on-entry", { pageKey, displayTrigger: "on-load" });
        if (!opened) {
          setLandingPopupGate(false);
        }
      } catch {
        setLandingPopupGate(false);
      }
    })();

    return () => {
      cancelled = true;
      pageReadyRef.current = false;
      window.clearTimeout(resetTimer);
      setLandingPopupGate(false);
    };
  }, [pathname, popupOwnerId, showPopup]);

  useEffect(() => {
    const pageKey = resolvePageKey(pathname);
    if (!pageKey || pathname.startsWith("/admin")) {
      return;
    }

    const key = pathname;
    scrollTriggeredRef.current[key] = false;
    maxObservedScrollPxRef.current[key] = 0;
    const minPixelThreshold = 140;

    const onScroll = (event?: Event) => {
      if (!pageReadyRef.current) {
        return;
      }
      if (popupOpenRef.current) {
        return;
      }
      if (isVenueTransitionGateActive()) {
        return;
      }
      if (scrollTriggeredRef.current[key]) {
        return;
      }
      if (scrollRafRef.current !== null) {
        return;
      }
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        if (scrollTriggeredRef.current[key]) {
          return;
        }

        const target = event?.target;
        const scrollContainer =
          (target instanceof HTMLElement ? target : null) ??
          document.querySelector<HTMLElement>("[data-venue-game-scroll]") ??
          document.querySelector<HTMLElement>(".tp-page-main") ??
          null;

        const currentScrollTop = scrollContainer ? scrollContainer.scrollTop : window.scrollY;
        const currentViewportHeight = scrollContainer ? scrollContainer.clientHeight : window.innerHeight;
        const currentScrollHeight = scrollContainer ? scrollContainer.scrollHeight : document.documentElement.scrollHeight;

        const seenMax = Math.max(maxObservedScrollPxRef.current[key] ?? 0, currentScrollTop);
        maxObservedScrollPxRef.current[key] = seenMax;

        const percentThreshold = currentScrollHeight * 0.58;
        const progressValue = currentScrollTop + currentViewportHeight;
        const hitThreshold = seenMax >= minPixelThreshold || progressValue >= percentThreshold;

        if (!hitThreshold) {
          return;
        }

        scrollTriggeredRef.current[key] = true;
        console.info("[tp-ads] popup on-scroll threshold hit", {
          pageKey,
          scrollTop: currentScrollTop,
          maxScrollTop: seenMax,
          thresholdPx: minPixelThreshold,
        });
        void showPopup("popup-on-scroll", { pageKey, displayTrigger: "on-scroll" });
      });
    };

    const gameScrollSurface = document.querySelector<HTMLElement>("[data-venue-game-scroll]");
    const gameSurface = document.querySelector<HTMLElement>("[data-venue-game-surface]");
    const pageMain = document.querySelector<HTMLElement>(".tp-page-main");
    const primaryScrollContainer = gameScrollSurface ?? gameSurface ?? pageMain;

    primaryScrollContainer?.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      primaryScrollContainer?.removeEventListener("scroll", onScroll);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [pathname, showPopup]);

  useEffect(() => {
    const pageKey = resolvePageKey(pathname);
    if (pageKey !== "trivia" || pathname?.startsWith("/admin")) {
      return;
    }

    const onRoundComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ roundNumber?: number }>).detail;
      const roundNumber = Number.isFinite(detail?.roundNumber) ? Math.round(Number(detail?.roundNumber)) : undefined;
      const requestedRound = roundNumber && roundNumber >= 1 && roundNumber <= 3 ? roundNumber : undefined;
      if (requestedRound) {
        pendingRoundPopupQueueRef.current = pendingRoundPopupQueueRef.current.filter((value) => value !== requestedRound);
      }
      // Delay so the round-summary UI has time to render before the popup
      // covers it — the ad should appear *over* the summary, not before it.
      void wait(350).then(() =>
        showPopup("popup-round-end", {
          pageKey: "trivia",
          displayTrigger: "round-end",
          roundNumber: requestedRound,
        }).then((opened) => {
          if (!opened && requestedRound) {
            pendingRoundPopupQueueRef.current.push(requestedRound);
          }
        })
      );
    };

    window.addEventListener("tp:trivia-round-complete", onRoundComplete as EventListener);
    return () => {
      window.removeEventListener("tp:trivia-round-complete", onRoundComplete as EventListener);
    };
  }, [pathname, showPopup]);

  useEffect(() => {
    const pageKey = resolvePageKey(pathname);
    if (pageKey !== "trivia" || pathname?.startsWith("/admin")) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!isTriviaRoundEndedActive()) {
        pendingRoundPopupQueueRef.current = [];
        return;
      }
      if (popupOpenRef.current || popupOpeningRef.current || isVenueTransitionGateActive()) {
        return;
      }
      const nextRound = pendingRoundPopupQueueRef.current.shift();
      if (!nextRound) {
        return;
      }
      void showPopup("popup-round-end", {
        pageKey: "trivia",
        displayTrigger: "round-end",
        roundNumber: nextRound,
      }).then((opened) => {
        if (!opened) {
          pendingRoundPopupQueueRef.current.push(nextRound);
        }
      });
    }, 300);

    return () => {
      window.clearInterval(intervalId);
      pendingRoundPopupQueueRef.current = [];
    };
  }, [pathname, showPopup]);

  useEffect(() => {
    if (!popup?.open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopup();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closePopup, popup?.open]);

  useEffect(() => {
    setScrollLock(`popup-ad:${popupOwnerId}`, Boolean(popup?.open), "popup");
    return () => {
      setScrollLock(`popup-ad:${popupOwnerId}`, false);
    };
  }, [popup?.open, popupOwnerId]);

  useEffect(() => {
    return () => {
      releaseAdTier(popupOwnerId);
    };
  }, [popupOwnerId]);

  if (!popup?.open) {
    return null;
  }

  const adRatio = popup.ad.width > 0 && popup.ad.height > 0 ? popup.ad.width / popup.ad.height : 9 / 16;
  const safeWidth = "calc(100vw - 28px)";
  const safeHeight = "calc(100svh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 190px)";
  const modalMaxHeight = "calc(100svh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px)";
  const frameStyle = {
    width: `min(${safeWidth}, calc((${safeHeight}) * ${adRatio}))`,
    height: `min(${safeHeight}, calc((${safeWidth}) / ${adRatio}))`,
  };

  return (
    <div
      data-tp-scroll-lock="active"
      className="pointer-events-auto fixed inset-0 z-[5000] flex items-center justify-center bg-slate-900/30 p-2"
      style={{
        top: 0,
        left: 0,
        width: "100vw",
        height: "100svh",
        touchAction: "none",
        paddingTop: "max(env(safe-area-inset-top, 0px), 8px)",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)",
      }}
    >
      <div
        className="pointer-events-auto animate-tp-popup-sheet-up w-fit max-w-[calc(100vw-12px)] overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.28)]"
        style={{ maxHeight: modalMaxHeight }}
      >
        <div className="flex items-center justify-between border-b border-amber-200 bg-gradient-to-r from-amber-100 via-orange-100 to-red-100 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Sponsored</p>
          <button
            type="button"
            onClick={closePopup}
            className="tp-clean-button inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-semibold text-slate-700"
            aria-label="Close advertisement"
          >
            ×
          </button>
        </div>

        <a
          href={`/api/ads/click?id=${encodeURIComponent(popup.ad.id)}`}
          target="_blank"
          rel="noreferrer noopener"
          className="block p-0.5"
        >
          <div className="mx-auto flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={popup.ad.imageUrl}
              alt={popup.ad.altText}
              width={popup.ad.width}
              height={popup.ad.height}
              style={frameStyle}
              className="block rounded-lg border border-slate-200 bg-slate-100 object-contain"
            />
          </div>
        </a>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getVenueId } from "@/lib/storage";
import { releaseAdTier, requestAdTier, setLandingPopupGate } from "@/components/ui/adPriority";
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
  if (pathname.startsWith("/predictions")) {
    return "sports-predictions";
  }
  if (pathname.startsWith("/bingo")) {
    return "sports-bingo";
  }
  return null;
}

function readLastShownAt(trigger: PopupTrigger): number {
  if (typeof window === "undefined") {
    return 0;
  }
  try {
    const value = window.sessionStorage.getItem(`tp:popup-last-shown:${trigger}`);
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeLastShownAt(trigger: PopupTrigger, timestamp: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(`tp:popup-last-shown:${trigger}`, String(timestamp));
  } catch {
    // Ignore session storage failures.
  }
}

export function PopupAds() {
  const pathname = usePathname();
  const popupOwnerId = useId();
  const [popup, setPopup] = useState<PopupState | null>(null);
  const scrollTriggeredRef = useRef<Record<string, boolean>>({});
  const dismissedByTriggerRef = useRef<Record<PopupTrigger, boolean>>({
    "popup-on-entry": false,
    "popup-on-scroll": false,
    "popup-round-end": false,
  });
  const popupOpenRef = useRef(false);
  const popupOpeningRef = useRef(false);

  useEffect(() => {
    popupOpenRef.current = Boolean(popup?.open);
  }, [popup?.open]);

  const loadSlotAd = useCallback(async (slot: "popup-on-entry" | "popup-on-scroll", options: {
    pageKey: AdPageKey;
    displayTrigger: "on-load" | "on-scroll" | "round-end";
    roundNumber?: number;
  }) => {
    const venueId = typeof window !== "undefined" ? getVenueId() : "";
    const params = new URLSearchParams({ slot });
    if (venueId) {
      params.set("venueId", venueId);
    }
    params.set("pageKey", options.pageKey);
    params.set("adType", "popup");
    params.set("displayTrigger", options.displayTrigger);
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
      if (dismissedByTriggerRef.current[trigger]) {
        return false;
      }
      popupOpeningRef.current = true;

      try {
        const slot = trigger === "popup-on-scroll" ? "popup-on-scroll" : "popup-on-entry";
        const ad = await loadSlotAd(slot, options);
        if (!ad) {
          return false;
        }

        const cooldownSeconds = Number.isFinite(ad.popupCooldownSeconds)
          ? Math.max(0, Math.round(ad.popupCooldownSeconds))
          : 180;
        const now = Date.now();
        const lastShownAt = readLastShownAt(trigger);
        if (cooldownSeconds > 0 && lastShownAt > 0 && now - lastShownAt < cooldownSeconds * 1000) {
          return false;
        }

        if (popupOpenRef.current) {
          return false;
        }

        const hasPriority = requestAdTier("popup", popupOwnerId);
        if (!hasPriority) {
          return false;
        }

        writeLastShownAt(trigger, now);
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
      dismissedByTriggerRef.current[popup.trigger] = true;
      if (popup.trigger === "popup-on-entry") {
        // Avoid showing a second popup immediately after dismissing entry popup.
        dismissedByTriggerRef.current["popup-on-scroll"] = true;
        setLandingPopupGate(false);
      }
    }
    popupOpenRef.current = false;
    popupOpeningRef.current = false;
    releaseAdTier(popupOwnerId);
    setPopup((prev) => (prev ? { ...prev, open: false } : prev));
  }, [popup, popupOwnerId]);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      dismissedByTriggerRef.current = {
        "popup-on-entry": false,
        "popup-on-scroll": false,
        "popup-round-end": false,
      };
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

    setLandingPopupGate(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const opened = await showPopup("popup-on-entry", { pageKey, displayTrigger: "on-load" });
        if (!opened) {
          setLandingPopupGate(false);
        }
      })();
    }, 450);

    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(timer);
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

    const onScroll = () => {
      if (popupOpenRef.current) {
        return;
      }
      if (scrollTriggeredRef.current[key]) {
        return;
      }
      const doc = document.documentElement;
      const scrolled = doc.scrollTop + window.innerHeight;
      const threshold = doc.scrollHeight * 0.58;
      if (scrolled >= threshold) {
        scrollTriggeredRef.current[key] = true;
        void showPopup("popup-on-scroll", { pageKey, displayTrigger: "on-scroll" });
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
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
      void showPopup("popup-round-end", {
        pageKey: "trivia",
        displayTrigger: "round-end",
        roundNumber,
      });
    };

    window.addEventListener("tp:trivia-round-complete", onRoundComplete as EventListener);
    return () => {
      window.removeEventListener("tp:trivia-round-complete", onRoundComplete as EventListener);
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
    if (!popup?.open || typeof window === "undefined") {
      return;
    }

    const body = document.body;
    const root = document.documentElement;
    body.classList.add("tp-modal-open");
    root.classList.add("tp-modal-open");

    return () => {
      body.classList.remove("tp-modal-open");
      root.classList.remove("tp-modal-open");
    };
  }, [popup?.open]);

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
      className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-2"
      style={{
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

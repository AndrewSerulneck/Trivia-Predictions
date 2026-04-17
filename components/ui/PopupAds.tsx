"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getVenueId } from "@/lib/storage";
import type { Advertisement, AdSlot } from "@/types";

type PopupTrigger = "popup-on-entry" | "popup-on-scroll";

type SlotResponse = {
  ok: boolean;
  ad?: Advertisement | null;
  error?: string;
};

type PopupState = {
  open: boolean;
  trigger: PopupTrigger;
  ad?: Advertisement;
};

const PLACEHOLDER_BY_TRIGGER: Record<PopupTrigger, { title: string; subtitle: string }> = {
  "popup-on-entry": {
    title: "Placeholder Advertisement",
    subtitle: "To advertise on Hightop Challenge, please reach out to adinfo@hightopchallenge.com.",
  },
  "popup-on-scroll": {
    title: "Placeholder Advertisement",
    subtitle: "To advertise on Hightop Challenge, please reach out to adinfo@hightopchallenge.com.",
  },
};

function isPopupSlot(slot: AdSlot): slot is PopupTrigger {
  return slot === "popup-on-entry" || slot === "popup-on-scroll";
}

function isVenueRoute(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }
  return /^\/venue\/[^/]+/.test(pathname);
}

export function PopupAds() {
  const pathname = usePathname();
  const [popup, setPopup] = useState<PopupState | null>(null);
  const scrollTriggeredRef = useRef<Record<string, boolean>>({});
  const dismissedByTriggerRef = useRef<Record<PopupTrigger, boolean>>({
    "popup-on-entry": false,
    "popup-on-scroll": false,
  });
  const popupOpenRef = useRef(false);
  const popupOpeningRef = useRef(false);

  useEffect(() => {
    popupOpenRef.current = Boolean(popup?.open);
  }, [popup?.open]);

  const loadSlotAd = useCallback(async (slot: PopupTrigger) => {
    const venueId = typeof window !== "undefined" ? getVenueId() : "";
    const params = new URLSearchParams({ slot });
    if (venueId) {
      params.set("venueId", venueId);
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
    async (trigger: PopupTrigger) => {
      if (typeof window === "undefined") {
        return;
      }
      if (popupOpenRef.current || popupOpeningRef.current) {
        return;
      }
      if (dismissedByTriggerRef.current[trigger]) {
        return;
      }
      popupOpeningRef.current = true;

      try {
        const ad = await loadSlotAd(trigger);
        if (popupOpenRef.current) {
          return;
        }
        popupOpenRef.current = true;
        setPopup({
          open: true,
          trigger,
          ad: ad ?? undefined,
        });
      } catch {
        if (popupOpenRef.current) {
          return;
        }
        popupOpenRef.current = true;
        setPopup({
          open: true,
          trigger,
        });
      } finally {
        popupOpeningRef.current = false;
      }
    },
    [loadSlotAd]
  );

  const closePopup = useCallback(() => {
    if (popup) {
      dismissedByTriggerRef.current[popup.trigger] = true;
      if (popup.trigger === "popup-on-entry") {
        // Avoid showing a second popup immediately after dismissing entry popup.
        dismissedByTriggerRef.current["popup-on-scroll"] = true;
      }
    }
    popupOpenRef.current = false;
    popupOpeningRef.current = false;
    setPopup((prev) => (prev ? { ...prev, open: false } : prev));
  }, [popup]);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      dismissedByTriggerRef.current = {
        "popup-on-entry": false,
        "popup-on-scroll": false,
      };
      popupOpenRef.current = false;
      popupOpeningRef.current = false;
      setPopup(null);
    }, 0);

    if (!isVenueRoute(pathname) || pathname.startsWith("/admin")) {
      return () => {
        window.clearTimeout(resetTimer);
      };
    }

    const timer = window.setTimeout(() => {
      void showPopup("popup-on-entry");
    }, 450);

    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(timer);
    };
  }, [pathname, showPopup]);

  useEffect(() => {
    if (!isVenueRoute(pathname) || pathname.startsWith("/admin")) {
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
        void showPopup("popup-on-scroll");
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
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
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    const previousBodyTouchAction = body.style.touchAction;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscrollBehavior = root.style.overscrollBehavior;
    const scrollY = window.scrollY;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.touchAction = "none";
    body.style.overscrollBehavior = "none";
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      body.style.touchAction = previousBodyTouchAction;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, [popup?.open]);

  if (!popup?.open || !isPopupSlot(popup.trigger)) {
    return null;
  }

  const placeholder = PLACEHOLDER_BY_TRIGGER[popup.trigger];
  const adRatio = popup.ad && popup.ad.width > 0 && popup.ad.height > 0 ? popup.ad.width / popup.ad.height : 9 / 16;
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
      onWheelCapture={(event) => {
        event.preventDefault();
      }}
      onTouchMoveCapture={(event) => {
        event.preventDefault();
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

        {popup.ad ? (
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
        ) : (
          <div className="p-0.5">
            <div className="mx-auto flex items-center justify-center">
              <div
                style={frameStyle}
                className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-amber-300 bg-gradient-to-br from-[#f8e6d5] via-[#f2d4b5] to-[#e7b08b] p-6 text-center"
              >
                <p className="text-lg font-black text-slate-900">{placeholder.title}</p>
                <p className="mt-2 text-sm text-slate-700">{placeholder.subtitle}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

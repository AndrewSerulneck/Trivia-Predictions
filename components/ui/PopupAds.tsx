"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    subtitle: "Ad creative coming soon.",
  },
  "popup-on-scroll": {
    title: "Placeholder Advertisement",
    subtitle: "Ad creative coming soon.",
  },
};

function isPopupSlot(slot: AdSlot): slot is PopupTrigger {
  return slot === "popup-on-entry" || slot === "popup-on-scroll";
}

export function PopupAds() {
  const pathname = usePathname();
  const [popup, setPopup] = useState<PopupState | null>(null);
  const scrollTriggeredRef = useRef<Record<string, boolean>>({});

  const dismissKeyPrefix = useMemo(() => `tp:popup-ad:dismissed:${pathname ?? ""}`, [pathname]);

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

      const dismissKey = `${dismissKeyPrefix}:${trigger}`;
      if (window.sessionStorage.getItem(dismissKey) === "1") {
        return;
      }

      try {
        const ad = await loadSlotAd(trigger);
        setPopup({
          open: true,
          trigger,
          ad: ad ?? undefined,
        });
      } catch {
        setPopup({
          open: true,
          trigger,
        });
      }
    },
    [dismissKeyPrefix, loadSlotAd]
  );

  const closePopup = useCallback(() => {
    if (typeof window !== "undefined" && popup) {
      window.sessionStorage.setItem(`${dismissKeyPrefix}:${popup.trigger}`, "1");
    }
    setPopup((prev) => (prev ? { ...prev, open: false } : prev));
  }, [dismissKeyPrefix, popup]);

  useEffect(() => {
    setPopup(null);
    if (!pathname || pathname.startsWith("/admin")) {
      return;
    }

    const timer = window.setTimeout(() => {
      void showPopup("popup-on-entry");
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [pathname, showPopup]);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) {
      return;
    }

    const key = pathname;
    scrollTriggeredRef.current[key] = false;

    const onScroll = () => {
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

  if (!popup?.open || !isPopupSlot(popup.trigger)) {
    return null;
  }

  const placeholder = PLACEHOLDER_BY_TRIGGER[popup.trigger];

  return (
    <div className="pointer-events-none fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/30 p-2">
      <div className="pointer-events-auto animate-tp-popup-sheet-up h-[82dvh] w-full max-w-md overflow-hidden rounded-t-2xl border border-slate-300 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.28)]">
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
            className="block h-[calc(82dvh-49px)] p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={popup.ad.imageUrl}
              alt={popup.ad.altText}
              width={popup.ad.width}
              height={popup.ad.height}
              className="h-full w-full rounded-lg border border-slate-200 object-cover"
            />
          </a>
        ) : (
          <div className="flex h-[calc(82dvh-49px)] items-center justify-center p-3">
            <div className="w-full rounded-xl border border-dashed border-amber-300 bg-gradient-to-br from-[#f8e6d5] via-[#f2d4b5] to-[#e7b08b] p-6 text-center">
              <p className="text-lg font-black text-slate-900">{placeholder.title}</p>
              <p className="mt-2 text-sm text-slate-700">{placeholder.subtitle}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

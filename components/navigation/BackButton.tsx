"use client";

import { useRouter } from "next/navigation";
import { getVenueId } from "@/lib/storage";

type BackButtonProps = {
  href?: string;
  label?: string;
  preferHref?: boolean;
  venueHomeFallback?: boolean;
};

export function BackButton({
  href = "/",
  label = "Back",
  preferHref = false,
  venueHomeFallback = false,
}: BackButtonProps) {
  const router = useRouter();

  const resolveHref = () => {
    if (!venueHomeFallback) {
      return href;
    }
    const venueId = getVenueId()?.trim() ?? "";
    if (!venueId) {
      return href;
    }
    return `/venue/${encodeURIComponent(venueId)}`;
  };

  const getInternalReferrerPath = (): string => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return "";
    }
    const referrer = document.referrer?.trim();
    if (!referrer) {
      return "";
    }

    try {
      const parsedReferrer = new URL(referrer);
      if (parsedReferrer.origin !== window.location.origin) {
        return "";
      }

      const nextPath = `${parsedReferrer.pathname}${parsedReferrer.search}${parsedReferrer.hash}`;
      if (!nextPath || nextPath.startsWith("/api/") || nextPath.startsWith("/advertise")) {
        return "";
      }

      return nextPath;
    } catch {
      return "";
    }
  };

  const handleBack = () => {
    const fallbackHref = resolveHref();

    if (preferHref) {
      router.push(fallbackHref);
      return;
    }

    if (typeof window !== "undefined") {
      const currentUrl = window.location.href;
      window.history.back();

      window.setTimeout(() => {
        if (window.location.href !== currentUrl) {
          return;
        }
        const referrerPath = getInternalReferrerPath();
        router.push(referrerPath || fallbackHref);
      }, 150);
      return;
    }

    router.push(fallbackHref);
  };

  const triggerBackHaptic = () => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    navigator.vibrate(14);
  };

  return (
    <button
      type="button"
      onMouseDown={triggerBackHaptic}
      onClick={handleBack}
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-4 py-2.5 text-sm font-semibold text-[#fff7ea] shadow-sm shadow-[#1c2b3a]/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9784e]/60 active:scale-95 active:brightness-90"
    >
      <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff7ea]/20 text-xs">
        ←
      </span>
      {label}
    </button>
  );
}

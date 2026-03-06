"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getVenueId } from "@/lib/storage";

export function BackToVenueButton() {
  const [href, setHref] = useState("/");

  useEffect(() => {
    const venueId = getVenueId();
    setHref(venueId ? `/venue/${venueId}` : "/");
  }, []);

  const triggerBackHaptic = () => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    navigator.vibrate(14);
  };

  return (
    <Link
      href={href}
      role="button"
      onMouseDown={triggerBackHaptic}
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-blue-300 bg-gradient-to-r from-blue-700 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:scale-95 active:brightness-90"
    >
      <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs">
        ←
      </span>
      Back to Venue Home Page
    </Link>
  );
}

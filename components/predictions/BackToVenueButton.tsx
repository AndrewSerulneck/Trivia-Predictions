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

  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      Back to Venue Home Page.
    </Link>
  );
}

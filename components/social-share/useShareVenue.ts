"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { readShareVenue, rememberShareVenue, toShareVenue, type ShareVenue } from "@/lib/socialShare/shareVenue";
import { getVenueById } from "@/lib/venues";

/**
 * The bar for a share picture. Read from what the venue hub remembered (no request); only if
 * nothing is remembered AND the share sheet is open, the one venue row is read, once per venue.
 * What it shows is decided by `applyShareVenue` (lib/socialShare/shareVenue.ts).
 */
export const useShareVenue = (venueId: string, active: boolean): ShareVenue | null => {
  const stored = useMemo(() => (active || venueId ? readShareVenue(venueId) : null), [active, venueId]);
  const [fetched, setFetched] = useState<ShareVenue | null>(null);
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active || stored || !venueId || requestedRef.current === venueId) return;
    requestedRef.current = venueId;
    void getVenueById(venueId).then((venue) => {
      if (!venue) return;
      rememberShareVenue(venue);
      setFetched(toShareVenue(venue));
    }).catch(() => undefined);
  }, [active, stored, venueId]);

  return stored ?? (fetched?.id === venueId ? fetched : null);
};

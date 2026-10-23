"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StorySharePayload } from "@/lib/socialShare/contracts";
import { readShareVenue, rememberShareVenue, toShareVenue, type ShareVenue } from "@/lib/socialShare/shareVenue";
import { getVenueById } from "@/lib/venues";

/**
 * The bar for a share picture. Read from what the venue hub remembered (no request); only if
 * nothing is remembered AND the share sheet is open, the one venue row is read, once per venue.
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

/** The payload with the bar's display name and address filled in (the screen's own name wins only when none is known). */
export const withShareVenue = (payload: StorySharePayload, venue: ShareVenue | null): StorySharePayload => ({
  ...payload,
  venueName: venue?.name ?? payload.venueName,
  venueAddress: payload.venueAddress ?? venue?.address ?? null,
});

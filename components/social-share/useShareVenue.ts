"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  readShareVenue,
  rememberShareVenue,
  resolveShareVenue,
  toShareVenue,
  type ShareVenueChoice,
  type ShareVenueRead,
} from "@/lib/socialShare/shareVenue";
import { fetchVenueById } from "@/lib/venues";

/**
 * The bar for a share picture, and whether it is settled enough to send (9f.4). Read from what the
 * venue hub remembered (no request) when that is under 10 minutes old; otherwise the one venue row is
 * read once per venue per sheet open (the sheet mounts this only while open). Until that read settles
 * `ready` is false and the sheet sends nothing. The rules are `resolveShareVenue`; what the picture
 * shows is `applyShareVenue` (lib/socialShare/shareVenue.ts).
 */
export const useShareVenue = (venueId: string, active: boolean): { venue: ShareVenueChoice; ready: boolean } => {
  const stored = useMemo(() => (active && venueId ? readShareVenue(venueId) : null), [active, venueId]);
  const [read, setRead] = useState<{ venueId: string; result: ShareVenueRead } | null>(null);
  const requestedRef = useRef<string | null>(null);
  const needsRead = active && !!venueId && !stored?.fresh;

  useEffect(() => {
    if (!needsRead || requestedRef.current === venueId) return;
    requestedRef.current = venueId;
    void fetchVenueById(venueId)
      .then((result) => {
        if (result.ok && result.venue) {
          rememberShareVenue(result.venue);
          setRead({ venueId, result: toShareVenue(result.venue) });
        } else {
          setRead({ venueId, result: "failed" });
        }
      })
      .catch(() => setRead({ venueId, result: "failed" }));
  }, [needsRead, venueId]);

  const readResult: ShareVenueRead | null = !needsRead ? null : read?.venueId === venueId ? read.result : "pending";
  return resolveShareVenue(stored, readResult);
};

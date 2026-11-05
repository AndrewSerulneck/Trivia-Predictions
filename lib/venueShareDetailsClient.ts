import { SHARE_DETAILS_COPY as COPY, type VenueShareDetails } from "@/lib/venueShareDetails";

// The browser's side of "On shared pictures": the verbs say "over HTTP". The server-side read and
// write live in lib/venueShareDetailsStore.ts (never import that from a component).
//
// Cost: one GET per venue per page visit (cached below, refreshed by a save), none on the player side.
// A failed GET is not cached, so a retry really refetches.

export type ShareDetailsHost = "owner" | "admin";

const ENDPOINTS: Record<ShareDetailsHost, string> = {
  owner: "/api/owner/venues/share-details",
  admin: "/api/admin/venues/share-details",
};

type Reply = { ok: boolean; details?: VenueShareDetails; error?: string };

// Survives the step remounts inside a sheet (SlideSteps), so revisiting Review doesn't refetch.
const cache = new Map<string, VenueShareDetails>();
const inFlight = new Map<string, Promise<VenueShareDetails>>();

const keyOf = (host: ShareDetailsHost, venueId: string): string => `${host}:${venueId}`;

/** What is already cached for the venue, or null. No request. */
export const cachedVenueShareDetails = (venueId: string, host: ShareDetailsHost = "owner"): VenueShareDetails | null =>
  cache.get(keyOf(host, venueId)) ?? null;

/** The venue's choice from the shared cache, or one GET. Rejects with a plain message. */
export const fetchVenueShareDetails = (venueId: string, host: ShareDetailsHost = "owner"): Promise<VenueShareDetails> => {
  const key = keyOf(host, venueId);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = fetch(`${ENDPOINTS[host]}?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" })
    .then(async (res) => {
      const reply = (await res.json().catch(() => ({ ok: false }))) as Reply;
      if (!reply.ok || !reply.details) throw new Error(reply.error ?? COPY.loadFailed);
      cache.set(key, reply.details);
      return reply.details;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
};

/** Saves the venue's choice (one PATCH) and refreshes the shared cache. Throws a plain message. */
export const patchVenueShareDetails = async (
  venueId: string,
  details: VenueShareDetails,
  host: ShareDetailsHost = "owner",
): Promise<VenueShareDetails> => {
  const res = await fetch(ENDPOINTS[host], {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ venueId, ...details }),
  });
  const reply = (await res.json().catch(() => ({ ok: false }))) as Reply;
  if (!reply.ok || !reply.details) throw new Error(reply.error ?? COPY.saveFailed);
  cache.set(keyOf(host, venueId), reply.details);
  return reply.details;
};

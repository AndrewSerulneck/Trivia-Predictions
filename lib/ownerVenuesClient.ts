// The Partner Dashboard's "reload my venue list" call, for AFTER something changes the list (a paid
// "Add a venue", later a removal). It is deliberately NOT the first-load path: that is the single
// `GET /api/owner/dashboard` call (tests/owner-dashboard-contract.test.ts Phase 5), so the dashboard page
// never names the venues route itself — it calls this.

export type OwnerVenueItem = { id: string; name: string };

export type OwnerVenuesResult =
  | { ok: true; venues: OwnerVenueItem[] }
  /** `unauthorizedCode` is set on a 401, so the caller can send the partner to the right sign-in. */
  | { ok: false; unauthorized: boolean; unauthorizedCode?: string };

/** One cheap read (venue ids + names for the owner's own venues). Never throws. */
export const fetchOwnerVenues = async (): Promise<OwnerVenuesResult> => {
  try {
    const response = await fetch("/api/owner/venues", { cache: "no-store" });
    if (response.status === 401) {
      const body = (await response.json().catch(() => ({}))) as { code?: string };
      return { ok: false, unauthorized: true, ...(body.code ? { unauthorizedCode: body.code } : {}) };
    }
    const body = (await response.json().catch(() => null)) as { ok?: boolean; venues?: OwnerVenueItem[] } | null;
    if (!response.ok || !body?.ok || !Array.isArray(body.venues)) return { ok: false, unauthorized: false };
    return { ok: true, venues: body.venues };
  } catch {
    return { ok: false, unauthorized: false };
  }
};

import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type VenueRow = {
  id: string;
  name: string;
  display_name: string | null;
};

/** One venue as the Partner Dashboard's switcher shows it. */
export type OwnerVenueListItem = {
  id: string;
  name: string;
};

/**
 * The venues an owner controls, named the way every partner surface names them.
 *
 * ONE copy of this query and of the `display_name ?? name` fallback: both
 * `GET /api/owner/venues` and `GET /api/owner/dashboard` call it
 * (docs/partner-dashboard-merch-button-loader-speed-plan.md, Phase 5), so the
 * venue switcher can never disagree with itself depending on which route filled
 * it. `venueIds` must already be the caller's own — this function does NO
 * ownership check; `requireOwnerAuth`'s `auth.venueIds` is the boundary.
 */
export async function listOwnerVenues(venueIds: string[]): Promise<OwnerVenueListItem[]> {
  if (venueIds.length === 0) return [];
  if (!supabaseAdmin) {
    throw new Error("Server configuration error.");
  }

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id, name, display_name")
    .in("id", venueIds)
    .returns<VenueRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((v) => ({ id: v.id, name: v.display_name ?? v.name }));
}

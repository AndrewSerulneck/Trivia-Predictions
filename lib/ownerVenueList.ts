import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type VenueRow = {
  id: string;
  name: string;
  display_name: string | null;
  display_code?: string | null;
};

/** One venue as the Partner Dashboard's switcher shows it. */
export type OwnerVenueListItem = {
  id: string;
  name: string;
  /** Short display link code (`/tv/<code>`); only with `withDisplayCode`. */
  displayCode?: string | null;
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
export async function listOwnerVenues(
  venueIds: string[],
  options: { withDisplayCode?: boolean } = {},
): Promise<OwnerVenueListItem[]> {
  if (venueIds.length === 0) return [];
  if (!supabaseAdmin) {
    throw new Error("Server configuration error.");
  }

  const read = (columns: string) =>
    supabaseAdmin!.from("venues").select(columns).in("id", venueIds).returns<VenueRow[]>();

  let { data, error } = await read(options.withDisplayCode ? "id, name, display_name, display_code" : "id, name, display_name");
  // Deploy skew: code that asks for display_code can run before its migration
  // (20261114190044_venue_display_code.sql) is pushed. Postgres 42703 = undefined
  // column; fall back to no codes (the Display page then shows the long URL).
  if (error?.code === "42703" && options.withDisplayCode) {
    ({ data, error } = await read("id, name, display_name"));
  }

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((v) => ({
    id: v.id,
    name: v.display_name ?? v.name,
    ...(options.withDisplayCode ? { displayCode: v.display_code ?? null } : {}),
  }));
}

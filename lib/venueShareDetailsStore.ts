import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseInstagramHandle, type VenueShareDetails } from "@/lib/venueShareDetails";

// The one reader/writer of a venue's share details on the server (Phase 9e). Callers check
// who may touch the venue first: the owner route (`requireOwnerAuth` + `auth.venueIds`) or the
// admin route (`requireAdminAuth`). Nothing here checks ownership.

const COLUMNS = "instagram_handle, share_show_name, share_show_address, share_show_instagram";

type Row = {
  instagram_handle: string | null;
  share_show_name: boolean;
  share_show_address: boolean;
  share_show_instagram: boolean;
};

export class VenueShareDetailsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 500,
  ) {
    super(message);
  }
}

const fromRow = (row: Row): VenueShareDetails => ({
  instagramHandle: row.instagram_handle,
  showName: row.share_show_name,
  showAddress: row.share_show_address,
  showInstagram: row.share_show_instagram,
});

const db = () => {
  if (!supabaseAdmin) throw new VenueShareDetailsError("Server configuration error.", 500);
  return supabaseAdmin;
};

export const getVenueShareDetails = async (venueId: string): Promise<VenueShareDetails> => {
  const { data, error } = await db().from("venues").select(COLUMNS).eq("id", venueId).maybeSingle<Row>();
  if (error) {
    console.error("[VenueShareDetails] read-failed", error.message);
    throw new VenueShareDetailsError("Couldn't load this setting.", 500);
  }
  if (!data) throw new VenueShareDetailsError("Venue not found.", 404);
  return fromRow(data);
};

/**
 * Checks an untrusted request body. The handle is parsed the same way the panel parses it;
 * every flag must be a real boolean (no defaulting a missing one to "show").
 */
export const parseVenueShareDetailsInput = (
  body: Record<string, unknown>,
): { ok: true; details: VenueShareDetails } | { ok: false; error: string } => {
  const handleInput = body.instagramHandle;
  if (handleInput !== null && handleInput !== undefined && typeof handleInput !== "string") {
    return { ok: false, error: "instagramHandle must be text." };
  }
  const handle = parseInstagramHandle(handleInput ?? null);
  if (!handle.ok) return { ok: false, error: handle.error };
  const { showName, showAddress, showInstagram } = body;
  if (typeof showName !== "boolean" || typeof showAddress !== "boolean" || typeof showInstagram !== "boolean") {
    return { ok: false, error: "showName, showAddress and showInstagram must be true or false." };
  }
  return { ok: true, details: { instagramHandle: handle.handle, showName, showAddress, showInstagram } };
};

export const setVenueShareDetails = async (venueId: string, details: VenueShareDetails): Promise<VenueShareDetails> => {
  const { data, error } = await db()
    .from("venues")
    .update({
      instagram_handle: details.instagramHandle,
      share_show_name: details.showName,
      share_show_address: details.showAddress,
      share_show_instagram: details.showInstagram,
    })
    .eq("id", venueId)
    .select(COLUMNS)
    .maybeSingle<Row>();
  if (error) {
    console.error("[VenueShareDetails] write-failed", error.message);
    throw new VenueShareDetailsError("Couldn't save this setting.", 500);
  }
  if (!data) throw new VenueShareDetailsError("Venue not found.", 404);
  return fromRow(data);
};

// ── The two routes' shared bodies (owner + admin differ only in who may call them) ──

const errorResponse = (error: unknown, fallback: string): Response => {
  if (error instanceof VenueShareDetailsError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  }
  console.error("[VenueShareDetails] unexpected", error instanceof Error ? error.message : error);
  return Response.json({ ok: false, error: fallback }, { status: 500 });
};

/** GET: the venue's current choice. Caller has already checked access to `venueId`. */
export const venueShareDetailsGetResponse = async (venueId: string): Promise<Response> => {
  try {
    const details = await getVenueShareDetails(venueId);
    return Response.json({ ok: true, details }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Couldn't load this setting.");
  }
};

/** PATCH: replace the venue's choice. Caller has already checked access to `venueId`. */
export const venueShareDetailsPatchResponse = async (
  venueId: string,
  body: Record<string, unknown>,
): Promise<Response> => {
  const parsed = parseVenueShareDetailsInput(body);
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  try {
    const details = await setVenueShareDetails(venueId, parsed.details);
    return Response.json({ ok: true, details }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Couldn't save this setting.");
  }
};

import "server-only";
import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { isSocialPublishEnabled } from "@/lib/social/flags";

type OwnerAuth = { ownerId: string; venueIds: string[] };

/**
 * The gate every JSON `/api/owner/social/**` route shares, in this order: flag off → 404, no owner
 * session → requireOwnerAuth's 401, no `venueId` → 400, a venue the owner doesn't hold → 403.
 * The connect / callback routes redirect instead, so they don't use this.
 */
export const guardOwnerSocialVenue = async (
  request: Request,
  venueId: string,
): Promise<{ auth: OwnerAuth } | { response: Response }> => {
  if (!isSocialPublishEnabled()) {
    return { response: NextResponse.json({ ok: false, error: "Not found." }, { status: 404 }) };
  }
  let auth: OwnerAuth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return { response: response as Response };
  }
  if (!venueId) return { response: NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 }) };
  if (!auth.venueIds.includes(venueId)) {
    return { response: NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 }) };
  }
  return { auth };
};

export const socialJsonError = (status: number, error: string, code?: string): Response =>
  NextResponse.json({ ok: false, error, ...(code ? { code } : {}) }, { status });

/** Back to the dashboard with Share to social open and the connect result shown (for that venue only). */
export const redirectToSocialSheet = (request: Request, result: string, venueId: string | null): Response => {
  const url = new URL("/owner/dashboard", request.url);
  url.searchParams.set("sheet", "social");
  url.searchParams.set("socialResult", result);
  if (venueId) url.searchParams.set("socialVenue", venueId);
  return NextResponse.redirect(url, 303);
};

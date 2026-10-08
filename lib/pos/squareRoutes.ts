import "server-only";
import { NextResponse } from "next/server";
import { squareEnvironmentConflict } from "@/lib/pos/connections";
import { SQUARE_OTHER_ENVIRONMENT_RESULT_TEXT } from "@/lib/posStaffInstructions";

// Shared bits of the /api/owner/pos/square/* routes (docs/pos-rewards-integration-plan.md Phase 2).

/**
 * The outcome of a connect attempt, carried back to the Partner Dashboard's Point of Sale
 * sheet as `?posResult=`. The sheet maps each to one sentence (components/owner/pos).
 */
export type PosConnectResult =
  | "connected"
  | "choose_location"
  | "denied"
  | "expired"
  | "no_location"
  | "not_eligible"
  | "not_configured"
  // The venue's Square row was made by the other server (dev sandbox vs live); nothing changed.
  | "other_environment"
  | "error";

/** Back to the dashboard with the Point of Sale sheet open and the result shown. */
export const redirectToPosSheet = (request: Request, result: PosConnectResult, extraHeaders: Record<string, string> = {}): Response => {
  const url = new URL("/owner/dashboard", request.url);
  url.searchParams.set("sheet", "pos");
  url.searchParams.set("posResult", result);
  const response = NextResponse.redirect(url, 303);
  for (const [name, value] of Object.entries(extraHeaders)) response.headers.append(name, value);
  return response;
};

/**
 * The environment guard for the JSON routes (disconnect, choose location): `null` = go ahead;
 * otherwise the response to return. The venue's Square row belonging to the other server is a
 * 409 `other_environment`; a failed read is a 503 — never "go ahead" (fails closed).
 * docs/square-dev-test-venue-plan.md Phase 1.
 */
export const refuseOtherSquareEnvironment = async (venueId: string, action: string): Promise<Response | null> => {
  const guard = await squareEnvironmentConflict(venueId);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: "Couldn't check your Square connection. Please try again." }, { status: 503 });
  }
  if (!guard.conflict) return null;
  console.warn("[PosSquare] other-environment-refused", { venueId, action, row: guard.conflict });
  return NextResponse.json(
    { ok: false, code: "other_environment", error: SQUARE_OTHER_ENVIRONMENT_RESULT_TEXT },
    { status: 409 },
  );
};

import "server-only";
import { NextResponse } from "next/server";

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

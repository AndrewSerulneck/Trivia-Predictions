import "server-only";
import type { PosEnvironment } from "@/lib/pos/types";

// Square app configuration (docs/pos-rewards-integration-plan.md Phase 2). The ONE reader of
// the SQUARE_* environment variables; tests/lib.pos-square.test.ts pins that.
//
//   SQUARE_ENVIRONMENT               "sandbox" | "production". Anything else = Square is off.
//   SQUARE_APPLICATION_ID            Developer Console → app → Credentials → Application ID
//   SQUARE_APPLICATION_SECRET        Developer Console → app → OAuth → Application secret
//   SQUARE_SANDBOX_APPLICATION_ID /  Accepted in place of the two above ONLY when
//   SQUARE_SANDBOX_APPLICATION_SECRET  SQUARE_ENVIRONMENT=sandbox (the plain names win if both
//                                    are set), so sandbox and production keys can sit side by
//                                    side in .env.local. Never read in production mode.
//   SQUARE_WEBHOOK_SIGNATURE_KEY     Developer Console → app → Webhooks → subscription → Signature key
//   SQUARE_WEBHOOK_NOTIFICATION_URL  Optional. The EXACT URL entered on that subscription (it is
//                                    part of what Square signs). Default:
//                                    `${NEXT_PUBLIC_APP_URL}/api/webhooks/square`.
//
// The sandbox and production apps have different ids, secrets and signature keys; set the
// trio that matches SQUARE_ENVIRONMENT. Server-side only (no NEXT_PUBLIC_), so a change needs
// no rebuild — but Vercel still only picks it up on the next deployment.
//
// SQUARE_SANDBOX_ACCESS_TOKEN is NOT read here: it is the spike script's personal sandbox
// token (scripts/pos-sandbox-spike.cjs), never used by the app.

/** Pinned so a Square-side default change can't silently alter response shapes. */
export const SQUARE_API_VERSION = "2025-01-23";

/**
 * What a partner grants. MERCHANT_PROFILE_READ = business name + locations; GIFTCARDS_* =
 * create, activate, read and deactivate gift cards; ITEMS_* (Phase 2d) = find and create the
 * ready-made "Hightop prize: …" discounts in the partner's catalog. No CUSTOMERS_READ: we never
 * link a card to a Square customer profile (plan §4 Phase 2 makes that optional; it would widen
 * access).
 *
 * Square's consent screen is all-or-nothing, so a successful connect grants exactly this list,
 * and it is what pos_connections.scopes records. A connection made before Phase 2d lacks the
 * ITEMS_* pair: gift cards keep working, and the Point of Sale sheet asks the partner to
 * reconnect once to turn on menu prizes (hasSquareMenuPrizeScopes).
 */
export const SQUARE_OAUTH_SCOPES = [
  "MERCHANT_PROFILE_READ",
  "GIFTCARDS_READ",
  "GIFTCARDS_WRITE",
  "ITEMS_READ",
  "ITEMS_WRITE",
] as const;

/** The scopes the menu-prize discounts need (Phase 2d). */
export const SQUARE_MENU_PRIZE_SCOPES = ["ITEMS_READ", "ITEMS_WRITE"] as const;

/** Did this connection's grant include the menu-prize scopes? Fails closed on a missing list. */
export const hasSquareMenuPrizeScopes = (scopes: readonly string[] | null | undefined): boolean =>
  Array.isArray(scopes) && SQUARE_MENU_PRIZE_SCOPES.every((scope) => scopes.includes(scope));

export type SquareAppConfig = {
  environment: PosEnvironment;
  applicationId: string;
  applicationSecret: string;
};

const env = (name: string): string => (process.env[name] ?? "").trim();

/**
 * SQUARE_ENVIRONMENT alone. The webhook needs it to match a revocation to the right rows even
 * on a server holding only the webhook variables (the Phase 2b sandbox preview).
 */
export const squareEnvironment = (): PosEnvironment | null => {
  const value = env("SQUARE_ENVIRONMENT").toLowerCase();
  return value === "sandbox" || value === "production" ? value : null;
};

/** The OAuth app, or null when any piece is missing (Square then reads "Coming soon"). */
export const squareAppConfig = (): SquareAppConfig | null => {
  const which = squareEnvironment();
  const sandbox = which === "sandbox";
  const applicationId = env("SQUARE_APPLICATION_ID") || (sandbox ? env("SQUARE_SANDBOX_APPLICATION_ID") : "");
  const applicationSecret =
    env("SQUARE_APPLICATION_SECRET") || (sandbox ? env("SQUARE_SANDBOX_APPLICATION_SECRET") : "");
  if (!which || !applicationId || !applicationSecret) return null;
  return { environment: which, applicationId, applicationSecret };
};

export const isSquareConfigured = (): boolean => squareAppConfig() !== null;

export const squareApiBase = (which: PosEnvironment): string =>
  which === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";

/** Webhook verification inputs, or null when the webhook isn't configured (→ 503, Square retries). */
export const squareWebhookConfig = (): { signatureKey: string; notificationUrl: string } | null => {
  const signatureKey = env("SQUARE_WEBHOOK_SIGNATURE_KEY");
  const explicit = env("SQUARE_WEBHOOK_NOTIFICATION_URL");
  const appUrl = env("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "");
  const notificationUrl = explicit || (appUrl ? `${appUrl}/api/webhooks/square` : "");
  if (!signatureKey || !notificationUrl) return null;
  return { signatureKey, notificationUrl };
};

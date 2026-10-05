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
 * create, activate, read and deactivate gift cards. No CUSTOMERS_READ: we never link a card
 * to a Square customer profile (plan §4 Phase 2 makes that optional; it would widen access).
 */
export const SQUARE_OAUTH_SCOPES = ["MERCHANT_PROFILE_READ", "GIFTCARDS_READ", "GIFTCARDS_WRITE"] as const;

export type SquareAppConfig = {
  environment: PosEnvironment;
  applicationId: string;
  applicationSecret: string;
};

const env = (name: string): string => (process.env[name] ?? "").trim();

const environment = (): PosEnvironment | null => {
  const value = env("SQUARE_ENVIRONMENT").toLowerCase();
  return value === "sandbox" || value === "production" ? value : null;
};

/** The OAuth app, or null when any piece is missing (Square then reads "Coming soon"). */
export const squareAppConfig = (): SquareAppConfig | null => {
  const which = environment();
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

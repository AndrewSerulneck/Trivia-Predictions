import "server-only";
import { isPosIntegrationsEnabled } from "@/lib/pos/providers";
import { squareAppConfig } from "@/lib/pos/squareConfig";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// The one `pos_connections` read behind the prize wallet's Square badges (docs/square-review-fixes-plan.md
// R3 #6). `attachSquareGiftCardStates` and `attachSquareDiscountStates` both need it; the wallet route
// hands each the same loader so a venue holding both coupon kinds pays for ONE read, and a wallet with
// nothing to attach pays for none (the loader only reads when somebody calls it).

export type SquareWalletConnection = {
  id: string;
  location_id: string | null;
  scopes: string[] | null;
};

/**
 * `{ ok: true, connection: null }` = Square isn't in play for this venue (flag off, app not
 * configured, no active connection made in this server's environment). `{ ok: false }` = the read
 * failed; callers leave their coupons untouched.
 */
export type SquareWalletConnectionResult =
  | { ok: true; connection: SquareWalletConnection | null }
  | { ok: false };

export type SquareWalletConnectionLoader = () => Promise<SquareWalletConnectionResult>;

export const readSquareWalletConnection = async (venueId: string): Promise<SquareWalletConnectionResult> => {
  const config = squareAppConfig();
  if (!isPosIntegrationsEnabled() || !config || !supabaseAdmin) return { ok: true, connection: null };
  const { data, error } = await supabaseAdmin
    .from("pos_connections")
    .select("id, location_id, scopes")
    .eq("venue_id", venueId)
    .eq("provider", "square")
    .eq("status", "active")
    // Only a connection made in THIS server's Square environment (see loadSquareCredentials).
    .eq("environment", config.environment)
    .maybeSingle<SquareWalletConnection>();
  if (error) {
    console.error("[PosSquare] wallet-connection-read-failed", error.message);
    return { ok: false };
  }
  return { ok: true, connection: data ?? null };
};

/** A loader that reads at most once, however many callers ask. Nothing is read until the first call. */
export const squareWalletConnectionLoader = (venueId: string): SquareWalletConnectionLoader => {
  let pending: Promise<SquareWalletConnectionResult> | null = null;
  return () => (pending ??= readSquareWalletConnection(venueId));
};

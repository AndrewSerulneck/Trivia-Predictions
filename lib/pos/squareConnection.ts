import "server-only";
import { decryptPosToken, encryptPosToken, posTokenContext } from "@/lib/pos/crypto";
import { refreshSquareAccessToken, revokeSquareToken, type SquareTokens } from "@/lib/pos/square";
import { SQUARE_OAUTH_SCOPES, squareAppConfig, type SquareAppConfig } from "@/lib/pos/squareConfig";
import type { PosConnectionCredentials, PosEnvironment } from "@/lib/pos/types";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Square rows in pos_connections: save on connect, load (decrypt + lazily refresh) on use,
// pick a location, disconnect (docs/pos-rewards-integration-plan.md Phase 2).
//
// This file and lib/pos/crypto.ts are the only places a token column is read or written.
// Tokens are encrypted with posTokenContext(venue, "square", field), so a ciphertext copied to
// another venue's row won't decrypt.
//
// Refresh is LAZY (plan §3 cost rules: no cron): when a token is used within 7 days of expiry
// — Square access tokens last 30 days and Square advises renewing weekly — it is refreshed
// first. A venue with no gift-card activity for a month simply refreshes on its next use; the
// code-flow refresh token doesn't expire.

const PROVIDER = "square";
const REFRESH_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;

/** Written in place of a revoked token: `access_token_enc` is NOT NULL, and this never decrypts. */
const REVOKED_TOKEN_PLACEHOLDER = "revoked";

type ConnectionRow = {
  id: string;
  venue_id: string;
  environment: PosEnvironment;
  merchant_id: string;
  location_id: string | null;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  status: string;
  scopes: string[] | null;
};

const CREDENTIAL_COLUMNS =
  "id, venue_id, environment, merchant_id, location_id, access_token_enc, refresh_token_enc, token_expires_at, status, scopes";

const ctx = (venueId: string, field: "access_token" | "refresh_token") => posTokenContext(venueId, PROVIDER, field);

const readLiveRow = async (venueId: string): Promise<{ ok: true; row: ConnectionRow | null } | { ok: false }> => {
  if (!supabaseAdmin) return { ok: false };
  const { data, error } = await supabaseAdmin
    .from("pos_connections")
    .select(CREDENTIAL_COLUMNS)
    .eq("venue_id", venueId)
    .eq("provider", PROVIDER)
    .neq("status", "revoked")
    .maybeSingle<ConnectionRow>();
  if (error) {
    console.error("[PosSquare] connection-read-failed", error.message);
    return { ok: false };
  }
  return { ok: true, row: data ?? null };
};

/**
 * Store a fresh connection (connect or reconnect). Reuses the venue's live row when there is
 * one, so the partial unique index (one live row per venue+provider) is never hit.
 * `locationId` null = the merchant has several locations; the partner picks one next — unless
 * this is a reconnect to the SAME Square account whose previously chosen location is still one
 * of `eligibleLocationIds` (Phase 2d: reconnecting once to turn on menu prizes must not make a
 * multi-location partner pick their location again). Returns the location that was saved.
 */
export const saveSquareConnection = async (input: {
  venueId: string;
  ownerId: string;
  environment: PosEnvironment;
  tokens: SquareTokens;
  merchantName: string | null;
  locationId: string | null;
  eligibleLocationIds?: string[];
}): Promise<{ ok: true; locationId: string | null } | { ok: false }> => {
  if (!supabaseAdmin) return { ok: false };
  const existing = await readLiveRow(input.venueId);
  if (!existing.ok) return { ok: false };

  const previous = existing.row;
  const keptLocation =
    previous &&
    previous.merchant_id === input.tokens.merchantId &&
    previous.environment === input.environment &&
    previous.location_id &&
    (input.eligibleLocationIds ?? []).includes(previous.location_id)
      ? previous.location_id
      : null;
  const locationId = input.locationId ?? keptLocation;

  const nowIso = new Date().toISOString();
  const fields = {
    environment: input.environment,
    merchant_id: input.tokens.merchantId,
    merchant_name: input.merchantName,
    location_id: locationId,
    access_token_enc: encryptPosToken(input.tokens.accessToken, ctx(input.venueId, "access_token")),
    refresh_token_enc: input.tokens.refreshToken
      ? encryptPosToken(input.tokens.refreshToken, ctx(input.venueId, "refresh_token"))
      : null,
    token_expires_at: input.tokens.expiresAt,
    refresh_token_expires_at: null,
    // Square's consent is all-or-nothing, so a completed connect granted exactly what we asked.
    scopes: [...SQUARE_OAUTH_SCOPES],
    status: "active",
    last_error: null,
    connected_by_owner_id: input.ownerId,
    connected_at: nowIso,
    disconnected_at: null,
    updated_at: nowIso,
  };

  const { error } = existing.row
    ? await supabaseAdmin.from("pos_connections").update(fields).eq("id", existing.row.id)
    : await supabaseAdmin.from("pos_connections").insert({ venue_id: input.venueId, provider: PROVIDER, ...fields });
  if (error) {
    console.error("[PosSquare] connection-save-failed", error.message);
    return { ok: false };
  }
  return { ok: true, locationId };
};

const markError = async (rowId: string, message: string): Promise<void> => {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from("pos_connections")
    .update({ status: "error", last_error: message.slice(0, 300), updated_at: new Date().toISOString() })
    .eq("id", rowId);
};

export type SquareCredentialsResult =
  | { ok: true; credentials: PosConnectionCredentials }
  | { ok: false; reason: "not_connected" | "needs_location" | "needs_attention" | "unavailable" };

/**
 * Decrypted credentials for one call, refreshing first when the access token is near expiry.
 * A refresh Square refuses (revoked in Square Dashboard, app uninstalled) flips the row to
 * `error`, which the Point of Sale sheet shows as "Reconnect needed".
 */
export const loadSquareCredentials = async (venueId: string): Promise<SquareCredentialsResult> => {
  const read = await readLiveRow(venueId);
  if (!read.ok) return { ok: false, reason: "unavailable" };
  const row = read.row;
  if (!row) return { ok: false, reason: "not_connected" };
  if (row.status !== "active") return { ok: false, reason: "needs_attention" };
  // A sandbox connection must never serve a production server (or vice versa): local testing
  // writes sandbox rows into the shared database, and a sandbox token would mint FAKE cards.
  const config = squareAppConfig();
  if (!config || config.environment !== row.environment) {
    console.warn("[PosSquare] environment-mismatch", { connectionId: row.id, row: row.environment, server: config?.environment ?? null });
    return { ok: false, reason: "needs_attention" };
  }
  if (!row.location_id) return { ok: false, reason: "needs_location" };

  let accessToken: string;
  try {
    accessToken = decryptPosToken(row.access_token_enc, ctx(venueId, "access_token"));
  } catch {
    console.error("[PosSquare] token-decrypt-failed", { connectionId: row.id });
    return { ok: false, reason: "unavailable" };
  }

  const expiresMs = row.token_expires_at ? new Date(row.token_expires_at).getTime() : Number.NaN;
  if (Number.isFinite(expiresMs) && expiresMs - Date.now() < REFRESH_WITHIN_MS && row.refresh_token_enc) {
    let refreshToken: string;
    try {
      refreshToken = decryptPosToken(row.refresh_token_enc, ctx(venueId, "refresh_token"));
    } catch {
      console.error("[PosSquare] token-decrypt-failed", { connectionId: row.id });
      return { ok: false, reason: "unavailable" };
    }
    const refreshed = await refreshSquareAccessToken(config, refreshToken);
    if ("ok" in refreshed) {
      console.error("[PosSquare] token-refresh-failed", { connectionId: row.id, code: refreshed.code });
      if (refreshed.code === "unauthorized" || refreshed.code === "invalid") {
        await markError(row.id, refreshed.message);
        return { ok: false, reason: "needs_attention" };
      }
      // A transient failure with a still-valid token: use the token we have.
      if (expiresMs <= Date.now()) return { ok: false, reason: "unavailable" };
    } else {
      accessToken = refreshed.accessToken;
      const update: Record<string, string | null> = {
        access_token_enc: encryptPosToken(refreshed.accessToken, ctx(venueId, "access_token")),
        token_expires_at: refreshed.expiresAt,
        updated_at: new Date().toISOString(),
      };
      if (refreshed.refreshToken) {
        update.refresh_token_enc = encryptPosToken(refreshed.refreshToken, ctx(venueId, "refresh_token"));
      }
      const { error } = await supabaseAdmin!.from("pos_connections").update(update).eq("id", row.id);
      if (error) console.error("[PosSquare] token-refresh-save-failed", error.message);
    }
  }

  return {
    ok: true,
    credentials: {
      connectionId: row.id,
      venueId,
      provider: "square",
      environment: row.environment,
      merchantId: row.merchant_id,
      locationId: row.location_id,
      accessToken,
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
    },
  };
};

/**
 * The live row's decrypted access token regardless of location (for listing locations before
 * one is chosen). Never refreshes: picking a location happens minutes after connecting.
 */
export const loadSquareTokenForSetup = async (
  venueId: string,
): Promise<{ ok: true; environment: PosEnvironment; accessToken: string; merchantId: string } | { ok: false }> => {
  const read = await readLiveRow(venueId);
  if (!read.ok || !read.row || read.row.status !== "active") return { ok: false };
  if (squareAppConfig()?.environment !== read.row.environment) return { ok: false };
  try {
    return {
      ok: true,
      environment: read.row.environment,
      merchantId: read.row.merchant_id,
      accessToken: decryptPosToken(read.row.access_token_enc, ctx(venueId, "access_token")),
    };
  } catch {
    console.error("[PosSquare] token-decrypt-failed", { connectionId: read.row.id });
    return { ok: false };
  }
};

export const setSquareLocation = async (venueId: string, locationId: string): Promise<{ ok: true } | { ok: false }> => {
  if (!supabaseAdmin) return { ok: false };
  const { data, error } = await supabaseAdmin
    .from("pos_connections")
    .update({ location_id: locationId, updated_at: new Date().toISOString() })
    .eq("venue_id", venueId)
    .eq("provider", PROVIDER)
    .eq("status", "active")
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error("[PosSquare] location-save-failed", error.message);
    return { ok: false };
  }
  return { ok: true };
};

/**
 * Other venues' ACTIVE connections to the same Square merchant (one partner, two venues, one
 * Square account). `null` = the read failed.
 */
const otherActiveVenuesForMerchant = async (
  merchantId: string,
  environment: PosEnvironment,
  venueId: string,
): Promise<number | null> => {
  const { data, error } = await supabaseAdmin!
    .from("pos_connections")
    .select("id")
    .eq("provider", PROVIDER)
    .eq("merchant_id", merchantId)
    .eq("environment", environment)
    .eq("status", "active")
    .neq("venue_id", venueId);
  if (error) {
    console.error("[PosSquare] shared-merchant-read-failed", error.message);
    return null;
  }
  return (data ?? []).length;
};

/**
 * Disconnect: revoke at Square (best effort — the partner can also remove the app in Square
 * Dashboard), then mark the row revoked and overwrite both token columns so no usable
 * credential stays in our database. The row stays as history; ledger rows keep pointing at it.
 *
 * Square's RevokeToken ends EVERY token our app holds for that merchant, whichever one is sent
 * (Square docs, re-checked 2026-10-06). So when another venue is still connected to the same
 * Square account, we only wipe THIS venue's row and leave Square alone; otherwise disconnecting
 * one venue would silently break the other's gift cards (Phase 2c). If that read fails we also
 * skip the Square call: a token left valid at Square is harmless once we've wiped our copy.
 */
export const disconnectSquare = async (venueId: string): Promise<{ ok: true; revokedAtSquare: boolean } | { ok: false }> => {
  if (!supabaseAdmin) return { ok: false };
  const read = await readLiveRow(venueId);
  if (!read.ok) return { ok: false };
  if (!read.row) return { ok: true, revokedAtSquare: false };

  let revokedAtSquare = false;
  const config = squareAppConfig();
  // A row Square already revoked (markSquareMerchantRevoked) has no token left to revoke.
  const hasToken = read.row.access_token_enc !== REVOKED_TOKEN_PLACEHOLDER;
  if (config && config.environment === read.row.environment && hasToken) {
    const sharedWith = await otherActiveVenuesForMerchant(read.row.merchant_id, read.row.environment, venueId);
    if (sharedWith !== 0) {
      // null = the read failed; skip rather than risk cutting off another venue.
      console.info("[PosSquare] revoke-skipped-shared-merchant", { connectionId: read.row.id, otherVenues: sharedWith });
    } else {
      try {
        const token = decryptPosToken(read.row.access_token_enc, ctx(venueId, "access_token"));
        const revoked = await revokeSquareToken(config, token);
        revokedAtSquare = !("code" in revoked);
        if ("code" in revoked) console.warn("[PosSquare] revoke-failed", { connectionId: read.row.id, code: revoked.code });
      } catch {
        console.warn("[PosSquare] revoke-skipped-undecryptable", { connectionId: read.row.id });
      }
    }
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("pos_connections")
    .update({
      status: "revoked",
      access_token_enc: REVOKED_TOKEN_PLACEHOLDER,
      refresh_token_enc: null,
      disconnected_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", read.row.id);
  if (error) {
    console.error("[PosSquare] disconnect-save-failed", error.message);
    return { ok: false };
  }
  return { ok: true, revokedAtSquare };
};

/**
 * Square told us (webhook `oauth.authorization.revoked`) that our access to a merchant ended:
 * the partner removed our app in Square, or Square or our own RevokeToken did. Every live row
 * for that merchant connected BEFORE the revocation becomes `error` ("Reconnect needed" in the
 * Point of Sale sheet and a line on the dashboard) with both tokens wiped, like a disconnect.
 *
 * - A row connected AFTER `revokedAt` is a reconnect and is never touched (Phase 2b: our own
 *   Disconnect fires this event ~5 s later, often after the partner has reconnected).
 * - Already-revoked rows (our own Disconnect) and rows whose tokens are already wiped are not
 *   matched, so a repeated event writes nothing. One UPDATE, no read first.
 *
 * Returns how many rows changed, or `ok: false` on a database failure (the route answers 500
 * so Square retries).
 */
export const markSquareMerchantRevoked = async (input: {
  merchantId: string;
  environment: PosEnvironment;
  revokedAt: string;
  revokerType: string | null;
}): Promise<{ ok: true; changed: number } | { ok: false }> => {
  if (!supabaseAdmin) return { ok: false };
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("pos_connections")
    .update({
      status: "error",
      last_error: `Square access was removed (${input.revokerType ?? "unknown"}). Reconnect to issue gift cards.`,
      access_token_enc: REVOKED_TOKEN_PLACEHOLDER,
      refresh_token_enc: null,
      updated_at: nowIso,
    })
    .eq("provider", PROVIDER)
    .eq("merchant_id", input.merchantId)
    .eq("environment", input.environment)
    .neq("status", "revoked")
    .neq("access_token_enc", REVOKED_TOKEN_PLACEHOLDER)
    .lt("connected_at", input.revokedAt)
    .select("id");
  if (error) {
    console.error("[PosSquare] revoked-save-failed", error.message);
    return { ok: false };
  }
  return { ok: true, changed: (data ?? []).length };
};

/**
 * Give back a grant we won't keep (an account that can't issue our gift cards, Phase 2c): revoke
 * it at Square unless another venue is connected to the same merchant — RevokeToken would end
 * that venue's tokens too. Best effort; nothing is stored either way.
 */
export const discardSquareGrant = async (input: {
  config: SquareAppConfig;
  accessToken: string;
  merchantId: string;
  venueId: string;
}): Promise<void> => {
  if (!supabaseAdmin) return;
  const sharedWith = await otherActiveVenuesForMerchant(input.merchantId, input.config.environment, input.venueId);
  if (sharedWith !== 0) return;
  const revoked = await revokeSquareToken(input.config, input.accessToken);
  if ("code" in revoked) console.warn("[PosSquare] discard-revoke-failed", { code: revoked.code });
};

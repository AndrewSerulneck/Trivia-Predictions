import "server-only";
import { isPosIntegrationsEnabled, POS_PROVIDERS, type PosProviderId, type PosProviderInfo } from "@/lib/pos/providers";
import { hasSquareMenuPrizeScopes, isSquareConfigured, squareAppConfig } from "@/lib/pos/squareConfig";
import type { PosConnectionState, PosConnectionStatus } from "@/lib/pos/types";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POS connection reads for the Partner Dashboard and the reward wizard
// (docs/pos-rewards-integration-plan.md Phase 1).
//
// Selects NO token columns, ever. `PUBLIC_CONNECTION_COLUMNS` is the whole select list and
// tests/lib.pos-foundation.test.ts fails if a token column joins it. Writes (connect,
// refresh, disconnect) arrive with each provider's OAuth routes in Phase 2/3.
//
// Cost: one indexed read of at most a few rows per venue, only when the Point of Sale sheet
// opens or the wizard loads a reward's context. No polling.

// location_id is read only to answer "has a Square location been chosen?" — it never leaves
// the server (PosConnectionStatus carries the boolean `needsLocation`, not the id).
// scopes (Phase 2d) is the list of permission NAMES the partner granted — not a credential — read
// only to say "reconnect once to turn on menu prizes".
const PUBLIC_CONNECTION_COLUMNS = "provider, status, merchant_name, connected_at, location_id, environment, scopes";

type PublicConnectionRow = {
  provider: string;
  status: string;
  merchant_name: string | null;
  connected_at: string | null;
  location_id: string | null;
  environment: string;
  scopes?: string[] | null;
};

/**
 * Built AND set up on this server. A provider the catalog marks "available" still reads
 * "Coming soon" when its app credentials aren't configured, so no partner is offered a
 * Connect button that can only fail.
 */
const isConnectable = (info: PosProviderInfo): boolean => {
  if (info.availability !== "available") return false;
  if (info.id === "square") return isSquareConfigured();
  return true;
};

type PosReadResult = { ok: true; rows: PublicConnectionRow[] } | { ok: false };

/**
 * "pos_connections doesn't exist yet" — the code can deploy before the migration. Postgres
 * answers 42P01; PostgREST's schema cache answers PGRST205 / "Could not find the table".
 */
const isMissingPosTable = (error: { code?: string; message?: string }): boolean => {
  const code = String(error.code ?? "");
  if (code === "42P01" || code === "PGRST205") return true;
  const message = String(error.message ?? "").toLowerCase();
  return message.includes("pos_connections") && (message.includes("does not exist") || message.includes("could not find"));
};

/** Live (non-revoked) connections for one venue. A missing table reads as "none". */
const readLiveConnections = async (venueId: string): Promise<PosReadResult> => {
  if (!supabaseAdmin) return { ok: false };
  const { data, error } = await supabaseAdmin
    .from("pos_connections")
    .select(PUBLIC_CONNECTION_COLUMNS)
    .eq("venue_id", venueId)
    .neq("status", "revoked")
    .returns<PublicConnectionRow[]>();
  if (!error) return { ok: true, rows: data ?? [] };
  if (isMissingPosTable(error)) {
    console.warn("[Pos] pos-connections-table-missing");
    return { ok: true, rows: [] };
  }
  console.error("[Pos] connections-read-failed", error.message);
  return { ok: false };
};

/**
 * A Square row made in the other Square environment (a sandbox test row on a production server,
 * or the reverse) can't be used here: lib/pos/squareConnection.ts refuses it. Show it as
 * "Reconnect needed" rather than "Connected".
 */
const isWrongEnvironment = (row: PublicConnectionRow | undefined): boolean =>
  row?.provider === "square" && row.status === "active" && squareAppConfig()?.environment !== row.environment;

const stateFor = (
  availability: "available" | "coming_soon",
  row: PublicConnectionRow | undefined,
): PosConnectionState => {
  if (isWrongEnvironment(row)) return "needs_attention";
  // A connection that already exists is shown as it is, even for a provider we've since
  // marked coming_soon — the partner must still be able to see (and later disconnect) it.
  if (row?.status === "active") return "connected";
  if (row?.status === "error") return "needs_attention";
  return availability === "available" ? "not_connected" : "coming_soon";
};

/** Every provider in display order, with this venue's state. `ok: false` = the read failed. */
export const listPosConnectionStatuses = async (
  venueId: string,
): Promise<{ ok: true; statuses: PosConnectionStatus[] } | { ok: false }> => {
  const read = await readLiveConnections(venueId);
  if (!read.ok) return { ok: false };
  const byProvider = new Map<string, PublicConnectionRow>(read.rows.map((row) => [row.provider, row]));
  return {
    ok: true,
    statuses: POS_PROVIDERS.map((info) => {
      const row = byProvider.get(info.id);
      const state = stateFor(isConnectable(info) ? "available" : "coming_soon", row);
      const live = state === "connected" || state === "needs_attention";
      return {
        provider: info.id,
        label: info.label,
        pitch: info.pitch,
        state,
        merchantName: live ? row?.merchant_name ?? null : null,
        connectedAt: live ? row?.connected_at ?? null : null,
        // Square issues gift cards at ONE location; a multi-location account must pick it.
        needsLocation: state === "connected" && info.id === "square" && !row?.location_id,
        // Connected before Phase 2d: gift cards work, menu prizes wait for one reconnect.
        needsMenuPrizeReconnect: state === "connected" && info.id === "square" && !hasSquareMenuPrizeScopes(row?.scopes),
      };
    }),
  };
};

/**
 * Providers with an ACTIVE connection at this venue. Fails to [] on any error: callers use
 * it to decide whether to OFFER a POS option (e.g. the wizard's "value at the register"
 * question), and not offering one is always safe.
 */
export const activePosProviders = async (venueId: string): Promise<PosProviderId[]> => {
  const read = await readLiveConnections(venueId);
  if (!read.ok) return [];
  return read.rows
    .filter((row) => row.status === "active" && !isWrongEnvironment(row))
    .map((row) => row.provider)
    .filter((provider): provider is PosProviderId => POS_PROVIDERS.some((info) => info.id === provider));
};

/**
 * The reward wizard's `posConnected`: should it ask for a prize's value at the register?
 * False while the master flag is off (no query at all), else whether any provider is active.
 */
export const venueHasActivePos = async (venueId: string): Promise<boolean> => {
  if (!isPosIntegrationsEnabled()) return false;
  return (await activePosProviders(venueId)).length > 0;
};

/**
 * The owner's venues whose SQUARE connection needs attention (Square removed our access,
 * a refresh was refused, or a row from the other Square environment) — the Partner Dashboard's
 * one-line nudge (Phase 2c). Rides inside GET /api/owner/dashboard: one indexed read for ALL of
 * the owner's venues, so a venue switch needs no request. Zero queries with the flag off. Fails
 * to [] (no nudge) on any error: the Point of Sale sheet still tells the truth.
 */
export const venuesNeedingPosAttention = async (venueIds: string[]): Promise<string[]> => {
  if (!isPosIntegrationsEnabled() || venueIds.length === 0 || !supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .from("pos_connections")
    .select("venue_id, provider, status, environment")
    .in("venue_id", venueIds)
    // Square only: the dashboard's nudge copy names Square. Clover (Phase 3) must add its own
    // provider-specific nudge rather than widen this filter.
    .eq("provider", "square")
    .neq("status", "revoked")
    .returns<Array<PublicConnectionRow & { venue_id: string }>>();
  if (error) {
    if (!isMissingPosTable(error)) console.error("[Pos] attention-read-failed", error.message);
    return [];
  }
  const flagged = (data ?? []).filter((row) => row.status === "error" || isWrongEnvironment(row));
  return [...new Set(flagged.map((row) => row.venue_id))];
};

import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePairingCode } from "@/lib/tvPairingShared";

export { normalizePairingCode };

// ── TV pairing codes (Phase 5b) ────────────────────────────────────────────────
// A TV browser at /tv mints a short code; the owner claims it from the Partner
// Dashboard; the TV polls, sees the claim, and redirects itself to the venue
// screen. Codes are single-use and short-lived. All access is service-role only
// (see the migration) — these helpers assume supabaseAdmin.

const TABLE = "tv_pairing_codes";

/** Code length + alphabet: Crockford base32 minus I/L/O/U — unambiguous across a room. */
const CODE_LENGTH = 6;
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** How long a freshly-minted code stays valid before it's treated as expired. */
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** How many times to retry on a code collision before giving up. */
const MINT_MAX_ATTEMPTS = 5;

export type PairingStatus = "pending" | "claimed" | "expired" | "consumed";

/** Poll result shape returned to the TV. venueId is only present once claimed. */
export type PairingPollResult =
  | { status: "pending" }
  | { status: "claimed"; venueId: string }
  | { status: "expired" }
  | { status: "consumed" }
  | { status: "not_found" };

type PairingRow = {
  code: string;
  venue_id: string | null;
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
  consumed_at: string | null;
};

const SELECT_COLS = "code, venue_id, created_at, expires_at, claimed_at, consumed_at";

function admin(): NonNullable<typeof supabaseAdmin> {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  return supabaseAdmin;
}

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** Derive the status of a row at time `now` (pure — unit-testable without a DB). */
export function pairingRowStatus(row: PairingRow, now: number = Date.now()): PairingStatus {
  if (row.consumed_at) return "consumed";
  if (Date.parse(row.expires_at) <= now) return "expired";
  if (row.venue_id && row.claimed_at) return "claimed";
  return "pending";
}

/**
 * Opportunistic lazy expiry — delete codes already past their TTL. Called from
 * the mint path so there's no cron; best-effort (errors are swallowed).
 */
async function sweepExpiredCodes(): Promise<void> {
  try {
    await admin().from(TABLE).delete().lt("expires_at", new Date().toISOString());
  } catch {
    // best-effort; a failed sweep never blocks minting.
  }
}

/**
 * Mint a fresh pairing code. Retries on the (astronomically unlikely) primary-key
 * collision surfaced as a 23505. Sweeps expired codes first so the table stays
 * small without a cron.
 */
export async function mintPairingCode(): Promise<{ code: string; expiresAt: string }> {
  await sweepExpiredCodes();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();

  for (let attempt = 0; attempt < MINT_MAX_ATTEMPTS; attempt += 1) {
    const code = randomCode();
    const { error } = await admin()
      .from(TABLE)
      .insert({ code, expires_at: expiresAt });

    if (!error) return { code, expiresAt };
    if ((error as { code?: string }).code !== "23505") {
      throw new Error(error.message || "Failed to mint pairing code.");
    }
    // else: collision — loop and try a new code.
  }
  throw new Error("Could not allocate a unique pairing code. Please try again.");
}

/** Fetch a single code row, or null. */
async function getRow(code: string): Promise<PairingRow | null> {
  const { data, error } = await admin()
    .from(TABLE)
    .select(SELECT_COLS)
    .eq("code", code)
    .maybeSingle<PairingRow>();
  if (error) throw new Error(error.message || "Failed to load pairing code.");
  return data ?? null;
}

/**
 * Poll a code's status for the TV. On the first poll AFTER a claim, marks the row
 * consumed (single-use) and returns the venueId so the TV can redirect exactly
 * once. Unknown codes return `not_found`.
 */
export async function pollPairingCode(codeInput: string): Promise<PairingPollResult> {
  const code = normalizePairingCode(codeInput);
  if (!code) return { status: "not_found" };

  const row = await getRow(code);
  if (!row) return { status: "not_found" };

  const status = pairingRowStatus(row);
  if (status === "expired") return { status: "expired" };
  if (status === "consumed") return { status: "consumed" };
  if (status === "pending") return { status: "pending" };

  // status === "claimed": hand the venueId to the TV and consume the code so it
  // can't be reused. Guard the update on consumed_at being null so concurrent
  // polls don't double-consume.
  const venueId = row.venue_id as string;
  await admin()
    .from(TABLE)
    .update({ consumed_at: new Date().toISOString() })
    .eq("code", code)
    .is("consumed_at", null);

  return { status: "claimed", venueId };
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "already_used" };

/**
 * Claim a code for a venue (called from the owner-authed route AFTER venue
 * ownership is verified). Only a pending, unexpired, unconsumed code can be
 * claimed; anything else maps to a reason the route turns into a 404/409.
 */
export async function claimPairingCode(codeInput: string, venueId: string): Promise<ClaimResult> {
  const code = normalizePairingCode(codeInput);
  if (!code) return { ok: false, reason: "not_found" };

  const row = await getRow(code);
  if (!row) return { ok: false, reason: "not_found" };

  const status = pairingRowStatus(row);
  if (status === "expired") return { ok: false, reason: "expired" };
  if (status === "claimed" || status === "consumed") return { ok: false, reason: "already_used" };

  // Claim only if still pending (venue_id null) — guards against two owners
  // racing on the same code.
  const { data, error } = await admin()
    .from(TABLE)
    .update({ venue_id: venueId, claimed_at: new Date().toISOString() })
    .eq("code", code)
    .is("venue_id", null)
    .select("code");

  if (error) throw new Error(error.message || "Failed to claim pairing code.");
  if (!data || data.length === 0) return { ok: false, reason: "already_used" };

  return { ok: true };
}

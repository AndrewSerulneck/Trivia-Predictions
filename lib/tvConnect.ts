import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";

import { DISPLAY_CODE_ALPHABET } from "@/lib/displayCode";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  parsePairCode,
  TV_CONNECT_COPY,
  TV_PAIR_CODE_LENGTH,
  TV_PAIR_TTL_MS,
  type TvConnectResult,
  type TvPairingStatus,
} from "@/lib/tvConnectShared";

// Hightop Challenge TV app: the connect lifecycle (docs/fire-tv-app-plan.md Phase 3).
//
//   create  POST /api/tv-app/pairings          a row with a 6-character pair code + the hash of the TV's secret
//   claim   POST /api/owner/tv-app/connect     a signed-in partner sets venue_id on an unexpired, unclaimed row
//   read    GET  /api/tv-app/pairings/status   the TV, with its secret: waiting / connected (row deleted) / expired
//
// A connection grants a venue id only (plan D9). Rows live at most 10 minutes; each create first deletes expired
// rows in one bounded statement, so no cron is needed. Every step is a single statement, so two racing requests
// can't both claim a code.

type PairingRow = { id: string; venue_id: string | null; expires_at: string };

const UNIQUE_VIOLATION = "23505";
const CREATE_ATTEMPTS = 3;

/** SHA-256 hex of the TV's raw secret. Only this is stored. */
export const hashPollSecret = (secret: string): string => createHash("sha256").update(secret).digest("hex");

/** 32 random bytes, base64url (43 characters). Held only by the TV. */
const newPollSecret = (): string => randomBytes(32).toString("base64url");

const newPairCode = (): string =>
  Array.from({ length: TV_PAIR_CODE_LENGTH }, () => DISPLAY_CODE_ALPHABET[randomInt(DISPLAY_CODE_ALPHABET.length)]).join(
    "",
  );

/** A well-formed secret as the TV sends it (base64url, 43 characters), or null. */
export const parsePollSecret = (raw: string | null | undefined): string | null => {
  const value = String(raw ?? "").trim();
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
};

export type CreatedPairing = { pairCode: string; pollSecret: string; expiresAt: string };

export const createTvPairing = async (nowMs: number = Date.now()): Promise<CreatedPairing | null> => {
  if (!supabaseAdmin) return null;
  const nowIso = new Date(nowMs).toISOString();
  // Housekeeping instead of a cron: one bounded delete (indexed on expires_at).
  const cleanup = await supabaseAdmin.from("tv_device_pairings").delete().lt("expires_at", nowIso);
  if (cleanup.error) console.error("[TvConnect] cleanup-failed", { message: cleanup.error.message });

  const expiresAt = new Date(nowMs + TV_PAIR_TTL_MS).toISOString();
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
    const pairCode = newPairCode();
    const pollSecret = newPollSecret();
    const { error } = await supabaseAdmin
      .from("tv_device_pairings")
      .insert({ pair_code: pairCode, poll_secret_hash: hashPollSecret(pollSecret), expires_at: expiresAt });
    if (!error) return { pairCode, pollSecret, expiresAt };
    if (error.code !== UNIQUE_VIOLATION) {
      console.error("[TvConnect] create-failed", { message: error.message });
      return null;
    }
  }
  console.error("[TvConnect] create-collisions");
  return null;
};

/**
 * The TV's poll. `connected` is read once: the row is deleted in the same request, so a second poll (or anyone
 * replaying the secret later) gets `expired`. Unknown secret = `expired` too (rows are deleted when they expire).
 */
export const readTvPairingStatus = async (
  pollSecret: string,
  nowMs: number = Date.now(),
): Promise<TvPairingStatus | null> => {
  if (!supabaseAdmin) return null;
  const secretHash = hashPollSecret(pollSecret);
  const { data, error } = await supabaseAdmin
    .from("tv_device_pairings")
    .select("id, venue_id, expires_at")
    .eq("poll_secret_hash", secretHash)
    .maybeSingle<PairingRow>();
  if (error) {
    console.error("[TvConnect] status-failed", { message: error.message });
    return null;
  }
  if (!data) return { ok: true, state: "expired" };

  if (data.venue_id) {
    // Read-once. A claimed row is delivered even a moment past its expiry: the partner did connect it.
    const removed = await supabaseAdmin.from("tv_device_pairings").delete().eq("id", data.id);
    if (removed.error) {
      console.error("[TvConnect] status-delete-failed", { message: removed.error.message });
      return null;
    }
    return { ok: true, state: "connected", venueId: data.venue_id };
  }

  if (Date.parse(data.expires_at) <= nowMs) return { ok: true, state: "expired" };
  return { ok: true, state: "waiting", expiresAt: data.expires_at };
};

/**
 * A partner connects the TV showing `rawPairCode` to `venueId`. The caller has already checked the owner session;
 * this checks the owner holds the venue, then claims the row only if it is unexpired and unclaimed — in one
 * conditional update, so a code can be claimed once.
 */
export const claimTvPairing = async (
  input: { rawPairCode: unknown; venueId: unknown; ownerVenueIds: readonly string[] },
  nowMs: number = Date.now(),
): Promise<TvConnectResult> => {
  const pairCode = parsePairCode(input.rawPairCode);
  const venueId = typeof input.venueId === "string" ? input.venueId.trim() : "";
  if (!pairCode || !venueId) return { ok: false, code: "invalid", error: "Something went wrong. Try again." };
  if (!input.ownerVenueIds.includes(venueId)) {
    return { ok: false, code: "not_your_venue", error: "That venue isn't on your account." };
  }
  if (!supabaseAdmin) return { ok: false, code: "unavailable", error: "Something went wrong. Try again." };

  const nowIso = new Date(nowMs).toISOString();
  const { data, error } = await supabaseAdmin
    .from("tv_device_pairings")
    .update({ venue_id: venueId, claimed_at: nowIso })
    .eq("pair_code", pairCode)
    .is("venue_id", null)
    .gt("expires_at", nowIso)
    .select("id");
  if (error) {
    console.error("[TvConnect] claim-failed", { message: error.message });
    return { ok: false, code: "unavailable", error: "Something went wrong. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, code: "expired", error: TV_CONNECT_COPY.expired };
  }
  return { ok: true };
};

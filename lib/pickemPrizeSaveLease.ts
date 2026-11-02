import "server-only";

import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";

/**
 * One Pick 'Em Prize save at a time per bar (docs/pickem-college-football-and-prize-plan.md Phase
 * 7.5.3, F17). The overlap rule (D6) is read-then-insert across separate PostgREST calls, so two
 * saves at the same bar could both read "no clash". A save therefore holds a short per-venue lease
 * (migration 20261102021619: `claim_pickem_prize_save` / `release_pickem_prize_save`) from before the
 * overlap read until after the insert. createPickEmReward (lib/rewards.ts) is the only caller; any
 * future path that changes a Pick 'Em Prize's scope, window or pick limit must take the same lease.
 *
 * Fails CLOSED: no client, a missing RPC or any error is "failed", never "held" — the caller then
 * creates nothing.
 */

/** Long enough for one save (a read and an insert); a crashed save blocks the bar only this long. */
export const PICKEM_PRIZE_SAVE_LEASE_TTL_SECONDS = 30;

export type PickEmPrizeSaveClaim =
  | { status: "held"; token: string }
  | { status: "busy" }
  | { status: "failed" };

let missingRpcLogged = false;

export async function claimPickEmPrizeSave(venueId: string): Promise<PickEmPrizeSaveClaim> {
  if (!supabaseAdmin) return { status: "failed" };
  const token = randomUUID();
  try {
    const { data, error } = await supabaseAdmin.rpc("claim_pickem_prize_save", {
      p_venue_id: venueId,
      p_token: token,
      p_ttl_seconds: PICKEM_PRIZE_SAVE_LEASE_TTL_SECONDS,
    });
    if (error) {
      if (isMissingFunction(error, "claim_pickem_prize_save")) {
        if (!missingRpcLogged) {
          missingRpcLogged = true;
          console.error("[PickEmPrize] save-lease-missing: no Pick 'Em Prize can be saved until the migration is applied.");
        }
      } else {
        console.error("[PickEmPrize] save-lease-claim-failed", { venueId, message: error.message });
      }
      return { status: "failed" };
    }
    return data === true ? { status: "held", token } : { status: "busy" };
  } catch (error) {
    console.error("[PickEmPrize] save-lease-claim-failed", {
      venueId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: "failed" };
  }
}

/** Never throws: a lease that isn't released simply runs out. */
export async function releasePickEmPrizeSave(venueId: string, token: string): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin.rpc("release_pickem_prize_save", { p_venue_id: venueId, p_token: token });
    if (error) console.error("[PickEmPrize] save-lease-release-failed", { venueId, message: error.message });
  } catch (error) {
    console.error("[PickEmPrize] save-lease-release-failed", {
      venueId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

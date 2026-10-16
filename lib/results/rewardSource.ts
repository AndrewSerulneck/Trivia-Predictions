import "server-only";

import { listChallengeCampaignsByIds } from "@/lib/challengeCampaigns";
import { listScheduleTimezones } from "@/lib/liveShowdownAdmin";
import { loadUsernames } from "@/lib/results/playerNames";
import {
  addDays,
  placeRewards,
  type PlacementLedgerRow,
  type PlacementSettlementRow,
} from "@/lib/results/rewardPlacement";
import type { ResultsRewardSource } from "@/lib/results/timeline";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// The rewards half of the Results timeline (docs/partner-results-page-plan.md §5a/§5b): one
// venue's reward cycles, read by date window and placed by lib/results/rewardPlacement.ts.
//
// HOW A WINDOW IS READ. rewardPlacement.ts dates every item either within [cycle date − 1 day,
// cycle date + 7 days] or on its finalized/settled date. So every item dated in [lo, hi) is a row
// whose cycle_start is in [lo − 8 days, hi + 2 days) or whose finalized_at / settled_at is in
// [lo − 1 day, hi + 2 days) (the extra day covers any timezone). One ledger read and one settlements
// read fetch exactly those rows (an `or` of the two ranges), and placement then keeps only the items
// dated in [lo, hi). Only rows with venue_id = this venue are ever read, so a reward shared with
// another venue never shows that venue's winners.
//
// COST. A window is at most REWARD_WINDOW_DAYS (lib/results/timeline.ts), so a read is small:
// ledger (idx_challenge_cycle_winners_venue) + settlements (idx_challenge_cycle_settlements_venue)
// + the campaigns by id + one usernames read, + one schedule-zones read only when a pinned
// game-winner reward is in the window. `boundBefore` is up to four `limit 1` probes, and runs only
// when the games can't decide the page (no more games, or an empty stretch).

/** A safety cap per window read; a 56-day window holds a few dozen rows even with a nightly reward. */
const REWARD_ROWS_CAP = 1000;
/** Excludes the 1970-01-01 cycle key of a one-off reward from the cycle-date probe (it is dated by finalized_at). */
const EPOCH_GUARD = "1970-01-02";

type LedgerRow = {
  challenge_id: string;
  cycle_start: string;
  winner_user_id: string | null;
  points_earned: number | null;
  finalized_at: string | null;
  place: number | null;
};

type SettlementRow = {
  challenge_id: string;
  cycle_start: string;
  outcome: PlacementSettlementRow["outcome"];
  participant_count: number | null;
  min_players: number | null;
  settled_at: string | null;
};

const client = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  return supabaseAdmin;
};

/** "cycle_start in [a, b) or <at> in [c, d)", for PostgREST's `or`. Dates only, so nothing to escape. */
const windowFilter = (lo: string, hi: string, atColumn: "finalized_at" | "settled_at"): string =>
  `and(cycle_start.gte.${addDays(lo, -8)},cycle_start.lt.${addDays(hi, 2)}),and(${atColumn}.gte.${addDays(lo, -1)},${atColumn}.lt.${addDays(hi, 2)})`;

const utcDateOf = (instant: string | null | undefined): string | null => {
  const ms = Date.parse(String(instant ?? ""));
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
};

export const createVenueRewardSource = (params: {
  venueId: string;
  timeZone: string;
  currentYear: number;
}): ResultsRewardSource => {
  const { venueId, timeZone, currentYear } = params;

  const read: ResultsRewardSource["read"] = async ({ lo, hi, games }) => {
    const db = client();
    const [ledger, settlements] = await Promise.all([
      db
        .from("challenge_cycle_winners")
        .select("challenge_id, cycle_start, winner_user_id, points_earned, finalized_at, place")
        .eq("venue_id", venueId)
        .or(windowFilter(lo, hi, "finalized_at"))
        .order("cycle_start", { ascending: false })
        .limit(REWARD_ROWS_CAP)
        .returns<LedgerRow[]>(),
      db
        .from("challenge_cycle_settlements")
        .select("challenge_id, cycle_start, outcome, participant_count, min_players, settled_at")
        .eq("venue_id", venueId)
        .or(windowFilter(lo, hi, "settled_at"))
        .order("cycle_start", { ascending: false })
        .limit(REWARD_ROWS_CAP)
        .returns<SettlementRow[]>(),
    ]);
    if (ledger.error) throw new Error(ledger.error.message ?? "Failed to load the venue's reward winners.");
    if (settlements.error) throw new Error(settlements.error.message ?? "Failed to load the venue's reward weeks.");
    const ledgerRows = ledger.data ?? [];
    const settlementRows = settlements.data ?? [];
    if (ledgerRows.length >= REWARD_ROWS_CAP || settlementRows.length >= REWARD_ROWS_CAP) {
      console.error("[Results] reward-rows-capped", { venueId, lo, hi });
    }
    if (ledgerRows.length === 0 && settlementRows.length === 0) return [];

    const campaigns = await listChallengeCampaignsByIds([...ledgerRows, ...settlementRows].map((row) => row.challenge_id));
    const pinnedScheduleIds = campaigns
      .filter((campaign) => campaign.winCondition === "game_winner")
      .flatMap((campaign) => (campaign.gameWinnerSlots ?? []).map((slot) => slot.scheduleId));
    const [names, scheduleZones] = await Promise.all([
      loadUsernames(ledgerRows.map((row) => row.winner_user_id)),
      pinnedScheduleIds.length > 0
        ? listScheduleTimezones(pinnedScheduleIds).catch((error: unknown) => {
            console.error("[Results] schedule-timezone-read-failed", error instanceof Error ? error.message : error);
            return new Map<string, string>();
          })
        : Promise.resolve(new Map<string, string>()),
    ]);

    const placementLedger: PlacementLedgerRow[] = ledgerRows.map((row) => ({
      challengeId: row.challenge_id,
      cycleStart: row.cycle_start,
      finalizedAt: row.finalized_at,
      place: row.place,
      username: row.winner_user_id ? names.get(row.winner_user_id) ?? null : null,
      points: Number(row.points_earned) || 0,
    }));
    const placementSettlements: PlacementSettlementRow[] = settlementRows.map((row) => ({
      challengeId: row.challenge_id,
      cycleStart: row.cycle_start,
      outcome: row.outcome,
      participantCount: Number(row.participant_count) || 0,
      minPlayers: row.min_players ?? null,
      settledAt: row.settled_at,
    }));
    return placeRewards({
      ledger: placementLedger,
      settlements: placementSettlements,
      campaigns,
      venueTimeZone: timeZone,
      scheduleZones,
      games,
      currentYear,
    }).filter((item) => item.date >= lo && item.date < hi);
  };

  /**
   * An exclusive upper bound on the date of every item dated before `lo`, or null when none can
   * exist. An item dated before `lo` is a row whose cycle_start is before lo + 2 days (dated at most
   * 7 days after its local date, itself at most a day after its UTC date: + 9), or whose finalized_at
   * / settled_at is before lo + 1 day (dated that local day: + 2), so the newest such timestamps
   * bound it. May over-estimate (never past `lo`); the timeline then
   * looks one window further.
   */
  const boundBefore: ResultsRewardSource["boundBefore"] = async (lo) => {
    const db = client();
    const newest = async (table: "challenge_cycle_winners" | "challenge_cycle_settlements", column: string, before: string, after?: string) => {
      let query = db.from(table).select(column).eq("venue_id", venueId).lt(column, before);
      if (after) query = query.gt(column, after);
      const { data, error } = await query.order(column, { ascending: false }).limit(1).returns<Array<Record<string, string | null>>>();
      if (error) throw new Error(error.message ?? `Failed to probe ${table}.`);
      return utcDateOf(data?.[0]?.[column]);
    };
    const [ledgerCycle, ledgerFinal, settlementCycle, settlementSettled] = await Promise.all([
      newest("challenge_cycle_winners", "cycle_start", addDays(lo, 2), EPOCH_GUARD),
      newest("challenge_cycle_winners", "finalized_at", addDays(lo, 1)),
      newest("challenge_cycle_settlements", "cycle_start", addDays(lo, 2), EPOCH_GUARD),
      newest("challenge_cycle_settlements", "settled_at", addDays(lo, 1)),
    ]);
    const bounds = [
      ledgerCycle ? addDays(ledgerCycle, 9) : null,
      ledgerFinal ? addDays(ledgerFinal, 2) : null,
      settlementCycle ? addDays(settlementCycle, 9) : null,
      settlementSettled ? addDays(settlementSettled, 2) : null,
    ].filter((date): date is string => date !== null);
    if (bounds.length === 0) return null;
    const bound = bounds.reduce((max, date) => (date > max ? date : max));
    return bound < lo ? bound : lo;
  };

  return { read, boundBefore };
};

import "server-only";

import {
  awardRankedCyclePlaces,
  getCampaignCloseTimestampMs,
  listActiveBracketPrizeCampaigns,
} from "@/lib/challengeCampaigns";
import { BRACKET_PRIZE_DEFINITION_ID, BRACKET_PRIZE_PAIRS, bracketPrizeCycleStart, type BracketPrizeKey } from "@/lib/bracketPrizes";
import { rankBracketEntries } from "@/lib/brackets/scoring";
import { BRACKET_SLOT_COUNT, type BracketKind } from "@/lib/brackets/tree";
import type { BracketTournamentRecord } from "@/lib/bracketsStore";
import type { RankedPlace } from "@/lib/rankedPlaceRewards";
import { chunkIds } from "@/lib/postgrestIds";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ChallengeCampaign } from "@/types";

// March Madness bracket Prizes, awarded (docs/squares-and-brackets-plan.md, Phase 9a).
//
// ONCE per tournament, after its championship is graded and every round's venue points are paid
// (lib/bracketsSync.ts calls settleBracketPrizes and then stamps bracket_tournaments.prizes_settled_at):
// for every active bracket prize that pays a bracket of this tournament, rank that venue's entries in
// that bracket by the bracket's own standings (rankBracketEntries: points, then the tiebreaker's
// distance from the championship total, then the earliest save — the same order the players see) and
// settle the cycle through award_ranked_cycle_places: the top `places` scorers each get their place's
// coupon in one transaction; a bracket nobody scored in, or below the partner's minimum (entries with
// at least one pick), is recorded as such and pays nobody.
//
// SAFE TO REPEAT: award_ranked_cycle_places answers "already_resolved" for a settled cycle and writes
// nothing, so a run that dies before the stamp just re-asks. The sync stamps only when every cycle
// answered; a failure keeps the tournament on the sync's 2-minute pace until it goes through.
//
// WHICH PRIZES: active (archiving stops a prize), for one venue, paying that bracket, created BEFORE
// the bracket locked (a prize set up once the standings were moving was never on offer), and not
// closed before the lock (an old season's prize never pays a new season's bracket). A REHEARSAL
// tournament pays only at hidden venues (bracket_save_entry already refuses rehearsal entries anywhere
// else); its lock is compared in REAL time (lock + the replay clock's offset).
//
// AFTER THE PRIZES: an admin correction to a result once the prizes are settled does NOT change them
// (the cycle is settled). The admin panel says so; a wrong award is a manual fix.
//
// COST (once per tournament, two a season): one prizes read; one hidden-venues read for a rehearsal;
// one entries read per (venue, bracket) with a prize (≤ 1,000 rows each, normally tens); one RPC per
// (prize, bracket). No player is ever read twice.

/** Most entries one venue can have in one bracket that the read will rank (far above real venues). */
const ENTRIES_CAP = 1000;

export type BracketPrizeSettlement = {
  campaignId: string;
  venueId: string;
  key: BracketPrizeKey;
  status: string;
  participants: number;
  winners: number;
};

export type BracketPrizeSettleResult =
  | { ok: true; ready: false }
  | { ok: true; ready: true; settlements: BracketPrizeSettlement[] }
  | { ok: false; error: string };

/** The bracket kind's lock in REAL time (a rehearsal's clock runs `clockOffsetSeconds` behind). */
export const bracketRealLockMs = (
  tournament: Pick<BracketTournamentRecord, "mainLockAt" | "secondLockAt" | "clockOffsetSeconds">,
  kind: BracketKind,
): number | null => {
  const lockMs = Date.parse(String((kind === "main" ? tournament.mainLockAt : tournament.secondLockAt) ?? ""));
  return Number.isFinite(lockMs) ? lockMs + tournament.clockOffsetSeconds * 1000 : null;
};

/**
 * Was this prize on offer for this bracket? See WHICH PRIZES above. Pure. Unparseable dates and a
 * prize for more than one venue fail closed.
 */
export const bracketPrizeCoversBracket = (
  campaign: ChallengeCampaign,
  key: BracketPrizeKey,
  realLockMs: number | null,
): boolean => {
  if (campaign.rewardDefinitionId !== BRACKET_PRIZE_DEFINITION_ID) return false;
  if (!campaign.isActive || campaign.venueIds.length !== 1) return false;
  if (!(campaign.bracketKeys ?? []).includes(key)) return false;
  if (!campaign.placePrizes || campaign.placePrizes.length === 0) return false;
  const createdMs = Date.parse(String(campaign.createdAt ?? ""));
  if (realLockMs === null || !Number.isFinite(createdMs) || createdMs >= realLockMs) return false;
  const closeMs = getCampaignCloseTimestampMs(campaign);
  return closeMs === null || realLockMs <= closeMs;
};

type EntryRow = { id: string; user_id: string; score: number; tiebreaker: number | null; submitted_at: string };

/** Ranks one venue's entries in one bracket into places (scorers only, as the RPC requires). Pure. */
export const bracketPrizePlaces = (
  entries: readonly EntryRow[],
  championshipTotal: number | null,
  placeCount: number,
  minPlayers: number | null | undefined,
): { places: RankedPlace[]; participantCount: number } => {
  const participantCount = entries.length;
  if (minPlayers && participantCount < minPlayers) return { places: [], participantCount };
  const ranked = rankBracketEntries(
    entries.map((row) => ({
      entryId: row.id,
      userId: row.user_id,
      score: Number(row.score) || 0,
      tiebreaker: row.tiebreaker,
      submittedAt: row.submitted_at,
    })),
    championshipTotal,
  );
  const places = ranked
    .filter((entry) => entry.score > 0)
    .slice(0, Math.max(0, placeCount))
    .map((entry, index) => ({ place: index + 1, userId: entry.userId, totalPoints: entry.score, reachedAt: entry.submittedAt }));
  return { places, participantCount };
};

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : typeof error === "string" ? error : fallback;

/**
 * Settle every bracket prize of a tournament whose championship is graded. `ready: false` = the
 * championship isn't decided yet (nothing read). Never throws.
 */
export async function settleBracketPrizes(
  tournament: BracketTournamentRecord,
  winnerSeats: ReadonlyArray<number | null>,
  championshipTotal: number | null,
  now: Date = new Date(),
): Promise<BracketPrizeSettleResult> {
  if (winnerSeats[BRACKET_SLOT_COUNT - 1] === null || winnerSeats[BRACKET_SLOT_COUNT - 1] === undefined || championshipTotal === null) {
    return { ok: true, ready: false };
  }
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin client is not configured." };
  const db = supabaseAdmin;

  try {
    // Only this file's own kind of prize (tests/prize-sweep-ownership-contract.test.ts).
    const campaigns = (await listActiveBracketPrizeCampaigns()).filter(
      (campaign) => campaign.rewardDefinitionId === BRACKET_PRIZE_DEFINITION_ID,
    );
    const pairs = BRACKET_PRIZE_PAIRS.filter((pair) => pair.gender === tournament.gender).map((pair) => ({
      ...pair,
      realLockMs: bracketRealLockMs(tournament, pair.kind),
    }));
    let due = campaigns.flatMap((campaign) =>
      pairs
        .filter((pair) => bracketPrizeCoversBracket(campaign, pair.key, pair.realLockMs))
        .map((pair) => ({ campaign, venueId: campaign.venueIds[0], ...pair })),
    );

    if (tournament.purpose === "rehearsal" && due.length > 0) {
      const hidden = new Set<string>();
      for (const chunk of chunkIds([...new Set(due.map((item) => item.venueId))])) {
        const { data, error } = await db.from("venues").select("id").in("id", chunk).eq("hidden", true);
        if (error) return { ok: false, error: `hidden venues read: ${error.message}` };
        for (const row of (data ?? []) as Array<{ id: string }>) hidden.add(row.id);
      }
      due = due.filter((item) => hidden.has(item.venueId));
    }

    const entriesByVenueKind = new Map<string, EntryRow[]>();
    const settlements: BracketPrizeSettlement[] = [];
    for (const item of due) {
      const cycleStart = bracketPrizeCycleStart(tournament.createdAt, item.key);
      if (!cycleStart) return { ok: false, error: `tournament ${tournament.id} has no readable created_at` };
      const cacheKey = `${item.venueId}|${item.kind}`;
      let entries = entriesByVenueKind.get(cacheKey);
      if (!entries) {
        const { data, error } = await db
          .from("bracket_entries")
          .select("id, user_id, score, tiebreaker, submitted_at")
          .eq("tournament_id", tournament.id)
          .eq("kind", item.kind)
          .eq("venue_id", item.venueId)
          .gt("pick_count", 0)
          .order("score", { ascending: false })
          .limit(ENTRIES_CAP);
        if (error) return { ok: false, error: `entries read: ${error.message}` };
        entries = (data ?? []) as EntryRow[];
        if (entries.length >= ENTRIES_CAP) console.error("[BracketPrize] entries-capped", { tournamentId: tournament.id, venueId: item.venueId });
        entriesByVenueKind.set(cacheKey, entries);
      }
      const { places, participantCount } = bracketPrizePlaces(
        entries,
        championshipTotal,
        item.campaign.placePrizes?.length ?? 0,
        item.campaign.minPlayers ?? null,
      );
      const { status, winnersAwarded } = await awardRankedCyclePlaces({
        campaign: item.campaign,
        venueId: item.venueId,
        cycleStart,
        places,
        participantCount,
        now,
      });
      settlements.push({
        campaignId: item.campaign.id,
        venueId: item.venueId,
        key: item.key,
        status,
        participants: participantCount,
        winners: winnersAwarded,
      });
      if (status !== "already_resolved") {
        console.info("[BracketPrize] bracket-settled", {
          campaignId: item.campaign.id,
          tournamentId: tournament.id,
          key: item.key,
          status,
          participants: participantCount,
          winners: winnersAwarded,
        });
      }
    }
    return { ok: true, ready: true, settlements };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Failed to settle bracket prizes.") };
  }
}

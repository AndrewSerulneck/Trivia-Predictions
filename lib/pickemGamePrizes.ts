import "server-only";

// The Pick 'Em Prizes a games list shows (docs/pickem-college-football-and-prize-plan.md Phase 6): for
// the games on the screen, every ACTIVE Pick 'Em Prize at the venue that covers one of them in a period
// that hasn't ended, with this player's picks left when it limits picks ("X out of N"). It rides on the
// games response — the screen makes no request of its own for it.
//
// COST per games request: the venue's active prizes (the pick limit's per-instance 60 s cache — one read
// a minute per venue per instance, shared with it); only when one covers a shown game: the venue's time
// zone (cached) and, per "out of N" prize and only for a signed-in player, ONE indexed count. A failure
// anywhere shows no prize line (logged) — the games themselves never wait on this.

import { formatZonedDate } from "@/lib/categoryBlitzScheduleTime";
import { activePickEmPrizes, countPickEmPicksInPrizePeriod } from "@/lib/pickemPrizeLimit";
import type { PickEmGamePrize } from "@/lib/pickemPrizeLine";
import {
  describePickEmPrizePeriodPhrase,
  pickemPickLimitMessage,
  pickemPrizePeriodAt,
  pickemPrizePeriodForDate,
  pickemPrizeWinKind,
  pickemScopeCovers,
  type PickEmPrizePeriod,
} from "@/lib/pickemPrizes";
import { getVenueTimezone } from "@/lib/timezone";

type ShownGame = { sportSlug: string; sportKey: string; startsAt: string; userPickTeam?: string; pickLimitReached?: boolean; pickLimitMessage?: string };

/**
 * The prize lines for `games`, and — in place — `pickLimitReached` on each not-yet-picked game a
 * used-up "out of N" prize covers (changing or clearing an existing pick is always allowed).
 */
export async function loadPickEmGamePrizes(params: {
  games: ShownGame[];
  venueId: string | undefined;
  userId: string | undefined;
  now?: Date;
}): Promise<PickEmGamePrize[]> {
  const venueId = String(params.venueId ?? "").trim();
  const userId = String(params.userId ?? "").trim();
  if (!venueId || params.games.length === 0) return [];
  const now = params.now ?? new Date();
  try {
    const prizes = await activePickEmPrizes(venueId);
    const covering = prizes
      .map((prize) => ({ prize, games: params.games.filter((game) => pickemScopeCovers(prize.pickemScope, game)) }))
      .filter((entry) => entry.games.length > 0);
    if (covering.length === 0) return [];

    const timeZone = await getVenueTimezone(venueId);
    const today = formatZonedDate(now.getTime(), timeZone);
    const lines: PickEmGamePrize[] = [];

    for (const { prize, games } of covering) {
      // The earliest period, still running, that one of the shown games falls in.
      let period: PickEmPrizePeriod | null = null;
      for (const game of games) {
        const startsAtMs = Date.parse(game.startsAt);
        if (!Number.isFinite(startsAtMs)) continue;
        const found = pickemPrizePeriodForDate(prize.pickemWindow, formatZonedDate(startsAtMs, timeZone), timeZone);
        if (found && found.endMsExclusive > now.getTime() && (!period || found.startMs < period.startMs)) period = found;
      }
      if (!period) continue;
      const shown = period;
      const kind = pickemPrizeWinKind(prize);

      let picksLeft: number | null = null;
      let limitMessage: string | null = null;
      if (kind === "tiers" && prize.pickemPickLimit !== null && userId) {
        const used = await countPickEmPicksInPrizePeriod({
          userId,
          venueId,
          campaignId: prize.id,
          scope: prize.pickemScope,
          period: shown,
        });
        if (used !== null) {
          picksLeft = Math.max(0, prize.pickemPickLimit - used);
          if (picksLeft === 0) {
            limitMessage = pickemPickLimitMessage({
              limit: prize.pickemPickLimit,
              scope: prize.pickemScope,
              window: prize.pickemWindow,
              period: shown,
              today,
            });
            for (const game of games) {
              const startsAtMs = Date.parse(game.startsAt);
              const gamePeriod = Number.isFinite(startsAtMs)
                ? pickemPrizePeriodForDate(prize.pickemWindow, formatZonedDate(startsAtMs, timeZone), timeZone)
                : null;
              if (gamePeriod?.startMs === shown.startMs && !game.userPickTeam) {
                game.pickLimitReached = true;
                game.pickLimitMessage ??= limitMessage ?? undefined;
              }
            }
          }
        }
      }

      lines.push({
        campaignId: prize.id,
        kind,
        when: describePickEmPrizePeriodPhrase(prize.pickemWindow, shown, today),
        target: kind === "target" ? Math.max(1, Math.round(Number(prize.pointsRequiredToWin) || 1)) : null,
        minPicks: kind === "most_right" ? prize.pickemMinPicks : null,
        limit: kind === "tiers" ? prize.pickemPickLimit : null,
        tierCorrects: kind === "tiers" ? (prize.pickemTiers ?? []).map((tier) => tier.correct) : [],
        picksLeft,
        limitMessage,
        // The tiebreaker route answers for TODAY's period only.
        hasTiebreaker: kind === "most_right" && pickemPrizePeriodAt(prize.pickemWindow, now, timeZone)?.startMs === shown.startMs,
      });
    }
    return lines;
  } catch (error) {
    console.error("[PickEmPrize] game-prizes-failed", { venueId, message: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

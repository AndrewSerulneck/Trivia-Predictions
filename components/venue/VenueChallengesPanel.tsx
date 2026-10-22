"use client";

import React from "react";
import { RewardProgressGauge } from "@/components/venue/RewardProgressGauge";
import {
  CHALLENGE_ICON_STYLE,
  ChallengeIconBadge,
  inferChallengeGameType,
  rewardGameLabel,
  rewardHeadline,
  type ChallengeCampaignCard,
} from "@/components/venue/venueHubShared";
import { composeRankedCard } from "@/lib/rankedPlaceCard";
import { playHaptic } from "@/lib/nativeHaptics";
import { formatCalendarDate as formatUpcomingDate } from "@/lib/formatCalendarDate";

type VenueChallengesPanelProps = {
  contentReady: boolean;
  isChallengesLoading: boolean;
  challengeCards: ChallengeCampaignCard[];
  currentUserId: string;
  pendingChallengeRedeemId: string | null;
  challengesError: string;
  /** True once a load has succeeded; before that `challengeCards` is empty because nothing arrived, not because there are no rewards. */
  hasLoadedChallenges: boolean;
  onSelectChallenge: (challengeId: string) => void;
  onGoToChallengeRedeem: (challengeId: string, sourceElement: HTMLElement | null) => void;
  onRetryChallenges: () => void;
};

function VenueChallengesPanelInner({
  contentReady,
  isChallengesLoading,
  challengeCards,
  currentUserId,
  pendingChallengeRedeemId,
  challengesError,
  hasLoadedChallenges,
  onSelectChallenge,
  onGoToChallengeRedeem,
  onRetryChallenges,
}: VenueChallengesPanelProps) {
  // Buzz when a prize is won while this panel is open. The first SUCCESSFUL batch of cards is the
  // baseline, so opening the panel on a prize you already won stays quiet, including when the first
  // load failed and a later refresh brings the old win in.
  const wonIdsRef = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    if (isChallengesLoading || challengesError || !hasLoadedChallenges) return;
    const wonNow = new Set(challengeCards.filter((card) => card.viewerWon).map((card) => card.id));
    const before = wonIdsRef.current;
    wonIdsRef.current = wonNow;
    if (before && [...wonNow].some((id) => !before.has(id))) playHaptic("celebrate");
  }, [challengeCards, isChallengesLoading, challengesError, hasLoadedChallenges]);

  return (
    <section className="venue-screen m-0 flex w-full shrink-0 basis-full snap-start flex-col items-center p-0 box-border">
      <div className={`venue-home-panel-content w-full px-[clamp(1rem,3.2vw,1.5rem)] pb-3 pt-1 transition-opacity duration-300 ${contentReady ? "opacity-100" : "opacity-0"}`}>
        <div className="mx-auto w-full max-w-[26rem] space-y-3">
          <div>
            <p className="mb-3 text-caption font-black uppercase tracking-[0.14em] text-ht-accent">
              {isChallengesLoading
                ? "Prizes"
                : challengeCards.length > 0
                ? `Active · ${challengeCards.length} Prize${challengeCards.length !== 1 ? "s" : ""}`
                : "Prizes"}
            </p>
            <div className="space-y-2">
              {isChallengesLoading ? (
                <div className="space-y-3 rounded-2xl border border-ht-skeleton/60 bg-ht-skeleton-bg/40 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 animate-pulse rounded-2xl bg-ht-skeleton" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-40 animate-pulse rounded bg-ht-skeleton" />
                      <div className="h-2 w-full animate-pulse rounded bg-ht-skeleton/70" />
                      <div className="h-2 w-24 animate-pulse rounded bg-ht-skeleton/50" />
                    </div>
                  </div>
                </div>
              ) : null}

              {!isChallengesLoading && challengeCards.length === 0 ? (
                <div className="rounded-2xl border border-ht-skeleton/60 bg-ht-skeleton-bg/40 p-4 text-center text-sm font-semibold text-ht-fg-faint">
                  No prizes at this venue yet.
                </div>
              ) : null}

              {challengeCards.map((challenge) => {
                const progress = Math.max(0, Number(challenge.progressPoints ?? 0));
                const target = Math.max(1, Number(challenge.pointsRequiredToWin ?? 1));
                // Multi-winner (Phase 6): win/exhausted state comes from the current
                // cycle's ledger snapshot, not the legacy campaign-level winnerUserId
                // (which no longer identifies "the winner" once winnerQuota > 1).
                const isWinner = Boolean(challenge.viewerWon);
                // Fall back to the full quota (not exhausted) when the snapshot field is
                // missing — inferring from winnerUserId is wrong for recurring rewards,
                // whose winnerUserId is always null regardless of quota state.
                const quotaRemaining = challenge.quotaRemaining ?? challenge.winnerQuota ?? 1;
                // A weekly places reward pays up to N players and can settle with fewer (or none), so
                // "quota used up" is meaningless for it: its card reads the week's own state instead.
                const isRanked = challenge.winCondition === "ranked_places";
                const rankedCard = isRanked && challenge.rankedPlaces ? composeRankedCard(challenge.rankedPlaces) : null;
                const isExhausted = !isRanked && quotaRemaining <= 0;
                const winnerUsernames = challenge.winnerUsernames ?? [];
                const isWon = isWinner || isExhausted;
                // An NFL reward whose first week is still in the future: real
                // cycles are already running, but nothing can be earned yet, so
                // it must not read as live. Rules stay openable — seeing the
                // terms early is the point of creating it before the season.
                const upcomingStartDate = !isWon ? challenge.upcomingStartDate ?? null : null;
                const isUpcoming = Boolean(upcomingStartDate);
                const canOpenRules = !isWon;
                const canOpenRedeem = isWinner;
                const isBusy = pendingChallengeRedeemId === challenge.id;
                const gameType = inferChallengeGameType(challenge.name, challenge.rewardDefinitionId);
                const iconStyle = CHALLENGE_ICON_STYLE[gameType];
                // Prize-first: the prize is the headline, the game name demotes to
                // an eyebrow. rewardHeadline falls back to challenge.name for legacy
                // pre-Rewards rows with no structured prize (not a designed state).
                const headline = rewardHeadline(challenge);
                const gameLabel = rewardGameLabel(gameType);
                return (
                  <button
                    key={challenge.id}
                    type="button"
                    onClick={(event) => {
                      if (canOpenRedeem) {
                        onGoToChallengeRedeem(challenge.id, event.currentTarget);
                        return;
                      }
                      if (canOpenRules) {
                        onSelectChallenge(challenge.id);
                      }
                    }}
                    disabled={!canOpenRules && !canOpenRedeem}
                    aria-disabled={!canOpenRules && !canOpenRedeem}
                    className={`flex w-full flex-col overflow-hidden rounded-2xl p-4 text-left shadow-ht-panel transition-opacity ${
                      !canOpenRules && !canOpenRedeem ? "cursor-default opacity-60" : "hover:opacity-90"
                    }`}
                    style={{
                      background: isWinner ? "var(--ht-prize-won-bg)" : "var(--ht-prize-card-bg)",
                      border: `1.5px solid ${isWinner ? "var(--ht-prize-won-edge)" : iconStyle.cardAccent}`,
                    }}
                  >
                    {/* Header row: icon + game eyebrow + prize headline + status chip */}
                    <div className="flex items-start gap-3">
                      <ChallengeIconBadge gameType={gameType} />
                      <div className="min-w-0 flex-1">
                        {gameLabel ? (
                          <div className="text-caption font-black uppercase leading-tight tracking-[0.14em] text-ht-fg-muted">
                            {gameLabel}
                          </div>
                        ) : null}
                        <div className="mt-0.5 break-words text-xl font-black leading-snug text-ht-fg-strong">
                          {headline}
                        </div>
                        {/* Status chip and the Details affordance share a row *under* the
                            headline so the prize copy gets the card's full width — prize
                            strings run long ("$25.00 off Whole Order") and were wrapping
                            to three lines when Details sat beside them. */}
                        <div className="mt-1 flex items-center justify-between gap-2">
                          {isWon && isWinner ? (
                            <span className="inline-flex items-center rounded-full border border-ht-chip-won-edge bg-ht-chip-won-bg px-2 py-0.5 text-xs font-black uppercase tracking-[0.1em] text-ht-chip-won-fg">
                              You Won
                            </span>
                          ) : isWon ? (
                            <span className="inline-flex items-center rounded-full border border-ht-chip-neutral-edge bg-ht-chip-neutral-bg px-2 py-0.5 text-xs font-black uppercase tracking-[0.1em] text-ht-fg-muted">
                              All Claimed
                            </span>
                          ) : rankedCard?.status === "week_complete" ? (
                            <span className="inline-flex items-center rounded-full border border-ht-chip-neutral-edge bg-ht-chip-neutral-bg px-2 py-0.5 text-xs font-black uppercase tracking-[0.1em] text-ht-fg-muted">
                              Week Complete
                            </span>
                          ) : isUpcoming || rankedCard?.status === "upcoming" ? (
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-[0.1em] text-ht-warn-fg"
                              style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)" }}
                            >
                              Upcoming
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-[0.1em] text-ht-accent"
                              style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)" }}
                            >
                              In Progress
                            </span>
                          )}
                          {canOpenRules && (
                            <span className="shrink-0 text-xs font-black uppercase tracking-[0.08em] text-ht-fg-faint">
                              Details ›
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Rules */}
                    {challenge.description?.summary || challenge.rules ? (
                      <div className="mt-3 rounded-lg border border-ht-note-edge bg-ht-note-bg px-3 py-2.5 text-base leading-relaxed text-ht-fg-muted">
                        {challenge.description?.summary ?? challenge.rules}
                      </div>
                    ) : null}

                    {/* Body: weekly standing, leaderboard, progress bar, or won state */}
                    {rankedCard ? (
                      <div className="mt-3 space-y-2">
                        {isWinner ? (
                          <div className="inline-flex items-center rounded-full border border-ht-claim-edge bg-ht-claim-bg px-3 py-1.5 text-sm font-black uppercase tracking-[0.08em] text-ht-chip-won-fg">
                            {isBusy ? "Opening…" : "Prize won! Tap to claim it."}
                          </div>
                        ) : null}
                        {rankedCard.lines.map((line) => (
                          <p key={line} className="text-base text-ht-fg-soft">
                            {line}
                          </p>
                        ))}
                      </div>
                    ) : isWon && isWinner ? (
                      <div className="mt-3 inline-flex items-center rounded-full border border-ht-claim-edge bg-ht-claim-bg px-3 py-1.5 text-sm font-black uppercase tracking-[0.08em] text-ht-chip-won-fg">
                        {/* prizeClaimedAt is the AWARD timestamp (challenge_campaign_redemptions.claimed_at
                            defaults to now() on insert), not a redemption flag — it's always set the
                            instant a winner is picked, so it can't distinguish claimed vs. unclaimed. */}
                        {isBusy ? "Opening…" : "Prize won! Tap to claim it."}
                      </div>
                    ) : isWon ? (
                      <p className="mt-3 text-base text-ht-fg-faint">
                        {winnerUsernames.length > 0 ? (
                          <>
                            Congrats to{" "}
                            <span className="text-ht-fg-muted">{winnerUsernames.join(", ")}</span>
                            {" — "}
                            {winnerUsernames.length > 1 ? "all prizes" : "the prize"} for this cycle{" "}
                            {winnerUsernames.length > 1 ? "have" : "has"} been claimed.
                          </>
                        ) : (
                          "All prizes for this cycle have been claimed."
                        )}
                      </p>
                    ) : isUpcoming && upcomingStartDate ? (
                      <p className="mt-3 text-base text-ht-warn-fg/80">
                        Starts {formatUpcomingDate(upcomingStartDate)} — get your picks in early.
                      </p>
                    ) : challenge.challengeMode === "leaderboard" ? (
                      // Legacy leaderboard-mode rewards finish out their current cycle, but
                      // standings are never rendered on this panel (Rewards is progress-only).
                      <p className="mt-3 text-base text-ht-fg-faint">In progress — check back for results.</p>
                    ) : challenge.winCondition === "game_winner" || challenge.winCondition === "ranked_places" ? (
                      // No points target to bar-chart — the reward goes to whoever wins
                      // (or, for a weekly places reward, to the week's top players: its
                      // standings render above from `rankedPlaces`, and only reach here when
                      // that state couldn't be built, so it shows its composed text, never a
                      // gauge), resolved by the winner-rewards cron once the contest ends. A composed
                      // summary above already says what to do and what you win; only a legacy
                      // hand-written reward (isCustom) needs this line.
                      challenge.description?.isCustom !== false ? (
                        <p className="mt-3 text-base text-ht-fg-faint">Awarded to the winner.</p>
                      ) : null
                    ) : (
                      <div className="mt-3">
                        <RewardProgressGauge progress={progress} target={target} barGradient={iconStyle.barGradient} />
                      </div>
                    )}
                  </button>
                );
              })}

              {challengesError ? (
                <button
                  type="button"
                  onClick={onRetryChallenges}
                  className="rounded-md border border-ht-loss-fg/60 bg-ht-danger-wash px-2 py-1 text-caption font-black uppercase tracking-[0.08em] text-ht-danger-fg"
                >
                  {challengesError} Tap to retry
                </button>
              ) : null}
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}

export const VenueChallengesPanel = React.memo(VenueChallengesPanelInner);
VenueChallengesPanel.displayName = "VenueChallengesPanel";

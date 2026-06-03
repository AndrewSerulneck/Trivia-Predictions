"use client";

import React from "react";
import {
  CHALLENGE_ICON_STYLE,
  ChallengeIconBadge,
  inferChallengeGameType,
  type ChallengeCampaignCard,
} from "@/components/venue/venueHubShared";

type VenueChallengesPanelProps = {
  contentReady: boolean;
  isChallengesLoading: boolean;
  challengeCards: ChallengeCampaignCard[];
  currentUserId: string;
  pendingChallengeRedeemId: string | null;
  challengesError: string;
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
  onSelectChallenge,
  onGoToChallengeRedeem,
  onRetryChallenges,
}: VenueChallengesPanelProps) {
  return (
    <section className="venue-screen m-0 flex w-full shrink-0 basis-full snap-start flex-col items-center p-0 box-border">
      <div className={`venue-home-panel-content w-full px-[clamp(1rem,3.2vw,1.5rem)] pb-3 pt-1 transition-opacity duration-300 ${contentReady ? "opacity-100" : "opacity-0"}`}>
        <div className="mx-auto w-full max-w-[26rem] space-y-3">
          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-400">
              {isChallengesLoading
                ? "Challenges"
                : challengeCards.length > 0
                ? `Active · ${challengeCards.length} Challenge${challengeCards.length !== 1 ? "s" : ""}`
                : "Challenges"}
            </p>
            <div className="space-y-2">
              {isChallengesLoading ? (
                <div className="space-y-3 rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 animate-pulse rounded-2xl bg-slate-700" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-40 animate-pulse rounded bg-slate-700" />
                      <div className="h-2 w-full animate-pulse rounded bg-slate-700/70" />
                      <div className="h-2 w-24 animate-pulse rounded bg-slate-700/50" />
                    </div>
                  </div>
                </div>
              ) : null}

              {!isChallengesLoading && challengeCards.length === 0 ? (
                <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4 text-center text-sm font-semibold text-slate-500">
                  No active challenges for this venue yet.
                </div>
              ) : null}

              {challengeCards.map((challenge) => {
                const progress = Math.max(0, Number(challenge.progressPoints ?? 0));
                const target = Math.max(1, Number(challenge.pointsRequiredToWin ?? 1));
                const percent = Math.min(100, Math.round((progress / target) * 100));
                const isWon = Boolean(challenge.winnerUserId);
                const isWinner = Boolean(challenge.winnerUserId && challenge.winnerUserId === currentUserId);
                const canOpenRules = !isWon;
                const canOpenRedeem = isWinner;
                const isBusy = pendingChallengeRedeemId === challenge.id;
                const gameType = inferChallengeGameType(challenge.name);
                const iconStyle = CHALLENGE_ICON_STYLE[gameType];
                const topEntries = challenge.leaderboard?.topEntries ?? [];
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
                    className={`flex w-full flex-col overflow-hidden rounded-2xl p-4 text-left transition-opacity ${
                      !canOpenRules && !canOpenRedeem ? "cursor-default opacity-60" : "hover:opacity-90"
                    }`}
                    style={{
                      background: isWinner ? "linear-gradient(135deg, #1c1400, #2d1f00)" : "#111827",
                      border: `1.5px solid ${isWinner ? "rgba(251,191,36,0.4)" : iconStyle.cardAccent}`,
                    }}
                  >
                    {/* Header row: icon + name + status chip */}
                    <div className="flex items-center gap-3">
                      <ChallengeIconBadge gameType={gameType} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xl font-black leading-snug text-slate-100">
                          {challenge.name}
                        </div>
                        {isWon && isWinner ? (
                          <span className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-[0.1em] text-amber-300"
                            style={{ background: "rgba(251,191,36,0.18)", border: "1px solid rgba(251,191,36,0.3)" }}>
                            You Won
                          </span>
                        ) : isWon ? (
                          <span className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-[0.1em] text-slate-400"
                            style={{ background: "rgba(51,65,85,0.5)", border: "1px solid rgba(71,85,105,0.5)" }}>
                            Claimed
                          </span>
                        ) : (
                          <span className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-[0.1em] text-cyan-400"
                            style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)" }}>
                            {challenge.challengeMode === "leaderboard" ? "Leaderboard" : "Gauge"}
                          </span>
                        )}
                      </div>
                      {canOpenRules && (
                        <span className="shrink-0 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                          Rules ›
                        </span>
                      )}
                    </div>

                    {/* Rules */}
                    {challenge.rules ? (
                      <div className="mt-3 rounded-lg px-3 py-2.5 text-base leading-relaxed text-slate-400"
                        style={{ background: "rgba(30,41,59,0.7)", border: "1px solid rgba(71,85,105,0.4)" }}>
                        {challenge.rules}
                      </div>
                    ) : null}

                    {/* Body: leaderboard, progress bar, or won state */}
                    {isWon && isWinner ? (
                      <div className="mt-3 inline-flex items-center rounded-full px-3 py-1.5 text-sm font-black uppercase tracking-[0.08em] text-amber-300"
                        style={{ border: "1px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.12)" }}>
                        {isBusy ? "Opening…" : challenge.prizeClaimedAt ? "Prize Claimed" : "→ Tap to Claim Prize"}
                      </div>
                    ) : isWon ? (
                      <p className="mt-3 text-base text-slate-500">
                        Won by <span className="text-slate-400">{challenge.winnerUsername ?? "Champion"}</span>
                      </p>
                    ) : challenge.challengeMode === "leaderboard" ? (
                      <div className="mt-3">
                        {topEntries.length === 0 ? (
                          <p className="text-base text-slate-500">No scores yet — be the first to play!</p>
                        ) : (
                          <div role="list" aria-label="Challenge leaderboard">
                            {/* Column headers */}
                            <div className="mb-1 flex items-center gap-2 border-b border-slate-700/60 pb-1.5 px-1">
                              <span className="w-6 shrink-0 text-right text-sm font-black uppercase tracking-[0.1em] text-slate-600">#</span>
                              <span className="min-w-0 flex-1 text-sm font-black uppercase tracking-[0.1em] text-slate-600">Player</span>
                              <span className="shrink-0 text-sm font-black uppercase tracking-[0.1em] text-slate-600">Pts</span>
                            </div>
                            {topEntries.map((entry) => {
                              const isViewer = entry.userId === currentUserId;
                              return (
                                <div
                                  key={entry.userId}
                                  role="listitem"
                                  className={`flex items-center gap-2 rounded px-1 py-1.5 ${isViewer ? "bg-cyan-500/10" : ""}`}
                                >
                                  <span className="w-6 shrink-0 text-right text-base font-black tabular-nums text-slate-500">
                                    {entry.rank}
                                  </span>
                                  <span className={`min-w-0 flex-1 truncate text-lg font-semibold ${isViewer ? "text-cyan-300" : "text-slate-200"}`}>
                                    {entry.username}{isViewer ? " (you)" : ""}
                                  </span>
                                  <span className="shrink-0 text-lg font-black tabular-nums text-amber-200">
                                    {entry.points.toLocaleString()}
                                  </span>
                                </div>
                              );
                            })}
                            {challenge.leaderboard?.viewer && !challenge.leaderboard.viewer.inTop ? (
                              <>
                                <div aria-hidden className="my-1 border-t border-slate-700/50" />
                                <div
                                  role="listitem"
                                  className="flex items-center gap-2 rounded bg-cyan-500/10 px-1 py-1.5"
                                >
                                  <span className="w-6 shrink-0 text-right text-base font-black tabular-nums text-slate-500">
                                    {challenge.leaderboard.viewer.rank ?? "—"}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-base font-semibold text-cyan-300">
                                    {challenge.leaderboard.viewer.username ?? "You"} (you)
                                  </span>
                                  <span className="shrink-0 text-lg font-black tabular-nums text-amber-200">
                                    {challenge.leaderboard.viewer.points.toLocaleString()}
                                  </span>
                                </div>
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${percent}%`, background: iconStyle.barGradient }}
                          />
                        </div>
                        <div className="mt-1.5 text-sm font-semibold tabular-nums text-slate-500">
                          {progress.toLocaleString()} / {target.toLocaleString()} pts
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}

              {challengesError ? (
                <button
                  type="button"
                  onClick={onRetryChallenges}
                  className="rounded-md border border-rose-400/60 bg-rose-950/30 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-rose-300"
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

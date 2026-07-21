"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/storage";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import { useVenuePresence } from "@/components/venue/VenuePresenceBoundary";
import { navigateBackToVenue, runVenueGameReturnTransition } from "@/lib/venueGameTransition";
import type { ChallengeCampaign } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

type ChallengeWin = {
  challengeId: string;
  challengeName: string;
  challengeRules: string;
  cycleStart?: string | null;
  claimedAt?: string | null;
};

type RedeemPayload = {
  ok: boolean;
  wins?: ChallengeWin[];
  error?: string;
};

type CampaignSnapshot = ChallengeCampaign & { progressPoints: number };

type SnapshotPayload = {
  ok: boolean;
  campaigns?: CampaignSnapshot[];
  error?: string;
};

// ── localStorage helpers ──────────────────────────────────────────────────────

const PROGRESS_STORAGE_KEY = "tp:challenge-gauge-progress";

function readStoredProgress(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function writeStoredProgress(progress: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage quota exceeded or private-mode restriction — silently ignore.
  }
}

// ── GaugeBar ─────────────────────────────────────────────────────────────────

// ease-out-expo: fast start, long deceleration tail — matches coin-flight arc
const GAUGE_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const INITIAL_DURATION = "1.5s";
const POLL_DURATION = "0.6s";

function GaugeBar({
  current,
  target,
  initialPct = 0,
}: {
  current: number;
  target: number;
  initialPct?: number;
}) {
  const targetPct = target > 0 ? Math.min(100, (current / target) * 100) : 0;

  // Start at last-seen percentage; transition to current on mount, then follow polls.
  const [displayPct, setDisplayPct] = useState(initialPct);
  const [duration, setDuration] = useState(INITIAL_DURATION);
  const didMountRef = useRef(false);

  useEffect(() => {
    let frameId: number | null = null;
    let nestedFrameId: number | null = null;
    let durationTimeoutId: number | null = null;

    if (!didMountRef.current) {
      didMountRef.current = true;
      // Double-rAF: guarantee the browser has painted the bar at initialPct
      // before starting the fill animation so the delta is actually visible.
      frameId = window.requestAnimationFrame(() => {
        nestedFrameId = window.requestAnimationFrame(() => {
          setDisplayPct(targetPct);
          // Once the 1.5 s entry animation finishes, switch to a snappier
          // duration for live poll updates (small increments feel sluggish at 1.5 s).
          durationTimeoutId = window.setTimeout(() => setDuration(POLL_DURATION), 1600);
        });
      });
    } else {
      frameId = window.requestAnimationFrame(() => {
        setDisplayPct(targetPct);
      });
    }

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (nestedFrameId !== null) window.cancelAnimationFrame(nestedFrameId);
      if (durationTimeoutId !== null) window.clearTimeout(durationTimeoutId);
    };
  }, [targetPct]);

  const isFull = displayPct >= 100;
  // Show the real percentage label (not the animated displayPct) so numbers
  // don't visually race the bar.
  const labelPct = Math.round(targetPct);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-cyan-100">{current.toLocaleString()} pts</span>
        <span className={isFull ? "text-yellow-300" : "text-cyan-300/70"}>{labelPct}%</span>
        <span className="text-cyan-300/70">{target.toLocaleString()} to win</span>
      </div>

      <div className="relative h-4 w-full overflow-hidden rounded-full bg-cyan-950/60 ring-1 ring-cyan-700/40">
        <div
          className="h-full rounded-full"
          style={{
            width: `${displayPct}%`,
            transition: `width ${duration} ${GAUGE_EASE}`,
            background: isFull
              ? "linear-gradient(90deg, #d79000, #f4b400, #fff3b0, #f4b400)"
              : "linear-gradient(90deg, #d79000, #f4b400 60%, #fff3b0)",
            boxShadow: displayPct > 0 ? "0 0 10px #f4b400aa, 0 0 3px #fff3b066" : "none",
          }}
        />
        {/* Reference tick at 50% */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-cyan-400/20" />
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000;

function gameTypeLabel(gameTypes: string[]): string {
  if (!gameTypes || gameTypes.length === 0) return "All games";
  const normalized = new Set(gameTypes.map((gameType) => String(gameType).trim().toLowerCase()));
  const coversAllGames =
    normalized.has("pickem") &&
    normalized.has("fantasy") &&
    normalized.has("bingo") &&
    (normalized.has("speed-trivia") || normalized.has("trivia")) &&
    normalized.has("live-trivia");
  if (coversAllGames) return "All games";
  return gameTypes
    .map((g) => {
      if (g === "pickem") return "Pick 'Em";
      if (g === "fantasy") return "Fantasy";
      if (g === "speed-trivia" || g === "trivia") return "Speed Trivia";
      if (g === "live-trivia" || g === "live_trivia") return "Live Trivia";
      if (g === "bingo") return "Bingo";
      return g;
    })
    .join(", ");
}

// ── ChallengeRedeemPanel ──────────────────────────────────────────────────────

export function ChallengeRedeemPanel({ venueId }: { venueId: string }) {
  const router = useRouter();
  const venuePresence = useVenuePresence();
  const [userId, setUserId] = useState("");
  const [wins, setWins] = useState<ChallengeWin[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<CampaignSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  // Read localStorage once before the first render so GaugeBar gets the
  // correct initialPct on its first mount (not a later hydration update).
  const [lastSeenProgress] = useState<Record<string, number>>(readStoredProgress);

  // Keep a ref to the latest campaigns so the unmount effect can save them
  // without needing activeCampaigns in its dependency array.
  const activeCampaignsRef = useRef<CampaignSnapshot[]>([]);
  useEffect(() => {
    activeCampaignsRef.current = activeCampaigns;
  }, [activeCampaigns]);

  // Persist last-seen progress when the panel unmounts.
  useEffect(() => {
    return () => {
      const toSave: Record<string, number> = {};
      for (const campaign of activeCampaignsRef.current) {
        toSave[campaign.id] = campaign.progressPoints;
      }
      if (Object.keys(toSave).length > 0) {
        writeStoredProgress(toSave);
      }
    };
  }, []);

  useEffect(() => {
    setUserId((getUserId() ?? "").trim());
  }, []);

  const load = useCallback(async () => {
    if (!venueId || !userId) {
      setWins([]);
      setActiveCampaigns([]);
      setLoading(false);
      return;
    }

    try {
      const [redeemRes, snapshotRes] = await Promise.all([
        fetch(
          `/api/challenge-campaigns/redeem?${new URLSearchParams({ venueId, userId }).toString()}`,
          { cache: "no-store" }
        ),
        fetch(
          `/api/challenge-campaigns?${new URLSearchParams({
            venueId,
            userId,
            includeInactive: "false",
            includeResolved: "false",
          }).toString()}`,
          { cache: "no-store" }
        ),
      ]);

      const redeemPayload = (await redeemRes.json()) as RedeemPayload;
      const snapshotPayload = (await snapshotRes.json()) as SnapshotPayload;

      if (redeemPayload.ok) setWins(redeemPayload.wins ?? []);
      if (snapshotPayload.ok) setActiveCampaigns(snapshotPayload.campaigns ?? []);
    } catch {
      // Keep stale data on transient network failures.
    } finally {
      setLoading(false);
    }
  }, [userId, venueId]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const unclaimedWins = useMemo(() => wins.filter((w) => !w.claimedAt), [wins]);
  const claimedWins = useMemo(() => wins.filter((w) => w.claimedAt), [wins]);

  const backToVenue = useCallback(() => {
    // Save progress before navigating away so the next visit gets the right initialPct.
    const toSave: Record<string, number> = {};
    for (const campaign of activeCampaignsRef.current) {
      toSave[campaign.id] = campaign.progressPoints;
    }
    if (Object.keys(toSave).length > 0) writeStoredProgress(toSave);

    void runVenueGameReturnTransition({
      gameKey: "fantasy",
      navigate: () =>
        navigateBackToVenue({
          venuePath: `/venue/${encodeURIComponent(venueId)}`,
          fallbackNavigate: () => router.push(`/venue/${encodeURIComponent(venueId)}`),
        }),
    });
  }, [router, venueId]);

  const claimKey = (win: ChallengeWin) =>
    win.cycleStart ? `${win.challengeId}:${win.cycleStart}` : win.challengeId;

  const claim = useCallback(
    async (win: ChallengeWin, sourceRect: DOMRect) => {
      const key = claimKey(win);
      if (!userId || !venueId || !win.challengeId || claimingId || win.claimedAt) return;
      if (venuePresence.isInteractionBlocked) return;
      setClaimingId(key);
      setErrorMessage("");
      setStatusMessage("");
      try {
        const response = await fetch("/api/challenge-campaigns/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, venueId, challengeId: win.challengeId, cycleStart: win.cycleStart ?? undefined }),
        });
        const payload = (await response.json()) as {
          ok: boolean;
          code?: string;
          result?: { claimed: boolean; challengeName: string };
          error?: string;
          userMessage?: string;
        };
        const presenceFailure = venuePresence.capturePresenceFailure(payload);
        if (presenceFailure) {
          throw new Error(presenceFailure.userMessage);
        }
        if (!payload.ok || !payload.result) {
          throw new Error(payload.error ?? "Failed to redeem challenge prize.");
        }
        if (payload.result.claimed) {
          window.dispatchEvent(
            new CustomEvent("tp:coin-flight", {
              detail: {
                sourceRect: {
                  left: sourceRect.left,
                  top: sourceRect.top,
                  width: sourceRect.width,
                  height: sourceRect.height,
                },
                delta: 30,
                coins: 24,
              },
            })
          );
          setStatusMessage(`Redeemed ${payload.result.challengeName}. Prize is now marked as claimed.`);
        } else {
          setStatusMessage(`Prize already claimed for ${payload.result.challengeName}.`);
        }
        await load();
      } catch (error) {
        setStatusMessage("");
        setErrorMessage(error instanceof Error ? error.message : "Failed to redeem challenge prize.");
      } finally {
        setClaimingId((prev) => (prev === key ? "" : prev));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claimingId, load, userId, venueId, venuePresence]
  );

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={backToVenue}
        className="tp-clean-button inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-4 py-2.5 text-sm font-semibold text-[#fff7ea] shadow-sm shadow-[#1c2b3a]/35"
      >
        <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff7ea]/20 text-xs">
          ←
        </span>
        Back to Venue
      </button>

      {/* ── Active campaign progress gauges ── */}
      {!loading && activeCampaigns.length > 0 && (
        <section className="rounded-2xl border border-cyan-700/60 bg-gradient-to-br from-cyan-950 to-slate-900 p-4 shadow-lg shadow-cyan-950/50">
          <h2 className="text-base font-bold tracking-tight text-cyan-100">Active Rewards</h2>
          <p className="mt-0.5 text-xs text-cyan-400/80">Points update every 15 s</p>

          <ul className="mt-3 space-y-5">
            {activeCampaigns.map((campaign) => {
              const lastSeen = lastSeenProgress[campaign.id] ?? 0;
              const progressDelta = Math.max(0, campaign.progressPoints - lastSeen);
              const initialPct =
                campaign.pointsRequiredToWin > 0
                  ? Math.min(100, (lastSeen / campaign.pointsRequiredToWin) * 100)
                  : 0;

              const isLeaderboard = campaign.challengeMode === "leaderboard";

              return (
                <li key={campaign.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold leading-tight text-white">{campaign.name}</p>
                      <p className="text-[11px] text-cyan-400/70">{gameTypeLabel(campaign.gameTypes)}</p>
                      {!isLeaderboard && progressDelta > 0 ? (
                        <span className="mt-1 inline-block rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-300 animate-pulse">
                          +{progressDelta.toLocaleString()} pts since last visit
                        </span>
                      ) : null}
                    </div>
                    {campaign.pointMultiplier > 1 && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black"
                        style={{
                          background: "linear-gradient(135deg, #d79000, #f4b400)",
                          color: "#1a0a00",
                          boxShadow: "0 0 6px #f4b40066",
                        }}
                      >
                        {campaign.pointMultiplier}× pts
                      </span>
                    )}
                  </div>

                  {isLeaderboard ? (
                    // Legacy leaderboard-mode reward — finishing out its current cycle.
                    // Standings are never rendered here anymore (Rewards is progress-only).
                    <p className="text-[11px] text-cyan-300/60">In progress — check back for results.</p>
                  ) : (
                    <GaugeBar
                      current={campaign.progressPoints}
                      target={campaign.pointsRequiredToWin}
                      initialPct={initialPct}
                    />
                  )}

                  {campaign.rules ? (
                    <p className="text-[11px] leading-relaxed text-cyan-300/60">{campaign.rules}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Prize redemption ── */}
      <section className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-4">
        <h2 className="text-lg font-semibold text-ht-fg-primary">Redeem Prize</h2>
        <p className="mt-1 text-sm text-ht-fg-muted">
          Claim your reward wins. Each prize can only be redeemed once.
        </p>

        {loading ? (
          <div className="mt-3">
            <BouncingBallLoader size="sm" label="Loading redemption details..." />
          </div>
        ) : null}

        {!loading && wins.length === 0 ? (
          <p className="mt-3 text-sm text-ht-fg-secondary">No redeemable reward wins found for this venue.</p>
        ) : null}

        {unclaimedWins.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {unclaimedWins.map((win) => {
              const key = claimKey(win);
              return (
                <li key={key} className="rounded-ht-lg border border-amber-400/40 bg-amber-500/10 p-3">
                  <p className="text-sm font-semibold text-amber-300">{win.challengeName}</p>
                  {win.cycleStart ? (
                    <p className="mt-0.5 text-[11px] text-amber-400/60">
                      Week of {new Date(win.cycleStart).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-amber-400/70">{win.challengeRules}</p>
                  <button
                    type="button"
                    disabled={Boolean(claimingId)}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      void claim(win, rect);
                    }}
                    className="mt-3 min-h-[44px] rounded-ht-lg border border-indigo-500/50 bg-indigo-500/15 px-3 py-2 text-sm font-semibold text-indigo-300 disabled:opacity-60"
                  >
                    {claimingId === key ? "Redeeming..." : "Redeem"}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {!loading && unclaimedWins.length === 0 && claimedWins.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {claimedWins.map((win) => (
              <li key={claimKey(win)} className="rounded-ht-lg border border-slate-700/50 bg-slate-800/30 p-3 opacity-70">
                <p className="text-sm font-semibold text-slate-400">{win.challengeName}</p>
                {win.cycleStart ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Week of {new Date(win.cycleStart).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                ) : null}
                <p className="mt-1 text-xs font-semibold text-slate-500">Already Redeemed</p>
              </li>
            ))}
          </ul>
        ) : null}

        {statusMessage ? (
          <p className="mt-3 rounded-ht-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
            {statusMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-3 rounded-ht-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400">
            {errorMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
}

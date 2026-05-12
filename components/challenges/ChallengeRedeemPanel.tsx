"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/storage";
import { navigateBackToVenue, runVenueGameReturnTransition } from "@/lib/venueGameTransition";
import type { ChallengeCampaign } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

type ChallengeWin = {
  challengeId: string;
  challengeName: string;
  challengeRules: string;
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
    if (!didMountRef.current) {
      didMountRef.current = true;
      // Double-rAF: guarantee the browser has painted the bar at initialPct
      // before starting the fill animation so the delta is actually visible.
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setDisplayPct(targetPct);
          // Once the 1.5 s entry animation finishes, switch to a snappier
          // duration for live poll updates (small increments feel sluggish at 1.5 s).
          const timeout = window.setTimeout(() => setDuration(POLL_DURATION), 1600);
          return () => window.clearTimeout(timeout);
        });
      });
      return () => cancelAnimationFrame(id);
    }
    setDisplayPct(targetPct);
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
  if (!gameTypes || gameTypes.length === 0 || gameTypes.length === 4) return "All games";
  return gameTypes
    .map((g) => {
      if (g === "pickem") return "Pick 'Em";
      if (g === "fantasy") return "Fantasy";
      if (g === "trivia") return "Trivia";
      if (g === "bingo") return "Bingo";
      return g;
    })
    .join(", ");
}

// ── ChallengeRedeemPanel ──────────────────────────────────────────────────────

export function ChallengeRedeemPanel({ venueId }: { venueId: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [wins, setWins] = useState<ChallengeWin[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<CampaignSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState("");
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

  const latestWin = useMemo(() => wins[0] ?? null, [wins]);

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

  const claim = useCallback(
    async (win: ChallengeWin, sourceRect: DOMRect) => {
      if (!userId || !venueId || !win.challengeId || claimingId || win.claimedAt) return;
      setClaimingId(win.challengeId);
      setErrorMessage("");
      setStatusMessage("");
      try {
        const response = await fetch("/api/challenge-campaigns/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, venueId, challengeId: win.challengeId }),
        });
        const payload = (await response.json()) as {
          ok: boolean;
          result?: { claimed: boolean; challengeName: string };
          error?: string;
        };
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
        setClaimingId("");
      }
    },
    [claimingId, load, userId, venueId]
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
          <h2 className="text-base font-bold tracking-tight text-cyan-100">Active Challenges</h2>
          <p className="mt-0.5 text-xs text-cyan-400/80">Points update every 15 s</p>

          <ul className="mt-3 space-y-5">
            {activeCampaigns.map((campaign) => {
              const lastSeen = lastSeenProgress[campaign.id] ?? 0;
              const initialPct =
                campaign.pointsRequiredToWin > 0
                  ? Math.min(100, (lastSeen / campaign.pointsRequiredToWin) * 100)
                  : 0;

              return (
                <li key={campaign.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold leading-tight text-white">{campaign.name}</p>
                      <p className="text-[11px] text-cyan-400/70">{gameTypeLabel(campaign.gameTypes)}</p>
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

                  <GaugeBar
                    current={campaign.progressPoints}
                    target={campaign.pointsRequiredToWin}
                    initialPct={initialPct}
                  />

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
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Redeem Prize</h2>
        <p className="mt-1 text-sm text-slate-600">
          Claim your challenge win once. Redeemed prizes cannot be claimed again.
        </p>

        {loading ? (
          <p className="mt-3 text-sm text-slate-600">Loading redemption details...</p>
        ) : null}
        {!loading && !latestWin ? (
          <p className="mt-3 text-sm text-slate-700">No redeemable challenge wins found for this venue.</p>
        ) : null}

        {latestWin ? (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">{latestWin.challengeName}</p>
            <p className="mt-1 text-xs text-amber-800">{latestWin.challengeRules}</p>
            <p className="mt-2 text-xs font-semibold text-amber-900">
              Prize: Venue champion recognition and winner redemption status.
            </p>
            <button
              type="button"
              disabled={Boolean(latestWin.claimedAt) || claimingId === latestWin.challengeId}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                void claim(latestWin, rect);
              }}
              className="tp-clean-button mt-3 min-h-[44px] rounded-lg border border-indigo-500 bg-indigo-100 px-3 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-60"
            >
              {latestWin.claimedAt
                ? "Already Redeemed"
                : claimingId === latestWin.challengeId
                  ? "Redeeming..."
                  : "Redeem"}
            </button>
          </div>
        ) : null}

        {statusMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            {statusMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            {errorMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
}

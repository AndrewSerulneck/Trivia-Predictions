"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/storage";
import { navigateBackToVenue, runVenueGameReturnTransition } from "@/lib/venueGameTransition";

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

export function ChallengeRedeemPanel({ venueId }: { venueId: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [wins, setWins] = useState<ChallengeWin[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    setUserId((getUserId() ?? "").trim());
  }, []);

  const load = useCallback(async () => {
    if (!venueId || !userId) {
      setWins([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({ venueId, userId });
      const response = await fetch(`/api/challenge-campaigns/redeem?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as RedeemPayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load challenge redemption.");
      }
      setWins(payload.wins ?? []);
    } catch (error) {
      setWins([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load challenge redemption.");
    } finally {
      setLoading(false);
    }
  }, [userId, venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const latestWin = useMemo(() => wins[0] ?? null, [wins]);

  const backToVenue = useCallback(() => {
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
      if (!userId || !venueId || !win.challengeId || claimingId || win.claimedAt) {
        return;
      }
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Redeem Prize</h2>
        <p className="mt-1 text-sm text-slate-600">Claim your challenge win once. Redeemed prizes cannot be claimed again.</p>

        {loading ? <p className="mt-3 text-sm text-slate-600">Loading redemption details...</p> : null}
        {!loading && !latestWin ? <p className="mt-3 text-sm text-slate-700">No redeemable challenge wins found for this venue.</p> : null}

        {latestWin ? (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">{latestWin.challengeName}</p>
            <p className="mt-1 text-xs text-amber-800">{latestWin.challengeRules}</p>
            <p className="mt-2 text-xs font-semibold text-amber-900">Prize: Venue champion recognition and winner redemption status.</p>
            <button
              type="button"
              disabled={Boolean(latestWin.claimedAt) || claimingId === latestWin.challengeId}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                void claim(latestWin, rect);
              }}
              className="tp-clean-button mt-3 min-h-[44px] rounded-lg border border-indigo-500 bg-indigo-100 px-3 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-60"
            >
              {latestWin.claimedAt ? "Already Redeemed" : claimingId === latestWin.challengeId ? "Redeeming..." : "Redeem"}
            </button>
          </div>
        ) : null}

        {statusMessage ? <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{statusMessage}</p> : null}
        {errorMessage ? <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{errorMessage}</p> : null}
      </section>
    </div>
  );
}

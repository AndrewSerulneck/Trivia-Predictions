"use client";

import { useEffect, useMemo, useState } from "react";
import { TriviaGame } from "@/components/trivia/TriviaGame";
import { TriviaThemeScope } from "@/components/trivia/TriviaThemeScope";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";
import { formatCountdown } from "@/components/venue/venueHubShared";
import { getUserId } from "@/lib/storage";

type TriviaQuotaSnapshot = {
  limit: number;
  questionsUsed: number;
  questionsRemaining: number;
  windowSecondsRemaining: number;
  isAdminBypass?: boolean;
};

export function TriviaAppFrame() {
  const [quota, setQuota] = useState<TriviaQuotaSnapshot | null>(null);
  const [quotaSecondsRemaining, setQuotaSecondsRemaining] = useState(0);

  const quotaLocked = Boolean(quota && !quota.isAdminBypass && quota.questionsRemaining <= 0);

  useEffect(() => {
    let cancelled = false;
    const loadQuota = async () => {
      const userId = (getUserId() ?? "").trim();
      if (!userId) {
        setQuota(null);
        setQuotaSecondsRemaining(0);
        return;
      }
      try {
        const response = await fetch(`/api/trivia/quota?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; quota?: TriviaQuotaSnapshot | null } | null;
        if (cancelled || !payload?.ok) {
          return;
        }
        const nextQuota = payload.quota ?? null;
        setQuota(nextQuota);
        const isLocked = Boolean(nextQuota && !nextQuota.isAdminBypass && nextQuota.questionsRemaining <= 0);
        setQuotaSecondsRemaining(isLocked ? Math.max(0, Math.floor(nextQuota?.windowSecondsRemaining ?? 0)) : 0);
      } catch {
        if (!cancelled) {
          setQuota(null);
          setQuotaSecondsRemaining(0);
        }
      }
    };

    void loadQuota();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!quotaLocked || quotaSecondsRemaining <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setQuotaSecondsRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [quotaLocked, quotaSecondsRemaining]);

  useEffect(() => {
    if (!quotaLocked || quotaSecondsRemaining > 0) {
      return;
    }
    let cancelled = false;
    const refreshQuota = async () => {
      const userId = (getUserId() ?? "").trim();
      if (!userId) return;
      try {
        const response = await fetch(`/api/trivia/quota?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; quota?: TriviaQuotaSnapshot | null } | null;
        if (cancelled || !payload?.ok) return;
        const nextQuota = payload.quota ?? null;
        setQuota(nextQuota);
        const stillLocked = Boolean(nextQuota && !nextQuota.isAdminBypass && nextQuota.questionsRemaining <= 0);
        setQuotaSecondsRemaining(stillLocked ? Math.max(0, Math.floor(nextQuota?.windowSecondsRemaining ?? 0)) : 0);
      } catch {
        // The game view still enforces quota if the refresh fails.
      }
    };
    void refreshQuota();
    return () => {
      cancelled = true;
    };
  }, [quotaLocked, quotaSecondsRemaining]);

  const landingStatus = useMemo(() => {
    if (!quotaLocked) {
      return null;
    }

    return (
      <div className="rounded-2xl border border-[rgba(250,204,21,0.45)] bg-[#0a0a0f]/90 px-4 py-3 text-center shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#84cc16]">
          Speed Trivia refresh
        </p>
        <p className="mt-1 text-sm font-extrabold text-white">
          You can play again in{" "}
          <span className="font-mono text-[#facc15]">{formatCountdown(quotaSecondsRemaining)}</span>.
        </p>
      </div>
    );
  }, [quotaLocked, quotaSecondsRemaining]);

  return (
    <>
      <TriviaThemeScope />
      <GameLandingExperience
        gameKey="speed-trivia"
        playLabel="Play Trivia"
        playDisabled={quotaLocked}
        playDisabledLabel={`Locked · ${formatCountdown(quotaSecondsRemaining)}`}
        landingStatus={landingStatus}
        showShellUserStatus={false}
        playingContainerClassName="px-0 py-0"
        playingBackgroundClassName="tp-trivia-bg"
      >
        <div className="flex h-full min-h-0 flex-col">
          <TriviaGame />
        </div>
      </GameLandingExperience>
    </>
  );
}

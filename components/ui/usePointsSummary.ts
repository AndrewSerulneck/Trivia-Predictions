"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cachedFetch } from "@/lib/fetchCache";
import { getUserId, getUsername, getVenueId } from "@/lib/storage";

type SummaryPayload = {
  ok: boolean;
  profile?: {
    username: string;
    points: number;
    venueId: string;
  } | null;
};

// Shared account/points state used by both the home hamburger bar and the
// in-game AppBar points pill. Owns the summary fetch, the points roll-up
// animation, and the `tp:points-updated` / coin-flight wiring so that any
// surface rendering a PointsPill gets live scoring feedback. The summary fetch
// is deduped through cachedFetch, so multiple consumers share one network call.
export type PointsSummary = {
  username: string;
  points: number | null;
  displayedPoints: number;
  pointsPop: boolean;
  pointsFlash: boolean;
  pointsGain: number | null;
  pointsBurstAmount: number | null;
  pointsBurstVisible: boolean;
  pointsBurstToken: number;
  hasUnclaimedPrize: boolean;
  refresh: () => void;
};

export function usePointsSummary(): PointsSummary {
  const pathname = usePathname();
  const isJoinRoute = pathname === "/" || pathname === "/join";

  const [username, setUsername] = useState("");
  const [points, setPoints] = useState<number | null>(null);
  const [displayedPoints, setDisplayedPoints] = useState(0);
  const [pointsPop, setPointsPop] = useState(false);
  const [pointsFlash, setPointsFlash] = useState(false);
  const [pointsGain, setPointsGain] = useState<number | null>(null);
  const [pointsBurstAmount, setPointsBurstAmount] = useState<number | null>(null);
  const [pointsBurstVisible, setPointsBurstVisible] = useState(false);
  const [pointsBurstToken, setPointsBurstToken] = useState(0);
  const [hasUnclaimedPrize, setHasUnclaimedPrize] = useState(false);

  const priorPointsRef = useRef<number | null>(null);
  const displayedPointsRef = useRef(0);
  const pointsTickerRef = useRef<number | null>(null);
  const pointsRef = useRef(points);
  const gainHideTimerRef = useRef<number | null>(null);
  const popHideTimerRef = useRef<number | null>(null);
  const flashHideTimerRef = useRef<number | null>(null);
  const burstHideTimerRef = useRef<number | null>(null);

  const animatePointsTo = useCallback((targetPoints: number) => {
    const safeTarget = Math.max(0, Math.round(targetPoints));
    const startPoints = displayedPointsRef.current;

    if (safeTarget <= startPoints) {
      setDisplayedPoints(safeTarget);
      displayedPointsRef.current = safeTarget;
      return;
    }

    if (pointsTickerRef.current) {
      window.clearInterval(pointsTickerRef.current);
    }

    const delta = safeTarget - startPoints;
    const frameCount = 18;
    const step = Math.max(1, Math.ceil(delta / frameCount));
    let running = startPoints;

    pointsTickerRef.current = window.setInterval(() => {
      running = Math.min(safeTarget, running + step);
      setDisplayedPoints(running);
      displayedPointsRef.current = running;

      if (running >= safeTarget) {
        if (pointsTickerRef.current) {
          window.clearInterval(pointsTickerRef.current);
          pointsTickerRef.current = null;
        }
      }
    }, 28);
  }, []);

  const setPointsAndAnimate = useCallback(
    (nextPoints: number) => {
      const rounded = Math.max(0, Math.round(nextPoints));
      setPoints(rounded);
      animatePointsTo(rounded);
      priorPointsRef.current = rounded;
    },
    [animatePointsTo]
  );

  const animateGain = useCallback((delta: number) => {
    if (delta <= 0) {
      return;
    }

    setPointsGain((current) => (current ?? 0) + delta);
    setPointsPop(true);
    setPointsFlash(true);
    setPointsBurstAmount(delta);
    setPointsBurstVisible(true);
    setPointsBurstToken((value) => value + 1);

    if (gainHideTimerRef.current) {
      window.clearTimeout(gainHideTimerRef.current);
    }
    gainHideTimerRef.current = window.setTimeout(() => {
      setPointsGain(null);
    }, 1400);

    if (popHideTimerRef.current) {
      window.clearTimeout(popHideTimerRef.current);
    }
    popHideTimerRef.current = window.setTimeout(() => {
      setPointsPop(false);
    }, 280);

    if (flashHideTimerRef.current) {
      window.clearTimeout(flashHideTimerRef.current);
    }
    flashHideTimerRef.current = window.setTimeout(() => {
      setPointsFlash(false);
    }, 900);

    if (burstHideTimerRef.current) {
      window.clearTimeout(burstHideTimerRef.current);
    }
    burstHideTimerRef.current = window.setTimeout(() => {
      setPointsBurstVisible(false);
    }, 920);
  }, []);

  const loadSummary = useCallback(async () => {
    const userId = getUserId() ?? "";
    const venueId = getVenueId() ?? "";

    if (!userId) {
      setUsername("");
      setPoints(null);
      priorPointsRef.current = null;
      displayedPointsRef.current = 0;
      setDisplayedPoints(0);
      return;
    }

    const fallbackUsername = getUsername() ?? "";
    if (fallbackUsername) {
      setUsername(fallbackUsername);
    }

    const cacheKey = `summary:${userId}:${venueId}`;
    const payload = await cachedFetch<SummaryPayload>(
      cacheKey,
      async () => {
        const response = await fetch(
          `/api/users/summary?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venueId)}`,
          { cache: "no-store" }
        );
        return response.json() as Promise<SummaryPayload>;
      },
      4_000
    );
    if (!payload.ok || !payload.profile) {
      return;
    }

    setUsername(payload.profile.username);
    setPointsAndAnimate(payload.profile.points);

    if (priorPointsRef.current !== null && payload.profile.points > priorPointsRef.current) {
      animateGain(payload.profile.points - priorPointsRef.current);
    }
    priorPointsRef.current = payload.profile.points;

    if (userId && venueId) {
      fetch(
        `/api/prizes/has-unclaimed?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venueId)}`,
        { cache: "no-store" }
      )
        .then((r) => r.json() as Promise<{ ok: boolean; hasUnclaimed: boolean }>)
        .then((p) => {
          if (p.ok) setHasUnclaimedPrize(p.hasUnclaimed);
        })
        .catch(() => {});
    }
  }, [animateGain, setPointsAndAnimate]);

  // Keep a ref in sync with the points state so the onPointsUpdated closure
  // always reads the latest value without needing `points` in the effect deps.
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    if (isJoinRoute) return;

    const initialTimer = window.setTimeout(() => {
      void loadSummary();
    }, 0);

    const interval = window.setInterval(() => {
      void loadSummary();
    }, 20000);

    const onPointsUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ delta?: number; source?: string }>;
      const delta = Number(custom.detail?.delta ?? 0);
      if (Number.isFinite(delta) && delta > 0) {
        const next = (pointsRef.current ?? 0) + delta;
        setPointsAndAnimate(next);
        animateGain(delta);
        if (
          custom.detail?.source !== "speed-trivia" &&
          custom.detail?.source !== "notifications" &&
          custom.detail?.source !== "bingo-claim" &&
          custom.detail?.source !== "fantasy-claim" &&
          custom.detail?.source !== "pickem-claim"
        ) {
          window.dispatchEvent(
            new CustomEvent("tp:coin-flight", {
              detail: { delta, coins: Math.min(28, Math.max(10, Math.round(delta / 2) + 8)) },
            })
          );
        }
      }
      void loadSummary();
    };

    window.addEventListener("tp:points-updated", onPointsUpdated);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener("tp:points-updated", onPointsUpdated);
      if (pointsTickerRef.current) {
        window.clearInterval(pointsTickerRef.current);
      }
      if (gainHideTimerRef.current) {
        window.clearTimeout(gainHideTimerRef.current);
      }
      if (popHideTimerRef.current) {
        window.clearTimeout(popHideTimerRef.current);
      }
      if (flashHideTimerRef.current) {
        window.clearTimeout(flashHideTimerRef.current);
      }
      if (burstHideTimerRef.current) {
        window.clearTimeout(burstHideTimerRef.current);
      }
    };
  }, [animateGain, isJoinRoute, loadSummary, setPointsAndAnimate]);

  const refresh = useCallback(() => {
    void loadSummary();
  }, [loadSummary]);

  return {
    username,
    points,
    displayedPoints,
    pointsPop,
    pointsFlash,
    pointsGain,
    pointsBurstAmount,
    pointsBurstVisible,
    pointsBurstToken,
    hasUnclaimedPrize,
    refresh,
  };
}

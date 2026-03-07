"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { getUserId, getUsername, getVenueId } from "@/lib/storage";

type SummaryPayload = {
  ok: boolean;
  profile?: {
    username: string;
    points: number;
    venueId: string;
  } | null;
};

export function UserStatusHeader() {
  const pathname = usePathname();
  const isJoinRoute = pathname === "/" || pathname === "/join";
  const [username, setUsername] = useState("");
  const [points, setPoints] = useState<number | null>(null);
  const [displayedPoints, setDisplayedPoints] = useState(0);
  const [pointsPop, setPointsPop] = useState(false);
  const [pointsGain, setPointsGain] = useState<number | null>(null);

  const priorPointsRef = useRef<number | null>(null);
  const displayedPointsRef = useRef(0);
  const pointsTickerRef = useRef<number | null>(null);
  const gainHideTimerRef = useRef<number | null>(null);
  const popHideTimerRef = useRef<number | null>(null);

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

    const response = await fetch(
      `/api/users/summary?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venueId)}`,
      { cache: "no-store" }
    );
    const payload = (await response.json()) as SummaryPayload;
    if (!payload.ok || !payload.profile) {
      return;
    }

    setUsername(payload.profile.username);
    setPointsAndAnimate(payload.profile.points);

    if (priorPointsRef.current !== null && payload.profile.points > priorPointsRef.current) {
      animateGain(payload.profile.points - priorPointsRef.current);
    }
    priorPointsRef.current = payload.profile.points;
  }, [animateGain, setPointsAndAnimate]);

  useEffect(() => {
    if (isJoinRoute) {
      setUsername("");
      setPoints(null);
      setDisplayedPoints(0);
      priorPointsRef.current = null;
      displayedPointsRef.current = 0;
      return;
    }

    void loadSummary();

    const interval = window.setInterval(() => {
      void loadSummary();
    }, 20000);

    const onPointsUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ delta?: number }>;
      const delta = Number(custom.detail?.delta ?? 0);
      if (Number.isFinite(delta) && delta > 0) {
        const next = (points ?? 0) + delta;
        setPointsAndAnimate(next);
        animateGain(delta);
      }
      void loadSummary();
    };

    window.addEventListener("tp:points-updated", onPointsUpdated);

    return () => {
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
    };
  }, [animateGain, isJoinRoute, loadSummary, setPointsAndAnimate]);

  if (isJoinRoute) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="tp-bounce-hover flex items-center gap-2 rounded-2xl border-4 border-slate-900 bg-cyan-300 px-3 py-2 text-sm font-medium text-slate-900 shadow-[4px_4px_0_#0f172a]">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-4 border-slate-900 bg-white text-[11px]">
          {((username || "G").trim()[0] ?? "G").toUpperCase()}
        </span>
        <span>{username || "Guest"}</span>
      </div>
      <div
        className={`tp-bounce-hover rounded-2xl border-4 border-slate-900 bg-yellow-200 px-3 py-2 text-sm font-medium text-slate-900 shadow-[4px_4px_0_#0f172a] transition-transform duration-200 ${
          pointsPop ? "scale-110" : "scale-100"
        }`}
        id="tp-points-pill"
      >
        {(points ?? displayedPoints).toLocaleString()} PTS
      </div>
      {pointsGain ? (
        <div className="rounded-full border-4 border-slate-900 bg-pink-300 px-2 py-1 text-sm font-medium text-slate-900 shadow-[3px_3px_0_#0f172a] animate-bounce">
          +{pointsGain}
        </div>
      ) : null}
      <NotificationBell />
      <Link
        href="/admin"
        className="rounded-xl border-4 border-slate-900 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-[3px_3px_0_#0f172a]"
        aria-label="Admin access"
      >
        Admin
      </Link>
    </div>
  );
}

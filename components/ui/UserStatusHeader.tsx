"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoinFXCanvas } from "@/components/ui/CoinFXCanvas";
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

function TreasureChestIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={`${className} drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]`}>
      <path d="M9 27h46l-6-13H15z" fill="#8b4513" stroke="#111827" strokeWidth="3" />
      <rect x="10" y="28" width="44" height="8" rx="3" fill="#7c3f00" stroke="#111827" strokeWidth="3" />
      <rect x="6" y="34" width="52" height="24" rx="5" fill="#a85500" stroke="#111827" strokeWidth="3" />
      <rect x="29" y="28" width="6" height="30" fill="#f4b400" stroke="#111827" strokeWidth="2" />
      <circle cx="32" cy="45" r="4.5" fill="#ffe26a" stroke="#111827" strokeWidth="2" />
      <ellipse cx="32" cy="32" rx="15" ry="3.8" fill="#2d1400" opacity="0.52" />
    </svg>
  );
}

function GoldCoinIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <circle cx="32" cy="32" r="24" fill="#f4b400" stroke="#111827" strokeWidth="4" />
      <circle cx="32" cy="32" r="16" fill="#fcd34d" stroke="#111827" strokeWidth="3" />
      <path d="M26 33h12" stroke="#111827" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M29 27h6" stroke="#111827" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M29 39h6" stroke="#111827" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

type UserStatusHeaderProps = {
  variant?: "default" | "trivia";
  showAlerts?: boolean;
};

export function UserStatusHeader({ variant = "default", showAlerts = true }: UserStatusHeaderProps) {
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

  const priorPointsRef = useRef<number | null>(null);
  const displayedPointsRef = useRef(0);
  const pointsTickerRef = useRef<number | null>(null);
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
        const next = (points ?? 0) + delta;
        setPointsAndAnimate(next);
        animateGain(delta);
        if (
          custom.detail?.source !== "trivia" &&
          custom.detail?.source !== "notifications" &&
          custom.detail?.source !== "bingo-claim"
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
  }, [animateGain, isJoinRoute, loadSummary, points, setPointsAndAnimate]);

  if (isJoinRoute) {
    return null;
  }

  const compact = variant === "trivia";

  return (
    <div
      className={`relative flex w-full gap-2 flex-col sm:flex-row sm:items-center ${
        compact ? "justify-center" : "justify-between"
      }`}
    >
      <CoinFXCanvas />
  <div className={`flex min-w-0 items-center ${compact ? "w-full justify-between gap-1.5" : "w-full gap-2 sm:w-auto sm:justify-center sm:pr-2"}`}>
        <div
          className={`flex items-center rounded-2xl border-slate-900 bg-[#f7d7b0] font-medium text-slate-900 ${
            compact
              ? "h-10 min-w-0 flex-1 gap-1 rounded-xl border-2 px-2 py-1 text-[13px] shadow-[2px_2px_0_#0f172a]"
              : "tp-bounce-hover h-[3.5rem] min-w-0 flex-1 justify-center gap-2 border-4 px-2.5 py-1.5 text-base shadow-[4px_4px_0_#0f172a] sm:min-w-[11.25rem] sm:flex-none"
            }`}
        >
          <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full border-slate-900 bg-white ${
              compact ? "h-7 w-7 border-2 text-sm" : "h-8 w-8 border-2 text-sm sm:h-9 sm:w-9 sm:border-3"
            }`}
            style={{ flexShrink: 0 }}
          >
            {((username || "G").trim()[0] ?? "G").toUpperCase()}
          </span>
          <span className="truncate max-w-[6.5rem] sm:max-w-[12rem]">{username || "Guest"}</span>
        </div>
        <div
          className={`relative flex items-center border-slate-900 font-medium text-slate-900 transition-all duration-300 ${
            compact
              ? `h-10 min-w-0 flex-1 gap-1 rounded-xl border-2 px-2 py-1 text-[13px] shadow-[2px_2px_0_#0f172a] ${
                  pointsFlash ? "bg-[#f5cf88]" : "bg-[#f2bb66]"
                }`
              : `tp-bounce-hover h-[3.5rem] min-w-0 flex-1 justify-center gap-2 rounded-2xl border-4 px-2.5 py-1.5 text-base shadow-[4px_4px_0_#0f172a] sm:min-w-[11.25rem] sm:flex-none ${
                  pointsFlash ? "bg-[#f5cf88] ring-2 ring-[#d89a4f]/60" : "bg-[#f2bb66]"
                } ${
                  pointsPop ? "scale-110" : "scale-100"
                }`
            }`}
          id="tp-points-pill"
        >
          {pointsBurstVisible && pointsBurstAmount ? (
            <div className="pointer-events-none absolute left-1/2 top-1 z-40 -translate-x-1/2">
              <span
                key={`points-burst-${pointsBurstToken}`}
                className="inline-flex animate-tp-points-burst rounded-full border-2 border-emerald-800 bg-emerald-300/95 px-2 py-0.5 text-sm font-black text-emerald-900 shadow-[2px_2px_0_#065f46] sm:text-base"
              >
                +{pointsBurstAmount}
              </span>
            </div>
          ) : null}
          <span id="tp-treasure-chest" className="relative inline-flex shrink-0 items-center justify-center">
            <TreasureChestIcon className={compact ? "h-6 w-6" : "h-12 w-12"} />
            <span
              id="tp-treasure-chest-target"
              aria-hidden="true"
              className="absolute left-1/2 top-[44%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
            />
          </span>
          <span className={`inline-flex items-center gap-1 font-black ${compact ? "text-sm" : ""}`}>
            <GoldCoinIcon className={compact ? "h-5 w-5" : "h-7 w-7 sm:h-10 sm:w-10"} />
            <span className="truncate max-w-[4.5rem] sm:max-w-[6rem] text-right">{(points ?? displayedPoints).toLocaleString()}</span>
          </span>
        </div>
      </div>
      {variant !== "trivia" && pointsGain ? (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full border-4 border-slate-900 bg-[#e9784e] px-2 py-1 text-sm font-medium text-[#fff7ea] shadow-[3px_3px_0_#0f172a] animate-bounce">
          +{pointsGain} coins
        </div>
      ) : null}
      {variant !== "trivia" && showAlerts ? (
        <div className="shrink-0">
          <NotificationBell />
        </div>
      ) : null}
    </div>
  );
}

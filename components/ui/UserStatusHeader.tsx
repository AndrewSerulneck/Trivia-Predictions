"use client";

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

type CoinFlightToken = {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delayMs: number;
  durationMs: number;
  rotateDeg: number;
};

type CoinFlightDetail = {
  sourceElementId?: string;
  sourceRect?: { left: number; top: number; width: number; height: number };
  sourceX?: number;
  sourceY?: number;
  delta?: number;
  coins?: number;
};

function TreasureChestIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="h-8 w-8 drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">
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
};

export function UserStatusHeader({ variant = "default" }: UserStatusHeaderProps) {
  const pathname = usePathname();
  const isJoinRoute = pathname === "/" || pathname === "/join";
  const [username, setUsername] = useState("");
  const [points, setPoints] = useState<number | null>(null);
  const [displayedPoints, setDisplayedPoints] = useState(0);
  const [pointsPop, setPointsPop] = useState(false);
  const [pointsGain, setPointsGain] = useState<number | null>(null);
  const [coinFlights, setCoinFlights] = useState<CoinFlightToken[]>([]);

  const priorPointsRef = useRef<number | null>(null);
  const displayedPointsRef = useRef(0);
  const pointsTickerRef = useRef<number | null>(null);
  const gainHideTimerRef = useRef<number | null>(null);
  const popHideTimerRef = useRef<number | null>(null);
  const flightCleanupTimersRef = useRef<number[]>([]);

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

  const launchCoinFlight = useCallback((detail?: CoinFlightDetail) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const chest = document.getElementById("tp-treasure-chest-target") ?? document.getElementById("tp-treasure-chest");
    if (!chest) {
      return;
    }

    const chestRect = chest.getBoundingClientRect();
    const toX = chestRect.left + chestRect.width / 2;
    const toY = chestRect.top + chestRect.height / 2;

    let fromX = window.innerWidth / 2;
    let fromY = Math.max(96, window.innerHeight * 0.72);

    if (detail?.sourceRect) {
      fromX = detail.sourceRect.left + detail.sourceRect.width / 2;
      fromY = detail.sourceRect.top + detail.sourceRect.height / 2;
    } else if (detail?.sourceElementId) {
      const source = document.getElementById(detail.sourceElementId);
      if (source) {
        const rect = source.getBoundingClientRect();
        fromX = rect.left + rect.width / 2;
        fromY = rect.top + rect.height / 2;
      }
    } else if (typeof detail?.sourceX === "number" && typeof detail?.sourceY === "number") {
      fromX = detail.sourceX;
      fromY = detail.sourceY;
    }

    const requestedCoins = Math.max(4, Math.min(18, detail?.coins ?? Math.round((detail?.delta ?? 10) / 2) + 4));
    const createdAt = Date.now();
    const burst: CoinFlightToken[] = Array.from({ length: requestedCoins }, (_, index) => {
      return {
        id: `${createdAt}-${index}-${Math.random().toString(16).slice(2)}`,
        fromX: fromX + Math.round((Math.random() - 0.5) * 28),
        fromY: fromY + Math.round((Math.random() - 0.5) * 18),
        toX: toX + Math.round((Math.random() - 0.5) * 20),
        toY: toY + Math.round((Math.random() - 0.5) * 14),
        delayMs: Math.round(Math.random() * 170),
        durationMs: 860 + Math.round(Math.random() * 260),
        rotateDeg: Math.round(Math.random() * 360),
      };
    });

    setCoinFlights((current) => [...current, ...burst]);

    for (const item of burst) {
      const timer = window.setTimeout(() => {
        setCoinFlights((current) => current.filter((token) => token.id !== item.id));
      }, item.delayMs + item.durationMs + 120);
      flightCleanupTimersRef.current.push(timer);
    }
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
        if (custom.detail?.source !== "trivia" && custom.detail?.source !== "notifications") {
          launchCoinFlight({ delta });
        }
      }
      void loadSummary();
    };

    const onCoinFlight = (event: Event) => {
      const custom = event as CustomEvent<CoinFlightDetail>;
      launchCoinFlight(custom.detail);
    };

    window.addEventListener("tp:points-updated", onPointsUpdated);
    window.addEventListener("tp:coin-flight", onCoinFlight as EventListener);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener("tp:points-updated", onPointsUpdated);
      window.removeEventListener("tp:coin-flight", onCoinFlight as EventListener);
      if (pointsTickerRef.current) {
        window.clearInterval(pointsTickerRef.current);
      }
      if (gainHideTimerRef.current) {
        window.clearTimeout(gainHideTimerRef.current);
      }
      if (popHideTimerRef.current) {
        window.clearTimeout(popHideTimerRef.current);
      }
      for (const timer of flightCleanupTimersRef.current) {
        window.clearTimeout(timer);
      }
      flightCleanupTimersRef.current = [];
    };
  }, [animateGain, isJoinRoute, launchCoinFlight, loadSummary, points, setPointsAndAnimate]);

  if (isJoinRoute) {
    return null;
  }

  return (
    <div className="relative flex flex-wrap items-center justify-between gap-2">
      {coinFlights.length > 0 ? (
        <div className="pointer-events-none fixed inset-0 z-[120]">
          {coinFlights.map((item) => (
            <span
              key={item.id}
              className="absolute animate-tp-points-flow text-yellow-500 drop-shadow-[0_2px_0_rgba(15,23,42,0.28)]"
              style={{
                left: `${item.fromX}px`,
                top: `${item.fromY}px`,
                animationDelay: `${item.delayMs}ms`,
                animationDuration: `${item.durationMs}ms`,
                ["--flow-x" as string]: `${item.toX - item.fromX}px`,
                ["--flow-y" as string]: `${item.toY - item.fromY}px`,
                ["--coin-rotate" as string]: `${item.rotateDeg}deg`,
              }}
            >
              <GoldCoinIcon className="h-16 w-16" />
            </span>
          ))}
        </div>
      ) : null}
      <div className="tp-bounce-hover flex items-center gap-2 rounded-2xl border-4 border-slate-900 bg-cyan-300 px-3 py-2 text-sm font-medium text-slate-900 shadow-[4px_4px_0_#0f172a]">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-4 border-slate-900 bg-white text-[11px]">
          {((username || "G").trim()[0] ?? "G").toUpperCase()}
        </span>
        <span>{username || "Guest"}</span>
      </div>
      <div
        className={`tp-bounce-hover flex items-center gap-2 rounded-2xl border-4 border-slate-900 bg-yellow-200 px-3 py-2 text-sm font-medium text-slate-900 shadow-[4px_4px_0_#0f172a] transition-transform duration-200 ${
          pointsPop ? "scale-110" : "scale-100"
        }`}
        id="tp-points-pill"
      >
        <span id="tp-treasure-chest" className="relative inline-flex items-center justify-center">
          <TreasureChestIcon />
          <span
            id="tp-treasure-chest-target"
            aria-hidden="true"
            className="absolute left-1/2 top-[40%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
          />
        </span>
        <span className="inline-flex items-center gap-1 font-black">
          <GoldCoinIcon className="h-6 w-6" />
          {(points ?? displayedPoints).toLocaleString()}
        </span>
      </div>
      {variant !== "trivia" && pointsGain ? (
        <div className="rounded-full border-4 border-slate-900 bg-pink-300 px-2 py-1 text-sm font-medium text-slate-900 shadow-[3px_3px_0_#0f172a] animate-bounce">
          +{pointsGain} coins
        </div>
      ) : null}
      {variant !== "trivia" ? <NotificationBell /> : null}
    </div>
  );
}

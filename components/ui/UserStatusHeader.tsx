"use client";

import { usePathname, useRouter } from "next/navigation";
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

type UserStatusHeaderProps = {
  variant?: "default" | "trivia";
  showAlerts?: boolean;
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

function isActiveMenuPath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === href;
  }
  if (href.startsWith("/venue/")) {
    return pathname.startsWith("/venue/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function UserStatusHeader({ variant = "default", showAlerts = true }: UserStatusHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isJoinRoute = pathname === "/" || pathname === "/join";
  const compact = variant === "trivia";

  const [username, setUsername] = useState("");
  const [points, setPoints] = useState<number | null>(null);
  const [displayedPoints, setDisplayedPoints] = useState(0);
  const [pointsPop, setPointsPop] = useState(false);
  const [pointsFlash, setPointsFlash] = useState(false);
  const [pointsGain, setPointsGain] = useState<number | null>(null);
  const [pointsBurstAmount, setPointsBurstAmount] = useState<number | null>(null);
  const [pointsBurstVisible, setPointsBurstVisible] = useState(false);
  const [pointsBurstToken, setPointsBurstToken] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const priorPointsRef = useRef<number | null>(null);
  const displayedPointsRef = useRef(0);
  const pointsTickerRef = useRef<number | null>(null);
  const gainHideTimerRef = useRef<number | null>(null);
  const popHideTimerRef = useRef<number | null>(null);
  const flashHideTimerRef = useRef<number | null>(null);
  const burstHideTimerRef = useRef<number | null>(null);

  const joinedVenueId = getVenueId()?.trim() ?? "";
  const venueHomeHref = joinedVenueId ? `/venue/${encodeURIComponent(joinedVenueId)}` : "/";

  const menuItems = [
    {
      label: "Active and Completed Games",
      description: "Track active games and this week's completed results.",
      href: "/active-games",
    },
    {
      label: "Leaderboard",
      description: "See where you rank and how many points you need to win!",
      href: venueHomeHref,
    },
    {
      label: "Pending Challenges",
      description: "Review and respond to head-to-head invites.",
      href: "/pending-challenges",
    },
    {
      label: "Redeem Prizes",
      description: "See earned rewards and prize redemptions.",
      href: "/redeem-prizes",
    },
  ];

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

  useEffect(() => {
    if (compact || isJoinRoute) {
      return;
    }

    document.body.classList.toggle("tp-modal-open", isMenuOpen);
    document.documentElement.classList.toggle("tp-modal-open", isMenuOpen);
    return () => {
      document.body.classList.remove("tp-modal-open");
      document.documentElement.classList.remove("tp-modal-open");
    };
  }, [compact, isJoinRoute, isMenuOpen]);

  if (isJoinRoute) {
    return null;
  }

  if (compact) {
    return (
      <div className="relative flex w-full items-center justify-between gap-1.5">
        <CoinFXCanvas />
        <div className="flex h-10 min-w-0 flex-1 items-center gap-1 rounded-xl border-2 border-slate-900 bg-[#f7d7b0] px-2 py-1 text-[13px] font-medium text-slate-900 shadow-[2px_2px_0_#0f172a]">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-slate-900 bg-white text-sm">
            {((username || "G").trim()[0] ?? "G").toUpperCase()}
          </span>
          <span className="truncate">{username || "Guest"}</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => router.push(venueHomeHref)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              router.push(venueHomeHref);
            }
          }}
          id="tp-points-pill"
          className={`relative flex h-10 min-w-0 flex-1 items-center gap-1 rounded-xl border-2 border-slate-900 px-2 py-1 text-[13px] font-medium text-slate-900 shadow-[2px_2px_0_#0f172a] transition-all duration-300 ${
            pointsFlash ? "bg-[#f5cf88]" : "bg-[#f2bb66]"
          } ${pointsPop ? "scale-105" : "scale-100"} cursor-pointer`}
          aria-label="Open venue leaderboard"
        >
          {pointsBurstVisible && pointsBurstAmount ? (
            <div className="pointer-events-none absolute left-1/2 top-1 z-[1400] -translate-x-1/2">
              <span
                key={`points-burst-${pointsBurstToken}`}
                className="inline-flex animate-tp-points-burst rounded-full border-2 border-emerald-800 bg-emerald-300/95 px-2 py-0.5 text-sm font-black text-emerald-900 shadow-[2px_2px_0_#065f46]"
              >
                +{pointsBurstAmount}
              </span>
            </div>
          ) : null}
          <span id="tp-treasure-chest" className="relative inline-flex shrink-0 items-center justify-center">
            <TreasureChestIcon className="h-6 w-6" />
            <span
              id="tp-treasure-chest-target"
              aria-hidden="true"
              className="absolute left-1/2 top-[44%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
            />
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-black">
            <span id="tp-coin-icon-target" className="inline-flex items-center justify-center">
              <GoldCoinIcon className="h-5 w-5" />
            </span>
            <span className="truncate text-right">{(points ?? displayedPoints).toLocaleString()}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <CoinFXCanvas />

      <div className="relative z-[220]">
        <div className="relative flex w-full items-center gap-2 rounded-none border-2 border-x-0 border-t-0 border-slate-900 bg-[#f7d7b0] px-2 py-1.5 text-slate-900 shadow-[0_3px_0_#0f172a]">
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 bg-white text-lg font-bold text-slate-900 shadow-[2px_2px_0_#0f172a]"
            aria-label="Open navigation menu"
            aria-expanded={isMenuOpen}
          >
            ☰
          </button>

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            <div
              role="button"
              tabIndex={0}
              onClick={() => router.push(venueHomeHref)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(venueHomeHref);
                }
              }}
              className="inline-flex min-h-9 min-w-0 max-w-[13.5rem] cursor-pointer items-center gap-1.5 rounded-lg border-2 border-slate-900 bg-white px-2 py-1 text-sm font-semibold shadow-[2px_2px_0_#0f172a] sm:max-w-[16rem]"
              aria-label="Open venue home"
            >
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-900 bg-[#f7d7b0] text-[11px] font-black">
                {((username || "G").trim()[0] ?? "G").toUpperCase()}
              </span>
              <span className="break-all text-[13px] leading-tight">{username || "Guest"}</span>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => router.push(venueHomeHref)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(venueHomeHref);
                }
              }}
              id="tp-points-pill"
              className={`relative inline-flex h-9 min-w-[6.25rem] items-center justify-center gap-1.5 rounded-lg border-2 border-slate-900 px-2 text-sm font-black shadow-[2px_2px_0_#0f172a] transition-all duration-300 ${
                pointsFlash ? "bg-[#f5cf88]" : "bg-[#f2bb66]"
              } ${pointsPop ? "scale-105" : "scale-100"} cursor-pointer`}
              aria-label="Open venue leaderboard"
            >
              {pointsBurstVisible && pointsBurstAmount ? (
                <div className="pointer-events-none absolute left-1/2 top-1 z-[1400] -translate-x-1/2">
                  <span
                    key={`points-burst-${pointsBurstToken}`}
                    className="inline-flex animate-tp-points-burst rounded-full border-2 border-emerald-800 bg-emerald-300/95 px-2 py-0.5 text-xs font-black text-emerald-900 shadow-[2px_2px_0_#065f46]"
                  >
                    +{pointsBurstAmount}
                  </span>
                </div>
              ) : null}
              <span id="tp-treasure-chest" className="relative inline-flex shrink-0 items-center justify-center">
                <TreasureChestIcon className="h-5 w-5" />
                <span
                  id="tp-treasure-chest-target"
                  aria-hidden="true"
                  className="absolute left-1/2 top-[44%] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
                />
              </span>
              <span id="tp-coin-icon-target" className="inline-flex items-center justify-center">
                <GoldCoinIcon className="h-4 w-4" />
              </span>
              <span>{(points ?? displayedPoints).toLocaleString()}</span>
            </div>

            {showAlerts ? <NotificationBell /> : null}
          </div>
        </div>
      </div>

      {pointsGain ? (
        <div className="pointer-events-none absolute right-2 top-[3.15rem] z-[1400] rounded-full border-2 border-emerald-900 bg-emerald-300/95 px-2 py-0.5 text-xs font-black text-emerald-900 shadow-[2px_2px_0_#065f46] animate-tp-points-fall">
          +{pointsGain}
        </div>
      ) : null}

      <div
        className={`fixed inset-0 z-[1200] ${isMenuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!isMenuOpen}
      >
        <button
          type="button"
          onClick={() => setIsMenuOpen(false)}
          className={`absolute inset-0 h-full w-full bg-black/40 transition-opacity duration-200 ${
            isMenuOpen ? "opacity-100" : "opacity-0"
          }`}
          aria-label="Close navigation menu"
        />

        <aside
          className={`absolute inset-y-0 left-0 w-72 max-w-[86vw] border-r-2 border-slate-900 bg-[#fff7ea] px-4 py-4 shadow-xl transition-transform duration-200 ${
            isMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-black tracking-wide text-slate-900">Menu</h3>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="rounded-md border-2 border-slate-900 bg-white px-2 py-1 text-sm font-semibold text-slate-900 shadow-[2px_2px_0_#0f172a]"
            >
              Close
            </button>
          </div>

          <nav aria-label="Primary navigation">
            <ul className="space-y-2">
              {menuItems.map((item) => {
                const active = isActiveMenuPath(pathname, item.href);
                return (
                  <li key={`${item.label}:${item.href}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        router.push(item.href);
                      }}
                      className={`w-full rounded-lg border-2 px-3 py-2.5 text-left shadow-[2px_2px_0_#0f172a] ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-900 bg-white text-slate-900"
                      }`}
                    >
                      <div className="text-sm font-black">{item.label}</div>
                      <div className={`mt-0.5 text-xs ${active ? "text-slate-200" : "text-slate-600"}`}>
                        {item.description}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}

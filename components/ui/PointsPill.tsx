"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { CoinFXCanvas } from "@/components/ui/CoinFXCanvas";
import { GoldCoinIcon, TreasureChestIcon } from "@/components/ui/pointsIcons";
import type { PointsSummary } from "@/components/ui/usePointsSummary";
import { getVenueId } from "@/lib/storage";

function getVenueIdFromPathname(pathname: string): string {
  const match = pathname.match(/^\/venue\/([^/?#]+)/i);
  if (!match?.[1]) {
    return "";
  }
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return String(match[1]).trim();
  }
}

// PointsPill — the glanceable venue score, doubling as the coin-flight landing
// target (#tp-coin-icon-target / #tp-treasure-chest-target). Tapping it opens the
// venue leaderboard. Presentational: the owning bar calls usePointsSummary once
// and passes the result here, so a bar can also drive the AccountMenu prize dot
// from the same instance without double-registering the points listeners.
export function PointsPill({ summary, size = "md" }: { summary: PointsSummary; size?: "sm" | "md" }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    points,
    displayedPoints,
    pointsPop,
    pointsFlash,
    pointsBurstAmount,
    pointsBurstVisible,
    pointsBurstToken,
  } = summary;

  const storedVenueId = useSyncExternalStore(
    () => () => {},
    () => (getVenueId() ?? "").trim(),
    () => ""
  );
  const joinedVenueId = getVenueIdFromPathname(pathname) || storedVenueId;
  const venueHomeHref = joinedVenueId ? `/venue/${encodeURIComponent(joinedVenueId)}` : "/";

  const goToVenue = () => router.push(venueHomeHref);

  const sizing =
    size === "sm"
      ? { wrap: "h-9 min-w-[5.75rem] px-2 text-[13px]", chest: "h-5 w-5", coin: "h-4 w-4", burst: "text-[11px]" }
      : { wrap: "h-9 min-w-[6.25rem] px-2 text-sm", chest: "h-5 w-5", coin: "h-4 w-4", burst: "text-xs" };

  return (
    <>
      <CoinFXCanvas />
      <div
        role="button"
        tabIndex={0}
        onClick={goToVenue}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            goToVenue();
          }
        }}
        id="tp-points-pill"
        className={`relative inline-flex items-center justify-center gap-1.5 rounded-lg border font-black tabular-nums transition-all duration-300 ${
          pointsFlash
            ? "bg-amber-400/25 border-amber-400/50 text-amber-200"
            : "bg-amber-500/15 border-amber-400/30 text-amber-300"
        } ${pointsPop ? "scale-105" : "scale-100"} cursor-pointer ${sizing.wrap}`}
        aria-label="Open venue leaderboard"
      >
        {pointsBurstVisible && pointsBurstAmount ? (
          <div className="pointer-events-none absolute left-1/2 top-1 z-[1400] -translate-x-1/2">
            <span
              key={`points-burst-${pointsBurstToken}`}
              className={`inline-flex animate-tp-points-burst rounded-full border-2 border-emerald-800 bg-emerald-300/95 px-2 py-0.5 font-black text-emerald-900 shadow-[2px_2px_0_#065f46] ${sizing.burst}`}
            >
              +{pointsBurstAmount}
            </span>
          </div>
        ) : null}
        <span id="tp-treasure-chest" className="relative inline-flex shrink-0 items-center justify-center">
          <TreasureChestIcon className={sizing.chest} />
          <span
            id="tp-treasure-chest-target"
            aria-hidden="true"
            className="absolute left-1/2 top-[44%] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
          />
        </span>
        <span id="tp-coin-icon-target" className="inline-flex items-center justify-center">
          <GoldCoinIcon className={sizing.coin} />
        </span>
        <span>{(points ?? displayedPoints).toLocaleString()}</span>
      </div>
    </>
  );
}

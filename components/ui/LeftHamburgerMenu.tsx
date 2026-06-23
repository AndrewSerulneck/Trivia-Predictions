"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { AccountMenu } from "@/components/ui/AccountMenu";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { PointsPill } from "@/components/ui/PointsPill";
import { usePointsSummary } from "@/components/ui/usePointsSummary";
import { getVenueId } from "@/lib/storage";

type LeftHamburgerMenuProps = {
  showAlerts?: boolean;
};

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

// Home / standard-page top bar. Composes the shared AppBar primitives
// (AccountMenu drawer + PointsPill score + alerts) so the menu, score, and
// coin-flight target stay identical to the in-game AppBar. A single
// usePointsSummary instance drives both the pill and the menu's prize dot.
export function LeftHamburgerMenu({ showAlerts = true }: LeftHamburgerMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isJoinRoute = pathname === "/" || pathname === "/join";
  const isVenueRoute = pathname.startsWith("/venue/");

  const summary = usePointsSummary();

  const storedVenueId = useSyncExternalStore(
    () => () => {},
    () => (getVenueId() ?? "").trim(),
    () => ""
  );
  const joinedVenueId = getVenueIdFromPathname(pathname) || storedVenueId;
  const venueHomeHref = joinedVenueId ? `/venue/${encodeURIComponent(joinedVenueId)}` : "/";

  if (isJoinRoute || isVenueRoute) {
    return null;
  }

  const username = summary.username || "Guest";
  const goToVenue = () => router.push(venueHomeHref);

  return (
    <div className="relative z-[220] w-full">
      <div className="relative flex w-full items-center gap-2 rounded-none border-b border-ht-border-hairline bg-ht-surface px-2 py-1.5 shadow-[0_1px_0_rgba(255,255,255,0.04)]">
        <AccountMenu hasUnclaimedPrize={summary.hasUnclaimedPrize} />

        <div className="ml-auto flex min-w-0 items-center gap-1.5">
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
            className="inline-flex min-h-9 min-w-0 max-w-[13.5rem] cursor-pointer items-center gap-1.5 rounded-lg border border-ht-border-soft bg-ht-elevated px-2 py-1 text-sm font-semibold text-ht-fg-primary sm:max-w-[16rem]"
            aria-label="Open venue home"
          >
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ht-border-strong bg-ht-elevated-2 text-[11px] font-black text-ht-fg-primary">
              {(username.trim()[0] ?? "G").toUpperCase()}
            </span>
            <span className="break-all text-[13px] leading-tight">{username}</span>
          </div>

          <PointsPill summary={summary} size="md" />

          {showAlerts ? <NotificationBell /> : null}
        </div>
      </div>

      {summary.pointsGain ? (
        <div className="pointer-events-none absolute right-2 top-[3.15rem] z-[1400] rounded-full border-2 border-emerald-900 bg-emerald-300/95 px-2 py-0.5 text-xs font-black text-emerald-900 shadow-[2px_2px_0_#065f46] animate-tp-points-fall">
          +{summary.pointsGain}
        </div>
      ) : null}
    </div>
  );
}

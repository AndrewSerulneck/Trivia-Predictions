"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { PointsPill } from "@/components/ui/PointsPill";
import { usePointsSummary } from "@/components/ui/usePointsSummary";
import { GameMark, type GameChromeKey } from "@/components/venue/GameChrome";
import { getVenueId } from "@/lib/storage";

// ─────────────────────────────────────────────────────────────────────────────
// AppBar — the single, always-visible top navigation surface shared across the
// app. Three fixed zones (leading / center / trailing) keep the structure
// constant while the content adapts to context:
//
//   leading   navigation control   (hamburger on home; Venue back inside a game)
//   center    context identity     (venue name on home; game identity in a game)
//   trailing  alerts + score        (bell everywhere; points pill during play)
//
// The in-game preset (GameAppBar) intentionally drops the hamburger: gameplay
// is a focused context whose only nav affordance is the back-to-venue arrow.
// The home/standard bar (LeftHamburgerMenu) keeps the hamburger for menu access.
// ─────────────────────────────────────────────────────────────────────────────

const GAME_LABEL: Record<GameChromeKey, string> = {
  bingo: "Bingo",
  fantasy: "Fantasy",
  pickem: "Pick 'Em",
};

export function AppBar({
  leading,
  center,
  trailing,
}: {
  leading?: ReactNode;
  center?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-2.5 border-b border-white/[0.08] bg-slate-950/[0.86] px-[13px] pb-2 pt-[max(env(safe-area-inset-top),8px)] backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-1.5">{leading}</div>
      <div className="flex min-w-0 items-center gap-2">{center}</div>
      <div className="flex shrink-0 items-center gap-1.5">{trailing}</div>
    </div>
  );
}

export function GameAppBar({
  game,
  onExit,
  exitLabel = "Back to venue",
}: {
  game: GameChromeKey;
  onExit?: () => void;
  exitLabel?: string;
}) {
  const summary = usePointsSummary();
  const router = useRouter();
  const accentText = game === "bingo" ? "text-sky-300" : "text-amber-200";

  // Prefer the parent-injected exit (which runs the venue return animation),
  // but always guarantee a working back action even if that wiring is absent.
  const handleExit = () => {
    if (onExit) {
      onExit();
      return;
    }
    const venueId = (getVenueId() ?? "").trim();
    router.push(venueId ? `/venue/${encodeURIComponent(venueId)}` : "/");
  };

  return (
    <AppBar
      leading={
        <>
          <button
            type="button"
            onClick={handleExit}
            aria-label={exitLabel}
            className="tp-clean-button inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-slate-300 transition-colors hover:text-white"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>
        </>
      }
      center={
        <>
          <GameMark game={game} />
          <span className={`truncate text-[14px] font-black uppercase tracking-[0.11em] ${accentText}`}>
            {GAME_LABEL[game]}
          </span>
        </>
      }
      trailing={
        <>
          <PointsPill summary={summary} size="sm" />
          <NotificationBell />
        </>
      }
    />
  );
}

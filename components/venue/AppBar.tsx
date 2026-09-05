"use client";

import type { ReactNode } from "react";
import { ExitBackButton } from "@/components/navigation/ExitBackButton";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { PointsPill } from "@/components/ui/PointsPill";
import { usePointsSummary } from "@/components/ui/usePointsSummary";
import { GameMark, type GameChromeKey } from "@/components/venue/GameChrome";

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
  "nfl-pickem": "NFL Pick 'Em",
};

// `leading` defaults to the canonical ExitBackButton so any bar that doesn't
// say otherwise gets the one correct Back for free. Pass `leading={null}` to
// opt out explicitly (a root screen with nothing to go back to); a default
// parameter only fills in for `undefined`, so `null` is a real opt-out.
export function AppBar({
  leading = <ExitBackButton venueHomeFallback />,
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
  const accentText =
    game === "bingo" ? "text-sky-300" :
    game === "nfl-pickem" ? "text-amber-200" :
    "text-amber-200";

  // The exit itself lives in ExitBackButton: `onExit` (the parent-injected exit
  // that runs the venue return animation) still wins, and when it's absent
  // `venueHomeFallback` resolves the stored venue home AND plays the same return
  // transition — strictly better than the bare router.push this used to do.
  return (
    <AppBar
      leading={<ExitBackButton onExit={onExit} venueHomeFallback label={exitLabel} />}
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

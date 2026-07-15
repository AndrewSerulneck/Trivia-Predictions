"use client";

import { ChevronDown } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// GameChrome — shared redesign primitives for the Bingo & Fantasy landing pages.
//
// Replaces the oversized 44px title blocks and the cramped, competing control
// rows with a slim identity bar + explicit segmented tabs. Built to the
// dark-broadcast system; accent colors map to Tailwind defaults:
//   bingo   → sky-300   (#7dd3fc)
//   fantasy → amber-200 (#fde68a)
// ─────────────────────────────────────────────────────────────────────────────

export type GameChromeKey = "bingo" | "fantasy" | "pickem" | "nfl-pickem";

// Small animated "live" dot — mirrors the design's pulsing status indicator.
export const LiveDot = ({ className = "bg-emerald-400" }: { className?: string }) => (
  <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full ${className}`} />
);

// GameMark — the compact game-identity tile that stands in for the dead 44px title.
export const GameMark = ({ game }: { game: GameChromeKey }) => {
  if (game === "nfl-pickem") {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px] border border-emerald-400 bg-emerald-600 text-[14px] font-black leading-none text-white"
      >
        🏈
      </span>
    );
  }
  if (game === "pickem") {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-[26px] w-[26px] shrink-0 -rotate-[7deg] items-center justify-center rounded-[6px] border border-[#fde68a] bg-[#fde68a] text-[14px] font-black leading-none text-[#1a2f72]"
      >
        ✓
      </span>
    );
  }
  if (game === "bingo") {
    return (
      <span
        aria-hidden="true"
        className="relative grid h-[26px] w-[26px] shrink-0 grid-cols-3 gap-[1.5px] rounded-[7px] border-[1.5px] border-sky-300 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(255,215,128,0.18),transparent_60%),#0c3a2e] p-1 shadow-[0_0_0_1px_rgba(125,211,252,0.35),inset_0_0_0_1px_rgba(200,155,58,0.5)]"
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <span
            key={i}
            className={`rounded-[1px] ${
              i === 4
                ? "bg-[#c89b3a]"
                : i === 0 || i === 5 || i === 7
                ? "bg-amber-500"
                : "bg-[#fff7ea]/85"
            }`}
          />
        ))}
      </span>
    );
  }
  // fantasy chalkboard
  return (
    <span
      aria-hidden="true"
      className="relative h-[26px] w-[26px] shrink-0 overflow-hidden rounded-[7px] border-[1.5px] border-amber-200/70 bg-[#0a3128] shadow-[0_0_0_1px_rgba(254,243,199,0.18)]"
    >
      <span className="absolute inset-0 bg-[linear-gradient(rgba(254,243,199,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(254,243,199,0.16)_1px,transparent_1px)] bg-[length:6px_6px]" />
      <span className="absolute left-[3px] top-px -rotate-[10deg] text-[13px] font-black leading-none text-amber-200 [font-family:'Bree_Serif','Nunito',serif]">
        X
      </span>
      <span className="absolute bottom-0 right-[3px] rotate-[8deg] text-[13px] font-black leading-none text-cyan-300 [font-family:'Bree_Serif','Nunito',serif]">
        O
      </span>
    </span>
  );
};

export type ViewTab = {
  id: string;
  label: string;
  count?: number;
  live?: boolean;
};

// ViewTabs — explicit, labeled segmented tab bar (replaces swipe discovery).
export const ViewTabs = ({
  game,
  tabs,
  active,
  onPick,
}: {
  game: GameChromeKey;
  tabs: ViewTab[];
  active: string;
  onPick: (id: string) => void;
}) => {
  const containerClass =
    game === "bingo"
      ? "border-sky-300/[0.18] bg-sky-300/[0.05]"
      : "border-amber-200/[0.18] bg-amber-200/[0.05]";
  return (
    <div className={`flex gap-0.5 rounded-full border p-1 ${containerClass}`}>
      {tabs.map((tab) => {
        const on = active === tab.id;
        const live = Boolean(tab.live) && on;
        let buttonTone = "text-slate-400";
        if (on) {
          if (live) {
            buttonTone = "bg-emerald-500/[0.16] text-emerald-300 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.5)]";
          } else if (game === "bingo") {
            buttonTone = "bg-sky-300/[0.14] text-sky-300 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.42)]";
          } else {
            buttonTone = "bg-amber-200/[0.14] text-amber-200 shadow-[inset_0_0_0_1px_rgba(254,243,199,0.42)]";
          }
        }
        let badgeTone = "bg-white/[0.08] text-slate-500";
        if (on) {
          if (live) {
            badgeTone = "bg-emerald-500/30 text-emerald-300";
          } else if (game === "bingo") {
            badgeTone = "bg-sky-300/25 text-sky-300";
          } else {
            badgeTone = "bg-amber-200/25 text-amber-200";
          }
        }
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onPick(tab.id)}
            className={`tp-clean-button inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-1 py-2 text-[11.5px] font-black uppercase tracking-[0.09em] transition-colors ${buttonTone}`}
          >
            {live ? <LiveDot /> : null}
            {tab.label}
            {tab.count != null ? (
              <span
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black tabular-nums ${badgeTone}`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

// FoldLine — communicates "the ad lives just below, reachable on a slight scroll".
export const FoldLine = () => (
  <div className="flex items-center gap-2 px-0.5">
    <span className="h-px flex-1 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.18)_0_6px,transparent_6px_12px)]" />
    <span className="inline-flex items-center gap-1 text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-600">
      Scroll
      <ChevronDown aria-hidden="true" className="h-2.5 w-2.5" />
    </span>
    <span className="h-px flex-1 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.18)_0_6px,transparent_6px_12px)]" />
  </div>
);

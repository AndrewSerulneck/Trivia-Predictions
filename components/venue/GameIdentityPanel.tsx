"use client";

import { useEffect, useState } from "react";
import { VENUE_GAME_CARD_BY_KEY, type VenueGameKey, type GameOnboardingStep } from "@/lib/venueGameCards";

export const GAME_CARD_BG_BY_KEY: Record<VenueGameKey, string> = {
  "speed-trivia":
    "bg-[linear-gradient(132deg,#0ea5e9_0%,#2563eb_42%,#7c3aed_100%)]",
  live_trivia:
    "bg-[linear-gradient(132deg,#0ea5e9_0%,#2563eb_42%,#7c3aed_100%)]",
  bingo:
    "[background:linear-gradient(135deg,#1e293b_0%,#0f172a_55%,#020617_100%)]",
  pickem:
    "bg-[linear-gradient(134deg,#2563eb_0%,#7c3aed_56%,#ec4899_100%)]",
  fantasy:
    "bg-[#020617]",
};

export const GAME_PAGE_THEME_BY_KEY: Record<VenueGameKey, string> = {
  "speed-trivia":
    "bg-[linear-gradient(132deg,rgba(14,165,233,0.2)_0%,rgba(37,99,235,0.24)_42%,rgba(124,58,237,0.26)_100%)] border-cyan-200/60",
  live_trivia:
    "bg-[linear-gradient(132deg,rgba(14,165,233,0.2)_0%,rgba(37,99,235,0.24)_42%,rgba(124,58,237,0.26)_100%)] border-cyan-200/60",
  bingo:
    "bg-[linear-gradient(128deg,rgba(30,41,59,0.8)_0%,rgba(15,23,42,0.7)_48%,rgba(2,6,23,0.9)_100%)] border-cyan-400/30",
  pickem:
    "bg-[linear-gradient(134deg,rgba(37,99,235,0.22)_0%,rgba(124,58,237,0.22)_56%,rgba(236,72,153,0.2)_100%)] border-indigo-200/65",
  fantasy:
    "bg-[#020617] border-[#fef3c7]/20",
};

export const GAME_IDENTITY_SUBTITLE: Record<VenueGameKey, string> = {
  "speed-trivia": "15-second questions in timed rounds.",
  live_trivia: "Synchronized live venue play.",
  bingo: "Track player-stat squares in real time.",
  pickem: "Pick winners and climb your venue league.",
  fantasy: "Build and challenge lineups head to head.",
};

function normalizeRule(rule: string): string {
  return String(rule).replace(/^\s*-\s*/, "").trim();
}

export function GameRuleCardPanel({
  gameKey,
  layout = "hub",
  className = "",
}: {
  gameKey: VenueGameKey;
  layout?: "hub" | "landing";
  className?: string;
}) {
  const card = VENUE_GAME_CARD_BY_KEY[gameKey];
  const rules = card.rules.map(normalizeRule).filter(Boolean);
  const isLandingLayout = layout === "landing";
  const questionMarkCount = isLandingLayout ? 12 : 18;
  const denseRules = rules.length >= 5;

  return (
    <div
      className={`relative flex min-h-0 overflow-hidden rounded-[2rem] border-[3px] border-white/60 text-white shadow-[0_12px_26px_rgba(15,23,42,0.5)] ${
        isLandingLayout ? "p-5 sm:p-6" : "p-4"
      } ${GAME_CARD_BG_BY_KEY[gameKey]} ${className}`}
    >
      <div className={`pointer-events-none absolute inset-0 ${isLandingLayout ? "opacity-45" : "opacity-60"}`}>
        {Array.from({ length: questionMarkCount }).map((_, index) => {
          const row = Math.floor(index / 7);
          const col = index % 7;
          const left = 4 + col * 13.6 + (row % 2 ? -1.8 : 1.8);
          const top = 2 + row * 19 + ((index * 7) % 10);
          return (
            <span
              key={index}
              className={`absolute select-none font-black leading-none ${
                index % 3 === 0 ? "text-cyan-100/40" : index % 3 === 1 ? "text-emerald-200/35" : "text-yellow-200/35"
              }`}
              style={{
                left: `${left}%`,
                top: `${top}%`,
                fontSize: `${0.66 + (index % 3) * 0.2}rem`,
                transform: `rotate(${(index % 2 === 0 ? 1 : -1) * (8 + (index % 5) * 4)}deg)`,
              }}
            >
              ?
            </span>
          );
        })}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col gap-4">
        <div
          className={`${
            isLandingLayout
              ? "text-[clamp(2rem,6.2vw,3.35rem)] leading-[1.02]"
              : "text-[clamp(3.1rem,10.2vw,4.7rem)] leading-[0.98]"
          } font-black uppercase tracking-[0.045em] text-white [text-shadow:0_1px_0_rgba(12,18,28,0.8),0_3px_0_rgba(12,18,28,0.58),0_0_12px_rgba(255,255,255,0.5)]`}
          style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
        >
          {card.title}
        </div>
        <div
          className={`flex min-h-0 flex-1 flex-col rounded-2xl border border-white/40 bg-black/28 ${
            isLandingLayout ? "px-4 py-4 sm:px-5 sm:py-5" : "px-3 py-3"
          }`}
        >
          <div
            className={`${
              isLandingLayout
                ? "text-[1.08rem] tracking-[0.14em]"
                : "text-[1.8rem] tracking-[0.12em]"
            } font-black uppercase text-cyan-100`}
          >
            Rules
          </div>
          <div
            className={`mt-3 min-h-0 flex-1 overflow-y-auto text-white/95 ${
              isLandingLayout
                ? denseRules
                  ? "space-y-3 text-[clamp(1.25rem,3.45vw,1.9rem)] leading-[1.24]"
                  : "space-y-4 text-[clamp(1.45rem,3.9vw,2.3rem)] leading-[1.2]"
                : denseRules
                  ? "space-y-2.5 text-[clamp(1.458rem,4.293vw,2.025rem)] leading-[1.12]"
                  : "space-y-3 text-[clamp(1.62rem,4.6575vw,2.43rem)] leading-[1.1]"
            }`}
          >
            {rules.map((rule) => (
              <p key={rule}>• {rule}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TriviaArtwork() {
  return (
    <div className="relative h-[8.6rem] w-full overflow-hidden rounded-2xl border border-cyan-100/45 bg-slate-950/35">
      {Array.from({ length: 17 }).map((_, index) => {
        const row = Math.floor(index / 6);
        const col = index % 6;
        const left = 7 + col * 15 + (row % 2 === 0 ? (index % 3) * 1.6 : -(index % 3) * 1.2);
        const top = 7 + row * 27 + ((index * 7) % 9) - (index % 2 ? 2 : 0);
        return (
          <span
            key={index}
            className={`absolute select-none font-black leading-none ${
              index % 3 === 0
                ? "text-cyan-50 [text-shadow:0_0_10px_rgba(34,211,238,0.7)]"
                : index % 3 === 1
                ? "text-emerald-200 [text-shadow:0_0_8px_rgba(16,185,129,0.65)]"
                : "text-yellow-200 [text-shadow:0_0_8px_rgba(250,204,21,0.65)]"
            }`}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              fontSize: `${0.88 + (index % 4) * 0.2}rem`,
              transform: `rotate(${(index % 2 === 0 ? 1 : -1) * (7 + (index % 5) * 4)}deg)`,
            }}
          >
            ?
          </span>
        );
      })}
    </div>
  );
}

function BingoArtwork() {
  return (
    <div className="rounded-2xl border border-amber-100/55 bg-slate-950/30 p-2">
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 25 }).map((_, index) => (
          <div
            key={index}
            className={`h-3.5 rounded-[4px] ${
              index % 6 === 0 || index % 8 === 0 ? "bg-emerald-300/85" : "bg-amber-100/85"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function PickEmArtwork() {
  return (
    <div className="h-[8.6rem] w-full rounded-2xl border border-indigo-100/55 bg-slate-950/35 p-2">
      <div className="mb-1.5 flex gap-1 overflow-hidden">
        {["NBA", "MLB", "Soccer", "NFL", "NHL"].map((sport, index) => (
          <div
            key={sport}
            className={`rounded-full border px-1.5 py-[2px] text-[0.5rem] font-semibold ${
              index === 0
                ? "border-cyan-300/70 bg-cyan-300/30 text-cyan-50"
                : "border-indigo-200/45 bg-indigo-900/35 text-indigo-100/90"
            }`}
          >
            {sport}
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-md border border-indigo-100/45 bg-indigo-900/30 px-1.5 py-1">
            <div className="h-1.5 w-14 rounded-full bg-indigo-100/65" />
            <div className="mt-1 grid grid-cols-2 gap-1">
              <div className="flex items-center gap-1 rounded border border-indigo-100/40 bg-slate-900/45 px-1 py-0.5">
                <span className="inline-flex h-2.5 w-2.5 rounded-[2px] border border-indigo-200/60" />
                <span className="h-1 w-7 rounded-full bg-indigo-100/55" />
              </div>
              <div className="flex items-center gap-1 rounded border border-indigo-100/40 bg-slate-900/45 px-1 py-0.5">
                <span
                  className={`inline-flex h-2.5 w-2.5 items-center justify-center rounded-[2px] border text-[7px] font-black ${
                    index === 0 ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-indigo-200/60 text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="h-1 w-7 rounded-full bg-indigo-100/55" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FantasyArtwork() {
  return (
    <div className="rounded-2xl border border-violet-100/60 bg-slate-950/35 p-2">
      <div className="grid grid-cols-3 gap-1.5">
        {["QB", "RB", "WR", "WR", "DEF", "FLEX"].map((slot, i) => (
          <div key={i} className="rounded-md border border-violet-200/45 bg-violet-500/25 px-1 py-1 text-center">
            <div className="text-[0.56rem] font-semibold tracking-[0.08em] text-violet-100">{slot}</div>
            <div className="mt-0.5 h-1.5 rounded-full bg-violet-100/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

function GameArtwork({ gameKey }: { gameKey: VenueGameKey }) {
  if (gameKey === "speed-trivia" || gameKey === "live_trivia") return <TriviaArtwork />;
  if (gameKey === "bingo") return <BingoArtwork />;
  if (gameKey === "pickem") return <PickEmArtwork />;
  if (gameKey === "fantasy") return <FantasyArtwork />;
  return <div className="h-[8.6rem] w-full rounded-2xl border border-slate-200/50 bg-slate-950/35" />;
}

type ScoringConfig =
  | { kind: "stat"; big: string; label: string; foot?: string }
  | { kind: "ladder"; rows: { value: string; label: string }[]; foot: string };

const GAME_SCORING: Record<VenueGameKey, ScoringConfig> = {
  "speed-trivia": { kind: "stat", big: "2", label: "points per correct answer", foot: "Up to 90 points per hour" },
  live_trivia:    { kind: "stat", big: "2", label: "points per correct answer" },
  bingo:          { kind: "stat", big: "50", label: "points per Bingo", foot: "Up to 4 boards live at once" },
  fantasy:        { kind: "stat", big: "LIVE", label: "points climb as your players score" },
  pickem: {
    kind: "ladder",
    rows: [
      { value: "10", label: "points per correct pick" },
      { value: "2×", label: "bonus at 7 correct" },
      { value: "3×", label: "bonus at a perfect 10" },
    ],
    foot: "Max 300 points",
  },
};

function GameScoringArtwork({ gameKey, accentClass }: { gameKey: VenueGameKey; accentClass: string }) {
  const scoring = GAME_SCORING[gameKey];

  if (scoring.kind === "ladder") {
    return (
      <div className="w-full space-y-2">
        {scoring.rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center gap-3 rounded-xl border border-white/25 bg-slate-950/40 px-3 py-2"
          >
            <span
              className={`min-w-[2.6rem] text-center text-[1.6rem] font-black leading-none ${accentClass}`}
              style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
            >
              {row.value}
            </span>
            <span className="text-[0.92rem] font-semibold leading-tight text-white/85">{row.label}</span>
          </div>
        ))}
        <div className="flex justify-center pt-1">
          <span className={`rounded-full border border-white/30 bg-black/30 px-3 py-1 text-[0.78rem] font-black uppercase tracking-[0.12em] ${accentClass}`}>
            {scoring.foot}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-white/25 bg-slate-950/40 px-4 py-5">
      <span
        className={`text-[clamp(3rem,13vw,4.6rem)] font-black leading-none ${accentClass} [text-shadow:0_0_18px_rgba(255,255,255,0.3)]`}
        style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
      >
        {scoring.big}
      </span>
      <span className="text-center text-[0.95rem] font-bold uppercase tracking-[0.1em] text-white/85">
        {scoring.label}
      </span>
      {scoring.foot ? (
        <span className="text-center text-[0.82rem] font-semibold text-white/60">{scoring.foot}</span>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Illustrated step mockups — simulate the actual game UI on each onboarding
 * step so players know what they are walking into. One mockup per game/step
 * for Bingo, Pick 'Em, and Fantasy.
 * ────────────────────────────────────────────────────────────────────────── */

/** A live-counting score that ticks upward to feel "live". */
function LiveTicker({
  start,
  step = 0.4,
  intervalMs = 900,
  className = "",
  suffix = "",
  decimals = 1,
}: {
  start: number;
  step?: number;
  intervalMs?: number;
  className?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [value, setValue] = useState(start);
  useEffect(() => {
    const id = setInterval(() => {
      setValue((v) => v + step * (0.6 + Math.random()));
    }, intervalMs);
    return () => clearInterval(id);
  }, [step, intervalMs]);
  return (
    <span className={className}>
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

function MockChrome({ children, label, accentClass }: { children: React.ReactNode; label: string; accentClass: string }) {
  return (
    <div className="flex w-full flex-col gap-2 rounded-2xl border border-white/25 bg-slate-950/45 p-3">
      <div className="flex items-center justify-between">
        <span className={`text-[0.62rem] font-black uppercase tracking-[0.16em] ${accentClass}`}>{label}</span>
        <span className="inline-flex items-center gap-1 text-[0.55rem] font-bold uppercase tracking-[0.12em] text-rose-300">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
          Live
        </span>
      </div>
      {children}
    </div>
  );
}

/* ── BINGO ── */

const BINGO_STAT_LABELS = [
  "3PT", "DUNK", "AST", "BLK", "STL",
  "REB", "FT", "TO", "AND1", "FB",
  "2PT", "DEF", "FREE", "OREB", "POST",
  "SWAT", "DIME", "BANK", "FADE", "RUN",
  "TIP", "BUZZ", "ALLEY", "PUTBK", "CLOSE",
];

function BingoStep1({ accentClass }: { accentClass: string }) {
  // Winning row = row index 2 (middle row). Some scattered lit squares too.
  const litScattered = new Set([1, 4, 6, 9, 13, 18, 21]);
  const winningRow = [10, 11, 12, 13, 14];
  return (
    <MockChrome label="Your Board" accentClass={accentClass}>
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 25 }).map((_, i) => {
          const isWin = winningRow.includes(i);
          const isLit = litScattered.has(i) || isWin;
          return (
            <div
              key={i}
              className={`flex aspect-square items-center justify-center rounded-[5px] text-[0.46rem] font-black uppercase leading-none ${
                isWin
                  ? "border border-orange-200 bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.85)]"
                  : isLit
                  ? "border border-orange-300/70 bg-orange-500/85 text-white"
                  : "border border-white/15 bg-slate-900/70 text-white/45"
              }`}
            >
              {BINGO_STAT_LABELS[i]}
            </div>
          );
        })}
      </div>
      <p className="text-[0.6rem] font-semibold text-white/70">Squares auto-mark as live plays happen.</p>
    </MockChrome>
  );
}

function BingoStep2({ accentClass }: { accentClass: string }) {
  const previewLit = new Set([0, 3, 7, 8, 12, 16, 19, 22]);
  return (
    <MockChrome label="Browse Boards" accentClass={accentClass}>
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            className={`h-3.5 rounded-[4px] transition-colors ${
              previewLit.has(i)
                ? "border border-orange-300/70 bg-orange-500/80"
                : "border border-white/12 bg-slate-900/70"
            }`}
          />
        ))}
      </div>
      <button
        type="button"
        className="tp-clean-button inline-flex items-center justify-center gap-1 rounded-full bg-orange-500 px-3 py-1.5 text-[0.64rem] font-black uppercase tracking-[0.08em] text-white shadow-[0_0_12px_rgba(249,115,22,0.6)]"
      >
        ↻ Generate New Board
      </button>
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: 4 }).map((_, b) => (
          <div
            key={b}
            className={`rounded-md border p-1 ${
              b === 0 ? "border-orange-300/80 bg-orange-500/15" : "border-white/15 bg-slate-900/60"
            }`}
          >
            <div className="grid grid-cols-3 gap-[2px]">
              {Array.from({ length: 9 }).map((_, c) => (
                <div
                  key={c}
                  className={`aspect-square rounded-[2px] ${
                    (b + c) % 3 === 0 ? "bg-orange-400/80" : "bg-white/15"
                  }`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[0.58rem] font-semibold text-white/70">Hold up to 4 boards at a time.</p>
    </MockChrome>
  );
}

function BingoStep3({ accentClass }: { accentClass: string }) {
  const diagonal = [0, 6, 12, 18, 24];
  return (
    <MockChrome label="Bingo!" accentClass={accentClass}>
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 25 }).map((_, i) => {
          const onLine = diagonal.includes(i);
          return (
            <div
              key={i}
              className={`flex h-7 items-center justify-center rounded-[5px] text-[0.5rem] font-black ${
                onLine
                  ? "border border-orange-200 bg-orange-500 text-white shadow-[0_0_12px_rgba(249,115,22,0.95)]"
                  : "border border-white/15 bg-slate-900/70 text-white/40"
              }`}
            >
              {onLine ? "★" : ""}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="tp-clean-button flex items-center justify-between rounded-full bg-orange-500 px-3 py-2 text-white shadow-[0_0_14px_rgba(249,115,22,0.7)]"
      >
        <span className="text-[0.72rem] font-black uppercase tracking-[0.08em]">Collect Points</span>
        <span className="rounded-full bg-white/25 px-2 py-0.5 text-[0.72rem] font-black">+50 pts</span>
      </button>
    </MockChrome>
  );
}

/* ── PICK 'EM ── */

function PickTeamRow({
  abbr,
  name,
  selected,
}: {
  abbr: string;
  name: string;
  selected: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-2 py-1.5 ${
        selected
          ? "border-cyan-300/80 bg-cyan-500/15 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
          : "border-white/15 bg-slate-900/60"
      }`}
    >
      <span className="flex items-center gap-2">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[0.55rem] font-black ${
            selected ? "bg-cyan-300 text-slate-950" : "bg-white/15 text-white/80"
          }`}
        >
          {abbr}
        </span>
        <span className={`text-[0.7rem] font-bold ${selected ? "text-cyan-100" : "text-white/80"}`}>{name}</span>
      </span>
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black ${
          selected ? "border border-cyan-300 bg-cyan-300 text-slate-950" : "border border-white/30 text-transparent"
        }`}
      >
        ✓
      </span>
    </div>
  );
}

function PickEmStep1({ accentClass }: { accentClass: string }) {
  return (
    <MockChrome label="Tonight's Matchup" accentClass={accentClass}>
      <div className="flex flex-col gap-1.5">
        <PickTeamRow abbr="LAL" name="Lakers" selected />
        <div className="text-center text-[0.55rem] font-black uppercase tracking-[0.2em] text-white/40">vs</div>
        <PickTeamRow abbr="BOS" name="Celtics" selected={false} />
      </div>
      <p className="text-[0.6rem] font-semibold text-white/70">Tap a team to lock in your pick.</p>
    </MockChrome>
  );
}

function PickEmStep2({ accentClass }: { accentClass: string }) {
  const matchups = [
    { a: "GSW", an: "Warriors", b: "DEN", bn: "Nuggets", pick: "a" as const },
    { a: "MIA", an: "Heat", b: "NYK", bn: "Knicks", pick: "b" as const },
    { a: "PHX", an: "Suns", b: "DAL", bn: "Mavs", pick: null },
  ];
  return (
    <MockChrome label="Make Your Picks · 2/3" accentClass={accentClass}>
      <div className="flex flex-col gap-1.5">
        {matchups.map((m) => (
          <div key={m.a} className="rounded-lg border border-white/12 bg-slate-900/55 p-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              {(["a", "b"] as const).map((side) => {
                const sel = m.pick === side;
                return (
                  <div
                    key={side}
                    className={`flex items-center justify-between rounded-md border px-1.5 py-1 ${
                      sel ? "border-cyan-300/80 bg-cyan-500/15" : "border-white/15 bg-slate-950/50"
                    }`}
                  >
                    <span className={`text-[0.6rem] font-black ${sel ? "text-cyan-100" : "text-white/75"}`}>
                      {side === "a" ? m.a : m.b}
                    </span>
                    <span
                      className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px] font-black ${
                        sel ? "bg-cyan-300 text-slate-950" : "border border-white/25 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[0.6rem] font-semibold text-white/70">Pick a winner for each matchup.</p>
    </MockChrome>
  );
}

function PickEmStep3({ accentClass }: { accentClass: string }) {
  const tiers = [
    { value: "10", label: "per correct pick", active: true },
    { value: "2×", label: "bonus at 7 / 10", active: true },
    { value: "3×", label: "bonus at 10 / 10", active: false },
  ];
  return (
    <MockChrome label="Scoring" accentClass={accentClass}>
      <div className="flex flex-col gap-1.5">
        {tiers.map((t) => (
          <div
            key={t.label}
            className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 ${
              t.active ? "border-indigo-300/60 bg-indigo-500/15" : "border-white/15 bg-slate-900/55"
            }`}
          >
            <span
              className={`min-w-[2.2rem] text-center text-[1.25rem] font-black leading-none ${accentClass}`}
              style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
            >
              {t.value}
            </span>
            <span className="text-[0.68rem] font-semibold text-white/80">{t.label}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-center">
        <span className={`rounded-full border border-white/30 bg-black/40 px-3 py-1 text-[0.66rem] font-black uppercase tracking-[0.12em] ${accentClass}`}>
          Max 300 points
        </span>
      </div>
    </MockChrome>
  );
}

/* ── FANTASY ── */

function FantasyPlayerRow({
  pos,
  name,
  team,
  live,
  baseScore,
}: {
  pos: string;
  name?: string;
  team?: string;
  live?: boolean;
  baseScore?: number;
}) {
  const filled = Boolean(name);
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
        filled ? "border-violet-300/55 bg-violet-500/12" : "border-dashed border-white/20 bg-slate-900/50"
      }`}
    >
      <span
        className={`inline-flex h-6 w-7 items-center justify-center rounded-md text-[0.55rem] font-black ${
          filled ? "bg-violet-400 text-slate-950" : "bg-white/10 text-white/50"
        }`}
      >
        {pos}
      </span>
      {filled ? (
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[0.7rem] font-bold text-white">{name}</span>
          <span className="text-[0.52rem] font-semibold uppercase tracking-[0.1em] text-white/50">{team}</span>
        </span>
      ) : (
        <span className="flex-1 text-[0.66rem] font-semibold italic text-white/40">Empty slot</span>
      )}
      {filled ? (
        live ? (
          <LiveTicker
            start={baseScore ?? 0}
            className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[0.72rem] font-black text-cyan-200"
            suffix=" pts"
          />
        ) : (
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[0.66rem] font-black text-white/60">— pts</span>
        )
      ) : (
        <span className="text-[0.9rem] font-black leading-none text-white/30">+</span>
      )}
    </div>
  );
}

function FantasyStep1({ accentClass }: { accentClass: string }) {
  return (
    <MockChrome label="Your Roster" accentClass={accentClass}>
      <div className="flex flex-col gap-1.5">
        <FantasyPlayerRow pos="PG" name="L. Dončić" team="DAL" live baseScore={18.4} />
        <FantasyPlayerRow pos="SG" />
        <FantasyPlayerRow pos="SF" />
      </div>
      <p className="text-[0.6rem] font-semibold text-white/70">Filled slots score live as games play.</p>
    </MockChrome>
  );
}

function FantasyStep2({ accentClass }: { accentClass: string }) {
  const pool = [
    { name: "J. Tatum", team: "BOS", adding: true },
    { name: "N. Jokić", team: "DEN", adding: false },
    { name: "S. Gilgeous", team: "OKC", adding: false },
  ];
  return (
    <MockChrome label="Add Players" accentClass={accentClass}>
      <div className="flex flex-col gap-1.5">
        {pool.map((p) => (
          <div
            key={p.name}
            className={`flex items-center justify-between rounded-lg border px-2 py-1.5 ${
              p.adding ? "border-cyan-300/70 bg-cyan-500/15" : "border-white/15 bg-slate-900/55"
            }`}
          >
            <span className="flex flex-col leading-tight">
              <span className="text-[0.7rem] font-bold text-white">{p.name}</span>
              <span className="text-[0.52rem] font-semibold uppercase tracking-[0.1em] text-white/50">{p.team}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-[0.06em] ${
                p.adding ? "bg-cyan-300 text-slate-950" : "border border-white/30 text-white/70"
              }`}
            >
              {p.adding ? "✓ Added" : "+ Add"}
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-violet-300/40 bg-violet-500/10 px-2 py-1 text-[0.6rem] font-semibold text-violet-100">
        Roster: 2 / 3 slots filled
      </div>
    </MockChrome>
  );
}

function FantasyStep3({ accentClass }: { accentClass: string }) {
  return (
    <MockChrome label="Lineup Locked" accentClass={accentClass}>
      <div className="flex flex-col gap-1.5">
        <FantasyPlayerRow pos="PG" name="L. Dončić" team="DAL" live baseScore={18.4} />
        <FantasyPlayerRow pos="SG" name="J. Tatum" team="BOS" live baseScore={14.1} />
        <FantasyPlayerRow pos="SF" name="N. Jokić" team="DEN" live baseScore={21.7} />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-2.5 py-1.5">
        <span className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-cyan-200">Total · Live</span>
        <LiveTicker
          start={54.2}
          step={0.9}
          className="text-[1.05rem] font-black text-cyan-100"
          suffix=" pts"
        />
      </div>
      <p className="text-[0.58rem] font-semibold leading-snug text-amber-200/90">
        Heads up: points stop accruing once you leave the venue.
      </p>
    </MockChrome>
  );
}

function GameStepMockup({ gameKey, stepIndex, accentClass }: { gameKey: VenueGameKey; stepIndex: number; accentClass: string }) {
  if (gameKey === "bingo") {
    if (stepIndex === 0) return <BingoStep1 accentClass={accentClass} />;
    if (stepIndex === 1) return <BingoStep2 accentClass={accentClass} />;
    return <BingoStep3 accentClass={accentClass} />;
  }
  if (gameKey === "pickem") {
    if (stepIndex === 0) return <PickEmStep1 accentClass={accentClass} />;
    if (stepIndex === 1) return <PickEmStep2 accentClass={accentClass} />;
    return <PickEmStep3 accentClass={accentClass} />;
  }
  if (gameKey === "fantasy") {
    if (stepIndex === 0) return <FantasyStep1 accentClass={accentClass} />;
    if (stepIndex === 1) return <FantasyStep2 accentClass={accentClass} />;
    return <FantasyStep3 accentClass={accentClass} />;
  }
  return null;
}

const GAME_STEP_ACCENT: Record<VenueGameKey, string> = {
  "speed-trivia": "text-blue-300",
  live_trivia:    "text-cyan-300",
  bingo:          "text-orange-300",
  pickem:         "text-indigo-300",
  fantasy:        "text-violet-300",
};

const GAME_STEP_DOT_ACTIVE: Record<VenueGameKey, string> = {
  "speed-trivia": "bg-blue-300",
  live_trivia:    "bg-cyan-300",
  bingo:          "bg-orange-300",
  pickem:         "bg-indigo-300",
  fantasy:        "bg-violet-300",
};

export function GameOnboardingCard({
  gameKey,
  step,
  stepIndex,
  className = "",
}: {
  gameKey: VenueGameKey;
  step: GameOnboardingStep;
  stepIndex: number;
  className?: string;
}) {
  const card = VENUE_GAME_CARD_BY_KEY[gameKey];
  const accentClass = GAME_STEP_ACCENT[gameKey];
  const hasStepMockups = gameKey === "bingo" || gameKey === "pickem" || gameKey === "fantasy";
  const isHookStep = stepIndex === 0 && !hasStepMockups;

  return (
    <div
      className={`relative flex min-h-0 overflow-hidden rounded-[2rem] border-[3px] border-white/60 text-white shadow-[0_12px_26px_rgba(15,23,42,0.5)] p-5 sm:p-6 ${GAME_CARD_BG_BY_KEY[gameKey]} ${className}`}
    >
      <div className="relative flex min-h-0 flex-1 flex-col gap-4">
        <div
          className="text-[clamp(2rem,6.2vw,3.35rem)] leading-[1.02] font-black uppercase tracking-[0.045em] text-white [text-shadow:0_1px_0_rgba(12,18,28,0.8),0_3px_0_rgba(12,18,28,0.58),0_0_12px_rgba(255,255,255,0.5)]"
          style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
        >
          {card.title}
        </div>
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/40 bg-black/28 px-4 py-4 sm:px-5 sm:py-5 gap-3">
          <div className={`shrink-0 text-[0.85rem] tracking-[0.16em] font-black uppercase ${accentClass}`}>
            {step.stepLabel}
          </div>
          {isHookStep ? (
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
              <div
                className="text-[clamp(1.85rem,5.4vw,2.85rem)] leading-[1.08] font-black text-white [text-shadow:0_1px_0_rgba(12,18,28,0.7),0_0_14px_rgba(255,255,255,0.35)]"
                style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
              >
                {step.heading}
              </div>
              <div className={`h-1 w-16 rounded-full ${GAME_STEP_DOT_ACTIVE[gameKey]}`} />
              <div className="text-[clamp(1.05rem,3vw,1.45rem)] leading-[1.35] text-white/85 font-medium">
                {step.body}
              </div>
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto py-1">
                {hasStepMockups ? (
                  <GameStepMockup gameKey={gameKey} stepIndex={stepIndex} accentClass={accentClass} />
                ) : stepIndex === 1 ? (
                  <GameArtwork gameKey={gameKey} />
                ) : (
                  <GameScoringArtwork gameKey={gameKey} accentClass={accentClass} />
                )}
              </div>
              <div
                className="shrink-0 text-[clamp(1.2rem,3.4vw,1.75rem)] leading-[1.18] font-black text-white [text-shadow:0_1px_0_rgba(12,18,28,0.6)]"
                style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
              >
                {step.heading}
              </div>
              <div className="shrink-0 text-[clamp(1rem,2.8vw,1.3rem)] leading-[1.35] text-white/85 font-medium">
                {step.body}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { GAME_STEP_DOT_ACTIVE };

export function GameIdentityPanel({
  gameKey,
  title,
  subtitle,
  className = "",
}: {
  gameKey: VenueGameKey;
  title: string;
  subtitle: string;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] border-[3px] border-white/65 p-3 text-white shadow-[0_12px_26px_rgba(15,23,42,0.5)] ${GAME_CARD_BG_BY_KEY[gameKey]} ${className}`}
    >
      <div className="space-y-3">
        <div
          className="text-[1.28rem] leading-[1.02] font-black uppercase tracking-[0.045em] text-white [text-shadow:0_1px_0_rgba(12,18,28,0.8),0_3px_0_rgba(12,18,28,0.58),0_0_12px_rgba(255,255,255,0.5)]"
          style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
        >
          {title}
        </div>
        <div className="max-h-10 overflow-hidden rounded-xl border border-white/40 bg-black/25 px-2 py-1.5 text-[0.72rem] leading-snug text-white/95">
          {subtitle}
        </div>
        <GameArtwork gameKey={gameKey} />
      </div>
    </div>
  );
}

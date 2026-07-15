"use client";

import { VENUE_GAME_CARD_BY_KEY, type VenueGameKey, type GameOnboardingStep } from "@/lib/venueGameCards";

export const GAME_CARD_BG_BY_KEY: Record<VenueGameKey, string> = {
  "speed-trivia":
    "bg-[linear-gradient(132deg,#0ea5e9_0%,#2563eb_42%,#7c3aed_100%)]",
  live_trivia:
    "bg-[linear-gradient(132deg,#0ea5e9_0%,#2563eb_42%,#7c3aed_100%)]",
  bingo:
    "[background:radial-gradient(120%_80%_at_50%_0%,rgba(125,211,252,0.10),transparent_60%),radial-gradient(90%_60%_at_15%_85%,rgba(6,30,24,0.88),transparent_60%),#020617]",
  pickem:
    "[background:linear-gradient(115deg,#1a2f72_0%,#1a2f72_46%,#6b1a4e_54%,#6b1a4e_100%)]",
  fantasy:
    "bg-[#0a3128]",
  "category-blitz":
    "bg-[linear-gradient(132deg,#a10d63_0%,#7c0a4a_50%,#4a052c_100%)]",
  "nfl-pickem":
    "[background:linear-gradient(115deg,#1a2f72_0%,#1a2f72_46%,#6b1a4e_54%,#6b1a4e_100%)]",
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
  "category-blitz":
    "bg-[linear-gradient(132deg,rgba(161,13,99,0.18)_0%,rgba(124,10,74,0.2)_50%,rgba(74,5,44,0.18)_100%)] border-pink-400/30",
  "nfl-pickem":
    "bg-[linear-gradient(134deg,rgba(37,99,235,0.22)_0%,rgba(124,58,237,0.22)_56%,rgba(236,72,153,0.2)_100%)] border-indigo-200/65",
};

export const GAME_IDENTITY_SUBTITLE: Record<VenueGameKey, string> = {
  "speed-trivia": "15-second questions in timed rounds.",
  live_trivia: "Synchronized live venue play.",
  bingo: "Track player-stat squares in real time.",
  pickem: "Pick winners and climb your venue league.",
  fantasy: "Build and challenge lineups head to head.",
  "category-blitz": "Live word game — one letter, 12 categories, 3 minutes.",
  "nfl-pickem": "Pick the most NFL winners each week. That's it.",
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

  const isCategoryBlitz = gameKey === "category-blitz";
  const titleColorClass = isCategoryBlitz
    ? "text-amber-50 [text-shadow:0_1px_0_rgba(60,10,40,0.8),0_3px_0_rgba(60,10,40,0.58),0_0_12px_rgba(255,200,100,0.5)]"
    : "text-white [text-shadow:0_1px_0_rgba(12,18,28,0.8),0_3px_0_rgba(12,18,28,0.58),0_0_12px_rgba(255,255,255,0.5)]";

  return (
    <div
      className={`relative flex min-h-0 overflow-hidden rounded-[2rem] border-[3px] border-white/60 shadow-[0_12px_26px_rgba(15,23,42,0.5)] ${
        isLandingLayout ? "p-5 sm:p-6" : "p-4"
      } ${GAME_CARD_BG_BY_KEY[gameKey]} ${className}`}
    >
      <div className={`pointer-events-none absolute inset-0 ${isLandingLayout ? "opacity-45" : "opacity-60"}`}>
        {Array.from({ length: questionMarkCount }).map((_, index) => {
          const row = Math.floor(index / 7);
          const col = index % 7;
          const left = 4 + col * 13.6 + (row % 2 ? -1.8 : 1.8);
          const top = 2 + row * 19 + ((index * 7) % 10);
          const qMarkClass = isCategoryBlitz
            ? "text-pink-200/40"
            : index % 3 === 0 ? "text-cyan-100/40" : index % 3 === 1 ? "text-emerald-200/35" : "text-yellow-200/35";
          return (
            <span
              key={index}
              className={`absolute select-none font-black leading-none ${qMarkClass}`}
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
          } font-black uppercase tracking-[0.045em] ${titleColorClass}`}
          style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
        >
          {card.title}
        </div>
        <div
          className={`flex min-h-0 flex-1 flex-col rounded-2xl border ${
            isCategoryBlitz
              ? "border-pink-300/25 bg-pink-900/20"
              : "border-white/40 bg-black/28"
          } ${isLandingLayout ? "px-4 py-4 sm:px-5 sm:py-5" : "px-3 py-3"}`}
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
                  ? "space-y-2.5 text-[clamp(1rem,3vw,1.35rem)] leading-[1.3]"
                  : "space-y-3 text-[clamp(1.1rem,3.3vw,1.5rem)] leading-[1.25]"
                : denseRules
                  ? "space-y-2 text-[clamp(0.92rem,3.2vw,1.2rem)] leading-[1.28]"
                  : "space-y-2.5 text-[clamp(1rem,3.5vw,1.35rem)] leading-[1.25]"
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

// ─────────────────────────────────────────────────────────────────────────────
// Trivia fallback artwork (speed & live trivia — no custom illustration)
// ─────────────────────────────────────────────────────────────────────────────

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

function GameArtwork({ gameKey }: { gameKey: VenueGameKey }) {
  if (gameKey === "speed-trivia" || gameKey === "live_trivia") return <TriviaArtwork />;
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
  "category-blitz": {
    kind: "ladder",
    rows: [
      { value: "2", label: "points per unique answer" },
      { value: "0", label: "points if anyone else writes the same" },
      { value: "24", label: "max points per round" },
    ],
    foot: "Unique answers only score",
  },
  pickem: {
    kind: "ladder",
    rows: [
      { value: "10", label: "points per correct pick" },
      { value: "2×", label: "bonus at 7 correct" },
      { value: "3×", label: "bonus at a perfect 10" },
    ],
    foot: "Max 300 points",
  },
  "nfl-pickem": {
    kind: "ladder",
    rows: [
      { value: "10", label: "points per correct pick" },
      { value: "Weekly", label: "new games every week" },
      { value: "Season", label: "track your record" },
    ],
    foot: "Picks lock at TNF kickoff",
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

// ─────────────────────────────────────────────────────────────────────────────
// Bingo onboarding illustrations
// ─────────────────────────────────────────────────────────────────────────────

const BINGO_CELL_LABELS: ReadonlyArray<[string, string]> = [
  ["JOKIC",   "30+ PTS"],
  ["CELTS",   "WIN"],
  ["CURRY",   "5+ 3PM"],
  ["A. DAV",  "12+ REB"],
  ["LEBRON",  "20+ PTS"],
  ["TATUM",   "25+ PTS"],
  ["GIANNIS", "35+ PTS"],
  ["PHX",     "WIN"],
  ["DRAY",    "8+ AST"],
  ["KD",      "28+ PTS"],
  ["SGA",     "28+ PTS"],
  ["EMBIID",  "25+ PTS"],
  ["",        ""],
  ["BUCKS",   "WIN"],
  ["ZION",    "22+ PTS"],
  ["GOBERT",  "12+ REB"],
  ["FOX",     "25+ PTS"],
  ["BOOKER",  "25+ PTS"],
  ["PG13",    "22+ PTS"],
  ["DAME",    "4+ 3PM"],
  ["OKC",     "WIN"],
  ["HARDEN",  "8+ AST"],
  ["NETS",    "WIN"],
  ["CP3",     "7+ AST"],
  ["MAXEY",   "25+ PTS"],
];

const BINGO_S1_BOARD_HITS: ReadonlyArray<ReadonlySet<number>> = [
  new Set([2, 6, 16, 20]),
  new Set([0, 1, 5, 6]),
  new Set([4, 8, 14, 20]),
  new Set([2, 7, 11, 13, 23]),
];

const BINGO_HEADER_COLORS = [
  "text-rose-400",
  "text-amber-400",
  "text-emerald-400",
  "text-sky-300",
  "text-violet-400",
] as const;

const BINGO_DIAG_INDICES = new Set([0, 6, 18, 24]);

function BingoCell({
  index,
  hits,
  showDiag,
  label,
}: {
  index: number;
  hits: ReadonlySet<number>;
  showDiag: boolean;
  label?: [string, string];
}) {
  if (index === 12) {
    return (
      <div className="aspect-square flex items-center justify-center rounded-[3px] bg-gradient-to-br from-yellow-600 to-amber-400 text-[0.36rem] font-black leading-none text-slate-900">
        FREE
      </div>
    );
  }
  const active = hits.has(index) || (showDiag && BINGO_DIAG_INDICES.has(index));
  return (
    <div
      className={`aspect-square rounded-[3px] border flex flex-col items-center justify-center gap-px overflow-hidden px-px ${
        active
          ? "border-transparent bg-gradient-to-br from-orange-500 to-yellow-400 shadow-[0_0_5px_rgba(249,115,22,0.4)]"
          : "border-[#c89b3a]/20 bg-[#0c3a2e]"
      }`}
    >
      {label ? (
        <>
          <span className={`text-center text-[0.26rem] font-black leading-none ${active ? "text-slate-900" : "text-white/75"}`}>
            {label[0]}
          </span>
          <span className={`text-center text-[0.24rem] font-semibold leading-none ${active ? "text-slate-900/75" : "text-[#c89b3a]/80"}`}>
            {label[1]}
          </span>
        </>
      ) : null}
    </div>
  );
}

function BingoBoard({
  hits,
  showDiag = false,
  compact = false,
  showLabels = false,
}: {
  hits: ReadonlySet<number>;
  showDiag?: boolean;
  compact?: boolean;
  showLabels?: boolean;
}) {
  const gap = compact ? "gap-px" : "gap-1";
  return (
    <div
      className={`w-full rounded-xl border-2 border-[#7dd3fc] bg-[#0c3a2e] shadow-[0_0_14px_rgba(125,211,252,0.18)] ${
        compact ? "p-1" : "p-2"
      }`}
    >
      <div className={`grid grid-cols-5 ${gap} ${compact ? "mb-px" : "mb-1"}`}>
        {(["B", "I", "N", "G", "O"] as const).map((letter, i) => (
          <div
            key={letter}
            className={`flex items-center justify-center font-black ${BINGO_HEADER_COLORS[i]} ${
              compact ? "text-[0.5rem] leading-[1.15rem]" : "text-[0.7rem] leading-[1.5rem]"
            }`}
            style={{ fontFamily: '"Bree Serif", serif' }}
          >
            {letter}
          </div>
        ))}
      </div>
      <div className={`border-b border-[#c89b3a]/40 ${compact ? "mb-px" : "mb-1"}`} />
      <div className={`grid grid-cols-5 ${gap}`}>
        {Array.from({ length: 25 }, (_, i) => (
          <BingoCell
            key={i}
            index={i}
            hits={hits}
            showDiag={showDiag}
            label={showLabels ? BINGO_CELL_LABELS[i] : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function BingoBoardTiny({ hits }: { hits: ReadonlySet<number> }) {
  return (
    <div className="w-full rounded-xl border-2 border-[#7dd3fc] bg-[#0c3a2e] p-1 shadow-[0_0_10px_rgba(125,211,252,0.15)]">
      <div className="grid grid-cols-5 gap-px">
        {Array.from({ length: 25 }, (_, i) => (
          <div
            key={i}
            className={`aspect-square rounded-[2px] ${
              i === 12
                ? "bg-gradient-to-br from-yellow-600 to-amber-400"
                : hits.has(i)
                ? "bg-gradient-to-br from-orange-500 to-yellow-400 shadow-[0_0_3px_rgba(249,115,22,0.45)]"
                : "border border-[#c89b3a]/15 bg-[#0c3a2e]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

const BINGO_S0_HITS: ReadonlySet<number> = new Set([2, 6, 16, 20]);
const BINGO_S2_HITS: ReadonlySet<number> = new Set([1, 3, 7, 11, 17, 22]);

function BingoIllustration({ stepIndex }: { stepIndex: number }) {
  if (stepIndex === 0) {
    return (
      <div className="w-full">
        <BingoBoard hits={BINGO_S0_HITS} showLabels />
      </div>
    );
  }

  if (stepIndex === 1) {
    return (
      <div className="mx-auto grid w-full max-w-[256px] grid-cols-2 gap-3">
        {BINGO_S1_BOARD_HITS.map((hits, i) => (
          <BingoBoardTiny key={i} hits={hits} />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[178px]">
      <BingoBoard hits={BINGO_S2_HITS} showDiag />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pick 'Em onboarding illustrations
// ─────────────────────────────────────────────────────────────────────────────

function PETeamCol({
  team,
  picked,
  score,
  isWinner,
  settled,
  small,
}: {
  team: string;
  picked: boolean;
  score?: number;
  isWinner?: boolean;
  settled?: boolean;
  small?: boolean;
}) {
  const isCorrect = !!(settled && isWinner && picked);
  return (
    <div
      className={`flex flex-1 flex-col items-center gap-1 ${small ? "px-1.5 py-1.5" : "px-2 py-2.5"} ${
        isCorrect ? "bg-emerald-400/10" : picked ? "bg-[#fde68a]/[0.07]" : ""
      }`}
    >
      <span
        className={`text-center font-bold leading-tight ${small ? "text-[0.55rem]" : "text-[0.63rem]"} ${
          picked ? "text-white" : "text-white/55"
        }`}
      >
        {team}
      </span>
      {settled && score !== undefined && (
        <span
          className={`font-black text-white ${small ? "text-[0.62rem]" : "text-[0.72rem]"}`}
          style={{ fontFamily: "ui-monospace, monospace" }}
        >
          {score}
        </span>
      )}
      <div
        className={`flex items-center justify-center rounded-full border text-[0.42rem] font-black ${
          small ? "h-3.5 w-3.5" : "h-4 w-4"
        } ${
          isCorrect
            ? "border-emerald-400 bg-emerald-400 text-slate-900"
            : picked
            ? "border-[#fde68a] bg-[#fde68a] text-slate-900"
            : "border-white/20 bg-transparent text-transparent"
        }`}
      >
        ✓
      </div>
    </div>
  );
}

function PETicket({
  sport,
  away,
  home,
  picked,
  awaiting = false,
  settled = false,
  awayScore,
  homeScore,
  winnerIsAway = false,
  small = false,
}: {
  sport: string;
  away: string;
  home: string;
  picked: "away" | "home" | null;
  awaiting?: boolean;
  settled?: boolean;
  awayScore?: number;
  homeScore?: number;
  winnerIsAway?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`w-full overflow-hidden rounded-2xl border-2 shadow-[0_4px_16px_rgba(0,0,0,0.4)] ${
        awaiting
          ? "border-[#fde68a]/40 shadow-[0_0_16px_rgba(253,230,138,0.18)]"
          : "border-[#fde68a]/40"
      }`}
      style={{
        background:
          "linear-gradient(115deg, #1a2f72 0%, #1a2f72 46%, #6b1a4e 54%, #6b1a4e 100%)",
      }}
    >
      <div className="flex items-center justify-between border-b border-dashed border-white/16 px-3 py-1.5">
        <span className="text-[0.56rem] font-black uppercase tracking-[0.12em] text-[#fde68a]">
          {sport}
        </span>
        {settled && (
          <span className="text-[0.54rem] font-semibold text-emerald-400">Final</span>
        )}
        {awaiting && (
          <span className="animate-pulse text-[0.5rem] font-semibold text-[#fde68a]/60">
            Tap a team →
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/10">
        <PETeamCol
          team={away}
          picked={picked === "away"}
          score={awayScore}
          isWinner={winnerIsAway}
          settled={settled}
          small={small}
        />
        <PETeamCol
          team={home}
          picked={picked === "home"}
          score={homeScore}
          isWinner={!winnerIsAway}
          settled={settled}
          small={small}
        />
      </div>
      {settled && (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between rounded-lg border border-emerald-400/28 bg-emerald-400/[0.08] px-2 py-1">
            <span className="text-[0.52rem] font-black uppercase tracking-wider text-emerald-400">
              Correct pick!
            </span>
            <span className="text-[0.62rem] font-black text-emerald-400">+10 pts</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PEPipBar({ count, total }: { count: number; total: number }) {
  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[0.54rem] font-black uppercase tracking-wider text-[#fde68a]/65">
          Your picks
        </span>
        <span
          className="text-[0.56rem] font-black text-white/55"
          style={{ fontFamily: "ui-monospace, monospace" }}
        >
          {count}/{total}
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full ${i < count ? "bg-[#fde68a]" : "bg-white/12"}`}
          />
        ))}
      </div>
    </div>
  );
}

function PickEmIllustration({ stepIndex }: { stepIndex: number }) {
  if (stepIndex === 0) {
    return (
      <div className="w-full">
        <PETicket sport="NBA" away="Celtics" home="Heat" picked="away" />
      </div>
    );
  }

  if (stepIndex === 1) {
    return (
      <div className="w-full space-y-1.5">
        <PETicket sport="NBA" away="Celtics" home="Heat" picked="away" small />
        <PETicket sport="NBA" away="Lakers" home="Warriors" picked="home" small />
        <PETicket sport="MLB" away="Dodgers" home="Mets" picked={null} awaiting small />
        <div className="flex justify-center pt-0.5">
          <span className="text-[0.52rem] font-semibold text-white/30">
            More games below ↓
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <PETicket
        sport="NBA"
        away="Bucks"
        home="Nets"
        picked="away"
        settled
        awayScore={119}
        homeScore={104}
        winnerIsAway
      />
      <PEPipBar count={8} total={10} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NFL Pick 'Em onboarding illustrations (NFL-specific team names)
// ─────────────────────────────────────────────────────────────────────────────

function NFLPickEmIllustration({ stepIndex }: { stepIndex: number }) {
  if (stepIndex === 0) {
    return (
      <div className="w-full">
        <PETicket sport="NFL" away="Chiefs" home="Ravens" picked="away" />
      </div>
    );
  }

  if (stepIndex === 1) {
    return (
      <div className="w-full space-y-1.5">
        <PETicket sport="NFL" away="Chiefs" home="Ravens" picked="away" small />
        <PETicket sport="NFL" away="49ers" home="Cowboys" picked="home" small />
        <PETicket sport="NFL" away="Eagles" home="Packers" picked={null} awaiting small />
        <div className="flex justify-center pt-0.5">
          <span className="text-[0.52rem] font-semibold text-white/30">
            More games below ↓
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <PETicket
        sport="NFL"
        away="Bills"
        home="Dolphins"
        picked="away"
        settled
        awayScore={28}
        homeScore={21}
        winnerIsAway
      />
      <PEPipBar count={8} total={14} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fantasy onboarding illustrations
// ─────────────────────────────────────────────────────────────────────────────

function FanLiveBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-400/45 bg-emerald-400/12 px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wider text-emerald-400">
      LIVE
    </span>
  );
}

function HeadshotAvatar({ url, initials }: { url: string; initials: string }) {
  return (
    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-700">
      <span className="absolute inset-0 flex items-center justify-center text-[0.5rem] font-black text-white/50">
        {initials}
      </span>
      <img src={url} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-top" />
    </div>
  );
}

function FanPlayerRow({
  name,
  pos,
  fp,
  live = false,
  headshot,
}: {
  name: string;
  pos: string;
  fp: number;
  live?: boolean;
  headshot?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[rgba(254,243,199,0.09)] bg-black/20 px-3 py-2.5">
      {headshot ? (
        <HeadshotAvatar url={headshot} initials={pos} />
      ) : (
        <span
          className="w-9 shrink-0 text-center text-[0.75rem] font-black leading-none text-[#fde68a]"
          style={{ fontFamily: '"Bree Serif", serif' }}
        >
          {pos}
        </span>
      )}
      {headshot ? (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[0.85rem] font-bold text-white/85">{name}</span>
          <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-[#fde68a]/60">{pos}</span>
        </div>
      ) : (
        <span className="flex-1 text-[0.88rem] font-bold text-white/85">{name}</span>
      )}
      {live && <FanLiveBadge />}
      <span
        className="text-[0.92rem] font-black text-[#67e8f9]"
        style={{ fontFamily: "ui-monospace, monospace" }}
      >
        +{fp}
      </span>
    </div>
  );
}

function FanEmptySlot() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-[rgba(254,243,199,0.14)] px-3 py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-[rgba(254,243,199,0.22)] text-[0.8rem] text-[rgba(254,243,199,0.32)]">
        +
      </span>
      <span className="text-[0.82rem] font-semibold text-[rgba(254,243,199,0.38)]">
        Add a player
      </span>
    </div>
  );
}

function FanDraftRow({
  name,
  pos,
  proj,
  drafting = false,
  headshot,
}: {
  name: string;
  pos: string;
  proj: number;
  drafting?: boolean;
  headshot?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[rgba(254,243,199,0.07)] bg-black/15 px-3 py-2.5">
      {headshot && <HeadshotAvatar url={headshot} initials={pos} />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[0.85rem] font-bold text-white/85">{name}</span>
        <span className="text-[0.65rem] font-semibold text-white/40">{pos}</span>
      </div>
      <span
        className="mr-1 text-[0.75rem] font-black text-[#67e8f9]"
        style={{ fontFamily: "ui-monospace, monospace" }}
      >
        {proj} proj
      </span>
      <div
        className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wide ${
          drafting
            ? "border-violet-400/50 bg-violet-500/25 text-violet-300"
            : "border-[rgba(254,243,199,0.25)] text-[rgba(254,243,199,0.62)]"
        }`}
      >
        {drafting ? "+ Drafting" : "Draft"}
      </div>
    </div>
  );
}

const NBA_HS: Record<string, string> = {
  haliburton: "https://cdn.nba.com/headshots/nba/latest/1040x760/1630169.png",
  jokic:      "https://cdn.nba.com/headshots/nba/latest/1040x760/203999.png",
  tatum:      "https://cdn.nba.com/headshots/nba/latest/1040x760/1628369.png",
  edwards:    "https://cdn.nba.com/headshots/nba/latest/1040x760/1630162.png",
};

function FantasyIllustration({ stepIndex }: { stepIndex: number }) {
  if (stepIndex === 0) {
    return (
      <div className="w-full space-y-2">
        <FanPlayerRow name="T. Haliburton" pos="PG" fp={14} live headshot={NBA_HS.haliburton} />
        <FanEmptySlot />
        <FanEmptySlot />
      </div>
    );
  }

  if (stepIndex === 1) {
    return (
      <div className="w-full space-y-2">
        <FanDraftRow name="Nikola Jokić" pos="C" proj={58.9} headshot={NBA_HS.jokic} />
        <FanDraftRow name="Jayson Tatum" pos="SF" proj={51.4} drafting headshot={NBA_HS.tatum} />
        <FanDraftRow name="A. Edwards" pos="SG" proj={46.7} headshot={NBA_HS.edwards} />
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <FanPlayerRow name="T. Haliburton" pos="PG" fp={28} live headshot={NBA_HS.haliburton} />
      <FanPlayerRow name="N. Jokić" pos="C" fp={31} live headshot={NBA_HS.jokic} />
      <FanPlayerRow name="A. Edwards" pos="SG" fp={12} live headshot={NBA_HS.edwards} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Category Blitz onboarding illustrations
// ─────────────────────────────────────────────────────────────────────────────

const CB_CATEGORIES = [
  "Animal",
  "City",
  "Color",
  "Food",
  "Movie",
  "Musician",
  "Name",
  "Sport",
  "TV Show",
  "Vehicle",
  "Video Game",
  "Website",
] as const;

const CB_ANSWERS_STEP1 = [
  { cat: "Animal", val: "Aardvark", filled: true, typing: false },
  { cat: "City", val: "Athens", filled: true, typing: false },
  { cat: "Color", val: "Aqua...", filled: false, typing: true },
  { cat: "Food", val: "", filled: false, typing: false },
  { cat: "Movie", val: "Avatar", filled: true, typing: false },
  { cat: "Musician", val: "Adele", filled: true, typing: false },
  { cat: "Name", val: "", filled: false, typing: false },
  { cat: "Sport", val: "Archery", filled: true, typing: false },
  { cat: "TV Show", val: "", filled: false, typing: false },
  { cat: "Vehicle", val: "", filled: false, typing: false },
  { cat: "Video Game", val: "Apex...", filled: false, typing: true },
  { cat: "Website", val: "Amazon", filled: true, typing: false },
] as const;

const CB_ANSWERS_STEP2 = [
  { cat: "Animal", you: "Aardvark", other: "Aardvark", status: "duplicate" },
  { cat: "City", you: "Athens", other: "Anchorage", status: "unique" },
  { cat: "Color", you: "Aqua", other: "Aqua", status: "duplicate" },
  { cat: "Food", you: "Apple", other: "Avocado", status: "unique" },
] as const;

function CBCategoryCard({ label, index }: { label: string; index: number }) {
  const colors = [
    "from-pink-500/80 to-rose-600/80",
    "from-violet-500/80 to-purple-600/80",
    "from-fuchsia-500/80 to-pink-600/80",
    "from-purple-500/80 to-indigo-600/80",
  ] as const;
  const colorClass = colors[index % colors.length];
  return (
    <div
      className={`flex items-center justify-center rounded-lg border border-white/20 bg-gradient-to-br ${colorClass} px-1 py-1.5 text-center shadow-sm`}
    >
      <span className="text-[0.55rem] font-bold leading-tight text-white/95">{label}</span>
    </div>
  );
}

function CBAnswerRow({
  category,
  value,
  filled,
  typing,
}: {
  category: string;
  value: string;
  filled: boolean;
  typing?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[0.6rem] font-semibold text-pink-200/70">{category}</span>
      <div
        className={`flex-1 rounded-md border px-2 py-1 text-[0.65rem] font-medium ${
          filled
            ? "border-pink-300/40 bg-pink-500/20 text-white"
            : typing
              ? "border-amber-300/50 bg-amber-500/15 text-amber-100"
              : "border-white/15 bg-black/20 text-white/30"
        }`}
      >
        {value || (typing ? "|" : "...")}
      </div>
    </div>
  );
}

function CBResultRow({
  category,
  you,
  other,
  status,
}: {
  category: string;
  you: string;
  other: string;
  status: "unique" | "duplicate";
}) {
  const isUnique = status === "unique";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
      <span className="w-14 shrink-0 text-[0.55rem] font-semibold text-pink-200/60">{category}</span>
      <div className="flex flex-1 items-center gap-1.5">
        <span
          className={`text-[0.6rem] font-medium ${isUnique ? "text-emerald-300" : "text-rose-300/70 line-through"}`}
        >
          {you}
        </span>
        {isUnique ? (
          <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[0.5rem] font-black text-emerald-300">+2</span>
        ) : (
          <span className="text-[0.5rem] text-rose-300/60">Someone said {other}</span>
        )}
      </div>
    </div>
  );
}

function CategoryBlitzIllustration({ stepIndex }: { stepIndex: number }) {
  // Step 0: Letter drop + categories grid
  if (stepIndex === 0) {
    return (
      <div className="w-full space-y-3">
        {/* Letter Badge */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-amber-300/40 bg-gradient-to-br from-amber-500/20 to-orange-600/20 px-5 py-3 shadow-[0_0_20px_rgba(251,191,36,0.25)]">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-amber-200/80">Letter</span>
            <span
              className="text-4xl font-black text-amber-100"
              style={{ fontFamily: '"Bree Serif", serif', textShadow: "0 0 16px rgba(251,191,36,0.5)" }}
            >
              A
            </span>
          </div>
        </div>
        {/* Categories Grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {CB_CATEGORIES.map((cat, i) => (
            <CBCategoryCard key={cat} label={cat} index={i} />
          ))}
        </div>
        {/* Timer hint */}
        <div className="flex items-center justify-center gap-2">
          <span className="rounded-full border border-pink-300/30 bg-pink-500/10 px-3 py-1 text-[0.6rem] font-semibold text-pink-200/80">
            3:00 to fill all 12
          </span>
        </div>
      </div>
    );
  }

  // Step 1: Active gameplay view
  if (stepIndex === 1) {
    return (
      <div className="w-full space-y-2">
        {/* Timer Bar */}
        <div className="flex items-center justify-between rounded-lg border border-pink-300/30 bg-black/30 px-3 py-2">
          <span className="text-[0.6rem] font-bold uppercase tracking-wider text-amber-300">Round Timer</span>
          <span
            className="text-lg font-black text-amber-100"
            style={{ fontFamily: "ui-monospace, monospace" }}
          >
            2:34
          </span>
        </div>
        {/* Answer Inputs */}
        <div className="space-y-1">
          {CB_ANSWERS_STEP1.slice(0, 6).map((item) => (
            <CBAnswerRow
              key={item.cat}
              category={item.cat}
              value={item.val}
              filled={item.filled}
              typing={item.typing}
            />
          ))}
        </div>
        {/* Progress indicator */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[0.55rem] text-white/50">5/12 filled</span>
          <div className="flex gap-0.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${
                  i < 5 ? "bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.5)]" : "bg-white/15"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Duplicate detection / scoring
  if (stepIndex === 2) {
    return (
      <div className="w-full space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between rounded-lg border border-pink-300/30 bg-black/30 px-3 py-2">
          <span className="text-[0.6rem] font-bold uppercase tracking-wider text-amber-300">Answer Check</span>
          <span className="text-[0.6rem] font-semibold text-white/60">Same answer = no points</span>
        </div>
        {/* Results */}
        <div className="space-y-1">
          {CB_ANSWERS_STEP2.map((item) => (
            <CBResultRow
              key={item.cat}
              category={item.cat}
              you={item.you}
              other={item.other}
              status={item.status}
            />
          ))}
        </div>
        {/* Total */}
        <div className="flex items-center justify-center pt-1">
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-4 py-1.5">
            <span className="text-[0.65rem] font-bold text-emerald-200">Unique answers:</span>
            <span
              className="text-lg font-black text-emerald-300"
              style={{ fontFamily: '"Bree Serif", serif' }}
            >
              2
            </span>
            <span className="text-[0.65rem] font-bold text-emerald-400">× 2 pts = 4</span>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Majority Rules mode ("Watch out!")
  return (
    <div className="w-full space-y-3">
      {/* Mode Switch Banner */}
      <div className="relative overflow-hidden rounded-xl border-2 border-amber-400/50 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 px-4 py-3 shadow-[0_0_20px_rgba(251,191,36,0.2)]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
        </div>
        <div className="relative flex items-center justify-center gap-2">
          <span className="text-lg">⚠️</span>
          <span
            className="text-[0.85rem] font-black uppercase tracking-wider text-amber-200"
            style={{ fontFamily: '"Bree Serif", serif' }}
          >
            Mode Switch!
          </span>
          <span className="text-lg">⚠️</span>
        </div>
      </div>

      {/* Mode Comparison */}
      <div className="grid grid-cols-2 gap-2">
        {/* Normal Mode */}
        <div className="rounded-lg border border-white/20 bg-black/30 px-3 py-2 opacity-50">
          <div className="mb-2 text-center text-[0.55rem] font-bold uppercase tracking-wider text-white/60">
            Normal Mode
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/30 text-[0.5rem]">✓</div>
              <span className="text-[0.55rem] text-white/70">Unique = good</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500/30 text-[0.5rem]">✗</div>
              <span className="text-[0.55rem] text-white/70">Same = bad</span>
            </div>
          </div>
        </div>

        {/* Majority Rules */}
        <div className="rounded-lg border-2 border-amber-400/40 bg-gradient-to-br from-amber-500/20 to-orange-600/20 px-3 py-2 shadow-[0_0_12px_rgba(251,191,36,0.15)]">
          <div className="mb-2 text-center text-[0.55rem] font-black uppercase tracking-wider text-amber-200">
            Majority Rules
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/40 text-[0.5rem] font-bold text-emerald-300">✓</div>
              <span className="text-[0.55rem] font-medium text-white/90">Popular = good</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500/40 text-[0.5rem] font-bold text-rose-300">✗</div>
              <span className="text-[0.55rem] font-medium text-white/90">Unique = bad</span>
            </div>
          </div>
        </div>
      </div>

      {/* Example */}
      <div className="rounded-lg border border-pink-300/25 bg-pink-900/15 px-3 py-2.5">
        <div className="mb-2 text-center text-[0.6rem] font-bold uppercase tracking-wider text-pink-200/80">
          Think: "What will others write?"
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="flex flex-col items-center rounded-lg border border-white/15 bg-black/30 px-3 py-2">
            <span className="text-[0.5rem] uppercase tracking-wider text-white/50">Category</span>
            <span className="text-[0.75rem] font-bold text-white/80">Animal</span>
          </div>
          <span className="text-[0.9rem] text-white/40">→</span>
          <div className="flex flex-col items-center rounded-lg border border-amber-400/40 bg-amber-500/20 px-4 py-2 shadow-[0_0_10px_rgba(251,191,36,0.2)]">
            <span className="text-[0.5rem] uppercase tracking-wider text-amber-200/70">Your Pick</span>
            <span className="text-[0.85rem] font-black text-amber-100">Alligator</span>
          </div>
        </div>
        <div className="mt-2 text-center text-[0.55rem] text-white/50">
          If 5+ players say "Alligator" → You get points!
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch: returns the right illustration for any game × step
// ─────────────────────────────────────────────────────────────────────────────

function GameStepIllustration({
  gameKey,
  stepIndex,
}: {
  gameKey: VenueGameKey;
  stepIndex: number;
}) {
  if (gameKey === "bingo") return <BingoIllustration stepIndex={stepIndex} />;
  if (gameKey === "pickem") return <PickEmIllustration stepIndex={stepIndex} />;
  if (gameKey === "nfl-pickem") return <NFLPickEmIllustration stepIndex={stepIndex} />;
  if (gameKey === "fantasy") return <FantasyIllustration stepIndex={stepIndex} />;
  if (gameKey === "category-blitz") return <CategoryBlitzIllustration stepIndex={stepIndex} />;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding card accent tokens
// ─────────────────────────────────────────────────────────────────────────────

const GAME_STEP_ACCENT: Record<VenueGameKey, string> = {
  "speed-trivia": "text-blue-300",
  live_trivia:    "text-cyan-300",
  bingo:          "text-sky-300",
  pickem:         "text-amber-200",
  fantasy:        "text-violet-300",
  "category-blitz": "text-amber-300",
  "nfl-pickem": "text-amber-200",
};

const GAME_STEP_DOT_ACTIVE: Record<VenueGameKey, string> = {
  "speed-trivia": "bg-blue-300",
  live_trivia:    "bg-cyan-300",
  bingo:          "bg-sky-300",
  pickem:         "bg-amber-200",
  fantasy:        "bg-violet-300",
  "category-blitz": "bg-amber-300",
  "nfl-pickem": "bg-amber-200",
};

function renderBody(body: string | string[]) {
  if (typeof body === "string") {
    return body;
  }
  return body.map((line, i) => (
    <p key={i} className={i > 0 ? "mt-2" : ""}>{line}</p>
  ));
}

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
  const hasCustomIllustration = gameKey === "bingo" || gameKey === "pickem" || gameKey === "nfl-pickem" || gameKey === "fantasy" || gameKey === "category-blitz";
  const isHookStep = stepIndex === 0 && !hasCustomIllustration;
  const displayTitle = (gameKey === "bingo" || gameKey === "pickem" || gameKey === "nfl-pickem") ? card.title.replace(/^Hightop\s+/i, "") : card.title;

  const titleTextColor = gameKey === "category-blitz" ? "text-amber-50" : "text-white";
  const titleTextShadow = gameKey === "category-blitz"
    ? "[text-shadow:0_1px_0_rgba(60,10,40,0.8),0_3px_0_rgba(60,10,40,0.58),0_0_12px_rgba(255,200,100,0.5)]"
    : "[text-shadow:0_1px_0_rgba(12,18,28,0.8),0_3px_0_rgba(12,18,28,0.58),0_0_12px_rgba(255,255,255,0.5)]";

  return (
    <div
      className={`relative flex min-h-0 overflow-hidden rounded-[2rem] border-[3px] border-white/60 shadow-[0_12px_26px_rgba(15,23,42,0.5)] p-5 sm:p-6 ${GAME_CARD_BG_BY_KEY[gameKey]} ${className}`}
    >
      <div className="relative flex min-h-0 flex-1 flex-col gap-4">
        <div
          className={`text-[clamp(2rem,6.2vw,3.35rem)] leading-[1.02] font-black uppercase tracking-[0.045em] ${titleTextColor} ${titleTextShadow}`}
          style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
        >
          {displayTitle}
        </div>
        <div className={`flex min-h-0 flex-1 flex-col rounded-2xl border px-4 py-4 sm:px-5 sm:py-5 ${gameKey === "category-blitz" ? "border-pink-300/25 bg-pink-900/20" : "border-white/40"} ${gameKey === "bingo" ? "gap-1" : gameKey === "fantasy" && stepIndex === 1 ? "gap-5" : gameKey === "fantasy" ? "gap-4" : "gap-3"}`}>
          <div className={`shrink-0 text-[1.1rem] tracking-[0.16em] font-black uppercase ${accentClass}`}>
            {step.stepLabel}
          </div>
          {isHookStep ? (
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
              <div
                className="text-[clamp(1.6rem,4.8vw,2.2rem)] leading-[1.08] font-black text-white [text-shadow:0_1px_0_rgba(12,18,28,0.7),0_0_14px_rgba(255,255,255,0.35)]"
                style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
              >
                {step.heading}
              </div>
              <div className={`h-0.5 w-14 rounded-full ${GAME_STEP_DOT_ACTIVE[gameKey]}`} />
              <div className="text-[clamp(0.92rem,2.6vw,1.2rem)] leading-[1.35] font-medium text-white/85">
                {renderBody(step.body)}
              </div>
            </div>
          ) : (
            <>
              <div className={`flex shrink-0 items-center justify-center ${gameKey === "bingo" ? "py-0" : "py-1"}`}>
                {hasCustomIllustration ? (
                  <GameStepIllustration gameKey={gameKey} stepIndex={stepIndex} />
                ) : stepIndex === 1 ? (
                  <GameArtwork gameKey={gameKey} />
                ) : (
                  <GameScoringArtwork gameKey={gameKey} accentClass={accentClass} />
                )}
              </div>
              <div
                className={`shrink-0 font-black ${gameKey === "category-blitz" ? "text-amber-50 [text-shadow:0_1px_0_rgba(60,10,40,0.6)]" : "text-white [text-shadow:0_1px_0_rgba(12,18,28,0.6)]"} ${
                  hasCustomIllustration
                    ? "text-[clamp(1.2rem,3.8vw,1.7rem)] leading-[1.18]"
                    : "text-[clamp(1rem,3vw,1.35rem)] leading-[1.2]"
                }`}
                style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
              >
                {step.heading}
              </div>
              <div
                className={`shrink-0 font-medium leading-[1.38] ${gameKey === "category-blitz" ? "text-amber-100/85" : "text-white/85"} ${
                  hasCustomIllustration
                    ? "text-[clamp(0.95rem,2.8vw,1.2rem)]"
                    : "text-[clamp(0.85rem,2.5vw,1.1rem)]"
                }`}
              >
                {renderBody(step.body)}
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

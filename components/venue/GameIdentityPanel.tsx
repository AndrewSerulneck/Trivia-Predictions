"use client";

import { MIN_TEXT_PX } from "@/lib/textSizeFloor";
import { VENUE_GAME_CARD_BY_KEY, type VenueGameKey, type GameOnboardingStep } from "@/lib/venueGameCards";
import { CATEGORY_BLITZ_TUTORIAL_CARDS } from "@/lib/categoryBlitzHowToPlay";
import { CategoryBlitzTutorialArt } from "@/components/venue/CategoryBlitzTutorialArt";

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
                fontSize: `max(${MIN_TEXT_PX}px, ${0.66 + (index % 3) * 0.2}rem)`,
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
          } font-black uppercase tracking-[0.045em] ${titleColorClass} [font-family:var(--ht-font-display)]`}
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
              fontSize: `max(${MIN_TEXT_PX}px, ${0.88 + (index % 4) * 0.2}rem)`,
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

type TriviaGameKey = "speed-trivia" | "live_trivia";
type ScoringConfig = { big: string; label: string; foot?: string };

const isTriviaGameKey = (gameKey: VenueGameKey): gameKey is TriviaGameKey =>
  gameKey === "speed-trivia" || gameKey === "live_trivia";

const GAME_SCORING: Record<TriviaGameKey, ScoringConfig> = {
  "speed-trivia": { big: "2", label: "points per correct answer", foot: "Up to 90 points per hour" },
  live_trivia:    { big: "2", label: "points per correct answer" },
};

function GameScoringArtwork({ gameKey, accentClass }: { gameKey: TriviaGameKey; accentClass: string }) {
  const scoring = GAME_SCORING[gameKey];

  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-white/25 bg-slate-950/40 px-4 py-5">
      <span
        className={`text-[clamp(3rem,13vw,4.6rem)] font-black leading-none ${accentClass} [text-shadow:0_0_18px_rgba(255,255,255,0.3)] [font-family:var(--ht-font-display)]`}
      >
        {scoring.big}
      </span>
      <span className="text-center text-[0.95rem] font-bold uppercase tracking-[0.1em] text-white/85">
        {scoring.label}
      </span>
      {scoring.foot ? (
        <span className="text-center text-footnote font-semibold text-white/60">{scoring.foot}</span>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tutorial art for Bingo, Pick 'Em, NFL Pick 'Em and Fantasy.
//
// The card's words come first and the art takes whatever height is left
// (TutorialStatementPanel). So the art is drawn to shrink: the bingo boards
// size themselves to their box (container query units), and the ticket and
// roster pictures show only a row or two, with every label at 14px or more.
// ─────────────────────────────────────────────────────────────────────────────

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
}: {
  index: number;
  hits: ReadonlySet<number>;
  showDiag: boolean;
}) {
  if (index === 12) {
    return (
      <div className="aspect-square rounded-[3px] bg-gradient-to-br from-yellow-600 to-amber-400" />
    );
  }
  const active = hits.has(index) || (showDiag && BINGO_DIAG_INDICES.has(index));
  return (
    <div
      className={`aspect-square rounded-[3px] border ${
        active
          ? "border-transparent bg-gradient-to-br from-orange-500 to-yellow-400 shadow-[0_0_5px_rgba(249,115,22,0.4)]"
          : "border-[#c89b3a]/20 bg-[#0c3a2e]"
      }`}
    />
  );
}

/** Fills its box's width but never its height: the B-I-N-G-O row adds ~2.25rem above the square grid. */
function BingoBoard({ hits, showDiag = false }: { hits: ReadonlySet<number>; showDiag?: boolean }) {
  return (
    <div className="w-[min(100cqw,calc(100cqh-2.25rem),15rem)] rounded-xl border-2 border-[#7dd3fc] bg-[#0c3a2e] p-1.5 shadow-[0_0_14px_rgba(125,211,252,0.18)]">
      <div className="mb-1 grid grid-cols-5 gap-1">
        {(["B", "I", "N", "G", "O"] as const).map((letter, i) => (
          <div
            key={letter}
            className={`flex items-center justify-center text-[15px] font-black leading-[1.4rem] ${BINGO_HEADER_COLORS[i]} [font-family:var(--ht-font-display)]`}
          >
            {letter}
          </div>
        ))}
      </div>
      <div className="mb-1 border-b border-[#c89b3a]/40" />
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 25 }, (_, i) => (
          <BingoCell key={i} index={i} hits={hits} showDiag={showDiag} />
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
  if (stepIndex === 1) {
    return (
      <div className="grid w-[min(100cqw,100cqh,15rem)] grid-cols-2 gap-2">
        {BINGO_S1_BOARD_HITS.map((hits, i) => (
          <BingoBoardTiny key={i} hits={hits} />
        ))}
      </div>
    );
  }
  return <BingoBoard hits={stepIndex === 0 ? BINGO_S0_HITS : BINGO_S2_HITS} showDiag={stepIndex === 2} />;
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
}: {
  team: string;
  picked: boolean;
  score?: number;
  isWinner?: boolean;
  settled?: boolean;
}) {
  const isCorrect = !!(settled && isWinner && picked);
  return (
    <div
      className={`flex min-w-0 flex-col items-center justify-center gap-1 px-2 py-2 ${
        isCorrect ? "bg-emerald-400/10" : picked ? "bg-[#fde68a]/[0.07]" : ""
      }`}
    >
      <span className={`w-full truncate text-center text-[16px] font-bold leading-tight ${picked ? "text-white" : "text-white/60"}`}>
        {team}
      </span>
      <div className="flex items-center gap-2">
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[14px] font-black ${
            isCorrect
              ? "border-emerald-400 bg-emerald-400 text-slate-900"
              : picked
              ? "border-[#fde68a] bg-[#fde68a] text-slate-900"
              : "border-white/25 bg-transparent text-transparent"
          }`}
        >
          ✓
        </div>
        {settled && score !== undefined && (
          <span className="text-[16px] font-black text-white font-mono">
            {score}
          </span>
        )}
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
}) {
  return (
    <div
      className="w-full overflow-hidden rounded-2xl border-2 border-[#fde68a]/40 bg-[linear-gradient(115deg,#1a2f72_0%,#1a2f72_46%,#6b1a4e_54%,#6b1a4e_100%)] shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
    >
      <div className="flex items-center justify-between border-b border-dashed border-white/16 px-3 py-1">
        <span className="text-[14px] font-black uppercase tracking-[0.12em] text-[#fde68a]">
          {sport}
        </span>
        {settled && (
          <span className="text-[14px] font-bold text-emerald-400">Final</span>
        )}
        {awaiting && (
          <span className="animate-pulse text-[14px] font-bold text-[#fde68a]/80">
            Tap a team
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/10">
        <PETeamCol team={away} picked={picked === "away"} score={awayScore} isWinner={winnerIsAway} settled={settled} />
        <PETeamCol team={home} picked={picked === "home"} score={homeScore} isWinner={!winnerIsAway} settled={settled} />
      </div>
      {settled && (
        <div className="flex items-center justify-between border-t border-emerald-400/25 bg-emerald-400/[0.08] px-3 py-1">
          <span className="text-[14px] font-black uppercase tracking-wider text-emerald-400">
            Correct pick!
          </span>
          <span className="text-[14px] font-black text-emerald-400">+10 pts</span>
        </div>
      )}
    </div>
  );
}

function PEPipBar({ count, total }: { count: number; total: number }) {
  return (
    <div className="w-full [@container(max-height:12.5rem)]:hidden">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[14px] font-black uppercase tracking-wider text-[#fde68a]/80">
          Your picks
        </span>
        <span
          className="text-[14px] font-black text-white/80 font-mono"
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

type PickEmScene = {
  sport: string;
  /** Step 0: one picked game. */
  first: { away: string; home: string };
  /** Step 1: a second game, still waiting for a pick (daily Pick 'Em mixes sports). */
  waiting: { sport: string; away: string; home: string };
  /** Step 2: a settled correct pick and the picks bar. */
  settled: { away: string; home: string; awayScore: number; homeScore: number };
  picks: { count: number; total: number };
};

const PICKEM_SCENE: PickEmScene = {
  sport: "NBA",
  first: { away: "Celtics", home: "Heat" },
  waiting: { sport: "MLB", away: "Dodgers", home: "Mets" },
  settled: { away: "Bucks", home: "Nets", awayScore: 119, homeScore: 104 },
  picks: { count: 8, total: 10 },
};

const NFL_PICKEM_SCENE: PickEmScene = {
  sport: "NFL",
  first: { away: "Chiefs", home: "Ravens" },
  waiting: { sport: "NFL", away: "Eagles", home: "Packers" },
  settled: { away: "Bills", home: "Dolphins", awayScore: 28, homeScore: 21 },
  picks: { count: 8, total: 14 },
};

function PickEmIllustration({ scene, stepIndex }: { scene: PickEmScene; stepIndex: number }) {
  if (stepIndex === 0) {
    return <PETicket sport={scene.sport} away={scene.first.away} home={scene.first.home} picked="away" />;
  }

  if (stepIndex === 1) {
    return (
      <div className="w-full space-y-2">
        <PETicket sport={scene.sport} away={scene.first.away} home={scene.first.home} picked="away" />
        <div className="[@container(max-height:14rem)]:hidden">
          <PETicket sport={scene.waiting.sport} away={scene.waiting.away} home={scene.waiting.home} picked={null} awaiting />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      <PETicket
        sport={scene.sport}
        away={scene.settled.away}
        home={scene.settled.home}
        picked="away"
        settled
        awayScore={scene.settled.awayScore}
        homeScore={scene.settled.homeScore}
        winnerIsAway
      />
      <PEPipBar count={scene.picks.count} total={scene.picks.total} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fantasy onboarding illustrations
// ─────────────────────────────────────────────────────────────────────────────

function FanPlayerRow({ name, pos, fp }: { name: string; pos: string; fp: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[rgba(254,243,199,0.09)] bg-black/20 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[16px] font-bold leading-snug text-white/90">{name}</span>
        <span className="flex items-center gap-1.5 text-[14px] font-semibold uppercase tracking-wider text-[#fde68a]/70">
          {pos}
          <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span className="font-black text-emerald-400">Live</span>
        </span>
      </div>
      <span className="text-[17px] font-black text-[#67e8f9] font-mono">
        +{fp}
      </span>
    </div>
  );
}

function FanEmptySlot() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-[rgba(254,243,199,0.2)] px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-[rgba(254,243,199,0.3)] text-[16px] text-[rgba(254,243,199,0.55)]">
        +
      </span>
      <span className="text-[15px] font-semibold text-[rgba(254,243,199,0.6)]">Add a player</span>
    </div>
  );
}

function FanDraftRow({ name, pos, drafting = false }: { name: string; pos: string; drafting?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[rgba(254,243,199,0.07)] bg-black/15 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[16px] font-bold leading-snug text-white/90">{name}</span>
        <span className="text-[14px] font-semibold uppercase tracking-wider text-white/55">{pos}</span>
      </div>
      <div
        className={`shrink-0 rounded-full border px-3 py-1 text-[14px] font-black uppercase tracking-wide ${
          drafting
            ? "border-violet-400/50 bg-violet-500/25 text-violet-200"
            : "border-[rgba(254,243,199,0.3)] text-[rgba(254,243,199,0.75)]"
        }`}
      >
        {drafting ? "Drafted" : "Draft"}
      </div>
    </div>
  );
}

function FantasyIllustration({ stepIndex }: { stepIndex: number }) {
  if (stepIndex === 0) {
    return (
      <div className="w-full space-y-2">
        <FanPlayerRow name="T. Haliburton" pos="PG" fp={14} />
        <div className="[@container(max-height:10rem)]:hidden">
          <FanEmptySlot />
        </div>
      </div>
    );
  }

  if (stepIndex === 1) {
    return (
      <div className="w-full space-y-2">
        <FanDraftRow name="Nikola Jokić" pos="C" />
        <div className="[@container(max-height:10rem)]:hidden">
          <FanDraftRow name="Jayson Tatum" pos="SF" drafting />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <FanPlayerRow name="T. Haliburton" pos="PG" fp={28} />
      <div className="[@container(max-height:10rem)]:hidden">
        <FanPlayerRow name="N. Jokić" pos="C" fp={31} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch: returns the right illustration for any game × step
// ─────────────────────────────────────────────────────────────────────────────

const categoryBlitzArtOf = (stepIndex: number) => CATEGORY_BLITZ_TUTORIAL_CARDS[stepIndex]?.art ?? "intro";

function GameStepIllustration({
  gameKey,
  stepIndex,
}: {
  gameKey: VenueGameKey;
  stepIndex: number;
}) {
  if (gameKey === "category-blitz") {
    return <CategoryBlitzTutorialArt art={categoryBlitzArtOf(stepIndex)} />;
  }
  if (gameKey === "bingo") return <BingoIllustration stepIndex={stepIndex} />;
  if (gameKey === "pickem") return <PickEmIllustration scene={PICKEM_SCENE} stepIndex={stepIndex} />;
  if (gameKey === "nfl-pickem") return <PickEmIllustration scene={NFL_PICKEM_SCENE} stepIndex={stepIndex} />;
  if (gameKey === "fantasy") return <FantasyIllustration stepIndex={stepIndex} />;
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

function renderBody(body: string | string[] | undefined) {
  if (body === undefined) {
    return null;
  }
  if (typeof body === "string") {
    return body;
  }
  return body.map((line, i) => (
    <p key={i} className={i > 0 ? "mt-2" : ""}>{line}</p>
  ));
}

/**
 * Games whose tutorial cards use the statement-first layout that Category Blitz
 * introduced (Andrew, 2026-10-17: emulate it "for these tutorials and for future
 * ones when we make new games"): no eyebrow label, the card's statement and
 * detail on top at reading size, the art below in whatever height is left. A
 * new game's tutorial belongs in this set, with its art in GameStepIllustration.
 */
const STATEMENT_LAYOUT_GAMES: ReadonlySet<VenueGameKey> = new Set<VenueGameKey>([
  "category-blitz",
  "bingo",
  "pickem",
  "nfl-pickem",
  "fantasy",
]);

export const usesStatementTutorialLayout = (gameKey: VenueGameKey): boolean => STATEMENT_LAYOUT_GAMES.has(gameKey);

const STATEMENT_TONE = {
  "category-blitz": {
    panel: "border-pink-300/25 bg-pink-900/20",
    heading: "text-amber-50 [text-shadow:0_1px_0_rgba(60,10,40,0.6)]",
    body: "text-amber-100/90",
  },
  default: {
    panel: "border-white/25 bg-black/15",
    heading: "text-white [text-shadow:0_1px_0_rgba(12,18,28,0.6)]",
    body: "text-white/90",
  },
} as const;

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
  const statementLayout = usesStatementTutorialLayout(gameKey);
  const isHookStep = stepIndex === 0;
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
          className={`text-[clamp(2rem,6.2vw,3.35rem)] leading-[1.02] font-black uppercase tracking-[0.045em] ${titleTextColor} ${titleTextShadow} [font-family:var(--ht-font-display)]`}
        >
          {displayTitle}
        </div>
        {statementLayout ? (
          <TutorialStatementPanel gameKey={gameKey} step={step} stepIndex={stepIndex} />
        ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl border px-4 py-4 sm:px-5 sm:py-5 border-white/40">
          <div className={`shrink-0 text-[1.1rem] tracking-[0.16em] font-black uppercase ${accentClass}`}>
            {step.stepLabel}
          </div>
          {isHookStep ? (
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
              <div
                className="text-[clamp(1.6rem,4.8vw,2.2rem)] leading-[1.08] font-black text-white [text-shadow:0_1px_0_rgba(12,18,28,0.7),0_0_14px_rgba(255,255,255,0.35)] [font-family:var(--ht-font-display)]"
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
              <div className="flex shrink-0 items-center justify-center py-1">
                {stepIndex === 1 ? (
                  <TriviaArtwork />
                ) : isTriviaGameKey(gameKey) ? (
                  <GameScoringArtwork gameKey={gameKey} accentClass={accentClass} />
                ) : null}
              </div>
              <div
                className="shrink-0 text-[clamp(1rem,3vw,1.35rem)] leading-[1.2] font-black text-white [text-shadow:0_1px_0_rgba(12,18,28,0.6)] [font-family:var(--ht-font-display)]"
              >
                {step.heading}
              </div>
              <div className="shrink-0 text-[clamp(0.85rem,2.5vw,1.1rem)] font-medium leading-[1.38] text-white/85">
                {renderBody(step.body)}
              </div>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

/**
 * The statement-first tutorial layout (Category Blitz plan §3): no step label;
 * the card's statement and detail sit ABOVE the art, at reading size, and the
 * art takes the height that is left. Outside Category Blitz the art box is a
 * size container, so the drawings scale to it (see the tutorial art above).
 */
function TutorialStatementPanel({ gameKey, step, stepIndex }: { gameKey: VenueGameKey; step: GameOnboardingStep; stepIndex: number }) {
  const isCategoryBlitz = gameKey === "category-blitz";
  const isIntro = isCategoryBlitz && categoryBlitzArtOf(stepIndex) === "intro";
  const tone = STATEMENT_TONE[isCategoryBlitz ? "category-blitz" : "default"];
  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3 rounded-2xl border px-3 py-3 sm:px-4 sm:py-4 ${tone.panel}`}>
      <div className={`shrink-0 ${isIntro ? "flex flex-1 flex-col justify-center" : ""}`}>
        <div
          className={`font-black [font-family:var(--ht-font-display)] ${tone.heading} ${
            isIntro ? "text-center text-[clamp(1.9rem,8vw,2.5rem)] leading-[1.08]" : "text-[clamp(1.3rem,5.4vw,1.75rem)] leading-[1.18]"
          }`}
        >
          {step.heading}
        </div>
        {step.body ? (
          <div className={`mt-2 text-[clamp(1.05rem,4.6vw,1.2rem)] font-semibold leading-[1.35] ${tone.body}`}>
            {renderBody(step.body)}
          </div>
        ) : null}
      </div>
      <div
        className={`flex min-h-0 items-center justify-center ${
          isIntro ? "shrink-0 pb-4" : isCategoryBlitz ? "flex-1" : "flex-1 overflow-hidden p-0.5 [container-type:size] [align-items:safe_center] [justify-content:safe_center]"
        }`}
      >
        <GameStepIllustration gameKey={gameKey} stepIndex={stepIndex} />
      </div>
    </div>
  );
}

export { GAME_STEP_DOT_ACTIVE };

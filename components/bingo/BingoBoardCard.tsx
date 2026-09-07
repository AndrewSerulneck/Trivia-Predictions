"use client";

import { memo } from "react";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { LiveDot } from "@/components/venue/GameChrome";
import { getLeagueDisplay, toMascotMatchup } from "@/lib/sportsBingoLeagues";
import {
  BINGO_HEADER_LETTERS,
  formatLocalDateTime,
  getBoardProgress,
  getCardSquareStyle,
  renderSquareStatusGlyph,
  shortenLabel,
  toCardSquareKey,
  type BingoCard,
  type BingoCardSquare,
} from "@/components/bingo/bingoBoardShared";

// One board in the portrait vertical stack (Phase 2 of
// `docs/prop-bingo-page-simplification-plan.md`). Replaces the old "switcher strip + single
// primary zone" pair: every board the player holds for the selected day renders as one of
// these, live or settled.
//
// The landscape carousel (`isLandscapeGameView` in `SportsBingoHome.tsx`) is a separate render
// tree by design and does NOT use this component — see decision 2 in the plan.

export type BingoBoardCardProps = {
  card: BingoCard;
  /**
   * Whether this board's game has already tipped off. Computed by the parent (inside the
   * `portraitStackCards` memo) rather than here: `Date.now()` during render is impure, and
   * deriving it upstream also keeps this component's memo comparison deterministic.
   */
  isLive: boolean;
  /** Square keys (`cardId:index`) that just changed status — drives the pop animation. */
  recentlyUpdatedSquareKeys: ReadonlySet<string>;
  /** Subset of the above that resolved as a hit — drives the gold "success" pop. */
  recentlySucceededSquareKeys: ReadonlySet<string>;
  /** Square keys currently painting the cyan glow wash. */
  glowSquareKeys: ReadonlySet<string>;
  /** Card ids currently painting the whole-board cyan glow wash. */
  glowCardIds: ReadonlySet<string>;
  /** Card ids that were just created — drives `bingo-board-pop`. */
  recentlyAddedCardIds: ReadonlySet<string>;
  /** True while this board's claim request is in flight. */
  isClaiming: boolean;
  /** True while any claim is in flight / interaction is blocked. */
  claimDisabled: boolean;
  /** Tap the board: select it for landscape and open the expanded modal. */
  onOpen: (cardId: string) => void;
  /** Tap "Collect" on a settled, won, unclaimed board. */
  onClaim: (cardId: string, sourceElement: HTMLElement | null) => void;
};

// The 5x5 felt grid. Moved verbatim out of `SportsBingoHome`'s module-level
// `renderCompactGrid` — that function had exactly one call site (the old primary zone).
function renderCompactGrid(
  cardId: string,
  squares: BingoCardSquare[],
  recentlyUpdatedSquareKeys: ReadonlySet<string>,
  recentlySucceededSquareKeys: ReadonlySet<string>,
  glowingSquareKeys: ReadonlySet<string>
) {
  const byIndex = new Map<number, BingoCardSquare>();
  for (const square of squares) {
    byIndex.set(square.index, square);
  }

  return (
    <div className="relative rounded-[18px] border-2 border-sky-300/90 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,215,128,0.10),transparent_60%),radial-gradient(circle_at_20%_80%,rgba(0,0,0,0.45),transparent_60%),#0c3a2e] p-3 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4),0_12px_26px_rgba(0,0,0,0.55),0_0_28px_rgba(125,211,252,0.18)]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-1 rounded-[14px] border border-[#c89b3a]/55" />
      <div className="relative z-[2] mb-2 grid grid-cols-5 gap-1.5">
        {BINGO_HEADER_LETTERS.map((item) => (
          <div
            key={item.letter}
            className={`text-center text-lg font-black tracking-[0.1em] [font-family:'Bree_Serif','Nunito',serif] [text-shadow:0_1px_0_rgba(0,0,0,0.5),0_0_12px_currentColor] ${item.color}`}
          >
            {item.letter}
          </div>
        ))}
      </div>
      <div className="relative z-[2] grid grid-cols-5 gap-1.5">
        {Array.from({ length: 25 }).map((_, index) => {
          const square = byIndex.get(index);
          if (!square) {
            return <div key={index} className="h-10 rounded-md border border-white/[0.06] bg-slate-900/40" />;
          }

          const isFree = Boolean(square.isFree);
          const squareKey = toCardSquareKey(cardId, index);
          const shouldPop = recentlyUpdatedSquareKeys.has(squareKey);
          const isSuccessPop = recentlySucceededSquareKeys.has(squareKey);
          const isGlowing = glowingSquareKeys.has(squareKey);
          const progressText =
            square.propProgress && square.status === "pending"
              ? `${Math.min(square.propProgress.current, square.propProgress.target)}/${square.propProgress.target}`
              : "";
          return (
            <div
              key={index}
              title={square.label}
              data-bingo-square-key={squareKey}
              className={`relative flex h-10 items-center justify-center rounded-md border px-1 text-center text-[9px] font-bold leading-tight [font-family:'Bree_Serif','Nunito',serif] ${getCardSquareStyle(
                square.status,
                isFree
              )} ${
                shouldPop
                  ? isSuccessPop
                    ? "bingo-square-pop ring-2 ring-amber-300 bg-gradient-to-br from-amber-300 via-yellow-300 to-lime-200 text-amber-900 shadow-[0_0_14px_3px_rgba(250,204,21,0.9)] animate-pulse motion-reduce:animate-none"
                    : "bingo-square-pop ring-2 ring-cyan-400 shadow-[0_0_8px_2px_rgba(34,211,238,0.45)]"
                  : ""
              }`}
            >
              <span
                className={`pointer-events-none absolute inset-0 rounded-md bg-cyan-300/35 blur-[1px] transition duration-200 [will-change:transform,opacity] ${
                  isGlowing ? "scale-110 opacity-100" : "scale-95 opacity-0"
                }`}
              />
              {renderSquareStatusGlyph(square)}
              <span>{isFree ? "FREE" : shortenLabel(square.label)}</span>
              {progressText ? (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-black text-sky-200/90">
                  {progressText}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BingoBoardCardImpl = ({
  card,
  isLive,
  recentlyUpdatedSquareKeys,
  recentlySucceededSquareKeys,
  glowSquareKeys,
  glowCardIds,
  recentlyAddedCardIds,
  isClaiming,
  claimDisabled,
  onOpen,
  onClaim,
}: BingoBoardCardProps) => {
  const progress = getBoardProgress(card.squares);
  const league = getLeagueDisplay(card.sportKey);
  const matchup = toMascotMatchup(card.awayTeam, card.homeTeam) || card.gameLabel;
  const isSettled = card.status !== "active";
  const isWon = card.status === "won";
  const showClaim = isWon && !card.rewardClaimedAt && card.rewardPoints > 0;

  return (
    <article
      data-bingo-card-id={card.id}
      className={`rounded-[20px] border p-2.5 ${
        isWon
          ? "border-emerald-400/45 bg-[linear-gradient(180deg,rgba(16,185,129,0.10),#0f172a)]"
          : isSettled
          ? "border-white/[0.07] bg-slate-900/70"
          : "border-sky-300/25 bg-slate-900/60"
      } ${recentlyAddedCardIds.has(card.id) ? "bingo-board-pop" : ""}`}
    >
      {/* Header — sport emoji + mascot-only matchup, the loudest text on the card (Phase 3c).
          Full team names stay on `card.gameLabel` for the expanded modal. */}
      <p className="flex items-center gap-1.5 truncate px-0.5 leading-tight text-amber-100 [font-family:'Bree_Serif','Nunito',serif] [text-shadow:0_1px_0_rgba(0,0,0,0.5)]">
        <span aria-hidden="true" className="shrink-0 text-[22px] leading-none">
          {league.emoji}
        </span>
        <span className="truncate text-[17px]">{matchup}</span>
      </p>

      {/* Status row */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-0.5">
        {isSettled ? (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${
              isWon
                ? "border-emerald-300/45 bg-emerald-500/[0.16] text-emerald-300"
                : "border-white/[0.08] bg-white/[0.04] text-slate-400"
            }`}
          >
            {isWon ? "Bingo · Won" : card.status === "canceled" ? "Canceled" : "Final · No bingo"}
          </span>
        ) : isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-500/[0.14] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-300">
            <LiveDot />
            Live
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-sky-300/35 bg-sky-300/[0.08] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-sky-300">
            Starts {formatLocalDateTime(card.startsAt)}
          </span>
        )}
        <span className="inline-flex items-center rounded-full border border-sky-300/30 bg-sky-300/10 px-2.5 py-1 text-[9.5px] font-bold text-sky-300 [font-family:ui-monospace,monospace]">
          {progress.hitCount}/25 marked
        </span>
      </div>

      {/* The board itself — tapping it selects this board for landscape and expands it. */}
      <div onClick={() => onOpen(card.id)} className="relative mt-2 cursor-pointer">
        <span
          className={`pointer-events-none absolute inset-0 z-[3] rounded-[18px] bg-cyan-300/20 transition duration-200 [will-change:transform,opacity] ${
            glowCardIds.has(card.id) ? "scale-105 opacity-100" : "scale-95 opacity-0"
          }`}
        />
        {renderCompactGrid(
          card.id,
          card.squares,
          recentlyUpdatedSquareKeys,
          recentlySucceededSquareKeys,
          glowSquareKeys
        )}
      </div>

      {/* Footer — closest line (live) or result (settled), plus the primary action. */}
      <div className="mt-2.5 flex items-stretch gap-2">
        <div
          className={`flex-1 rounded-xl border px-3 py-2 ${
            isSettled ? "border-white/[0.08] bg-slate-950/40" : "border-sky-300/35 bg-slate-900"
          }`}
        >
          <p
            className={`text-[9px] font-black uppercase tracking-[0.14em] ${
              isSettled ? "text-slate-400" : "text-sky-300"
            }`}
          >
            {isSettled ? "Points" : "Closest line"}
          </p>
          <p
            className={`mt-0.5 text-[13px] font-black [font-family:ui-monospace,monospace] ${
              isSettled ? (isWon ? "text-emerald-300" : "text-slate-600") : "text-amber-400"
            }`}
          >
            {isSettled
              ? isWon
                ? `+${card.rewardPoints}${card.rewardClaimedAt ? " · claimed" : ""}`
                : "0"
              : progress.toBingo === null
              ? "Every line blocked"
              : progress.toBingo === 0
              ? "Bingo!"
              : `${progress.toBingo} to go`}
          </p>
        </div>
        {showClaim ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClaim(card.id, event.currentTarget);
            }}
            disabled={claimDisabled || isClaiming}
            aria-busy={isClaiming}
            className="tp-clean-button inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-300/60 bg-emerald-500/[0.16] px-4 text-[11px] font-black uppercase tracking-[0.04em] text-emerald-300 disabled:opacity-60"
          >
            {isClaiming ? (
              <>
                <ButtonSpinner /> Collecting…
              </>
            ) : (
              `Collect +${card.rewardPoints}`
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(card.id);
            }}
            className="tp-clean-button inline-flex shrink-0 items-center rounded-xl border border-sky-300/45 bg-sky-300/10 px-4 text-[11px] font-black uppercase tracking-[0.04em] text-sky-300"
          >
            Expand
          </button>
        )}
      </div>
    </article>
  );
};

// --- Memoization (plan 2e) -------------------------------------------------------------
//
// Up to four live 25-square grids now share the screen. The parent re-renders on every glow /
// pop timer tick and on every poll, and it hands down whole `Set`s that are rebuilt each time,
// so a shallow `memo` would never hit. Instead we compare a cheap per-card signature: the
// card's own displayed fields, plus this card's own membership in each animation set. A square
// resolving on board A therefore re-renders only board A.
//
// The callbacks (`onOpen`, `onClaim`) are compared by identity and MUST be referentially
// stable in the parent — `SportsBingoHome` keeps them stable behind a latest-value ref so they
// can never go stale. If you add a prop here, add it to this comparator too.

const cardSignature = (card: BingoCard): string => {
  let squares = "";
  for (const square of card.squares) {
    squares += `${square.index}:${square.status}:${square.isFree ? 1 : 0}:${square.label}:${
      square.propProgress ? `${square.propProgress.current}/${square.propProgress.target}` : ""
    };`;
  }
  return `${card.id}|${card.status}|${card.startsAt}|${card.gameLabel}|${card.sportKey}|${card.awayTeam}|${card.homeTeam}|${card.rewardPoints}|${
    card.rewardClaimedAt ?? ""
  }|${squares}`;
};

const cardSquareSetSignature = (cardId: string, keys: ReadonlySet<string>): string => {
  if (keys.size === 0) {
    return "";
  }
  let signature = "";
  for (let index = 0; index < 25; index += 1) {
    if (keys.has(toCardSquareKey(cardId, index))) {
      signature += `${index},`;
    }
  }
  return signature;
};

const arePropsEqual = (prev: BingoBoardCardProps, next: BingoBoardCardProps): boolean => {
  if (
    prev.onOpen !== next.onOpen ||
    prev.onClaim !== next.onClaim ||
    prev.isLive !== next.isLive ||
    prev.isClaiming !== next.isClaiming ||
    prev.claimDisabled !== next.claimDisabled
  ) {
    return false;
  }
  const cardId = next.card.id;
  if (prev.card.id !== cardId) {
    return false;
  }
  if (
    prev.glowCardIds.has(cardId) !== next.glowCardIds.has(cardId) ||
    prev.recentlyAddedCardIds.has(cardId) !== next.recentlyAddedCardIds.has(cardId)
  ) {
    return false;
  }
  if (
    cardSquareSetSignature(cardId, prev.recentlyUpdatedSquareKeys) !==
      cardSquareSetSignature(cardId, next.recentlyUpdatedSquareKeys) ||
    cardSquareSetSignature(cardId, prev.recentlySucceededSquareKeys) !==
      cardSquareSetSignature(cardId, next.recentlySucceededSquareKeys) ||
    cardSquareSetSignature(cardId, prev.glowSquareKeys) !==
      cardSquareSetSignature(cardId, next.glowSquareKeys)
  ) {
    return false;
  }
  return cardSignature(prev.card) === cardSignature(next.card);
};

export const BingoBoardCard = memo(BingoBoardCardImpl, arePropsEqual);

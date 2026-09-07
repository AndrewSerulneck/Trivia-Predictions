// Shared Bingo board primitives.
//
// Extracted from `components/bingo/SportsBingoHome.tsx` in Phase 2 of
// `docs/prop-bingo-page-simplification-plan.md` so that `BingoBoardCard` (the vertical-stack
// board tile) and the page shell can use the same types, math and square styling without a
// circular import. These are verbatim moves — behavior is intentionally unchanged.

export type BingoCardSquare = {
  id: string;
  index: number;
  key: string;
  label: string;
  probability: number;
  isFree: boolean;
  status: "pending" | "hit" | "miss" | "void" | "replaced";
  resolvedAt?: string;
  propProgress?: { current: number; target: number; unit: string };
};

export type BingoCard = {
  id: string;
  userId: string;
  venueId: string;
  gameId: string;
  gameLabel: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  status: "active" | "won" | "lost" | "canceled";
  boardProbability: number;
  rewardPoints: number;
  rewardClaimedAt?: string;
  createdAt: string;
  settledAt?: string;
  squares: BingoCardSquare[];
};

export const LINE_PATTERNS: number[][] = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

export function formatLocalDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Landscape squares only. Phase 1 grew each square and raised the square font; the
// board stage then dropped its square aspect cap and now fills the full landscape
// column, so cells are wider than they are tall and have several lines of room.
// The whole premise of the landscape view is that it shows the prop bet in full, so
// there is deliberately NO character cap here any more — `shortenLabel`'s ellipsis
// was the last thing truncating text that the box could actually fit. The `line-clamp-4`
// on the label span remains the only limit, and it clamps by real rendered lines
// rather than by a guessed character count. Portrait squares are far smaller and keep
// `shortenLabel`'s own default; do not reuse this behavior there.
export const LANDSCAPE_SQUARE_LABEL_MAX_LENGTH = Number.POSITIVE_INFINITY;

export function shortenLabel(label: string, maxLength = 18): string {
  const trimmed = label.trim();
  const supportPrefixMatch = trimmed.match(/^\[(SUPPORTED|POSSIBLE)\]\s*/i);
  const prefix = supportPrefixMatch?.[1]
    ? supportPrefixMatch[1].toUpperCase() === "SUPPORTED"
      ? "S: "
      : "P: "
    : "";
  const body = supportPrefixMatch ? trimmed.replace(/^\[(SUPPORTED|POSSIBLE)\]\s*/i, "") : trimmed;
  const normalized = `${prefix}${body}`;

  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

// Casino-felt square treatment — open squares read as dark "daub-ready" tiles on
// the green felt; hit squares glow orange; the FREE center is gold.
export function getCardSquareStyle(status: BingoCardSquare["status"], isFree: boolean): string {
  if (isFree) {
    return "border-amber-300/65 bg-[linear-gradient(135deg,rgba(252,211,77,0.42),rgba(217,119,6,0.32))] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]";
  }
  if (status === "hit") {
    return "border-orange-400/70 bg-[radial-gradient(circle_at_50%_38%,rgba(249,115,22,0.6),rgba(249,115,22,0.16)_70%,transparent),rgba(249,115,22,0.18)] text-orange-100 shadow-[0_0_12px_rgba(249,115,22,0.45)]";
  }
  if (status === "miss") {
    return "border-rose-500/45 bg-rose-950/30 text-rose-300/80";
  }
  if (status === "void") {
    return "border-white/[0.06] bg-slate-900/40 text-slate-600";
  }
  // pending — open square on the felt, awaiting a stat update
  return "border-white/10 bg-white/[0.04] text-white/75";
}

export function renderSquareStatusGlyph(square: BingoCardSquare) {
  if (square.isFree || square.status === "hit") {
    return (
      <span className="absolute right-0.5 top-0.5 text-[11px] font-black leading-none text-amber-200 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
        ✓
      </span>
    );
  }
  if (square.status === "miss") {
    return (
      <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white">
        ✕
      </span>
    );
  }
  return null;
}

export function toCardSquareKey(cardId: string, squareIndex: number): string {
  return `${cardId}:${squareIndex}`;
}

export function summarizeCardState(card: BingoCard): {
  hitCount: number;
  nearWin: boolean;
  completedLines: number;
} {
  const byIndex = new Map<number, BingoCardSquare>();
  for (const square of card.squares) {
    byIndex.set(square.index, square);
  }

  const hitCount = card.squares.reduce((sum, square) => {
    if (square.isFree || square.status === "hit") {
      return sum + 1;
    }
    return sum;
  }, 0);

  let nearWin = false;
  let completedLines = 0;

  for (const line of LINE_PATTERNS) {
    let hits = 0;
    let misses = 0;
    let pending = 0;

    for (const index of line) {
      const square = byIndex.get(index);
      if (!square) {
        pending += 1;
        continue;
      }
      if (square.isFree || square.status === "hit") {
        hits += 1;
      } else if (square.status === "miss") {
        misses += 1;
      } else {
        pending += 1;
      }
    }

    if (hits === 5) {
      completedLines += 1;
    }
    if (hits === 4 && misses === 0 && pending === 1) {
      nearWin = true;
    }
  }

  return { hitCount, nearWin, completedLines };
}

export const BINGO_HEADER_LETTERS = [
  { letter: "B", color: "text-rose-300" },
  { letter: "I", color: "text-amber-300" },
  { letter: "N", color: "text-emerald-300" },
  { letter: "G", color: "text-sky-300" },
  { letter: "O", color: "text-violet-300" },
] as const;

// Closest 5-in-a-row remaining for the board: 0 means a line is complete (bingo),
// null means every line is blocked by a miss/void. Drives the "N to bingo" hint.
export function getClosestLineRemaining(squares: BingoCardSquare[]): number | null {
  const byIndex = new Map<number, BingoCardSquare>();
  for (const square of squares) {
    byIndex.set(square.index, square);
  }
  let best: number | null = null;
  for (const line of LINE_PATTERNS) {
    let hits = 0;
    let blocked = false;
    for (const index of line) {
      const square = byIndex.get(index);
      if (square && (square.isFree || square.status === "hit")) {
        hits += 1;
      } else if (square && (square.status === "miss" || square.status === "void")) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      continue;
    }
    const remaining = 5 - hits;
    if (best === null || remaining < best) {
      best = remaining;
    }
  }
  return best;
}

export function getBoardProgress(squares: BingoCardSquare[]): {
  hitCount: number;
  pctFilled: number;
  toBingo: number | null;
} {
  const hitCount = squares.reduce(
    (sum, square) => (square.isFree || square.status === "hit" ? sum + 1 : sum),
    0
  );
  return {
    hitCount,
    pctFilled: Math.round((hitCount / 25) * 100),
    toBingo: getClosestLineRemaining(squares),
  };
}


// How long after kickoff a board that is STILL flagged `active` is treated as a stale row
// rather than a running game. Moved here from `SportsBingoHome` in Phase 13 of
// `docs/prop-bingo-code-review-fix-plan.md` so the history-stack rule below can be unit tested
// against the same constant the page uses.
export const BINGO_GAME_BUFFER_MS = 6 * 60 * 60 * 1000;

// One row of the past-day ("history") board stack.
//
// Phase 13 fix (finding 1): the history stack used to hard-code `isLive: false` for every
// entry, on the assumption that a past calendar day can only hold finished games. It cannot —
// a 10pm game is still running at 12:05am, when its own `startsAt` day is already "yesterday",
// and it rendered there with a "Starts 10:00 PM" badge and opened the "Final Board" modal.
//
// The two questions are separate and both answered here, from the card itself rather than from
// which stack it came out of:
//   - stale row?  `active` more than `BINGO_GAME_BUFFER_MS` after kickoff -> normalize to
//     `lost`, exactly as the today-stack partition in `SportsBingoHome` does.
//   - live?       still `active` after that normalization AND already started.
// A malformed `startsAt` parses to NaN, which fails both comparisons: the card is left alone
// and treated as not live.
export function resolveHistoryStackEntry(
  card: BingoCard,
  now: number
): { card: BingoCard; isLive: boolean } {
  const startsAtMs = Date.parse(card.startsAt);
  const hasStarted = Number.isFinite(startsAtMs) && startsAtMs <= now;
  const looksInactiveByTime = Number.isFinite(startsAtMs) && now - startsAtMs >= BINGO_GAME_BUFFER_MS;
  const normalizedCard: BingoCard =
    card.status === "active" && looksInactiveByTime ? { ...card, status: "lost" } : card;
  return { card: normalizedCard, isLive: normalizedCard.status === "active" && hasStarted };
}

// Patch already-present past-day ("history") rows in place from a fresh live `cards` fetch.
//
// Phase 14.5 of `docs/prop-bingo-code-review-fix-plan.md`. `historyCards` is a one-shot,
// day-scoped SQL query that nothing updates again, so a board still running on its own (now
// past) calendar day shows a frozen square snapshot under the `Live` badge Phase 13 gave it.
// That same board is already in the dateless main fetch (`cards`) and already subscribed to its
// `card_updated` broadcast, so the fresh data is arriving — it just has nowhere to land. This
// merges it in by id.
//
// Contract (load-bearing for perf, not correctness — a headless pass will not catch a miss):
//   - patch BY ID, only rows already in `existing` — NEVER append. `existing` is a day-scoped
//     query result; a row from the dateless main fetch could belong to another calendar day,
//     and putting it on this day's stack is a worse bug than the frozen snapshot.
//   - when no incoming id matches an existing row, return `existing` BY IDENTITY, so the
//     `historyStackCards` memo does not churn on every broadcast for the overwhelmingly common
//     case: a past day holding only finished boards.
//   - when a row matches, take the incoming object wholesale — no deep compare. `BingoBoardCard`
//     compares the card by a content signature, not by reference, so a fresh identity for an
//     unchanged board still fails to re-render; only the cheap parent memos rebuild.
export function mergeLiveCardUpdates(existing: BingoCard[], incoming: BingoCard[]): BingoCard[] {
  if (existing.length === 0 || incoming.length === 0) {
    return existing;
  }
  const incomingById = new Map(incoming.map((card) => [card.id, card]));
  let changed = false;
  const merged = existing.map((card) => {
    const next = incomingById.get(card.id);
    if (next && next !== card) {
      changed = true;
      return next;
    }
    return card;
  });
  return changed ? merged : existing;
}

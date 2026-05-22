import "server-only";

export type ClosestGuessCandidate = {
  answerId: string;
  userId: string;
  username: string | null;
  submittedAnswer: string;
  normalizedAnswer: string;
  isCorrect: boolean;
  pointsAwarded: number;
};

export type ClosestGuessWinner = {
  answerId: string;
  userId: string;
  username: string;
  submittedAnswer: string;
  numericGuess: number;
  difference: number;
  isExact: boolean;
};

type ParsedGuess = {
  value: number;
  original: string;
};

function collapseWhitespace(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// Extracts a numeric value from free-form text, handling:
// - Comma-formatted numbers ("4,000")
// - Currency prefixes ("$42")
// - Word multipliers ("42 million", "3 billion", "10 thousand")
// - Unit suffixes that are discarded ("4,000 feet", "206 mph")
// Returns null if no valid number can be extracted.
export function extractNumericValue(text: string): number | null {
  const raw = collapseWhitespace(String(text ?? ""));
  if (!raw) return null;

  // Strip leading currency symbols.
  const stripped = raw.replace(/^[$€£¥]\s*/, "");

  // Find the first number token (with optional commas and decimal).
  const match = stripped.match(/[+-]?\d[\d,]*(?:\.\d+)?/);
  if (!match?.[0]) return null;

  const numericToken = match[0].replace(/,/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(numericToken)) return null;

  const base = Number(numericToken);
  if (!Number.isFinite(base)) return null;

  // Check for multiplier word immediately following the number.
  const afterNum = stripped.slice((match.index ?? 0) + match[0].length).trim().toLowerCase();
  if (/^billion\b/.test(afterNum)) return base * 1_000_000_000;
  if (/^million\b/.test(afterNum)) return base * 1_000_000;
  if (/^thousand\b/.test(afterNum)) return base * 1_000;

  return base;
}

export function parseLargePureNumberAnswer(correctTargetRaw: string): number | null {
  const raw = collapseWhitespace(correctTargetRaw);
  if (!raw) return null;

  const compact = raw.replace(/,/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(compact)) {
    return null;
  }

  const value = Number(compact);
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) < 100) return null;

  const digitCount = compact.replace(/[^\d]/g, "").length;
  if (digitCount < 3) return null;

  return value;
}

function parseNumericGuessFromText(valueRaw: string): ParsedGuess | null {
  const raw = collapseWhitespace(valueRaw);
  if (!raw) return null;

  // Try the enhanced extractor first (handles "4,000 feet", "$42 million", etc.)
  const extracted = extractNumericValue(raw);
  if (extracted !== null && Number.isFinite(extracted)) {
    return { value: extracted, original: raw };
  }

  // Narrow fallback: find any numeric token in the string.
  const match = raw.match(/[+-]?\d[\d,]*(?:\.\d+)?/);
  if (!match?.[0]) return null;

  const token = match[0].replace(/,/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(token)) return null;

  const value = Number(token);
  if (!Number.isFinite(value)) return null;

  return { value, original: raw };
}

export function computeClosestGuessWinners(
  rows: ClosestGuessCandidate[],
  correctNumericAnswer: number
): ClosestGuessWinner[] {
  const numericRows = rows
    .map((row) => {
      const parsed =
        parseNumericGuessFromText(row.submittedAnswer) ??
        parseNumericGuessFromText(row.normalizedAnswer);
      if (!parsed) return null;

      const difference = Math.abs(parsed.value - correctNumericAnswer);
      return {
        answerId: row.answerId,
        userId: row.userId,
        username: collapseWhitespace(row.username || "") || "Player",
        submittedAnswer: parsed.original,
        numericGuess: parsed.value,
        difference,
        isExact: difference === 0,
      } satisfies ClosestGuessWinner;
    })
    .filter((row): row is ClosestGuessWinner => Boolean(row));

  if (numericRows.length === 0) {
    return [];
  }

  const smallestDifference = Math.min(...numericRows.map((row) => row.difference));
  return numericRows.filter((row) => row.difference === smallestDifference);
}

function formatDifference(difference: number): string {
  if (difference === 0) return "exactly right";
  const formatted = difference.toLocaleString("en-US");
  return `off by ${formatted}`;
}

export function buildClosestGuessAnnouncement(
  winners: ClosestGuessWinner[],
  correctAnswerDisplay: string
): string | null {
  if (winners.length === 0) {
    return null;
  }

  const exactWinners = winners.filter((w) => w.isExact);

  if (exactWinners.length > 0) {
    if (exactWinners.length === 1) {
      const w = exactWinners[0]!;
      return `🎯 ${w.username} nailed the exact answer — ${correctAnswerDisplay}! PERFECT GUESS!`;
    }
    const names = exactWinners.map((w) => w.username).join(", ");
    return `🎯 ${names} ALL nailed it with ${correctAnswerDisplay} — GREAT MINDS THINK ALIKE!`;
  }

  const diff = formatDifference(winners[0]!.difference);
  const submission = winners[0]!.submittedAnswer;

  if (winners.length === 1) {
    const w = winners[0]!;
    return `🏆 ${w.username} was closest with ${submission}! ${diff.charAt(0).toUpperCase() + diff.slice(1)}. The exact answer was ${correctAnswerDisplay}.`;
  }

  const names = winners.map((w) => w.username).join(", ");
  return `🎯 ${names} TIED for closest with ${submission} — GREAT MINDS THINK ALIKE! The exact answer was ${correctAnswerDisplay}.`;
}

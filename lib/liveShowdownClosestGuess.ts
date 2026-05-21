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

export function buildClosestGuessAnnouncement(
  winners: ClosestGuessWinner[],
  correctAnswerDisplay: string
): string | null {
  if (winners.length === 0) {
    return null;
  }

  const exactWinners = winners.filter((winner) => winner.isExact);
  if (exactWinners.length > 0) {
    if (exactWinners.length === 1) {
      const winner = exactWinners[0];
      return `Amazing! ${winner.username} nailed the exact number: ${correctAnswerDisplay}.`;
    }
    const names = exactWinners.map((winner) => winner.username).join(", ");
    return `Amazing! ${names} nailed the exact number: ${correctAnswerDisplay}.`;
  }

  if (winners.length === 1) {
    const winner = winners[0];
    return `Nobody got the exact number! But congratulations to ${winner.username}, who got the closest with a guess of ${winner.submittedAnswer}! (The exact answer was ${correctAnswerDisplay}).`;
  }

  const names = winners.map((winner) => winner.username).join(", ");
  return `Nobody got the exact number! But congratulations to ${names}, who tied for the closest guesses! (The exact answer was ${correctAnswerDisplay}).`;
}

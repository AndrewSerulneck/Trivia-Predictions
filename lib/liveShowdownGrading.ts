import "server-only";

function isStandaloneNumber(value: string): boolean {
  return /^[+-]?\d+(?:\.\d+)?$/.test(value);
}

const WORD_TO_NUMBER = new Map<string, number>([
  ["zero", 0],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
  ["twenty", 20],
  ["thirty", 30],
  ["forty", 40],
  ["fifty", 50],
  ["sixty", 60],
  ["seventy", 70],
  ["eighty", 80],
  ["ninety", 90],
  ["hundred", 100],
]);

const UNIT_WORDS = new Set([
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
]);

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCaseAndWhitespace(value: string): string {
  return collapseWhitespace(String(value ?? "").toLowerCase().trim());
}

function flattenDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function stripPunctuationPossessivesAndHyphens(value: string): string {
  let normalized = value.replace(/[-_]+/g, " ");
  normalized = normalized.replace(/['’`]/g, "");
  normalized = normalized.replace(/[^a-z0-9\s]/g, " ");
  return collapseWhitespace(normalized);
}

function normalizeCommonAbbreviations(value: string): string {
  let normalized = ` ${value} `;
  normalized = normalized.replace(/\b(u s a|usa|u s|us|united states of america|united states)\b/g, " united states ");
  normalized = normalized.replace(/\b(u k|uk|united kingdom)\b/g, " united kingdom ");
  normalized = normalized.replace(/\btv\b/g, " television ");
  return collapseWhitespace(normalized);
}

function stripLeadingArticle(value: string): string {
  return value.replace(/^(the|a|an)\s+/, "").trim();
}

function normalizeSpelledNumbersToDigits(value: string): string {
  const tokens = value.split(" ").filter(Boolean);
  const output: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;

    if (isStandaloneNumber(token)) {
      output.push(String(Number(token)));
      continue;
    }

    if (token === "one" && tokens[i + 1] === "hundred") {
      output.push("100");
      i += 1;
      continue;
    }

    if (token === "hundred") {
      output.push("100");
      continue;
    }

    const maybeNumber = WORD_TO_NUMBER.get(token);
    if (maybeNumber === undefined) {
      output.push(token);
      continue;
    }

    if (maybeNumber >= 20 && maybeNumber % 10 === 0) {
      const next = tokens[i + 1];
      if (next && UNIT_WORDS.has(next)) {
        const nextValue = WORD_TO_NUMBER.get(next) ?? 0;
        output.push(String(maybeNumber + nextValue));
        i += 1;
        continue;
      }
    }

    output.push(String(maybeNumber));
  }

  return collapseWhitespace(output.join(" "));
}

function normalizeForTriviaComparison(value: string): string {
  let normalized = normalizeCaseAndWhitespace(value);
  normalized = flattenDiacritics(normalized);
  normalized = stripPunctuationPossessivesAndHyphens(normalized);
  normalized = normalizeCommonAbbreviations(normalized);
  normalized = stripLeadingArticle(normalized);
  normalized = normalizeSpelledNumbersToDigits(normalized);
  return collapseWhitespace(normalized);
}

function singularizeWord(value: string): string {
  if (value.length <= 3) return value;
  if (value.endsWith("ies") && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith("es") && value.length > 4) return value.slice(0, -2);
  if (value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);
  return value;
}

function arePluralizationVariants(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftTokens = left.split(" ").filter(Boolean);
  const rightTokens = right.split(" ").filter(Boolean);
  if (leftTokens.length !== rightTokens.length) return false;
  for (let i = 0; i < leftTokens.length; i += 1) {
    const l = leftTokens[i]!;
    const r = rightTokens[i]!;
    if (l === r) continue;
    if (singularizeWord(l) !== singularizeWord(r)) return false;
  }
  return true;
}

function damerauLevenshteinDistance(left: string, right: string): number {
  const leftLen = left.length;
  const rightLen = right.length;

  if (leftLen === 0) return rightLen;
  if (rightLen === 0) return leftLen;

  const matrix: number[][] = Array.from({ length: leftLen + 1 }, () => Array(rightLen + 1).fill(0));

  for (let i = 0; i <= leftLen; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= rightLen; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= leftLen; i += 1) {
    for (let j = 1; j <= rightLen; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const deletion = matrix[i - 1][j] + 1;
      const insertion = matrix[i][j - 1] + 1;
      const substitution = matrix[i - 1][j - 1] + cost;
      let best = Math.min(deletion, insertion, substitution);

      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      ) {
        best = Math.min(best, matrix[i - 2][j - 2] + 1);
      }

      matrix[i][j] = best;
    }
  }

  return matrix[leftLen][rightLen];
}

function isSimilarShortAnswer(left: string, right: string): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (arePluralizationVariants(left, right)) return true;

  const maxLen = Math.max(left.length, right.length);
  const distance = damerauLevenshteinDistance(left, right);
  const similarity = 1 - distance / maxLen;

  if (maxLen <= 4) {
    return distance <= 1;
  }
  if (maxLen <= 8) {
    return distance <= 2 || similarity >= 0.82;
  }
  return distance <= 3 || similarity >= 0.85;
}

export function gradeWriteInAnswer(userSubmitted: string, correctTarget: string): boolean {
  const targetRaw = String(correctTarget ?? "");
  const submittedRaw = String(userSubmitted ?? "");

  if (!targetRaw || !submittedRaw) {
    return false;
  }

  const normalizedTarget = normalizeForTriviaComparison(targetRaw);
  const normalizedSubmitted = normalizeForTriviaComparison(submittedRaw);
  if (!normalizedTarget || !normalizedSubmitted) {
    return false;
  }

  if (isStandaloneNumber(normalizedTarget) || isStandaloneNumber(normalizedSubmitted)) {
    return isStandaloneNumber(normalizedTarget) && isStandaloneNumber(normalizedSubmitted) && normalizedSubmitted === normalizedTarget;
  }

  return isSimilarShortAnswer(normalizedSubmitted, normalizedTarget);
}

export function normalizeWriteInForStorage(value: string): string {
  return normalizeForTriviaComparison(String(value ?? ""));
}

import "server-only";

function normalizeNumeric(value: string): string {
  return value
    .trim()
    .replace(/^[\s$€£¥₹]+/, "")
    .replace(/[.,!?;:]+$/g, "")
    .replace(/,/g, "")
    .trim();
}

function isStandaloneNumber(value: string): boolean {
  return /^[+-]?\d+(?:\.\d+)?$/.test(value);
}

function normalizeText(value: string): string {
  let normalized = value.toLowerCase();
  normalized = normalized.replace(/[^a-z0-9\s]/g, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();
  normalized = normalized.replace(/^(the|a|an)\s+/i, "");
  return normalized.trim();
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

  const maxLen = Math.max(left.length, right.length);
  const distance = damerauLevenshteinDistance(left, right);
  const similarity = 1 - distance / maxLen;

  if (maxLen <= 4) {
    return distance <= 1;
  }
  if (maxLen <= 8) {
    return distance <= 1 || similarity >= 0.85;
  }
  return distance <= 2 || similarity >= 0.88;
}

export function gradeWriteInAnswer(userSubmitted: string, correctTarget: string): boolean {
  const targetRaw = String(correctTarget ?? "").trim();
  const submittedRaw = String(userSubmitted ?? "").trim();

  if (!targetRaw || !submittedRaw) {
    return false;
  }

  const targetNumeric = normalizeNumeric(targetRaw);
  if (isStandaloneNumber(targetNumeric)) {
    const submittedNumeric = normalizeNumeric(submittedRaw);
    return isStandaloneNumber(submittedNumeric) && submittedNumeric === targetNumeric;
  }

  const normalizedTarget = normalizeText(targetRaw);
  const normalizedSubmitted = normalizeText(submittedRaw);
  if (!normalizedTarget || !normalizedSubmitted) {
    return false;
  }

  return isSimilarShortAnswer(normalizedSubmitted, normalizedTarget);
}

export function normalizeWriteInForStorage(value: string): string {
  return normalizeText(String(value ?? ""));
}

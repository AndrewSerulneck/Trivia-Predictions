import "server-only";

/**
 * Shared env-var number parsing. Falls back only on `Number.isFinite` failure, never on a
 * falsy-but-valid `0`. Extracted from the four call-sites that had independently reinvented this
 * shape (`lib/sportsBingo.ts`'s `intFromEnv`, `cacheMsInWindow`, `wnbaConfigNumber`, plus the bare
 * `?? default` sites Phase 4 of docs/prop-bingo-code-review-fix-plan.md left untouched) — see
 * Phase A of docs/prop-bingo-out-of-scope-followup-plan.md.
 */
export const intFromEnv = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const floatFromEnv = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};

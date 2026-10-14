// Category Blitz alliteration bonus — the ONE home of the rule (Andrew,
// 2026-10-14, docs/category-blitz-how-to-play-plan.md §2). Pure: no
// "server-only", no Supabase — scoreRound (server) and the results/grading UI
// (client) both import it so the bonus they compute can never disagree.

/** Extra points for an alliterative answer, in BOTH modes. */
export const ALLITERATION_BONUS_POINTS = 1;

/**
 * True when every word of the answer starts with the round's letter and there
 * are at least two words ("Prickly Pear" for P). Words split on whitespace and
 * hyphens ("Peanut-Pie" is two words); punctuation is stripped from each word
 * and a word that is only punctuation ("&") is ignored. A leading "the"/"a"/"an"
 * is dropped first, exactly as answerStartsWithLetter does — so "The Pink
 * Panther" counts for P. Case-insensitive.
 */
export const isAlliterativeAnswer = (answer: string, letter: string): boolean => {
  const target = letter.trim().toLowerCase();
  if (target.length !== 1) return false;
  const stripped = answer.trim().toLowerCase().replace(/^(the|a|an)\s+/, "");
  const words = stripped
    .split(/[\s\-‐-―]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word.length > 0);
  return words.length >= 2 && words.every((word) => word.charAt(0) === target);
};

/**
 * The alliteration bonus for one answer: ALLITERATION_BONUS_POINTS only when the
 * answer scores (`points > 0` — standard: unique + valid; Majority Rules: passed
 * moderation + right letter + crowd points) and is alliterative. Never applied
 * to a 0-point answer, including every answer in a round below the player minimum.
 *
 * scoreRound passes the base points to decide the award; the UI passes the
 * stored `pointsAwarded` to tell how much of it was the bonus — the same answer
 * gives the same verdict both ways, so no extra column or API field is needed.
 */
export const alliterationBonus = (answer: string, letter: string, points: number): number =>
  points > 0 && isAlliterativeAnswer(answer, letter) ? ALLITERATION_BONUS_POINTS : 0;

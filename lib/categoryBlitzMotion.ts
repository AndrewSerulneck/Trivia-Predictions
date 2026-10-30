// Shared Framer Motion layout identifiers for the Category Blitz round-start
// morph. The letter badge and each category row carry the SAME layoutId in
// both RoundStartReveal (the reveal animation) and AnsweringScreen (the live
// gameplay form), so Framer Motion can perform a shared-element ("magic move")
// transition — morphing the reveal's big centered badge + category cascade
// directly into the gameplay header badge + input rows instead of a hard cut.
//
// Phase 2 (structural unification) wires these IDs and aligns the two screens'
// DOM shape. Phase 3 wraps the swap in LayoutGroup/AnimatePresence so the
// morph actually plays across the reveal → gameplay handoff.

/** layoutId for the round's letter badge, shared by reveal + gameplay. */
export const CB_LETTER_BADGE_LAYOUT_ID = "cb-letter-badge";

/** layoutId for a category row at a given index, shared by reveal + gameplay. */
export const cbCategoryRowLayoutId = (index: number): string => `cb-cat-row-${index}`;

/** The category cascade's timing (seconds), shared by RoundStartReveal's rows
 *  and AnsweringScreen's rows when they cascade in straight out of the letter
 *  die (docs/category-blitz-letter-die-plan.md, Phase 4). */
export const CB_ROW_CASCADE_STAGGER_S = 0.06;
export const CB_ROW_CASCADE_DURATION_S = 0.3;
/** The same row fade under Reduce Motion: opacity only, no travel. */
export const CB_ROW_CASCADE_REDUCED_DURATION_S = 0.2;
/** Out of the die the rows start while the letter is still flying to the badge. */
export const CB_ROW_CASCADE_AFTER_DIE_DELAY_S = 0.15;

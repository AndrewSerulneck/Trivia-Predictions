// The smallest text this app may render, players and partners alike (Andrew, 2026-10-07:
// "text cannot be so small that mobile users can't read it").
//
// One home for the numbers: tailwind.config.ts builds the font-size tokens from them and
// tests/text-size-floor-contract.test.ts fails the build on anything smaller.
//
// Two traps the tokens exist for:
// - Phones ≤380px wide set `html { font-size: 13px }` (app/globals.css), so every rem size
//   shrinks there — plain `text-xs` (0.75rem) was 9.75px. The Tailwind `xs`/`sm` sizes are
//   therefore floored with `max()`.
// - Inside a venue game, `.tp-game-page .tp-page-main .text-xs` is inflated to 1.2rem, so
//   dense game UI can't use `text-xs` for small labels. `text-caption` / `text-footnote` are
//   fixed px class names that override does not touch, and they are the smallest sizes allowed.

/** No text below this, ever. */
export const MIN_TEXT_PX = 12;

/** Root font size on the smallest phones (the `max-width: 380px` rule in app/globals.css). */
export const SMALLEST_ROOT_PX = 13;

/** Fixed sizes for dense UI. Use these instead of an arbitrary `text-[Npx]`. */
export const FIXED_TEXT_SIZES = {
  caption: `${MIN_TEXT_PX}px`,
  footnote: "13px",
} as const;

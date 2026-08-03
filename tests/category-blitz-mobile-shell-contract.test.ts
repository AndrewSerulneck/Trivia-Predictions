import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// This suite asserts CONTRACTS — product/compliance decisions and falsified-strategy
// guardrails that must survive any future refactor — not the exact implementation of the
// v8 ("cbz-portal-visual-frame-v8") layout strategy. The original version of this file
// pinned source-string literals (the debug marker version, exact CSS var class names, the
// exact grid-template string, `onPointerDown`/`preventDefault`, `focus({ preventScroll })`,
// and a hard requirement that `body.tp-category-blitz-game-active` use `position: fixed`).
// Every one of those failed on a legitimate change and had to be re-litigated per attempt —
// see docs/category-blitz-app-feel-plan.md ("What the code actually shows", Phase 1) for
// the full rationale. Keep new assertions here scoped to behavior/decisions, not strings
// that happen to appear in today's implementation.

const appShellSource = readFileSync(
  path.resolve(process.cwd(), "components/ui/AppShell.tsx"),
  "utf8"
);
const gameLandingSource = readFileSync(
  path.resolve(process.cwd(), "components/venue/GameLandingExperience.tsx"),
  "utf8"
);
const playShellSource = readFileSync(
  path.resolve(process.cwd(), "components/category-blitz/CategoryBlitzPlayShell.tsx"),
  "utf8"
);
const playPageSource = readFileSync(
  path.resolve(process.cwd(), "app/category-blitz/play/page.tsx"),
  "utf8"
);
const categoryBlitzSource = readFileSync(
  path.resolve(process.cwd(), "components/category-blitz/CategoryBlitzGame.tsx"),
  "utf8"
);
const globalsSource = readFileSync(
  path.resolve(process.cwd(), "app/globals.css"),
  "utf8"
);
const mobileAdhesionAdSource = readFileSync(
  path.resolve(process.cwd(), "components/ui/MobileAdhesionAd.tsx"),
  "utf8"
);

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("Category Blitz mobile shell contract", () => {
  it("treats Category Blitz as a fullscreen game route with no shell footer padding", () => {
    const fullscreenPaths = sourceBetween(appShellSource, "const FULLSCREEN_PATHS = [", "];");
    const gameScreenPaths = sourceBetween(appShellSource, "const GAME_SCREEN_PATHS = [", "];");
    const gameScreenMainBranch = sourceBetween(appShellSource, ": isGameScreen", ": isFullscreen");

    expect(fullscreenPaths).toContain("\"/category-blitz\"");
    expect(gameScreenPaths).toContain("\"/category-blitz\"");
    expect(gameScreenMainBranch).toContain("\"h-full min-h-0 overflow-hidden p-0\"");
    expect(gameScreenMainBranch).not.toContain("pb-24");
  });

  it("keeps the legal notice out of fullscreen game routes but shows it everywhere else non-admin", () => {
    // Code review round 3 phase 7: the prior version of this test locked in a
    // regression (commit 35115fc narrowed the notice to venue-home-only by
    // accident). Confirmed with the user that the narrowing was unintended;
    // the notice must render on every non-admin, non-fullscreen route. This is
    // a compliance decision — do not narrow it again without a separately
    // verified decision (components/ui/AppShell.tsx:42-55).
    expect(appShellSource).toContain(
      "export function shouldShowLegalNotice(pathname: string | null | undefined): boolean {"
    );
    expect(appShellSource).toContain("const showLegalNotice = shouldShowLegalNotice(pathname);");
    expect(appShellSource).toContain("{showLegalNotice ? (");
  });

  it("renders Category Blitz gameplay through a dark, dedicated play shell", () => {
    // Phase 3 of the app-feel plan: `/category-blitz/play` no longer goes through
    // GameLandingExperience/PageShell. The contract is that the play route's shell is
    // dark and carries no branded background layer — GameLandingExperience paints a
    // fixed, full-viewport `#a10d63` layer that never shrinks for the iOS keyboard, so
    // any sizing gap under it showed magenta (Findings F/G). Not asserting the exact
    // container classes; Phase 4 still owns how the frame tracks the keyboard.
    // Asserted on imports, not on prose — both files document at length *why* they
    // don't use these, so a bare substring check would fail on the comments.
    expect(playPageSource).toContain("CategoryBlitzPlayShell");
    expect(playPageSource).not.toMatch(/^import .*GameLandingExperience/m);
    expect(playShellSource).toContain("bg-slate-950");
    expect(playShellSource).not.toMatch(/^import .*(PageShell|GameLandingExperience|GameIdentityPanel)/m);

    // GameLandingExperience must go back to being generic — a Category Blitz special
    // case there means the two shells can drift apart again.
    expect(gameLandingSource).not.toContain("category-blitz\" ? (");
    expect(gameLandingSource).not.toContain("isCategoryBlitzGame");
    expect(gameLandingSource).not.toContain("data-category-blitz-route-shell");
  });

  it("keeps the play shell's non-visual wiring intact", () => {
    // These all failed silently rather than visually when Phase 3 replaced the route
    // shell: presence gating is what authorizes answer submissions, the analytics
    // session bounds a play session, and the return transition + navigateBackToVenue
    // are the only way out of a fullscreen game route.
    expect(playShellSource).toContain("VenuePresenceBoundary");
    expect(playShellSource).toContain("startGameSession(");
    expect(playShellSource).toContain("endCurrentGameSession(");
    expect(playShellSource).toContain("markOnboardingComplete(");
    expect(playShellSource).toContain("runVenueGameReturnTransition(");
    expect(playShellSource).toContain("navigateBackToVenue(");
    // runVenueGameReturnTransition animates `[data-venue-game-surface]` — without this
    // marker the back button silently degrades to a hard navigation.
    expect(playShellSource).toContain("data-venue-game-surface");
  });

  it("types directly into each answer row, with no duplicate pinned editor", () => {
    // REVERSED DELIBERATELY, Phase 8 round 2 (2026-08-03), on Andrew's explicit
    // call. This suite used to assert the opposite — one shared editor pinned
    // above the keyboard, zero inputs in the rows — which came from attempt #2
    // in docs/category-blitz-claude-code-handoff.md ("stop Safari panning the
    // page to reveal focused row inputs"). That attempt ALSO failed on device,
    // so removing the row inputs was never validated as necessary; the actual
    // cause was the magenta backdrop (Findings F/G), fixed in Phases 3-5. What
    // the pinned editor did cost was a visible duplicate of the active row
    // sitting above the keyboard, which is what this change removes.
    //
    // The page-pan risk it was hedging against is now covered structurally
    // instead of architecturally: html/body are `overflow: hidden` with
    // `overscroll-behavior: none`, the game is a fixed backdrop + frame, focus
    // uses `preventScroll: true`, and both the harness and the test below
    // assert `window.scrollY === 0` / no `.scrollIntoView(`.
    expect(categoryBlitzSource).toContain("data-category-blitz-answer-input");
    expect(categoryBlitzSource).toContain("data-category-blitz-answer-row");
    // The duplicate is gone for good: no pinned editor, and the footer that
    // replaced it holds no input at all.
    expect(categoryBlitzSource).not.toContain("data-category-blitz-editor-input=");
    // A row input under 16px makes iOS zoom the page on focus — the one thing
    // about the row-input approach that genuinely would reproduce this plan's
    // reported corruption. Phase 6 pinned this for the old editor; it matters
    // more now that there are twelve of them.
    expect(categoryBlitzSource).toContain("text-base");

    // Guardrails: strategies explicitly falsified in
    // docs/category-blitz-claude-code-handoff.md — do not repeat any of these
    // without a deliberately isolated experiment.
    expect(categoryBlitzSource).not.toContain("data-category-blitz-keyboard-input");
    expect(categoryBlitzSource).not.toContain("data-category-blitz-pinned-editor");
    expect(categoryBlitzSource).not.toContain("data-category-blitz-keyboard-shield");
    expect(categoryBlitzSource).not.toContain("data-category-blitz-keyboard-mode");
    expect(categoryBlitzSource).not.toContain("function useCategoryBlitzKeyboardState");
    expect(categoryBlitzSource).not.toContain("--cbz-keyboard-inset");
  });

  it("scrolls active answers inside the answer list instead of the page", () => {
    expect(categoryBlitzSource).toContain("data-category-blitz-answer-list");
    expect(categoryBlitzSource).toContain("data-category-blitz-answer-row");
    expect(categoryBlitzSource).not.toContain(".scrollIntoView(");

    // Phase 4: every answer-list correction is `behavior: "auto"`. A smooth scroll
    // animating against the iOS keyboard's own animation is the jank this replaced —
    // the pre-Phase-4 path fired up to six overlapping smooth scrolls per tap.
    expect(categoryBlitzSource).not.toContain("\"smooth\"");
  });

  it("paints a full layout-viewport backdrop under the keyboard-tracking frame", () => {
    // Phase 4, Finding F. The game is two elements on purpose. The backdrop is
    // `fixed inset-0`, i.e. the whole LAYOUT viewport, which iOS never shrinks for the
    // keyboard — so it is painted game-dark in every keyboard state and any sizing gap
    // in the frame above it can only ever expose that dark, never the page beneath.
    // Collapsing these back into one viewport-sized element is what let the magenta
    // band through for six attempts; that is the decision under test, not the classes.
    expect(categoryBlitzSource).toContain("data-category-blitz-game-root");
    expect(categoryBlitzSource).toContain("data-category-blitz-visible-frame");
    const backdropClass = sourceBetween(
      categoryBlitzSource,
      "const BACKDROP_CLASS =",
      ";"
    );
    expect(backdropClass).toContain("fixed");
    expect(backdropClass).toContain("inset-0");
    expect(backdropClass).toMatch(/bg-slate-950/);
  });

  it("offsets the visible frame with a transform rather than layout properties", () => {
    // Phase 4. `top`/`left` on a fixed element are layout properties: on iOS they land a
    // frame or more behind the keyboard animation, which is a torn frame by itself. A
    // transform is composited and lands on the same frame. Attempts 1-6 all used
    // `top`/`height`; this is the one mechanism that has not been tried.
    const frameRule = sourceBetween(globalsSource, ".tp-cbz-visible-frame {", "}");
    expect(frameRule).toContain("transform: translate3d(");
    expect(frameRule).toContain("var(--cbz-visible-left");
    expect(frameRule).toContain("var(--cbz-visible-top");
    expect(frameRule).not.toMatch(/^\s*(top|left):/m);

    const visibleFrameClass = sourceBetween(
      categoryBlitzSource,
      "const VISIBLE_FRAME_CLASS =",
      ";"
    );
    expect(visibleFrameClass).toContain("tp-cbz-visible-frame");
    expect(visibleFrameClass).not.toContain("[top:var(--cbz-visible-top");
    expect(visibleFrameClass).not.toContain("[left:var(--cbz-visible-left");
  });

  it("locks the page background/scroll while Category Blitz gameplay is mounted", () => {
    // Product requirement: the venue/game background must never show through, and the
    // page itself must not scroll, while a game is active. Not asserting the specific
    // CSS mechanism (position: fixed vs. overflow: hidden alone) — Phase 4 of the
    // app-feel plan explicitly plans to drop `body { position: fixed }` in favor of a
    // plain overflow lock, per Suspicion C in the handoff.
    expect(categoryBlitzSource).toContain("tp-category-blitz-game-active");
    expect(globalsSource).toContain("html.tp-category-blitz-game-active");
    expect(globalsSource).toContain("body.tp-category-blitz-game-active");
    expect(globalsSource).toContain("background-color: #020617 !important;");
    expect(globalsSource).toContain("overflow: hidden !important;");

    // Guardrail: the stable-frame/layout-height strategy is falsified — do not
    // reintroduce a keyboard-closed locked height.
    expect(globalsSource).not.toContain("height: var(--cbz-layout-height");
    expect(categoryBlitzSource).not.toContain("--cbz-layout-height");
    expect(categoryBlitzSource).not.toContain("resetStableFrame");
  });

  it("marks answer rows that still hold a live layout-projection node, and clears them after the reveal morph settles", () => {
    // Phase 2 added `data-category-blitz-row-projected` as the direct Finding A
    // regression signal, precisely because Phase 2's own device-verification found
    // that comparing row rects alone does NOT distinguish a projected row from a
    // plain one in headless Chromium (Framer only re-measures on React commits, and
    // a keyboard-simulated resize doesn't move row rects at all — the answer list
    // absorbs the height change). The rect-delta check below is the indirect,
    // Playwright-side half of Finding A's coverage; this marker is the direct half,
    // and it must exist for Phase 7's harness to be able to assert on it at all.
    expect(categoryBlitzSource).toContain("data-category-blitz-row-projected");
    expect(categoryBlitzSource).toContain("morphActive");
    expect(categoryBlitzSource).toContain("LAYOUT_MORPH_SETTLE_MS");
  });

  it("memoizes AnsweringScreen and its answer rows so a timer tick doesn't rebuild all twelve", () => {
    // Phase 6: a 4 Hz `nowMs` tick used to rebuild the whole answering screen,
    // including every row, while the user was mid-keystroke. Guard the memo
    // boundaries themselves — the behavioral checks (no dropped characters, no
    // caret jumps) live in the Playwright harness, but if these wrappers are
    // stripped in a later refactor, that regression won't show up until someone
    // notices typing feels bad on device again.
    expect(categoryBlitzSource).toMatch(/const AnswerRow = memo\(/);
    expect(categoryBlitzSource).toMatch(/export const AnsweringScreen = memo\(/);
  });

  it("excludes Category Blitz from the global mobile ad banner", () => {
    // Phase 5 / Finding C: MobileAdhesionAd's `global` fallback had no
    // `/category-blitz` case, so an untargeted ad banner could mount at
    // `z-[1600]` — above the game portal, above the keyboard — on this route.
    expect(mobileAdhesionAdSource).toContain("isAdExcludedRoute");
    expect(mobileAdhesionAdSource).toMatch(
      /isAdExcludedRoute[\s\S]{0,80}pathname\?\.startsWith\("\/category-blitz"\)/
    );
    const adminGuardCount = (
      mobileAdhesionAdSource.match(/isAdminRoute\(pathname\)/g) ?? []
    ).length;
    const excludedGuardCount = (
      mobileAdhesionAdSource.match(/isAdExcludedRoute\(pathname\)/g) ?? []
    ).length;
    // Every gate that checks isAdminRoute must also check isAdExcludedRoute —
    // a new gate added later without the pairing would silently reopen Finding C.
    expect(excludedGuardCount).toBeGreaterThanOrEqual(adminGuardCount);
  });
});

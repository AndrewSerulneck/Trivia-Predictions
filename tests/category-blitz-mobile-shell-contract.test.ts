import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appShellSource = readFileSync(
  path.resolve(process.cwd(), "components/ui/AppShell.tsx"),
  "utf8"
);
const gameLandingSource = readFileSync(
  path.resolve(process.cwd(), "components/venue/GameLandingExperience.tsx"),
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

  it("keeps the legal notice venue-home-only and out of fullscreen game routes", () => {
    expect(appShellSource).toContain("const isVenueHome = /^\\/venue\\/[^/]+\\/?$/.test(pathname ?? \"\");");
    expect(appShellSource).toContain("const showLegalNotice = !isAdmin && isVenueHome;");
    expect(appShellSource).toContain("{showLegalNotice ? (");
  });

  it("pins Category Blitz to an explicit visual viewport frame", () => {
    const categoryBranch = sourceBetween(
      gameLandingSource,
      "gameKey === \"category-blitz\" ? (",
      ") : ("
    );

    expect(categoryBranch).toContain("h-[100svh]");
    expect(categoryBranch).toContain("overflow-hidden");
    expect(categoryBranch).not.toContain("var(--tp-vh");
    expect(categoryBlitzSource).toContain("const VIEWPORT_FRAME_CLASS");
    expect(categoryBlitzSource).toContain("top-[var(--cbz-vv-top,0px)]");
    expect(categoryBlitzSource).toContain("h-[var(--cbz-vv-height,100svh)]");
    expect(categoryBlitzSource).toContain("w-[var(--cbz-vv-width,100vw)]");
    expect(categoryBlitzSource).toContain("function useCategoryBlitzViewportFrame");
    expect(categoryBlitzSource).toContain("--cbz-vv-stable-height");
    expect(categoryBlitzSource).toContain("applyCategoryBlitzViewportFrame({ resetStableFrame: true })");
    expect(categoryBlitzSource).toContain("window.visualViewport?.addEventListener(\"resize\", scheduleCurrent");
    expect(categoryBlitzSource).toContain("window.visualViewport?.addEventListener(\"scroll\", scheduleCurrent");
  });

  it("uses one fixed keyboard-capture input instead of native inputs in answer rows", () => {
    const answerGridSource = sourceBetween(
      categoryBlitzSource,
      "{/* Categories grid */}",
      "{/* Autosave footnote"
    );

    expect(categoryBlitzSource).toContain("keyboardInputRef");
    expect(categoryBlitzSource).toContain("activeAnswerIndexRef");
    expect(categoryBlitzSource).toContain("data-category-blitz-keyboard-input");
    expect(categoryBlitzSource).toContain("focus({ preventScroll: true })");
    expect(categoryBlitzSource).not.toContain("disabled={isExpired || submitState !== \"idle\" || activeAnswerIndex === null}");
    expect(answerGridSource).toContain("onPointerDown={(event) => {");
    expect(answerGridSource).toContain("event.preventDefault();");
    expect(answerGridSource).not.toContain("<input");
  });

  it("scrolls active answers inside the answer list instead of the page", () => {
    expect(categoryBlitzSource).toContain("const scrollAnswerIntoView = useCallback");
    expect(categoryBlitzSource).toContain("answerListRef");
    expect(categoryBlitzSource).toContain("data-category-blitz-answer-list");
    expect(categoryBlitzSource).toContain("data-category-blitz-answer-row");
    expect(categoryBlitzSource).toContain("list.scrollBy({ top: delta, behavior });");
    expect(categoryBlitzSource).not.toContain(".scrollIntoView(");
  });

  it("body-locks only while Category Blitz gameplay is mounted", () => {
    expect(categoryBlitzSource).toContain("tp-category-blitz-game-active");
    expect(globalsSource).toContain("html.tp-category-blitz-game-active");
    expect(globalsSource).toContain("body.tp-category-blitz-game-active");
    expect(globalsSource).toContain("overflow: hidden !important;");
  });

  it("provides an opt-in layout diagnostic for real-device keyboard debugging", () => {
    expect(categoryBlitzSource).toContain("const LAYOUT_DEBUG_VERSION = \"cbz-stable-frame-v5\";");
    expect(categoryBlitzSource).toContain("data-category-blitz-layout-version={LAYOUT_DEBUG_VERSION}");
    expect(categoryBlitzSource).toContain("function CategoryBlitzLayoutDebugPanel");
    expect(categoryBlitzSource).toContain("params.get(\"cbzDebug\") === \"1\"");
    expect(categoryBlitzSource).toContain("data-category-blitz-layout-debug");
    expect(categoryBlitzSource).toContain("answerListInputCount");
    expect(categoryBlitzSource).toContain("visualOffsetTop");
    expect(categoryBlitzSource).toContain("viewportFrame");
  });
});

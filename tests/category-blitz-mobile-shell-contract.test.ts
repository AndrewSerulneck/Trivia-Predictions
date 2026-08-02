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

  it("renders Category Blitz gameplay through a dark inert route shell and body portal", () => {
    const categoryBranch = sourceBetween(
      gameLandingSource,
      "gameKey === \"category-blitz\" ? (",
      ") : ("
    );

    expect(gameLandingSource).toContain("data-category-blitz-route-shell={isCategoryBlitzGame ? \"\" : undefined}");
    expect(gameLandingSource).toContain("isCategoryBlitzGame && isPlaying ? \"bg-slate-950\"");
    expect(categoryBranch).toContain("h-[100svh]");
    expect(categoryBranch).toContain("overflow-hidden");
    expect(categoryBranch).toContain("bg-slate-950");
    expect(categoryBranch).not.toContain("var(--cbz-layout-height");
    expect(categoryBranch).not.toContain("var(--tp-vh");
    expect(categoryBlitzSource).toContain("import { createPortal } from \"react-dom\";");
    expect(categoryBlitzSource).toContain("const renderGamePortal = (content: ReactNode): ReactNode =>");
    expect(categoryBlitzSource).toContain("createPortal(content, document.body)");
  });

  it("sizes Category Blitz to the current visual viewport instead of preserving keyboard-closed height", () => {
    expect(categoryBlitzSource).toContain("const VIEWPORT_FRAME_CLASS");
    expect(categoryBlitzSource).toContain("[top:var(--cbz-visible-top,0px)]");
    expect(categoryBlitzSource).toContain("[left:var(--cbz-visible-left,0px)]");
    expect(categoryBlitzSource).toContain("h-[var(--cbz-visible-height,100svh)]");
    expect(categoryBlitzSource).toContain("w-[var(--cbz-visible-width,100vw)]");
    expect(categoryBlitzSource).toContain("function useCategoryBlitzVisibleViewportFrame");
    expect(categoryBlitzSource).toContain("root.style.setProperty(\"--cbz-visible-height\"");
    expect(categoryBlitzSource).toContain("window.visualViewport?.addEventListener(\"resize\", schedule");
    expect(categoryBlitzSource).toContain("window.visualViewport?.addEventListener(\"scroll\", schedule");
    expect(categoryBlitzSource).not.toContain("--cbz-layout-height");
    expect(categoryBlitzSource).not.toContain("resetStableFrame");
  });

  it("uses one normal-flow editor input instead of native inputs in answer rows", () => {
    const answerGridSource = sourceBetween(
      categoryBlitzSource,
      "{/* Categories grid */}",
      "<div\n        data-category-blitz-editor"
    );
    const answeringRootSource = sourceBetween(
      categoryBlitzSource,
      "return (\n    <div className=\"relative grid",
      "{/* Categories grid */}"
    );

    expect(categoryBlitzSource).toContain("editorInputRef");
    expect(categoryBlitzSource).toContain("activeAnswerIndexRef");
    expect(categoryBlitzSource).toContain("grid-rows-[auto_auto_minmax(0,1fr)_auto]");
    expect(categoryBlitzSource).toContain("data-category-blitz-editor");
    expect(categoryBlitzSource).toContain("data-category-blitz-editor-input");
    expect(categoryBlitzSource).toContain("focus({ preventScroll: true })");
    expect(categoryBlitzSource).toContain("value={activeAnswerValue}");
    expect(answeringRootSource).not.toContain("fixed inset-x-0");
    expect(categoryBlitzSource).not.toContain("data-category-blitz-keyboard-input");
    expect(categoryBlitzSource).not.toContain("data-category-blitz-pinned-editor");
    expect(categoryBlitzSource).not.toContain("data-category-blitz-keyboard-shield");
    expect(categoryBlitzSource).not.toContain("data-category-blitz-keyboard-mode");
    expect(categoryBlitzSource).not.toContain("function useCategoryBlitzKeyboardState");
    expect(categoryBlitzSource).not.toContain("--cbz-keyboard-inset");
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
    expect(globalsSource).toContain("background-color: #020617 !important;");
    expect(globalsSource).toContain("body.tp-category-blitz-game-active");
    expect(globalsSource).toContain("position: fixed !important;");
    expect(globalsSource).toContain("overflow: hidden !important;");
    expect(globalsSource).not.toContain("height: var(--cbz-layout-height");
  });

  it("provides an opt-in layout diagnostic for real-device keyboard debugging", () => {
    expect(categoryBlitzSource).toContain("const LAYOUT_DEBUG_VERSION = \"cbz-portal-visual-frame-v8\";");
    expect(categoryBlitzSource).toContain("data-category-blitz-layout-version={LAYOUT_DEBUG_VERSION}");
    expect(categoryBlitzSource).toContain("data-category-blitz-game-root");
    expect(categoryBlitzSource).toContain("function CategoryBlitzLayoutDebugPanel");
    expect(categoryBlitzSource).toContain("params.get(\"cbzDebug\") === \"1\"");
    expect(categoryBlitzSource).toContain("data-category-blitz-layout-debug");
    expect(categoryBlitzSource).toContain("answerListInputCount");
    expect(categoryBlitzSource).toContain("editorInputCount");
    expect(categoryBlitzSource).toContain("visualOffsetLeft");
    expect(categoryBlitzSource).toContain("visualOffsetTop");
    expect(categoryBlitzSource).toContain("viewportFrame");
    expect(categoryBlitzSource).toContain("bodyBackground");
    expect(categoryBlitzSource).toContain("shellBackground");
    expect(categoryBlitzSource).toContain("routeRect");
    expect(categoryBlitzSource).toContain("rootRect");
    expect(categoryBlitzSource).toContain("editorRect");
  });
});

"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  legalNotice: string;
};

// All routes that should fill the full viewport with zero AppShell padding or footer.
const FULLSCREEN_PATHS = [
  "/trivia",
  "/category-blitz",
  "/bingo",
  "/pickem",
  "/fantasy",
  "/predictions",
  "/venue/",
  "/active-games",
  "/pending-challenges",
  "/info",
  "/coming-soon",
];

// Subset of fullscreen routes that are pure game screens — these need a dark
// background so the underlying page never bleeds through when the soft keyboard
// shrinks the visual viewport. The venue hub is fullscreen but not a game screen;
// it sits on the body's natural background and sets its own surface colors.
const GAME_SCREEN_PATHS = [
  "/trivia",
  "/category-blitz",
  "/bingo",
  "/pickem",
  "/fantasy",
  "/predictions",
  "/active-games",
  "/pending-challenges",
];

// Legal/geofence/commercial-license notice must render on every non-admin,
// non-fullscreen route (e.g. /info, /join, /owner/*), not just the venue
// home page. Commit 35115fc narrowed this to venue-home-only by accident
// (bundled into an unrelated layout refactor); code-review round 3 phase 7
// confirmed with the user that the narrowing was unintended and restored
// the original scope. Do not narrow this again without an explicit,
// separately-verified compliance decision. Exported as a pure function so
// the invariant is testable without a DOM-rendering harness (this project
// has none).
export function shouldShowLegalNotice(pathname: string | null | undefined): boolean {
  const isAdmin = pathname?.startsWith("/admin");
  const isFullscreen = !isAdmin && FULLSCREEN_PATHS.some((p) => pathname?.startsWith(p));
  return !isAdmin && !isFullscreen;
}

export function AppShell({ children, legalNotice }: AppShellProps) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");
  const isFullscreen = !isAdmin && FULLSCREEN_PATHS.some((p) => pathname?.startsWith(p));
  const isGameScreen = !isAdmin && GAME_SCREEN_PATHS.some((p) => pathname?.startsWith(p));
  const showShellDecor = !isAdmin && !isFullscreen;
  const showLegalNotice = shouldShowLegalNotice(pathname);
  const mainClassName = isAdmin
    ? "h-full min-h-0"
    : isGameScreen
    ? "h-full min-h-0 overflow-hidden p-0"
    : isFullscreen
    ? "min-h-0 p-0"
    : "flex-1 pb-24";

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    if (isAdmin) {
      html.classList.add("tp-admin-theme");
      body.classList.add("tp-admin-theme");
    } else {
      html.classList.remove("tp-admin-theme");
      body.classList.remove("tp-admin-theme");
    }

    return () => {
      html.classList.remove("tp-admin-theme");
      body.classList.remove("tp-admin-theme");
    };
  }, [isAdmin]);

  return (
    <div
      className={`tp-app-shell relative w-full ${
        isAdmin
          ? "fixed inset-0 h-screen w-screen max-w-full p-0 m-0 gap-0 overflow-hidden"
          : isGameScreen
          ? "h-[100svh] min-h-[100svh] max-h-[100svh] overflow-hidden bg-slate-950"
          : isFullscreen
          ? ""
          : "mx-auto flex flex-col max-w-[720px] box-border overflow-x-hidden overflow-y-visible"
      }`}
      style={isAdmin || isFullscreen ? undefined : { minHeight: "100lvh" }}
    >
      {showShellDecor ? (
        <>
          <div className="pointer-events-none absolute -top-20 right-0 h-52 w-52 rounded-full bg-cyan-500/8 blur-3xl" />
          <div className="pointer-events-none absolute top-24 left-0 h-44 w-44 rounded-full bg-violet-500/6 blur-3xl" />
        </>
      ) : null}

      <Suspense fallback={null}>
        <main className={mainClassName}>{children}</main>
      </Suspense>
      {showLegalNotice ? (
        <footer className="relative z-10 border-t border-ht-border-hairline bg-ht-surface px-3 py-2 text-center text-xs leading-relaxed text-ht-fg-muted break-words">
          {legalNotice}
        </footer>
      ) : null}
    </div>
  );
}

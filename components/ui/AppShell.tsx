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
  "/bingo",
  "/pickem",
  "/fantasy",
  "/predictions",
  "/venue/",
  "/active-games",
  "/pending-challenges",
];

// Subset of fullscreen routes that are pure game screens — these need a dark
// background so the underlying page never bleeds through when the soft keyboard
// shrinks the visual viewport. The venue hub is fullscreen but not a game screen;
// it sits on the body's natural background and sets its own surface colors.
const GAME_SCREEN_PATHS = [
  "/trivia",
  "/bingo",
  "/pickem",
  "/fantasy",
  "/predictions",
  "/active-games",
  "/pending-challenges",
];

export function AppShell({ children, legalNotice }: AppShellProps) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");
  const isFullscreen = !isAdmin && FULLSCREEN_PATHS.some((p) => pathname?.startsWith(p));
  const isGameScreen = !isAdmin && GAME_SCREEN_PATHS.some((p) => pathname?.startsWith(p));

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
          ? "bg-slate-950"
          : isFullscreen
          ? ""
          : "mx-auto grid min-h-[100svh] max-w-[720px] box-border grid-rows-[1fr_auto] gap-4 overflow-x-hidden overflow-y-visible pb-24"
      }`}
      style={isAdmin || isFullscreen ? undefined : { minHeight: "var(--tp-vh, 100svh)" }}
    >
      {!isAdmin && !isFullscreen ? (
        <>
          <div className="pointer-events-none absolute -top-20 right-0 h-52 w-52 rounded-full bg-cyan-500/8 blur-3xl" />
          <div className="pointer-events-none absolute top-24 left-0 h-44 w-44 rounded-full bg-violet-500/6 blur-3xl" />
        </>
      ) : null}

      <Suspense fallback={null}>
        <main className={isAdmin ? "h-full min-h-0" : "min-h-0"}>{children}</main>
      </Suspense>
      {!isAdmin && !isFullscreen ? (
        <footer className="relative z-10 border-t border-ht-border-hairline bg-ht-surface px-3 py-2 text-center text-xs leading-relaxed text-ht-fg-muted break-words">
          {legalNotice}
        </footer>
      ) : null}
    </div>
  );
}

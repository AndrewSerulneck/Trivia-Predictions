"use client";

import { useEffect, type ReactNode } from "react";

// The confirmation after a save / cancel / create / end ("Live Trivia scheduled:
// Fri, Oct 3 at 8:00 PM"). A bottom toast that clears itself, so the partner is
// not left dismissing a banner; the server's advisory about pinned rewards stays
// a persistent DashboardNotice instead. No library — one timer, one live region.

/** Long enough to read a sentence; longer when there is a link to tap. */
export const TOAST_MS = 6000;
export const TOAST_WITH_ACTION_MS = 10000;

export const DashboardToast = ({
  children,
  action,
  onDismiss,
}: {
  children: ReactNode;
  /** A tappable follow-up, e.g. "Now offer a reward for it →". */
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
}) => {
  const hasAction = Boolean(action);
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, hasAction ? TOAST_WITH_ACTION_MS : TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [hasAction, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[4000] flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-md animate-tp-fade-in items-center gap-2 rounded-2xl border border-ht-cyan-500/40 bg-ht-elevated py-1 pl-4 pr-1 text-sm font-bold text-ht-primary shadow-ht-modal"
      >
        <span className="min-w-0 flex-1 py-2">
          {children}
          {action ? (
            <>
              {" "}
              <button
                type="button"
                onClick={action.onClick}
                className="min-h-11 !border-0 bg-transparent p-0 text-left font-black text-ht-cyan-300 underline"
              >
                {action.label}
              </button>
            </>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center !border-0 bg-transparent font-black"
        >
          ×
        </button>
      </div>
    </div>
  );
};

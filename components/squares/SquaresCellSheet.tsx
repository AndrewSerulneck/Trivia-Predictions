"use client";

import { useEffect } from "react";
import { useNativeBackHandler } from "@/components/navigation/nativeBackButton";
import { setScrollLock } from "@/lib/scrollLock";
import { isDigitPermutation, type SquaresEventPhase } from "@/lib/squares";
import {
  SQUARES_MOMENT_LABELS,
  squaresCellAction,
  squaresCellNote,
  type SquaresCellModel,
} from "@/lib/squaresView";

// The small sheet a tap on a square opens: who holds it, and — before the lock — Claim / Release.
// Same shell as AccountDrawer (scrim, scroll lock, Escape, Android Back closes it first).

const SCROLL_LOCK_ID = "squares-cell-sheet";

export function SquaresCellSheet({
  model,
  phase,
  used,
  cap,
  digits,
  teams,
  busy,
  message,
  onClaim,
  onRelease,
  onClose,
}: {
  /** The tapped square, or null when the sheet is closed. */
  model: SquaresCellModel | null;
  phase: SquaresEventPhase;
  used: number;
  cap: number;
  digits: { col: number[] | null; row: number[] | null };
  teams: { col: string; row: string };
  busy: boolean;
  message: string | null;
  onClaim: (cell: number) => void;
  onRelease: (cell: number) => void;
  onClose: () => void;
}) {
  const open = model !== null;

  useEffect(() => {
    setScrollLock(SCROLL_LOCK_ID, open, "modal");
    return () => setScrollLock(SCROLL_LOCK_ID, false);
  }, [open]);

  useNativeBackHandler("overlay", open ? onClose : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!model) return null;

  const action = squaresCellAction({ phase, model, used, cap });
  const note = squaresCellNote({ phase, owner: model.owner, used, cap });
  const drawn = isDigitPermutation(digits.col) && isDigitPermutation(digits.row);
  const heldBy = model.owner === "open" ? "Open" : model.owner === "mine" ? "Yours" : `Held by ${model.username}`;

  return (
    <div className="fixed inset-0 z-[1200]" data-tp-scroll-lock="active">
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="tp-player-pressable absolute inset-0 h-full w-full !rounded-none !border-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Square, row ${model.row + 1}, column ${model.col + 1}`}
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md space-y-3 rounded-t-3xl bg-slate-900 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-white shadow-ht-modal"
      >
        <div>
          <p className="text-footnote font-black uppercase tracking-wide text-emerald-200">
            Row {model.row + 1} · Column {model.col + 1}
          </p>
          <p className="mt-1 text-2xl font-black [font-family:var(--ht-font-display)]">{heldBy}</p>
          {drawn ? (
            <p className="mt-1 text-footnote font-semibold text-slate-300">
              {teams.col} {(digits.col as number[])[model.col]} · {teams.row} {(digits.row as number[])[model.row]}
            </p>
          ) : null}
          {model.wins.length > 0 ? (
            <p className="mt-1 text-footnote font-black text-amber-200">
              Won {model.wins.map((moment) => SQUARES_MOMENT_LABELS[moment]).join(" and ")}
            </p>
          ) : null}
        </div>

        {message ? (
          <p role="alert" className="rounded-xl bg-rose-500/15 px-3 py-2 text-footnote font-semibold text-rose-200">
            {message}
          </p>
        ) : note && action === "none" ? (
          <p className="text-footnote font-semibold text-slate-300">{note}</p>
        ) : null}

        {action === "claim" || action === "release" ? (
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => (action === "claim" ? onClaim(model.cell) : onRelease(model.cell))}
            className={`tp-player-hit-target tp-player-pressable w-full !rounded-2xl !border-0 px-4 py-3 text-base font-black ${
              action === "claim" ? "bg-amber-300 text-slate-950" : "bg-white/10 text-white"
            } disabled:opacity-60`}
          >
            {busy ? "Saving…" : action === "claim" ? "Claim this square" : "Release this square"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="tp-player-hit-target tp-player-pressable w-full !rounded-2xl !border-0 bg-transparent px-4 py-2 text-base font-semibold text-slate-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}

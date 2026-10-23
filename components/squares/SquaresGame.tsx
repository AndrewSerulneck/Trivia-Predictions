"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameAppBar } from "@/components/venue/AppBar";
import { HightopLoader } from "@/components/ui/HightopLoader";
import { ShareWinButton } from "@/components/social-share/ShareWinButton";
import { SquaresCellSheet } from "@/components/squares/SquaresCellSheet";
import { SquaresGrid } from "@/components/squares/SquaresGrid";
import { useSquaresData } from "@/components/squares/useSquaresData";
import { haptic } from "@/lib/haptics";
import { getUserId, getVenueId } from "@/lib/storage";
import {
  squaresCellModels,
  squaresClaimMessage,
  squaresHeadline,
  squaresMomentRows,
  squaresScreenState,
} from "@/lib/squaresView";

// The Squares screen (docs/squares-and-brackets-plan.md Phase 3): one headline, the board, a one-line
// key, and the four scoring moments. Everything it decides lives in lib/squaresView.ts; the reads and
// their cost rules are in useSquaresData.ts.

const KEY_ITEMS = [
  { label: "Open", swatch: "bg-white/10" },
  { label: "Taken", swatch: "bg-sky-400/80" },
  { label: "Yours", swatch: "bg-amber-300" },
  { label: "Won", swatch: "bg-transparent ring-2 ring-inset ring-white" },
] as const;

export function SquaresGame({ onBack }: { /** Injected by GameLandingExperience (runs the venue return transition). */ onBack?: () => void }) {
  const [identity, setIdentity] = useState<{ userId: string; venueId: string } | null | undefined>(undefined);
  useEffect(() => {
    const userId = getUserId() || "";
    const venueId = getVenueId() || "";
    Promise.resolve().then(() => setIdentity(userId && venueId ? { userId, venueId } : null));
  }, []);

  const { status, board, score, nowMs, act, reload } = useSquaresData(identity ?? null);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const state = useMemo(() => (board ? squaresScreenState(board, score) : null), [board, score]);
  const models = useMemo(() => (board && state ? squaresCellModels(board, state) : []), [board, state]);
  const rows = useMemo(() => (board ? squaresMomentRows(board, score) : []), [board, score]);
  const selected = selectedCell === null ? null : (models[selectedCell] ?? null);

  const closeSheet = useCallback(() => {
    setSelectedCell(null);
    setMessage(null);
  }, []);

  const openSheet = useCallback((cell: number) => {
    haptic("selection");
    setMessage(null);
    setSelectedCell(cell);
  }, []);

  const run = useCallback(
    async (cell: number, action: "claim" | "release") => {
      if (busy) return;
      setBusy(true);
      setMessage(null);
      const result = await act(cell, action);
      setBusy(false);
      if (result.ok) {
        haptic(action === "claim" ? "commit" : "selection");
        closeSheet();
        return;
      }
      haptic("warning");
      setMessage(result.network ? "No connection. Please try again." : squaresClaimMessage(result.outcome));
    },
    [act, busy, closeSheet],
  );

  const teams = board?.event
    ? { col: board.event.colTeam.abbreviation, row: board.event.rowTeam.abbreviation }
    : { col: "", row: "" };
  const headline = board && state ? squaresHeadline({ board, state, nowMs }) : null;
  // Phase 9c: the quarters the board already says are mine (no new request). The picture names the game, not the square.
  const myWinPoints = rows.filter((row) => row.winner?.mine).reduce((sum, row) => sum + row.points, 0);

  return (
    <div className="min-h-[60vh] text-white">
      <GameAppBar game="squares" onExit={onBack} />

      <div className="space-y-3 px-2 pb-8 pt-3">
        {status === "loading" || identity === undefined ? (
          <div className="flex justify-center py-16">
            <HightopLoader />
          </div>
        ) : status === "no-venue" ? (
          <Notice title="Open this from your venue" detail="Join your venue first, then come back to pick your squares." />
        ) : status === "off" ? (
          <Notice title="Not available right now" detail="This game isn't open yet." />
        ) : status === "error" || !board ? (
          <Notice title="The board didn't load" detail="Check your connection and try again." action={{ label: "Try again", onClick: reload }} />
        ) : !board.event || !state ? (
          <Notice title="The board opens soon" detail="It opens once the matchup is set." />
        ) : (
          <>
            <section aria-live="polite" className="px-1">
              <h1 className="text-[clamp(1.5rem,7vw,1.9rem)] font-black leading-tight [font-family:var(--ht-font-display)]">
                {headline?.title}
              </h1>
              {headline?.detail ? <p className="mt-0.5 text-footnote font-semibold text-emerald-100/80">{headline.detail}</p> : null}
              {state.phase === "drawn" && state.leadingCell !== null ? (
                <p className="mt-1 text-footnote font-black text-amber-200">
                  Leading square: {models[state.leadingCell]?.username ?? "nobody holds it"}
                </p>
              ) : null}
            </section>

            <SquaresGrid models={models} colDigits={state.colDigits} rowDigits={state.rowDigits} teams={teams} onSelect={openSheet} />

            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1" aria-label="Key">
              {KEY_ITEMS.map((item) => (
                <li key={item.label} className="flex items-center gap-1.5 text-caption font-semibold text-emerald-100/80">
                  <span aria-hidden="true" className={`inline-block h-3.5 w-3.5 rounded-[3px] ${item.swatch}`} />
                  {item.label}
                </li>
              ))}
            </ul>

            <section aria-label="Scoring moments" className="rounded-2xl bg-black/25 px-3 py-1">
              <ul className="divide-y divide-white/10">
                {rows.map((row) => (
                  <li key={row.moment} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-base font-black">{row.label}</p>
                      <p className="text-footnote font-semibold text-emerald-100/70">{row.points} points</p>
                    </div>
                    <p
                      className={`shrink-0 truncate text-right text-base font-black ${
                        row.winner?.mine ? "text-amber-200" : row.state === "won" ? "text-white" : "text-emerald-100/60"
                      }`}
                    >
                      {row.state === "pending" ? "—" : row.winner ? (row.winner.mine ? "You" : row.winner.username) : "No winner"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            {myWinPoints > 0 ? (
              <ShareWinButton gameType="squares" result={{ finalPoints: myWinPoints, isChampion: true }} className="px-1" />
            ) : null}
          </>
        )}
      </div>

      {board?.event && state ? (
        <SquaresCellSheet
          model={selected}
          phase={state.phase}
          used={board.myCells.length}
          cap={board.cap}
          digits={{ col: state.colDigits, row: state.rowDigits }}
          teams={teams}
          busy={busy}
          message={message}
          onClaim={(cell) => void run(cell, "claim")}
          onRelease={(cell) => void run(cell, "release")}
          onClose={closeSheet}
        />
      ) : null}
    </div>
  );
}

function Notice({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <section className="space-y-2 px-3 py-10 text-center">
      <h1 className="text-2xl font-black [font-family:var(--ht-font-display)]">{title}</h1>
      <p className="text-base font-semibold text-emerald-100/80">{detail}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="tp-player-hit-target tp-player-pressable mt-2 rounded-2xl !border-0 bg-amber-300 px-5 py-2.5 text-base font-black text-slate-950"
        >
          {action.label}
        </button>
      ) : null}
    </section>
  );
}

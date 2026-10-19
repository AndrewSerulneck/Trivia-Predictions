"use client";

import { memo, useCallback, useRef, useState, type KeyboardEvent } from "react";
import { isDigitPermutation } from "@/lib/squares";
import { squaresCellLabel, type SquaresCellModel } from "@/lib/squaresView";

// The 10×10 board. On a 289 px phone a square is ~23 px, too small for a name at 12 px, so a square
// shows COLOUR ONLY (open / taken / mine) plus two outlines (won a moment / leading now); tapping one
// opens the sheet with the owner (every owner is public). The cells are not buttons: the phone-wide
// button rules (min-height 36 px, side padding) would swell them, so they are grid cells with a roving
// tab stop and arrow-key movement instead.

const CELL_BY_OWNER = {
  open: "bg-white/10",
  taken: "bg-sky-400/80",
  mine: "bg-amber-300",
} as const;

type Teams = { col: string; row: string };

const Cell = memo(function Cell({
  model,
  label,
  tabbable,
  onSelect,
  onKeyDown,
  register,
}: {
  model: SquaresCellModel;
  label: string;
  tabbable: boolean;
  onSelect: (cell: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, cell: number) => void;
  register: (cell: number, node: HTMLDivElement | null) => void;
}) {
  const won = model.wins.length > 0;
  return (
    <div
      role="gridcell"
      ref={(node) => register(model.cell, node)}
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      data-cell={model.cell}
      data-owner={model.owner}
      data-won={won ? "true" : undefined}
      data-leading={model.leading ? "true" : undefined}
      onClick={() => onSelect(model.cell)}
      onKeyDown={(event) => onKeyDown(event, model.cell)}
      className={`aspect-square cursor-pointer touch-manipulation rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-white ${
        CELL_BY_OWNER[model.owner]
      } ${won ? "ring-2 ring-inset ring-white" : ""} ${
        model.leading ? "outline outline-2 -outline-offset-2 outline-amber-200 motion-safe:animate-pulse" : ""
      }`}
    />
  );
});

const AxisDigit = ({ digit, role }: { digit: number | null; role: "columnheader" | "rowheader" }) => (
  <div
    role={role}
    className={`flex items-center justify-center text-caption font-black tabular-nums text-emerald-100/90 ${
      role === "columnheader" ? "h-5" : ""
    }`}
  >
    {digit === null ? <span className="text-emerald-100/40">?</span> : digit}
  </div>
);

export function SquaresGrid({
  models,
  colDigits,
  rowDigits,
  teams,
  onSelect,
}: {
  models: readonly SquaresCellModel[];
  colDigits: number[] | null;
  rowDigits: number[] | null;
  teams: Teams;
  onSelect: (cell: number) => void;
}) {
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const [focusCell, setFocusCell] = useState(0);
  const drawn = isDigitPermutation(colDigits) && isDigitPermutation(rowDigits);

  const register = useCallback((cell: number, node: HTMLDivElement | null) => {
    if (node) nodes.current.set(cell, node);
    else nodes.current.delete(cell);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, cell: number) => {
      const row = Math.floor(cell / 10);
      const col = cell % 10;
      let next: number | null = null;
      if (event.key === "ArrowRight") next = row * 10 + Math.min(9, col + 1);
      else if (event.key === "ArrowLeft") next = row * 10 + Math.max(0, col - 1);
      else if (event.key === "ArrowDown") next = Math.min(9, row + 1) * 10 + col;
      else if (event.key === "ArrowUp") next = Math.max(0, row - 1) * 10 + col;
      if (next !== null) {
        event.preventDefault();
        setFocusCell(next);
        nodes.current.get(next)?.focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(cell);
      }
    },
    [onSelect],
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-0.5 text-caption font-black uppercase tracking-wide text-emerald-100/80">
        <span>{teams.col} across</span>
        <span>{teams.row} down</span>
      </div>
      <div
        role="grid"
        aria-label="Squares board"
        aria-rowcount={11}
        aria-colcount={11}
        className="grid grid-cols-[1.25rem_repeat(10,minmax(0,1fr))] gap-px rounded-xl bg-black/25 p-1.5"
      >
        <div role="row" className="contents">
          <div aria-hidden="true" />
          {Array.from({ length: 10 }, (_, col) => (
            <AxisDigit key={col} digit={drawn ? (colDigits as number[])[col] : null} role="columnheader" />
          ))}
        </div>
        {Array.from({ length: 10 }, (_, row) => (
          <div key={row} role="row" className="contents">
            <AxisDigit digit={drawn ? (rowDigits as number[])[row] : null} role="rowheader" />
            {models.slice(row * 10, row * 10 + 10).map((model) => (
              <Cell
                key={model.cell}
                model={model}
                label={squaresCellLabel(model, { colDigits, rowDigits }, teams)}
                tabbable={model.cell === focusCell}
                onSelect={onSelect}
                onKeyDown={onKeyDown}
                register={register}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

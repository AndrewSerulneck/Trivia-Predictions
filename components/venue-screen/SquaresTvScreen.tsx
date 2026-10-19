import { SQUARES_MOMENT_LABELS } from "@/lib/squaresView";
import { cellOf, type SquaresMoment } from "@/lib/squares";
import type { VenueScreenState } from "@/lib/venueScreen";

type SquaresTvState = Extract<VenueScreenState, { mode: "squares" }>;

type SquaresTvScreenProps = {
  state: SquaresTvState;
  accent: string;
};

const MOMENT_TAGS: Record<SquaresMoment, string> = { q1: "Q1", half: "HALF", q3: "Q3", final: "FINAL" };
const MAX_NAME_CHARS = 8;

const shortName = (name: string): string => (name.length > MAX_NAME_CHARS ? `${name.slice(0, MAX_NAME_CHARS - 1)}…` : name);

// The Squares board on the venue TV: the 10×10 grid with the drawn digits, the live score, the square
// that is winning right now and who won each moment. Everything arrives in the screen's own poll
// (lib/squaresTv.ts); this component only draws it.
export function SquaresTvScreen({ state, accent }: SquaresTvScreenProps) {
  const { squares } = state;
  const owners = new Map(squares.claims.map((claim) => [claim.cell, claim.username]));
  const winners = new Map(squares.winningCells.map((entry) => [entry.cell, entry.moments]));
  const score = squares.liveScore;
  const hasScore = score !== null && score.col !== null && score.row !== null;
  const leadingOwner = squares.leadingCell !== null ? (owners.get(squares.leadingCell) ?? null) : null;
  const isFinal = squares.phase === "complete";

  return (
    <div className="flex min-h-0 flex-1 gap-12 px-12 pb-10" data-testid="squares-tv">
      <div className="flex min-h-0 flex-col justify-center">
        <p className="mb-2 text-center text-4xl font-black uppercase tracking-[0.2em] text-slate-200">
          {squares.colTeam.name}
        </p>
        <div className="grid grid-cols-[4.5rem_repeat(10,5.5rem)] grid-rows-[4.5rem_repeat(10,5.5rem)] gap-1.5">
          <div className="flex items-center justify-center text-3xl font-black text-slate-400">
            {squares.rowTeam.abbreviation.slice(0, 3)}
          </div>
          {squares.colDigits.map((digit, col) => (
            <div key={`c${col}`} className="flex items-center justify-center rounded-lg bg-white/10 text-5xl font-black text-white">
              {digit}
            </div>
          ))}
          {squares.rowDigits.map((digit, row) => (
            <div key={`r${row}`} className="contents">
              <div className="flex items-center justify-center rounded-lg bg-white/10 text-5xl font-black text-white">{digit}</div>
              {Array.from({ length: 10 }, (_, col) => {
                const cell = cellOf(row, col);
                const owner = owners.get(cell);
                const won = winners.get(cell);
                const leading = squares.leadingCell === cell;
                const ring = won
                  ? "border-amber-300 bg-amber-300/25 shadow-[0_0_28px_rgba(252,211,77,0.55)]"
                  : leading
                    ? "animate-pulse border-emerald-300 bg-emerald-400/30 shadow-[0_0_28px_rgba(110,231,183,0.55)]"
                    : owner
                      ? "border-white/15 bg-white/[0.07]"
                      : "border-white/5 bg-white/[0.02]";
                return (
                  <div
                    key={cell}
                    className={`flex flex-col items-center justify-center overflow-hidden rounded-lg border-2 px-1 ${ring}`}
                  >
                    {owner ? (
                      <span className="max-w-full truncate text-[1.15rem] font-bold leading-tight text-white">{shortName(owner)}</span>
                    ) : null}
                    {won ? (
                      <span className="text-lg font-black uppercase tracking-wide text-amber-200">
                        {won.map((moment) => MOMENT_TAGS[moment]).join(" ")}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-8">
        <section className="rounded-3xl border-2 px-10 py-8" style={{ borderColor: `${accent}55`, background: `${accent}14` }}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 text-center">
            <div>
              <p className="text-3xl font-black uppercase tracking-[0.18em] text-slate-300">{squares.colTeam.abbreviation}</p>
              <p className="text-[8rem] font-black leading-none text-white">{hasScore ? score.col : "–"}</p>
            </div>
            <p className="text-5xl font-black text-slate-500">–</p>
            <div>
              <p className="text-3xl font-black uppercase tracking-[0.18em] text-slate-300">{squares.rowTeam.abbreviation}</p>
              <p className="text-[8rem] font-black leading-none text-white">{hasScore ? score.row : "–"}</p>
            </div>
          </div>
          <p className="mt-4 text-center text-3xl font-bold text-slate-300">{isFinal ? "Final" : (score?.status ?? "Waiting for kickoff")}</p>
        </section>

        {!isFinal ? (
          <section className="rounded-3xl border-2 border-emerald-300/40 bg-emerald-400/10 px-10 py-6 text-center">
            <p className="text-2xl font-black uppercase tracking-[0.2em] text-emerald-200">Winning right now</p>
            <p className="mt-2 truncate text-6xl font-black text-white">
              {squares.leadingCell === null ? "—" : (leadingOwner ?? "Nobody here")}
            </p>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          {squares.moments.map((moment) => (
            <div key={moment.moment} className="flex items-center justify-between gap-6 rounded-2xl bg-white/[0.06] px-8 py-4">
              <p className="text-4xl font-black text-white">{SQUARES_MOMENT_LABELS[moment.moment]}</p>
              <p className="min-w-0 truncate text-4xl font-bold text-amber-200">
                {moment.state === "won" && moment.winner
                  ? moment.winner.username
                  : moment.state === "nobody"
                    ? "No winner here"
                    : `${moment.points} pts`}
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

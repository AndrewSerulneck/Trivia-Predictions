"use client";

import { Check, Minus, X } from "lucide-react";
import { bracketRoundPoints } from "@/lib/brackets/scoring";
import { roundOfSlot, type BracketKind } from "@/lib/brackets/tree";
import {
  BRACKET_ROUND_NAMES,
  bracketMatchupSides,
  bracketPickState,
  type BracketPickState,
  type BracketSeatTeam,
  type BracketStep,
} from "@/lib/bracketsView";

// The games of one step, in two modes (docs/squares-and-brackets-plan.md Phase 8):
//   edit    each game is two big tap targets side by side; the picked team is amber. A later round offers
//           the two teams YOU picked in the games feeding it, so you can't advance a team you eliminated.
//   review  one row per game with your pick and whether it was right, wrong or can still happen — words
//           as well as colour, so it reads the same without colour.
// Every rule (what may be picked, what a change clears) is in lib/brackets/; this only draws it.

const seedLabel = (team: BracketSeatTeam): string => (team.seed === null ? "" : String(team.seed));

function TeamButton({
  team,
  selected,
  onPick,
}: {
  team: BracketSeatTeam | null;
  selected: boolean;
  onPick: () => void;
}) {
  if (!team) {
    return (
      <div className="flex min-h-[3.25rem] items-center justify-center rounded-xl bg-white/5 px-2 text-center text-footnote font-semibold text-orange-100/60">
        Pick the game before
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={`tp-player-pressable flex min-h-[3.25rem] w-full items-center gap-1.5 !rounded-xl !border-0 px-2 py-1.5 text-left !font-black ${
        selected ? "bg-amber-300 text-slate-950" : "bg-white/10 text-white"
      }`}
    >
      {team.seed !== null ? (
        <span
          aria-hidden="true"
          className={`shrink-0 text-caption font-black tabular-nums ${selected ? "text-slate-800" : "text-orange-200"}`}
        >
          {seedLabel(team)}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-footnote font-black leading-tight [overflow-wrap:anywhere] line-clamp-3">{team.name}</span>
      {selected ? <Check aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
    </button>
  );
}

const STATE_VIEW: Record<BracketPickState, { text: string; className: string; Icon: typeof Check | null }> = {
  correct: { text: "Right", className: "text-emerald-300", Icon: Check },
  wrong: { text: "Wrong", className: "text-rose-300", Icon: X },
  alive: { text: "Still alive", className: "text-amber-200", Icon: null },
  out: { text: "Knocked out", className: "text-rose-300", Icon: X },
  none: { text: "No pick", className: "text-orange-100/60", Icon: Minus },
};

export function BracketMatchups({
  step,
  kind,
  picks,
  winnerSeats,
  seatTeams,
  mode,
  onPick,
}: {
  step: BracketStep;
  kind: BracketKind;
  picks: ReadonlyArray<number | null>;
  winnerSeats: ReadonlyArray<number | null>;
  seatTeams: readonly BracketSeatTeam[];
  mode: "edit" | "review";
  onPick?: (slot: number, seat: number) => void;
}) {
  return (
    <div className="space-y-4">
      {step.groups.map((group) => (
        <section key={group.id} aria-label={group.title} className="space-y-1.5">
          <h2 className="flex items-baseline justify-between gap-2 px-1 text-footnote font-black uppercase tracking-wide text-orange-200">
            <span>{group.title}</span>
            {group.points !== null ? <span className="font-semibold normal-case tracking-normal text-orange-100/70">{group.points} pts each</span> : null}
          </h2>
          <ul className="space-y-1.5">
            {group.slots.map((slot) => {
              const round = roundOfSlot(slot);
              const roundLine = group.showRound ? `${BRACKET_ROUND_NAMES[round]} · ${bracketRoundPoints(round)} pts` : null;
              if (mode === "review") {
                const seat = picks[slot] ?? null;
                const team = seat === null ? null : (seatTeams[seat] ?? null);
                const state = bracketPickState(picks, winnerSeats, slot);
                const view = STATE_VIEW[state];
                return (
                  <li key={slot} className="rounded-xl bg-black/25 px-3 py-2">
                    {roundLine ? <p className="text-caption font-semibold text-orange-100/70">{roundLine}</p> : null}
                    <div className="flex items-center justify-between gap-3">
                      <p className={`min-w-0 text-base font-black leading-tight ${state === "wrong" || state === "out" ? "text-white/60 line-through" : "text-white"}`}>
                        {team ? (
                          <>
                            {team.seed !== null ? <span className="mr-1.5 text-footnote font-black tabular-nums text-orange-200">{seedLabel(team)}</span> : null}
                            {team.name}
                          </>
                        ) : (
                          "No pick"
                        )}
                      </p>
                      <p className={`flex shrink-0 items-center gap-1 text-footnote font-black ${view.className}`}>
                        {view.Icon ? <view.Icon aria-hidden="true" className="h-4 w-4" /> : null}
                        {view.text}
                        {state === "correct" ? ` +${bracketRoundPoints(round)}` : ""}
                      </p>
                    </div>
                  </li>
                );
              }
              const [homeSeat, awaySeat] = bracketMatchupSides(picks, slot, kind, winnerSeats);
              const home = homeSeat === null ? null : (seatTeams[homeSeat] ?? null);
              const away = awaySeat === null ? null : (seatTeams[awaySeat] ?? null);
              const picked = picks[slot] ?? null;
              return (
                <li
                  key={slot}
                  role="group"
                  aria-label={`${BRACKET_ROUND_NAMES[round]}: ${home?.name ?? "to be decided"} or ${away?.name ?? "to be decided"}`}
                  className="rounded-2xl bg-black/25 p-1.5"
                >
                  {roundLine ? <p className="px-1 pb-1 text-caption font-semibold text-orange-100/70">{roundLine}</p> : null}
                  {home === null && away === null ? (
                    <div className="flex min-h-[3.25rem] items-center justify-center rounded-xl bg-white/5 px-2 text-center text-footnote font-semibold text-orange-100/60">
                      Pick the games before this one
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      <TeamButton team={home} selected={homeSeat !== null && picked === homeSeat} onPick={() => homeSeat !== null && onPick?.(slot, homeSeat)} />
                      <TeamButton team={away} selected={awaySeat !== null && picked === awaySeat} onPick={() => awaySeat !== null && onPick?.(slot, awaySeat)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

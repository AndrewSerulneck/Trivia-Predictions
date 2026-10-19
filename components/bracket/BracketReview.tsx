"use client";

import { useMemo, useState } from "react";
import { BracketMatchups } from "@/components/bracket/BracketMatchups";
import { BracketStepChips } from "@/components/bracket/BracketStepChips";
import { bracketMaxScore } from "@/lib/brackets/scoring";
import {
  bracketChampionPick,
  bracketPickCounts,
  bracketSteps,
  type BracketOption,
  type BracketSeatTeam,
} from "@/lib/bracketsView";

// A saved bracket, read-only (after the lock, or as a preview while picks are open): the score, the
// best it can still reach, how many picks are right / wrong / still alive, then every pick by step with
// its result. Everything is computed from the state the screen already holds — no request.

const CHAMPION_NOTE = {
  correct: "Champion — you got it",
  wrong: "Champion — wrong",
  alive: "Still alive",
  out: "Knocked out",
  none: "",
} as const;

export function BracketReview({ option, seatTeams }: { option: BracketOption; seatTeams: readonly BracketSeatTeam[] }) {
  const { tournament, kind } = option;
  const mine = tournament.kinds[kind].mine;
  const steps = useMemo(
    () => bracketSteps(kind, tournament.regionNames).filter((step) => step.groups.length > 0),
    [kind, tournament.regionNames],
  );
  const [stepIndex, setStepIndex] = useState(0);
  const picks = useMemo(() => mine?.picks ?? [], [mine?.picks]);
  const counts = useMemo(() => bracketPickCounts(picks, tournament.winnerSeats, kind), [picks, tournament.winnerSeats, kind]);
  const champion = bracketChampionPick(picks, tournament.winnerSeats);
  const championTeam = champion ? (seatTeams[champion.seat] ?? null) : null;
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  if (!mine || mine.pickCount === 0) {
    return (
      <section className="rounded-2xl bg-black/25 px-4 py-6 text-center">
        <h2 className="text-xl font-black [font-family:var(--ht-font-display)]">No bracket here</h2>
        <p className="mt-1 text-footnote font-semibold text-orange-100/80">
          You didn&apos;t fill this one out. Check the standings to see how everyone else did.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <section aria-label="Your score" className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-black/25">
        <Figure label="Points" value={mine.score} />
        <Figure label="Best possible" value={mine.maxPossible} />
        <Figure label="Perfect" value={bracketMaxScore(kind)} muted />
      </section>

      <p className="px-1 text-footnote font-semibold text-orange-100/80" aria-live="polite">
        {counts.correct} right · {counts.wrong + counts.out} wrong · {counts.alive} still alive
        {counts.none > 0 ? ` · ${counts.none} not picked` : ""}
      </p>

      {championTeam && champion ? (
        <p className="rounded-xl bg-black/25 px-3 py-2 text-base font-black">
          <span className="text-footnote font-black uppercase tracking-wide text-orange-200">Your champion </span>
          {championTeam.name}
          <span className="ml-2 text-footnote font-black text-amber-200">{CHAMPION_NOTE[champion.state]}</span>
        </p>
      ) : null}

      <BracketStepChips steps={steps} index={stepIndex} picks={picks} showFinish={false} onSelect={setStepIndex} />
      <BracketMatchups
        step={step}
        kind={kind}
        picks={picks}
        winnerSeats={tournament.winnerSeats}
        seatTeams={seatTeams}
        mode="review"
      />
    </div>
  );
}

function Figure({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <p className={`text-xl font-black tabular-nums ${muted ? "text-orange-100/60" : "text-white"}`}>{value.toLocaleString("en-US")}</p>
      <p className="text-caption font-semibold text-orange-100/70">{label}</p>
    </div>
  );
}

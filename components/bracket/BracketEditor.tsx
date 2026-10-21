"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { BracketMatchups } from "@/components/bracket/BracketMatchups";
import { BracketStepChips } from "@/components/bracket/BracketStepChips";
import type { BracketWriteResult } from "@/components/bracket/useBracketData";
import { WizardFooter } from "@/components/navigation/WizardFooter";
import { haptic } from "@/lib/haptics";
import { bracketPickCount, isBracketTiebreaker, setBracketPick, BRACKET_TIEBREAKER_MAX } from "@/lib/brackets/picks";
import { BRACKET_SLOT_COUNT, emptyPicks, slotsOfKind } from "@/lib/brackets/tree";
import {
  bracketFinishStepId,
  bracketProgressLine,
  bracketSaveMessage,
  bracketSteps,
  type BracketOption,
  type BracketSeatTeam,
} from "@/lib/bracketsView";

// Filling out a bracket on a phone (docs/squares-and-brackets-plan.md Phase 8): one region at a time
// (15 picks), the Final Four (3), then Finish — the tiebreaker and Save. The draft goes to the server
// each time the step changes, when the tab is hidden and when the player leaves, so a half-filled
// bracket is never lost (and still scores for what it has). Rules: lib/brackets/picks.ts. Nothing
// here decides what may be picked.

/** "" = no guess; a whole number 0–400 = a guess; undefined = not a valid entry. */
const parseTiebreakerText = (text: string): number | null | undefined => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^\d{1,3}$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return isBracketTiebreaker(value) ? value : undefined;
};

export type BracketFlush = () => Promise<void>;

export function BracketEditor({
  option,
  seatTeams,
  onSave,
  onSaved,
  flushRef,
}: {
  option: BracketOption;
  seatTeams: readonly BracketSeatTeam[];
  onSave: (picks: ReadonlyArray<number | null>, tiebreaker: number | null, keepalive?: boolean) => Promise<BracketWriteResult>;
  /** Called after the Finish step's save works: the screen goes back to the summary. */
  onSaved: () => void;
  /** The screen calls this before leaving, to save a draft that has not gone yet. */
  flushRef: MutableRefObject<BracketFlush | null>;
}) {
  const { tournament, kind } = option;
  const mine = tournament.kinds[kind].mine;
  const steps = useMemo(() => bracketSteps(kind, tournament.regionNames), [kind, tournament.regionNames]);
  const total = slotsOfKind(kind).length;

  const [picks, setPicks] = useState<Array<number | null>>(() => (mine ? [...mine.picks] : emptyPicks()));
  const [tiebreakerText, setTiebreakerText] = useState(() => (mine?.tiebreaker === null || mine?.tiebreaker === undefined ? "" : String(mine.tiebreaker)));
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const picksRef = useRef(picks);
  const tiebreakerRef = useRef(tiebreakerText);
  // Every change bumps `version`; a send records the version it carried. Equal = nothing unsent.
  const versionRef = useRef(0);
  const sentVersionRef = useRef(0);
  // The send in flight, if any. A caller that arrives meanwhile waits for it, then sends what is newer.
  const inflightRef = useRef<Promise<boolean> | null>(null);
  const markChanged = useCallback(() => {
    versionRef.current += 1;
  }, []);

  const step = steps[stepIndex] ?? steps[0];
  const onFinish = step.id === bracketFinishStepId;
  const tiebreaker = parseTiebreakerText(tiebreakerText);

  /** Send the draft if it changed. True when nothing needed sending or the send worked. Waits for a send already in flight. */
  const persist = useCallback(
    async (keepalive = false): Promise<boolean> => {
      // A while, not an if: another caller may start the next send while this one waits.
      while (inflightRef.current) await inflightRef.current.catch(() => false);
      if (versionRef.current === sentVersionRef.current) return true;
      const parsed = parseTiebreakerText(tiebreakerRef.current);
      // A half-typed tiebreaker never blocks the picks: they go with the last good guess.
      const guess = parsed === undefined ? (mine?.tiebreaker ?? null) : parsed;
      const version = versionRef.current;
      const send = (async (): Promise<boolean> => {
        const result = await onSave(picksRef.current, guess, keepalive);
        if (result.ok) {
          sentVersionRef.current = version;
          return true;
        }
        setMessage(result.network ? "No connection. Your picks will save when you're back online." : bracketSaveMessage(result.outcome));
        return false;
      })();
      inflightRef.current = send;
      setSaving(true);
      try {
        return await send;
      } finally {
        inflightRef.current = null;
        setSaving(false);
      }
    },
    [mine?.tiebreaker, onSave],
  );

  useEffect(() => {
    flushRef.current = async () => {
      await persist();
    };
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, persist]);

  // The tab going to the background is the last moment we can be sure to send a draft.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && versionRef.current !== sentVersionRef.current) void persist(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [persist]);

  // Each step opens at the top.
  useEffect(() => {
    try {
      window.scrollTo({ top: 0 });
    } catch {
      // No scrolling in this environment.
    }
  }, [stepIndex]);

  const pick = useCallback(
    (slot: number, seat: number) => {
      const next = setBracketPick(picksRef.current, slot, seat, kind, tournament.winnerSeats);
      if (!next) return;
      if (next[slot] === picksRef.current[slot]) return;
      haptic("selection");
      picksRef.current = next;
      markChanged();
      setMessage(null);
      setPicks(next);
    },
    [kind, markChanged, tournament.winnerSeats],
  );

  const goTo = useCallback(
    async (index: number) => {
      if (index === stepIndex || index < 0 || index >= steps.length) return;
      setMessage(null);
      await persist();
      setStepIndex(index);
    },
    [persist, stepIndex, steps.length],
  );

  const finish = useCallback(async () => {
    if (tiebreaker === undefined) {
      haptic("warning");
      setMessage(bracketSaveMessage("invalid_tiebreaker"));
      return;
    }
    tiebreakerRef.current = tiebreakerText;
    markChanged();
    setMessage(null);
    if (await persist()) {
      haptic("success");
      onSaved();
    } else {
      haptic("warning");
    }
  }, [markChanged, onSaved, persist, tiebreaker, tiebreakerText]);

  const championSeat = picks[BRACKET_SLOT_COUNT - 1] ?? null;
  const championTeam = championSeat === null ? null : (seatTeams[championSeat] ?? null);
  const count = bracketPickCount(picks, kind);

  return (
    <div className="space-y-3">
      <p className="px-1 text-footnote font-black text-orange-100/80" aria-live="polite">
        {bracketProgressLine(picks, kind)} picks
        {saving ? " · Saving…" : ""}
      </p>

      <BracketStepChips
        steps={steps}
        index={stepIndex}
        picks={picks}
        showFinish
        onSelect={(index) => void goTo(index)}
      />

      {onFinish ? (
        <section className="space-y-4 rounded-2xl bg-black/25 px-4 py-4">
          <div>
            <h2 className="text-xl font-black [font-family:var(--ht-font-display)]">
              {count === total ? "Your bracket is complete" : `${total - count} picks still open`}
            </h2>
            <p className="mt-1 text-footnote font-semibold text-orange-100/80">
              {championTeam ? `Your champion: ${championTeam.name}.` : "You haven't picked a champion yet."}
              {count < total ? " Go back to any step to finish it. You can change your picks until they lock." : ""}
            </p>
          </div>
          <div>
            <label htmlFor="bracket-tiebreaker" className="block text-base font-black">
              Tiebreaker
            </label>
            <p className="mt-0.5 text-footnote font-semibold text-orange-100/80">
              Guess the total points scored by both teams in the championship game. The closest guess wins a tie.
            </p>
            <input
              id="bracket-tiebreaker"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={3}
              value={tiebreakerText}
              onChange={(event) => {
                tiebreakerRef.current = event.target.value;
                markChanged();
                setTiebreakerText(event.target.value);
                setMessage(null);
              }}
              placeholder={`0–${BRACKET_TIEBREAKER_MAX}`}
              aria-invalid={tiebreaker === undefined}
              className="mt-2 w-full max-w-[10rem] px-3 py-2 text-base font-black text-white"
            />
          </div>
        </section>
      ) : (
        <BracketMatchups
          step={step}
          kind={kind}
          picks={picks}
          winnerSeats={tournament.winnerSeats}
          seatTeams={seatTeams}
          mode="edit"
          onPick={pick}
        />
      )}

      {message ? (
        <p role="alert" className="rounded-xl bg-rose-500/15 px-3 py-2 text-footnote font-semibold text-rose-200">
          {message}
        </p>
      ) : null}

      <WizardFooter
        onBack={stepIndex > 0 ? () => void goTo(stepIndex - 1) : undefined}
        onNext={onFinish ? () => void finish() : () => void goTo(stepIndex + 1)}
        nextLabel={onFinish ? "Save bracket" : "Next"}
        nextBusyLabel="Saving…"
        nextBusy={saving}
        nextHideChevron={onFinish}
        nextDisabled={onFinish && tiebreaker === undefined}
        className="-mx-2 !max-w-none"
      />
    </div>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { WizardFooter } from "@/components/navigation/WizardFooter";
import {
  AllGamesScreen,
  GameDetailScreen,
  GameStep,
  HistoryScreen,
  RepeatStep,
  ReviewStep,
  WhenStep,
  type ScheduleFormChange,
  type ScheduleGames,
} from "@/components/owner/schedule/ScheduleStepScreens";
import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";
import { SlideSteps } from "@/components/owner/sheet/SlideSteps";
import { isContinuousDefaultEnabled } from "@/lib/categoryBlitzShared";
import { formatScheduleTime, GAME_LABELS } from "@/lib/ownerScheduleDisplay";
import {
  buildScheduleRequest,
  detectBrowserTimeZone,
  initialScheduleFormState,
  repeatError,
  resolveScheduleStep,
  SCHEDULE_SLIDE_ORDER,
  scheduleFormStateFromSchedule,
  scheduleGameOptions,
  scheduleSteps,
  type ScheduleFlowStep,
  type ScheduleFormState,
  type ScheduleSheetStep,
} from "@/lib/ownerScheduleForm";
import { nextStep, previousStep } from "@/lib/ownerSheetParams";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";
import type { OwnerSchedule } from "@/types";

// The Schedule Live Games sheet (docs/partner-dashboard-app-redesign-plan.md §4e):
// Game → When → Repeat → Review & name, plus the upcoming list, past games and a
// game's edit/cancel screen. Hosted by the dashboard, which owns the URL state
// (`useOwnerSheet`) and the games list; this owns the form.
//
// FORM STATE LIVES HERE, not in the step components: SlideSteps remounts a step
// on every change. The dashboard mounts this with a fresh `key` each time the
// partner opens the sheet, so a new game never inherits the last one's answers.
//
// HISTORY. Every forward move is a history entry (`nav.goToStep`), so the phone's
// Back gesture and the in-sheet Back button are the same thing. "Change" on the
// Review screen jumps back to a step the same way, and Back / Done there pop
// straight back to Review.

// Read once at module load, like the old page did (a NEXT_PUBLIC_ flag inlined at build).
const GAME_OPTIONS = scheduleGameOptions(isContinuousDefaultEnabled());

export type ScheduleChange = {
  /** What to tell the partner, e.g. "Live Trivia scheduled: Oct 3, 8:00 PM". */
  message: string;
  /** What the change did to rewards pinned to this game (retired, shrunk), built server-side. */
  rewardNotice: string | null;
};

type ServerReply = { ok: boolean; error?: string; rewardNotice?: string | null };

const readReply = async (res: Response, fallback: string): Promise<ServerReply> => {
  try {
    return (await res.json()) as ServerReply;
  } catch {
    return { ok: false, error: fallback };
  }
};

const freshForm = (): ScheduleFormState =>
  initialScheduleFormState({ gameOptions: GAME_OPTIONS, browserTimeZone: detectBrowserTimeZone() });

export const ScheduleGameFlow = ({
  venueId,
  nav,
  games,
  nowMs,
  initialSchedule,
  onChanged,
}: {
  venueId: string;
  nav: UseOwnerSheetResult;
  games: ScheduleGames;
  /** "Now" for upcoming-vs-past bucketing (when the list arrived). */
  nowMs: number;
  /** The game the partner tapped on the dashboard, if any. */
  initialSchedule: OwnerSchedule | null;
  /** A game was saved or cancelled: refetch the list and tell the partner. */
  onChanged: (change: ScheduleChange) => void;
}) => {
  const [form, setForm] = useState<ScheduleFormState>(freshForm);
  const [selected, setSelected] = useState<OwnerSchedule | null>(initialSchedule);
  // Set while an existing game is being edited (PATCH instead of POST).
  const [editing, setEditing] = useState<OwnerSchedule | null>(null);
  // The step "Change" jumped to from Review; its Next becomes "Done" and returns there.
  const [changingStep, setChangingStep] = useState<ScheduleFlowStep | null>(null);
  const [historyFrom, setHistoryFrom] = useState<ScheduleSheetStep>("when");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = nav.sheet === "schedule";
  const isEditing = editing !== null;
  const steps = scheduleSteps({ gameOptions: GAME_OPTIONS, gameType: form.gameType, isEditing });
  const rawStep = nav.displaySheet === "schedule" ? nav.displayStep : null;
  const current = resolveScheduleStep({
    rawStep,
    steps,
    hasSchedule: selected !== null,
    hasStartTime: form.startTime !== "",
  });

  // A stale or hand-edited `?step=` (or one whose data a reload lost) is corrected in place.
  const urlStep = nav.step;
  const replaceCurrentStep = nav.replaceCurrentStep;
  useEffect(() => {
    if (open && urlStep !== null && urlStep !== current) replaceCurrentStep(current);
  }, [open, urlStep, current, replaceCurrentStep]);

  const change: ScheduleFormChange = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  const go = (step: ScheduleSheetStep) => {
    setError(null);
    nav.goToStep(step);
  };

  const returnToReview = () => {
    setChangingStep(null);
    nav.goBack("review");
  };

  const openHistory = () => {
    setHistoryFrom(current);
    go("history");
  };

  const startNew = () => {
    const blank = freshForm();
    setForm(blank);
    setEditing(null);
    setChangingStep(null);
    const first = scheduleSteps({ gameOptions: GAME_OPTIONS, gameType: blank.gameType })[0];
    go(first);
  };

  const startEdit = (schedule: OwnerSchedule) => {
    setForm(scheduleFormStateFromSchedule(schedule));
    setEditing(schedule);
    setChangingStep(null);
    go("review");
  };

  const openGame = (schedule: OwnerSchedule) => {
    setSelected(schedule);
    go("detail");
  };

  const changeStep = (step: ScheduleFlowStep) => {
    setChangingStep(step);
    go(step);
  };

  const save = async () => {
    if (busy) return;
    const request = buildScheduleRequest({ venueId, editingId: editing?.id ?? null, form });
    if (!request.ok) {
      setError(request.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const reply = await readReply(res, "Couldn't save that game.");
      if (!reply.ok) throw new Error(reply.error ?? "Couldn't save that game.");
      const label = GAME_LABELS[form.gameType];
      onChanged({
        message: editing ? `${label} updated` : `${label} scheduled: ${formatScheduleTime(request.startIso, form.timezone)}`,
        // An edit that changes the days or the recurrence retires/shrinks rewards pinned to this game.
        rewardNotice: reply.rewardNotice ?? null,
      });
      nav.closeSheet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that game.");
      setBusy(false);
    }
  };

  const cancelGame = async (schedule: OwnerSchedule) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/owner/schedule/${schedule.id}`, { method: "DELETE" });
      const reply = await readReply(res, "Couldn't cancel that game.");
      if (!reply.ok) throw new Error(reply.error ?? "Couldn't cancel that game.");
      // Cancelling a game retires the rewards pinned to it; this is the moment the partner sees why.
      onChanged({ message: `${schedule.title} cancelled`, rewardNotice: reply.rewardNotice ?? null });
      nav.closeSheet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't cancel that game.");
      setBusy(false);
    }
  };

  const renderStep = (id: ScheduleSheetStep): ReactNode => {
    switch (id) {
      case "game":
        return (
          <GameStep
            options={GAME_OPTIONS}
            selected={form.gameType}
            onPick={(option) => {
              change({ gameType: option.value });
              if (changingStep === "game") returnToReview();
              else go("when");
            }}
            onOpenHistory={openHistory}
          />
        );
      case "when":
        return (
          <WhenStep
            form={form}
            onChange={change}
            onOpenHistory={openHistory}
            showHistoryLink={!isEditing && !steps.includes("game")}
          />
        );
      case "repeat":
        return <RepeatStep form={form} onChange={change} error={repeatError(form)} />;
      case "review":
        return (
          <ReviewStep
            form={form}
            onChange={change}
            steps={steps}
            isEditing={isEditing}
            onChangeStep={changeStep}
            error={error}
          />
        );
      case "all":
        return (
          <AllGamesScreen games={games} nowMs={nowMs} onOpen={openGame} onAdd={startNew} onOpenHistory={openHistory} />
        );
      case "history":
        return <HistoryScreen games={games} nowMs={nowMs} />;
      case "detail":
        return selected ? (
          <GameDetailScreen
            schedule={selected}
            onEdit={() => startEdit(selected)}
            onCancelGame={() => void cancelGame(selected)}
            busy={busy}
            error={error}
          />
        ) : null;
    }
  };

  const footer = ((): ReactNode => {
    if (current === "history") {
      return <WizardFooter variant="inline" tone="dark" onBack={() => nav.goBack(historyFrom)} />;
    }
    if (current !== "when" && current !== "repeat" && current !== "review") return undefined;

    const returning = changingStep === current;
    const previous = previousStep(steps, current);
    const onBack = returning
      ? returnToReview
      : current === "review" && isEditing
        ? () => nav.goBack("detail")
        : previous
          ? () => nav.goBack(previous)
          : undefined;

    if (current === "review") {
      return (
        <WizardFooter
          variant="inline"
          tone="dark"
          onBack={onBack}
          onNext={() => void save()}
          nextLabel={isEditing ? "Save changes" : "Schedule game"}
          nextBusyLabel={isEditing ? "Saving…" : "Scheduling…"}
          nextBusy={busy}
          nextHideChevron
        />
      );
    }

    const blocked = current === "when" ? (form.startTime === "" ? "Pick a date and time to continue." : null) : repeatError(form);
    const following = nextStep(steps, current);
    return (
      <WizardFooter
        variant="inline"
        tone="dark"
        onBack={onBack}
        onNext={returning ? returnToReview : following ? () => go(following) : undefined}
        nextLabel={returning ? "Done" : "Next"}
        nextHideChevron={returning}
        nextDisabled={blocked !== null}
        hint={blocked}
      />
    );
  })();

  const title = current === "all" || current === "history" || current === "detail"
    ? "Live Games"
    : isEditing
      ? "Edit game"
      : "Schedule a live game";

  return (
    <OwnerSheet open={open} onRequestClose={nav.closeSheet} title={title} footer={footer}>
      <SlideSteps steps={SCHEDULE_SLIDE_ORDER} current={current} renderStep={renderStep} />
    </OwnerSheet>
  );
};

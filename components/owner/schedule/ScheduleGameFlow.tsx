"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { ShareDetailsPanel } from "@/components/owner/share/ShareDetailsPanel";
import { useDiscardGuard } from "@/components/owner/sheet/DiscardGuard";
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
import { promoGameForSchedule } from "@/lib/promo/promoTemplates";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";
import type { OwnerSchedule } from "@/types";

// The Group Games sheet (docs/partner-dashboard-app-redesign-plan.md §4e):
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
  /** The game that was edited, so the dashboard can ring its row. A new game's row is found by diffing the refetched list. */
  scheduleId?: string;
  /** A cancel: the row is gone, so there is nothing to ring. */
  removed?: boolean;
  /** A NEW game that has a Share to social design: the id the dashboard offers to promote (plan §4.5). */
  shareScheduleId?: string;
};

type ServerReply = { ok: boolean; error?: string; rewardNotice?: string | null; schedule?: { id?: string } };

const readReply = async (res: Response, fallback: string): Promise<ServerReply> => {
  try {
    return (await res.json()) as ServerReply;
  } catch {
    return { ok: false, error: fallback };
  }
};

/** A prize warning for one exact change (`key`): what it would end or shrink, null for nothing. */
type ImpactNotice = { key: string; notice: string | null };

// Phase A3: a dry run of the prize cascade before the partner confirms. Fails open: no line.
const fetchImpactNotice = async (scheduleId: string, editBody?: unknown): Promise<string | null> => {
  try {
    const res = await fetch(
      `/api/owner/schedule/${scheduleId}/cancel-impact`,
      editBody === undefined
        ? undefined
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editBody) },
    );
    const reply = (await res.json()) as { ok?: boolean; notice?: string | null };
    return reply.ok ? reply.notice ?? null : null;
  } catch {
    return null;
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
  // What the form held when the partner started this game (or opened this edit): "dirty" = differs from it.
  const [baseline, setBaseline] = useState<ScheduleFormState>(form);
  const [selected, setSelected] = useState<OwnerSchedule | null>(initialSchedule);
  // Set while an existing game is being edited (PATCH instead of POST).
  const [editing, setEditing] = useState<OwnerSchedule | null>(null);
  // The step "Change" jumped to from Review; its Next becomes "Done" and returns there.
  // `reached` flips once that step is on screen; leaving it any other way (the phone's
  // Back) ends the Change, so a later ordinary visit to the step reads "Next" again.
  const [changing, setChanging] = useState<{ step: ScheduleFlowStep; reached: boolean } | null>(null);
  const [historyFrom, setHistoryFrom] = useState<ScheduleSheetStep>("when");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A save or cancel went through: once the sheet has slid away, start over, so the
  // browser's Forward can't reopen a spent Review stuck on "Scheduling…".
  const [finished, setFinished] = useState(false);
  // The latest prize warnings: one for cancelling the open game, one for the edit on Review.
  const [cancelImpact, setCancelImpact] = useState<ImpactNotice | null>(null);
  const [editImpact, setEditImpact] = useState<ImpactNotice | null>(null);
  // Only the latest cancel check may answer: an older one resolving late must not replace it.
  const cancelImpactRequestRef = useRef(0);

  const open = nav.sheet === "schedule";
  const isEditing = editing !== null;
  const steps = scheduleSteps({ gameOptions: GAME_OPTIONS, gameType: form.gameType, isEditing });
  const rawStep = nav.displayStepFor("schedule");
  const current = resolveScheduleStep({
    rawStep,
    steps,
    hasSchedule: selected !== null,
    hasStartTime: form.startTime !== "",
  });

  // Adjust-during-render (react-hooks/set-state-in-effect).
  if (changing && !changing.reached && current === changing.step) setChanging({ ...changing, reached: true });
  else if (changing && changing.reached && current !== changing.step) setChanging(null);
  const changingStep = changing?.step ?? null;

  // A stale or hand-edited `?step=` (or one whose data a reload lost) is corrected: popped back
  // to the screen under it when this sheet pushed one, so no screen gets two entries (F3).
  const urlStep = nav.step;
  const correctStep = nav.correctStep;
  useEffect(() => {
    if (open && urlStep !== null && urlStep !== current) correctStep(current);
  }, [open, urlStep, current, correctStep]);

  // Only the form screens can hold unsaved answers; the lists and the detail screen cannot.
  const onFormScreen = current === "game" || current === "when" || current === "repeat" || current === "review";
  const { closeGuard, dialog, closeWithoutAsking } = useDiscardGuard({
    open,
    dirty: open && onFormScreen && !busy && JSON.stringify(form) !== JSON.stringify(baseline),
    title: isEditing ? "Discard your changes?" : "Discard this game?",
    message: isEditing ? "Your edits to this game won't be saved." : "Nothing is saved until you schedule it.",
    onDiscard: nav.closeSheet,
  });

  // An edit's prize warning, re-checked whenever the timing on Review changes (not the name).
  const editRequest =
    editing && editing.gameType === "live_trivia" && current === "review"
      ? buildScheduleRequest({ venueId, editingId: editing.id, form })
      : null;
  const editImpactBody = editRequest?.ok ? { ...editRequest.body, title: undefined } : null;
  const editImpactKey = editing && editImpactBody ? `${editing.id}:${JSON.stringify(editImpactBody)}` : null;
  useEffect(() => {
    if (!editing || !editImpactKey || !editImpactBody) return;
    let live = true;
    void fetchImpactNotice(editing.id, editImpactBody).then((notice) => {
      if (live) setEditImpact({ key: editImpactKey, notice });
    });
    return () => {
      live = false;
    };
    // editImpactBody is captured by its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editImpactKey]);
  const editNotice = editImpact && editImpact.key === editImpactKey ? editImpact.notice : null;
  // Hold Save until the warning is in, so a fast tap can't skip it. A failed check still sets the key, so Save returns.
  const editChecking = editImpactKey !== null && editImpact?.key !== editImpactKey;

  const startCancel = (schedule: OwnerSchedule) => {
    if (schedule.gameType !== "live_trivia") return;
    setCancelImpact(null);
    const request = ++cancelImpactRequestRef.current;
    void fetchImpactNotice(schedule.id).then((notice) => {
      if (request === cancelImpactRequestRef.current) setCancelImpact({ key: schedule.id, notice });
    });
  };
  const cancelNotice = selected && cancelImpact?.key === selected.id ? cancelImpact.notice : null;
  // Hold "Yes, cancel game" until the warning is in, so a fast tap can't skip it.
  const cancelChecking = selected?.gameType === "live_trivia" && cancelImpact?.key !== selected.id;

  const change: ScheduleFormChange = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  const go = (step: ScheduleSheetStep) => {
    setError(null);
    nav.goToStep(step);
  };

  const returnToReview = () => {
    setChanging(null);
    nav.goBack("review");
  };

  const openHistory = () => {
    setHistoryFrom(current);
    go("history");
  };

  const startNew = () => {
    const blank = freshForm();
    setForm(blank);
    setBaseline(blank);
    setEditing(null);
    setChanging(null);
    const first = scheduleSteps({ gameOptions: GAME_OPTIONS, gameType: blank.gameType })[0];
    go(first);
  };

  const startEdit = (schedule: OwnerSchedule) => {
    const existing = scheduleFormStateFromSchedule(schedule);
    setForm(existing);
    setBaseline(existing);
    setEditing(schedule);
    setChanging(null);
    go("review");
  };

  const openGame = (schedule: OwnerSchedule) => {
    setSelected(schedule);
    go("detail");
  };

  const changeStep = (step: ScheduleFlowStep) => {
    setChanging({ step, reached: false });
    go(step);
  };

  const save = async () => {
    if (busy || editChecking) return;
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
        scheduleId: editing?.id,
        shareScheduleId: !editing && reply.schedule?.id && promoGameForSchedule(form.gameType) ? reply.schedule.id : undefined,
      });
      setFinished(true);
      closeWithoutAsking();
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
      onChanged({ message: `${schedule.title} cancelled`, rewardNotice: reply.rewardNotice ?? null, removed: true });
      setFinished(true);
      closeWithoutAsking();
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
          <div className="space-y-4">
            <ReviewStep
              form={form}
              onChange={change}
              steps={steps}
              isEditing={isEditing}
              onChangeStep={changeStep}
              error={error}
            />
            {editNotice ? <p className="text-sm font-bold text-ht-rose-300">{editNotice}</p> : null}
            {/* A venue setting, saved on its own (Phase 9e): asked here and in the Prize wizard. */}
            <ShareDetailsPanel venueId={venueId} />
          </div>
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
            onStartCancel={() => startCancel(selected)}
            onCancelGame={() => void cancelGame(selected)}
            impactNotice={cancelNotice}
            checkingImpact={cancelChecking}
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
          nextDisabled={editChecking}
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
    ? "Group Games"
    : isEditing
      ? "Edit game"
      : "Schedule a group game";

  const resetIfFinished = () => {
    if (!finished) return;
    const blank = freshForm();
    setForm(blank);
    setBaseline(blank);
    setEditing(null);
    setSelected(null);
    setChanging(null);
    setBusy(false);
    setError(null);
    setFinished(false);
  };

  return (
    <>
      <OwnerSheet
        open={open}
        onRequestClose={nav.closeSheet}
        closeGuard={closeGuard}
        onExited={resetIfFinished}
        title={title}
        footer={footer}
        scrollKey={current}
      >
        <SlideSteps steps={SCHEDULE_SLIDE_ORDER} current={current} renderStep={renderStep} />
      </OwnerSheet>
      {dialog}
    </>
  );
};

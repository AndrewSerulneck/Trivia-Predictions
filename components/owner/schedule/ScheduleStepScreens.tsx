import { useState, type ReactNode } from "react";
import type { SectionLoad } from "@/components/owner/dashboard/LiveGamesSection";
import { ScheduleGameRow } from "@/components/owner/schedule/ScheduleGameRow";
import { StepHeading } from "@/components/owner/sheet/StepHeading";
import { Dropdown } from "@/components/ui/Dropdown";
import {
  durationMinutesFor,
  effectiveTitle,
  endsAtLocalValue,
  formatLocalDateTime,
  RECURRING_OPTIONS,
  repeatSummary,
  safeRounds,
  supportsRecurrence,
  TIMEZONES,
  toggleDay,
  type GameTypeOption,
  type ScheduleFlowStep,
  type ScheduleFormState,
} from "@/lib/ownerScheduleForm";
import {
  displayWindow,
  formatScheduleTime,
  GAME_LABELS,
  recurrenceLabel,
  splitSchedules,
  WEEKDAY_OPTIONS,
} from "@/lib/ownerScheduleDisplay";
import type { OwnerSchedule } from "@/types";

// The screens inside the Schedule Live Games sheet (docs/partner-dashboard-app-redesign-plan.md §4e).
// Presentational: every value and handler comes from ScheduleGameFlow, which keeps
// the form state (SlideSteps remounts a step on every change).

const INPUT_CLASS =
  "w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400";
const LABEL_CLASS = "mb-1.5 block text-base font-bold text-ht-primary";
const STEPPER_BUTTON_CLASS =
  "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-ht-elevated-2 bg-ht-elevated text-3xl font-black text-ht-primary transition active:translate-y-px active:bg-ht-elevated-2";
const TEXT_LINK_CLASS = "min-h-11 px-2 text-sm font-black text-ht-cyan-300 underline-offset-2 hover:underline";

export type ScheduleFormChange = (patch: Partial<ScheduleFormState>) => void;

const ErrorBox = ({ message }: { message: string }) => (
  <div
    role="alert"
    className="rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 py-2 text-xs font-bold text-ht-rose-300"
  >
    {message}
  </div>
);

// ─── Linear steps ───────────────────────────────────────────────────────────

/** Tapping a game moves straight on — no Next button on this step. */
export const GameStep = ({
  options,
  selected,
  onPick,
  onOpenHistory,
}: {
  options: readonly GameTypeOption[];
  selected: string;
  onPick: (option: GameTypeOption) => void;
  onOpenHistory: () => void;
}) => (
  <div>
    <StepHeading hint="Everyone at your venue plays together.">Which game?</StepHeading>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={!option.supported}
          aria-pressed={selected === option.value}
          onClick={() => onPick(option)}
          className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 ${
            selected === option.value ? "border-ht-cyan-400 bg-ht-elevated" : "border-ht-hairline bg-ht-elevated/50"
          }`}
        >
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl ${option.gradient}`}>
            {option.glyph}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-black text-ht-primary">{option.label}</span>
            {!option.supported ? (
              <span className="block text-caption font-bold uppercase tracking-wider text-ht-muted">Coming soon</span>
            ) : null}
          </span>
          <span className="shrink-0 text-lg text-slate-500" aria-hidden>
            ›
          </span>
        </button>
      ))}
    </div>
    <div className="mt-4 flex justify-center">
      <button type="button" onClick={onOpenHistory} className={TEXT_LINK_CLASS}>
        Past games
      </button>
    </div>
  </div>
);

export const WhenStep = ({
  form,
  onChange,
  onOpenHistory,
  showHistoryLink,
}: {
  form: ScheduleFormState;
  onChange: ScheduleFormChange;
  onOpenHistory: () => void;
  /** Only the first screen of the sheet offers History (Game does when it exists). */
  showHistoryLink: boolean;
}) => {
  const [showTimezone, setShowTimezone] = useState(false);
  const rounds = safeRounds(form.rounds);
  const durationMinutes = durationMinutesFor(form.gameType, rounds);
  const endsAt = endsAtLocalValue(form.startTime, form.timezone, durationMinutes);
  const timezoneOptions = (TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES]).map((tz) => ({
    value: tz,
    label: tz,
  }));

  return (
    <div className="space-y-5">
      <StepHeading>When does it start?</StepHeading>

      <div>
        <label htmlFor="schedule-start" className={LABEL_CLASS}>
          Date &amp; time
        </label>
        <input
          id="schedule-start"
          type="datetime-local"
          value={form.startTime}
          onChange={(event) => onChange({ startTime: event.target.value })}
          className={INPUT_CLASS}
        />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-ht-muted">Times are in {form.timezone.replace(/_/g, " ")}.</p>
          <button
            type="button"
            aria-expanded={showTimezone}
            onClick={() => setShowTimezone((value) => !value)}
            className="min-h-11 rounded-lg px-2 text-xs font-black text-ht-cyan-300"
          >
            Change timezone
          </button>
        </div>
        {showTimezone ? (
          <Dropdown
            value={form.timezone}
            onChange={(timezone) => onChange({ timezone })}
            options={timezoneOptions}
            ariaLabel="Timezone"
            className={INPUT_CLASS}
          />
        ) : null}
      </div>

      <div>
        <label htmlFor="schedule-rounds" className={LABEL_CLASS}>
          Number of rounds
        </label>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => onChange({ rounds: Math.max(1, Math.floor(form.rounds) - 1) })}
            aria-label="Decrease number of rounds"
            className={STEPPER_BUTTON_CLASS}
          >
            −
          </button>
          <input
            id="schedule-rounds"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={rounds}
            onChange={(event) => onChange({ rounds: Math.max(1, Math.floor(Number(event.target.value)) || 1) })}
            className="h-14 w-full min-w-0 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-center text-2xl font-black text-ht-primary outline-none focus:border-ht-cyan-400"
          />
          <button
            type="button"
            onClick={() => onChange({ rounds: Math.max(1, Math.floor(form.rounds) + 1) })}
            aria-label="Increase number of rounds"
            className={STEPPER_BUTTON_CLASS}
          >
            +
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-ht-cyan-500/30 bg-ht-cyan-500/10 px-3 py-2" aria-live="polite">
        <p className="text-xs font-bold text-ht-cyan-300">
          {rounds} round{rounds === 1 ? "" : "s"} · about {Math.round(durationMinutes)} min total
        </p>
        <p className="mt-0.5 text-caption font-semibold text-ht-cyan-300/80">
          {endsAt ? `Ends around ${formatLocalDateTime(endsAt)}` : "Pick a start time to see when it ends."}
        </p>
      </div>

      {showHistoryLink ? (
        <div className="flex justify-center">
          <button type="button" onClick={onOpenHistory} className={TEXT_LINK_CLASS}>
            Past games
          </button>
        </div>
      ) : null}
    </div>
  );
};

export const RepeatStep = ({
  form,
  onChange,
  error,
}: {
  form: ScheduleFormState;
  onChange: ScheduleFormChange;
  error: string | null;
}) => (
  <div className="space-y-4">
    <StepHeading hint="Repeating games run on their own until you cancel them.">Does it repeat?</StepHeading>
    <div role="radiogroup" aria-label="Repeat" className="space-y-2">
      {RECURRING_OPTIONS.map((option) => {
        const selected = form.recurringType === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange({ recurringType: option.value })}
            className={`flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left transition active:translate-y-px ${
              selected ? "border-ht-cyan-400 bg-ht-elevated" : "border-ht-hairline bg-ht-elevated/50"
            }`}
          >
            <span
              aria-hidden
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                selected ? "border-ht-cyan-400" : "border-ht-soft"
              }`}
            >
              {selected ? <span className="h-2.5 w-2.5 rounded-full bg-ht-cyan-400" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-black text-ht-primary">{option.label}</span>
              <span className="block text-xs font-semibold text-ht-muted">{option.hint}</span>
            </span>
          </button>
        );
      })}
    </div>

    {form.recurringType === "weekly" ? (
      <div className="flex flex-wrap gap-2">
        {WEEKDAY_OPTIONS.map((day) => {
          const selected = form.recurringDays.includes(day.key);
          return (
            <button
              key={day.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange({ recurringDays: toggleDay(form.recurringDays, day.key) })}
              className={`min-h-11 min-w-[3rem] flex-1 rounded-xl border px-2 py-2 text-sm font-black transition ${
                selected
                  ? "border-ht-cyan-400 bg-ht-cyan-500/15 text-ht-cyan-300"
                  : "border-ht-elevated-2 bg-ht-elevated text-ht-muted"
              }`}
            >
              {day.label}
            </button>
          );
        })}
      </div>
    ) : null}

    {error ? <ErrorBox message={error} /> : null}
  </div>
);

const SummaryRow = ({
  label,
  value,
  detail,
  onChange,
}: {
  label: string;
  value: string;
  detail?: string | null;
  /** Omitted = not editable here (e.g. the game type of an existing game). */
  onChange?: () => void;
}) => (
  <div className="flex items-start gap-3 py-2.5">
    <div className="min-w-0 flex-1">
      <p className="text-caption font-black uppercase tracking-wider text-ht-muted">{label}</p>
      <p className="font-bold text-ht-primary">{value}</p>
      {detail ? <p className="text-xs font-semibold text-ht-muted">{detail}</p> : null}
    </div>
    {onChange ? (
      <button
        type="button"
        onClick={onChange}
        aria-label={`Change ${label.toLowerCase()}`}
        className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-black text-ht-cyan-300"
      >
        Change
      </button>
    ) : null}
  </div>
);

export const ReviewStep = ({
  form,
  onChange,
  steps,
  isEditing,
  onChangeStep,
  error,
}: {
  form: ScheduleFormState;
  onChange: ScheduleFormChange;
  /** The active linear steps: decides which rows can be changed. */
  steps: readonly ScheduleFlowStep[];
  isEditing: boolean;
  onChangeStep: (step: ScheduleFlowStep) => void;
  error: string | null;
}) => {
  const rounds = safeRounds(form.rounds);
  const durationMinutes = durationMinutesFor(form.gameType, rounds);
  const endsAt = endsAtLocalValue(form.startTime, form.timezone, durationMinutes);
  const canChangeGame = steps.includes("game");

  return (
    <div className="space-y-4">
      <StepHeading hint={isEditing ? "Check the details, then save." : "One last look, then it's on the calendar."}>
        {isEditing ? "Review changes" : "Review & name"}
      </StepHeading>

      <div>
        <label htmlFor="schedule-title" className={LABEL_CLASS}>
          Name
        </label>
        <input
          id="schedule-title"
          type="text"
          value={form.title ?? effectiveTitle(form)}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder={GAME_LABELS[form.gameType]}
          className={INPUT_CLASS}
        />
      </div>

      <div className="divide-y divide-ht-hairline rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3">
        <SummaryRow
          label="Game"
          value={GAME_LABELS[form.gameType]}
          detail={isEditing ? "Game type can't be changed" : null}
          onChange={canChangeGame ? () => onChangeStep("game") : undefined}
        />
        <SummaryRow
          label="Starts"
          value={form.startTime ? formatLocalDateTime(form.startTime) : "Not set"}
          detail={form.timezone.replace(/_/g, " ")}
          onChange={() => onChangeStep("when")}
        />
        <SummaryRow
          label="Length"
          value={`${rounds} round${rounds === 1 ? "" : "s"} · about ${Math.round(durationMinutes)} min`}
          detail={endsAt ? `Ends around ${formatLocalDateTime(endsAt)}` : null}
          onChange={() => onChangeStep("when")}
        />
        {supportsRecurrence(form.gameType) ? (
          <SummaryRow label="Repeats" value={repeatSummary(form)} onChange={() => onChangeStep("repeat")} />
        ) : null}
      </div>

      {error ? <ErrorBox message={error} /> : null}
    </div>
  );
};

// ─── Lists and detail ───────────────────────────────────────────────────────

const GamesUnavailable = ({ status, message }: { status: "loading" | "error"; message?: string }) => (
  <p className="rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3 py-4 text-center text-sm font-semibold text-ht-muted">
    {status === "loading" ? "Loading your games…" : (message ?? "Couldn't load your games.")}
  </p>
);

export type ScheduleGames = SectionLoad<OwnerSchedule>;

/** Every upcoming game (the dashboard shows the first 3), with the "add" and "past games" entries. */
export const AllGamesScreen = ({
  games,
  nowMs,
  onOpen,
  onAdd,
  onOpenHistory,
}: {
  games: ScheduleGames;
  nowMs: number;
  onOpen: (schedule: OwnerSchedule) => void;
  onAdd: () => void;
  onOpenHistory: () => void;
}) => {
  const upcoming = games.status === "ready" ? splitSchedules(games.items, nowMs).upcoming : [];
  return (
    <div className="space-y-3">
      <StepHeading>Upcoming games</StepHeading>
      {games.status !== "ready" ? (
        <GamesUnavailable status={games.status} message={games.status === "error" ? games.message : undefined} />
      ) : upcoming.length === 0 ? (
        <p className="rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3 py-4 text-center text-sm font-semibold text-ht-muted">
          Nothing scheduled yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((schedule) => (
            <li key={schedule.id}>
              <ScheduleGameRow schedule={schedule} onClick={() => onOpen(schedule)} />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="min-h-12 w-full rounded-[14px] border-2 border-dashed border-ht-soft px-4 py-3 text-sm font-black text-ht-cyan-300 transition active:translate-y-px"
      >
        + Schedule another game
      </button>
      <div className="flex justify-center">
        <button type="button" onClick={onOpenHistory} className={TEXT_LINK_CLASS}>
          Past games
        </button>
      </div>
    </div>
  );
};

/** Past games, newest first. Read-only — an ended game can't be edited or cancelled. */
export const HistoryScreen = ({ games, nowMs }: { games: ScheduleGames; nowMs: number }) => {
  const past = games.status === "ready" ? splitSchedules(games.items, nowMs).past : [];
  return (
    <div className="space-y-3">
      <StepHeading>Past games</StepHeading>
      {games.status !== "ready" ? (
        <GamesUnavailable status={games.status} message={games.status === "error" ? games.message : undefined} />
      ) : past.length === 0 ? (
        <p className="rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3 py-4 text-center text-sm font-semibold text-ht-muted">
          No past games yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {past.map((schedule) => (
            <li key={schedule.id}>
              <ScheduleGameRow schedule={schedule} ended />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** One game: its details, Edit, and Cancel game (with an in-sheet confirmation). */
export const GameDetailScreen = ({
  schedule,
  onEdit,
  onCancelGame,
  busy,
  error,
}: {
  schedule: OwnerSchedule;
  onEdit: () => void;
  onCancelGame: () => void;
  busy: boolean;
  error: string | null;
}) => {
  const [confirming, setConfirming] = useState(false);
  const window = displayWindow(schedule);

  return (
    <div className="space-y-4">
      <StepHeading>{schedule.title}</StepHeading>

      <div className="divide-y divide-ht-hairline rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3">
        <SummaryRow label="Game" value={GAME_LABELS[schedule.gameType]} />
        <SummaryRow
          label="Next run"
          value={`${formatScheduleTime(window.startTime, schedule.timezone)} – ${formatScheduleTime(window.endTime, schedule.timezone)}`}
          detail={schedule.timezone.replace(/_/g, " ")}
        />
        <SummaryRow label="Repeats" value={recurrenceLabel(schedule) ?? "Just once"} />
      </div>

      {error ? <ErrorBox message={error} /> : null}

      {confirming ? (
        <div className="space-y-3 rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 p-3">
          <p className="text-sm font-bold text-ht-rose-300">
            Cancel this game? Players will be returned to the lobby if it&apos;s live.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="min-h-11 rounded-xl border border-ht-soft bg-ht-elevated px-3 text-sm font-black text-ht-primary disabled:opacity-50"
            >
              Keep game
            </button>
            <button
              type="button"
              onClick={onCancelGame}
              disabled={busy}
              className="min-h-11 rounded-xl border border-ht-rose-500/40 bg-ht-rose-500/20 px-3 text-sm font-black text-ht-rose-300 disabled:opacity-50"
            >
              {busy ? "Cancelling…" : "Yes, cancel game"}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="min-h-11 rounded-xl border border-ht-soft bg-ht-cyan-500 px-3 text-sm font-black text-slate-950 transition active:translate-y-px"
          >
            Edit game
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="min-h-11 rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 text-sm font-black text-ht-rose-300 transition active:translate-y-px"
          >
            Cancel game
          </button>
        </div>
      )}
    </div>
  );
};

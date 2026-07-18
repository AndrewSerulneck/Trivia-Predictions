"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { Dropdown } from "@/components/ui/Dropdown";
import {
  datetimeLocalValueToUtcIso,
  getCurrentOrNextScheduleWindow,
  utcIsoToDatetimeLocalValue,
} from "@/lib/categoryBlitzScheduleTime";
import { gameDurationMinutes, isContinuousDefaultEnabled, roundsFromWindowMinutes } from "@/lib/categoryBlitzShared";
import { liveTriviaDurationMinutes, roundsFromLiveTriviaWindowMinutes } from "@/lib/liveTriviaShared";
import type { CategoryBlitzRecurringType, OwnerSchedule, OwnerScheduleGameType } from "@/types";

/** Wall-clock length in minutes for N rounds of the given game — the server derives the same. */
const durationMinutesFor = (gameType: OwnerScheduleGameType, rounds: number): number =>
  gameType === "live_trivia" ? liveTriviaDurationMinutes(rounds) : gameDurationMinutes(rounds);

/** Best-effort inverse, for prefilling the edit form's rounds field from a stored window. */
const roundsFromWindowMinutesFor = (gameType: OwnerScheduleGameType, windowMinutes: number): number =>
  gameType === "live_trivia"
    ? roundsFromLiveTriviaWindowMinutes(windowMinutes)
    : roundsFromWindowMinutes(windowMinutes);

const GAME_LABELS: Record<OwnerScheduleGameType, string> = {
  category_blitz: "Category Blitz",
  live_trivia: "Live Trivia",
};

// Per-game accent for list pills (matches the picker gradients / app/globals.css tokens).
const GAME_PILL_STYLES: Record<OwnerScheduleGameType, string> = {
  category_blitz: "bg-ht-cyan-500/15 text-ht-cyan-300",
  live_trivia: "bg-sky-500/15 text-sky-300",
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

// Owner recurrence is a Live Trivia–only feature and limited to what the engine
// actually recurs on (see docs/… and Phase 3 plan). Monthly/yearly are omitted
// because the engine treats them as a single one-off occurrence.
const RECURRING_OPTIONS: { value: CategoryBlitzRecurringType; label: string }[] = [
  { value: "none", label: "One-off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

// Keys are the lowercase 3-letter codes the engine stores (sun..sat).
const WEEKDAY_OPTIONS: { key: string; label: string }[] = [
  { key: "sun", label: "Sun" },
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
];

const WEEKDAY_LABEL: Record<string, string> = Object.fromEntries(
  WEEKDAY_OPTIONS.map((d) => [d.key, d.label]),
);

/** The next (or currently-open) occurrence window for a schedule, falling back to the stored one-off window. */
function displayWindow(schedule: OwnerSchedule): { startTime: string; endTime: string } {
  const occurrence = getCurrentOrNextScheduleWindow(schedule);
  if (occurrence) {
    return {
      startTime: occurrence.windowStart.toISOString(),
      endTime: occurrence.windowEnd.toISOString(),
    };
  }
  return { startTime: schedule.startTime, endTime: schedule.endTime };
}

/** Short human label for a schedule's recurrence, or null for one-off. */
function recurrenceLabel(schedule: OwnerSchedule): string | null {
  if (schedule.recurringType === "daily") return "Daily";
  if (schedule.recurringType === "weekly") {
    const days = WEEKDAY_OPTIONS.filter((d) => schedule.recurringDays?.includes(d.key)).map(
      (d) => d.label,
    );
    return days.length > 0 ? `Weekly · ${days.join(", ")}` : "Weekly";
  }
  return null;
}

type Venue = { id: string; name: string };

type GameTypeOption = {
  value: OwnerScheduleGameType;
  label: string;
  glyph: string;
  gradient: string;
  supported: boolean;
};

// Category Blitz now defaults to an always-on continuous loop rather than a
// scheduled window (see docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md), so
// once that rollout flag is on it's dropped from the schedulable game types
// entirely — there is no "number of rounds" to ask for anymore. Flag off
// keeps the legacy picker exactly as it was, for rollback safety.
const ALL_GAME_TYPE_OPTIONS: GameTypeOption[] = [
  { value: "category_blitz", label: "Category Blitz", glyph: "🔤", gradient: "bg-ht-game-blitz", supported: true },
  { value: "live_trivia", label: "Live Trivia", glyph: "🧠", gradient: "bg-ht-game-live", supported: true },
];

const GAME_TYPE_OPTIONS: GameTypeOption[] = isContinuousDefaultEnabled()
  ? ALL_GAME_TYPE_OPTIONS.filter((option) => option.value !== "category_blitz")
  : ALL_GAME_TYPE_OPTIONS;

function formatScheduleTime(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function dateChip(iso: string, timeZone: string): { month: string; day: string } {
  try {
    const d = new Date(iso);
    return {
      month: d.toLocaleString("en-US", { timeZone, month: "short" }).toUpperCase(),
      day: d.toLocaleString("en-US", { timeZone, day: "numeric" }),
    };
  } catch {
    return { month: "—", day: "—" };
  }
}

const OwnerSchedulePage = () => {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [schedules, setSchedules] = useState<OwnerSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<OwnerSchedule | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/owner/venues");
        if (res.status === 401) {
          router.push("/owner/login");
          return;
        }
        const json = (await res.json()) as { ok: boolean; venues?: Venue[] };
        const loaded = json.venues ?? [];
        setVenues(loaded);
        setSelectedVenueId((prev) => prev || loaded[0]?.id || "");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  const fetchSchedules = useCallback(async () => {
    if (!selectedVenueId) {
      setSchedules([]);
      return;
    }
    setLoadError(null);
    try {
      // No gameType → merged calendar across both engines (Category Blitz + Live Trivia).
      const res = await fetch(
        `/api/owner/schedule?venueId=${encodeURIComponent(selectedVenueId)}`,
        { cache: "no-store" },
      );
      if (res.status === 401) {
        router.push("/owner/login");
        return;
      }
      const json = (await res.json()) as { ok: boolean; schedules?: OwnerSchedule[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed to load games.");
      setSchedules(json.schedules ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load games.");
    }
  }, [selectedVenueId, router]);

  useEffect(() => {
    void fetchSchedules();
  }, [fetchSchedules]);

  const nowMs = Date.now();
  // Bucket by the NEXT occurrence's window, not the stored (first) one — a weekly
  // series whose first occurrence has passed still has a future occurrence and
  // belongs in "Upcoming", not "Past".
  const upcoming = useMemo(
    () =>
      schedules
        .filter((s) => Date.parse(displayWindow(s).endTime) >= nowMs)
        .sort((a, b) => Date.parse(displayWindow(a).startTime) - Date.parse(displayWindow(b).startTime)),
    [schedules, nowMs],
  );
  const past = useMemo(
    () =>
      schedules
        .filter((s) => Date.parse(displayWindow(s).endTime) < nowMs)
        .sort((a, b) => Date.parse(displayWindow(b).startTime) - Date.parse(displayWindow(a).startTime)),
    [schedules, nowMs],
  );

  const selectedVenue = venues.find((v) => v.id === selectedVenueId);

  const handleDelete = async (scheduleId: string) => {
    if (!confirm("Cancel this game? Players will be returned to the lobby if it's live.")) return;
    try {
      const res = await fetch(`/api/owner/schedule/${scheduleId}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Couldn't cancel that game.");
      await fetchSchedules();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't cancel that game.");
    }
  };

  return (
    <OwnerShell title="Live Games" subtitle="Games your whole venue plays together" maxWidth="lg" variant="dark">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/owner/dashboard"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ht-exit-border bg-gradient-to-br from-ht-exit-from via-ht-exit-via to-ht-exit-to px-4 text-sm font-black text-ht-exit-text"
          >
            ← Dashboard
          </Link>

          {venues.length > 1 ? (
            <Dropdown
              value={selectedVenueId}
              onChange={(next) => {
                setSelectedVenueId(next);
                setShowForm(false);
              }}
              options={venues.map((v) => ({ value: v.id, label: v.name }))}
              ariaLabel="Select venue"
              size="sm"
              className="min-h-11 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
            />
          ) : null}
        </div>

        {loading ? (
          <p className="text-center text-sm font-semibold text-ht-muted">Loading…</p>
        ) : !selectedVenueId ? (
          <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
            <p className="text-sm font-semibold text-ht-muted">No venue found for this account.</p>
          </div>
        ) : (
          <>
            {loadError ? (
              <div className="rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 py-2 text-xs font-bold text-ht-rose-300">
                {loadError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setEditingSchedule(null);
                setShowForm((v) => !v);
              }}
              className="w-full rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-3 text-lg font-black text-slate-950 transition active:translate-y-px"
            >
              {showForm ? "Cancel" : GAME_TYPE_OPTIONS.length === 1 ? `+ Schedule ${GAME_TYPE_OPTIONS[0].label}` : "+ Schedule a game"}
            </button>

            {showForm ? (
              <ScheduleForm
                venueId={selectedVenueId}
                editingSchedule={editingSchedule}
                onSaved={() => {
                  setShowForm(false);
                  setEditingSchedule(null);
                  void fetchSchedules();
                }}
                onCancel={() => {
                  setShowForm(false);
                  setEditingSchedule(null);
                }}
              />
            ) : null}

            <ScheduleList
              title="Upcoming Games"
              schedules={upcoming}
              onDelete={(id) => void handleDelete(id)}
              onEdit={(schedule) => {
                setEditingSchedule(schedule);
                setShowForm(true);
              }}
            />

            {upcoming.length === 0 && !showForm ? (
              <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ht-game-blitz text-2xl">
                  🎮
                </div>
                <p className="ht-h2 mt-4">No games on the board</p>
                <p className="mt-2 text-sm font-semibold text-ht-muted">
                  Schedule a live game for {selectedVenue?.name ?? "your venue"} — pick a game, date, and time,
                  and it&apos;ll appear here.
                </p>
              </div>
            ) : null}

            {past.length > 0 ? <ScheduleList title="Past" schedules={past} onDelete={null} dimmed /> : null}
          </>
        )}
      </div>
    </OwnerShell>
  );
};

function ScheduleList({
  title,
  schedules,
  onDelete,
  onEdit,
  dimmed,
}: {
  title: string;
  schedules: OwnerSchedule[];
  onDelete: ((id: string) => void) | null;
  onEdit?: (schedule: OwnerSchedule) => void;
  dimmed?: boolean;
}) {
  if (schedules.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">{title}</p>
      {schedules.map((schedule) => {
        const window = displayWindow(schedule);
        const chip = dateChip(window.startTime, schedule.timezone);
        const recurrence = recurrenceLabel(schedule);
        return (
          <div
            key={schedule.id}
            className={`flex items-center gap-3 rounded-[14px] border border-ht-hairline bg-ht-surface p-3 shadow-ht-card ${dimmed ? "opacity-70" : ""}`}
          >
            <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-ht-elevated">
              <span className="text-[10px] font-black uppercase tracking-wider text-ht-cyan-300">{chip.month}</span>
              <span className="ht-h2 leading-none">{chip.day}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-black text-ht-primary">{schedule.title}</div>
              <div className="mt-0.5 text-sm font-bold text-ht-primary">
                {formatScheduleTime(window.startTime, schedule.timezone)} –{" "}
                {formatScheduleTime(window.endTime, schedule.timezone)}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider ${
                    dimmed ? "bg-ht-elevated text-ht-muted" : GAME_PILL_STYLES[schedule.gameType]
                  }`}
                >
                  {dimmed ? "Ended" : GAME_LABELS[schedule.gameType]}
                </span>
                {recurrence ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-ht-elevated px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider text-ht-muted">
                    🔁 {recurrence}
                  </span>
                ) : null}
              </div>
            </div>
            {onEdit || onDelete ? (
              <div className="flex shrink-0 flex-row gap-1.5">
                {onEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(schedule)}
                    className="rounded-lg border border-ht-elevated-2 bg-ht-elevated px-2.5 py-1.5 text-[13px] font-black uppercase tracking-wider text-ht-primary"
                  >
                    Edit
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(schedule.id)}
                    className="rounded-lg border border-ht-rose-500/30 bg-ht-rose-500/10 px-2.5 py-1.5 text-[13px] font-black uppercase tracking-wider text-ht-rose-300"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ScheduleForm({
  venueId,
  editingSchedule,
  onSaved,
  onCancel,
}: {
  venueId: string;
  editingSchedule: OwnerSchedule | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEditing = editingSchedule !== null;
  const [gameType, setGameType] = useState<OwnerScheduleGameType>(
    editingSchedule?.gameType ?? GAME_TYPE_OPTIONS[0]?.value ?? "live_trivia",
  );
  const [title, setTitle] = useState(editingSchedule?.title ?? "");
  const [startTime, setStartTime] = useState(
    editingSchedule ? utcIsoToDatetimeLocalValue(editingSchedule.startTime, editingSchedule.timezone) : "",
  );
  const [rounds, setRounds] = useState(
    editingSchedule ? roundsFromWindowMinutesFor(editingSchedule.gameType, editingSchedule.windowMinutes) : 3,
  );
  const [timezone, setTimezone] = useState(editingSchedule?.timezone ?? "America/New_York");
  // Recurrence is a Live Trivia–only feature (see Phase 3 plan).
  const [recurringType, setRecurringType] = useState<CategoryBlitzRecurringType>(
    editingSchedule?.recurringType ?? "none",
  );
  const [recurringDays, setRecurringDays] = useState<string[]>(editingSchedule?.recurringDays ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safeRounds = Math.max(1, Math.floor(rounds) || 1);
  const durationMinutes = durationMinutesFor(gameType, safeRounds);
  const supportsRecurrence = gameType === "live_trivia";

  const toggleRecurringDay = (key: string) =>
    setRecurringDays((days) => (days.includes(key) ? days.filter((d) => d !== key) : [...days, key]));

  const endsAtLabel = useMemo(() => {
    if (!startTime) return null;
    try {
      const startMs = Date.parse(datetimeLocalValueToUtcIso(startTime, timezone));
      const endIso = new Date(startMs + durationMinutes * 60_000).toISOString();
      return utcIsoToDatetimeLocalValue(endIso, timezone).replace("T", " · ");
    } catch {
      return null;
    }
  }, [startTime, timezone, durationMinutes]);

  const handleSave = async () => {
    if (!title.trim() || !startTime) {
      setError("Title and start time are required.");
      return;
    }
    if (supportsRecurrence && recurringType === "weekly" && recurringDays.length === 0) {
      setError("Select at least one day for weekly recurring schedules.");
      return;
    }

    // Recurrence only applies to Live Trivia; anything else is always one-off.
    const outgoingRecurringType = supportsRecurrence ? recurringType : "none";
    const outgoingRecurringDays =
      supportsRecurrence && recurringType === "weekly" ? recurringDays : [];

    setSaving(true);
    setError(null);
    try {
      const startIso = datetimeLocalValueToUtcIso(startTime, timezone);
      const endIso = new Date(Date.parse(startIso) + durationMinutes * 60_000).toISOString();
      const endLocal = utcIsoToDatetimeLocalValue(endIso, timezone);

      const res = editingSchedule
        ? await fetch(`/api/owner/schedule/${editingSchedule.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: title.trim(),
              startTime,
              endTime: endLocal,
              timezone,
              rounds: safeRounds,
              recurringType: outgoingRecurringType,
              recurringDays: outgoingRecurringDays,
            }),
          })
        : await fetch("/api/owner/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              venueId,
              title: title.trim(),
              startTime,
              endTime: endLocal,
              timezone,
              gameType,
              rounds: safeRounds,
              recurringType: outgoingRecurringType,
              recurringDays: outgoingRecurringDays,
            }),
          });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Couldn't save that game.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that game.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-ht-hairline bg-ht-surface p-4 shadow-ht-card">
      {isEditing ? (
        <div className="flex items-center gap-2 rounded-xl border border-ht-hairline bg-ht-elevated/50 p-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${GAME_TYPE_OPTIONS.find((o) => o.value === gameType)?.gradient ?? ""}`}>
            {GAME_TYPE_OPTIONS.find((o) => o.value === gameType)?.glyph}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-black text-ht-primary">{GAME_LABELS[gameType]}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-ht-muted">Game type can&apos;t be changed</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {GAME_TYPE_OPTIONS.map((option) => {
            const selected = gameType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={!option.supported}
                onClick={() => setGameType(option.value)}
                className={`flex items-center gap-2 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected ? "border-ht-cyan-400 bg-ht-elevated" : "border-ht-hairline bg-ht-elevated/50"
                }`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${option.gradient}`}>
                  {option.glyph}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-black text-ht-primary">{option.label}</div>
                  {!option.supported ? (
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ht-muted">Coming soon</div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-base font-bold text-ht-primary">Title (optional)</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Friday Night Category Blitz"
          className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-base font-bold text-ht-primary">Date & time</label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-base font-bold text-ht-primary">Timezone</label>
          <Dropdown
            value={timezone}
            onChange={setTimezone}
            options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
            ariaLabel="Timezone"
            className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-base font-bold text-ht-primary">Number of rounds</label>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => setRounds((r) => Math.max(1, Math.floor(r) - 1))}
            aria-label="Decrease number of rounds"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-ht-elevated-2 bg-ht-elevated text-3xl font-black text-ht-primary transition active:translate-y-px active:bg-ht-elevated-2"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={safeRounds}
            onChange={(e) => setRounds(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
            className="h-14 w-full min-w-0 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-center text-2xl font-black text-ht-primary outline-none focus:border-ht-cyan-400"
          />
          <button
            type="button"
            onClick={() => setRounds((r) => Math.max(1, Math.floor(r) + 1))}
            aria-label="Increase number of rounds"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-ht-elevated-2 bg-ht-elevated text-3xl font-black text-ht-primary transition active:translate-y-px active:bg-ht-elevated-2"
          >
            +
          </button>
        </div>
      </div>

      {supportsRecurrence ? (
        <div>
          <label className="mb-1.5 block text-base font-bold text-ht-primary">Repeats</label>
          <Dropdown
            value={recurringType}
            onChange={setRecurringType}
            options={RECURRING_OPTIONS}
            ariaLabel="Repeats"
            className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
          />

          {recurringType === "weekly" ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const selected = recurringDays.includes(day.key);
                return (
                  <button
                    key={day.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleRecurringDay(day.key)}
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

          {recurringType === "weekly" ? (
            <p className="mt-1.5 text-[11px] font-semibold text-ht-muted">
              Runs every selected day at this time.
            </p>
          ) : recurringType === "daily" ? (
            <p className="mt-1.5 text-[11px] font-semibold text-ht-muted">Runs every day at this time.</p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-ht-cyan-500/30 bg-ht-cyan-500/10 px-3 py-2">
        <p className="text-xs font-bold text-ht-cyan-300">
          {safeRounds} round{safeRounds === 1 ? "" : "s"} · about {Math.round(durationMinutes)} min total
        </p>
        {endsAtLabel ? (
          <p className="mt-0.5 text-[11px] font-semibold text-ht-cyan-300/80">Ends around {endsAtLabel}</p>
        ) : (
          <p className="mt-0.5 text-[11px] font-semibold text-ht-cyan-300/80">
            Pick a start time to see when it ends.
          </p>
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 py-2 text-xs font-bold text-ht-rose-300">
          {error}
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-ht-soft bg-ht-elevated px-4 py-2.5 text-sm font-black text-ht-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex-1 rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
        >
          {saving ? (isEditing ? "Saving…" : "Scheduling…") : isEditing ? "Save changes" : "Schedule game"}
        </button>
      </div>
    </div>
  );
}

export default OwnerSchedulePage;

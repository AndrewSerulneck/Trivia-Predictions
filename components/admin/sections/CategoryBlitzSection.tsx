"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { datetimeLocalValueToUtcIso, utcIsoToDatetimeLocalValue } from "@/lib/categoryBlitzScheduleTime";
import { gameDurationMinutes, roundsFromWindowMinutes } from "@/lib/categoryBlitzShared";
import type { Venue, CategoryBlitzSchedule, CategoryBlitzSession, CategoryBlitzRecurringType } from "@/types";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const RECURRING_OPTIONS: Array<{ value: CategoryBlitzRecurringType; label: string }> = [
  { value: "none", label: "None (One-off)" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const WEEKDAY_OPTIONS = [
  { key: "sun", label: "Sun" },
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
] as const;

function formatScheduleTime(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function formatDuration(windowMinutes: number): string {
  const totalMinutes = Math.max(1, Math.round(windowMinutes));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr${hours === 1 ? "" : "s"}`;
  return `${hours} hr ${minutes} min`;
}

function formatRecurringLabel(schedule: Pick<CategoryBlitzSchedule, "recurringType" | "recurringDays">): string {
  if (schedule.recurringType === "daily") return "Daily";
  if (schedule.recurringType === "weekly") {
    const days = WEEKDAY_OPTIONS
      .filter((day) => schedule.recurringDays.includes(day.key))
      .map((day) => day.label);
    return days.length > 0 ? `Weekly: ${days.join(", ")}` : "Weekly";
  }
  return "One-off";
}

export function CategoryBlitzSection({ venues = [] }: { venues?: Venue[] }) {
  const [selectedVenueId, setSelectedVenueId] = useState<string>(() => venues[0]?.id ?? "");

  useEffect(() => {
    if (!selectedVenueId && venues[0]?.id) {
      const nextVenueId = venues[0].id;
      Promise.resolve().then(() => setSelectedVenueId(nextVenueId));
    }
  }, [selectedVenueId, venues]);

  return (
    <div className="space-y-5 text-sm">
      <div>
        <h2 className="text-base font-black text-white">Category Blitz Schedule Builder</h2>
        <p className="text-slate-400">
          Schedule Category Blitz for a venue by choosing an exact start day/time and end day/time.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Venue</label>
        <select
          value={selectedVenueId}
          onChange={(event) => setSelectedVenueId(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name ?? venue.id}
            </option>
          ))}
        </select>
      </div>

      <LiveSessionPanel venueId={selectedVenueId} />
      <SchedulesPanel venueId={selectedVenueId} />
    </div>
  );
}

const SESSION_POLL_MS = 15_000;

function sessionStatusLabel(status: string): string {
  if (status === "lobby") return "Lobby";
  if (status === "active") return "Active";
  if (status === "scoring") return "Scoring";
  return status;
}

function LiveSessionPanel({ venueId }: { venueId: string }) {
  const [session, setSession] = useState<CategoryBlitzSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [ending, setEnding] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchSession = useCallback(async () => {
    if (!venueId) {
      if (mountedRef.current) setSession(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/category-blitz/sessions?venueId=${encodeURIComponent(venueId)}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as { ok: boolean; session?: CategoryBlitzSession | null };
      if (mountedRef.current) setSession(json.session ?? null);
    } catch {
      // Non-fatal — panel just shows stale/no data until the next poll.
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    setMsg(null);
    void fetchSession();
    const interval = window.setInterval(() => void fetchSession(), SESSION_POLL_MS);
    return () => window.clearInterval(interval);
  }, [fetchSession]);

  const handleEnd = async () => {
    if (!session) return;
    if (!confirm("End this Category Blitz session now? Players will be returned to the idle screen.")) return;

    setEnding(true);
    setMsg(null);
    try {
      const response = await fetch(`/api/category-blitz/sessions/${session.id}/end`, { method: "POST" });
      const json = (await response.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed to end session.");

      setMsg({ text: "Session ended.", ok: true });
      await fetchSession();
    } catch (error) {
      setMsg({ text: error instanceof Error ? error.message : "Failed to end session.", ok: false });
    } finally {
      if (mountedRef.current) setEnding(false);
    }
  };

  if (!venueId) return null;

  const isLive = session != null && session.status !== "complete";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Live session</p>
          {loading && !session ? (
            <p className="mt-0.5 text-sm text-slate-400">Checking...</p>
          ) : isLive ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                {sessionStatusLabel(session!.status)}
              </span>
              <span className="text-xs text-slate-500">source: {session!.source}</span>
            </div>
          ) : (
            <p className="mt-0.5 text-sm text-slate-400">No live session right now.</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {isLive ? (
            <button
              type="button"
              onClick={() => void handleEnd()}
              disabled={ending}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ending ? "Ending..." : "End session now"}
            </button>
          ) : null}
        </div>
      </div>
      {msg && (
        <p className={`mt-2 text-xs font-semibold ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>
      )}
    </div>
  );
}

function SchedulesPanel({ venueId }: { venueId: string }) {
  const [schedules, setSchedules] = useState<CategoryBlitzSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [rounds, setRounds] = useState(1);
  const [timezone, setTimezone] = useState("America/New_York");
  const [recurringType, setRecurringType] = useState<CategoryBlitzRecurringType>("none");
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  // Tracks the schedule's stored duration while editing, so we can warn before
  // silently changing it if the round-count reconstruction doesn't match exactly.
  const [editingOriginalWindowMinutes, setEditingOriginalWindowMinutes] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetForm = useCallback(() => {
    setTitle("");
    setStartTime("");
    setRounds(1);
    setTimezone("America/New_York");
    setRecurringType("none");
    setRecurringDays([]);
  }, []);

  const fetchSchedules = useCallback(async () => {
    if (!venueId) {
      if (mountedRef.current) setSchedules([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/category-blitz/schedules?venueId=${encodeURIComponent(venueId)}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as { ok: boolean; schedules?: CategoryBlitzSchedule[] };
      if (mountedRef.current) setSchedules(json.schedules ?? []);
    } catch {
      if (mountedRef.current) setMsg({ text: "Failed to load schedules.", ok: false });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    void fetchSchedules();
  }, [fetchSchedules]);

  useEffect(() => {
    setShowForm(false);
    setEditingId(null);
    setEditingOriginalWindowMinutes(null);
    setMsg(null);
    resetForm();
  }, [venueId, resetForm]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingOriginalWindowMinutes(null);
    setMsg(null);
    resetForm();
  }, [resetForm]);

  const openEdit = (schedule: CategoryBlitzSchedule) => {
    setEditingId(schedule.id);
    setShowForm(false);
    setTitle(schedule.title);
    setTimezone(schedule.timezone);
    setStartTime(utcIsoToDatetimeLocalValue(schedule.startTime, schedule.timezone));
    setRounds(roundsFromWindowMinutes(schedule.windowMinutes));
    setRecurringType(schedule.recurringType ?? "none");
    setRecurringDays(schedule.recurringDays ?? []);
    setEditingOriginalWindowMinutes(schedule.windowMinutes);
    setMsg(null);
  };

  const validateForm = () => {
    if (!venueId) {
      setMsg({ text: "Select a venue before creating a schedule.", ok: false });
      return false;
    }
    if (!title.trim() || !startTime) {
      setMsg({ text: "Title and start time are required.", ok: false });
      return false;
    }
    if (!Number.isFinite(rounds) || rounds < 1) {
      setMsg({ text: "At least 1 round is required.", ok: false });
      return false;
    }
    if (recurringType === "weekly" && recurringDays.length === 0) {
      setMsg({ text: "Select at least one day for weekly recurring schedules.", ok: false });
      return false;
    }
    return true;
  };

  /** Derive the end datetime-local value from start time + round count, in the selected timezone. */
  const computeEndTime = (): string => {
    const startUtcMs = Date.parse(datetimeLocalValueToUtcIso(startTime, timezone));
    const endUtcIso = new Date(startUtcMs + gameDurationMinutes(rounds) * 60_000).toISOString();
    return utcIsoToDatetimeLocalValue(endUtcIso, timezone);
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setMsg(null);
    try {
      const response = await fetch("/api/category-blitz/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          title: title.trim(),
          startTime,
          endTime: computeEndTime(),
          timezone,
          recurringType,
          recurringDays: recurringType === "weekly" ? recurringDays : [],
        }),
      });
      const json = (await response.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed to create schedule.");

      setMsg({ text: "Schedule created.", ok: true });
      setShowForm(false);
      resetForm();
      await fetchSchedules();
    } catch (error) {
      setMsg({ text: error instanceof Error ? error.message : "Failed to create schedule.", ok: false });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !validateForm()) return;

    // roundsFromWindowMinutes is a lossy inverse of gameDurationMinutes — if the
    // stored duration doesn't exactly fit the rounds*3+(rounds-1)*7 formula (e.g.
    // a schedule from before round-based scheduling existed), saving would
    // silently reinterpret and change its length. Confirm with the admin first.
    const newWindowMinutes = gameDurationMinutes(rounds);
    if (editingOriginalWindowMinutes != null && newWindowMinutes !== editingOriginalWindowMinutes) {
      const proceed = confirm(
        `This schedule's duration will change from ${formatDuration(editingOriginalWindowMinutes)} to ${formatDuration(newWindowMinutes)} to match ${rounds} round${rounds === 1 ? "" : "s"}. Continue?`
      );
      if (!proceed) return;
    }

    setSaving(true);
    setMsg(null);
    try {
      const response = await fetch(`/api/category-blitz/schedules/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startTime,
          endTime: computeEndTime(),
          timezone,
          recurringType,
          recurringDays: recurringType === "weekly" ? recurringDays : [],
        }),
      });
      const json = (await response.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed to update schedule.");

      setMsg({ text: "Schedule updated.", ok: true });
      setEditingId(null);
      resetForm();
      await fetchSchedules();
    } catch (error) {
      setMsg({ text: error instanceof Error ? error.message : "Failed to update schedule.", ok: false });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    if (!confirm("Delete this schedule?")) return;

    try {
      const response = await fetch(`/api/category-blitz/schedules/${scheduleId}`, { method: "DELETE" });
      const json = (await response.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed to delete schedule.");

      setMsg({ text: "Schedule deleted.", ok: true });
      if (editingId === scheduleId) cancelEdit();
      await fetchSchedules();
    } catch (error) {
      setMsg({ text: error instanceof Error ? error.message : "Failed to delete schedule.", ok: false });
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
            msg.ok ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-rose-300 bg-rose-50 text-rose-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      {!venueId ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-500">No venue selected.</p>
          <p className="mt-1 text-xs text-slate-400">Choose a venue to manage its Category Blitz schedule.</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wider text-slate-400">
          {loading ? "Loading..." : `${schedules.length} schedule${schedules.length === 1 ? "" : "s"}`}
        </p>
        <button
          type="button"
          disabled={!venueId}
          onClick={() => {
            cancelEdit();
            setShowForm((value) => !value);
            setMsg(null);
          }}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showForm ? "Cancel" : "+ New Schedule"}
        </button>
      </div>

      {showForm ? (
        <ScheduleEditor
          mode="create"
          title={title}
          startTime={startTime}
          rounds={rounds}
          timezone={timezone}
          recurringType={recurringType}
          recurringDays={recurringDays}
          saving={saving}
          onTitleChange={setTitle}
          onStartTimeChange={setStartTime}
          onRoundsChange={setRounds}
          onTimezoneChange={setTimezone}
          onRecurringTypeChange={(value) => {
            setRecurringType(value);
            if (value !== "weekly") setRecurringDays([]);
          }}
          onRecurringDaysChange={setRecurringDays}
          onCancel={() => {
            setShowForm(false);
            setMsg(null);
            resetForm();
          }}
          onSave={() => void handleCreate()}
        />
      ) : null}

      {schedules.length === 0 && !loading && venueId ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-400">No schedules yet.</p>
          <p className="mt-1 text-xs text-slate-400">Create one to define exactly when Category Blitz should be available.</p>
        </div>
      ) : null}

      <div className="space-y-2">
        {schedules.map((schedule) => (
          <div key={schedule.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-800">{schedule.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatScheduleTime(schedule.startTime, schedule.timezone)} to {formatScheduleTime(schedule.endTime, schedule.timezone)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                    {formatRecurringLabel(schedule)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {formatDuration(schedule.windowMinutes)}
                  </span>
                  <span className="text-[10px] text-slate-400">{schedule.timezone}</span>
                </div>
              </div>

              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => (editingId === schedule.id ? cancelEdit() : openEdit(schedule))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100"
                >
                  {editingId === schedule.id ? "Cancel" : "Edit"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(schedule.id)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-600 hover:bg-rose-100"
                >
                  Delete
                </button>
              </div>
            </div>

            {editingId === schedule.id ? (
              <div className="border-t border-slate-100 p-3">
                <ScheduleEditor
                  mode="edit"
                  title={title}
                  startTime={startTime}
                  rounds={rounds}
                  timezone={timezone}
                  recurringType={recurringType}
                  recurringDays={recurringDays}
                  saving={saving}
                  onTitleChange={setTitle}
                  onStartTimeChange={setStartTime}
                  onRoundsChange={setRounds}
                  onTimezoneChange={setTimezone}
                  onRecurringTypeChange={(value) => {
                    setRecurringType(value);
                    if (value !== "weekly") setRecurringDays([]);
                  }}
                  onRecurringDaysChange={setRecurringDays}
                  onCancel={cancelEdit}
                  onSave={() => void handleUpdate()}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleEditor({
  mode,
  title,
  startTime,
  rounds,
  timezone,
  recurringType,
  recurringDays,
  saving,
  onTitleChange,
  onStartTimeChange,
  onRoundsChange,
  onTimezoneChange,
  onRecurringTypeChange,
  onRecurringDaysChange,
  onCancel,
  onSave,
}: {
  mode: "create" | "edit";
  title: string;
  startTime: string;
  rounds: number;
  timezone: string;
  recurringType: CategoryBlitzRecurringType;
  recurringDays: string[];
  saving: boolean;
  onTitleChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onRoundsChange: (value: number) => void;
  onTimezoneChange: (value: string) => void;
  onRecurringTypeChange: (value: CategoryBlitzRecurringType) => void;
  onRecurringDaysChange: (value: string[]) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const safeRounds = Math.max(1, Math.floor(rounds) || 1);
  const durationMinutes = gameDurationMinutes(safeRounds);

  const endsAtLabel = useMemo(() => {
    if (!startTime) return null;
    try {
      const startUtcMs = Date.parse(datetimeLocalValueToUtcIso(startTime, timezone));
      const endMs = startUtcMs + durationMinutes * 60_000;
      return new Date(endMs).toLocaleString("en-US", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return null;
    }
  }, [startTime, timezone, durationMinutes]);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">
        {mode === "create" ? "New Schedule" : "Edit Schedule"}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-500">Title</label>
          <input
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="e.g. Tuesday Late Night Category Blitz"
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Start day & time</label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(event) => onStartTimeChange(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Number of rounds</label>
          <input
            type="number"
            min={1}
            step={1}
            value={safeRounds}
            onChange={(event) => onRoundsChange(Math.max(1, Math.floor(Number(event.target.value)) || 1))}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-500">Timezone</label>
          <select
            value={timezone}
            onChange={(event) => onTimezoneChange(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {TIMEZONES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Recurring</label>
          <select
            value={recurringType}
            onChange={(event) => onRecurringTypeChange(event.target.value as CategoryBlitzRecurringType)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {RECURRING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Weekly Days</label>
          <div className="flex min-h-[38px] flex-wrap gap-2 rounded-lg border border-slate-200 px-3 py-2">
            {WEEKDAY_OPTIONS.map((day) => {
              const checked = recurringDays.includes(day.key);
              return (
                <label key={day.key} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                    disabled={recurringType !== "weekly"}
                    checked={checked}
                    onChange={() =>
                      onRecurringDaysChange(
                        checked
                          ? recurringDays.filter((item) => item !== day.key)
                          : [...recurringDays, day.key]
                      )
                    }
                  />
                  {day.label}
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {recurringType === "weekly"
              ? "Choose one or more weekdays."
              : "Weekly days are only used when Recurring = Weekly."}
          </p>
        </div>

        <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-xs font-semibold text-emerald-800">
            {safeRounds} round{safeRounds === 1 ? "" : "s"} · {formatDuration(durationMinutes)} total
            {safeRounds > 1 ? ` (3 min/round, 7 min between rounds)` : ""}
          </p>
          {endsAtLabel ? (
            <p className="mt-0.5 text-[11px] text-emerald-700">Game will end at {endsAtLabel} ({timezone})</p>
          ) : (
            <p className="mt-0.5 text-[11px] text-emerald-700">Pick a start time to see when the game ends.</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          {saving ? "Saving..." : mode === "create" ? "Create Schedule" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

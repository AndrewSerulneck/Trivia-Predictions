"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Venue, ScategoriesSession, ScategoriesRound, ScategoriesRoundResults, ScategoriesSchedule, ScategoriesRecurringType } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMmSs(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function StatusPill({ label, tone }: { label: string; tone: "live" | "lobby" | "scoring" | "done" | "none" }) {
  const classes: Record<typeof tone, string> = {
    live:    "border-emerald-400 bg-emerald-500/15 text-emerald-300",
    lobby:   "border-amber-400 bg-amber-500/15 text-amber-300",
    scoring: "border-cyan-400 bg-cyan-500/15 text-cyan-300",
    done:    "border-slate-600 bg-slate-800/50 text-slate-400",
    none:    "border-slate-700 bg-slate-900/50 text-slate-500",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-black uppercase tracking-wider ${classes[tone]}`}>
      {label}
    </span>
  );
}

// ── Main Section ──────────────────────────────────────────────────────────────

export function ScategoriesSection({ venues = [] }: { venues?: Venue[] }) {
  const [activeTab, setActiveTab] = useState<"session" | "schedules">("schedules");
  const [selectedVenueId, setSelectedVenueId] = useState<string>(() => venues[0]?.id ?? "");
  const [session, setSession] = useState<ScategoriesSession | null>(null);
  const [round, setRound] = useState<ScategoriesRound | null>(null);
  const [results, setResults] = useState<ScategoriesRoundResults | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const endsAtRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Timer tick ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      if (endsAtRef.current === null) { setTimeRemaining(0); return; }
      setTimeRemaining(Math.max(0, Math.round((endsAtRef.current - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const fetchState = useCallback(async (venueId: string) => {
    if (!venueId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/scategories/sessions?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; session?: ScategoriesSession | null; error?: string };
      if (!mountedRef.current) return;
      const s = json.session ?? null;
      setSession(s);
      setRound(null);
      setResults(null);
      endsAtRef.current = null;

      if (s && (s.status === "active" || s.status === "scoring")) {
        const roundRes = await fetch(`/api/scategories/sessions/${s.id}/current-round`, { cache: "no-store" });
        const roundJson = (await roundRes.json()) as { ok: boolean; round?: ScategoriesRound | null };
        if (!mountedRef.current) return;
        const r = roundJson.round ?? null;
        setRound(r);
        if (r?.status === "active") {
          endsAtRef.current = new Date(r.endsAt).getTime();
        }
        if (r?.status === "complete" || r?.status === "scoring") {
          const resRes = await fetch(`/api/scategories/rounds/${r.id}/results`, { cache: "no-store" });
          const resJson = (await resRes.json()) as { ok: boolean; results?: ScategoriesRoundResults };
          if (!mountedRef.current) return;
          setResults(resJson.results ?? null);
        }
      }
    } catch {
      if (mountedRef.current) setMsg({ text: "Failed to load session state.", ok: false });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedVenueId) void fetchState(selectedVenueId);
  }, [selectedVenueId, fetchState]);

  // Poll every 5s while a session is active
  useEffect(() => {
    if (!selectedVenueId || !session) return;
    if (session.status === "complete") return;
    const id = setInterval(() => void fetchState(selectedVenueId), 5000);
    return () => clearInterval(id);
  }, [selectedVenueId, session, fetchState]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const doAction = async (label: string, fn: () => Promise<Response>) => {
    setActionLoading(label);
    setMsg(null);
    try {
      const res = await fn();
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!mountedRef.current) return;
      if (!json.ok) throw new Error(json.error ?? "Request failed.");
      setMsg({ text: `${label} successful.`, ok: true });
      await fetchState(selectedVenueId);
    } catch (e) {
      if (mountedRef.current) setMsg({ text: e instanceof Error ? e.message : "Action failed.", ok: false });
    } finally {
      if (mountedRef.current) setActionLoading(null);
    }
  };

  const createSession = () =>
    doAction("Create lobby", () =>
      fetch("/api/scategories/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: selectedVenueId }),
      })
    );

  const startRound = () =>
    doAction("Start round", () =>
      fetch(`/api/scategories/sessions/${session!.id}/start`, { method: "POST" })
    );

  const endSession = () =>
    doAction("End session", () =>
      fetch(`/api/scategories/sessions/${session!.id}/end`, { method: "POST" })
    );

  const scoreRound = () =>
    doAction("Score round", () =>
      fetch(`/api/scategories/rounds/${round!.id}/score`, { method: "POST" })
    );

  // ── Render ───────────────────────────────────────────────────────────────────

  const sessionTone = !session
    ? "none"
    : session.status === "lobby"
    ? "lobby"
    : session.status === "active"
    ? "live"
    : session.status === "scoring"
    ? "scoring"
    : "done";

  return (
    <div className="space-y-5 text-sm">
      <div>
        <h2 className="text-base font-black text-slate-900">S&apos;Categories Control Panel</h2>
        <p className="text-slate-500">Manage schedules and live game sessions per venue.</p>
      </div>

      {/* Venue selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Venue</label>
        <select
          value={selectedVenueId}
          onChange={(e) => setSelectedVenueId(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name ?? v.id}</option>
          ))}
        </select>
        {activeTab === "session" && (
          <button
            type="button"
            onClick={() => void fetchState(selectedVenueId)}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(["schedules", "session"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? "border-b-2 border-emerald-600 text-emerald-700"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {tab === "schedules" ? "Schedules" : "Live Session"}
          </button>
        ))}
      </div>

      {activeTab === "schedules" && (
        <SchedulesPanel venueId={selectedVenueId} />
      )}

      {activeTab === "session" && (<>

      {/* Feedback message */}
      {msg && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
            msg.ok ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-rose-300 bg-rose-50 text-rose-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Session status card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Session Status</p>
            {session ? (
              <p className="mt-0.5 font-mono text-xs text-slate-400">{session.id.slice(0, 12)}…</p>
            ) : (
              <p className="mt-0.5 text-slate-400">No active session</p>
            )}
          </div>
          <StatusPill
            label={!session ? "None" : session.status === "lobby" ? "Lobby" : session.status === "active" ? "Live" : session.status === "scoring" ? "Scoring" : "Complete"}
            tone={sessionTone}
          />
        </div>

        {/* Actions row */}
        <div className="flex flex-wrap gap-2">
          {!session || session.status === "complete" ? (
            <ActionButton
              label="Create Lobby"
              tone="emerald"
              loading={actionLoading === "Create lobby"}
              onClick={() => void createSession()}
            />
          ) : null}

          {session?.status === "lobby" || (session?.status === "active" && round?.status === "complete") ? (
            <ActionButton
              label={round?.status === "complete" ? "Start Next Round" : "Start Round"}
              tone="emerald"
              loading={actionLoading === "Start round"}
              onClick={() => void startRound()}
            />
          ) : null}

          {session?.status === "active" && round?.status === "active" ? (
            <ActionButton
              label="Force Score Now"
              tone="amber"
              loading={actionLoading === "Score round"}
              onClick={() => void scoreRound()}
            />
          ) : null}

          {session && session.status !== "complete" ? (
            <ActionButton
              label="End Session"
              tone="rose"
              loading={actionLoading === "End session"}
              onClick={() => void endSession()}
            />
          ) : null}
        </div>
      </div>

      {/* Active round card */}
      {round && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-2xl font-black text-emerald-700">
                {round.letter}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Current Round</p>
                <p className="font-mono text-xs text-slate-400">{round.id.slice(0, 10)}…</p>
              </div>
            </div>
            <div className="text-right">
              {round.status === "active" ? (
                <>
                  <p className={`text-2xl font-black tabular-nums ${timeRemaining <= 30 ? "text-rose-600" : "text-emerald-600"}`}>
                    {formatMmSs(timeRemaining)}
                  </p>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">remaining</p>
                </>
              ) : (
                <StatusPill
                  label={round.status === "complete" ? "Complete" : round.status === "scoring" ? "Scoring" : round.status}
                  tone={round.status === "complete" ? "done" : "scoring"}
                />
              )}
            </div>
          </div>

          {/* Category grid */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {round.categories.map((cat, i) => (
              <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{i + 1}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-700 leading-snug">{cat}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results card */}
      {results && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Round Results — Letter {results.letter}</p>

          {/* Leaderboard */}
          {results.totals.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-300">Leaderboard</p>
              {results.totals
                .slice()
                .sort((a, b) => b.points - a.points)
                .map((entry, i) => (
                  <div key={entry.userId} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5">
                    <span className="w-5 text-center text-xs font-black text-slate-400">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{entry.username}</span>
                    <span className="text-sm font-black text-emerald-600">{entry.points}</span>
                  </div>
                ))}
            </div>
          )}

          {/* Category breakdown */}
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-300">Answers by Category</p>
            {results.results.map((cat) => (
              <div key={cat.categoryIndex} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{cat.category}</p>
                {cat.answers.length === 0 ? (
                  <p className="mt-1 text-[11px] italic text-slate-400">No answers submitted</p>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cat.answers.map((a) => (
                      <span
                        key={a.userId}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          a.isUnique
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : a.isUnique === false
                            ? "border-slate-300 bg-slate-100 text-slate-400 line-through"
                            : "border-amber-300 bg-amber-50 text-amber-700"
                        }`}
                      >
                        <span className="font-bold">{a.username}:</span>
                        {a.answer}
                        {a.isUnique ? " +2" : a.isUnique === false ? " 0" : " ?"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

// ── Schedules panel ───────────────────────────────────────────────────────────

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
];

const WEEKDAY_OPTIONS = [
  { key: "sun", label: "Sun" }, { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" }, { key: "thu", label: "Thu" }, { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
] as const;

const WINDOW_OPTIONS = [
  { value: 60,  label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 240, label: "4 hours" },
  { value: 300, label: "5 hours" },
  { value: 360, label: "6 hours" },
  { value: 480, label: "8 hours" },
];

function formatScheduleTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: tz, month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
}

function formatRecurring(schedule: ScategoriesSchedule): string {
  if (schedule.recurringType === "none") return "One-time";
  if (schedule.recurringType === "daily") return "Daily";
  if (schedule.recurringType === "weekly") {
    const labels: Record<string, string> = {
      sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat",
    };
    return `Weekly — ${schedule.recurringDays.map((d) => labels[d] ?? d).join(", ")}`;
  }
  return schedule.recurringType;
}

function SchedulesPanel({ venueId }: { venueId: string }) {
  const [schedules, setSchedules] = useState<ScategoriesSchedule[]>([]);
  const [loading, setLoading]     = useState(false);
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const mountedRef                = useRef(true);

  // Form state
  const [title, setTitle]                 = useState("");
  const [startTime, setStartTime]         = useState("");
  const [timezone, setTimezone]           = useState("America/New_York");
  const [recurringType, setRecurringType] = useState<ScategoriesRecurringType>("weekly");
  const [recurringDays, setRecurringDays] = useState<string[]>(["fri", "sat"]);
  const [windowMinutes, setWindowMinutes] = useState(240);
  const [saving, setSaving]               = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchSchedules = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/scategories/schedules?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; schedules?: ScategoriesSchedule[] };
      if (mountedRef.current) setSchedules(json.schedules ?? []);
    } catch {
      if (mountedRef.current) setMsg({ text: "Failed to load schedules.", ok: false });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [venueId]);

  useEffect(() => { void fetchSchedules(); }, [fetchSchedules]);

  const toggleDay = (day: string) => {
    setRecurringDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleCreate = async () => {
    if (!title.trim() || !startTime) {
      setMsg({ text: "Title and start time are required.", ok: false });
      return;
    }
    if (recurringType === "weekly" && recurringDays.length === 0) {
      setMsg({ text: "Select at least one day for weekly schedule.", ok: false });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res  = await fetch("/api/scategories/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, title: title.trim(), startTime, timezone, recurringType, recurringDays, windowMinutes }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed to create schedule.");
      setMsg({ text: "Schedule created.", ok: true });
      setShowForm(false);
      setTitle("");
      await fetchSchedules();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed.", ok: false });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this schedule?")) return;
    try {
      const res  = await fetch(`/api/scategories/schedules/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed.");
      setMsg({ text: "Schedule deleted.", ok: true });
      await fetchSchedules();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed.", ok: false });
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`rounded-lg border px-3 py-2 text-xs font-semibold ${msg.ok ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-rose-300 bg-rose-50 text-rose-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-slate-400">
          {loading ? "Loading…" : `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""}`}
        </p>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setMsg(null); }}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-100"
        >
          {showForm ? "Cancel" : "+ New Schedule"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">New Schedule</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Friday Night S'Categories"
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Start time</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="mt-0.5 text-[10px] text-slate-400">Sets the daily start time for recurring schedules.</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Window length</label>
              <select
                value={windowMinutes}
                onChange={(e) => setWindowMinutes(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {WINDOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Recurrence</label>
              <select
                value={recurringType}
                onChange={(e) => setRecurringType(e.target.value as ScategoriesRecurringType)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="none">One-time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            {recurringType === "weekly" && (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-500">Days of week</label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleDay(key)}
                      className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                        recurringDays.includes(key)
                          ? "border-emerald-400 bg-emerald-100 text-emerald-700"
                          : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Create Schedule"}
            </button>
          </div>
        </div>
      )}

      {schedules.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-400">No schedules yet.</p>
          <p className="mt-1 text-xs text-slate-400">Create one to set when S&apos;Categories is available for this venue.</p>
        </div>
      )}

      <div className="space-y-2">
        {schedules.map((s) => (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 truncate">{s.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{formatScheduleTime(s.startTime, s.timezone)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                    {formatRecurring(s)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {WINDOW_OPTIONS.find((o) => o.value === s.windowMinutes)?.label ?? `${s.windowMinutes} min`} window
                  </span>
                  <span className="text-[10px] text-slate-400">{s.timezone}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(s.id)}
                className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-600 hover:bg-rose-100"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared button ─────────────────────────────────────────────────────────────

function ActionButton({
  label,
  tone,
  loading,
  onClick,
}: {
  label: string;
  tone: "emerald" | "amber" | "rose";
  loading: boolean;
  onClick: () => void;
}) {
  const classes: Record<typeof tone, string> = {
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    amber:   "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
    rose:    "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`rounded-lg border px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${classes[tone]}`}
    >
      {loading ? "…" : label}
    </button>
  );
}

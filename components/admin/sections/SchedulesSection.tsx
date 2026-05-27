"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CampaignRecurringType, Venue } from "@/types";
import { PaginationBar, BulkActionBar, TH, TD, TR } from "@/components/admin/AdminShell";

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminLiveShowdownSchedule = {
  id: string;
  title: string;
  startTime: string;
  timezone: string;
  recurringType: CampaignRecurringType;
  recurringDays: string[];
  numRounds: number;
  venueId: string | null;
  intermissionAdDelaySeconds: number;
  lobbyAdEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
  "Europe/London",
  "Europe/Paris",
  "Australia/Sydney",
];

const RECURRING_OPTIONS: Array<{ value: CampaignRecurringType; label: string }> = [
  { value: "none", label: "None (One-off)" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
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

function formatStartTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: tz,
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

function isUpcoming(iso: string): boolean {
  return new Date(iso) > new Date();
}

// ─── Main Section ─────────────────────────────────────────────────────────────

type SchedulesSectionProps = {
  venues: Venue[];
};

type ViewMode = "list" | "create" | "edit";
type SortField = "title" | "venue" | "rounds" | "timezone" | "city" | "state";
type SortDirection = "asc" | "desc";

export function SchedulesSection({ venues }: SchedulesSectionProps) {
  const [mode, setMode] = useState<ViewMode>("list");
  const [schedules, setSchedules] = useState<AdminLiveShowdownSchedule[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Create form
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formTime, setFormTime] = useState("19:00");
  const [formTz, setFormTz] = useState("America/New_York");
  const [formRecurringType, setFormRecurringType] = useState<CampaignRecurringType>("none");
  const [formRecurringDays, setFormRecurringDays] = useState<string[]>([]);
  const [formRounds, setFormRounds] = useState("3");
  const [formVenueId, setFormVenueId] = useState(() => venues[0]?.id ?? "");
  const [formIntermissionDelay, setFormIntermissionDelay] = useState("10");
  const [formLobbyAdEnabled, setFormLobbyAdEnabled] = useState(true);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError("");
    setSelectedIds(new Set());
    try {
      const url = `/api/admin?resource=live-showdown-schedules&page=${targetPage}&pageSize=${PAGE_SIZE}`;
      const res = await fetch(url, { cache: "no-store" });
      const payload = (await res.json()) as {
        ok: boolean;
        items?: AdminLiveShowdownSchedule[];
        total?: number;
        totalPages?: number;
        error?: string;
      };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load schedules.");
      setSchedules(payload.items ?? []);
      setTotal(payload.total ?? 0);
      setTotalPages(payload.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules(page);
  }, [page, fetchSchedules]);

  // ── Selection ────────────────────────────────────────────────────────────

  const allOnPageSelected =
    schedules.length > 0 && schedules.every((s) => selectedIds.has(s.id));

  function toggleSelectAll() {
    setSelectedIds(allOnPageSelected ? new Set() : new Set(schedules.map((s) => s.id)));
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Bulk delete ──────────────────────────────────────────────────────────

  async function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} schedule(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/admin?resource=live-showdown-schedules&id=${id}`, { method: "DELETE" })
        )
      );
      setSelectedIds(new Set());
      await fetchSchedules(1);
      setPage(1);
    } catch {
      setError("Failed to delete some schedules.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function deleteSchedule(id: string, title: string) {
    if (!confirm(`Delete "${title}"? All associated questions and answers will also be removed.`))
      return;
    try {
      const res = await fetch(`/api/admin?resource=live-showdown-schedules&id=${id}`, {
        method: "DELETE",
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to delete schedule.");
      await fetchSchedules(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete schedule.");
    }
  }

  // ── Create ───────────────────────────────────────────────────────────────

  function resetCreateForm() {
    setFormTitle("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormTime("19:00");
    setFormTz("America/New_York");
    setFormRecurringType("none");
    setFormRecurringDays([]);
    setFormRounds("3");
    setFormVenueId(venues[0]?.id ?? "");
    setFormIntermissionDelay("10");
    setFormLobbyAdEnabled(true);
    setCreateError("");
  }

  async function handleCreate() {
    if (!formTitle.trim()) { setCreateError("Title is required."); return; }
    if (!formDate) { setCreateError("Date is required."); return; }
    if (!formTime) { setCreateError("Start time is required."); return; }
    if (!formVenueId) { setCreateError("Venue is required."); return; }
    const numRounds = parseInt(formRounds, 10);
    if (isNaN(numRounds) || numRounds < 1 || numRounds > 24) {
      setCreateError("Rounds must be between 1 and 24.");
      return;
    }
    const intermissionAdDelaySeconds = parseInt(formIntermissionDelay, 10);
    if (
      Number.isNaN(intermissionAdDelaySeconds) ||
      intermissionAdDelaySeconds < 0 ||
      intermissionAdDelaySeconds > 300
    ) {
      setCreateError("Intermission ad delay must be between 0 and 300 seconds.");
      return;
    }
    if (formRecurringType === "weekly" && formRecurringDays.length === 0) {
      setCreateError("Select at least one day for weekly recurring schedules.");
      return;
    }
    setCreateBusy(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "live-showdown-schedules",
          title: formTitle.trim(),
          targetDate: formDate,
          startTime: formTime,
          timezone: formTz,
          recurringType: formRecurringType,
          recurringDays: formRecurringType === "weekly" ? formRecurringDays : [],
          numRounds,
          venueId: formVenueId,
          intermissionAdDelaySeconds,
          lobbyAdEnabled: formLobbyAdEnabled,
        }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to create schedule.");
      resetCreateForm();
      setMode("list");
      await fetchSchedules(1);
      setPage(1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create schedule.");
    } finally {
      setCreateBusy(false);
    }
  }

  function openEditForm(s: AdminLiveShowdownSchedule) {
    const startDate = new Date(s.startTime);
    const localDate = startDate.toLocaleDateString("en-CA", { timeZone: s.timezone }); // YYYY-MM-DD
    const localTime = startDate.toLocaleTimeString("en-US", {
      timeZone: s.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    setEditingScheduleId(s.id);
    setFormTitle(s.title);
    setFormDate(localDate);
    setFormTime(localTime);
    setFormTz(s.timezone);
    setFormRecurringType(s.recurringType);
    setFormRecurringDays(s.recurringDays ?? []);
    setFormRounds(String(s.numRounds));
    setFormVenueId(s.venueId ?? venues[0]?.id ?? "");
    setFormIntermissionDelay(String(s.intermissionAdDelaySeconds));
    setFormLobbyAdEnabled(s.lobbyAdEnabled);
    setCreateError("");
    setMode("edit");
  }

  async function handleUpdate() {
    if (!editingScheduleId) return;
    if (!formTitle.trim()) { setCreateError("Title is required."); return; }
    if (!formDate) { setCreateError("Date is required."); return; }
    if (!formTime) { setCreateError("Start time is required."); return; }
    if (!formVenueId) { setCreateError("Venue is required."); return; }
    const numRounds = parseInt(formRounds, 10);
    if (isNaN(numRounds) || numRounds < 1 || numRounds > 24) {
      setCreateError("Rounds must be between 1 and 24.");
      return;
    }
    const intermissionAdDelaySeconds = parseInt(formIntermissionDelay, 10);
    if (Number.isNaN(intermissionAdDelaySeconds) || intermissionAdDelaySeconds < 0 || intermissionAdDelaySeconds > 300) {
      setCreateError("Intermission ad delay must be between 0 and 300 seconds.");
      return;
    }
    if (formRecurringType === "weekly" && formRecurringDays.length === 0) {
      setCreateError("Select at least one day for weekly recurring schedules.");
      return;
    }
    setCreateBusy(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "live-showdown-schedules",
          id: editingScheduleId,
          title: formTitle.trim(),
          targetDate: formDate,
          startTime: formTime,
          timezone: formTz,
          recurringType: formRecurringType,
          recurringDays: formRecurringType === "weekly" ? formRecurringDays : [],
          numRounds,
          venueId: formVenueId,
          intermissionAdDelaySeconds,
          lobbyAdEnabled: formLobbyAdEnabled,
        }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to update schedule.");
      resetCreateForm();
      setEditingScheduleId(null);
      setMode("list");
      await fetchSchedules(page);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to update schedule.");
    } finally {
      setCreateBusy(false);
    }
  }

  // ── Derived data (must be before any early return) ───────────────────────

  const venueById = useMemo(() => new Map(venues.map((v) => [v.id, v])), [venues]);

  const filteredAndSortedSchedules = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = schedules.filter((schedule) => {
      if (!query) return true;
      const venue = schedule.venueId ? venueById.get(schedule.venueId) : null;
      const haystack = [
        schedule.title,
        venue?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    const sorted = [...filtered].sort((a, b) => {
      const venueA = a.venueId ? venueById.get(a.venueId) : null;
      const venueB = b.venueId ? venueById.get(b.venueId) : null;
      const cityA = (venueA?.city ?? "").toLowerCase();
      const cityB = (venueB?.city ?? "").toLowerCase();
      const stateA = (venueA?.state ?? "").toLowerCase();
      const stateB = (venueB?.state ?? "").toLowerCase();

      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
          break;
        case "venue":
          cmp = (venueA?.name ?? "").localeCompare(venueB?.name ?? "", undefined, { sensitivity: "base" });
          break;
        case "rounds":
          cmp = a.numRounds - b.numRounds;
          break;
        case "timezone":
          cmp = a.timezone.localeCompare(b.timezone, undefined, { sensitivity: "base" });
          break;
        case "city":
          cmp = cityA.localeCompare(cityB, undefined, { sensitivity: "base" });
          break;
        case "state":
          cmp = stateA.localeCompare(stateB, undefined, { sensitivity: "base" });
          break;
        default:
          cmp = 0;
      }
      if (cmp === 0) {
        cmp = +new Date(a.startTime) - +new Date(b.startTime);
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [schedules, searchQuery, sortField, sortDirection, venueById]);

  // ── Create form render ────────────────────────────────────────────────────

  if (mode === "create" || mode === "edit") {
    const isEditMode = mode === "edit";
    const field =
      "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
    const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600";

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {isEditMode ? "Edit Live Trivia Session" : "Schedule Live Trivia"}
          </h2>
          <button
            onClick={() => { resetCreateForm(); setEditingScheduleId(null); setMode("list"); }}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← Back to list
          </button>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2">
            <label className={lbl}>Title *</label>
            <input
              className={field}
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Friday Night Live Trivia"
            />
          </div>

          <div>
            <label className={lbl}>Date *</label>
            <input
              type="date"
              className={field}
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
            />
          </div>
          <div>
            <label className={lbl}>Start Time *</label>
            <input
              type="time"
              className={field}
              value={formTime}
              onChange={(e) => setFormTime(e.target.value)}
            />
          </div>

          <div>
            <label className={lbl}>Timezone *</label>
            <select
              className={field}
              value={formTz}
              onChange={(e) => setFormTz(e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Recurring</label>
            <select
              className={field}
              value={formRecurringType}
              onChange={(e) => setFormRecurringType(e.target.value as CampaignRecurringType)}
            >
              {RECURRING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Weekly Days</label>
            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 px-3 py-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const checked = formRecurringDays.includes(day.key);
                return (
                  <label key={day.key} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      disabled={formRecurringType !== "weekly"}
                      checked={checked}
                      onChange={() =>
                        setFormRecurringDays((prev) =>
                          checked ? prev.filter((item) => item !== day.key) : [...prev, day.key]
                        )
                      }
                    />
                    {day.label}
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {formRecurringType === "weekly"
                ? "Choose one or more weekdays."
                : "Weekly days are only used when Recurring = Weekly."}
            </p>
          </div>
          <div>
            <label className={lbl}>Number of Rounds *</label>
            <input
              type="number"
              min={1}
              max={24}
              className={field}
              value={formRounds}
              onChange={(e) => setFormRounds(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">Each round is 20 minutes.</p>
          </div>

          <div className="col-span-2">
            <label className={lbl}>Venue *</label>
            <select
              className={field}
              value={formVenueId}
              onChange={(e) => setFormVenueId(e.target.value)}
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={lbl}>Intermission Ad Delay (sec)</label>
            <input
              type="number"
              min={0}
              max={300}
              className={field}
              value={formIntermissionDelay}
              onChange={(e) => setFormIntermissionDelay(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={formLobbyAdEnabled}
                onChange={(e) => setFormLobbyAdEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Lobby ad enabled
            </label>
          </div>
        </div>

        {createError && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {createError}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={isEditMode ? handleUpdate : handleCreate}
            disabled={createBusy}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createBusy
              ? isEditMode ? "Saving…" : "Creating…"
              : isEditMode ? "Save Changes" : "Schedule Session"}
          </button>
          <button
            onClick={() => { resetCreateForm(); setEditingScheduleId(null); setMode("list"); }}
            disabled={createBusy}
            className="rounded-lg border border-slate-300 px-5 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── List render ───────────────────────────────────────────────────────────

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  }

  function sortLabel(field: SortField, label: string) {
    if (sortField !== field) return label;
    return `${label}${sortDirection === "asc" ? " ▲" : " ▼"}`;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Live Trivia Schedules</h2>
            <p className="text-xs text-slate-500">{filteredAndSortedSchedules.length} shown ({total} total sessions)</p>
          </div>
          <button
            onClick={() => { resetCreateForm(); setMode("create"); }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + Schedule Session
          </button>
        </div>

        <div className="px-6 pt-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Search</label>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or venue..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        {/* Bulk action bar */}
        <div className="px-6 pt-4">
          <BulkActionBar
            count={selectedIds.size}
            onDeleteSelected={bulkDelete}
            onClear={() => setSelectedIds(new Set())}
            busy={bulkBusy}
          />
        </div>

        {error && (
          <div className="mx-6 mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className={`${TH} w-10`}>
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                </th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("title")}>{sortLabel("title", "Title")}</th>
                <th className={TH}>Start Time</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("timezone")}>{sortLabel("timezone", "Timezone")}</th>
                <th className={TH}>Recurring</th>
                <th className={TH}>Days</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("rounds")}>{sortLabel("rounds", "Rounds")}</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("venue")}>{sortLabel("venue", "Venue")}</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("city")}>{sortLabel("city", "City")}</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("state")}>{sortLabel("state", "State")}</th>
                <th className={TH}>Intermission Delay</th>
                <th className={TH}>Lobby Ad</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-sm text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filteredAndSortedSchedules.length === 0 && (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-sm text-slate-400">
                    No sessions scheduled yet.
                  </td>
                </tr>
              )}
              {!loading &&
                filteredAndSortedSchedules.map((s) => {
                  const upcoming = isUpcoming(s.startTime);
                  const venue = s.venueId ? venueById.get(s.venueId) : null;
                  return (
                    <tr key={s.id} className={TR}>
                      <td className={`${TD} w-10`}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          onChange={() => toggleRow(s.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                      </td>
                      <td className={TD}>
                        <span className="font-medium text-slate-900">{s.title}</span>
                      </td>
                      <td className={`${TD} tabular-nums text-slate-600`}>
                        {formatStartTime(s.startTime, s.timezone)}
                      </td>
                      <td className={`${TD} text-slate-500`}>{s.timezone}</td>
                      <td className={`${TD} text-slate-500 capitalize`}>{s.recurringType ?? "none"}</td>
                      <td className={`${TD} text-slate-500`}>
                        {s.recurringType === "weekly" && (s.recurringDays?.length ?? 0) > 0
                          ? s.recurringDays.map((day) => day.slice(0, 1).toUpperCase() + day.slice(1)).join(", ")
                          : "—"}
                      </td>
                      <td className={`${TD} text-center tabular-nums`}>{s.numRounds}</td>
                      <td className={`${TD} text-slate-500`}>
                        {s.venueId ? (venue?.name ?? s.venueId) : "All"}
                      </td>
                      <td className={`${TD} text-slate-500`}>
                        {venue?.city ?? "—"}
                      </td>
                      <td className={`${TD} text-slate-500`}>
                        {venue?.state ?? "—"}
                      </td>
                      <td className={`${TD} tabular-nums text-slate-600`}>
                        {s.intermissionAdDelaySeconds}s
                      </td>
                      <td className={TD}>
                        {s.lobbyAdEnabled ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Enabled
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className={TD}>
                        {upcoming ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Upcoming
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                            Past
                          </span>
                        )}
                      </td>
                      <td className={`${TD} text-right`}>
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => openEditForm(s)}
                            className="rounded border border-indigo-200 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteSchedule(s.id, s.title)}
                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => setPage(p)}
          />
        )}
      </div>
    </div>
  );
}

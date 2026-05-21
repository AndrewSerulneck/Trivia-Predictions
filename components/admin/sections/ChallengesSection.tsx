"use client";

import { useCallback, useEffect, useState } from "react";
import type { Venue } from "@/types";
import { PaginationBar, BulkActionBar, TH, TD, TR } from "@/components/admin/AdminShell";

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignRecurringType = "none" | "daily" | "weekly" | "monthly" | "yearly";

type AdminChallengeCampaign = {
  id: string;
  createdAt: string;
  name: string;
  imageUrl?: string;
  rules: string;
  venueIds: string[];
  activeDays: string[];
  startTime?: string;
  endTime?: string;
  endDate?: string;
  gameTypes: string[];
  pointMultiplier: number;
  pointsRequiredToWin: number;
  recurringType: CampaignRecurringType;
  winnerUserId?: string | null;
  winnerUsername?: string | null;
  isActive: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const GAME_TYPE_OPTIONS = ["pickem", "fantasy", "trivia", "bingo"] as const;
const DAY_OPTIONS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const RECURRING_OPTIONS: CampaignRecurringType[] = ["none", "daily", "weekly", "monthly", "yearly"];

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ isActive, hasWinner }: { isActive: boolean; hasWinner: boolean }) {
  if (hasWinner) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Resolved
      </span>
    );
  }
  return isActive ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      Active
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
      Inactive
    </span>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

type ChallengesSectionProps = {
  venues: Venue[];
};

type ViewMode = "list" | "create";

export function ChallengesSection({ venues }: ChallengesSectionProps) {
  const [mode, setMode] = useState<ViewMode>("list");
  const [campaigns, setCampaigns] = useState<AdminChallengeCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formRules, setFormRules] = useState("");
  const [formVenueIds, setFormVenueIds] = useState<string[]>([]);
  const [formActiveDays, setFormActiveDays] = useState<string[]>([]);
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndTime, setFormEndTime] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formGameTypes, setFormGameTypes] = useState<string[]>([...GAME_TYPE_OPTIONS]);
  const [formMultiplier, setFormMultiplier] = useState("1");
  const [formPointsRequired, setFormPointsRequired] = useState("100");
  const [formRecurring, setFormRecurring] = useState<CampaignRecurringType>("none");
  const [formActive, setFormActive] = useState(true);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchCampaigns = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError("");
    setSelectedIds(new Set());
    try {
      const url = `/api/admin?resource=challenge-campaigns&includeInactive=true&includeResolved=true&page=${targetPage}&pageSize=${PAGE_SIZE}`;
      const res = await fetch(url, { cache: "no-store" });
      const payload = (await res.json()) as {
        ok: boolean;
        items?: AdminChallengeCampaign[];
        total?: number;
        totalPages?: number;
        error?: string;
      };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load campaigns.");
      setCampaigns(payload.items ?? []);
      setTotal(payload.total ?? 0);
      setTotalPages(payload.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns(page);
  }, [page, fetchCampaigns]);

  // ── Selection ────────────────────────────────────────────────────────────

  const allOnPageSelected =
    campaigns.length > 0 && campaigns.every((c) => selectedIds.has(c.id));

  function toggleSelectAll() {
    setSelectedIds(allOnPageSelected ? new Set() : new Set(campaigns.map((c) => c.id)));
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────

  async function bulkPatch(isActive: boolean) {
    setBulkBusy(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch("/api/admin", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resource: "challenge-campaigns", id, isActive }),
          })
        )
      );
      setSelectedIds(new Set());
      await fetchCampaigns(page);
    } catch {
      setError("Failed to update some campaigns.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} campaign(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/admin?resource=challenge-campaigns&id=${id}`, { method: "DELETE" })
        )
      );
      setSelectedIds(new Set());
      await fetchCampaigns(1);
      setPage(1);
    } catch {
      setError("Failed to delete some campaigns.");
    } finally {
      setBulkBusy(false);
    }
  }

  // ── Toggle single ────────────────────────────────────────────────────────

  async function toggleActive(campaign: AdminChallengeCampaign) {
    try {
      await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "challenge-campaigns",
          id: campaign.id,
          isActive: !campaign.isActive,
        }),
      });
      await fetchCampaigns(page);
    } catch {
      setError("Failed to toggle campaign.");
    }
  }

  async function deleteCampaign(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/admin?resource=challenge-campaigns&id=${id}`, { method: "DELETE" });
      await fetchCampaigns(page);
    } catch {
      setError("Failed to delete campaign.");
    }
  }

  // ── Create ───────────────────────────────────────────────────────────────

  function resetCreateForm() {
    setFormName("");
    setFormRules("");
    setFormVenueIds([]);
    setFormActiveDays([]);
    setFormStartTime("");
    setFormEndTime("");
    setFormEndDate("");
    setFormGameTypes([...GAME_TYPE_OPTIONS]);
    setFormMultiplier("1");
    setFormPointsRequired("100");
    setFormRecurring("none");
    setFormActive(true);
    setCreateError("");
  }

  async function handleCreate() {
    if (!formName.trim()) { setCreateError("Name is required."); return; }
    if (!formRules.trim()) { setCreateError("Rules are required."); return; }
    setCreateBusy(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "challenge-campaigns",
          name: formName.trim(),
          rules: formRules.trim(),
          venueIds: formVenueIds,
          activeDays: formActiveDays,
          startTime: formStartTime || undefined,
          endTime: formEndTime || undefined,
          endDate: formEndDate || undefined,
          gameTypes: formGameTypes,
          pointMultiplier: parseFloat(formMultiplier) || 1,
          pointsRequiredToWin: parseInt(formPointsRequired, 10) || 100,
          recurringType: formRecurring,
          isActive: formActive,
        }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to create campaign.");
      resetCreateForm();
      setMode("list");
      await fetchCampaigns(1);
      setPage(1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create campaign.");
    } finally {
      setCreateBusy(false);
    }
  }

  // ── Create form render ────────────────────────────────────────────────────

  if (mode === "create") {
    const field =
      "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
    const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600";

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">New Challenge Campaign</h2>
          <button
            onClick={() => { resetCreateForm(); setMode("list"); }}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← Back to list
          </button>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2">
            <label className={lbl}>Campaign Name *</label>
            <input className={field} value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Rules *</label>
            <textarea
              className={`${field} h-24 resize-none`}
              value={formRules}
              onChange={(e) => setFormRules(e.target.value)}
            />
          </div>

          {/* Game types */}
          <div>
            <label className={lbl}>Game Types</label>
            <div className="flex flex-wrap gap-2 pt-1">
              {GAME_TYPE_OPTIONS.map((g) => (
                <label key={g} className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={formGameTypes.includes(g)}
                    onChange={() =>
                      setFormGameTypes((prev) =>
                        prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </label>
              ))}
            </div>
          </div>

          {/* Active days */}
          <div>
            <label className={lbl}>Active Days</label>
            <div className="flex flex-wrap gap-2 pt-1">
              {DAY_OPTIONS.map((d) => (
                <label key={d} className="flex cursor-pointer items-center gap-1.5 text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={formActiveDays.includes(d)}
                    onChange={() =>
                      setFormActiveDays((prev) =>
                        prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>

          {/* Time window */}
          <div>
            <label className={lbl}>Start Time</label>
            <input type="time" className={field} value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>End Time</label>
            <input type="time" className={field} value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} />
          </div>

          <div>
            <label className={lbl}>End Date</label>
            <input type="date" className={field} value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Recurring</label>
            <select
              className={field}
              value={formRecurring}
              onChange={(e) => setFormRecurring(e.target.value as CampaignRecurringType)}
            >
              {RECURRING_OPTIONS.map((r) => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={lbl}>Point Multiplier</label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              className={field}
              value={formMultiplier}
              onChange={(e) => setFormMultiplier(e.target.value)}
            />
          </div>
          <div>
            <label className={lbl}>Points Required to Win</label>
            <input
              type="number"
              min={1}
              className={field}
              value={formPointsRequired}
              onChange={(e) => setFormPointsRequired(e.target.value)}
            />
          </div>

          {/* Venue targeting */}
          <div className="col-span-2">
            <label className={lbl}>Target Venues (leave empty for all venues)</label>
            <div className="mt-1 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 p-3">
              {venues.map((v) => (
                <label key={v.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formVenueIds.includes(v.id)}
                    onChange={() =>
                      setFormVenueIds((prev) =>
                        prev.includes(v.id) ? prev.filter((x) => x !== v.id) : [...prev, v.id]
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  {v.name}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Active immediately
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
            onClick={handleCreate}
            disabled={createBusy}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createBusy ? "Creating…" : "Create Campaign"}
          </button>
          <button
            onClick={() => { resetCreateForm(); setMode("list"); }}
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

  const venueNameById = new Map(venues.map((v) => [v.id, v.name]));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Challenge Campaigns</h2>
            <p className="text-xs text-slate-500">{total} total campaigns</p>
          </div>
          <button
            onClick={() => { resetCreateForm(); setMode("create"); }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + New Campaign
          </button>
        </div>

        {/* Bulk action bar */}
        <div className="px-6 pt-4">
          <BulkActionBar
            count={selectedIds.size}
            onEnableSelected={() => bulkPatch(true)}
            onDisableSelected={() => bulkPatch(false)}
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
                <th className={TH}>Name</th>
                <th className={TH}>Status</th>
                <th className={TH}>Games</th>
                <th className={TH}>Recurring</th>
                <th className={TH}>Venues</th>
                <th className={TH}>Winner</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && campaigns.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                    No campaigns yet.
                  </td>
                </tr>
              )}
              {!loading &&
                campaigns.map((c) => (
                  <tr key={c.id} className={TR}>
                    <td className={`${TD} w-10`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleRow(c.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                    </td>
                    <td className={TD}>
                      <span className="font-medium text-slate-900">{c.name}</span>
                      <div className="text-xs text-slate-400">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className={TD}>
                      <StatusBadge isActive={c.isActive} hasWinner={Boolean(c.winnerUserId)} />
                    </td>
                    <td className={`${TD} text-slate-500`}>
                      {c.gameTypes.join(", ")}
                    </td>
                    <td className={`${TD} capitalize text-slate-500`}>{c.recurringType}</td>
                    <td className={`${TD} text-slate-500`}>
                      {c.venueIds.length === 0
                        ? "All venues"
                        : c.venueIds.map((id) => venueNameById.get(id) ?? id).join(", ")}
                    </td>
                    <td className={`${TD} text-slate-500`}>
                      {c.winnerUsername ?? "—"}
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleActive(c)}
                          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          {c.isActive ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => deleteCampaign(c.id, c.name)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

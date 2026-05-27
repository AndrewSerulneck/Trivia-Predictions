"use client";

import { useCallback, useEffect, useState } from "react";
import type { Venue } from "@/types";
import { PaginationBar, BulkActionBar, TH, TD, TR } from "@/components/admin/AdminShell";

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminVenueUser = {
  id: string;
  username: string;
  venueId: string;
  points: number;
  isAdmin: boolean;
  createdAt: string;
};

type EditState = {
  username: string;
  points: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

// ─── Component ────────────────────────────────────────────────────────────────

type UsersSectionProps = {
  venues: Venue[];
};

export function UsersSection({ venues }: UsersSectionProps) {
  const [selectedVenueId, setSelectedVenueId] = useState<string>(venues[0]?.id ?? "");
  const [users, setUsers] = useState<AdminVenueUser[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ username: "", points: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  const fetchUsers = useCallback(
    async (venueId: string, targetPage: number) => {
      if (!venueId) return;
      setLoading(true);
      setError("");
      setSelectedIds(new Set());
      try {
        const url = `/api/admin/users?venueId=${encodeURIComponent(venueId)}&page=${targetPage}&pageSize=${PAGE_SIZE}`;
        const res = await fetch(url, { cache: "no-store" });
        const payload = (await res.json()) as {
          ok: boolean;
          items?: AdminVenueUser[];
          total?: number;
          totalPages?: number;
          error?: string;
        };
        if (!payload.ok) throw new Error(payload.error ?? "Failed to load users.");
        setUsers(payload.items ?? []);
        setTotal(payload.total ?? 0);
        setTotalPages(payload.totalPages ?? 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load users.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setPage(1);
    fetchUsers(selectedVenueId, 1);
  }, [selectedVenueId, fetchUsers]);

  useEffect(() => {
    fetchUsers(selectedVenueId, page);
  }, [page, selectedVenueId, fetchUsers]);

  // ── Selection helpers ────────────────────────────────────────────────────

  const allOnPageSelected = users.length > 0 && users.every((u) => selectedIds.has(u.id));

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(users.map((u) => u.id)));
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Bulk: reset points ──────────────────────────────────────────────────

  async function handleBulkResetPoints() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Reset points to 0 for ${selectedIds.size} user(s)?`)) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((userId) =>
          fetch(`/api/admin/users/${userId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ points: 0 }),
          })
        )
      );
      setSelectedIds(new Set());
      await fetchUsers(selectedVenueId, page);
    } catch {
      setError("Failed to reset points for some users.");
    } finally {
      setBulkBusy(false);
    }
  }

  // ── Inline edit ─────────────────────────────────────────────────────────

  function startEdit(user: AdminVenueUser) {
    setEditingId(user.id);
    setEditState({ username: user.username, points: String(user.points) });
    setEditError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError("");
  }

  async function saveEdit(userId: string) {
    const parsedPoints = parseInt(editState.points, 10);
    if (!editState.username.trim()) {
      setEditError("Username is required.");
      return;
    }
    if (isNaN(parsedPoints) || parsedPoints < 0) {
      setEditError("Points must be a non-negative integer.");
      return;
    }
    setEditBusy(true);
    setEditError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: editState.username.trim(), points: parsedPoints }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to update user.");
      setEditingId(null);
      await fetchUsers(selectedVenueId, page);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setEditBusy(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Venue selector */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Venue
          </label>
          <select
            value={selectedVenueId}
            onChange={(e) => setSelectedVenueId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-sm text-slate-500">{total} total users</span>
        </div>
      </div>

      {/* Table panel */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Bulk action bar */}
        <div className="px-6 pt-4">
          <BulkActionBar
            count={selectedIds.size}
            onDeleteSelected={handleBulkResetPoints}
            onClear={() => setSelectedIds(new Set())}
            busy={bulkBusy}
          />
          {selectedIds.size > 0 && (
            <p className="mb-2 text-xs text-slate-500">
              "Delete" resets points to 0 for selected users.
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
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
                <th className={TH}>Username</th>
                <th className={TH}>Points</th>
                <th className={TH}>Role</th>
                <th className={TH}>Joined</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    No users found for this venue.
                  </td>
                </tr>
              )}
              {!loading &&
                users.map((user) => {
                  const isEditing = editingId === user.id;
                  return (
                    <tr key={user.id} className={TR}>
                      <td className={`${TD} w-10`}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(user.id)}
                          onChange={() => toggleRow(user.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                      </td>

                      {/* Username */}
                      <td className={TD}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editState.username}
                            onChange={(e) =>
                              setEditState((s) => ({ ...s, username: e.target.value }))
                            }
                            className="w-36 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-500"
                          />
                        ) : (
                          <span className="font-medium text-slate-900">{user.username}</span>
                        )}
                      </td>

                      {/* Points */}
                      <td className={TD}>
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            value={editState.points}
                            onChange={(e) =>
                              setEditState((s) => ({ ...s, points: e.target.value }))
                            }
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-500"
                          />
                        ) : (
                          <span className="tabular-nums">{user.points.toLocaleString()}</span>
                        )}
                      </td>

                      <td className={TD}>
                        {user.isAdmin ? (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                            Admin
                          </span>
                        ) : (
                          <span className="text-slate-400">Player</span>
                        )}
                      </td>

                      <td className={`${TD} text-slate-400`}>
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className={`${TD} text-right`}>
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            {editError && (
                              <span className="text-xs text-red-600">{editError}</span>
                            )}
                            <button
                              onClick={() => saveEdit(user.id)}
                              disabled={editBusy}
                              className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={editBusy}
                              className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(user)}
                            className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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

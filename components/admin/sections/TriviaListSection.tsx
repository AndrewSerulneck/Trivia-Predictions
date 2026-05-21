"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TriviaQuestion } from "@/types";
import { BulkActionBar, PaginationBar, TD, TH, TR } from "@/components/admin/AdminShell";

const PAGE_SIZE = 25;

type PoolFilter = "all" | "anytime_blitz" | "live_showdown";
type AnswerFormatFilter = "all" | "multiple_choice" | "write_in" | "numeric" | "true_false";

function labelPool(value: TriviaQuestion["questionPool"]) {
  return value === "live_showdown" ? "Live Trivia" : "Speed Trivia";
}

function labelAnswerFormat(value: TriviaQuestion["answerFormat"]) {
  switch (value) {
    case "write_in":
      return "Write-In";
    case "numeric":
      return "Numeric";
    case "true_false":
      return "True/False";
    default:
      return "Multiple Choice";
  }
}

export function TriviaListSection() {
  const [items, setItems] = useState<TriviaQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [poolFilter, setPoolFilter] = useState<PoolFilter>("all");
  const [answerFormatFilter, setAnswerFormatFilter] = useState<AnswerFormatFilter>("all");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allOnPageSelected = useMemo(
    () => items.length > 0 && items.every((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const fetchTrivia = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError("");
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams({
        resource: "trivia",
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
      });
      if (poolFilter !== "all") {
        params.set("questionPool", poolFilter);
      }
      if (answerFormatFilter !== "all") {
        params.set("answerFormat", answerFormatFilter);
      }
      const res = await fetch(`/api/admin?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json()) as {
        ok: boolean;
        items?: TriviaQuestion[];
        total?: number;
        totalPages?: number;
        error?: string;
      };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load trivia questions.");
      }
      setItems(payload.items ?? []);
      setTotal(payload.total ?? 0);
      setTotalPages(payload.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trivia questions.");
    } finally {
      setLoading(false);
    }
  }, [answerFormatFilter, poolFilter]);

  useEffect(() => {
    setPage(1);
    fetchTrivia(1);
  }, [poolFilter, answerFormatFilter, fetchTrivia]);

  useEffect(() => {
    fetchTrivia(page);
  }, [page, fetchTrivia]);

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((item) => item.id)));
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected question(s)?`)) return;
    setBusy(true);
    setError("");
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/admin?resource=trivia&id=${encodeURIComponent(id)}`, { method: "DELETE" })
        )
      );
      await fetchTrivia(page);
      setSelectedIds(new Set());
    } catch {
      setError("Failed to delete one or more selected questions.");
    } finally {
      setBusy(false);
    }
  }

  async function bulkReassign(questionPool: "anytime_blitz" | "live_showdown") {
    if (selectedIds.size === 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "trivia-bulk",
          ids: Array.from(selectedIds),
          questionPool,
        }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to reassign selected items.");
      }
      await fetchTrivia(page);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reassign selected items.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Question Pool
            </label>
            <select
              value={poolFilter}
              onChange={(e) => setPoolFilter(e.target.value as PoolFilter)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">Show All</option>
              <option value="anytime_blitz">Speed Trivia (anytime_blitz)</option>
              <option value="live_showdown">Live Trivia (live_showdown)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Answer Format
            </label>
            <select
              value={answerFormatFilter}
              onChange={(e) => setAnswerFormatFilter(e.target.value as AnswerFormatFilter)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">Show All</option>
              <option value="multiple_choice">Multiple Choice</option>
              <option value="write_in">Write-In</option>
              <option value="numeric">Numeric</option>
              <option value="true_false">True/False</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="px-6 pt-4">
          <BulkActionBar
            count={selectedIds.size}
            onEnableSelected={() => {
              void bulkReassign("anytime_blitz");
            }}
            onDisableSelected={() => {
              void bulkReassign("live_showdown");
            }}
            onDeleteSelected={() => {
              void bulkDelete();
            }}
            onClear={() => setSelectedIds(new Set())}
            busy={busy}
          />
          {selectedIds.size > 0 ? (
            <p className="mb-2 text-xs text-slate-500">
              Enable = reassign to Speed Trivia, Disable = reassign to Live Trivia.
            </p>
          ) : null}
        </div>

        {error ? (
          <div className="mx-6 mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        ) : null}

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
                <th className={TH}>Question</th>
                <th className={TH}>Category</th>
                <th className={TH}>Pool</th>
                <th className={TH}>Format</th>
                <th className={TH}>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    No trivia questions found.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className={TR}>
                    <td className={`${TD} w-10`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleRow(item.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                    </td>
                    <td className={`${TD} max-w-[640px]`}>
                      <p className="truncate font-medium text-slate-900">{item.question}</p>
                    </td>
                    <td className={`${TD} text-slate-600`}>{item.category ?? "Uncategorized"}</td>
                    <td className={TD}>{labelPool(item.questionPool)}</td>
                    <td className={TD}>{labelAnswerFormat(item.answerFormat)}</td>
                    <td className={`${TD} text-slate-500`}>
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        ) : null}
      </div>
    </div>
  );
}

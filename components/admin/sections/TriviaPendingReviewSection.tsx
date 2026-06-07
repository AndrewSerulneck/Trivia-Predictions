"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GitPullRequest } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

type QuestionPool = "live_showdown" | "anytime_blitz";

type PendingQuestion = {
  id: string;
  slug: string | null;
  question: string;
  options: string[];
  correctAnswer: number;
  answer: string;
  category: string | null;
  difficulty: string | null;
  pool: QuestionPool;
  status: string;
  answerFormat: string | null;
  createdAt: string;
};

type EditDraft = {
  question: string;
  answer: string;
  options: string[];
  correctAnswer: number;
};

const TABS: ReadonlyArray<{ pool: QuestionPool; label: string }> = [
  { pool: "live_showdown", label: "Live Trivia Pending" },
  { pool: "anytime_blitz", label: "Speed Trivia Pending" },
];

const PAGE_LIMIT = 200;

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
}

export function TriviaPendingReviewSection() {
  const [activeTab, setActiveTab] = useState<QuestionPool>("live_showdown");
  const [items, setItems] = useState<PendingQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [exportPrUrl, setExportPrUrl] = useState("");

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchPending = useCallback(async (pool: QuestionPool) => {
    setLoading(true);
    setError("");
    setSuccess("");
    setSelectedIds({});
    setEditingId(null);
    setEditDraft(null);
    try {
      const params = new URLSearchParams({
        status: "pending_review",
        pool,
        limit: String(PAGE_LIMIT),
        offset: "0",
      });
      const response = await fetch(`/api/admin/trivia/questions?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        ok: boolean;
        items?: PendingQuestion[];
        total?: number;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to load pending questions.");
      }
      setItems(payload.items ?? []);
      setTotal(payload.total ?? 0);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load pending questions."));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCategoryFilter("all");
    void fetchPending(activeTab);
  }, [activeTab, fetchPending]);

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    for (const item of items) {
      if (item.category) categories.add(item.category);
    }
    return ["all", ...Array.from(categories).sort()];
  }, [items]);

  const filteredItems = useMemo(() => {
    if (categoryFilter === "all") return items;
    return items.filter((item) => item.category === categoryFilter);
  }, [items, categoryFilter]);

  const selectedCount = useMemo(
    () => filteredItems.filter((item) => selectedIds[item.id]).length,
    [filteredItems, selectedIds]
  );
  const allFilteredSelected = filteredItems.length > 0 && selectedCount === filteredItems.length;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (filteredItems.length > 0 && filteredItems.every((item) => prev[item.id])) {
        const next = { ...prev };
        for (const item of filteredItems) delete next[item.id];
        return next;
      }
      const next = { ...prev };
      for (const item of filteredItems) next[item.id] = true;
      return next;
    });
  }, [filteredItems]);

  const runBulkAction = useCallback(
    async (action: "approve" | "delete") => {
      const ids = filteredItems.filter((item) => selectedIds[item.id]).map((item) => item.id);
      if (ids.length === 0) {
        setError("Select at least one question first.");
        return;
      }
      setBulkBusy(true);
      setError("");
      setSuccess("");
      try {
        const response = await fetch("/api/admin/trivia/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ids, pool: activeTab }),
        });
        const payload = (await response.json()) as { ok: boolean; updated?: number; error?: string };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Bulk action failed.");
        }
        const idSet = new Set(ids);
        setItems((prev) => prev.filter((item) => !idSet.has(item.id)));
        setTotal((prev) => Math.max(0, prev - ids.length));
        setSelectedIds({});
        setSuccess(`${action === "approve" ? "Approved" : "Deleted"} ${payload.updated ?? ids.length} question(s).`);
      } catch (err) {
        setError(getErrorMessage(err, "Bulk action failed."));
      } finally {
        setBulkBusy(false);
      }
    },
    [activeTab, filteredItems, selectedIds]
  );

  const exportApprovedSpeedJson = useCallback(async () => {
    if (activeTab !== "anytime_blitz") {
      setError("JSON export is only available for Speed Trivia.");
      return;
    }

    setExportingJson(true);
    setError("");
    setSuccess("");
    setExportPrUrl("");
    try {
      const response = await fetch("/api/admin/trivia/questions/export-speed-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as {
        ok: boolean;
        totalQuestions?: number;
        categories?: number;
        changedFiles?: string[];
        prUrl?: string;
        alreadyUpToDate?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        console.error("[speed-trivia-export-pr]", {
          status: response.status,
          payload,
        });
        throw new Error(payload.error ?? "Failed to create Speed Trivia export PR.");
      }
      if (payload.alreadyUpToDate) {
        setSuccess("Approved Speed Trivia JSON is already up to date on GitHub.");
        return;
      }
      setExportPrUrl(payload.prUrl ?? "");
      setSuccess(
        `Created export PR for ${payload.totalQuestions ?? 0} approved Speed Trivia question(s) across ${
          payload.changedFiles?.length ?? payload.categories ?? 0
        } JSON file(s).`
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create Speed Trivia export PR."));
    } finally {
      setExportingJson(false);
    }
  }, [activeTab]);

  const startEdit = useCallback((item: PendingQuestion) => {
    setEditingId(item.id);
    setEditDraft({
      question: item.question,
      answer: item.answer,
      options: item.pool === "live_showdown" ? [] : [...item.options],
      correctAnswer: item.correctAnswer,
    });
    setError("");
    setSuccess("");
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft(null);
  }, []);

  const saveEdit = useCallback(
    async (item: PendingQuestion) => {
      if (!editDraft) return;
      setSavingEdit(true);
      setError("");
      setSuccess("");
      try {
        const body: {
          question: string;
          answer?: string;
          options?: string[];
          correctAnswer?: number;
        } = { question: editDraft.question.trim() };
        if (item.pool === "live_showdown") {
          body.answer = editDraft.answer.trim();
        } else {
          body.options = editDraft.options.map((option) => option.trim());
          body.correctAnswer = editDraft.correctAnswer;
        }

        const response = await fetch(`/api/admin/trivia/questions/${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as { ok: boolean; error?: string };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Failed to save question.");
        }

        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  question: body.question,
                  answer: body.answer ?? row.answer,
                  options: body.options ?? row.options,
                  correctAnswer: body.correctAnswer ?? row.correctAnswer,
                }
              : row
          )
        );
        setEditingId(null);
        setEditDraft(null);
        setSuccess("Question updated.");
      } catch (err) {
        setError(getErrorMessage(err, "Failed to save question."));
      } finally {
        setSavingEdit(false);
      }
    },
    [editDraft]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Question Review</h2>
        <p className="mt-1 text-sm text-slate-500">
          Review newly generated questions before they enter games. Approve to activate, delete to discard.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const isActive = tab.pool === activeTab;
            return (
              <button
                key={tab.pool}
                type="button"
                onClick={() => setActiveTab(tab.pool)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  isActive ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {tab.label}
                {isActive ? (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-slate-900">{total}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4 max-w-xs">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Category</label>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All Categories" : option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
          {exportPrUrl ? (
            <a
              href={exportPrUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-2 font-semibold underline underline-offset-2"
            >
              Open PR
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void runBulkAction("approve")}
          disabled={bulkBusy || selectedCount === 0}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Approve Selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => void runBulkAction("delete")}
          disabled={bulkBusy || selectedCount === 0}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          Delete Selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
        {activeTab === "anytime_blitz" ? (
          <button
            type="button"
            onClick={() => void exportApprovedSpeedJson()}
            disabled={exportingJson}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
          >
            <GitPullRequest className="h-4 w-4" aria-hidden="true" />
            {exportingJson ? "Creating PR..." : "Create JSON Export PR"}
          </button>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Question</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {activeTab === "live_showdown" ? "Answer" : "Options / Correct"}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Created</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">Loading pending questions...</td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">No pending questions to review.</td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <tr key={item.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedIds[item.id])}
                          onChange={() => toggleSelect(item.id)}
                          aria-label={`Select question ${item.id}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.category ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-900">
                        {isEditing && editDraft ? (
                          <textarea
                            value={editDraft.question}
                            onChange={(event) =>
                              setEditDraft((prev) => (prev ? { ...prev, question: event.target.value } : prev))
                            }
                            className="w-full min-w-[16rem] rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            rows={2}
                          />
                        ) : (
                          <span className="font-medium">{item.question}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {isEditing && editDraft ? (
                          item.pool === "live_showdown" ? (
                            <input
                              value={editDraft.answer}
                              onChange={(event) =>
                                setEditDraft((prev) => (prev ? { ...prev, answer: event.target.value } : prev))
                              }
                              className="w-full min-w-[10rem] rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            />
                          ) : (
                            <div className="space-y-1">
                              {editDraft.options.map((option, index) => (
                                <div key={index} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`correct-${item.id}`}
                                    checked={editDraft.correctAnswer === index}
                                    onChange={() =>
                                      setEditDraft((prev) => (prev ? { ...prev, correctAnswer: index } : prev))
                                    }
                                    aria-label={`Mark option ${index + 1} correct`}
                                  />
                                  <input
                                    value={option}
                                    onChange={(event) =>
                                      setEditDraft((prev) => {
                                        if (!prev) return prev;
                                        const options = [...prev.options];
                                        options[index] = event.target.value;
                                        return { ...prev, options };
                                      })
                                    }
                                    className="w-full min-w-[10rem] rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                  />
                                </div>
                              ))}
                            </div>
                          )
                        ) : item.pool === "live_showdown" ? (
                          <span className="font-semibold">{item.answer || "—"}</span>
                        ) : (
                          <div className="space-y-0.5">
                            {item.options.map((option, index) => (
                              <div
                                key={index}
                                className={index === item.correctAnswer ? "font-semibold text-emerald-700" : "text-slate-600"}
                              >
                                {index === item.correctAnswer ? "✓ " : ""}
                                {option}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(item.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              onClick={() => void saveEdit(item)}
                              disabled={savingEdit}
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {savingEdit ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={savingEdit}
                              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                            aria-label="Edit question"
                          >
                            ✏️ Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

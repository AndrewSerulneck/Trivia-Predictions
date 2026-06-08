"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { TriviaQuestion } from "@/types";
import { BulkActionBar, PaginationBar, TD, TH, TR } from "@/components/admin/AdminShell";

const PAGE_SIZE = 25;

type QuestionType = "speed" | "live";
type AnswerFormatFilter = "all" | "multiple_choice" | "write_in" | "numeric" | "true_false";
type SortField = "created_at" | "category" | "difficulty" | "question_pool" | "answer_format";
type SortDirection = "asc" | "desc";

type EditFormState = {
  id: string;
  question: string;
  category: string;
  difficulty: string;
  questionPool: "anytime_blitz" | "live_showdown";
  answerFormat: "multiple_choice" | "write_in" | "numeric" | "true_false";
  options: [string, string, string, string];
  correctAnswer: number;
  writeInAnswer: string;
};

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

function toEditState(item: TriviaQuestion): EditFormState {
  const options = Array.isArray(item.options) ? item.options : [];
  const padded: [string, string, string, string] = [
    options[0] ?? "",
    options[1] ?? "",
    options[2] ?? "",
    options[3] ?? "",
  ];
  const answerFormat = item.answerFormat ?? "multiple_choice";

  return {
    id: item.id,
    question: item.question,
    category: item.category ?? "",
    difficulty: item.difficulty ?? "",
    questionPool: item.questionPool ?? "anytime_blitz",
    answerFormat,
    options: padded,
    correctAnswer: Math.max(0, Math.min(3, Number(item.correctAnswer ?? 0))),
    writeInAnswer: answerFormat === "multiple_choice" ? "" : options[item.correctAnswer] ?? options[0] ?? "",
  };
}

export function TriviaListSection() {
  const [questionType, setQuestionType] = useState<QuestionType>("speed");
  const [items, setItems] = useState<TriviaQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [answerFormatFilter, setAnswerFormatFilter] = useState<AnswerFormatFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditFormState | null>(null);
  const [allCategories, setAllCategories] = useState<string[]>([]);

  const allOnPageSelected = useMemo(
    () => items.length > 0 && items.every((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const categoryOptions = useMemo(() => ["", ...allCategories], [allCategories]);

  const fetchTrivia = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          resource: "trivia",
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
          sortBy,
          sortDirection,
        });
        params.set("questionType", questionType);
        if (answerFormatFilter !== "all") params.set("answerFormat", answerFormatFilter);
        if (categoryFilter.trim()) params.set("category", categoryFilter.trim());
        if (startDate) params.set("startDate", `${startDate}T00:00:00.000Z`);
        if (endDate) params.set("endDate", `${endDate}T23:59:59.999Z`);

        const res = await fetch(`/api/admin?${params.toString()}`, { cache: "no-store" });
        const payload = (await res.json()) as {
          ok: boolean;
          items?: TriviaQuestion[];
          total?: number;
          totalPages?: number;
          error?: string;
        };
        if (!payload.ok || !res.ok) {
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
    },
    [answerFormatFilter, categoryFilter, endDate, questionType, sortBy, sortDirection, startDate]
  );

  const fetchCategories = useCallback(async () => {
    try {
      const params = new URLSearchParams({ resource: "trivia-categories", questionType });
      const res = await fetch(`/api/admin?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json()) as { ok: boolean; categories?: string[] };
      if (payload.ok && Array.isArray(payload.categories)) {
        setAllCategories(payload.categories);
      }
    } catch {
      // silently ignore — main fetch error handling covers the user-visible case
    }
  }, [questionType]);

  useEffect(() => {
    setAllCategories([]);
    void fetchCategories();
  }, [questionType, fetchCategories]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setEditing(null);
    void fetchTrivia(1);
  }, [questionType, answerFormatFilter, categoryFilter, startDate, endDate, sortBy, sortDirection, fetchTrivia]);

  useEffect(() => {
    void fetchTrivia(page);
  }, [page, fetchTrivia]);

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(items.map((item) => item.id)));
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteSingle(id: string) {
    if (!confirm("Delete this trivia question?")) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin?resource=trivia&id=${encodeURIComponent(id)}&questionType=${questionType}`, { method: "DELETE" });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Failed to delete trivia question.");
      setSuccess("Trivia question deleted.");
      if (editing?.id === id) setEditing(null);
      await fetchTrivia(page);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete trivia question.");
    } finally {
      setBusy(false);
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected question(s)?`)) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(
        ids.map((id) => fetch(`/api/admin?resource=trivia&id=${encodeURIComponent(id)}&questionType=${questionType}`, { method: "DELETE" }))
      );
      setSuccess(`${ids.length} trivia question(s) deleted.`);
      setSelectedIds(new Set());
      setEditing(null);
      await fetchTrivia(page);
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
    setSuccess("");
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
      if (!payload.ok || !res.ok) {
        throw new Error(payload.error ?? "Failed to reassign selected questions.");
      }
      setSuccess(`Reassigned ${selectedIds.size} question(s).`);
      setSelectedIds(new Set());
      await fetchTrivia(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reassign selected questions.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;

    const isMultipleChoice = editing.answerFormat === "multiple_choice";
    const options = isMultipleChoice
      ? editing.options.map((option) => option.trim())
      : [editing.writeInAnswer.trim()];

    if (!editing.question.trim()) {
      setError("Question text is required.");
      return;
    }

    if (isMultipleChoice && options.some((option) => !option)) {
      setError("All multiple-choice options are required.");
      return;
    }

    if (!isMultipleChoice && !options[0]) {
      setError("A canonical answer is required for this format.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "trivia",
          questionType,
          id: editing.id,
          question: editing.question.trim(),
          category: editing.category.trim() || undefined,
          difficulty: editing.difficulty.trim() || undefined,
          questionPool: editing.questionPool,
          answerFormat: editing.answerFormat,
          options,
          correctAnswer: isMultipleChoice ? editing.correctAnswer : 0,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string; item?: TriviaQuestion };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Failed to save question.");

      setSuccess("Question updated.");
      setEditing(null);
      await fetchTrivia(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save question.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortDirection("asc");
  }

  const typeTabClass = (type: QuestionType) =>
    `px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
      questionType === type
        ? type === "speed"
          ? "bg-indigo-600 text-white shadow-sm"
          : "bg-emerald-600 text-white shadow-sm"
        : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <div className="space-y-4">
      {/* Top-level question type toggle */}
      <div className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:px-6">
        <span className="text-sm font-semibold text-slate-700 mr-2">Question Bank:</span>
        <button type="button" onClick={() => { setQuestionType("speed"); setCategoryFilter(""); setAnswerFormatFilter("all"); }} className={`${typeTabClass("speed")} min-h-[44px] w-full sm:w-auto`}>
          Speed Trivia
        </button>
        <button type="button" onClick={() => { setQuestionType("live"); setCategoryFilter(""); setAnswerFormatFilter("all"); }} className={`${typeTabClass("live")} min-h-[44px] w-full sm:w-auto`}>
          Live Trivia
        </button>
        <span className="text-xs text-slate-400 sm:ml-auto">
          {questionType === "speed" ? "Multiple-choice · anytime_blitz pool" : "Write-in · live_showdown pool"}
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Answer Format</label>
            <select
              value={answerFormatFilter}
              onChange={(event) => setAnswerFormatFilter(event.target.value as AnswerFormatFilter)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">Show All</option>
              <option value="multiple_choice">Multiple Choice</option>
              <option value="write_in">Write-In</option>
              <option value="numeric">Numeric</option>
              <option value="true_false">True/False</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Category</label>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {categoryOptions.map((category) => (
                <option key={category || "all"} value={category}>
                  {category || "Show All"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Sort By</label>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortField)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="created_at">Created</option>
                <option value="category">Category</option>
                <option value="difficulty">Difficulty</option>
                <option value="question_pool">Pool</option>
                <option value="answer_format">Format</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Direction</label>
              <select
                value={sortDirection}
                onChange={(event) => setSortDirection(event.target.value as SortDirection)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{success}</div> : null}

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
            <p className="mb-2 text-xs text-slate-500">Enable = reassign to Speed Trivia, Disable = reassign to Live Trivia.</p>
          ) : null}
        </div>

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
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("created_at")}>Question</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("category")}>Category</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("difficulty")}>Difficulty</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("question_pool")}>Pool</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("answer_format")}>Format</th>
                <th className={TH}>Created</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">Loading...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">No trivia questions found.</td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const isEditing = editing?.id === item.id;

                  return (
                    <Fragment key={`${item.id}-${index}`}>
                      <tr className={TR}>
                        <td className={`${TD} w-10`}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleRow(item.id)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                        </td>
                        <td className={`${TD} max-w-[560px]`}>
                          <p className="font-medium text-slate-900">{item.question}</p>
                        </td>
                        <td className={`${TD} text-slate-600`}>{item.category ?? "Uncategorized"}</td>
                        <td className={TD}>
                          {item.difficulty ? (
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              item.difficulty === "easy"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.difficulty === "medium"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-red-100 text-red-800"
                            }`}>
                              {item.difficulty}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className={TD}>{labelPool(item.questionPool)}</td>
                        <td className={TD}>{labelAnswerFormat(item.answerFormat)}</td>
                        <td className={`${TD} text-slate-500`}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "-"}
                        </td>
                        <td className={`${TD} text-right`}>
                          <div className="inline-flex flex-col gap-2 sm:flex-row">
                            <button
                              onClick={() => setEditing(isEditing ? null : toEditState(item))}
                              className="min-h-[44px] rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            >
                              {isEditing ? "Close" : "Edit"}
                            </button>
                            <button
                              onClick={() => {
                                void deleteSingle(item.id);
                              }}
                              disabled={busy}
                              className="min-h-[44px] rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isEditing && editing ? (
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="md:col-span-2">
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Question</label>
                                <textarea
                                  value={editing.question}
                                  onChange={(event) => setEditing({ ...editing, question: event.target.value })}
                                  rows={2}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Category</label>
                                <input
                                  value={editing.category}
                                  onChange={(event) => setEditing({ ...editing, category: event.target.value })}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Difficulty</label>
                                <input
                                  value={editing.difficulty}
                                  onChange={(event) => setEditing({ ...editing, difficulty: event.target.value })}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>

                              {questionType !== "live" && (
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Pool</label>
                                  <select
                                    value={editing.questionPool}
                                    onChange={(event) =>
                                      setEditing({ ...editing, questionPool: event.target.value as EditFormState["questionPool"] })
                                    }
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                  >
                                    <option value="anytime_blitz">anytime_blitz</option>
                                    <option value="live_showdown">live_showdown</option>
                                  </select>
                                </div>
                              )}
                              {questionType !== "live" && (
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Format</label>
                                  <select
                                    value={editing.answerFormat}
                                    onChange={(event) =>
                                      setEditing({ ...editing, answerFormat: event.target.value as EditFormState["answerFormat"] })
                                    }
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                  >
                                    <option value="multiple_choice">multiple_choice</option>
                                    <option value="write_in">write_in</option>
                                    <option value="numeric">numeric</option>
                                    <option value="true_false">true_false</option>
                                  </select>
                                </div>
                              )}

                              {editing.answerFormat === "multiple_choice" ? (
                                <>
                                  {[0, 1, 2, 3].map((index) => (
                                    <div key={index}>
                                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                                        Option {String.fromCharCode(65 + index)}
                                      </label>
                                      <input
                                        value={editing.options[index]}
                                        onChange={(event) => {
                                          const nextOptions = [...editing.options] as [string, string, string, string];
                                          nextOptions[index] = event.target.value;
                                          setEditing({ ...editing, options: nextOptions });
                                        }}
                                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                      />
                                    </div>
                                  ))}
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Correct Option</label>
                                    <select
                                      value={editing.correctAnswer}
                                      onChange={(event) => setEditing({ ...editing, correctAnswer: Number(event.target.value) })}
                                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    >
                                      <option value={0}>Option A</option>
                                      <option value={1}>Option B</option>
                                      <option value={2}>Option C</option>
                                      <option value={3}>Option D</option>
                                    </select>
                                  </div>
                                </>
                              ) : (
                                <div className="md:col-span-2">
                                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                                    Correct Answer
                                  </label>
                                  <input
                                    type={editing.answerFormat === "numeric" ? "number" : "text"}
                                    value={editing.writeInAnswer}
                                    onChange={(event) => setEditing({ ...editing, writeInAnswer: event.target.value })}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                              <button
                                onClick={() => {
                                  void saveEdit();
                                }}
                                disabled={busy}
                                className="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                              >
                                {busy ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={() => setEditing(null)}
                                className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        ) : null}
      </div>
    </div>
  );
}

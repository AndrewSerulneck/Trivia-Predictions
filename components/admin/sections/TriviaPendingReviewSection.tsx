"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, GitPullRequest, Sparkles, Trash2 } from "lucide-react";
import { PaginationBar } from "@/components/admin/AdminShell";
import { getErrorMessage } from "@/lib/errors";
import { runTriviaBulkAction } from "@/lib/triviaBulkAction";
import type { TriviaReviewCounts, TriviaReviewRow } from "@/types/triviaReview";
import { adminField, adminLabel } from "@/lib/adminStyles";

type QuestionPool = "live_showdown" | "anytime_blitz";

type PendingQuestion = {
  id: string;
  slug: string | null;
  question: string;
  options: string[];
  correctAnswer: number;
  answer: string;
  acceptableAnswers?: string[];
  category: string | null;
  difficulty: string | null;
  pool: QuestionPool;
  status: string;
  answerFormat: string | null;
  createdAt: string;
};

type LiveExportQuestion = {
  sourceId: string;
  slug: string;
  question: string;
  answer: string;
  acceptableAnswers?: string[];
  answer_format: "write_in";
  category: string;
  difficulty: string;
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
  const [reviewQueue, setReviewQueue] = useState<"ready" | "held" | "unverified">("ready");
  const [activeTab, setActiveTab] = useState<QuestionPool>("live_showdown");
  const [items, setItems] = useState<PendingQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [exportPrUrl, setExportPrUrl] = useState("");

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkLock = useRef(false);
  const [reviewRows, setReviewRows] = useState<Record<string, TriviaReviewRow>>({});
  const [reviewCounts, setReviewCounts] = useState<TriviaReviewCounts | null>(null);
  const [checkingQuestion, setCheckingQuestion] = useState("");
  const [continuing, setContinuing] = useState(false);
  const [reviewNeedsRefresh, setReviewNeedsRefresh] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [convertingLiveExport, setConvertingLiveExport] = useState(false);
  const [liveExportItems, setLiveExportItems] = useState<LiveExportQuestion[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchPending = useCallback(async (pool: QuestionPool, targetPage: number) => {
    if (bulkLock.current) return;
    setReviewRows({});
    setReviewCounts(null);
    setCheckingQuestion("");
    setContinuing(false);
    setReviewNeedsRefresh(false);
    setSelectedIds({});
    setLoading(true);
    setError("");
    setSuccess("");
    setEditingId(null);
    setEditDraft(null);
    try {
      const params = new URLSearchParams({
        status: "pending_review",
        pool,
        queue: reviewQueue,
        limit: String(PAGE_LIMIT),
        offset: String((targetPage - 1) * PAGE_LIMIT),
      });
      const response = await fetch(`/api/admin/trivia/questions?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        ok: boolean;
        items?: PendingQuestion[];
        total?: number;
        limit?: number;
        offset?: number;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to load pending questions.");
      }
      setItems(payload.items ?? []);
      const nextTotal = payload.total ?? 0;
      const nextLimit = payload.limit ?? PAGE_LIMIT;
      setTotal(nextTotal);
      setTotalPages(Math.max(1, Math.ceil(nextTotal / Math.max(1, nextLimit))));
      setPage(targetPage);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load pending questions."));
      setItems([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [reviewQueue]);

  useEffect(() => {
    setCategoryFilter("all");
    setSelectedIds({});
    setPage(1);
    void fetchPending(activeTab, 1);
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
    setContinuing(false);
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleSelectAll = useCallback(() => {
    setContinuing(false);
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
      if (bulkLock.current || loading || savingEdit || convertingLiveExport || exportingJson || editingId || reviewNeedsRefresh) return;
      bulkLock.current = true;
      setBulkBusy(true);
      setContinuing(false);
      setError("");
      setSuccess("");
      setCheckingQuestion("");
      setReviewCounts(action === "approve" && activeTab === "anytime_blitz" ? { checked: 0, approved: 0, repeats: 0, unresolved: 0, remaining: ids.length } : null);
      setReviewRows(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.includes(id))));
      const removed = new Set<string>();
      const removeSaved = (saved: string[]) => {
        const fresh = saved.filter(id => !removed.has(id));
        for (const id of fresh) removed.add(id);
        setItems(prev => prev.filter(item => !removed.has(item.id)));
        setTotal(prev => Math.max(0, prev - fresh.length));
      };
      try {
        const payload = await runTriviaBulkAction(action, ids, activeTab, fetch, record => {
          if (record.type === "checking") setCheckingQuestion(record.question);
          if (record.type === "row") {
            setReviewRows(prev => ({ ...prev, [record.result.id]: record.result }));
            setReviewCounts(record.counts);
            setCheckingQuestion("");
            if (record.result.outcome === "approved") removeSaved([record.result.id]);
          }
        });
        removeSaved(payload.savedIds);
        const finished = new Set([...payload.savedIds, ...(payload.repeats ?? []).map(row => row.id), ...(payload.holds ?? []).map(row => row.id)]);
        const unfinished = ids.filter(id => !finished.has(id));
        if (action === "approve" && activeTab === "anytime_blitz") {
          setReviewCounts({ checked: finished.size, approved: payload.savedIds.length, repeats: payload.repeats?.length ?? 0, unresolved: payload.holds?.length ?? 0, remaining: unfinished.length });
          setReviewRows(prev => ({ ...prev,
            ...Object.fromEntries((payload.repeats ?? []).map(row => [row.id, { ...row, outcome: "repeat" as const }])),
            ...Object.fromEntries((payload.holds ?? []).map(row => [row.id, { ...row, outcome: "unresolved" as const }])),
          }));
        }
        const paused = payload.paused && !payload.unconfirmed;
        setSelectedIds(paused ? Object.fromEntries(unfinished.map(id => [id, true])) : {});
        setContinuing(Boolean(paused && unfinished.length));
        setReviewNeedsRefresh(Boolean(payload.unconfirmed || payload.recovered && !paused));
        setSuccess(paused ? "Paused at the time or checking budget limit. Saved approvals are kept. Only unchecked questions are selected for Continue. Each Continue click has its own $0.50 cap."
          : payload.unconfirmed ? "" : `${action === "approve" ? "Approved" : "Deleted"} ${payload.savedIds.length} question(s).`);
        if (!payload.ok) setError(payload.error ?? "Some questions could not be saved. Saved changes are counted above.");
      } catch (err) {
        setSelectedIds({});
        setReviewNeedsRefresh(true);
        setError(getErrorMessage(err, "Bulk action failed. Refresh Question Review before continuing."));
      } finally {
        setCheckingQuestion("");
        bulkLock.current = false;
        setBulkBusy(false);
      }
    },
    [activeTab, filteredItems, selectedIds, loading, savingEdit, convertingLiveExport, exportingJson, editingId, reviewNeedsRefresh]
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

  const convertSelectedToLiveExport = useCallback(async () => {
    if (activeTab !== "anytime_blitz") {
      setError("Live export conversion is only available from Speed Trivia pending questions.");
      return;
    }

    const ids = filteredItems.filter((item) => selectedIds[item.id]).map((item) => item.id);
    if (ids.length === 0) {
      setError("Select at least one question first.");
      return;
    }

    setConvertingLiveExport(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/trivia/questions/convert-live-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        items?: LiveExportQuestion[];
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to convert selected questions.");
      }

      const incoming = payload.items ?? [];
      setLiveExportItems((prev) => {
        const merged = new Map<string, LiveExportQuestion>();
        for (const item of prev) merged.set(item.sourceId, item);
        for (const item of incoming) merged.set(item.sourceId, item);
        return Array.from(merged.values()).sort((a, b) => {
          const category = a.category.localeCompare(b.category);
          return category !== 0 ? category : a.question.localeCompare(b.question);
        });
      });
      setSuccess(`Added ${incoming.length} question(s) to the Live Trivia export list.`);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to convert selected questions."));
    } finally {
      setConvertingLiveExport(false);
    }
  }, [activeTab, filteredItems, selectedIds]);

  const removeLiveExportItem = useCallback((sourceId: string) => {
    setLiveExportItems((prev) => prev.filter((item) => item.sourceId !== sourceId));
  }, []);

  const clearLiveExportItems = useCallback(() => {
    setLiveExportItems([]);
  }, []);

  const downloadLiveExportJson = useCallback(() => {
    if (liveExportItems.length === 0) {
      setError("Add at least one converted question before exporting.");
      return;
    }

    const payload = liveExportItems.map(({ sourceId: _sourceId, ...item }) => item);
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `live-trivia-export-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setSuccess(`Downloaded ${liveExportItems.length} Live Trivia question(s) as JSON.`);
  }, [liveExportItems]);

  const startEdit = useCallback((item: PendingQuestion) => {
    setContinuing(false);
    setReviewRows(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== item.id)));
    setReviewCounts(null);
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
    <fieldset disabled={bulkBusy || loading || savingEdit || convertingLiveExport || exportingJson} className="min-w-0 space-y-4">
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
                disabled={bulkBusy}
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

        {activeTab === "anytime_blitz" ? (
          <div className="mt-4 max-w-xs">
            <label className={adminLabel}>Review queue</label>
            <select value={reviewQueue} onChange={(event) => setReviewQueue(event.target.value as typeof reviewQueue)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
              <option value="ready">Verified and ready</option><option value="held">Held for resolution</option><option value="unverified">Legacy questions awaiting checks</option>
            </select>
          </div>
        ) : null}
        <div className="mt-4 max-w-xs">
          <label className={adminLabel}>Category</label>
          <select
            value={categoryFilter}
            onChange={(event) => { setCategoryFilter(event.target.value); setContinuing(false); }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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

      {activeTab === "anytime_blitz" ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <p>Checking compares with approved questions. Each Approve or Continue click has a $0.50 cap for the whole selection, including retries.</p>
          {reviewCounts ? (
            <div role="status" aria-live="polite" className="mt-2">
              Checked: {reviewCounts.checked} · Approved: {reviewCounts.approved} · Repeats: {reviewCounts.repeats} · Unresolved: {reviewCounts.unresolved} · Remaining: {reviewCounts.remaining}
              {bulkBusy ? <p className="mt-1">{checkingQuestion ? `Checking: ${checkingQuestion}` : "Preparing the next check…"}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void runBulkAction("approve")}
          disabled={bulkBusy || selectedCount === 0 || Boolean(editingId) || reviewNeedsRefresh}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {bulkBusy ? "Working…" : continuing ? "Continue" : "Approve Selected"}{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => void runBulkAction("delete")}
          disabled={bulkBusy || selectedCount === 0 || Boolean(editingId) || reviewNeedsRefresh}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          Delete Selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
        {activeTab === "anytime_blitz" ? (
          <>
            <button type="button" disabled={bulkBusy || !Object.values(reviewRows).some(row => row.outcome === "repeat") || reviewNeedsRefresh}
              onClick={() => { setContinuing(false); setSelectedIds(Object.fromEntries(filteredItems.filter(item => reviewRows[item.id]?.outcome === "repeat").map(item => [item.id, true]))); }}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
              Select Confirmed Repeats
            </button>
            <button type="button" onClick={() => void fetchPending(activeTab, page)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">Refresh Review</button>

            <button
              type="button"
              onClick={() => void convertSelectedToLiveExport()}
              disabled={convertingLiveExport || selectedCount === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {convertingLiveExport ? "Converting..." : `Add To Live Export List${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
            </button>
            <button
              type="button"
              onClick={() => void exportApprovedSpeedJson()}
              disabled={exportingJson}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
            >
              <GitPullRequest className="h-4 w-4" aria-hidden="true" />
              {exportingJson ? "Creating PR..." : "Create JSON Export PR"}
            </button>
          </>
        ) : null}
      </div>

      {activeTab === "anytime_blitz" ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Live Trivia Export List</h3>
              <p className="mt-1 text-sm text-slate-600">
                Converted questions stay here until you download them. This does not write to your local Live Trivia JSON files.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadLiveExportJson}
                disabled={liveExportItems.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download JSON{liveExportItems.length > 0 ? ` (${liveExportItems.length})` : ""}
              </button>
              <button
                type="button"
                onClick={clearLiveExportItems}
                disabled={liveExportItems.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear List
              </button>
            </div>
          </div>

          {liveExportItems.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-400 bg-white/70 px-4 py-6 text-sm text-slate-500">
              Select Speed Trivia pending questions, then use <span className="font-semibold text-slate-700">Add To Live Export List</span>.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-300">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-800">
                    <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-white">#</th>
                    <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-white">Category</th>
                    <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-white">Question</th>
                    <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-white">Answer</th>
                    <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-white"></th>
                  </tr>
                </thead>
                <tbody>
                  {liveExportItems.map((item, index) => (
                    <tr key={item.sourceId} className="border-b border-slate-200 hover:bg-slate-100 last:border-b-0">
                      <td className="px-2 py-1.5 text-slate-400">{index + 1}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-medium text-slate-700">{item.category}</span>
                        <span className="ml-1 text-slate-400">{item.difficulty}</span>
                      </td>
                      <td className="max-w-[20rem] truncate px-2 py-1.5 text-slate-900" title={item.question}>
                        {item.question}
                      </td>
                      <td className="max-w-[14rem] truncate px-2 py-1.5 text-slate-700" title={`${item.answer}${item.acceptableAnswers?.length ? ` (also accept: ${item.acceptableAnswers.join(", ")})` : ""}`}>
                        {item.answer}
                        {item.acceptableAnswers && item.acceptableAnswers.length > 0 ? (
                          <span className="ml-1 text-slate-400">+{item.acceptableAnswers.length}</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeLiveExportItem(item.sourceId)}
                          className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-300"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

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
                            className="w-full min-w-[16rem] rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
                            rows={2}
                          />
                        ) : (
                          <span className="font-medium">{item.question}</span>
                        )}
                        {reviewRows[item.id] ? (
                          <div className="mt-2 space-y-1 text-sm text-slate-700" data-testid={`review-result-${item.id}`}>
                            <p className="font-semibold">{reviewRows[item.id].outcome === "repeat" ? "Confirmed repeat" : "Unresolved"}</p>
                            {reviewRows[item.id].reason ? <p>{reviewRows[item.id].reason}</p> : null}
                            {reviewRows[item.id].matches?.map(match => (
                              <p key={match.id}>Approved question: {match.question} · Answer: {match.answer}</p>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {isEditing && editDraft ? (
                          item.pool === "live_showdown" ? (
                            <input
                              value={editDraft.answer}
                              onChange={(event) =>
                                setEditDraft((prev) => (prev ? { ...prev, answer: event.target.value } : prev))
                              }
                              className="w-full min-w-[10rem] rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
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
                                    className="w-full min-w-[10rem] rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
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
        {totalPages > 1 ? (
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_LIMIT}
            onPageChange={(nextPage) => {
              void fetchPending(activeTab, nextPage);
            }}
          />
        ) : null}
      </div>
    </fieldset>
  );
}

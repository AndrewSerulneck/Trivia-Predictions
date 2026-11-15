"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminField, adminLabel } from "@/lib/adminStyles";
import { getErrorMessage } from "@/lib/errors";
import { TRIVIA_CATEGORIES } from "@/lib/triviaCategories";
import type {
  QuickReviewBulkResult,
  QuickReviewDecision,
  QuickReviewItem,
  QuickReviewKeepOutcome,
  QuickReviewSort,
  QuickReviewSource,
} from "@/types/speedTriviaQuickReview";

// One Speed Trivia question at a time. → Keep, ← Reject, W wrong answer, E edit, S skip, Z undo.
// Keep never runs a paid check: already-checked questions are approved at once, the rest wait for the overnight check.

const ENDPOINT = "/api/admin/trivia/quick-review";
const REFILL_AT = 10;
const PAGE_SIZE = 50; // QUICK_REVIEW_PAGE_LIMIT on the server

type UndoEntry = { item: QuickReviewItem; kind: "keep" | "reject" | "skip" };
type Draft = { question: string; options: string[]; correctAnswer: number };
type Filter = { category: string; source: QuickReviewSource; sort: QuickReviewSort };

const postJson = async <T,>(body: unknown): Promise<T> => {
  const response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Quick Review failed. Try again.");
  return payload;
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function SpeedTriviaQuickReview() {
  const [filter, setFilter] = useState<Filter>({ category: "", source: "all", sort: "oldest" });
  const [items, setItems] = useState<QuickReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<UndoEntry[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bulk, setBulk] = useState<{ decision: QuickReviewDecision; done: number; of: number } | null>(null);
  const loadSeq = useRef(0);
  const refilling = useRef(false);

  const current = items[0] ?? null;

  const fetchPage = useCallback(async (after: QuickReviewItem | null) => {
    const params = new URLSearchParams({ source: filter.source, sort: filter.sort });
    if (filter.category) params.set("category", filter.category);
    if (after) {
      params.set("afterId", after.id);
      params.set("afterCreated", after.createdAt);
    }
    const response = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; total?: number; items?: QuickReviewItem[]; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Couldn't load questions.");
    return { total: payload.total ?? 0, items: payload.items ?? [] };
  }, [filter]);

  const reload = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError("");
    setDraft(null);
    try {
      const page = await fetchPage(null);
      if (seq !== loadSeq.current) return;
      setItems(page.items);
      setTotal(page.total);
      setExhausted(page.items.length < PAGE_SIZE);
    } catch (err) {
      if (seq === loadSeq.current) setError(getErrorMessage(err, "Couldn't load questions."));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    setHistory([]);
    setNotice("");
    void reload();
  }, [reload]);

  // Keep a small buffer ahead; one bounded page per refill, never a poll.
  useEffect(() => {
    if (loading || exhausted || refilling.current || items.length > REFILL_AT || items.length === 0) return;
    refilling.current = true;
    const seq = loadSeq.current;
    const last = items[items.length - 1];
    void fetchPage(last)
      .then((page) => {
        if (seq !== loadSeq.current) return;
        setItems((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...page.items.filter((item) => !seen.has(item.id))];
        });
        if (page.items.length < PAGE_SIZE) setExhausted(true);
      })
      .catch((err) => setError(getErrorMessage(err, "Couldn't load questions.")))
      .finally(() => { refilling.current = false; });
  }, [items, loading, exhausted, fetchPage]);

  const advance = useCallback((item: QuickReviewItem, kind: UndoEntry["kind"]) => {
    setItems((prev) => prev.filter((row) => row.id !== item.id));
    if (kind !== "skip") setTotal((prev) => Math.max(0, prev - 1));
    setHistory((prev) => [...prev.slice(-49), { item, kind }]);
  }, []);

  const keep = useCallback(async () => {
    if (!current || busy || draft) return;
    setBusy(true);
    setError("");
    try {
      const { rows } = await postJson<{ rows: { id: string; outcome: QuickReviewKeepOutcome }[] }>({
        action: "keep", rows: [{ id: current.id, contentHash: current.contentHash }],
      });
      const outcome = rows[0]?.outcome;
      if (outcome === "changed") {
        setError("Changed since it loaded. Reloaded.");
        await reload();
        return;
      }
      if (outcome === "not_pending") {
        setItems((prev) => prev.filter((row) => row.id !== current.id));
        setTotal((prev) => Math.max(0, prev - 1));
        setNotice("Already decided.");
        return;
      }
      advance(current, "keep");
      setNotice(outcome === "approved" ? "Approved." : "Kept. Approved after the repeat check.");
    } catch (err) {
      setError(getErrorMessage(err, "Keep failed."));
    } finally {
      setBusy(false);
    }
  }, [current, busy, draft, advance, reload]);

  const reject = useCallback(async (reason: "quality" | "wrong") => {
    if (!current || busy || draft) return;
    setBusy(true);
    setError("");
    try {
      const { rejected } = await postJson<{ rejected: string[] }>({ action: "reject", ids: [current.id], reason });
      if (rejected.includes(current.id)) {
        advance(current, "reject");
        setNotice(reason === "wrong" ? "Rejected: wrong answer." : "Rejected.");
      } else {
        setItems((prev) => prev.filter((row) => row.id !== current.id));
        setTotal((prev) => Math.max(0, prev - 1));
        setNotice("Already decided.");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Reject failed."));
    } finally {
      setBusy(false);
    }
  }, [current, busy, draft, advance]);

  const skip = useCallback(() => {
    if (!current || busy || draft) return;
    advance(current, "skip");
    setNotice("");
  }, [current, busy, draft, advance]);

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy || draft) return;
    setBusy(true);
    setError("");
    try {
      if (last.kind !== "skip") {
        await postJson({ action: "undo", id: last.item.id });
        setTotal((prev) => prev + 1);
      }
      setHistory((prev) => prev.slice(0, -1));
      setItems((prev) => [last.item, ...prev.filter((row) => row.id !== last.item.id)]);
      setNotice("Undone.");
    } catch (err) {
      setError(getErrorMessage(err, "Can't undo."));
    } finally {
      setBusy(false);
    }
  }, [history, busy, draft]);

  const startEdit = useCallback(() => {
    if (!current || busy) return;
    setDraft({ question: current.question, options: [...current.options], correctAnswer: current.correctAnswer });
    setError("");
    setNotice("");
  }, [current, busy]);

  const saveEdit = useCallback(async () => {
    if (!current || !draft) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/trivia/questions/${encodeURIComponent(current.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: draft.question.trim(), options: draft.options.map((option) => option.trim()), correctAnswer: draft.correctAnswer }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Save failed.");
      setNotice("Saved.");
      // The edit changed the content hash; reload so Keep acts on what is shown.
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, "Save failed."));
    } finally {
      setBusy(false);
    }
  }, [current, draft, reload]);

  const runBulk = useCallback(async (decision: QuickReviewDecision) => {
    if (busy || draft || total === 0) return;
    const count = total;
    const label = decision === "reject" ? `Reject ${count.toLocaleString()} questions?` : `Keep ${count.toLocaleString()} questions? Older ones are approved after the repeat check.`;
    if (!window.confirm(label)) return;
    setBusy(true);
    setError("");
    setNotice("");
    setBulk({ decision, done: 0, of: count });
    let done = 0;
    try {
      while (done < count) {
        const result = await postJson<QuickReviewBulkResult>({
          action: "bulk", decision, max: count - done,
          category: filter.category || null, source: filter.source,
        });
        done += result.processed;
        setBulk({ decision, done, of: count });
        if (result.processed === 0 || result.remaining === 0) break;
      }
      setHistory([]);
      setNotice(`${decision === "reject" ? "Rejected" : "Kept"} ${done.toLocaleString()}.`);
    } catch (err) {
      setError(`${getErrorMessage(err, "Stopped.")} ${done.toLocaleString()} done.`);
    } finally {
      setBulk(null);
      setBusy(false);
      await reload();
    }
  }, [busy, draft, total, filter, reload]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || draft) return;
      const key = event.key.toLowerCase();
      const actions: Record<string, () => void> = {
        arrowright: () => void keep(),
        arrowleft: () => void reject("quality"),
        w: () => void reject("wrong"),
        s: skip,
        e: startEdit,
        z: () => void undo(),
      };
      const action = actions[key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keep, reject, skip, startEdit, undo, draft]);

  const buttonBase = "rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={adminLabel} htmlFor="qr-category">Category</label>
          <select id="qr-category" className={adminField} value={filter.category} disabled={busy}
            onChange={(event) => setFilter((prev) => ({ ...prev, category: event.target.value }))}>
            <option value="">All Categories</option>
            {TRIVIA_CATEGORIES.map((category) => <option key={category.dbValue} value={category.dbValue}>{category.label}</option>)}
          </select>
        </div>
        <div>
          <label className={adminLabel} htmlFor="qr-source">Source</label>
          <select id="qr-source" className={adminField} value={filter.source} disabled={busy}
            onChange={(event) => setFilter((prev) => ({ ...prev, source: event.target.value as QuickReviewSource }))}>
            <option value="all">All</option>
            <option value="older">Older</option>
            <option value="recent">Recent</option>
          </select>
        </div>
        <div>
          <label className={adminLabel} htmlFor="qr-sort">Sort</label>
          <select id="qr-sort" className={adminField} value={filter.sort} disabled={busy}
            onChange={(event) => setFilter((prev) => ({ ...prev, sort: event.target.value as QuickReviewSort }))}>
            <option value="oldest">Oldest</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700" role="status" aria-live="polite">
          {bulk ? `${bulk.decision === "reject" ? "Rejecting" : "Keeping"}… ${bulk.done.toLocaleString()} / ${bulk.of.toLocaleString()}` : `${total.toLocaleString()} left`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || total === 0} onClick={() => void runBulk("reject")}
            className={`${buttonBase} bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100`}>
            Reject all shown ({total.toLocaleString()})
          </button>
          <button type="button" disabled={busy || total === 0} onClick={() => void runBulk("keep")}
            className={`${buttonBase} bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100`}>
            Keep all shown ({total.toLocaleString()})
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
        ) : !current ? (
          <p className="py-10 text-center text-sm text-slate-500">Nothing left.</p>
        ) : (
          <div className="space-y-4" data-testid="quick-review-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {current.category ?? "—"}{current.difficulty ? ` · ${current.difficulty}` : ""} · {current.recent ? "Recent" : "Older"}
            </p>
            {draft ? (
              <div className="space-y-2">
                <textarea value={draft.question} rows={3} aria-label="Question" className={adminField}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, question: event.target.value } : prev))} />
                {draft.options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input type="radio" name="qr-correct" checked={draft.correctAnswer === index} aria-label={`Option ${index + 1} correct`}
                      onChange={() => setDraft((prev) => (prev ? { ...prev, correctAnswer: index } : prev))} />
                    <input value={option} aria-label={`Option ${index + 1}`} className={adminField}
                      onChange={(event) => setDraft((prev) => {
                        if (!prev) return prev;
                        const options = [...prev.options];
                        options[index] = event.target.value;
                        return { ...prev, options };
                      })} />
                  </div>
                ))}
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void saveEdit()} className={`${buttonBase} bg-indigo-600 text-white hover:bg-indigo-700`}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setDraft(null)} className={`${buttonBase} bg-slate-100 text-slate-700 hover:bg-slate-200`}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-lg font-semibold text-slate-900">{current.question}</p>
                <ul className="space-y-1">
                  {current.options.map((option, index) => (
                    <li key={index} className={index === current.correctAnswer ? "font-semibold text-emerald-700" : "text-slate-600"}>
                      {index === current.correctAnswer ? "✓ " : ""}{option}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {!draft ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!current || busy} onClick={() => void reject("quality")}
            className={`${buttonBase} bg-rose-600 text-white hover:bg-rose-700`}>← Reject</button>
          <button type="button" disabled={!current || busy} onClick={() => void reject("wrong")}
            className={`${buttonBase} bg-slate-100 text-slate-700 hover:bg-slate-200`}>Wrong answer (W)</button>
          <button type="button" disabled={!current || busy} onClick={skip}
            className={`${buttonBase} bg-slate-100 text-slate-700 hover:bg-slate-200`}>Skip (S)</button>
          <button type="button" disabled={!current || busy} onClick={startEdit}
            className={`${buttonBase} bg-slate-100 text-slate-700 hover:bg-slate-200`}>Edit (E)</button>
          <button type="button" disabled={history.length === 0 || busy} onClick={() => void undo()}
            className={`${buttonBase} bg-slate-100 text-slate-700 hover:bg-slate-200`}>Undo (Z)</button>
          <button type="button" disabled={!current || busy} onClick={() => void keep()}
            className={`${buttonBase} ml-auto bg-emerald-600 text-white hover:bg-emerald-700`}>Keep →</button>
        </div>
      ) : null}

      {notice ? <p className="text-sm text-slate-600" role="status">{notice}</p> : null}
    </div>
  );
}

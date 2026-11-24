"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { adminField, adminLabel } from "@/lib/adminStyles";
import { getErrorMessage } from "@/lib/errors";
import type { LivePublishResult, LiveReviewItem, LiveReviewPage } from "@/types/liveTriviaReview";

// Quick Review, Live mode (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c). One writer question at a time:
// → Keep, ← Reject, E edit the answer and acceptable answers, S skip, Z undo. Publish (N) appends the kept ones to
// the Live Trivia JSON through a GitHub PR (D10); the merge imports them. A PR that isn't merged shows as
// "waiting on GitHub" until the PR check sees it merged or closed (Phase 4c.2).

const ENDPOINT = "/api/admin/trivia/live-review";

type UndoEntry = { item: LiveReviewItem; kind: "keep" | "reject" | "skip" };
type Draft = { answer: string; acceptable: string };

const FLAG_LABELS: Record<string, string> = {
  "too-long": "Long",
  preamble: "Two sentences",
  "multi-answer": "List answer",
  "answer-in-question": "Gives it away",
  ambiguous: "Ambiguous",
  "possibly-wrong": "Answer may be wrong",
  dated: "Dated",
  "niche-subject": "Niche",
  "obscure-fact": "Obscure fact",
  "hard-to-spell": "Hard to spell",
};

const postJson = async <T,>(body: unknown): Promise<T> => {
  const response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Quick Review failed. Try again.");
  return payload;
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export const LiveTriviaQuickReview = () => {
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<LiveReviewItem[]>([]);
  // Waiting beyond the loaded page (the page holds the best 200; "N left" is the real total, 4c.9 #5).
  const [beyondPage, setBeyondPage] = useState(0);
  const [kept, setKept] = useState(0);
  const [waiting, setWaiting] = useState<LiveReviewPage["waiting"]>({ waiting: 0, prUrl: "" });
  const [categories, setCategories] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  // True from the first paint, so "Nothing left." never flashes before the first load.
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [writerStopped, setWriterStopped] = useState(false);
  const [history, setHistory] = useState<UndoEntry[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);

  const current = items[0] ?? null;
  // The id whose "why it's true" note is open; a new question starts closed (D30).
  const [whyOpenId, setWhyOpenId] = useState<string | null>(null);
  const whyOpen = Boolean(current?.whyTrue) && whyOpenId === current?.id;

  // A Keep / Reject save in flight (kept until the render after it commits) and a Z pressed meanwhile (D36).
  const inFlightRef = useRef<{ id: string; done: boolean } | null>(null);
  const queuedUndoRef = useRef<string | null>(null);
  const decidedRef = useRef<UndoEntry | null>(null);
  const reloadSeqRef = useRef(0);

  const reload = useCallback(async () => {
    const seq = ++reloadSeqRef.current;
    setLoading(true);
    setError("");
    setDraft(null);
    // Nothing from the old list stays on screen to be decided while the new one loads.
    setItems([]);
    setBeyondPage(0);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      const response = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Partial<LiveReviewPage> & { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Couldn't load questions.");
      if (seq !== reloadSeqRef.current) return;
      const loaded = payload.items ?? [];
      setItems(loaded);
      setBeyondPage(Math.max(0, (payload.total ?? loaded.length) - loaded.length));
      setKept(payload.kept ?? 0);
      setWriterStopped(payload.writerStopped === true);
      setWaiting(payload.waiting ?? { waiting: 0, prUrl: "" });
      if (payload.categories) setCategories(payload.categories);
    } catch (err) {
      if (seq === reloadSeqRef.current) setError(getErrorMessage(err, "Couldn't load questions."));
    } finally {
      if (seq === reloadSeqRef.current) setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    setHistory([]);
    queuedUndoRef.current = null;
    decidedRef.current = null;
    setNotice("");
    void reload();
  }, [reload]);

  const decide = useCallback(async (decision: "keep" | "reject") => {
    if (!current || busy || loading || draft) return;
    const flight = { id: current.id, done: false };
    inFlightRef.current = flight;
    decidedRef.current = null;
    setBusy(true);
    setError("");
    try {
      const { decided } = await postJson<{ decided: boolean }>({ action: decision, id: current.id });
      setItems((prev) => prev.filter((row) => row.id !== current.id));
      if (!decided) { setNotice("Already decided."); return; }
      if (decision === "keep") setKept((prev) => prev + 1);
      const entry: UndoEntry = { item: current, kind: decision };
      decidedRef.current = entry;
      setHistory((prev) => [...prev.slice(-49), entry]);
      setNotice(decision === "keep" ? "Kept." : "Rejected.");
    } catch (err) {
      setError(getErrorMessage(err, decision === "keep" ? "Keep failed." : "Reject failed."));
    } finally {
      flight.done = true;
      setBusy(false);
    }
  }, [current, busy, loading, draft]);

  const skip = useCallback(() => {
    if (!current || busy || loading || draft) return;
    setItems((prev) => [...prev.slice(1), prev[0]].filter(Boolean) as LiveReviewItem[]);
    setHistory((prev) => [...prev.slice(-49), { item: current, kind: "skip" }]);
    setNotice("");
  }, [current, busy, loading, draft]);

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy || loading || draft) return;
    setBusy(true);
    setError("");
    try {
      if (last.kind !== "skip") {
        await postJson({ action: "undo", id: last.item.id });
        if (last.kind === "keep") setKept((prev) => Math.max(0, prev - 1));
      }
      setHistory((prev) => prev.slice(0, -1));
      setItems((prev) => [last.item, ...prev.filter((row) => row.id !== last.item.id)]);
      setNotice("Undone.");
    } catch (err) {
      setError(getErrorMessage(err, "Can't undo."));
    } finally {
      setBusy(false);
    }
  }, [history, busy, loading, draft]);

  // A Z pressed while a Keep / Reject was saving runs when that save finishes, only if it saved and its entry is
  // still the last one: a failed or "Already decided." save never undoes an older decision (D36).
  useEffect(() => {
    if (busy) return;
    const flight = inFlightRef.current;
    if (flight && !flight.done) return;
    inFlightRef.current = null;
    const queued = queuedUndoRef.current;
    if (queued === null) return;
    queuedUndoRef.current = null;
    const last = history[history.length - 1];
    if (last && last === decidedRef.current && last.item.id === queued && last.kind !== "skip") void undo();
  }, [busy, history, undo]);

  const startEdit = useCallback(() => {
    if (!current || busy || loading) return;
    setDraft({ answer: current.answer, acceptable: current.acceptableAnswers.join("\n") });
    setError("");
    setNotice("");
  }, [current, busy, loading]);

  const saveEdit = useCallback(async () => {
    if (!current || !draft) return;
    setBusy(true);
    setError("");
    try {
      const acceptableAnswers = draft.acceptable.split("\n").map((line) => line.trim()).filter(Boolean);
      const saved = await postJson<{ answer: string; acceptableAnswers: string[] }>({ action: "edit", id: current.id, answer: draft.answer, acceptableAnswers });
      setItems((prev) => prev.map((row) => (row.id === current.id ? { ...row, answer: saved.answer, acceptableAnswers: saved.acceptableAnswers, edited: true } : row)));
      setDraft(null);
      setNotice("Saved.");
    } catch (err) {
      setError(getErrorMessage(err, "Save failed."));
    } finally {
      setBusy(false);
    }
  }, [current, draft]);

  const publish = useCallback(async () => {
    if (busy || loading || draft || kept === 0) return;
    queuedUndoRef.current = null;
    if (!window.confirm(`Publish ${kept.toLocaleString()} to Live Trivia?`)) return;
    setBusy(true);
    setPublishing(true);
    setError("");
    setNotice("");
    setPrUrl("");
    try {
      const result = await postJson<LivePublishResult>({ action: "publish" });
      setHistory([]);
      setPrUrl(result.prUrl);
      const count = result.published + result.already;
      setNotice(!result.waiting ? `Published ${count.toLocaleString()}.`
        : result.published ? "Waiting on GitHub." : "A Publish PR is waiting on GitHub.");
      if (result.refused) setError(`${result.refused.toLocaleString()} couldn't be published.`);
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, "Publish failed."));
    } finally {
      setPublishing(false);
      setBusy(false);
    }
  }, [busy, loading, draft, kept, reload]);

  // The listener is bound once and calls the newest handler. The handler is swapped in a layout
  // effect (before paint), so a key pressed the moment a decision renders never meets a stale
  // handler that still sees the previous save as busy or an empty history.
  const onKeyRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useLayoutEffect(() => {
    onKeyRef.current = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || draft) return;
      const actions: Record<string, () => void> = {
        arrowright: () => void decide("keep"),
        arrowleft: () => void decide("reject"),
        s: skip,
        e: startEdit,
        z: () => {
          // A save is running: remember the Z for when it finishes. Any other key stays ignored while busy.
          if (inFlightRef.current) { queuedUndoRef.current = inFlightRef.current.id; return; }
          void undo();
        },
      };
      const action = actions[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    };
  }, [decide, skip, startEdit, undo, draft]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => onKeyRef.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const buttonBase = "rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="space-y-4">
      {writerStopped ? <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800" role="status">Writer stopped</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-48">
          <label className={adminLabel} htmlFor="lqr-category">Category</label>
          <select id="lqr-category" className={adminField} value={category} disabled={busy} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All Categories</option>
            {categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <button type="button" disabled={busy || loading || kept === 0} onClick={() => void publish()}
          className={`${buttonBase} bg-indigo-600 text-white hover:bg-indigo-700`}>
          {publishing ? "Publishing…" : `Publish (${kept.toLocaleString()})`}
        </button>
      </div>

      <p className="min-h-5 text-sm font-semibold text-slate-700" role="status" aria-live="polite">
        {loading ? null : `${(items.length + beyondPage).toLocaleString()} left`}
        {!loading && waiting.waiting > 0 ? (
          <span className="ml-3 font-normal text-amber-700" data-testid="live-review-waiting">
            {waiting.waiting.toLocaleString()} waiting on GitHub
            {waiting.prUrl ? <a href={waiting.prUrl} target="_blank" rel="noreferrer" className="ml-2 font-semibold underline">PR</a> : null}
          </span>
        ) : null}
      </p>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
        ) : !current ? (
          <p className="py-10 text-center text-sm text-slate-500">Nothing left.</p>
        ) : (
          <div className="space-y-4" data-testid="live-review-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {current.category}{current.difficulty ? ` · ${current.difficulty}` : ""} · {current.source === "gemini-fallback" ? "Gemini" : "ChatGPT"}
              {current.area ? ` · ${current.area}${current.era ? ` · ${current.era}` : ""}` : ""}
              {current.audience ? ` · Score ${current.audience.score}` : ""}
            </p>
            {current.sourceUrl || current.whyTrue ? (
              <div className="flex flex-wrap items-center gap-4">
                {current.sourceUrl ? (
                  <a href={current.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-sm font-semibold text-indigo-700 underline">Source</a>
                ) : null}
                {current.whyTrue ? (
                  <button type="button" aria-expanded={whyOpen} onClick={() => setWhyOpenId(whyOpen ? null : current.id)}
                    className="text-sm font-semibold text-indigo-700 underline">Why</button>
                ) : null}
              </div>
            ) : null}
            <p className="text-lg font-semibold text-slate-900">{current.question}</p>
            {draft ? (
              <div className="space-y-2">
                <input value={draft.answer} aria-label="Answer" className={adminField}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, answer: event.target.value } : prev))} />
                <textarea value={draft.acceptable} rows={3} aria-label="Also accept (one per line)" placeholder="Also accept (one per line)" className={adminField}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, acceptable: event.target.value } : prev))} />
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
                <p className="font-semibold text-emerald-700">✓ {current.answer}</p>
                {whyOpen ? <p className="text-sm text-slate-600" data-testid="live-review-why">{current.whyTrue}</p> : null}
                {current.acceptableAnswers.length ? (
                  <p className="text-sm text-slate-600" data-testid="live-review-accepted">Also accept: {current.acceptableAnswers.join(" · ")}</p>
                ) : null}
                {current.fromSpeed ? (
                  <p className="text-sm text-slate-600" data-testid="live-review-from-speed">
                    From Speed: {current.fromSpeed.question} ({current.fromSpeed.answer})
                  </p>
                ) : null}
                {current.overStarCap ? <p className="text-sm text-amber-700" data-testid="live-review-star-cap">Over star cap</p> : null}
                {current.possibleRepeat ? (
                  <p className="text-sm text-amber-700" data-testid="live-review-repeat">
                    Possible repeat of: {current.possibleRepeat.question} ({current.possibleRepeat.answer})
                  </p>
                ) : null}
                {current.audience && current.audience.flags.length > 0 ? (
                  <p className="text-xs text-slate-500">{current.audience.flags.map((flag) => FLAG_LABELS[flag] ?? flag).join(" · ")}</p>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>

      {!draft ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!current || busy || loading} onClick={() => void decide("reject")}
            className={`${buttonBase} bg-rose-600 text-white hover:bg-rose-700`}>← Reject</button>
          <button type="button" disabled={!current || busy || loading} onClick={skip}
            className={`${buttonBase} bg-slate-100 text-slate-700 hover:bg-slate-200`}>Skip (S)</button>
          <button type="button" disabled={!current || busy || loading} onClick={startEdit}
            className={`${buttonBase} bg-slate-100 text-slate-700 hover:bg-slate-200`}>Edit (E)</button>
          <button type="button" disabled={history.length === 0 || busy || loading} onClick={() => void undo()}
            className={`${buttonBase} bg-slate-100 text-slate-700 hover:bg-slate-200`}>Undo (Z)</button>
          <button type="button" disabled={!current || busy || loading} onClick={() => void decide("keep")}
            className={`${buttonBase} ml-auto bg-emerald-600 text-white hover:bg-emerald-700`}>Keep →</button>
        </div>
      ) : null}

      {notice ? (
        <p className="text-sm text-slate-600" role="status">
          {notice}
          {prUrl ? <a href={prUrl} target="_blank" rel="noreferrer" className="ml-2 font-semibold underline">PR</a> : null}
        </p>
      ) : null}
    </div>
  );
};

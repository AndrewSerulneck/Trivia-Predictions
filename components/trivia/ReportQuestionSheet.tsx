"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Flag, X } from "lucide-react";
import { getUserId } from "@/lib/storage";
import {
  QUESTION_REPORT_NOTE_MAX,
  QUESTION_REPORT_REASONS,
  type QuestionReportReason,
} from "@/lib/questionReportReasons";

// Phase 4c.7 (D32) + 7i: a Report button shown only after the answer is revealed, and its "What's wrong?" sheet.
// Speed passes the question id; Live passes the slug. All sheet state (the open report, its draft, the reported
// keys, the close timer) lives in useHeldReport, so a parent can keep a report open over the next question, shrink it
// to a "Finish report" bar, and survive a loading render that unmounts the sheet (D46).

export type ReportTarget = { game: "speed"; questionId: string } | { game: "live"; slug: string };

export type ReportDraft = { writingOther: boolean; note: string; sent: boolean };

type HeldReport = { key: string; target: ReportTarget };

const EMPTY_DRAFT: ReportDraft = { writingOther: false, note: "", sent: false };
const SENT_CLOSE_MS = 1200;

export const useHeldReport = () => {
  const [held, setHeld] = useState<HeldReport | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_DRAFT);
  const [reportedKeys, setReportedKeys] = useState<Readonly<Record<string, true>>>({});
  const heldKey = useRef<string | null>(null);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const timer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  const close = useCallback(() => {
    clearTimer();
    heldKey.current = null;
    setHeld(null);
    setMinimized(false);
    setDraft(EMPTY_DRAFT);
  }, [clearTimer]);

  const open = useCallback(
    (key: string, target: ReportTarget) => {
      clearTimer();
      heldKey.current = key;
      setHeld({ key, target });
      setMinimized(false);
      setDraft(EMPTY_DRAFT);
    },
    [clearTimer],
  );

  // The close timer belongs to the report it was set for: closing or opening another clears it.
  const onSent = useCallback(
    (key: string) => {
      setReportedKeys((current) => ({ ...current, [key]: true }));
      if (heldKey.current !== key) return;
      setDraft((current) => ({ ...current, sent: true }));
      clearTimer();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (heldKey.current === key) close();
      }, SENT_CLOSE_MS);
    },
    [clearTimer, close],
  );

  const minimize = useCallback(() => setMinimized(true), []);
  const restore = useCallback(() => setMinimized(false), []);
  // Tapping outside or Escape: never throws typed text away. Closes only an untouched sheet.
  const dismiss = useCallback(() => {
    const current = draftRef.current;
    if (current.note.trim().length > 0 && !current.sent) return;
    close();
  }, [close]);
  const clearAll = useCallback(() => {
    close();
    setReportedKeys((current) => (Object.keys(current).length ? {} : current));
  }, [close]);

  return { held, minimized, draft, setDraft, reportedKeys, open, onSent, close, dismiss, minimize, restore, clearAll };
};

export const ReportButton = ({
  reported,
  onOpen,
  className,
}: {
  reported: boolean;
  onOpen: () => void;
  className?: string;
}) => (
  <button
    type="button"
    disabled={reported}
    onClick={onOpen}
    className={`tp-clean-button inline-flex items-center gap-1.5 text-footnote font-bold text-slate-400 disabled:opacity-60 ${className ?? ""}`}
  >
    <Flag aria-hidden="true" className="h-3.5 w-3.5" />
    {reported ? "Reported" : "Report"}
  </button>
);

// Controlled by useHeldReport: mount it while the report is open and visible. The draft survives an unmount.
export const ReportSheet = ({
  target,
  draft,
  onDraftChange,
  onSent,
  onClose,
  onDismiss,
}: {
  target: ReportTarget;
  draft: ReportDraft;
  onDraftChange: (next: ReportDraft) => void;
  onSent: () => void;
  onClose: () => void;
  onDismiss: () => void;
}) => {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const reasons = QUESTION_REPORT_REASONS[target.game];
  const { writingOther, note, sent } = draft;
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const patch = (next: Partial<ReportDraft>) => onDraftChange({ ...draftRef.current, ...next });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const send = async (reason: QuestionReportReason) => {
    if (sending || sent) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/trivia/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: getUserId() ?? undefined,
          game: target.game,
          ...(target.game === "speed" ? { questionId: target.questionId } : { slug: target.slug }),
          reason,
          ...(reason === "other" ? { note } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Couldn't send. Try again.");
      onSent();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't send. Try again.");
    }
    setSending(false);
  };

  const sheet = (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60"
      onClick={onDismiss}
      data-testid="report-question-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-question-title"
        className="w-full max-w-md rounded-t-2xl border border-slate-700 bg-slate-900 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)] text-slate-100"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="report-question-title" className="text-base font-black">
            What&apos;s wrong?
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="tp-clean-button rounded-full p-2 text-slate-400"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        {sent ? (
          <p role="status" className="py-6 text-center text-base font-bold text-emerald-300">
            Sent.
          </p>
        ) : writingOther ? (
          <div className="mt-3">
            <textarea
              value={note}
              onChange={(event) => patch({ note: event.target.value.slice(0, QUESTION_REPORT_NOTE_MAX) })}
              maxLength={QUESTION_REPORT_NOTE_MAX}
              rows={3}
              aria-label="Other"
              autoFocus
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-base text-slate-100"
            />
            <button
              type="button"
              disabled={note.trim().length === 0 || sending}
              onClick={() => void send("other")}
              className="tp-clean-button mt-2 w-full rounded-xl bg-slate-100 py-3 text-base font-black text-slate-950 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-slate-800">
            {reasons.map((option) => (
              <li key={option.code}>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => (option.code === "other" ? patch({ writingOther: true }) : void send(option.code))}
                  className="tp-clean-button w-full py-3 text-left text-base font-bold text-slate-100 disabled:opacity-50"
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <p role="alert" className="mt-2 text-footnote font-bold text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(sheet, document.body) : null;
};

// Button + sheet together, for a parent that mounts it per question (Speed).
export const ReportQuestionSheet = ({ questionId, className }: { questionId: string; className?: string }) => {
  const report = useHeldReport();
  return (
    <>
      <ReportButton
        reported={Boolean(report.reportedKeys[questionId])}
        onOpen={() => report.open(questionId, { game: "speed", questionId })}
        className={className}
      />
      {report.held ? (
        <ReportSheet
          target={report.held.target}
          draft={report.draft}
          onDraftChange={report.setDraft}
          onSent={() => report.onSent(report.held?.key ?? questionId)}
          onClose={report.close}
          onDismiss={report.dismiss}
        />
      ) : null}
    </>
  );
};

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Flag, X } from "lucide-react";
import { getUserId } from "@/lib/storage";
import {
  QUESTION_REPORT_NOTE_MAX,
  QUESTION_REPORT_REASONS,
  type QuestionReportReason,
} from "@/lib/questionReportReasons";

// Phase 4c.7 (D32): a Report button shown only after the answer is revealed, and its "What's wrong?" sheet.
// Speed passes the question id; Live passes the slug. The parent mounts it per question (keyed), so a new question
// starts fresh, and unmounting it (Live: the next question starts) closes the sheet without sending.

type Props = ({ game: "speed"; questionId: string } | { game: "live"; slug: string }) & { className?: string };

type Status = "idle" | "sending" | "sent";

const SENT_CLOSE_MS = 1200;

export const ReportQuestionSheet = (props: Props) => {
  const { game, className } = props;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [writingOther, setWritingOther] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const closeTimer = useRef<number | null>(null);
  const reasons = QUESTION_REPORT_REASONS[game];
  const ref = props.game === "speed" ? props.questionId : props.slug;

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = async (reason: QuestionReportReason) => {
    if (status !== "idle") return;
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/trivia/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: getUserId() ?? undefined,
          game,
          ...(game === "speed" ? { questionId: ref } : { slug: ref }),
          reason,
          ...(reason === "other" ? { note } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Couldn't send. Try again.");
      setStatus("sent");
      closeTimer.current = window.setTimeout(() => setOpen(false), SENT_CLOSE_MS);
    } catch (caught) {
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : "Couldn't send. Try again.");
    }
  };

  const reported = status === "sent";
  const sheet = open ? (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60"
      onClick={() => setOpen(false)}
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
            onClick={() => setOpen(false)}
            className="tp-clean-button rounded-full p-2 text-slate-400"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        {reported ? (
          <p role="status" className="py-6 text-center text-base font-bold text-emerald-300">
            Sent.
          </p>
        ) : writingOther ? (
          <div className="mt-3">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, QUESTION_REPORT_NOTE_MAX))}
              maxLength={QUESTION_REPORT_NOTE_MAX}
              rows={3}
              aria-label="Other"
              autoFocus
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-base text-slate-100"
            />
            <button
              type="button"
              disabled={note.trim().length === 0 || status === "sending"}
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
                  disabled={status === "sending"}
                  onClick={() => (option.code === "other" ? setWritingOther(true) : void send(option.code))}
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
  ) : null;

  return (
    <>
      <button
        type="button"
        disabled={reported}
        onClick={() => {
          setError("");
          setWritingOther(false);
          setOpen(true);
        }}
        className={`tp-clean-button inline-flex items-center gap-1.5 text-footnote font-bold text-slate-400 disabled:opacity-60 ${className ?? ""}`}
      >
        <Flag aria-hidden="true" className="h-3.5 w-3.5" />
        {reported ? "Reported" : "Report"}
      </button>
      {sheet && typeof document !== "undefined" ? createPortal(sheet, document.body) : null}
    </>
  );
};

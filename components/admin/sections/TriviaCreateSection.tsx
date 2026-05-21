"use client";

import { useMemo, useState } from "react";

type QuestionPool = "anytime_blitz" | "live_showdown";
type AnswerFormat = "multiple_choice" | "write_in" | "numeric" | "true_false";

type FormState = {
  question: string;
  category: string;
  difficulty: string;
  questionPool: QuestionPool;
  answerFormat: AnswerFormat;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: number;
  writeInAnswer: string;
};

const DEFAULT_FORM: FormState = {
  question: "",
  category: "",
  difficulty: "",
  questionPool: "anytime_blitz",
  answerFormat: "multiple_choice",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctOption: 0,
  writeInAnswer: "",
};

export function TriviaCreateSection() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const mcOptions = useMemo(
    () => [form.optionA, form.optionB, form.optionC, form.optionD].map((entry) => entry.trim()),
    [form.optionA, form.optionB, form.optionC, form.optionD]
  );

  function patch(p: Partial<FormState>) {
    setForm((current) => ({ ...current, ...p }));
    setError("");
    setSuccess("");
  }

  async function handleSubmit() {
    const question = form.question.trim();
    if (!question) {
      setError("Question text is required.");
      return;
    }

    const isMultipleChoice = form.answerFormat === "multiple_choice";
    const options = isMultipleChoice ? mcOptions : [form.writeInAnswer.trim()];
    if (options.some((entry) => !entry)) {
      setError(
        isMultipleChoice
          ? "All four multiple-choice options are required."
          : "A canonical correct answer is required."
      );
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "trivia",
          question,
          category: form.category.trim() || undefined,
          difficulty: form.difficulty.trim() || undefined,
          questionPool: form.questionPool,
          answerFormat: form.answerFormat,
          options,
          correctAnswer: isMultipleChoice ? form.correctOption : 0,
        }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to create trivia question.");
      }
      setForm(DEFAULT_FORM);
      setSuccess("Trivia question created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trivia question.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
  const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="mb-6 text-base font-semibold text-slate-900">Create Trivia Question</h2>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className={label}>Question *</label>
          <textarea
            value={form.question}
            onChange={(e) => patch({ question: e.target.value })}
            rows={3}
            className={field}
            placeholder="Enter the question prompt..."
          />
        </div>

        <div>
          <label className={label}>Target Game Pool</label>
          <select
            value={form.questionPool}
            onChange={(e) => patch({ questionPool: e.target.value as QuestionPool })}
            className={field}
          >
            <option value="anytime_blitz">Speed Trivia (anytime_blitz)</option>
            <option value="live_showdown">Live Trivia (live_showdown)</option>
          </select>
        </div>

        <div>
          <label className={label}>Answer Format</label>
          <select
            value={form.answerFormat}
            onChange={(e) => patch({ answerFormat: e.target.value as AnswerFormat })}
            className={field}
          >
            <option value="multiple_choice">Multiple Choice</option>
            <option value="write_in">Write-In</option>
            <option value="numeric">Numeric</option>
            <option value="true_false">True/False</option>
          </select>
        </div>

        <div>
          <label className={label}>Category</label>
          <input
            value={form.category}
            onChange={(e) => patch({ category: e.target.value })}
            className={field}
            placeholder="History, Sports, Science..."
          />
        </div>

        <div>
          <label className={label}>Difficulty</label>
          <input
            value={form.difficulty}
            onChange={(e) => patch({ difficulty: e.target.value })}
            className={field}
            placeholder="easy, medium, hard"
          />
        </div>

        {form.answerFormat === "multiple_choice" ? (
          <>
            <div>
              <label className={label}>Option A *</label>
              <input value={form.optionA} onChange={(e) => patch({ optionA: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label}>Option B *</label>
              <input value={form.optionB} onChange={(e) => patch({ optionB: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label}>Option C *</label>
              <input value={form.optionC} onChange={(e) => patch({ optionC: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label}>Option D *</label>
              <input value={form.optionD} onChange={(e) => patch({ optionD: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label}>Correct Option</label>
              <select
                value={form.correctOption}
                onChange={(e) => patch({ correctOption: Number(e.target.value) })}
                className={field}
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
            <label className={label}>
              {form.answerFormat === "numeric" ? "Correct Numeric Answer *" : "Correct Answer *"}
            </label>
            <input
              type={form.answerFormat === "numeric" ? "number" : "text"}
              value={form.writeInAnswer}
              onChange={(e) => patch({ writeInAnswer: e.target.value })}
              className={field}
              placeholder={
                form.answerFormat === "numeric"
                  ? "Enter exact number"
                  : "Enter canonical answer string"
              }
            />
          </div>
        )}
      </div>

      {error ? (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{success}</div>
      ) : null}

      <div className="mt-6">
        <button
          onClick={() => {
            void handleSubmit();
          }}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create Question"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import type {
  WriteInAnswerEvaluation,
  WriteInAnswerMatchRule,
  WriteInAnswerMatchSource,
} from "@/lib/liveShowdownGrading";

type FormState = {
  correct: string;
  submitted: string;
  acceptableAnswers: string;
  questionId: string;
  answerIndex: string;
  answerVariantIndexes: string;
};

const RULE_LABELS: Record<WriteInAnswerMatchRule, string> = {
  exact: "Exact match",
  pluralization: "Pluralization variant",
  country_alias: "Country alias",
  historical_alias: "Historical alias",
  person_alias: "Person alias",
  event_alias: "Event alias",
  numeric_measurement: "Numeric measurement",
  word_subset: "Word subset match",
  token_fuzzy_subset: "Token fuzzy subset",
  fuzzy_similarity: "Fuzzy similarity",
  stored_variant_exact: "Stored answer variant",
};

const SOURCE_LABELS: Record<WriteInAnswerMatchSource, string> = {
  canonical: "Canonical answer",
  acceptable: "Acceptable answer",
  stored_variant: "Stored variant",
};

const INITIAL_FORM: FormState = {
  correct: "",
  submitted: "",
  acceptableAnswers: "",
  questionId: "",
  answerIndex: "",
  answerVariantIndexes: "",
};

function parseLineSeparated(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseIndexes(value: string): number[] {
  return value
    .split(/[,\n]/)
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry) && entry >= 0);
}

export function TriviaAnswerGraderSection() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [evaluation, setEvaluation] = useState<WriteInAnswerEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const acceptableAnswers = useMemo(() => parseLineSeparated(form.acceptableAnswers), [form.acceptableAnswers]);
  const variantIndexes = useMemo(() => parseIndexes(form.answerVariantIndexes), [form.answerVariantIndexes]);

  async function runCheck() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/answer-grading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correct: form.correct,
          submitted: form.submitted,
          acceptableAnswers,
          questionId: form.questionId.trim() || undefined,
          answerIndex: form.answerIndex.trim() || undefined,
          answerVariantIndexes: variantIndexes,
        }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        evaluation?: WriteInAnswerEvaluation;
      };

      if (!response.ok || !payload.ok || !payload.evaluation) {
        throw new Error(payload.error ?? "Failed to run grading check.");
      }

      setEvaluation(payload.evaluation);
    } catch (err) {
      setEvaluation(null);
      setError(getErrorMessage(err, "Failed to run grading check."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Answer Grader</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          This checker calls the same live showdown grading module the app uses in production, so matcher updates flow here automatically.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Correct Answer</label>
            <input
              value={form.correct}
              onChange={(event) => setForm((prev) => ({ ...prev, correct: event.target.value }))}
              placeholder="Golden State Warriors"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Submitted Answer</label>
            <input
              value={form.submitted}
              onChange={(event) => setForm((prev) => ({ ...prev, submitted: event.target.value }))}
              placeholder="the Warriors"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Acceptable Answers</label>
            <textarea
              value={form.acceptableAnswers}
              onChange={(event) => setForm((prev) => ({ ...prev, acceptableAnswers: event.target.value }))}
              placeholder={"One answer per line\nRussian Federation"}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Question ID</label>
            <input
              value={form.questionId}
              onChange={(event) => setForm((prev) => ({ ...prev, questionId: event.target.value }))}
              placeholder="Optional"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Answer Index</label>
            <input
              value={form.answerIndex}
              onChange={(event) => setForm((prev) => ({ ...prev, answerIndex: event.target.value }))}
              placeholder="0"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Extra Variant Indexes</label>
            <input
              value={form.answerVariantIndexes}
              onChange={(event) => setForm((prev) => ({ ...prev, answerVariantIndexes: event.target.value }))}
              placeholder="1, 2"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "Checking..." : "Check Grading"}
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(INITIAL_FORM);
              setEvaluation(null);
              setError("");
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Reset
          </button>
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </section>

      {evaluation ? (
        <section className="space-y-4">
          <div className={`rounded-xl border p-6 shadow-sm ${evaluation.matched ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${evaluation.matched ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                {evaluation.matched ? "Pass" : "Fail"}
              </span>
              <p className="text-sm text-slate-700">
                {evaluation.matched
                  ? `${SOURCE_LABELS[evaluation.matchedSource ?? "canonical"]} matched by ${evaluation.matchedBy ? RULE_LABELS[evaluation.matchedBy] : "current logic"}.`
                  : "No current grading rule matched this submission."}
              </p>
            </div>

            <dl className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Normalized Submitted</dt>
                <dd className="mt-1 text-sm text-slate-900">{evaluation.normalizedSubmitted || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Matched Target</dt>
                <dd className="mt-1 text-sm text-slate-900">{evaluation.matchedTarget || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Matched Source</dt>
                <dd className="mt-1 text-sm text-slate-900">{evaluation.matchedSource ? SOURCE_LABELS[evaluation.matchedSource] : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rule</dt>
                <dd className="mt-1 text-sm text-slate-900">{evaluation.matchedBy ? RULE_LABELS[evaluation.matchedBy] : "—"}</dd>
              </div>
            </dl>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Checked Targets</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-4 font-semibold">Source</th>
                    <th className="pb-2 pr-4 font-semibold">Target</th>
                    <th className="pb-2 pr-4 font-semibold">Normalized</th>
                    <th className="pb-2 pr-4 font-semibold">Result</th>
                    <th className="pb-2 font-semibold">Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {evaluation.checkedTargets.map((target) => (
                    <tr key={`${target.source}-${target.target}`}>
                      <td className="py-2 pr-4 text-slate-600">{SOURCE_LABELS[target.source]}</td>
                      <td className="py-2 pr-4 text-slate-900">{target.target}</td>
                      <td className="py-2 pr-4 text-slate-600">{target.normalizedTarget || "—"}</td>
                      <td className="py-2 pr-4 text-slate-900">{target.matched ? "Matched" : "No match"}</td>
                      <td className="py-2 text-slate-600">{target.matchedBy ? RULE_LABELS[target.matchedBy] : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {evaluation.variantLookupAttempted || evaluation.checkedVariants.length > 0 ? (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Stored Variants</h3>
              <p className="mt-1 text-sm text-slate-500">
                Variant lookup runs only when a question id and answer index are provided.
              </p>
              {evaluation.variantLookupError ? <p className="mt-3 text-sm text-red-600">{evaluation.variantLookupError}</p> : null}
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="pb-2 pr-4 font-semibold">Index</th>
                      <th className="pb-2 pr-4 font-semibold">Variant</th>
                      <th className="pb-2 pr-4 font-semibold">Normalized</th>
                      <th className="pb-2 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {evaluation.checkedVariants.length > 0 ? (
                      evaluation.checkedVariants.map((variant, index) => (
                        <tr key={`${variant.index}-${variant.variant}-${index}`}>
                          <td className="py-2 pr-4 text-slate-600">{variant.index}</td>
                          <td className="py-2 pr-4 text-slate-900">{variant.variant}</td>
                          <td className="py-2 pr-4 text-slate-600">{variant.normalizedVariant || "—"}</td>
                          <td className="py-2 text-slate-900">{variant.matched ? "Matched" : "No match"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-3 text-slate-500">
                          No stored variants were checked.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

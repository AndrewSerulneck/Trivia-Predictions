import { callJson, jsonOf } from "@/lib/openai/responses.cjs";
import { recordUsage } from "@/lib/openai/ledger.cjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PendingSpeedQuestion = {
  id: string;
  slug: string | null;
  question: string;
  options: string[];
  correctAnswer: number;
  answer: string;
  category: string | null;
  difficulty: string | null;
};

export type LiveTriviaExportQuestion = {
  sourceId: string;
  slug: string;
  question: string;
  answer: string;
  acceptableAnswers?: string[];
  answer_format: "write_in";
  category: string;
  difficulty: string;
};

function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeAnswerKey(value: string): string {
  return String(value ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function sanitizeAcceptableAnswers(values: string[] | undefined, canonicalAnswer: string): string[] {
  const seen = new Set([normalizeAnswerKey(canonicalAnswer)]);
  const answers: string[] = [];
  for (const value of Array.isArray(values) ? values : []) {
    const answer = String(value ?? "").trim();
    const key = normalizeAnswerKey(answer);
    if (!answer || !key || seen.has(key)) continue;
    seen.add(key);
    answers.push(answer);
  }
  return answers;
}

function defaultDifficulty(value: string | null): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "easy" || normalized === "easy-medium" || normalized === "medium" || normalized === "hard") {
    return normalized;
  }
  return "medium";
}

function defaultCategory(value: string | null): string {
  return String(value ?? "").trim() || "General Knowledge";
}

function stripQuestionLead(text: string): string {
  return text
    .replace(/^(which of the following|what is|what was|what were|who is|who was|who were)\s+/i, "")
    .trim();
}

function inferFallbackAcceptableAnswers(answer: string): string[] {
  const acceptable = new Set<string>();
  const trimmed = answer.trim();
  if (!trimmed) return [];

  const withoutLeadingThe = trimmed.replace(/^the\s+/i, "").trim();
  if (withoutLeadingThe && withoutLeadingThe !== trimmed) acceptable.add(withoutLeadingThe);

  const yearMatch = trimmed.match(/^(\d{4})\s+(.+)$/);
  if (yearMatch) {
    acceptable.add(yearMatch[2].trim());
    acceptable.add(yearMatch[1].slice(2));
    acceptable.add(`${yearMatch[1].slice(2)} ${yearMatch[2].trim()}`);
  }

  const parenMatch = trimmed.match(/^(.+?)\s+\((.+)\)$/);
  if (parenMatch) {
    acceptable.add(parenMatch[1].trim());
    acceptable.add(parenMatch[2].trim());
  }

  return sanitizeAcceptableAnswers(Array.from(acceptable), trimmed);
}

export function buildFallbackLiveTriviaExportQuestion(row: PendingSpeedQuestion): LiveTriviaExportQuestion {
  const answer = String(row.answer ?? "").trim();
  const questionText = String(row.question ?? "").trim();
  const category = defaultCategory(row.category);
  const difficulty = defaultDifficulty(row.difficulty);
  const stem = stripQuestionLead(questionText).replace(/\?+$/, "").trim();
  const fallbackQuestion =
    /\b(in which|what year|which year|how many)\b/i.test(questionText) || /^\d+$/.test(answer)
      ? questionText
      : /^who\s|^what\s|^which\s|^in which\s|^on which\s/i.test(questionText)
        ? questionText
        : `What is ${stem}?`;

  const acceptableAnswers = inferFallbackAcceptableAnswers(answer);

  return {
    sourceId: row.id,
    slug: String(row.slug ?? "").trim() || slugify(questionText),
    question: fallbackQuestion.endsWith("?") ? fallbackQuestion : `${fallbackQuestion}?`,
    answer,
    ...(acceptableAnswers.length > 0 ? { acceptableAnswers } : {}),
    answer_format: "write_in",
    category,
    difficulty,
  };
}

// Phase 4f.2 (D40): the rewrite runs on the OpenAI API (Gemini before). Writing quality matters and an Admin converts
// a handful at a time, so it uses the stronger model (~$0.003 a question).
export const LIVE_REWRITE_MODEL = "gpt-6.1-sol";
const REWRITE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["slug", "question", "answer", "acceptableAnswers", "answer_format", "category", "difficulty"],
  properties: {
    slug: { type: "string" }, question: { type: "string" }, answer: { type: "string" },
    acceptableAnswers: { type: "array", items: { type: "string" } }, answer_format: { type: "string", enum: ["write_in"] },
    category: { type: "string" }, difficulty: { type: "string" },
  },
};

async function callOpenAIForLiveRewrite(prompt: string, transport: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const reply = await callJson({
    model: LIVE_REWRITE_MODEL, apiKey: process.env.OPENAI_API_KEY, prompt, schema: REWRITE_SCHEMA, name: "live_rewrite",
    maxOutputTokens: 1024, timeoutMs: 30_000, transport,
  });
  await recordUsage(supabaseAdmin, { feature: "live_trivia_rewrite", byModel: { [LIVE_REWRITE_MODEL]: { calls: 1, ...reply.usage } } });
  const parsed = jsonOf(reply, "live-rewrite");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("live-rewrite-json-invalid");
  return parsed as Record<string, unknown>;
}

function buildRewritePrompt(row: PendingSpeedQuestion): string {
  return [
    "Convert this multiple-choice trivia question into a high-quality LIVE write-in trivia question.",
    "Return a JSON object with these keys:",
    'slug, question, answer, acceptableAnswers, answer_format, category, difficulty',
    "",
    "Rules:",
    '- Keep `answer_format` exactly `"write_in"`.',
    "- The rewritten question must work without showing multiple-choice options.",
    "- Preserve factual correctness.",
    "- Prefer concise, natural bar-trivia wording.",
    "- The answer should be a rigid identifier, short phrase, or specific year when possible.",
    "- `acceptableAnswers` should contain only genuinely acceptable alternates, abbreviations, or equivalent forms.",
    "- Do not include the canonical answer inside `acceptableAnswers`.",
    "- Keep the original category unless there is a clear formatting reason not to.",
    "- Keep difficulty aligned with the original.",
    "",
    "Original multiple-choice question JSON:",
    JSON.stringify({
      slug: row.slug,
      question: row.question,
      options: row.options,
      correctAnswer: row.correctAnswer,
      answer: row.answer,
      category: row.category,
      difficulty: row.difficulty,
    }, null, 2),
  ].join("\n");
}

export function normalizeConvertedLiveTriviaExportQuestion(
  raw: Record<string, unknown>,
  fallback: PendingSpeedQuestion
): LiveTriviaExportQuestion {
  const answer = String(raw.answer ?? fallback.answer ?? "").trim();
  if (!answer) {
    throw new Error("Converted live question is missing an answer.");
  }

  const question = String(raw.question ?? "").trim() || buildFallbackLiveTriviaExportQuestion(fallback).question;
  const acceptableAnswers = sanitizeAcceptableAnswers(
    Array.isArray(raw.acceptableAnswers)
      ? raw.acceptableAnswers.map((value) => String(value ?? "").trim())
      : [],
    answer
  );

  return {
    sourceId: fallback.id,
    slug: String(raw.slug ?? fallback.slug ?? "").trim() || slugify(question),
    question: question.endsWith("?") ? question : `${question}?`,
    answer,
    ...(acceptableAnswers.length > 0 ? { acceptableAnswers } : {}),
    answer_format: "write_in",
    category: String(raw.category ?? fallback.category ?? "").trim() || defaultCategory(fallback.category),
    difficulty: defaultDifficulty(String(raw.difficulty ?? fallback.difficulty ?? "")),
  };
}

export async function convertSpeedQuestionToLiveTriviaExportQuestion(
  row: PendingSpeedQuestion,
  transport: typeof fetch = fetch
): Promise<LiveTriviaExportQuestion> {
  try {
    const raw = await callOpenAIForLiveRewrite(buildRewritePrompt(row), transport);
    return normalizeConvertedLiveTriviaExportQuestion(raw, row);
  } catch {
    return buildFallbackLiveTriviaExportQuestion(row);
  }
}

import { trackGeminiUsage } from "@/lib/llmCostTracker";

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

function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Gemini returned an empty response.");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const parsed = JSON.parse(candidate) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Gemini response JSON is not an object.");
  }
  return parsed;
}

async function callGeminiForLiveRewrite(prompt: string): Promise<Record<string, unknown>> {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const model = String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  const endpoint =
    process.env.GEMINI_API_URL ||
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || response.statusText || "Unknown Gemini API error";
    throw new Error(`Gemini API request failed (${response.status}): ${message}`);
  }

  // Track cost — fire-and-forget.
  trackGeminiUsage(data.usageMetadata ?? {}, model, "live_trivia_rewrite").catch(() => {});

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((part: { text?: string }) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();

  return extractJsonObject(text);
}

function buildRewritePrompt(row: PendingSpeedQuestion): string {
  return [
    "Convert this multiple-choice trivia question into a high-quality LIVE write-in trivia question.",
    "Return ONLY a JSON object with these keys:",
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
  row: PendingSpeedQuestion
): Promise<LiveTriviaExportQuestion> {
  try {
    const raw = await callGeminiForLiveRewrite(buildRewritePrompt(row));
    return normalizeConvertedLiveTriviaExportQuestion(raw, row);
  } catch {
    return buildFallbackLiveTriviaExportQuestion(row);
  }
}

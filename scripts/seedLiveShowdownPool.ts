import { createClient } from "@supabase/supabase-js";

type TriviaQuestionRow = {
  id: string;
  slug: string | null;
  question: string;
  options: unknown;
  correct_answer: number;
  category: string | null;
  difficulty: string | null;
  question_pool: "anytime_blitz" | "live_showdown";
  answer?: unknown;
  correctAnswerText?: unknown;
};

function normalizeEnvValue(value: string | undefined): string {
  if (!value) return "";
  let normalized = value.trim();
  for (let i = 0; i < 2; i += 1) {
    if (
      (normalized.startsWith('""') && normalized.endsWith('""')) ||
      (normalized.startsWith("''") && normalized.endsWith("''"))
    ) {
      normalized = normalized.slice(2, -2).trim();
      continue;
    }
    if (
      (normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
      normalized = normalized.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return normalized;
}

function normalizeSupabaseUrl(value: string): string {
  if (!value) return value;
  if (value.includes(".supabase.com")) {
    return value.replace(".supabase.com", ".supabase.co");
  }
  return value;
}

function toWordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isStandaloneNumeric(value: string): boolean {
  return /^[+-]?\d+(?:\.\d+)?$/.test(value.trim());
}

function coerceOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim());
}

function extractCorrectAnswerText(row: TriviaQuestionRow): string {
  const direct = String(row.correctAnswerText ?? row.answer ?? "").trim();
  if (direct) return direct;
  const options = coerceOptions(row.options);
  const idx = Number.isInteger(row.correct_answer) ? row.correct_answer : -1;
  if (idx < 0 || idx >= options.length) return "";
  return String(options[idx] ?? "").trim();
}

function isLiveShowdownEligibleAnswer(answer: string): boolean {
  const normalized = answer.trim();
  if (!normalized) return false;
  if (isStandaloneNumeric(normalized)) return true;
  return toWordCount(normalized) <= 2;
}

async function main() {
  const supabaseUrl = normalizeSupabaseUrl(
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
  const serviceRoleKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("trivia_questions")
    .select("id, slug, question, options, correct_answer, category, difficulty, question_pool");

  if (error) {
    throw new Error(`Failed to load trivia_questions: ${JSON.stringify(error)}`);
  }

  const rows = (data ?? []) as TriviaQuestionRow[];
  const existingSlugs = new Set(rows.map((row) => String(row.slug ?? "").trim()).filter(Boolean));

  const eligibleRows = rows.filter((row) => {
    const answer = extractCorrectAnswerText(row);
    return isLiveShowdownEligibleAnswer(answer);
  });

  const alreadyLiveRows = eligibleRows.filter((row) => row.question_pool === "live_showdown");

  const clones = eligibleRows
    .filter((row) => row.question_pool === "anytime_blitz")
    .map((row) => {
      const baseSlug = String(row.slug ?? "").trim();
      if (!baseSlug) return null;
      const cloneSlug = `${baseSlug}--live`;
      return {
        slug: cloneSlug,
        question: row.question,
        options: row.options,
        correct_answer: row.correct_answer,
        category: row.category,
        difficulty: row.difficulty,
        question_pool: "live_showdown" as const,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (clones.length > 0) {
    const batchSize = 200;
    for (let i = 0; i < clones.length; i += batchSize) {
      const batch = clones.slice(i, i + batchSize);
      const { error: upsertError } = await admin
        .from("trivia_questions")
        .upsert(batch, { onConflict: "slug" });

      if (upsertError) {
        throw new Error(`Failed to upsert live clones: ${JSON.stringify(upsertError)}`);
      }
    }
  }

  const createdNewCloneCount = clones.filter((row) => !existingSlugs.has(row.slug)).length;

  const summary = {
    scanned_total: rows.length,
    eligible_total: eligibleRows.length,
    already_live_eligible_total: alreadyLiveRows.length,
    cloned_or_updated_now: clones.length,
    newly_created_live_clones: createdNewCloneCount,
  };

  console.log("[seedLiveShowdownPool] Completed", JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[seedLiveShowdownPool] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

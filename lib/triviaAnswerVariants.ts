import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  normalizeSuggestedAnswer,
  suggestAnswerVariants,
  type SuggestedAnswerVariantType,
} from "@/lib/triviaAnswerSuggestions";

export type AnswerVariantType =
  | SuggestedAnswerVariantType;

type AnswerVariant = {
  variant_text: string;
  variant_type: AnswerVariantType;
  confidence_score: number;
};

type TriviaQuestionVariantSeedRow = {
  id: string;
  options: unknown;
  correct_answer: number;
  answer_format: "multiple_choice" | "write_in" | "numeric" | "true_false" | null;
};

function isAnswerVariantsTableMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const message = String(error.message ?? "").toLowerCase();
  return message.includes("answer_variants") && (message.includes("could not find the table") || message.includes("relation"));
}

function normalize(value: string): string {
  return normalizeSuggestedAnswer(value);
}

function coerceOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim());
}

function normalizeAnswerKey(value: string): string {
  return normalize(value);
}

function getVariantSeedAnswers(question: TriviaQuestionVariantSeedRow): Array<{ answer: string; index: number }> {
  const options = coerceOptions(question.options);
  const correctAnswerIndex = Number(question.correct_answer);
  if (!Number.isInteger(correctAnswerIndex) || correctAnswerIndex < 0 || correctAnswerIndex >= options.length) {
    return [];
  }

  if (question.answer_format === "write_in" || question.answer_format === "numeric" || question.answer_format === "true_false") {
    const seen = new Set<string>();
    return options
      .map((answer, index) => ({ answer: String(answer ?? "").trim(), index }))
      .filter((entry) => {
        const key = normalizeAnswerKey(entry.answer);
        if (!entry.answer || !key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  const correctAnswer = String(options[correctAnswerIndex] ?? "").trim();
  return correctAnswer ? [{ answer: correctAnswer, index: correctAnswerIndex }] : [];
}

export function generateAnswerVariants(answerText: string): AnswerVariant[] {
  const text = String(answerText ?? "").trim();
  if (!text) return [];
  return suggestAnswerVariants(text).map((variant) => ({
    variant_text: normalize(variant.variantText),
    variant_type: variant.variantType,
    confidence_score: variant.confidenceScore,
  }));
}

export async function storeAnswerVariants(
  questionId: string,
  answerIndex: number,
  variants: AnswerVariant[]
): Promise<void> {
  if (!supabaseAdmin || variants.length === 0) return;

  const rows = variants.map((variant) => ({
    question_id: questionId,
    answer_index: answerIndex,
    variant_text: variant.variant_text,
    variant_type: variant.variant_type,
    confidence_score: variant.confidence_score,
  }));

  const { error } = await supabaseAdmin
    .from("answer_variants")
    .upsert(rows, { onConflict: "question_id,answer_index,variant_text" });

  if (isAnswerVariantsTableMissing(error)) {
    return;
  }
  if (error) {
    console.error("Error storing answer variants:", error);
  }
}

export async function getAnswerVariants(questionId: string, answerIndex: number): Promise<string[]> {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from("answer_variants")
    .select("variant_text")
    .eq("question_id", questionId)
    .eq("answer_index", answerIndex);

  if (error) {
    if (isAnswerVariantsTableMissing(error)) {
      return [];
    }
    console.error("Error fetching answer variants:", error);
    return [];
  }

  return ((data ?? []) as Array<{ variant_text: string }>).map((row) => normalize(row.variant_text)).filter(Boolean);
}

export async function regenerateAllAnswerVariants(): Promise<{
  processed: number;
  variantsCreated: number;
  errors: number;
}> {
  if (!supabaseAdmin) {
    return { processed: 0, variantsCreated: 0, errors: 0 };
  }

  const probe = await supabaseAdmin
    .from("answer_variants")
    .select("id", { head: true, count: "exact" });
  if (isAnswerVariantsTableMissing(probe.error)) {
    return { processed: 0, variantsCreated: 0, errors: 0 };
  }
  if (probe.error) {
    console.error("Error probing answer_variants table:", probe.error);
    return { processed: 0, variantsCreated: 0, errors: 1 };
  }

  let processed = 0;
  let variantsCreated = 0;
  let errors = 0;

  const BATCH_SIZE = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabaseAdmin
      .from("trivia_questions")
      .select("id, options, correct_answer, answer_format")
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error("Error fetching questions for variants:", error);
      errors += 1;
      break;
    }

    const questions = (data ?? []) as TriviaQuestionVariantSeedRow[];
    if (questions.length === 0) {
      break;
    }

    for (const question of questions) {
      try {
        const seedAnswers = getVariantSeedAnswers(question);
        if (seedAnswers.length === 0) {
          continue;
        }

        for (const seed of seedAnswers) {
          const variants = generateAnswerVariants(seed.answer);
          if (variants.length > 0) {
            await storeAnswerVariants(String(question.id), seed.index, variants);
            variantsCreated += variants.length;
          }
        }
        processed += 1;
      } catch (errorDuringQuestion) {
        console.error("Error generating variants for question:", question.id, errorDuringQuestion);
        errors += 1;
      }
    }

    offset += BATCH_SIZE;
    hasMore = questions.length === BATCH_SIZE;
  }

  return { processed, variantsCreated, errors };
}

export async function getAnswerVariantsStats(): Promise<{
  totalQuestions: number;
  questionsWithVariants: number;
  totalVariants: number;
  variantsByType: Record<AnswerVariantType, number>;
}> {
  const emptyBreakdown: Record<AnswerVariantType, number> = {
    abbreviation: 0,
    spelling: 0,
    alias: 0,
    country_name: 0,
    historical: 0,
    person_name: 0,
    event_name: 0,
    pluralization: 0,
    generated: 0,
    nickname: 0,
    year_shorthand: 0,
    team_short_name: 0,
    roman_numeric: 0,
    suffix_variant: 0,
    article_variant: 0,
  };

  if (!supabaseAdmin) {
    return {
      totalQuestions: 0,
      questionsWithVariants: 0,
      totalVariants: 0,
      variantsByType: emptyBreakdown,
    };
  }

  const { count: totalQuestions } = await supabaseAdmin
    .from("trivia_questions")
    .select("id", { count: "exact", head: true });

  const { data: variants, error: variantsError, count: totalVariants } = await supabaseAdmin
    .from("answer_variants")
    .select("question_id, variant_type", { count: "exact" });

  if (isAnswerVariantsTableMissing(variantsError)) {
    return {
      totalQuestions: totalQuestions ?? 0,
      questionsWithVariants: 0,
      totalVariants: 0,
      variantsByType: emptyBreakdown,
    };
  }

  if (variantsError) {
    console.error("Error fetching answer variants stats:", variantsError);
    return {
      totalQuestions: totalQuestions ?? 0,
      questionsWithVariants: 0,
      totalVariants: 0,
      variantsByType: emptyBreakdown,
    };
  }

  if (!variants) {
    return {
      totalQuestions: totalQuestions ?? 0,
      questionsWithVariants: 0,
      totalVariants: 0,
      variantsByType: emptyBreakdown,
    };
  }

  const variantsByType = { ...emptyBreakdown };
  const uniqueQuestionIds = new Set<string>();
  for (const row of (variants ?? []) as Array<{ question_id: string; variant_type: AnswerVariantType }>) {
    uniqueQuestionIds.add(String(row.question_id));
    const type = row.variant_type;
    variantsByType[type] = (variantsByType[type] ?? 0) + 1;
  }

  return {
    totalQuestions: totalQuestions ?? 0,
    questionsWithVariants: uniqueQuestionIds.size,
    totalVariants: totalVariants ?? 0,
    variantsByType,
  };
}

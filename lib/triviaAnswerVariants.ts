import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AnswerVariantType =
  | "abbreviation"
  | "spelling"
  | "alias"
  | "country_name"
  | "historical"
  | "person_name"
  | "event_name"
  | "pluralization"
  | "generated";

type AnswerVariant = {
  variant_text: string;
  variant_type: AnswerVariantType;
  confidence_score: number;
};

type TriviaQuestionVariantSeedRow = {
  id: string;
  options: unknown;
  correct_answer: number;
};

function isAnswerVariantsTableMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const message = String(error.message ?? "").toLowerCase();
  return message.includes("answer_variants") && (message.includes("could not find the table") || message.includes("relation"));
}

const COUNTRY_ABBREVIATIONS: Record<string, string[]> = {
  "great britain": ["uk", "u.k.", "u k", "united kingdom", "britain"],
  "united kingdom": ["uk", "u.k.", "u k", "great britain", "britain"],
  "united states": ["us", "u.s.", "u s", "usa", "u.s.a.", "u s a", "united states of america"],
  russia: ["ussr", "u.s.s.r.", "soviet union", "russian federation"],
  iran: ["persia"],
  thailand: ["siam"],
  ireland: ["eire", "republic of ireland"],
  "south korea": ["korea"],
  china: ["prc", "peoples republic of china"],
  zimbabwe: ["rhodesia"],
  germany: ["deutsch", "deutschland"],
};

const HISTORICAL_NAME_MAPPINGS: Record<string, string[]> = {
  iraq: ["mesopotamia"],
  iran: ["persia"],
  thailand: ["siam"],
  zimbabwe: ["rhodesia"],
  benin: ["dahomey"],
  "burkina faso": ["upper volta"],
  congo: ["belgian congo", "zaire"],
};

const PERSON_NAME_PATTERNS: Record<string, string[]> = {
  "john f. kennedy": ["jfk", "j.f.k.", "john fitzgerald kennedy"],
  "franklin d. roosevelt": ["fdr", "f.d.r.", "franklin delano roosevelt"],
  "martin luther king": ["mlk", "m.l.k.", "martin luther king jr"],
  "theodore roosevelt": ["teddy roosevelt"],
  "benjamin franklin": ["ben franklin"],
};

const EVENT_NAME_PATTERNS: Record<string, string[]> = {
  "world war ii": ["world war 2", "ww2", "wwii", "second world war"],
  "world war i": ["world war 1", "ww1", "wwi", "first world war"],
  "north atlantic treaty organization": ["nato"],
  "united nations": ["un", "u.n."],
};

function normalize(value: string): string {
  return String(value ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function coerceOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim());
}

function generateAbbreviations(text: string): AnswerVariant[] {
  const variants: AnswerVariant[] = [];
  const lower = normalize(text);

  if (COUNTRY_ABBREVIATIONS[lower]) {
    for (const abbrev of COUNTRY_ABBREVIATIONS[lower]) {
      variants.push({
        variant_text: normalize(abbrev),
        variant_type: "abbreviation",
        confidence_score: 0.95,
      });
    }
  }

  const words = text.split(/\s+/).map((word) => word.trim()).filter(Boolean);
  if (words.length >= 2) {
    const acronym = words.map((word) => word[0] ?? "").join("").toLowerCase();
    if (acronym.length >= 2 && acronym.length <= 5) {
      variants.push({
        variant_text: acronym,
        variant_type: "abbreviation",
        confidence_score: 0.85,
      });
    }
  }

  return variants;
}

function generateSpellingVariants(text: string): AnswerVariant[] {
  const variants: AnswerVariant[] = [];
  const lower = normalize(text);

  const britishToAmerican: Record<string, string> = {
    colour: "color",
    favour: "favor",
    honour: "honor",
    theatre: "theater",
    centre: "center",
    metre: "meter",
    litre: "liter",
  };

  for (const [british, american] of Object.entries(britishToAmerican)) {
    if (lower.includes(british)) {
      const variant = normalize(lower.replace(british, american));
      if (variant !== lower) {
        variants.push({
          variant_text: variant,
          variant_type: "spelling",
          confidence_score: 0.9,
        });
      }
    }
    if (lower.includes(american)) {
      const variant = normalize(lower.replace(american, british));
      if (variant !== lower) {
        variants.push({
          variant_text: variant,
          variant_type: "spelling",
          confidence_score: 0.9,
        });
      }
    }
  }

  return variants;
}

function generateAliases(text: string): AnswerVariant[] {
  const variants: AnswerVariant[] = [];
  const lower = normalize(text);

  for (const [modern, historical] of Object.entries(HISTORICAL_NAME_MAPPINGS)) {
    if (lower === modern) {
      for (const hist of historical) {
        variants.push({
          variant_text: normalize(hist),
          variant_type: "historical",
          confidence_score: 0.85,
        });
      }
    }
    if (historical.includes(lower)) {
      variants.push({
        variant_text: modern,
        variant_type: "historical",
        confidence_score: 0.85,
      });
    }
  }

  for (const [fullName, aliases] of Object.entries(PERSON_NAME_PATTERNS)) {
    if (lower === fullName) {
      for (const alias of aliases) {
        variants.push({
          variant_text: normalize(alias),
          variant_type: "person_name",
          confidence_score: 0.9,
        });
      }
    }
    if (aliases.some((alias) => normalize(alias) === lower)) {
      variants.push({
        variant_text: fullName,
        variant_type: "person_name",
        confidence_score: 0.9,
      });
    }
  }

  for (const [eventName, aliases] of Object.entries(EVENT_NAME_PATTERNS)) {
    if (lower === eventName) {
      for (const alias of aliases) {
        variants.push({
          variant_text: normalize(alias),
          variant_type: "event_name",
          confidence_score: 0.9,
        });
      }
    }
    if (aliases.some((alias) => normalize(alias) === lower)) {
      variants.push({
        variant_text: eventName,
        variant_type: "event_name",
        confidence_score: 0.9,
      });
    }
  }

  return variants;
}

function generatePluralizationVariants(text: string): AnswerVariant[] {
  const variants: AnswerVariant[] = [];
  const lower = normalize(text);
  if (!lower) return variants;

  let plural = lower;
  if (lower.endsWith("y") && lower.length > 2 && !lower.endsWith("ay") && !lower.endsWith("ey")) {
    plural = `${lower.slice(0, -1)}ies`;
  } else if (/(s|x|z|ch|sh)$/.test(lower)) {
    plural = `${lower}es`;
  } else {
    plural = `${lower}s`;
  }

  if (plural !== lower) {
    variants.push({
      variant_text: plural,
      variant_type: "pluralization",
      confidence_score: 0.8,
    });
  }

  let singular = lower;
  if (lower.endsWith("ies") && lower.length > 4) {
    singular = `${lower.slice(0, -3)}y`;
  } else if (lower.endsWith("es") && lower.length > 3) {
    singular = lower.slice(0, -2);
  } else if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 2) {
    singular = lower.slice(0, -1);
  }

  if (singular !== lower && singular.length > 1) {
    variants.push({
      variant_text: singular,
      variant_type: "pluralization",
      confidence_score: 0.75,
    });
  }

  return variants;
}

export function generateAnswerVariants(answerText: string): AnswerVariant[] {
  const text = String(answerText ?? "").trim();
  if (!text) return [];

  const variants: AnswerVariant[] = [];
  const seen = new Set<string>();
  const base = normalize(text);

  const pushUnique = (variant: AnswerVariant) => {
    const key = normalize(variant.variant_text);
    if (!key || key === base || seen.has(key)) return;
    seen.add(key);
    variants.push({
      ...variant,
      variant_text: key,
    });
  };

  generateAbbreviations(text).forEach(pushUnique);
  generateSpellingVariants(text).forEach(pushUnique);
  generateAliases(text).forEach(pushUnique);
  generatePluralizationVariants(text).forEach(pushUnique);

  return variants;
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
      .select("id, options, correct_answer")
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
        const options = coerceOptions(question.options);
        const correctAnswerIndex = Number(question.correct_answer);
        if (!Number.isInteger(correctAnswerIndex) || correctAnswerIndex < 0 || correctAnswerIndex >= options.length) {
          continue;
        }
        const correctAnswer = options[correctAnswerIndex] ?? "";
        if (!correctAnswer) continue;

        const variants = generateAnswerVariants(correctAnswer);
        if (variants.length > 0) {
          await storeAnswerVariants(String(question.id), correctAnswerIndex, variants);
          variantsCreated += variants.length;
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

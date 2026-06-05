export type SuggestedAnswerVariantType =
  | "abbreviation"
  | "spelling"
  | "alias"
  | "country_name"
  | "historical"
  | "person_name"
  | "event_name"
  | "pluralization"
  | "generated"
  | "nickname"
  | "year_shorthand"
  | "team_short_name"
  | "roman_numeric"
  | "suffix_variant"
  | "article_variant";

export type SuggestedAnswerVariant = {
  variantText: string;
  variantType: SuggestedAnswerVariantType;
  confidenceScore: number;
};

const COUNTRY_ABBREVIATIONS: Record<string, string[]> = {
  "great britain": ["UK", "U.K.", "United Kingdom", "Britain"],
  "united kingdom": ["UK", "U.K.", "Great Britain", "Britain"],
  "united states": ["US", "U.S.", "USA", "U.S.A.", "United States of America"],
  Russia: ["USSR", "U.S.S.R.", "Soviet Union", "Russian Federation"],
  Iran: ["Persia"],
  Thailand: ["Siam"],
  Ireland: ["Eire", "Republic of Ireland"],
  "South Korea": ["Korea"],
  China: ["PRC", "People's Republic of China"],
  Zimbabwe: ["Rhodesia"],
  Germany: ["Deutschland"],
};

const HISTORICAL_NAME_MAPPINGS: Record<string, string[]> = {
  Iraq: ["Mesopotamia"],
  Iran: ["Persia"],
  Thailand: ["Siam"],
  Zimbabwe: ["Rhodesia"],
  Benin: ["Dahomey"],
  "Burkina Faso": ["Upper Volta"],
  Congo: ["Belgian Congo", "Zaire"],
};

const PERSON_NAME_PATTERNS: Record<string, string[]> = {
  "John F. Kennedy": ["JFK", "J.F.K.", "John Fitzgerald Kennedy"],
  "Franklin D. Roosevelt": ["FDR", "F.D.R.", "Franklin Delano Roosevelt"],
  "Martin Luther King": ["MLK", "M.L.K.", "Martin Luther King Jr", "Martin Luther King Junior"],
  "Theodore Roosevelt": ["Teddy Roosevelt"],
  "Benjamin Franklin": ["Ben Franklin"],
  "Stephen Curry": ["Steph Curry"],
};

const EVENT_NAME_PATTERNS: Record<string, string[]> = {
  "World War II": ["World War 2", "WW2", "WWII", "Second World War"],
  "World War I": ["World War 1", "WW1", "WWI", "First World War"],
  "North Atlantic Treaty Organization": ["NATO"],
  "United Nations": ["UN", "U.N."],
};

const ACRONYM_EXPANSIONS: Record<string, string[]> = {
  UCLA: ["University of California, Los Angeles", "University of California Los Angeles"],
  USC: ["University of Southern California"],
  NCAA: ["National Collegiate Athletic Association"],
  NBA: ["National Basketball Association"],
  NFL: ["National Football League"],
  NHL: ["National Hockey League"],
  MLB: ["Major League Baseball"],
  FIFA: ["Federation Internationale de Football Association"],
  FIBA: ["International Basketball Federation"],
  ITF: ["International Tennis Federation"],
  FBI: ["Federal Bureau of Investigation"],
  DNA: ["Deoxyribonucleic Acid"],
  USA: ["United States", "United States of America"],
  WWF: ["World Wildlife Fund"],
};

export function normalizeSuggestedAnswer(value: string): string {
  return String(value ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,]+$/g, "").trim();
}

function generateAbbreviationVariants(text: string): SuggestedAnswerVariant[] {
  const variants: SuggestedAnswerVariant[] = [];
  const trimmed = String(text ?? "").trim();
  const upper = trimmed.toUpperCase();

  for (const expansion of ACRONYM_EXPANSIONS[upper] ?? []) {
    variants.push({
      variantText: expansion,
      variantType: "abbreviation",
      confidenceScore: 0.99,
    });
  }

  const lower = normalizeSuggestedAnswer(trimmed);
  for (const [canonical, aliases] of Object.entries(COUNTRY_ABBREVIATIONS)) {
    if (normalizeSuggestedAnswer(canonical) === lower) {
      for (const alias of aliases) {
        variants.push({
          variantText: alias,
          variantType: "abbreviation",
          confidenceScore: 0.95,
        });
      }
    }
  }

  for (const [acronym, expansions] of Object.entries(ACRONYM_EXPANSIONS)) {
    if (expansions.some((expansion) => normalizeSuggestedAnswer(expansion) === lower)) {
      variants.push({
        variantText: acronym,
        variantType: "abbreviation",
        confidenceScore: 0.99,
      });
    }
  }

  return variants;
}

function generateAliasVariants(text: string): SuggestedAnswerVariant[] {
  const variants: SuggestedAnswerVariant[] = [];
  const lower = normalizeSuggestedAnswer(text);

  for (const [modern, historical] of Object.entries(HISTORICAL_NAME_MAPPINGS)) {
    if (normalizeSuggestedAnswer(modern) === lower) {
      for (const alias of historical) {
        variants.push({
          variantText: alias,
          variantType: "historical",
          confidenceScore: 0.85,
        });
      }
    }
    if (historical.some((alias) => normalizeSuggestedAnswer(alias) === lower)) {
      variants.push({
        variantText: modern,
        variantType: "historical",
        confidenceScore: 0.85,
      });
    }
  }

  for (const [fullName, aliases] of Object.entries(PERSON_NAME_PATTERNS)) {
    if (normalizeSuggestedAnswer(fullName) === lower) {
      for (const alias of aliases) {
        variants.push({
          variantText: alias,
          variantType: "person_name",
          confidenceScore: 0.92,
        });
      }
    }
    if (aliases.some((alias) => normalizeSuggestedAnswer(alias) === lower)) {
      variants.push({
        variantText: fullName,
        variantType: "person_name",
        confidenceScore: 0.92,
      });
    }
  }

  for (const [eventName, aliases] of Object.entries(EVENT_NAME_PATTERNS)) {
    if (normalizeSuggestedAnswer(eventName) === lower) {
      for (const alias of aliases) {
        variants.push({
          variantText: alias,
          variantType: "event_name",
          confidenceScore: 0.9,
        });
      }
    }
    if (aliases.some((alias) => normalizeSuggestedAnswer(alias) === lower)) {
      variants.push({
        variantText: eventName,
        variantType: "event_name",
        confidenceScore: 0.9,
      });
    }
  }

  return variants;
}

function generateYearSensitiveVariants(text: string): SuggestedAnswerVariant[] {
  const variants: SuggestedAnswerVariant[] = [];
  const match = String(text ?? "").trim().match(/^(\d{4})\s+(.+)$/);
  if (!match) return variants;

  const [, year, remainderRaw] = match;
  const remainder = remainderRaw.trim();
  const shortYear = year.slice(-2);
  const words = remainder.split(/\s+/).filter(Boolean);
  const mascot = words[words.length - 1];

  if (mascot) {
    variants.push({
      variantText: `${shortYear} ${mascot}`,
      variantType: "year_shorthand",
      confidenceScore: 0.97,
    });
    variants.push({
      variantText: `${year} ${mascot}`,
      variantType: "team_short_name",
      confidenceScore: 0.97,
    });
  }

  return variants;
}

function generateSuffixVariants(text: string): SuggestedAnswerVariant[] {
  const variants: SuggestedAnswerVariant[] = [];
  const trimmed = String(text ?? "").trim();
  if (/\bJr\.?$/i.test(trimmed)) {
    variants.push({
      variantText: trimmed.replace(/\bJr\.?$/i, "Junior").trim(),
      variantType: "suffix_variant",
      confidenceScore: 0.9,
    });
    variants.push({
      variantText: trimmed.replace(/\s+\bJr\.?$/i, "").trim(),
      variantType: "suffix_variant",
      confidenceScore: 0.75,
    });
  }
  if (/\bJunior$/i.test(trimmed)) {
    variants.push({
      variantText: trimmed.replace(/\bJunior$/i, "Jr.").trim(),
      variantType: "suffix_variant",
      confidenceScore: 0.9,
    });
  }
  return variants;
}

function generateArticleVariants(text: string): SuggestedAnswerVariant[] {
  const variants: SuggestedAnswerVariant[] = [];
  const trimmed = String(text ?? "").trim();
  if (/^The\s+/i.test(trimmed)) {
    variants.push({
      variantText: trimmed.replace(/^The\s+/i, "").trim(),
      variantType: "article_variant",
      confidenceScore: 0.8,
    });
  }
  return variants;
}

export function suggestAnswerVariants(answerText: string): SuggestedAnswerVariant[] {
  const text = String(answerText ?? "").trim();
  if (!text) return [];

  const variants: SuggestedAnswerVariant[] = [];
  const seen = new Set<string>();
  const base = normalizeSuggestedAnswer(text);

  const pushUnique = (variant: SuggestedAnswerVariant) => {
    const key = normalizeSuggestedAnswer(variant.variantText);
    if (!key || key === base || seen.has(key)) return;
    seen.add(key);
    variants.push({
      ...variant,
      variantText: variant.variantText.trim(),
    });
  };

  generateAbbreviationVariants(text).forEach(pushUnique);
  generateAliasVariants(text).forEach(pushUnique);
  generateYearSensitiveVariants(text).forEach(pushUnique);
  generateSuffixVariants(text).forEach(pushUnique);
  generateArticleVariants(text).forEach(pushUnique);

  return variants;
}

export function suggestAcceptableAnswers(answerText: string): string[] {
  return suggestAnswerVariants(answerText).map((variant) => variant.variantText);
}

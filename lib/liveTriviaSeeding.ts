export type LiveTriviaSourceBand = "start" | "middle" | "end";

export type LiveTriviaQuestionPool = "live_showdown" | "anytime_blitz";

export type NormalizedLiveTriviaSeedQuestion = {
  slug: string;
  question: string;
  category: string;
  subcategory?: string | null;
  options: unknown;
  correct_answer: number;
  question_pool: LiveTriviaQuestionPool;
  sourceOrder: number;
  sourcePercentile: number;
  sourceBand: LiveTriviaSourceBand;
};

export type LiveTriviaQuestionProfile = {
  slug: string;
  category: string;
  subcategory: string;
  slugFamily: string;
  templateKey: string;
  topicTokens: Set<string>;
  cluster: string;
  stem: string;
  sourceBand: LiveTriviaSourceBand;
  sourceOrder: number;
};

export type LiveTriviaBandCounts = Record<LiveTriviaSourceBand, number>;

export type RoundSelectionState = {
  recentProfiles: readonly LiveTriviaQuestionProfile[];
  bandCounts: LiveTriviaBandCounts;
  targetBandCounts: LiveTriviaBandCounts;
};

export const SLUG_FAMILY_HARD_SPACING = 5;
export const TEMPLATE_HARD_SPACING = 2;
export const RECENT_TOPIC_WINDOW = 4;

export const PENALTY_SEEN = 12;
export const PENALTY_CLUSTER_IMMEDIATE = 120;
export const PENALTY_CLUSTER_RECENT = 36;
export const PENALTY_SUBCATEGORY_IMMEDIATE = 60;
export const PENALTY_SUBCATEGORY_RECENT = 18;
export const PENALTY_TEMPLATE_IMMEDIATE = 80;
export const PENALTY_TEMPLATE_RECENT = 20;
export const PENALTY_SLUG_FAMILY_IMMEDIATE = 150;
export const PENALTY_SLUG_FAMILY_RECENT = 40;
export const PENALTY_TOPIC_TOKEN_OVERLAP_IMMEDIATE = 18;
export const PENALTY_TOPIC_TOKEN_OVERLAP_RECENT = 7;
export const PENALTY_BAND_OVER_TARGET = 24;

const SOURCE_BANDS: readonly LiveTriviaSourceBand[] = ["start", "middle", "end"];

const SLUG_TRAILING_VARIANTS = new Set([
  "alt",
  "copy",
  "part",
  "question",
  "round",
  "set",
  "variant",
  "version",
]);

const QUESTION_STEM_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "did",
  "do",
  "does",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "this",
  "to",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "whose",
  "why",
]);

const TOPIC_STOP_WORDS = new Set([
  ...QUESTION_STEM_STOP_WORDS,
  "about",
  "above",
  "after",
  "all",
  "also",
  "answer",
  "answers",
  "became",
  "because",
  "been",
  "before",
  "best",
  "between",
  "can",
  "called",
  "category",
  "clue",
  "correct",
  "during",
  "each",
  "first",
  "following",
  "give",
  "has",
  "have",
  "having",
  "known",
  "last",
  "made",
  "many",
  "most",
  "name",
  "named",
  "one",
  "only",
  "option",
  "played",
  "question",
  "same",
  "select",
  "shown",
  "than",
  "that",
  "their",
  "these",
  "they",
  "those",
  "through",
  "under",
  "used",
  "with",
  "would",
]);

export function normalizeLiveTriviaCategory(value: unknown): string {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized || "General";
}

export function normalizeDiversityText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: unknown): string[] {
  const normalized = normalizeDiversityText(value);
  return normalized ? normalized.split(" ") : [];
}

function isYearToken(token: string): boolean {
  return /^(1[5-9]\d{2}|20\d{2}|21\d{2})$/.test(token);
}

function isNumericVariantToken(token: string): boolean {
  return /^\d+$/.test(token) || /^\d+(st|nd|rd|th)$/.test(token);
}

function isRomanNumeralToken(token: string): boolean {
  return /^(?=[ivxlcdm]+$)[ivxlcdm]{1,8}$/.test(token);
}

function isSlugTrailingVariant(token: string): boolean {
  return (
    SLUG_TRAILING_VARIANTS.has(token) ||
    isNumericVariantToken(token) ||
    isYearToken(token) ||
    isRomanNumeralToken(token)
  );
}

export function inferQuestionStem(question: string): string {
  return tokenize(question)
    .filter((token) => token.length > 1 && !QUESTION_STEM_STOP_WORDS.has(token))
    .slice(0, 6)
    .join("-");
}

export function inferSlugFamily(slug: string): string {
  const tokens = tokenize(slug);
  if (tokens.length === 0) return "unknown";

  const stripped = tokens.slice();
  while (stripped.length > 0 && isSlugTrailingVariant(stripped[stripped.length - 1]!)) {
    stripped.pop();
  }

  if (stripped.length >= 2) return stripped.join("-");

  const fallback = tokens.slice();
  const last = fallback[fallback.length - 1];
  if (last && (isNumericVariantToken(last) || isYearToken(last))) {
    fallback.pop();
  }

  return (fallback.length > 0 ? fallback : tokens).join("-");
}

export function inferTemplateKey(question: string): string {
  const text = normalizeDiversityText(question);
  if (!text) return "generic";

  if (/^(in )?what year\b/.test(text)) return "what-year";
  if (/^what (is|are|was|were)\b/.test(text) || /^what s\b/.test(text)) return "what-is";
  if (/^who (is|are|was|were)\b/.test(text)) return "who-is";
  if (/^which (team|franchise|club)\b/.test(text)) return "which-team";
  if (/^which (country|nation)\b/.test(text)) return "which-country";
  if (/^which city\b/.test(text)) return "which-city";
  if (/^which state\b/.test(text)) return "which-state";
  if (/^which (movie|film)\b/.test(text)) return "which-movie";
  if (/^which (tv|television) (show|series)\b/.test(text)) return "which-tv-show";
  if (/^(name|name this|name that|name the)\b/.test(text)) return "name-this";
  if (/^(identify|identify this|identify that|identify the)\b/.test(text)) return "identify-this";

  return "generic";
}

export function inferTopicTokens(category: string, question: string): Set<string> {
  const tokens = [...tokenize(category), ...tokenize(question)];
  const result = new Set<string>();

  for (const token of tokens) {
    if (TOPIC_STOP_WORDS.has(token)) continue;
    if (token.length < 3 && !/^\d+$/.test(token)) continue;
    result.add(token);
  }

  return result;
}

export function getSourcePercentile(index: number, total: number): number {
  const safeTotal = Math.max(1, Math.floor(Number(total)));
  const safeIndex = Math.min(Math.max(0, Math.floor(Number(index))), safeTotal - 1);
  return (safeIndex + 0.5) / safeTotal;
}

export function getSourceBand(percentile: number): LiveTriviaSourceBand {
  const safePercentile = Number.isFinite(percentile) ? Math.min(Math.max(percentile, 0), 1) : 0.5;
  if (safePercentile < 1 / 3) return "start";
  if (safePercentile < 2 / 3) return "middle";
  return "end";
}

function buildTopicCluster(category: string, topicTokens: Set<string>): string {
  const categoryKey = normalizeDiversityText(category) || "general";
  const tokenPart = Array.from(topicTokens)
    .filter((token) => token !== categoryKey)
    .slice(0, 4)
    .join("-");
  return tokenPart ? `${categoryKey}:${tokenPart}` : categoryKey;
}

export function buildQuestionProfile(row: NormalizedLiveTriviaSeedQuestion): LiveTriviaQuestionProfile {
  const topicTokens = inferTopicTokens(row.category, row.question);
  const categoryKey = normalizeDiversityText(row.category) || "general";
  const stem = inferQuestionStem(row.question);

  return {
    slug: row.slug,
    category: row.category,
    subcategory: String(row.subcategory ?? "").trim(),
    slugFamily: inferSlugFamily(row.slug),
    templateKey: inferTemplateKey(row.question),
    topicTokens,
    cluster: buildTopicCluster(row.category, topicTokens),
    stem: stem ? `${categoryKey}:${stem}` : categoryKey,
    sourceBand: row.sourceBand,
    sourceOrder: row.sourceOrder,
  };
}

export function buildBandTargets(count: number): LiveTriviaBandCounts {
  const safeCount = Math.max(0, Math.floor(Number(count)));
  const base = Math.floor(safeCount / SOURCE_BANDS.length);
  const remainder = safeCount % SOURCE_BANDS.length;

  return SOURCE_BANDS.reduce(
    (targets, band, index) => {
      targets[band] = base + (index < remainder ? 1 : 0);
      return targets;
    },
    { start: 0, middle: 0, end: 0 } as LiveTriviaBandCounts
  );
}

export function createEmptyBandCounts(): LiveTriviaBandCounts {
  return { start: 0, middle: 0, end: 0 };
}

function countTopicTokenOverlap(left: Set<string>, right: Set<string>): number {
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap;
}

export function violatesHardSpacing(
  profile: LiveTriviaQuestionProfile,
  recentProfiles: readonly LiveTriviaQuestionProfile[]
): boolean {
  return violatesSlugFamilySpacing(profile, recentProfiles) || violatesTemplateSpacing(profile, recentProfiles);
}

export function violatesSlugFamilySpacing(
  profile: LiveTriviaQuestionProfile,
  recentProfiles: readonly LiveTriviaQuestionProfile[]
): boolean {
  const recentSlugFamilies = recentProfiles.slice(-SLUG_FAMILY_HARD_SPACING);
  return recentSlugFamilies.some((recent) => recent.slugFamily === profile.slugFamily);
}

export function violatesTemplateSpacing(
  profile: LiveTriviaQuestionProfile,
  recentProfiles: readonly LiveTriviaQuestionProfile[]
): boolean {
  const recentTemplates = recentProfiles.slice(-(TEMPLATE_HARD_SPACING - 1));
  return recentTemplates.some((recent) => recent.templateKey === profile.templateKey);
}

export function scoreCandidate(profile: LiveTriviaQuestionProfile, state: RoundSelectionState, wasSeen: boolean): number {
  const recentProfiles = state.recentProfiles.slice(-RECENT_TOPIC_WINDOW);
  const immediate = recentProfiles[recentProfiles.length - 1] ?? null;
  let penalty = wasSeen ? PENALTY_SEEN : 0;

  if (state.bandCounts[profile.sourceBand] >= state.targetBandCounts[profile.sourceBand]) {
    penalty += PENALTY_BAND_OVER_TARGET;
  }

  if (immediate) {
    if (immediate.cluster === profile.cluster) penalty += PENALTY_CLUSTER_IMMEDIATE;
    if (immediate.subcategory && profile.subcategory && immediate.subcategory === profile.subcategory) penalty += PENALTY_SUBCATEGORY_IMMEDIATE;
    if (immediate.templateKey === profile.templateKey) penalty += PENALTY_TEMPLATE_IMMEDIATE;
    if (immediate.slugFamily === profile.slugFamily) penalty += PENALTY_SLUG_FAMILY_IMMEDIATE;
    penalty += countTopicTokenOverlap(immediate.topicTokens, profile.topicTokens) * PENALTY_TOPIC_TOKEN_OVERLAP_IMMEDIATE;
  }

  for (const recent of recentProfiles.slice(0, -1)) {
    if (recent.cluster === profile.cluster) penalty += PENALTY_CLUSTER_RECENT;
    if (recent.subcategory && profile.subcategory && recent.subcategory === profile.subcategory) penalty += PENALTY_SUBCATEGORY_RECENT;
    if (recent.templateKey === profile.templateKey) penalty += PENALTY_TEMPLATE_RECENT;
    if (recent.slugFamily === profile.slugFamily) penalty += PENALTY_SLUG_FAMILY_RECENT;
    penalty += countTopicTokenOverlap(recent.topicTokens, profile.topicTokens) * PENALTY_TOPIC_TOKEN_OVERLAP_RECENT;
  }

  return penalty;
}

export function normalizeLiveTriviaSeedQuestion(
  row: {
    slug?: unknown;
    question?: unknown;
    category?: unknown;
    subcategory?: unknown;
    options?: unknown;
    correct_answer?: unknown;
    question_pool?: unknown;
    source_order?: unknown;
    sourceOrder?: unknown;
  },
  index: number,
  total: number
): NormalizedLiveTriviaSeedQuestion {
  const sourceOrderRaw = row.sourceOrder ?? row.source_order;
  const sourceOrder = Number.isFinite(Number(sourceOrderRaw)) ? Math.max(0, Math.floor(Number(sourceOrderRaw))) : index;
  const sourcePercentile = getSourcePercentile(sourceOrder, total);
  const answerRaw = row.correct_answer;
  const answerIndex =
    answerRaw === null || answerRaw === undefined || answerRaw === ""
      ? -1
      : Number.isInteger(Number(answerRaw))
        ? Number(answerRaw)
        : -1;

  return {
    slug: String(row.slug ?? "").trim(),
    question: String(row.question ?? "").trim(),
    category: normalizeLiveTriviaCategory(row.category),
    subcategory: String(row.subcategory ?? "").trim() || null,
    options: row.options,
    correct_answer: answerIndex,
    question_pool: row.question_pool === "anytime_blitz" ? "anytime_blitz" : "live_showdown",
    sourceOrder,
    sourcePercentile,
    sourceBand: getSourceBand(sourcePercentile),
  };
}

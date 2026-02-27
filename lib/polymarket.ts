import type { Prediction } from "@/types";

const GAMMA_API_URL = process.env.POLYMARKET_API_URL ?? "https://gamma-api.polymarket.com/markets";
const DEFAULT_SCAN_LIMIT = Number.parseInt(process.env.POLYMARKET_SCAN_LIMIT ?? "1000", 10);
const CATEGORY_STOP_WORDS = new Set(["and", "or", "of", "the", "in", "on", "to", "for", "vs", "v"]);
const CATEGORY_ACRONYMS = new Map([
  ["nba", "NBA"],
  ["nfl", "NFL"],
  ["mlb", "MLB"],
  ["nhl", "NHL"],
  ["ufc", "UFC"],
  ["wwe", "WWE"],
  ["ncaa", "NCAA"],
  ["f1", "F1"],
  ["usa", "USA"],
  ["us", "US"],
  ["uk", "UK"],
  ["eu", "EU"],
  ["u.s.", "US"],
  ["u.k.", "UK"],
]);

export type PredictionSort = "closing-soon" | "newest" | "volume" | "liquidity";

export type PredictionListParams = {
  page?: number | string;
  pageSize?: number | string;
  search?: string;
  category?: string;
  broadCategory?: string;
  sort?: PredictionSort | string;
};

export type PredictionListResult = {
  items: Prediction[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  categories: string[];
  trendingCategories: string[];
  broadCategories: string[];
};

type GammaMarket = {
  id?: string | number;
  question?: string | null;
  title?: string | null;
  description?: string | null;
  endDate?: string | null;
  end_date_iso?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  outcomes?: unknown;
  outcomePrices?: unknown;
  active?: boolean | null;
  closed?: boolean | null;
  category?: string | null;
  tags?: unknown;
  events?: unknown;
  volume?: unknown;
  volumeNum?: unknown;
  liquidity?: unknown;
  liquidityNum?: unknown;
};

const BROAD_CATEGORIES = [
  "trending",
  "breaking",
  "new",
  "politics",
  "sports",
  "crypto",
  "finance",
  "geopolitics",
  "earnings",
  "tech",
  "culture",
  "world",
  "economy",
  "climate & science",
  "mentions",
  "elections",
] as const;

const BROAD_CATEGORY_SET = new Set(BROAD_CATEGORIES);

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function getTrendingVolumeThreshold(markets: Prediction[]): number {
  const volumes = markets
    .map((market) => market.volume ?? market.liquidity ?? 0)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);

  if (volumes.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const index = Math.max(0, Math.floor(volumes.length * 0.2) - 1);
  return volumes[index] ?? Number.POSITIVE_INFINITY;
}

function classifyBroadCategories(
  market: Prediction,
  context: { now: number; trendingThreshold: number }
): Set<string> {
  const broad = new Set<string>();
  const haystack = [
    market.question,
    market.category ?? "",
    ...(market.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const volume = market.volume ?? market.liquidity ?? 0;
  if (volume >= context.trendingThreshold) {
    broad.add("trending");
  }
  if (haystack.includes("breaking")) {
    broad.add("breaking");
  }

  const createdAt = market.createdAt ? +new Date(market.createdAt) : Number.NaN;
  if (Number.isFinite(createdAt) && context.now - createdAt <= 1000 * 60 * 60 * 72) {
    broad.add("new");
  }

  if (includesAny(haystack, ["election", "vote", "voter", "ballot", "campaign", "primary", "poll"])) {
    broad.add("elections");
  }
  if (includesAny(haystack, ["politic", "government", "senate", "congress", "president", "prime minister", "parliament"])) {
    broad.add("politics");
  }
  if (includesAny(haystack, ["sport", "nba", "nfl", "mlb", "nhl", "soccer", "football", "basketball", "baseball", "tennis", "golf", "ufc", "f1"])) {
    broad.add("sports");
  }
  if (includesAny(haystack, ["crypto", "bitcoin", "btc", "ethereum", "eth", "solana", "token", "coin"])) {
    broad.add("crypto");
  }
  if (includesAny(haystack, ["finance", "stock", "shares", "bond", "fed", "nasdaq", "s&p", "sp500", "dow"])) {
    broad.add("finance");
  }
  if (includesAny(haystack, ["geopolitic", "war", "military", "nato", "sanction", "ukraine", "russia", "china", "taiwan", "israel", "gaza", "iran"])) {
    broad.add("geopolitics");
  }
  if (includesAny(haystack, ["earnings", "eps", "revenue", "guidance", "quarter", "q1", "q2", "q3", "q4"])) {
    broad.add("earnings");
  }
  if (includesAny(haystack, ["tech", "technology", "ai", "artificial intelligence", "openai", "apple", "google", "microsoft", "nvidia", "tesla"])) {
    broad.add("tech");
  }
  if (includesAny(haystack, ["culture", "entertainment", "movie", "tv", "music", "celebrity", "award", "box office"])) {
    broad.add("culture");
  }
  if (includesAny(haystack, ["world", "global", "international", "country"])) {
    broad.add("world");
  }
  if (includesAny(haystack, ["economy", "gdp", "inflation", "recession", "unemployment", "cpi", "jobs report"])) {
    broad.add("economy");
  }
  if (includesAny(haystack, ["climate", "weather", "temperature", "hurricane", "earthquake", "science", "space", "nasa"])) {
    broad.add("climate & science");
  }
  if (includesAny(haystack, ["mention", "mentions", "said", "says"])) {
    broad.add("mentions");
  }

  return broad;
}

function normalizePage(input: unknown, fallback: number): number {
  const value = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function normalizeSort(input: unknown): PredictionSort {
  const value = String(input ?? "").trim();
  if (value === "newest" || value === "volume" || value === "liquidity") {
    return value;
  }
  return "closing-soon";
}

function normalizePageSize(input: unknown): number {
  const value = normalizePage(input, 100);
  return Math.max(1, Math.min(100, value));
}

function coercePercent(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value <= 1) {
      return Number((value * 100).toFixed(1));
    }
    if (value >= 0 && value <= 100) {
      return Number(value.toFixed(1));
    }
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return coercePercent(parsed);
    }
  }

  return null;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function parseArrayField(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function formatCategoryLabel(value: string): string {
  const cleaned = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .trim();

  if (!cleaned) {
    return "";
  }

  const words = cleaned.split(" ");
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      const acronym = CATEGORY_ACRONYMS.get(lower);
      if (acronym) {
        return acronym;
      }
      if (index > 0 && CATEGORY_STOP_WORDS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function parseTags(value: unknown): string[] {
  const raw = parseArrayField(value);
  const tags: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const normalized = formatCategoryLabel(entry.trim());
      if (normalized) {
        tags.push(normalized);
      }
      continue;
    }

    if (entry && typeof entry === "object") {
      const objectEntry = entry as {
        label?: unknown;
        slug?: unknown;
        name?: unknown;
        title?: unknown;
        category?: unknown;
      };

      const candidates = [
        objectEntry.label,
        objectEntry.slug,
        objectEntry.name,
        objectEntry.title,
        objectEntry.category,
      ];

      for (const candidate of candidates) {
        const normalized = formatCategoryLabel(String(candidate ?? "").trim());
        if (normalized) {
          tags.push(normalized);
        }
      }
    }
  }

  const byKey = new Map<string, string>();
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, tag);
    }
  }

  return [...byKey.values()];
}

function normalizeCategoryValue(value: unknown): string {
  if (typeof value === "string") {
    return formatCategoryLabel(value.trim());
  }

  if (value && typeof value === "object") {
    const objectValue = value as {
      label?: unknown;
      name?: unknown;
      title?: unknown;
      slug?: unknown;
    };
    const fallback = objectValue.label ?? objectValue.name ?? objectValue.title ?? objectValue.slug;
    return formatCategoryLabel(String(fallback ?? "").trim());
  }

  return "";
}

function normalizeMarket(market: GammaMarket): Prediction | null {
  const marketId = String(market.id ?? "").trim();
  const question = String(market.question ?? market.title ?? "").trim();
  const closesAt = String(market.endDate ?? market.end_date_iso ?? "").trim();
  const createdAt = String(market.createdAt ?? market.created_at ?? "").trim();
  const closeDate = new Date(closesAt);

  if (!marketId || !question || Number.isNaN(closeDate.getTime())) {
    return null;
  }

  const rawOutcomes = parseArrayField(market.outcomes);
  const rawPrices = parseArrayField(market.outcomePrices);
  const outcomeCount = Math.min(rawOutcomes.length, rawPrices.length);

  if (outcomeCount < 2) {
    return null;
  }

  const outcomes: Prediction["outcomes"] = [];
  for (let index = 0; index < outcomeCount; index += 1) {
    const title = String(rawOutcomes[index] ?? "").trim();
    const probability = coercePercent(rawPrices[index]);
    if (!title || probability === null) {
      continue;
    }

    outcomes.push({
      id: `${marketId}-${index}`,
      title,
      probability,
    });
  }

  if (outcomes.length < 2) {
    return null;
  }

  const tags = Array.from(new Set([
    ...parseTags(market.tags),
    ...parseTags(market.events),
  ]));
  const category = normalizeCategoryValue(market.category);

  return {
    id: marketId,
    question,
    source: "polymarket",
    closesAt: closeDate.toISOString(),
    outcomes,
    category: category || tags[0] || "Uncategorized",
    tags,
    createdAt: Number.isNaN(new Date(createdAt).getTime()) ? undefined : new Date(createdAt).toISOString(),
    volume: coerceNumber(market.volumeNum ?? market.volume),
    liquidity: coerceNumber(market.liquidityNum ?? market.liquidity),
    isClosed: Boolean(market.closed),
  };
}

function compareBySort(a: Prediction, b: Prediction, sort: PredictionSort): number {
  if (sort === "newest") {
    return +new Date(b.createdAt ?? b.closesAt) - +new Date(a.createdAt ?? a.closesAt);
  }
  if (sort === "volume") {
    return (b.volume ?? 0) - (a.volume ?? 0) || +new Date(a.closesAt) - +new Date(b.closesAt);
  }
  if (sort === "liquidity") {
    return (b.liquidity ?? 0) - (a.liquidity ?? 0) || +new Date(a.closesAt) - +new Date(b.closesAt);
  }

  return +new Date(a.closesAt) - +new Date(b.closesAt);
}

async function fetchGammaMarkets(query: URLSearchParams): Promise<GammaMarket[]> {
  const headers: HeadersInit = {};
  if (process.env.POLYMARKET_API_KEY) {
    headers.Authorization = `Bearer ${process.env.POLYMARKET_API_KEY}`;
  }

  const response = await fetch(`${GAMMA_API_URL}?${query.toString()}`, {
    method: "GET",
    headers,
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    throw new Error(`Polymarket request failed with status ${response.status}.`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Polymarket response was not an array.");
  }

  return data as GammaMarket[];
}

export async function listPredictionMarkets(params: PredictionListParams = {}): Promise<PredictionListResult> {
  const page = normalizePage(params.page, 1);
  const pageSize = normalizePageSize(params.pageSize);
  const search = String(params.search ?? "").trim().toLowerCase();
  const category = String(params.category ?? "").trim();
  const broadCategory = String(params.broadCategory ?? "").trim().toLowerCase();
  const sort = normalizeSort(params.sort);

  const query = new URLSearchParams({
    active: "true",
    closed: "false",
    limit: String(Number.isFinite(DEFAULT_SCAN_LIMIT) ? Math.max(DEFAULT_SCAN_LIMIT, 100) : 1000),
  });

  const gammaMarkets = await fetchGammaMarkets(query);
  const normalized = gammaMarkets
    .map((item) => normalizeMarket(item))
    .filter((item): item is Prediction => Boolean(item));
  const now = Date.now();
  const trendingThreshold = getTrendingVolumeThreshold(normalized);
  const broadByMarketId = new Map<string, Set<string>>();
  for (const market of normalized) {
    broadByMarketId.set(market.id, classifyBroadCategories(market, { now, trendingThreshold }));
  }

  const categories = Array.from(new Set(
    normalized.flatMap((item) => {
      const values = [item.category ?? "Uncategorized", ...(item.tags ?? [])]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
      return values.length > 0 ? values : ["Uncategorized"];
    })
  ))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const categoryScores = new Map<string, number>();
  for (const market of normalized) {
    const marketCategories = new Set(
      [market.category ?? "Uncategorized", ...(market.tags ?? [])]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    );
    const weight = Math.max(1, market.volume ?? market.liquidity ?? 1);
    for (const value of marketCategories) {
      categoryScores.set(value, (categoryScores.get(value) ?? 0) + weight);
    }
  }
  const trendingCategories = [...categoryScores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
    .slice(0, 12)
    .map(([name]) => name);

  let filtered = normalized;
  if (search) {
    filtered = filtered.filter((market) => {
      const inQuestion = market.question.toLowerCase().includes(search);
      const inOutcomes = market.outcomes.some((outcome) => outcome.title.toLowerCase().includes(search));
      const inCategory = (market.category ?? "").toLowerCase().includes(search);
      return inQuestion || inOutcomes || inCategory;
    });
  }

  if (category) {
    filtered = filtered.filter((market) => {
      if ((market.category ?? "") === category) {
        return true;
      }
      return (market.tags ?? []).includes(category);
    });
  }

  if (broadCategory && BROAD_CATEGORY_SET.has(broadCategory as (typeof BROAD_CATEGORIES)[number])) {
    filtered = filtered.filter((market) => broadByMarketId.get(market.id)?.has(broadCategory));
  }

  filtered = filtered.sort((a, b) => compareBySort(a, b, sort));

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    categories,
    trendingCategories,
    broadCategories: [...BROAD_CATEGORIES],
  };
}

export type ResolvedPredictionOutcome = {
  predictionId: string;
  winningOutcomeId?: string;
  settleAsCanceled: boolean;
};

function inferResolvedOutcome(market: Prediction): ResolvedPredictionOutcome | null {
  if (!market.isClosed) {
    return null;
  }

  // Polymarket resolved markets generally settle with one outcome near 100%.
  const winner = market.outcomes.find((outcome) => outcome.probability >= 99.5);
  if (!winner) {
    return {
      predictionId: market.id,
      settleAsCanceled: true,
    };
  }

  return {
    predictionId: market.id,
    winningOutcomeId: winner.id,
    settleAsCanceled: false,
  };
}

export async function listResolvedPredictionOutcomes(predictionIds: string[]): Promise<ResolvedPredictionOutcome[]> {
  if (predictionIds.length === 0) {
    return [];
  }

  const query = new URLSearchParams({
    active: "false",
    closed: "true",
    limit: String(Number.isFinite(DEFAULT_SCAN_LIMIT) ? Math.max(DEFAULT_SCAN_LIMIT, 100) : 1000),
  });

  const gammaMarkets = await fetchGammaMarkets(query);
  const byId = new Set(predictionIds);

  const resolved: ResolvedPredictionOutcome[] = [];
  for (const market of gammaMarkets) {
    const normalized = normalizeMarket(market);
    if (!normalized || !byId.has(normalized.id)) {
      continue;
    }

    const inferred = inferResolvedOutcome(normalized);
    if (inferred) {
      resolved.push(inferred);
    }
  }

  return resolved;
}

export async function getPredictionMarketById(predictionId: string): Promise<Prediction | null> {
  const trimmed = predictionId.trim();
  if (!trimmed) {
    return null;
  }

  const directQuery = new URLSearchParams({
    id: trimmed,
  });

  const direct = await fetchGammaMarkets(directQuery);
  const directNormalized = direct
    .map((item) => normalizeMarket(item))
    .filter((item): item is Prediction => Boolean(item));
  const directMatch = directNormalized.find((item) => item.id === trimmed);
  if (directMatch) {
    return directMatch;
  }

  const scanQuery = new URLSearchParams({
    active: "true",
    closed: "false",
    limit: String(Number.isFinite(DEFAULT_SCAN_LIMIT) ? Math.max(DEFAULT_SCAN_LIMIT, 100) : 1000),
  });
  const scan = await fetchGammaMarkets(scanQuery);
  const scanNormalized = scan
    .map((item) => normalizeMarket(item))
    .filter((item): item is Prediction => Boolean(item));

  return scanNormalized.find((item) => item.id === trimmed) ?? null;
}

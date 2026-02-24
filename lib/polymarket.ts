import type { Prediction } from "@/types";

const GAMMA_API_URL = process.env.POLYMARKET_API_URL ?? "https://gamma-api.polymarket.com/markets";
const DEFAULT_SCAN_LIMIT = Number.parseInt(process.env.POLYMARKET_SCAN_LIMIT ?? "1000", 10);

export type PredictionSort = "closing-soon" | "newest" | "volume" | "liquidity";

export type PredictionListParams = {
  page?: number | string;
  pageSize?: number | string;
  search?: string;
  category?: string;
  sort?: PredictionSort | string;
};

export type PredictionListResult = {
  items: Prediction[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  categories: string[];
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
  volume?: unknown;
  volumeNum?: unknown;
  liquidity?: unknown;
  liquidityNum?: unknown;
};

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

function parseTags(value: unknown): string[] {
  const raw = parseArrayField(value);
  const tags: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const normalized = entry.trim();
      if (normalized) {
        tags.push(normalized);
      }
      continue;
    }

    if (entry && typeof entry === "object") {
      const candidate = (entry as { label?: unknown; slug?: unknown; name?: unknown }).label
        ?? (entry as { slug?: unknown }).slug
        ?? (entry as { name?: unknown }).name;
      const normalized = String(candidate ?? "").trim();
      if (normalized) {
        tags.push(normalized);
      }
    }
  }

  return Array.from(new Set(tags));
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

  const category = String(market.category ?? "").trim();
  const tags = parseTags(market.tags);

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

  const categories = Array.from(new Set(normalized.map((item) => item.category ?? "Uncategorized")))
    .sort((a, b) => a.localeCompare(b));

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
    filtered = filtered.filter((market) => (market.category ?? "") === category);
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

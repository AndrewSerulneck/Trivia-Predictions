import type { Prediction } from "@/types";

const MOCK_PREDICTIONS: Prediction[] = [
  {
    id: "mock-1",
    question: "Will AI represent over 30% of global software spend by 2030?",
    source: "mock",
    closesAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    outcomes: [
      { id: "yes", title: "Yes", probability: 62.5 },
      { id: "no", title: "No", probability: 37.5 },
    ],
  },
  {
    id: "mock-2",
    question: "Will the next major smartphone launch include on-device multimodal AI?",
    source: "mock",
    closesAt: new Date(Date.now() + 1000 * 60 * 60 * 18).toISOString(),
    outcomes: [
      { id: "yes", title: "Yes", probability: 71.2 },
      { id: "no", title: "No", probability: 28.8 },
    ],
  },
];

type GammaMarket = {
  id?: string | number;
  question?: string | null;
  title?: string | null;
  endDate?: string | null;
  end_date_iso?: string | null;
  outcomes?: unknown;
  outcomePrices?: unknown;
  active?: boolean | null;
  closed?: boolean | null;
};

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

function normalizeMarket(market: GammaMarket): Prediction | null {
  const marketId = String(market.id ?? "").trim();
  const question = String(market.question ?? market.title ?? "").trim();
  const closesAt = String(market.endDate ?? market.end_date_iso ?? "").trim();
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

  const outcomes = [];
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

  return {
    id: marketId,
    question,
    source: "polymarket",
    closesAt: closeDate.toISOString(),
    outcomes,
  };
}

async function fetchPolymarketMarkets(): Promise<Prediction[]> {
  const url = process.env.POLYMARKET_API_URL ?? "https://gamma-api.polymarket.com/markets";
  const limit = Number.parseInt(process.env.POLYMARKET_MARKET_LIMIT ?? "20", 10);
  const requestUrl = `${url}?active=true&closed=false&limit=${Number.isFinite(limit) ? limit : 20}`;

  const headers: HeadersInit = {};
  if (process.env.POLYMARKET_API_KEY) {
    headers.Authorization = `Bearer ${process.env.POLYMARKET_API_KEY}`;
  }

  const response = await fetch(requestUrl, {
    method: "GET",
    headers,
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Polymarket request failed with status ${response.status}.`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Polymarket response was not an array.");
  }

  const normalized = data
    .map((item) => normalizeMarket(item as GammaMarket))
    .filter((item): item is Prediction => Boolean(item));

  return normalized;
}

export async function getPredictionMarkets(): Promise<Prediction[]> {
  try {
    const liveMarkets = await fetchPolymarketMarkets();
    if (liveMarkets.length > 0) {
      return liveMarkets;
    }
  } catch {
    // Fall through to mock data so the app stays usable without external API access.
  }

  return MOCK_PREDICTIONS;
}

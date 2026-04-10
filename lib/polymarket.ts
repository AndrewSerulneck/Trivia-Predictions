import type { Prediction } from "@/types";

const GAMMA_API_URL = process.env.POLYMARKET_API_URL ?? "https://gamma-api.polymarket.com/markets";
const DEFAULT_SCAN_LIMIT = Number.parseInt(process.env.POLYMARKET_SCAN_LIMIT ?? "1000", 10);
const DEFAULT_SCAN_PAGE_SIZE = Number.parseInt(process.env.POLYMARKET_SCAN_PAGE_SIZE ?? "500", 10);
const MAX_SCAN_PAGES = Number.parseInt(process.env.POLYMARKET_SCAN_MAX_PAGES ?? "60", 10);
const MAX_MARKETS_PER_SCAN = Number.parseInt(process.env.POLYMARKET_SCAN_MAX_MARKETS ?? "20000", 10);
const ACTIVE_MARKETS_CACHE_TTL_MS = Number.parseInt(process.env.POLYMARKET_ACTIVE_CACHE_TTL_MS ?? "30000", 10);
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
  sport?: string;
  league?: string;
  excludeSensitive?: boolean | string;
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
  sports: string[];
  leaguesBySport: Record<string, string[]>;
};

type LeagueDefinition = {
  league: string;
  sport: string;
  keywords: string[];
};

const SPORT_KEYWORDS: Array<{ sport: string; keywords: string[] }> = [
  {
    sport: "Soccer",
    keywords: [
      "soccer",
      " football ",
      "football club",
      "fc ",
      "premier league",
      "la liga",
      "bundesliga",
      "serie a",
      "ligue 1",
      "mls",
      "uefa",
      "champions league",
      "epl",
      "ucl",
      "fifa",
      "fa cup",
      "copa",
    ],
  },
  {
    sport: "Football",
    keywords: [
      "nfl",
      "super bowl",
      "ncaa football",
      "college football",
      "american football",
      "quarterback",
      "touchdown",
      "cfl",
      "ufl",
    ],
  },
  { sport: "Basketball", keywords: ["basketball", "nba", "wnba", "ncaa basketball", "march madness", "euroleague"] },
  { sport: "Baseball", keywords: ["baseball", "mlb", "world series"] },
  { sport: "Hockey", keywords: ["hockey", "nhl", "stanley cup"] },
  { sport: "Lacrosse", keywords: ["lacrosse", "pll", "nll"] },
  { sport: "Tennis", keywords: ["tennis", "atp", "wta", "grand slam", "wimbledon", "us open"] },
  { sport: "Golf", keywords: ["golf", "pga", "liv golf", "masters", "ryder cup"] },
  { sport: "MMA", keywords: ["mma", "ufc", "bellator"] },
  { sport: "Boxing", keywords: ["boxing", "boxer", "heavyweight", "title bout"] },
  { sport: "Motorsport", keywords: ["formula 1", "f1", "nascar", "indycar", "motogp"] },
  { sport: "Cricket", keywords: ["cricket", "ipl", "test match", "odi"] },
  { sport: "Rugby", keywords: ["rugby", "six nations", "super rugby"] },
  { sport: "Esports", keywords: ["esports", "e-sports", "valorant", "league of legends", "dota"] },
  { sport: "Horse Racing", keywords: ["horse racing", "kentucky derby", "belmont stakes", "preakness"] },
];

const LEAGUE_DEFINITIONS: LeagueDefinition[] = [
  { league: "NFL", sport: "Football", keywords: [" nfl ", "nfl ", " nfl", "national football league"] },
  { league: "NCAA Football", sport: "Football", keywords: ["ncaa football", "college football", "cfb"] },
  { league: "CFL", sport: "Football", keywords: [" cfl ", "canadian football league"] },
  { league: "UFL", sport: "Football", keywords: [" ufl ", "united football league"] },
  { league: "Premier League", sport: "Soccer", keywords: ["premier league", "epl"] },
  { league: "La Liga", sport: "Soccer", keywords: ["la liga"] },
  { league: "Bundesliga", sport: "Soccer", keywords: ["bundesliga"] },
  { league: "Serie A", sport: "Soccer", keywords: ["serie a"] },
  { league: "Ligue 1", sport: "Soccer", keywords: ["ligue 1"] },
  { league: "MLS", sport: "Soccer", keywords: [" mls ", "major league soccer"] },
  { league: "UEFA Champions League", sport: "Soccer", keywords: ["uefa champions league", "champions league", "ucl"] },
  { league: "NWSL", sport: "Soccer", keywords: ["nwsl", "national women's soccer league"] },
  { league: "NBA", sport: "Basketball", keywords: [" nba ", "national basketball association"] },
  { league: "WNBA", sport: "Basketball", keywords: ["wnba"] },
  { league: "NCAA Basketball", sport: "Basketball", keywords: ["ncaa basketball", "college basketball", "march madness"] },
  { league: "EuroLeague", sport: "Basketball", keywords: ["euroleague"] },
  { league: "MLB", sport: "Baseball", keywords: [" mlb ", "major league baseball"] },
  { league: "NHL", sport: "Hockey", keywords: [" nhl ", "national hockey league"] },
  { league: "PLL", sport: "Lacrosse", keywords: [" pll ", "premier lacrosse league"] },
  { league: "NLL", sport: "Lacrosse", keywords: [" nll ", "national lacrosse league"] },
  { league: "ATP Tour", sport: "Tennis", keywords: ["atp", "atp tour"] },
  { league: "WTA Tour", sport: "Tennis", keywords: ["wta", "wta tour"] },
  { league: "Grand Slam", sport: "Tennis", keywords: ["grand slam", "wimbledon", "french open", "australian open", "us open"] },
  { league: "PGA Tour", sport: "Golf", keywords: ["pga tour", " pga "] },
  { league: "LIV Golf", sport: "Golf", keywords: ["liv golf"] },
  { league: "UFC", sport: "MMA", keywords: [" ufc ", "ultimate fighting championship"] },
  { league: "Bellator", sport: "MMA", keywords: ["bellator"] },
  { league: "Boxing", sport: "Boxing", keywords: ["boxing", "title bout"] },
  { league: "Formula 1", sport: "Motorsport", keywords: ["formula 1", " f1 "] },
  { league: "NASCAR", sport: "Motorsport", keywords: ["nascar"] },
  { league: "IndyCar", sport: "Motorsport", keywords: ["indycar"] },
  { league: "IPL", sport: "Cricket", keywords: [" ipl ", "indian premier league"] },
  { league: "Six Nations", sport: "Rugby", keywords: ["six nations"] },
  { league: "Esports", sport: "Esports", keywords: ["esports", "e-sports", "valorant", "league of legends", "dota"] },
  { league: "Triple Crown", sport: "Horse Racing", keywords: ["kentucky derby", "belmont stakes", "preakness"] },
];

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
  "religion",
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
const EXCLUDED_BROAD_CATEGORIES = new Set(["politics", "geopolitics", "religion"]);

let activeMarketsCache: { expiresAt: number; items: Prediction[] } | null = null;
let activeMarketsInFlight: Promise<Prediction[]> | null = null;
let oddsMarketsCache: { expiresAt: number; items: Prediction[] } | null = null;
let oddsMarketsInFlight: Promise<Prediction[]> | null = null;

const ODDS_API_BASE_URL = process.env.ODDS_API_BASE_URL ?? "https://api.the-odds-api.com/v4";
const ODDS_API_KEY = process.env.ODDS_API_KEY?.trim() ?? "";
const ODDS_API_LOOKAHEAD_HOURS = Number.parseInt(process.env.ODDS_API_LOOKAHEAD_HOURS ?? "168", 10);
const ODDS_API_SCORES_DAYS = Number.parseInt(process.env.ODDS_API_SCORES_DAYS ?? "14", 10);
const ODDS_API_CACHE_TTL_MS = Number.parseInt(process.env.ODDS_API_CACHE_TTL_MS ?? "120000", 10);
const ODDS_API_SPORT_KEYS = (process.env.ODDS_API_SPORT_KEYS ?? "").trim();

type OddsSportConfig = {
  key: string;
  sport: string;
  league: string;
};

type OddsSportCatalogItem = {
  key?: string;
  title?: string;
  active?: boolean;
};

const DEFAULT_ODDS_SPORTS: OddsSportConfig[] = [
  { key: "basketball_nba", sport: "Basketball", league: "NBA" },
  { key: "baseball_mlb", sport: "Baseball", league: "MLB" },
  { key: "icehockey_nhl", sport: "Hockey", league: "NHL" },
];

const ODDS_SPORT_BY_KEY = new Map(DEFAULT_ODDS_SPORTS.map((item) => [item.key, item]));

type OddsEvent = {
  id?: string;
  sport_key?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: Array<{
    markets?: Array<{
      key?: string;
      outcomes?: Array<{
        name?: string;
        price?: number | string;
      }>;
    }>;
  }>;
};

type OddsScoreEvent = {
  id?: string;
  sport_key?: string;
  completed?: boolean;
  home_team?: string;
  away_team?: string;
  scores?: Array<{
    name?: string;
    score?: number | string | null;
  }>;
};

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeBoolean(input: unknown, fallback = false): boolean {
  if (typeof input === "boolean") {
    return input;
  }

  const value = String(input ?? "").trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (value === "1" || value === "true" || value === "yes" || value === "on") {
    return true;
  }
  if (value === "0" || value === "false" || value === "no" || value === "off") {
    return false;
  }

  return fallback;
}

function isSensitiveMarket(broadCategories: Set<string>): boolean {
  for (const category of EXCLUDED_BROAD_CATEGORIES) {
    if (broadCategories.has(category)) {
      return true;
    }
  }
  return false;
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
  if (market.sport) {
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
  if (includesAny(haystack, ["religion", "church", "pastor", "preacher", "prayer", "christian", "christianity", "muslim", "islam", "catholic", "temple", "synagogue"])) {
    broad.add("religion");
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
  return Math.max(1, Math.min(250, value));
}

function normalizePositiveInt(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input <= 0) {
    return fallback;
  }
  return Math.floor(input);
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

function normalizeTeamKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function toOddsPredictionId(sportKey: string, eventId: string): string {
  return `odds:${sportKey}:${eventId}`;
}

function toOddsOutcomeId(eventId: string, side: "home" | "away"): string {
  return `odds:${eventId}:${side}`;
}

function parseOddsPredictionId(predictionId: string): { sportKey: string; eventId: string } | null {
  const parts = predictionId.split(":");
  if (parts.length < 3 || parts[0] !== "odds") {
    return null;
  }
  const sportKey = parts[1]?.trim();
  const eventId = parts.slice(2).join(":").trim();
  if (!sportKey || !eventId) {
    return null;
  }
  return { sportKey, eventId };
}

function formatOddsApiDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function impliedProbabilityFromAmericanOdds(odds: number): number | null {
  if (!Number.isFinite(odds) || odds === 0) {
    return null;
  }
  if (odds < 0) {
    return Number(((-odds / (-odds + 100)) * 100).toFixed(1));
  }
  return Number(((100 / (odds + 100)) * 100).toFixed(1));
}

function getConfiguredOddsSports(): OddsSportConfig[] {
  if (!ODDS_API_SPORT_KEYS) {
    return DEFAULT_ODDS_SPORTS;
  }

  const selected = ODDS_API_SPORT_KEYS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (selected.length === 0) {
    return DEFAULT_ODDS_SPORTS;
  }

  return selected.map((key) => ODDS_SPORT_BY_KEY.get(key) ?? { key, sport: formatCategoryLabel(key), league: formatCategoryLabel(key) });
}

async function getActiveSoccerOddsSports(): Promise<OddsSportConfig[]> {
  if (!ODDS_API_KEY) {
    return [];
  }

  try {
    const query = new URLSearchParams({ apiKey: ODDS_API_KEY });
    const payload = await fetchOddsJson("/sports", query);
    if (!Array.isArray(payload)) {
      return [];
    }

    const soccerKeys = (payload as OddsSportCatalogItem[])
      .filter((item) => item.active !== false)
      .map((item) => ({
        key: String(item.key ?? "").trim(),
        title: String(item.title ?? "").trim(),
      }))
      .filter((item) => item.key.startsWith("soccer_"));

    const mapped: OddsSportConfig[] = soccerKeys.map((item) => ({
      key: item.key,
      sport: "Soccer",
      league: item.title ? formatCategoryLabel(item.title) : formatCategoryLabel(item.key),
    }));

    return mapped;
  } catch {
    return [];
  }
}

function normalizeOddsEvent(event: OddsEvent, fallbackSport?: OddsSportConfig): Prediction | null {
  const eventId = String(event.id ?? "").trim();
  const sportKey = String(event.sport_key ?? fallbackSport?.key ?? "").trim();
  const homeTeam = String(event.home_team ?? "").trim();
  const awayTeam = String(event.away_team ?? "").trim();
  const commenceTime = String(event.commence_time ?? "").trim();

  if (!eventId || !sportKey || !homeTeam || !awayTeam || !commenceTime) {
    return null;
  }

  const closesAtDate = new Date(commenceTime);
  if (Number.isNaN(closesAtDate.getTime())) {
    return null;
  }

  const bookmaker = event.bookmakers?.find((entry) => Array.isArray(entry.markets) && entry.markets.length > 0);
  const h2h = bookmaker?.markets?.find((market) => market.key === "h2h");
  if (!h2h?.outcomes || h2h.outcomes.length < 2) {
    return null;
  }

  const normalizedByTeam = new Map<string, number>();
  for (const outcome of h2h.outcomes) {
    const name = String(outcome.name ?? "").trim();
    const priceRaw = outcome.price;
    const american = typeof priceRaw === "number" ? priceRaw : Number.parseFloat(String(priceRaw ?? ""));
    const implied = impliedProbabilityFromAmericanOdds(american);
    if (!name || implied === null) {
      continue;
    }
    normalizedByTeam.set(normalizeTeamKey(name), implied);
  }

  const homeProbability = normalizedByTeam.get(normalizeTeamKey(homeTeam));
  const awayProbability = normalizedByTeam.get(normalizeTeamKey(awayTeam));
  if (homeProbability === undefined || awayProbability === undefined) {
    return null;
  }

  const totalProbability = homeProbability + awayProbability;
  const normalizedHomeProbability = totalProbability > 0
    ? Number(((homeProbability / totalProbability) * 100).toFixed(1))
    : homeProbability;
  const normalizedAwayProbability = Number((100 - normalizedHomeProbability).toFixed(1));
  const homeIsFavorite = normalizedHomeProbability >= normalizedAwayProbability;
  const favoriteTeam = homeIsFavorite ? homeTeam : awayTeam;
  const underdogTeam = homeIsFavorite ? awayTeam : homeTeam;
  const favoriteOutcome = homeIsFavorite
    ? {
        id: toOddsOutcomeId(eventId, "home"),
        title: "Yes",
        probability: normalizedHomeProbability,
      }
    : {
        id: toOddsOutcomeId(eventId, "away"),
        title: "Yes",
        probability: normalizedAwayProbability,
      };
  const underdogOutcome = homeIsFavorite
    ? {
        id: toOddsOutcomeId(eventId, "away"),
        title: "No",
        probability: normalizedAwayProbability,
      }
    : {
        id: toOddsOutcomeId(eventId, "home"),
        title: "No",
        probability: normalizedHomeProbability,
      };

  const mappedSport = ODDS_SPORT_BY_KEY.get(sportKey) ?? fallbackSport;
  return {
    id: toOddsPredictionId(sportKey, eventId),
    question: `Will ${favoriteTeam} beat ${underdogTeam}?`,
    source: "odds-api",
    closesAt: closesAtDate.toISOString(),
    outcomes: [favoriteOutcome, underdogOutcome],
    category: mappedSport?.league ?? "Game Winner",
    sport: mappedSport?.sport,
    league: mappedSport?.league,
    tags: ["The Odds API", "Moneyline", "Game Winner", homeTeam, awayTeam],
    createdAt: new Date().toISOString(),
    isClosed: false,
  };
}

async function fetchOddsJson(path: string, query: URLSearchParams): Promise<unknown> {
  const response = await fetch(`${ODDS_API_BASE_URL}${path}?${query.toString()}`, {
    method: "GET",
    next: { revalidate: 30 },
  });
  if (!response.ok) {
    throw new Error(`The Odds API request failed with status ${response.status}.`);
  }
  return response.json();
}

async function loadOddsMarkets(): Promise<Prediction[]> {
  if (!ODDS_API_KEY) {
    return [];
  }

  const lookaheadHours = Math.max(1, normalizePositiveInt(ODDS_API_LOOKAHEAD_HOURS, 168));
  const from = new Date();
  const to = new Date(Date.now() + lookaheadHours * 60 * 60 * 1000);
  const baseSports = getConfiguredOddsSports();
  const autoSoccerSports = ODDS_API_SPORT_KEYS ? [] : await getActiveSoccerOddsSports();
  const sports = Array.from(
    new Map(
      [...baseSports, ...autoSoccerSports].map((item) => [item.key, item])
    ).values()
  );

  const requests = sports.map(async (sportConfig) => {
    const query = new URLSearchParams({
      apiKey: ODDS_API_KEY,
      regions: "us",
      markets: "h2h",
      oddsFormat: "american",
      commenceTimeFrom: formatOddsApiDate(from),
      commenceTimeTo: formatOddsApiDate(to),
    });

    const payload = await fetchOddsJson(`/sports/${sportConfig.key}/odds`, query);
    if (!Array.isArray(payload)) {
      return [] as Prediction[];
    }

    return (payload as OddsEvent[])
      .map((event) => normalizeOddsEvent(event, sportConfig))
      .filter((market): market is Prediction => Boolean(market));
  });

  const settled = await Promise.allSettled(requests);
  const merged: Prediction[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      merged.push(...result.value);
    }
  }

  return merged;
}

async function getOddsMarkets(): Promise<Prediction[]> {
  if (!ODDS_API_KEY) {
    return [];
  }

  const now = Date.now();
  if (oddsMarketsCache && now < oddsMarketsCache.expiresAt) {
    return oddsMarketsCache.items;
  }

  if (oddsMarketsInFlight) {
    return oddsMarketsInFlight;
  }

  oddsMarketsInFlight = loadOddsMarkets()
    .then((items) => {
      oddsMarketsCache = {
        items,
        expiresAt: Date.now() + Math.max(1_000, ODDS_API_CACHE_TTL_MS),
      };
      return items;
    })
    .finally(() => {
      oddsMarketsInFlight = null;
    });

  return oddsMarketsInFlight;
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

function inferSportAndLeague(input: { question: string; category: string; tags: string[] }): {
  sport?: string;
  league?: string;
} {
  const haystack = ` ${[input.question, input.category, ...input.tags].join(" ").toLowerCase()} `;

  for (const definition of LEAGUE_DEFINITIONS) {
    if (includesAny(haystack, definition.keywords)) {
      return {
        sport: definition.sport,
        league: definition.league,
      };
    }
  }

  for (const candidate of SPORT_KEYWORDS) {
    if (includesAny(haystack, candidate.keywords)) {
      return {
        sport: candidate.sport,
      };
    }
  }

  return {};
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
  const classification = inferSportAndLeague({
    question,
    category,
    tags,
  });

  return {
    id: marketId,
    question,
    source: "polymarket",
    closesAt: closeDate.toISOString(),
    outcomes,
    category: category || tags[0] || "Uncategorized",
    sport: classification.sport,
    league: classification.league,
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

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function compareBySeededRandom(a: Prediction, b: Prediction, seed: string): number {
  const left = hashString(`${seed}:${a.id}`);
  const right = hashString(`${seed}:${b.id}`);
  if (left !== right) {
    return left - right;
  }
  return a.id.localeCompare(b.id);
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

async function fetchAllGammaMarkets(baseQuery: URLSearchParams, limit?: number): Promise<GammaMarket[]> {
  const pageSize = Math.min(500, normalizePositiveInt(DEFAULT_SCAN_PAGE_SIZE, 500));
  const maxPages = normalizePositiveInt(MAX_SCAN_PAGES, 60);
  const maxMarkets = normalizePositiveInt(MAX_MARKETS_PER_SCAN, 20000);
  const requestedLimit = Number.isFinite(limit) && (limit ?? 0) > 0 ? Math.floor(limit as number) : Number.POSITIVE_INFINITY;
  const cap = Math.min(maxMarkets, requestedLimit);

  const allMarkets: GammaMarket[] = [];
  const seenIds = new Set<string>();
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const remaining = Number.isFinite(cap) ? cap - allMarkets.length : pageSize;
    if (remaining <= 0) {
      break;
    }

    const requestLimit = Math.max(1, Math.min(pageSize, remaining));
    const query = new URLSearchParams(baseQuery);
    query.set("limit", String(requestLimit));
    query.set("offset", String(offset));

    const chunk = await fetchGammaMarkets(query);
    if (chunk.length === 0) {
      break;
    }

    let added = 0;
    for (const market of chunk) {
      const key = String(market.id ?? "").trim();
      if (key && seenIds.has(key)) {
        continue;
      }
      if (key) {
        seenIds.add(key);
      }
      allMarkets.push(market);
      added += 1;
    }

    if (added === 0) {
      break;
    }
    offset += chunk.length;

    if (chunk.length < requestLimit) {
      break;
    }
  }

  return allMarkets;
}

async function loadActiveNormalizedMarkets(): Promise<Prediction[]> {
  const query = new URLSearchParams({
    active: "true",
    closed: "false",
  });

  const gammaMarkets = await fetchAllGammaMarkets(query, normalizePositiveInt(DEFAULT_SCAN_LIMIT, 1000));
  return gammaMarkets
    .map((item) => normalizeMarket(item))
    .filter((item): item is Prediction => Boolean(item));
}

async function getActiveNormalizedMarkets(): Promise<Prediction[]> {
  const now = Date.now();
  if (activeMarketsCache && now < activeMarketsCache.expiresAt) {
    return activeMarketsCache.items;
  }

  if (activeMarketsInFlight) {
    return activeMarketsInFlight;
  }

  activeMarketsInFlight = loadActiveNormalizedMarkets()
    .then((items) => {
      activeMarketsCache = {
        items,
        expiresAt: Date.now() + Math.max(1_000, ACTIVE_MARKETS_CACHE_TTL_MS),
      };
      return items;
    })
    .finally(() => {
      activeMarketsInFlight = null;
    });

  return activeMarketsInFlight;
}

export async function listPredictionMarkets(params: PredictionListParams = {}): Promise<PredictionListResult> {
  const page = normalizePage(params.page, 1);
  const pageSize = normalizePageSize(params.pageSize);
  const search = String(params.search ?? "").trim().toLowerCase();
  const category = String(params.category ?? "").trim();
  const broadCategory = String(params.broadCategory ?? "").trim().toLowerCase();
  const sport = String(params.sport ?? "").trim();
  const league = String(params.league ?? "").trim();
  const excludeSensitive = normalizeBoolean(params.excludeSensitive, false);
  const sort = normalizeSort(params.sort);

  const [polymarketItems, oddsItems] = await Promise.all([getActiveNormalizedMarkets(), getOddsMarkets()]);
  const normalized = [...polymarketItems, ...oddsItems];
  const now = Date.now();
  const trendingThreshold = getTrendingVolumeThreshold(normalized);
  const broadByMarketId = new Map<string, Set<string>>();
  for (const market of normalized) {
    broadByMarketId.set(market.id, classifyBroadCategories(market, { now, trendingThreshold }));
  }

  const filteredMarkets = [...normalized].filter((market) => {
    const broadCategories = broadByMarketId.get(market.id);
    if (!excludeSensitive || !broadCategories) {
      return true;
    }
    return !isSensitiveMarket(broadCategories);
  });

  const categories = Array.from(new Set(
    filteredMarkets.flatMap((item) => {
      const values = [item.category ?? "Uncategorized", ...(item.tags ?? [])]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
      return values.length > 0 ? values : ["Uncategorized"];
    })
  ))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const categoryScores = new Map<string, number>();
  for (const market of filteredMarkets) {
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

  let filtered = [...filteredMarkets];
  if (broadCategory === "sports") {
    filtered = filtered.filter((market) => Boolean(market.sport));
  }

  if (sport) {
    filtered = filtered.filter((market) => (market.sport ?? "") === sport);
  }

  if (league) {
    filtered = filtered.filter((market) => (market.league ?? "") === league);
  }

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

  const shouldRandomizeDefaultView = !search && !category && !broadCategory && sort === "closing-soon";
  if (shouldRandomizeDefaultView) {
    const seed = new Date().toISOString().slice(0, 10);
    filtered = filtered.sort((a, b) => compareBySeededRandom(a, b, seed));
  } else {
    filtered = filtered.sort((a, b) => compareBySort(a, b, sort));
  }

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  const sportsCatalogSource = broadCategory === "sports"
    ? filteredMarkets.filter((item) => Boolean(item.sport))
    : filteredMarkets;
  const sports = Array.from(new Set(sportsCatalogSource.map((item) => item.sport).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const leaguesBySport: Record<string, string[]> = {};
  for (const sportName of sports) {
    leaguesBySport[sportName] = Array.from(
      new Set(
        sportsCatalogSource
          .filter((item) => item.sport === sportName)
          .map((item) => item.league)
          .filter(Boolean) as string[]
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  return {
    items,
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    categories,
    trendingCategories,
    broadCategories: [...BROAD_CATEGORIES],
    sports,
    leaguesBySport,
  };
}

export type ResolvedPredictionOutcome = {
  predictionId: string;
  winningOutcomeId?: string;
  settleAsCanceled: boolean;
  cancellationReason?: "tie";
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

function coerceScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

async function listResolvedOddsOutcomes(predictionIds: string[]): Promise<ResolvedPredictionOutcome[]> {
  if (!ODDS_API_KEY || predictionIds.length === 0) {
    return [];
  }

  const grouped = new Map<string, Set<string>>();
  for (const predictionId of predictionIds) {
    const parsed = parseOddsPredictionId(predictionId);
    if (!parsed) {
      continue;
    }
    const set = grouped.get(parsed.sportKey) ?? new Set<string>();
    set.add(parsed.eventId);
    grouped.set(parsed.sportKey, set);
  }

  if (grouped.size === 0) {
    return [];
  }

  const daysFrom = String(Math.max(1, normalizePositiveInt(ODDS_API_SCORES_DAYS, 14)));
  const settled: ResolvedPredictionOutcome[] = [];

  for (const [sportKey, eventIds] of grouped.entries()) {
    const query = new URLSearchParams({
      apiKey: ODDS_API_KEY,
      daysFrom,
    });

    let payload: unknown;
    try {
      payload = await fetchOddsJson(`/sports/${sportKey}/scores`, query);
    } catch {
      continue;
    }

    if (!Array.isArray(payload)) {
      continue;
    }

    for (const raw of payload as OddsScoreEvent[]) {
      const eventId = String(raw.id ?? "").trim();
      if (!eventId || !eventIds.has(eventId) || !raw.completed) {
        continue;
      }

      const homeTeam = String(raw.home_team ?? "").trim();
      const awayTeam = String(raw.away_team ?? "").trim();
      if (!homeTeam || !awayTeam) {
        continue;
      }

      const scoreByTeam = new Map<string, number>();
      for (const score of raw.scores ?? []) {
        const name = String(score.name ?? "").trim();
        const parsedScore = coerceScore(score.score);
        if (!name || parsedScore === null) {
          continue;
        }
        scoreByTeam.set(normalizeTeamKey(name), parsedScore);
      }

      const homeScore = scoreByTeam.get(normalizeTeamKey(homeTeam));
      const awayScore = scoreByTeam.get(normalizeTeamKey(awayTeam));
      if (homeScore === undefined || awayScore === undefined) {
        continue;
      }

      const predictionId = toOddsPredictionId(sportKey, eventId);
      if (homeScore === awayScore) {
        settled.push({
          predictionId,
          settleAsCanceled: true,
          cancellationReason: "tie",
        });
        continue;
      }

      settled.push({
        predictionId,
        winningOutcomeId: toOddsOutcomeId(eventId, homeScore > awayScore ? "home" : "away"),
        settleAsCanceled: false,
      });
    }
  }

  return settled;
}

export async function listResolvedPredictionOutcomes(predictionIds: string[]): Promise<ResolvedPredictionOutcome[]> {
  if (predictionIds.length === 0) {
    return [];
  }

  const polymarketIds = predictionIds.filter((id) => !id.startsWith("odds:"));
  const oddsIds = predictionIds.filter((id) => id.startsWith("odds:"));
  const oddsResolved = await listResolvedOddsOutcomes(oddsIds);
  if (polymarketIds.length === 0) {
    return oddsResolved;
  }

  const query = new URLSearchParams({
    active: "false",
    closed: "true",
    limit: String(Number.isFinite(DEFAULT_SCAN_LIMIT) ? Math.max(DEFAULT_SCAN_LIMIT, 100) : 1000),
  });

  const gammaMarkets = await fetchGammaMarkets(query);
  const byId = new Set(polymarketIds);

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

  return [...resolved, ...oddsResolved];
}

export async function getPredictionMarketById(predictionId: string): Promise<Prediction | null> {
  const trimmed = predictionId.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("odds:")) {
    const oddsMarkets = await getOddsMarkets();
    return oddsMarkets.find((item) => item.id === trimmed) ?? null;
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

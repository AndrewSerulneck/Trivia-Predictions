// The one spread-line rule for BallDontLie odds, shared by NFL Pick 'Em (lib/nflPickEm.ts) and
// College Football in regular Pick 'Em (lib/pickemGameLines.ts). A leaf: no I/O, no imports, so
// the screens can use formatSpreadLine too.
//
// The odds feed returns one row per game per sportsbook. We keep ONE line per game: the
// highest-priority sportsbook in SPREAD_VENDOR_PRIORITY, and among equals the most recently updated.

export const SPREAD_VENDOR_PRIORITY = [
  "fanduel",
  "draftkings",
  "betmgm",
  "caesars",
  "bet365",
  "fanatics",
  "betrivers",
  "betparx",
  "ballybet",
  "betway",
] as const;

export type BDLSpreadOddsRow = {
  game_id?: number | string | null;
  vendor?: string | null;
  spread_home_value?: number | string | null;
  spread_away_value?: number | string | null;
  updated_at?: string | null;
};

export type NormalizedSpreadLine = {
  providerGameId: string;
  homeSpread: number;
  awaySpread: number;
  vendor: string;
  fetchedAt: string | null;
  updatedAtMs: number;
  priority: number;
};

function parseSpreadValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function spreadVendorPriority(vendor: string): number {
  const index = (SPREAD_VENDOR_PRIORITY as readonly string[]).indexOf(vendor.toLowerCase());
  return index >= 0 ? index : SPREAD_VENDOR_PRIORITY.length;
}

/** One provider odds row → a spread line, or null when it has no usable spread. */
export function normalizeBDLSpreadRow(row: BDLSpreadOddsRow): NormalizedSpreadLine | null {
  const providerGameId = String(row.game_id ?? "").trim();
  if (!providerGameId) return null;

  const rawHomeSpread = parseSpreadValue(row.spread_home_value);
  const rawAwaySpread = parseSpreadValue(row.spread_away_value);
  if (rawHomeSpread === null && rawAwaySpread === null) return null;

  const homeSpread = rawHomeSpread ?? -rawAwaySpread!;
  const awaySpread = rawAwaySpread ?? -homeSpread;
  if (!Number.isFinite(homeSpread) || !Number.isFinite(awaySpread)) return null;

  const vendor = String(row.vendor ?? "unknown").trim() || "unknown";
  const updatedAtMs = Date.parse(String(row.updated_at ?? ""));

  return {
    providerGameId,
    homeSpread,
    awaySpread,
    vendor,
    fetchedAt: row.updated_at ?? null,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
    priority: spreadVendorPriority(vendor),
  };
}

export function pickBetterSpreadLine(
  current: NormalizedSpreadLine | undefined,
  next: NormalizedSpreadLine
): NormalizedSpreadLine {
  if (!current) return next;
  if (next.priority !== current.priority) {
    return next.priority < current.priority ? next : current;
  }
  return next.updatedAtMs > current.updatedAtMs ? next : current;
}

/** The best line per provider game id, keeping only the ids asked for. */
export function bestSpreadLinesByGame(
  rows: BDLSpreadOddsRow[],
  providerGameIds: Iterable<string>
): Map<string, NormalizedSpreadLine> {
  const wanted = new Set(providerGameIds);
  const byProviderGameId = new Map<string, NormalizedSpreadLine>();
  for (const row of rows) {
    const line = normalizeBDLSpreadRow(row);
    if (!line || !wanted.has(line.providerGameId)) continue;
    byProviderGameId.set(line.providerGameId, pickBetterSpreadLine(byProviderGameId.get(line.providerGameId), line));
  }
  return byProviderGameId;
}

/** "−13.5", "+7", or "PK" for a pick'em line. Uses a real minus sign. */
export function formatSpreadLine(spread: number | null | undefined): string | null {
  if (spread === null || spread === undefined || !Number.isFinite(spread)) return null;
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : `−${Math.abs(spread)}`;
}

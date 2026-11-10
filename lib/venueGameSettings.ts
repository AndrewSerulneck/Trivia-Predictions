import "server-only";

import {
  applyPickWindowChanges,
  parseStoredPickWindows,
  readPickEmPickWindowChanges,
  toStoredPickWindows,
  type PickEmPickWindowChanges,
  type PickEmPickWindows,
} from "@/lib/pickemPickWindow";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type NFLPickEmScoringMode = "standard" | "spread";
/** College Football in regular Pick 'Em (plan Phase 3): same two rules, but spread by default. */
export type CollegeFootballPickEmScoringMode = NFLPickEmScoringMode;

export type VenueGameSettings = {
  venueId: string;
  nflPickEmScoringMode: NFLPickEmScoringMode;
  cfbPickEmScoringMode: CollegeFootballPickEmScoringMode;
  /** Pick windows per sport (away-mode plan B1); a sport not listed is always open. */
  pickWindows: PickEmPickWindows;
  createdAt: string | null;
  updatedAt: string | null;
};

type VenueGameSettingsRow = {
  venue_id: string;
  nfl_pickem_scoring_mode: NFLPickEmScoringMode | null;
  cfb_pickem_scoring_mode?: CollegeFootballPickEmScoringMode | null;
  pickem_pick_windows?: unknown;
  created_at: string | null;
  updated_at: string | null;
};

const DEFAULT_NFL_PICKEM_SCORING_MODE: NFLPickEmScoringMode = "standard";
// Andrew, D9: spreads are on by default for college football.
export const DEFAULT_CFB_PICKEM_SCORING_MODE: CollegeFootballPickEmScoringMode = "spread";

const PICK_WINDOWS_COLUMN = "pickem_pick_windows";
const COLLEGE_COLUMN = "cfb_pickem_scoring_mode";
const SETTINGS_COLUMNS = `venue_id, nfl_pickem_scoring_mode, ${COLLEGE_COLUMN}, ${PICK_WINDOWS_COLUMN}, created_at, updated_at`;
// Before migration 20261109223743 the pick-windows column does not exist (= every sport always open),
// and before 20261031191250 neither does the college one; the older settings must keep working.
const NO_WINDOWS_SETTINGS_COLUMNS = `venue_id, nfl_pickem_scoring_mode, ${COLLEGE_COLUMN}, created_at, updated_at`;
const LEGACY_SETTINGS_COLUMNS = "venue_id, nfl_pickem_scoring_mode, created_at, updated_at";
const COLUMN_FALLBACKS = [SETTINGS_COLUMNS, NO_WINDOWS_SETTINGS_COLUMNS, LEGACY_SETTINGS_COLUMNS] as const;

const normalizeMode = (value: string | null | undefined): NFLPickEmScoringMode =>
  value === "spread" ? "spread" : DEFAULT_NFL_PICKEM_SCORING_MODE;

const normalizeCollegeMode = (value: string | null | undefined): CollegeFootballPickEmScoringMode =>
  value === "standard" ? "standard" : DEFAULT_CFB_PICKEM_SCORING_MODE;

export const isPickEmScoringMode = (value: unknown): value is NFLPickEmScoringMode =>
  value === "standard" || value === "spread";

export type GameSettingsChanges = {
  nflPickEmScoringMode?: NFLPickEmScoringMode;
  cfbPickEmScoringMode?: CollegeFootballPickEmScoringMode;
  /** Only the sports named change; null clears a sport's window. */
  pickWindows?: PickEmPickWindowChanges;
};

const hasAnyChange = (changes: GameSettingsChanges): boolean =>
  Boolean(changes.nflPickEmScoringMode || changes.cfbPickEmScoringMode || changes.pickWindows);

/**
 * A Game Settings save body (owner + admin routes): any of the two modes and `pickWindows` may be sent
 * on its own, each one sent must be valid, and at least one is needed. Null = refuse with 400.
 */
export const readGameSettingsChanges = (body: {
  nflPickEmScoringMode?: unknown;
  cfbPickEmScoringMode?: unknown;
  pickWindows?: unknown;
}): GameSettingsChanges | null => {
  const changes: GameSettingsChanges = {};
  if (body.nflPickEmScoringMode !== undefined) {
    if (!isPickEmScoringMode(body.nflPickEmScoringMode)) return null;
    changes.nflPickEmScoringMode = body.nflPickEmScoringMode;
  }
  if (body.cfbPickEmScoringMode !== undefined) {
    if (!isPickEmScoringMode(body.cfbPickEmScoringMode)) return null;
    changes.cfbPickEmScoringMode = body.cfbPickEmScoringMode;
  }
  if (body.pickWindows !== undefined) {
    const pickWindows = readPickEmPickWindowChanges(body.pickWindows);
    if (!pickWindows) return null;
    changes.pickWindows = pickWindows;
  }
  return hasAnyChange(changes) ? changes : null;
};

const mapSettingsRow = (
  venueId: string,
  row: VenueGameSettingsRow | null | undefined
): VenueGameSettings => ({
  venueId,
  nflPickEmScoringMode: normalizeMode(row?.nfl_pickem_scoring_mode),
  cfbPickEmScoringMode: normalizeCollegeMode(row?.cfb_pickem_scoring_mode),
  pickWindows: parseStoredPickWindows(row?.pickem_pick_windows),
  createdAt: row?.created_at ?? null,
  updatedAt: row?.updated_at ?? null,
});

type SettingsError = { code?: string; message?: string } | null;

const isMissingColumn = (error: SettingsError, column: string): boolean =>
  Boolean(error) &&
  (error?.code === "42703" || error?.code === "PGRST204") &&
  String(error?.message ?? "").includes(column);

/** The error is a column of `columns` that the database doesn't have yet (try the next, older set). */
const isMissingColumnOf = (error: SettingsError, columns: string): boolean =>
  [PICK_WINDOWS_COLUMN, COLLEGE_COLUMN].some((column) => columns.includes(column) && isMissingColumn(error, column));

/** Run a settings query with the newest column set, stepping back only while a column is missing. */
const withColumnFallback = async (
  run: (columns: string) => PromiseLike<{ data: VenueGameSettingsRow | null; error: SettingsError }>,
  canUse: (columns: string) => boolean = () => true,
): Promise<{ data: VenueGameSettingsRow | null; error: SettingsError }> => {
  let result: { data: VenueGameSettingsRow | null; error: SettingsError } = { data: null, error: null };
  for (const columns of COLUMN_FALLBACKS) {
    if (!canUse(columns)) break;
    result = await run(columns);
    if (!isMissingColumnOf(result.error, columns)) return result;
  }
  return result;
};

const requireSupabaseAdmin = () => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin not configured.");
  }
  return supabaseAdmin;
};

export async function getVenueGameSettings(venueId: string): Promise<VenueGameSettings> {
  const normalizedVenueId = venueId.trim();
  if (!normalizedVenueId) {
    throw new Error("venueId is required.");
  }

  const admin = requireSupabaseAdmin();
  const { data, error } = await withColumnFallback((columns) =>
    admin.from("venue_game_settings").select(columns).eq("venue_id", normalizedVenueId).maybeSingle<VenueGameSettingsRow>(),
  );

  if (error) {
    throw new Error(error.message ?? "Failed to load venue game settings.");
  }

  return mapSettingsRow(normalizedVenueId, data);
}

export async function getVenueNFLPickEmScoringMode(venueId: string): Promise<NFLPickEmScoringMode> {
  const settings = await getVenueGameSettings(venueId);
  return settings.nflPickEmScoringMode;
}

export async function getVenueCollegeFootballPickEmScoringMode(
  venueId: string
): Promise<CollegeFootballPickEmScoringMode> {
  const settings = await getVenueGameSettings(venueId);
  return settings.cfbPickEmScoringMode;
}

/**
 * Save any of the two scoring modes and the pick windows. Only what is passed is written: on a new row
 * the rest takes its column default. Pick windows merge per sport into the saved ones (one extra read).
 */
export async function updateVenueGameSettings(
  venueId: string,
  changes: GameSettingsChanges
): Promise<VenueGameSettings> {
  const normalizedVenueId = venueId.trim();
  if (!normalizedVenueId) {
    throw new Error("venueId is required.");
  }
  if (changes.nflPickEmScoringMode !== undefined && !isPickEmScoringMode(changes.nflPickEmScoringMode)) {
    throw new Error("Invalid NFL Pick 'Em scoring mode.");
  }
  if (changes.cfbPickEmScoringMode !== undefined && !isPickEmScoringMode(changes.cfbPickEmScoringMode)) {
    throw new Error("Invalid College Football Pick 'Em scoring mode.");
  }
  if (!hasAnyChange(changes)) {
    throw new Error("No game setting to save.");
  }

  const row: Record<string, unknown> = { venue_id: normalizedVenueId };
  if (changes.nflPickEmScoringMode !== undefined) row.nfl_pickem_scoring_mode = changes.nflPickEmScoringMode;
  if (changes.cfbPickEmScoringMode !== undefined) row.cfb_pickem_scoring_mode = changes.cfbPickEmScoringMode;
  if (changes.pickWindows) {
    const current = await getVenueGameSettings(normalizedVenueId);
    row[PICK_WINDOWS_COLUMN] = toStoredPickWindows(applyPickWindowChanges(current.pickWindows, changes.pickWindows));
  }

  const admin = requireSupabaseAdmin();
  // The statement fails as a whole, so nothing is written when a column is missing: a save retries with
  // an older column set only when it doesn't write the missing column.
  const { data, error } = await withColumnFallback(
    (columns) =>
      admin.from("venue_game_settings").upsert(row, { onConflict: "venue_id" }).select(columns).single<VenueGameSettingsRow>(),
    (columns) =>
      (!changes.pickWindows || columns.includes(PICK_WINDOWS_COLUMN)) &&
      (changes.cfbPickEmScoringMode === undefined || columns.includes(COLLEGE_COLUMN)),
  );

  if (error) {
    if (isMissingColumn(error, PICK_WINDOWS_COLUMN) && changes.pickWindows) {
      throw new Error("Pick windows are not available yet.");
    }
    if (isMissingColumn(error, COLLEGE_COLUMN)) {
      throw new Error("College Football settings are not available yet.");
    }
    throw new Error(error.message ?? "Failed to save venue game settings.");
  }

  return mapSettingsRow(normalizedVenueId, data);
}

export async function setVenueNFLPickEmScoringMode(
  venueId: string,
  mode: NFLPickEmScoringMode
): Promise<VenueGameSettings> {
  if (mode !== "standard" && mode !== "spread") {
    throw new Error("Invalid NFL Pick 'Em scoring mode.");
  }
  return updateVenueGameSettings(venueId, { nflPickEmScoringMode: mode });
}

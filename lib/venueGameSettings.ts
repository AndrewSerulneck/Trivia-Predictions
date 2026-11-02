import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type NFLPickEmScoringMode = "standard" | "spread";
/** College Football in regular Pick 'Em (plan Phase 3): same two rules, but spread by default. */
export type CollegeFootballPickEmScoringMode = NFLPickEmScoringMode;

export type VenueGameSettings = {
  venueId: string;
  nflPickEmScoringMode: NFLPickEmScoringMode;
  cfbPickEmScoringMode: CollegeFootballPickEmScoringMode;
  createdAt: string | null;
  updatedAt: string | null;
};

type VenueGameSettingsRow = {
  venue_id: string;
  nfl_pickem_scoring_mode: NFLPickEmScoringMode | null;
  cfb_pickem_scoring_mode?: CollegeFootballPickEmScoringMode | null;
  created_at: string | null;
  updated_at: string | null;
};

const DEFAULT_NFL_PICKEM_SCORING_MODE: NFLPickEmScoringMode = "standard";
// Andrew, D9: spreads are on by default for college football.
export const DEFAULT_CFB_PICKEM_SCORING_MODE: CollegeFootballPickEmScoringMode = "spread";

const SETTINGS_COLUMNS = "venue_id, nfl_pickem_scoring_mode, cfb_pickem_scoring_mode, created_at, updated_at";
// Before migration 20261031191250 the college column does not exist; NFL settings must keep working.
const LEGACY_SETTINGS_COLUMNS = "venue_id, nfl_pickem_scoring_mode, created_at, updated_at";

const normalizeMode = (value: string | null | undefined): NFLPickEmScoringMode =>
  value === "spread" ? "spread" : DEFAULT_NFL_PICKEM_SCORING_MODE;

const normalizeCollegeMode = (value: string | null | undefined): CollegeFootballPickEmScoringMode =>
  value === "standard" ? "standard" : DEFAULT_CFB_PICKEM_SCORING_MODE;

export const isPickEmScoringMode = (value: unknown): value is NFLPickEmScoringMode =>
  value === "standard" || value === "spread";

export type GameSettingsChanges = {
  nflPickEmScoringMode?: NFLPickEmScoringMode;
  cfbPickEmScoringMode?: CollegeFootballPickEmScoringMode;
};

/**
 * A Game Settings save body (owner + admin routes): either mode may be sent on its own, each one
 * sent must be valid, and at least one is needed. Null = refuse with 400.
 */
export const readGameSettingsChanges = (body: {
  nflPickEmScoringMode?: unknown;
  cfbPickEmScoringMode?: unknown;
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
  return changes.nflPickEmScoringMode || changes.cfbPickEmScoringMode ? changes : null;
};

const mapSettingsRow = (
  venueId: string,
  row: VenueGameSettingsRow | null | undefined
): VenueGameSettings => ({
  venueId,
  nflPickEmScoringMode: normalizeMode(row?.nfl_pickem_scoring_mode),
  cfbPickEmScoringMode: normalizeCollegeMode(row?.cfb_pickem_scoring_mode),
  createdAt: row?.created_at ?? null,
  updatedAt: row?.updated_at ?? null,
});

const isMissingCollegeColumn = (error: { code?: string; message?: string } | null): boolean =>
  Boolean(error) &&
  (error?.code === "42703" || error?.code === "PGRST204") &&
  String(error?.message ?? "").includes("cfb_pickem_scoring_mode");

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
  let { data, error } = await admin
    .from("venue_game_settings")
    .select(SETTINGS_COLUMNS)
    .eq("venue_id", normalizedVenueId)
    .maybeSingle<VenueGameSettingsRow>();

  if (isMissingCollegeColumn(error)) {
    ({ data, error } = await admin
      .from("venue_game_settings")
      .select(LEGACY_SETTINGS_COLUMNS)
      .eq("venue_id", normalizedVenueId)
      .maybeSingle<VenueGameSettingsRow>());
  }

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
 * Save one or both scoring modes. Only the modes passed are written: on a new row the other one
 * takes its column default.
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
  if (changes.nflPickEmScoringMode === undefined && changes.cfbPickEmScoringMode === undefined) {
    throw new Error("No game setting to save.");
  }

  const row: Record<string, string> = { venue_id: normalizedVenueId };
  if (changes.nflPickEmScoringMode !== undefined) row.nfl_pickem_scoring_mode = changes.nflPickEmScoringMode;
  if (changes.cfbPickEmScoringMode !== undefined) row.cfb_pickem_scoring_mode = changes.cfbPickEmScoringMode;

  const admin = requireSupabaseAdmin();
  const save = (columns: string) =>
    admin.from("venue_game_settings").upsert(row, { onConflict: "venue_id" }).select(columns).single<VenueGameSettingsRow>();

  let { data, error } = await save(SETTINGS_COLUMNS);
  // The statement failed as a whole, so nothing was written: an NFL-only save retries without
  // the college column; a college save has nowhere to go until the migration is applied.
  if (isMissingCollegeColumn(error) && changes.cfbPickEmScoringMode === undefined) {
    ({ data, error } = await save(LEGACY_SETTINGS_COLUMNS));
  }

  if (error) {
    if (isMissingCollegeColumn(error)) {
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

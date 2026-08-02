import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type NFLPickEmScoringMode = "standard" | "spread";

export type VenueGameSettings = {
  venueId: string;
  nflPickEmScoringMode: NFLPickEmScoringMode;
  createdAt: string | null;
  updatedAt: string | null;
};

type VenueGameSettingsRow = {
  venue_id: string;
  nfl_pickem_scoring_mode: NFLPickEmScoringMode | null;
  created_at: string | null;
  updated_at: string | null;
};

const DEFAULT_NFL_PICKEM_SCORING_MODE: NFLPickEmScoringMode = "standard";

const normalizeMode = (value: string | null | undefined): NFLPickEmScoringMode =>
  value === "spread" ? "spread" : DEFAULT_NFL_PICKEM_SCORING_MODE;

const mapSettingsRow = (
  venueId: string,
  row: VenueGameSettingsRow | null | undefined
): VenueGameSettings => ({
  venueId,
  nflPickEmScoringMode: normalizeMode(row?.nfl_pickem_scoring_mode),
  createdAt: row?.created_at ?? null,
  updatedAt: row?.updated_at ?? null,
});

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
  const { data, error } = await admin
    .from("venue_game_settings")
    .select("venue_id, nfl_pickem_scoring_mode, created_at, updated_at")
    .eq("venue_id", normalizedVenueId)
    .maybeSingle<VenueGameSettingsRow>();

  if (error) {
    throw new Error(error.message ?? "Failed to load venue game settings.");
  }

  return mapSettingsRow(normalizedVenueId, data);
}

export async function getVenueNFLPickEmScoringMode(venueId: string): Promise<NFLPickEmScoringMode> {
  const settings = await getVenueGameSettings(venueId);
  return settings.nflPickEmScoringMode;
}

export async function setVenueNFLPickEmScoringMode(
  venueId: string,
  mode: NFLPickEmScoringMode
): Promise<VenueGameSettings> {
  const normalizedVenueId = venueId.trim();
  if (!normalizedVenueId) {
    throw new Error("venueId is required.");
  }
  if (mode !== "standard" && mode !== "spread") {
    throw new Error("Invalid NFL Pick 'Em scoring mode.");
  }

  const admin = requireSupabaseAdmin();
  const { data, error } = await admin
    .from("venue_game_settings")
    .upsert(
      {
        venue_id: normalizedVenueId,
        nfl_pickem_scoring_mode: mode,
      },
      { onConflict: "venue_id" }
    )
    .select("venue_id, nfl_pickem_scoring_mode, created_at, updated_at")
    .single<VenueGameSettingsRow>();

  if (error) {
    throw new Error(error.message ?? "Failed to save venue game settings.");
  }

  return mapSettingsRow(normalizedVenueId, data);
}

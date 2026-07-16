import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import letterIndexData from "@/data/category-blitz/category-letter-index.json";
import { isContinuousDefaultEnabled } from "@/lib/categoryBlitzShared";
import type { CategoryBlitzMode } from "@/types";

const LETTER_CATEGORIES: Record<string, string[]> = letterIndexData.letters;
const USABLE_LETTERS: string[] = letterIndexData.usableLetters;
const B_LETTER_CATEGORIES: Record<string, string[]> = letterIndexData.bLetters;
const B_USABLE_LETTERS: string[] = letterIndexData.bUsableLetters;
const ROUND_CATEGORY_COUNT = letterIndexData.setSize;

// In-memory cache of shuffled pools per venue
// Key: venueId, Value: shuffled categories for each letter
const venuePools: Map<string, Map<string, string[]>> = new Map();

// Track which categories have been used (for non-repeating behavior within a session)
const usedCategories: Map<string, Set<string>> = new Map();

function assertAdmin() {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
}

/**
 * Shared shape for a resolved continuous config, whether it came from a
 * per-venue override row or the global default.
 */
export type ResolvedContinuousConfig = {
  isActive: boolean;
  roundDurationSeconds: number;
  intermissionSeconds: number;
  modeSelection: "random" | "weighted_standard" | "weighted_reverse";
  categoryPool: string[];
  minCategoriesPerLetter: number;
};

// --- Global default continuous config ---------------------------------------
// When continuous mode is the universal default (flag on) a venue with NO
// override row runs on these values. They mirror the DB column defaults so a
// defaulted venue behaves identically to one that saved a fresh config with no
// customization. An empty `categoryPool` means "all categories".
export const CONTINUOUS_DEFAULT_ROUND_DURATION_SECONDS = 180;
export const CONTINUOUS_DEFAULT_INTERMISSION_SECONDS = 300;
export const CONTINUOUS_DEFAULT_MODE_SELECTION: "random" = "random";
export const CONTINUOUS_DEFAULT_MIN_CATEGORIES_PER_LETTER = 12;

/** The global default continuous config (no per-venue override present). */
function defaultContinuousConfig(): ResolvedContinuousConfig {
  return {
    isActive: true,
    roundDurationSeconds: CONTINUOUS_DEFAULT_ROUND_DURATION_SECONDS,
    intermissionSeconds: CONTINUOUS_DEFAULT_INTERMISSION_SECONDS,
    modeSelection: CONTINUOUS_DEFAULT_MODE_SELECTION,
    categoryPool: [],
    minCategoriesPerLetter: CONTINUOUS_DEFAULT_MIN_CATEGORIES_PER_LETTER,
  };
}

/**
 * Resolve the effective continuous config for a venue.
 *
 * Precedence:
 *  - A per-venue override row with `is_active = true` → that override wins
 *    (custom pacing / pool).
 *  - A per-venue override row with `is_active = false` → an explicit opt-out;
 *    continuous mode is OFF for this venue (falls back to scheduled).
 *  - No row → continuous runs on the global default WHEN the rollout flag is
 *    on; otherwise null (legacy behavior: scheduled).
 *
 * Returns null whenever continuous mode should not run, so callers keep their
 * existing "null ⇒ scheduled path" branch unchanged.
 */
export async function resolveContinuousConfig(
  venueId: string,
): Promise<ResolvedContinuousConfig | null> {
  assertAdmin();

  const { data, error } = await supabaseAdmin!
    .from("category_blitz_continuous_config")
    .select("is_active, round_duration_seconds, intermission_seconds, mode_selection, category_pool, min_categories_per_letter")
    .eq("venue_id", venueId)
    .maybeSingle<{
      is_active: boolean;
      round_duration_seconds: number;
      intermission_seconds: number;
      mode_selection: string;
      category_pool: string[];
      min_categories_per_letter: number;
    }>();

  // Fail safe: on a read error, fall back to scheduled rather than assuming a
  // default. Never run continuous mode on uncertain state.
  if (error) return null;

  if (data) {
    // A row is an explicit per-venue override. is_active=false is a deliberate
    // opt-out and must not be overridden by the global default.
    if (!data.is_active) return null;
    return {
      isActive: true,
      roundDurationSeconds: data.round_duration_seconds,
      intermissionSeconds: data.intermission_seconds,
      modeSelection: data.mode_selection as ResolvedContinuousConfig["modeSelection"],
      categoryPool: data.category_pool ?? [],
      minCategoriesPerLetter: data.min_categories_per_letter,
    };
  }

  // No override row: continuous is the default only when the rollout flag is on.
  if (!isContinuousDefaultEnabled()) return null;
  return defaultContinuousConfig();
}

/** Fisher–Yates shuffle returning a new array. */
function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Get the continuous config for a venue.
 * Returns null if continuous mode is not configured or not active.
 */
export async function getContinuousConfig(venueId: string): Promise<{
  isActive: boolean;
  roundDurationSeconds: number;
  intermissionSeconds: number;
  modeSelection: "random" | "weighted_standard" | "weighted_reverse";
  categoryPool: string[];
  minCategoriesPerLetter: number;
} | null> {
  assertAdmin();
  
  const { data, error } = await supabaseAdmin!
    .from("category_blitz_continuous_config")
    .select("is_active, round_duration_seconds, intermission_seconds, mode_selection, category_pool, min_categories_per_letter")
    .eq("venue_id", venueId)
    .maybeSingle<{
      is_active: boolean;
      round_duration_seconds: number;
      intermission_seconds: number;
      mode_selection: string;
      category_pool: string[];
      min_categories_per_letter: number;
    }>();
  
  if (error || !data || !data.is_active) return null;
  
  return {
    isActive: data.is_active,
    roundDurationSeconds: data.round_duration_seconds,
    intermissionSeconds: data.intermission_seconds,
    modeSelection: data.mode_selection as "random" | "weighted_standard" | "weighted_reverse",
    categoryPool: data.category_pool ?? [],
    minCategoriesPerLetter: data.min_categories_per_letter,
  };
}

/**
 * Check if a venue has continuous mode enabled.
 */
export async function isContinuousModeEnabled(venueId: string): Promise<boolean> {
  const config = await getContinuousConfig(venueId);
  return config?.isActive ?? false;
}

/**
 * Validate that the category pool has sufficient coverage for all usable letters.
 * Returns an object with validity status and any coverage gaps.
 */
export function validateCategoryPool(
  pool: string[],
  minPerLetter: number = 12
): {
  valid: boolean;
  gaps: { letter: string; available: number; required: number }[];
  coverage: { letter: string; count: number }[];
} {
  const effectivePool = pool.length > 0 ? pool : null;
  const gaps: { letter: string; available: number; required: number }[] = [];
  const coverage: { letter: string; count: number }[] = [];
  
  for (const letter of USABLE_LETTERS) {
    const letterPool = LETTER_CATEGORIES[letter] ?? [];
    const availableCategories = effectivePool
      ? letterPool.filter((cat) => effectivePool.includes(cat))
      : letterPool;
    
    coverage.push({ letter, count: availableCategories.length });
    
    if (availableCategories.length < minPerLetter) {
      gaps.push({
        letter,
        available: availableCategories.length,
        required: minPerLetter,
      });
    }
  }
  
  return {
    valid: gaps.length === 0,
    gaps,
    coverage,
  };
}

/**
 * Get all available categories from the letter index.
 * Returns deduplicated list of all categories across all letters.
 */
export function getAllAvailableCategories(): string[] {
  const allCategories = new Set<string>();
  
  for (const letter of USABLE_LETTERS) {
    const categories = LETTER_CATEGORIES[letter] ?? [];
    for (const cat of categories) {
      allCategories.add(cat);
    }
  }
  
  return Array.from(allCategories).sort();
}

/**
 * Initialize or reset the shuffled pool for a venue.
 * This creates fresh shuffled queues for each letter.
 */
export function initializeVenuePool(venueId: string, categoryPool: string[] = []): void {
  const pool = new Map<string, string[]>();
  const effectivePool = categoryPool.length > 0 ? categoryPool : null;
  
  for (const letter of USABLE_LETTERS) {
    const letterPool = LETTER_CATEGORIES[letter] ?? [];
    const availableCategories = effectivePool
      ? letterPool.filter((cat) => effectivePool.includes(cat))
      : letterPool;
    
    if (availableCategories.length >= ROUND_CATEGORY_COUNT) {
      pool.set(letter, shuffle(availableCategories));
    }
  }
  
  venuePools.set(venueId, pool);
  usedCategories.set(venueId, new Set());
}

/**
 * Clear the pool for a venue (e.g., when config changes).
 */
export function clearVenuePool(venueId: string): void {
  venuePools.delete(venueId);
  usedCategories.delete(venueId);
}

/**
 * Pick a random letter from usable letters.
 * Unlike the scheduled mode, this does NOT avoid repeats - pure random.
 */
export function pickRandomLetter(): string {
  return USABLE_LETTERS[Math.floor(Math.random() * USABLE_LETTERS.length)];
}

/**
 * Pick a random mode based on the mode selection strategy.
 */
export function pickRandomMode(
  selection: "random" | "weighted_standard" | "weighted_reverse"
): CategoryBlitzMode {
  const rand = Math.random();
  
  switch (selection) {
    case "weighted_standard":
      return rand < 0.75 ? "standard" : "reverse";
    case "weighted_reverse":
      return rand < 0.25 ? "standard" : "reverse";
    case "random":
    default:
      return rand < 0.5 ? "standard" : "reverse";
  }
}

/**
 * Assemble a board for a letter from the venue's shuffled pool.
 * Returns ROUND_CATEGORY_COUNT categories randomly selected.
 * 
 * Unlike scheduled mode, this:
 * - Uses pure random selection (no avoidance of recently used categories)
 * - Refills the pool automatically when exhausted
 */
export function assembleBoardFromPool(
  venueId: string,
  letter: string,
  categoryPool: string[] = []
): string[] {
  // Initialize pool if needed
  if (!venuePools.has(venueId)) {
    initializeVenuePool(venueId, categoryPool);
  }
  
  const pool = venuePools.get(venueId);
  if (!pool) return [];
  
  const effectivePool = categoryPool.length > 0 ? categoryPool : null;
  const letterPool = LETTER_CATEGORIES[letter] ?? [];
  const availableCategories = effectivePool
    ? letterPool.filter((cat) => effectivePool.includes(cat))
    : letterPool;
  
  if (availableCategories.length < ROUND_CATEGORY_COUNT) {
    return [];
  }
  
  // Pure random selection - shuffle and take
  return shuffle(availableCategories).slice(0, ROUND_CATEGORY_COUNT);
}

/**
 * Simplified board assembly for continuous mode.
 * No tracking of used letters or categories - pure random every time.
 */
export function assembleRandomBoard(
  letter: string,
  categoryPool: string[] = []
): string[] {
  const effectivePool = categoryPool.length > 0 ? categoryPool : null;
  const letterPool = LETTER_CATEGORIES[letter] ?? [];
  const availableCategories = effectivePool
    ? letterPool.filter((cat) => effectivePool.includes(cat))
    : letterPool;
  
  if (availableCategories.length < ROUND_CATEGORY_COUNT) {
    return [];
  }
  
  return shuffle(availableCategories).slice(0, ROUND_CATEGORY_COUNT);
}

/**
 * Get categories for a specific letter from the pool.
 * Filters by the venue's configured pool if one exists.
 */
export function getCategoriesForLetter(
  letter: string,
  categoryPool: string[] = []
): string[] {
  const effectivePool = categoryPool.length > 0 ? categoryPool : null;
  const letterPool = LETTER_CATEGORIES[letter] ?? [];
  
  return effectivePool
    ? letterPool.filter((cat) => effectivePool.includes(cat))
    : letterPool;
}

/**
 * Create or update the continuous config for a venue.
 */
export async function setContinuousConfig(
  venueId: string,
  config: {
    isActive: boolean;
    roundDurationSeconds?: number;
    intermissionSeconds?: number;
    modeSelection?: "random" | "weighted_standard" | "weighted_reverse";
    categoryPool?: string[];
    minCategoriesPerLetter?: number;
  }
): Promise<void> {
  assertAdmin();
  
  // Validate the pool if provided
  if (config.categoryPool && config.categoryPool.length > 0) {
    const validation = validateCategoryPool(
      config.categoryPool,
      config.minCategoriesPerLetter ?? 12
    );
    if (!validation.valid) {
      const gapInfo = validation.gaps
        .map((g) => `${g.letter} (${g.available}/${g.required})`)
        .join(", ");
      throw new Error(`Insufficient category coverage: ${gapInfo}`);
    }
  }
  
  await supabaseAdmin!
    .from("category_blitz_continuous_config")
    .upsert({
      venue_id: venueId,
      is_active: config.isActive,
      round_duration_seconds: config.roundDurationSeconds ?? 180,
      intermission_seconds: config.intermissionSeconds ?? 300,
      mode_selection: config.modeSelection ?? "random",
      category_pool: config.categoryPool ?? [],
      min_categories_per_letter: config.minCategoriesPerLetter ?? 12,
    }, {
      onConflict: "venue_id",
    });
  
  // Clear the pool cache when config changes
  clearVenuePool(venueId);
}

/**
 * Add categories to a venue's pool.
 */
export async function addCategoriesToPool(
  venueId: string,
  categories: string[]
): Promise<void> {
  assertAdmin();
  
  const { data } = await supabaseAdmin!
    .from("category_blitz_continuous_config")
    .select("category_pool")
    .eq("venue_id", venueId)
    .maybeSingle<{ category_pool: string[] }>();
  
  const currentPool = data?.category_pool ?? [];
  const newPool = Array.from(new Set([...currentPool, ...categories]));
  
  await supabaseAdmin!
    .from("category_blitz_continuous_config")
    .update({ category_pool: newPool })
    .eq("venue_id", venueId);
  
  clearVenuePool(venueId);
}

/**
 * Remove categories from a venue's pool.
 */
export async function removeCategoriesFromPool(
  venueId: string,
  categories: string[]
): Promise<void> {
  assertAdmin();
  
  const { data } = await supabaseAdmin!
    .from("category_blitz_continuous_config")
    .select("category_pool")
    .eq("venue_id", venueId)
    .maybeSingle<{ category_pool: string[] }>();
  
  const currentPool = data?.category_pool ?? [];
  const newPool = currentPool.filter((cat) => !categories.includes(cat));
  
  await supabaseAdmin!
    .from("category_blitz_continuous_config")
    .update({ category_pool: newPool })
    .eq("venue_id", venueId);
  
  clearVenuePool(venueId);
}

/**
 * Get the complete pool state for a venue.
 * Useful for admin UI to show current coverage.
 */
export async function getVenuePoolState(venueId: string): Promise<{
  config: {
    isActive: boolean;
    roundDurationSeconds: number;
    intermissionSeconds: number;
    modeSelection: string;
    minCategoriesPerLetter: number;
  } | null;
  coverage: { letter: string; count: number; categories: string[] }[];
  isValid: boolean;
}> {
  const config = await getContinuousConfig(venueId);
  
  if (!config) {
    return {
      config: null,
      coverage: [],
      isValid: false,
    };
  }
  
  const validation = validateCategoryPool(
    config.categoryPool,
    config.minCategoriesPerLetter
  );
  
  const coverage = validation.coverage.map((c) => ({
    letter: c.letter,
    count: c.count,
    categories: getCategoriesForLetter(c.letter, config.categoryPool),
  }));
  
  return {
    config: {
      isActive: config.isActive,
      roundDurationSeconds: config.roundDurationSeconds,
      intermissionSeconds: config.intermissionSeconds,
      modeSelection: config.modeSelection,
      minCategoriesPerLetter: config.minCategoriesPerLetter,
    },
    coverage,
    isValid: validation.valid,
  };
}

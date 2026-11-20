import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GATED_TRIVIA_CATEGORIES } from "@/lib/triviaCategories";

// D11 (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a): a gated Speed category (Current Events) stays hidden
// until the nightly marks it visible in speed_trivia_category_flags. One tiny read, cached per server instance, so
// there is no count query per player. Fails closed: if the flag can't be read, the category stays hidden.

const TTL_MS = 5 * 60_000;
// A failed read is cached too (7i, R2 #20.8): Current Events stays hidden, and a database blip isn't retried per request.
const FAILED_TTL_MS = 60_000;
let cache: { at: number; ttl: number; hidden: ReadonlySet<string> } | null = null;

const ALL_GATED: ReadonlySet<string> = new Set(GATED_TRIVIA_CATEGORIES);

export const getHiddenSpeedCategories = async (now = Date.now()): Promise<ReadonlySet<string>> => {
  if (!GATED_TRIVIA_CATEGORIES.length) return new Set();
  if (cache && now - cache.at < cache.ttl) return cache.hidden;
  if (!supabaseAdmin) return ALL_GATED;
  const { data, error } = await supabaseAdmin
    .from("speed_trivia_category_flags")
    .select("category, visible")
    .in("category", [...GATED_TRIVIA_CATEGORIES]);
  if (error || !data) {
    cache = { at: now, ttl: FAILED_TTL_MS, hidden: ALL_GATED };
    return ALL_GATED;
  }
  const visible = new Set(
    (data as { category: string; visible: boolean }[]).filter((row) => row.visible === true).map((row) => row.category),
  );
  const hidden: ReadonlySet<string> = new Set(GATED_TRIVIA_CATEGORIES.filter((category) => !visible.has(category)));
  cache = { at: now, ttl: TTL_MS, hidden };
  return hidden;
};

/** Tests only. */
export const resetHiddenSpeedCategoriesCache = () => {
  cache = null;
};

import "server-only";
import draftMap from "@/data/question-variety/draft-map.json";
import { CURRENT_EVENTS, CURRENT_EVENTS_ERA, eraSetFor, isGame, validateNewArea, writingMonths } from "@/lib/question-variety/map.cjs";
import type { DraftMap } from "@/lib/question-variety/map.cjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TRIVIA_CATEGORIES } from "@/lib/triviaCategories";
import type { VarietyArea, VarietyCategories, VarietyGame, VarietyReport } from "@/types/questionVariety";

// Admin -> Trivia Questions -> Variety (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a, D14).
// One bounded RPC per page view; adding or switching an area is one small write. Free.

const DRAFT = draftMap as DraftMap;

export class VarietyError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

const admin = () => {
  if (!supabaseAdmin) throw new VarietyError("unavailable", "Supabase admin client is not configured.", 500);
  return supabaseAdmin;
};

export const VARIETY_CATEGORIES: VarietyCategories = {
  speed: TRIVIA_CATEGORIES.map((category) => category.dbValue),
  live: Object.keys(DRAFT.games.live ?? {}),
};

export const parseVarietyGame = (value: unknown): VarietyGame | null => (isGame(value) ? value : null);

export const parseVarietyCategory = (game: VarietyGame, value: unknown): string | null =>
  typeof value === "string" && VARIETY_CATEGORIES[game].includes(value) ? value : null;

/** The eras a category's areas may use. Current Events areas hold one rolling era; tags use months. */
export const eraSetForCategory = (game: VarietyGame, category: string): string[] =>
  eraSetFor(DRAFT, game, category) ?? (category === CURRENT_EVENTS ? [CURRENT_EVENTS_ERA] : [...DRAFT.eraSets.timeless]);

/** Columns shown for a category: its eras, or for Current Events the months writers can use today. */
export const columnsFor = (category: string, eraSet: string[], today = new Date()): string[] =>
  category === CURRENT_EVENTS ? writingMonths(today).slice().reverse() : eraSet;

type ReportRow = Omit<VarietyReport, "game" | "category" | "eraSet">;

export const readVarietyReport = async (game: VarietyGame, category: string): Promise<VarietyReport> => {
  const { data, error } = await admin().rpc("question_variety_report", { p_game: game, p_category: category });
  if (error || !data) throw new VarietyError("unavailable", "Variety is unavailable. Try again.", 503);
  const row = data as ReportRow;
  return {
    game,
    category,
    eraSet: eraSetForCategory(game, category),
    areas: (row.areas ?? []) as VarietyArea[],
    tagged: row.tagged ?? 0,
    unmapped: row.unmapped ?? 0,
    untagged: row.untagged ?? null,
    topSubjects: row.topSubjects ?? [],
    top5Share: row.top5Share === null || row.top5Share === undefined ? null : Number(row.top5Share),
  };
};

export const addCoverageArea = async (
  input: { game: VarietyGame; category: string; name: unknown; eras: unknown; note: unknown },
  createdBy: string,
): Promise<void> => {
  const eraSet = eraSetForCategory(input.game, input.category);
  const checked = validateNewArea({ name: input.name, eras: input.eras, note: input.note }, eraSet);
  if (!checked.ok) throw new VarietyError("invalid", checked.reason === "invalid-eras" ? "Pick at least one era." : "Check the name and note.");
  const client = admin();
  const { data: last, error: readError } = await client
    .from("question_coverage_areas")
    .select("position")
    .eq("game", input.game)
    .eq("category", input.category)
    .order("position", { ascending: false })
    .limit(1);
  if (readError) throw new VarietyError("unavailable", "Couldn't save. Try again.", 503);
  const position = ((last?.[0] as { position?: number } | undefined)?.position ?? -1) + 1;
  const { error } = await client.from("question_coverage_areas").insert({
    game: input.game,
    category: input.category,
    name: checked.name,
    eras: checked.eras,
    note: checked.note,
    position,
    created_by: createdBy.slice(0, 120),
  });
  if (error?.code === "23505") throw new VarietyError("duplicate", "That area already exists.", 409);
  if (error) throw new VarietyError("unavailable", "Couldn't save. Try again.", 503);
};

export const setCoverageAreaActive = async (game: VarietyGame, id: string, active: boolean): Promise<void> => {
  const { data, error } = await admin()
    .from("question_coverage_areas")
    .update({ active })
    .eq("id", id)
    .eq("game", game)
    .select("id");
  if (error) throw new VarietyError("unavailable", "Couldn't save. Try again.", 503);
  if (!data?.length) throw new VarietyError("not_found", "Area not found.", 404);
};

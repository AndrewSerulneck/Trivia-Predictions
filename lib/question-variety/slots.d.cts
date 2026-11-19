export type SeasonalTag = { id: string; name: string; date: string };
export type VarietySlot = { category: string; areaId: string | null; area: string | null; era: string | null; count: number; deficit: number; event?: SeasonalTag };
export type VarietyCell = { areaId: string; era: string; count: number; lastWritten: string | null };
export type VarietyArea = { id: string; category: string; name: string; eras: string[]; active: boolean };
export type SubjectStat = { subjectKey: string; subject: string; categories: string[]; count: number; lastWritten: string | null };
export const ASK: Readonly<{ regular: number; currentEvents: number }>;
export const DELIVER: Readonly<{ regular: number; currentEvents: number }>;
export const LIVE_ROUND: number;
export const LIVE_ASK: number;
export const LIVE_DELIVER: Readonly<{ regular: number; currentEvents: number }>;
export function nightPlan(game: string, categories: readonly string[], today?: Date): {
  categories: string[];
  ask: { regular: number; currentEvents: number };
  deliver: Readonly<{ regular: number; currentEvents: number }>;
  deliverTotal: number;
};
export const STAR_CAP: number;
export const GAP_DAYS: number;
export function chooseSlots(input: {
  areas?: VarietyArea[];
  cells?: VarietyCell[];
  categories: string[];
  today?: Date;
  ask?: { regular: number; currentEvents: number };
  seasonal?: { id: string; name: string; date: string; category: string; area: string } | null;
}): { regular: VarietySlot[]; currentEvents: VarietySlot[]; modern: { required: number; actual: number }; seasonal: SeasonalTag | null };
export function checkStarCap(
  candidates: { subjectKey?: string | null }[],
  stats: Map<string, { count: number; lastWritten: string | null }>,
  now?: Date,
  options?: { cap?: number; gapDays?: number },
): ({ ok: true } | { ok: false; reason: "star-cap"; detail: string })[];
export function avoidList(subjects: SubjectStat[], category: string, now?: Date, options?: { cap?: number; gapDays?: number; limit?: number }): string[];
export function cellsFor(category: string, areas: VarietyArea[], stats: Map<string, VarietyCell>, today: Date): (VarietySlot & { lastWritten: string | null })[];

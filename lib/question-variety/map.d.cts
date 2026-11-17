export type VarietyGame = "speed" | "live";
export type CoverageArea = { id?: string | null; name: string; eras: string[]; active?: boolean; note?: string | null };
export type TagCheck =
  | { ok: true; areaId: string | null; area: string | null; era: string | null; subject: string; subjectKey: string }
  | { ok: false; reason: string };
export type DraftMap = {
  version: string;
  eraSets: Record<string, string[]>;
  games: Record<string, Record<string, { eraSet: string; areas: { name: string; eras?: string[]; note?: string }[] }>>;
};
export const GAMES: readonly VarietyGame[];
export const CURRENT_EVENTS: string;
export const CURRENT_EVENTS_ERA: string;
export const CURRENT_EVENTS_MONTHS: number;
export const MODERN_ERAS: ReadonlySet<string>;
export const MONTH_NAMES: readonly string[];
export const MAX_SUBJECT_CHARS: number;
export const MAX_AREA_CHARS: number;
export const MAX_NOTE_CHARS: number;
export function isGame(value: unknown): value is VarietyGame;
export function isMonthEra(era: unknown): boolean;
export function isModernEra(era: string): boolean;
export function canonicalEra(value: unknown): string;
export function areaKey(name: string): string;
export function subjectKey(subject: string): string;
export function isoDay(date: Date | string | number): string;
export function monthOf(date: Date | string | number): string;
export function addMonths(era: string, n: number): string;
export function expiresOnFor(era: string): string;
export function isExpired(era: string, today: Date | string | number): boolean;
export function writingMonths(today: Date | string | number): string[];
export function mentionsMonthYear(question: string, era: string): boolean;
export function validateTag(
  tag: { area?: string | null; era?: string | null; subject?: unknown } | null | undefined,
  options: { category: string; areas: CoverageArea[]; today?: Date; allowUnmapped?: boolean; requireActive?: boolean; forWriting?: boolean },
): TagCheck;
export function validateNewArea(
  input: { name: unknown; eras: unknown; note?: unknown },
  eraSet: readonly string[],
): { ok: true; name: string; eras: string[]; note: string | null } | { ok: false; reason: string };
export function draftAreas(draft: DraftMap): { game: VarietyGame; category: string; name: string; eras: string[]; note: string | null }[];
export function eraSetFor(draft: DraftMap, game: string, category: string): string[] | null;

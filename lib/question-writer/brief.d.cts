/** `event` (Phase 7): the seasonal event this slot is about; the prompt says so. */
export type WriterSlot = { n: number; category: string; area: string | null; era: string | null; event?: string };
/** The bar test the writer runs on a prompt's finished items in a separate ChatGPT session (D35, Phase 4d.1). */
export type WriterGradeBlock = { version: string; webSearch: boolean; fields: string[]; prompt: string; schema: object };
export type WriterPrompt = {
  kind: "regular" | "currentEvents" | "conversion";
  webSearch: boolean;
  slots: WriterSlot[];
  /** Conversion prompt only (Phase 4e): which request each numbered question belongs to. */
  conversions?: { n: number; requestId: string }[];
  prompt: string;
  schema: object;
  grade: WriterGradeBlock;
};
export type WriterBrief = {
  game: string;
  runDate: string;
  writerVersion: string;
  deliver: { regular: number; currentEvents: number };
  seasonal: { id: string; name: string; date: string } | null;
  prompts: WriterPrompt[];
};
export const WRITER_GAMES: readonly string[];
export const GAME_CATEGORIES: Readonly<Record<string, string[]>>;
export class BriefError extends Error {
  code: string;
  constructor(code: string, message: string);
}
type Client = { rpc: (...args: never[]) => unknown; from: (...args: never[]) => unknown };
export function buildBrief(input: { client: Client; game: string; today?: Date; env?: Record<string, string | undefined>; conversions?: boolean; seasonalCalendar?: import("@/lib/question-variety/calendar.cjs").Calendar }): Promise<WriterBrief>;
export function conversionsPerNight(env?: Record<string, string | undefined>): number;
export function pickExamples(
  rows: { question: string; options: string[]; correct_answer: number; category: string }[],
  today: Date,
  count?: number,
): { category: string; question: string; answer: string }[];

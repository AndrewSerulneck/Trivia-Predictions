import type { CoverageArea } from "./map.cjs";

export type TagRow = {
  game: "speed" | "live"; question_ref: string; category: string; area_id: string | null; era: string | null;
  subject: string; subject_key: string; written_at: string | null; tagged_by: string;
};
export type TagInput = { ref: string; question: string; answer: string | null; writtenAt: string | null };
export const OUTPUT_SCHEMA: Readonly<Record<string, unknown>>;
export function buildPrompt(category: string, areas: CoverageArea[], batch: { question: string; answer?: string | null }[]): string;
export function toTags(input: {
  game: "speed" | "live"; category: string; areas: CoverageArea[]; batch: TagInput[]; output: unknown; taggedBy: string; today?: Date;
}): { rows: TagRow[]; skipped: { ref: string; reason: string }[] };
export function runOpenAI(input: {
  prompt: string; model: string; apiKey: string; transport?: typeof fetch; timeoutMs?: number; maxOutputTokens?: number;
}): Promise<{ output: unknown; dollars: number; usage: { inputTokens: number; outputTokens: number; reasoningTokens: number; dollars: number }; model: string }>;
export const TAG_MODEL: string;
export const TAG_DOLLARS: number;
type TagOneInput = {
  /** A service-role Supabase client (server or scripts); only `from` is used. */
  client: { from: (table: string) => unknown } | null | undefined;
  row: { id?: unknown; question?: unknown; options?: unknown; correct_answer?: unknown; category?: unknown; question_pool?: unknown; created_at?: unknown };
  apiKey: string | undefined; transport?: typeof fetch; taggedBy?: string; timeoutMs?: number;
};
/** One waiting Speed question -> one OpenAI call -> one question_tags row. True only when a tag was written; never throws. */
export function tagOne(input: TagOneInput & { write?: true }): Promise<boolean>;
/** Phase 4c.8: the same call, returning the tag row (null on any failure) without writing it; never throws. */
export function tagOne(input: TagOneInput & { write: false }): Promise<TagRow | null>;

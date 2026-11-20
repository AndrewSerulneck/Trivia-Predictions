import type { WriterSlot } from "./brief.cjs";
export type SpeedPayload = {
  question: string;
  options: string[];
  correctIndex: number;
  category: string;
  area: string | null;
  era: string | null;
  subject: string;
  difficulty: "easy" | "medium" | "hard";
  sourceUrl: string | null;
  /** The writer's one-sentence "why it's true" note (D30), ≤ 200 characters. */
  whyTrue: string;
};
/** Live Trivia (Phase 4c): a write-in answer plus the spellings a judge accepts. */
export type LivePayload = {
  question: string;
  answer: string;
  acceptableAnswers: string[];
  answerIsPerson: boolean;
  category: string;
  area: string | null;
  era: string | null;
  subject: string;
  difficulty: "easy" | "medium" | "hard";
  sourceUrl: string | null;
  /** The writer's one-sentence "why it's true" note (D30), ≤ 200 characters. */
  whyTrue: string;
};
/** The writer's bar-test grade (D35, Phase 4d.1), checked by the site; stored as `payload.grade`. */
export type WriterGrade = {
  version: string;
  model: string;
  familiar: number;
  fun: number;
  estCorrect: number;
  flags: string[];
};
export type CandidateItem = { slot: WriterSlot; payload: (SpeedPayload | LivePayload) & { grade?: WriterGrade } };
export const SOURCES: readonly string[];
export const CATEGORIES: Readonly<Record<string, string[]>>;
export class CandidateError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number);
}
export function parsePost(body: unknown, game: string): { items: CandidateItem[]; invalid: number; graded: number };
export function batchHash(items: CandidateItem[]): string;
export function cleanModel(value: unknown): string | null;
export function receive(input: {
  client: { rpc: (...args: never[]) => unknown };
  game: string;
  source: string;
  model?: string | null;
  items: CandidateItem[];
}): Promise<{ runDate: string; received: number; idempotent: boolean }>;
/** Phase 4e (D37): one conversion as stored by live_conversion_receive. */
export type ConversionItem =
  | { requestId: string; declined: true; reason: string }
  /** Phase 7f (R2 #27.3): the rewrite failed the Live schema; the database fails the request with a reason. */
  | { requestId: string; invalid: true }
  | { requestId: string; slot: { n: number; kind: "conversion"; category: string; area: string | null; era: string | null };
      payload: LivePayload & { grade?: WriterGrade } };
export function parseConversions(body: unknown): { items: ConversionItem[]; invalid: number; graded: number };
export function receiveConversions(input: {
  client: { rpc: (...args: never[]) => unknown };
  items: ConversionItem[];
}): Promise<{ runDate: string; received: number; declined: number; failed: number; already: number }>;

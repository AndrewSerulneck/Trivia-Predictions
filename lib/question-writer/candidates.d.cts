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
export type CandidateItem = { slot: WriterSlot; payload: SpeedPayload | LivePayload };
export const SOURCES: readonly string[];
export const CATEGORIES: Readonly<Record<string, string[]>>;
export class CandidateError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number);
}
export function parsePost(body: unknown, game: string): { items: CandidateItem[]; invalid: number };
export function batchHash(items: CandidateItem[]): string;
export function cleanModel(value: unknown): string | null;
export function receive(input: {
  client: { rpc: (...args: never[]) => unknown };
  game: string;
  source: string;
  model?: string | null;
  items: CandidateItem[];
}): Promise<{ runDate: string; received: number; idempotent: boolean }>;

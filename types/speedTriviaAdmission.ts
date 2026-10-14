import type { AdmissionEvidence, SpeedCorpus, SpeedQuestion, SpeedIndex, CheckOptions } from "@/types/speedTriviaUniqueness";
export type AdmissionRow = Omit<SpeedQuestion, "question_pool" | "answer_format" | "category"> & {
  question_pool: "anytime_blitz" | "live_showdown";
  answer_format: "multiple_choice" | "write_in" | "numeric" | "true_false";
  category: string | null;
  difficulty?: string | null;
  speed_revision?: number;
  [key: string]: unknown;
};
export type AdmissionBudget = {
  signal?: AbortSignal;
  reserve: (amount: Record<string, number>) => Record<string, number>;
  settle: (reserved: Record<string, number>, actual: Record<string, number | string>) => void;
  assertTime: () => void;
  remaining: (key: string) => number;
  remainingTime: () => number;
  limit: <T>(promise: PromiseLike<T>) => Promise<T>;
  summary: () => Record<string, unknown>;
};
export type AdmissionClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
export type AdmissionSession = {
  write: (row: Record<string, unknown>, options?: { existing?: AdmissionRow | null; importMode?: boolean; approvedOnly?: boolean; generated?: boolean; restore?: boolean; undo?: { manifestHash: string } }) => Promise<{ row: AdmissionRow; idempotent: boolean; evidence?: AdmissionEvidence }>;
  leave: (patch: Record<string, unknown>, existing: AdmissionRow) => Promise<AdmissionRow>;
  refresh: () => Promise<void>;
  budget: AdmissionBudget;
  corpus: () => SpeedCorpus;
  index: () => SpeedIndex;
  client: AdmissionClient;
};
export type SessionOptions = { client: AdmissionClient; secret?: string; budget?: AdmissionBudget; judge?: CheckOptions; cache?: Map<string, unknown>; apiKey?: string; cachedIndex?: SpeedIndex | null };

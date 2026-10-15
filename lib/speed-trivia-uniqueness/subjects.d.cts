import type { SpeedQuestion } from "@/types/speedTriviaUniqueness";
import type { SubjectEvidence, SubjectProposal } from "@/types/speedTriviaVariety";
export const POLICY: string;
export const CLASSIFIER: string;
export const COOLDOWN_MS: number;
export const CONCENTRATION: number;
export function normalize(text: string): string;
export function extract(row: SpeedQuestion, options?: { proposals?: SubjectProposal[]; generated?: boolean }): SubjectEvidence;
export function evidenceFor(row: SpeedQuestion): SubjectEvidence;
export function introductionEvidence(row: SpeedQuestion, prior: SpeedQuestion | null, evidence: SubjectEvidence, now?: number): SubjectEvidence;
export function createState(rows: readonly SpeedQuestion[], now?: number): {
  records: Map<string, { row: SpeedQuestion; evidence: SubjectEvidence; keys: string[] }>;
  counters: Map<string, number>; history: Map<string, number>; invalid: Set<string>;
  coverage: Record<SubjectEvidence["coverage"], number>;
  applyDelta: (delta: { removedIds?: string[]; rows?: SpeedQuestion[] }) => void;
  check: (evidence: SubjectEvidence, used?: Set<string>, now?: number) => string | null;
};

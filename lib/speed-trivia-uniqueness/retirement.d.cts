import type { SpeedCorpus, SpeedQuestion, FactDecision } from "@/types/speedTriviaUniqueness";
export type PairEvidence = { aId: string; bId: string; aHash: string; bHash: string; result: FactDecision };
export type ReferenceCounts = Record<string, { total: number; byTable: Record<string, number> }>;
export function qualityScore(row: SpeedQuestion): number;
export function rankKeepers(a: SpeedQuestion, b: SpeedQuestion, references: ReferenceCounts): number;
export function createRetirementManifest(args: { corpus: SpeedCorpus; comparisons: PairEvidence[]; references?: ReferenceCounts; referenceEvidence?: unknown; modelVersion: string; coverage?: unknown }): { version: string; mode: string; applyReady: boolean; retirements: { id: string; keeperId: string; oldContentHash: string; changedFields: string[] }[]; unresolved: { reason: string }[]; summary: Record<string, number> };

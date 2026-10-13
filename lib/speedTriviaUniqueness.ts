import "server-only";
import * as comparison from "@/lib/speed-trivia-uniqueness/core.cjs";
import type { AdmissionEvidence, CheckOptions, CorpusReader, SpeedCorpus, SpeedQuestion } from "@/types/speedTriviaUniqueness";

// Comparison-only adapter. Writers must use lib/speedTriviaAdmission.ts;
// a unique comparison result alone is not database write authorization.
export const loadSpeedTriviaCorpus = (reader: CorpusReader): Promise<SpeedCorpus> => comparison.loadCorpus(reader);
export const createSpeedTriviaChecker = (corpus: SpeedCorpus, options: CheckOptions) => {
  const index = comparison.buildIndex(corpus);
  return {
    corpusRevision: corpus.revision,
    check: (candidate: SpeedQuestion, overrides: Pick<CheckOptions, "excludeId" | "expectedRevision"> = {}): Promise<AdmissionEvidence> => comparison.checkCandidate(index, candidate, { ...options, ...overrides }),
    checkBatch: (candidates: SpeedQuestion[]): Promise<AdmissionEvidence[]> => comparison.checkBatch(corpus, candidates, options),
  };
};
export { POLICY_VERSION as SPEED_TRIVIA_UNIQUENESS_POLICY } from "@/lib/speed-trivia-uniqueness/core.cjs";

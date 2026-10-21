import "server-only";

import { bracketResultsAdapter } from "@/lib/results/adapters/bracket";
import { liveTriviaResultsAdapter } from "@/lib/results/adapters/liveTrivia";
import { squaresResultsAdapter } from "@/lib/results/adapters/squares";
import { isResultsCompetitionId, type ResultsCompetitionId } from "@/lib/results/competitions";
import type { ResultsAdapter } from "@/lib/results/types";

// competition id → its Results adapter (docs/partner-results-page-plan.md §5a). One line per
// competition in lib/results/competitions.ts; the Record type makes a missing one a type error, and
// tests/results-registry-contract.test.ts checks the two lists agree at runtime too.

export const RESULTS_ADAPTERS: Record<ResultsCompetitionId, ResultsAdapter> = {
  live_trivia: liveTriviaResultsAdapter,
  squares: squaresResultsAdapter,
  bracket: bracketResultsAdapter,
};

/** The adapter for a competition id from a URL, or null for anything not on Results. */
export const getResultsAdapter = (competitionId: string): ResultsAdapter | null =>
  isResultsCompetitionId(competitionId) ? RESULTS_ADAPTERS[competitionId] : null;

export const listResultsAdapters = (): ResultsAdapter[] => Object.values(RESULTS_ADAPTERS);

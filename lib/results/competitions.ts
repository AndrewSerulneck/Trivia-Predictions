// The competitions that appear on the Partner Dashboard's Results page
// (docs/partner-results-page-plan.md §5a). This is the ONE list: the page reads every label, score
// unit and capability from here and never branches on a competition id.
//
// Pure and client-safe. Adding a competition = one entry here + one adapter file under
// lib/results/adapters/ + one line in lib/results/adapters/index.ts (+ its reward-placement rule in
// lib/results/rewardPlacement.ts if it has rewards). tests/results-registry-contract.test.ts fails
// when the list and the adapter map disagree.

export type ResultsCompetition = {
  /** Stable id, carried on every game row and in the game URLs. */
  id: string;
  /** What the partner reads on a game card: "Live Trivia". */
  label: string;
  /** The unit after a score: "1,240 pts". */
  scoreUnit: string;
  /** A player's per-question breakdown exists (the adapter implements getBreakdown). */
  hasBreakdown: boolean;
};

export const RESULTS_COMPETITIONS = [
  { id: "live_trivia", label: "Live Trivia", scoreUnit: "pts", hasBreakdown: true },
] as const satisfies readonly ResultsCompetition[];

export type ResultsCompetitionId = (typeof RESULTS_COMPETITIONS)[number]["id"];

export const RESULTS_COMPETITION_IDS: readonly ResultsCompetitionId[] = RESULTS_COMPETITIONS.map((competition) => competition.id);

export const isResultsCompetitionId = (value: unknown): value is ResultsCompetitionId =>
  typeof value === "string" && (RESULTS_COMPETITION_IDS as readonly string[]).includes(value);

/** The registry entry for `id`, or null for anything not on Results. */
export const getResultsCompetition = (id: string): ResultsCompetition | null =>
  RESULTS_COMPETITIONS.find((competition) => competition.id === id) ?? null;

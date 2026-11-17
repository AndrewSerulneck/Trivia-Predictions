// Admin -> Trivia Questions -> Variety (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a).

export type VarietyGame = "speed" | "live";

export type VarietyArea = {
  id: string;
  name: string;
  eras: string[];
  note: string | null;
  active: boolean;
  /** Question count per era (active + waiting for Speed). Missing era = 0. */
  counts: Record<string, number>;
};

export type VarietyReport = {
  game: VarietyGame;
  category: string;
  /** Eras offered when adding an area to this category. */
  eraSet: string[];
  areas: VarietyArea[];
  tagged: number;
  unmapped: number;
  /** Speed only: waiting or active questions in this category with no tag yet. */
  untagged: number | null;
  topSubjects: { subject: string; count: number }[];
  /** Share of tagged questions on the category's top 5 subjects (0-1); null when nothing is tagged. */
  top5Share: number | null;
};

export type VarietyCategories = Record<VarietyGame, string[]>;

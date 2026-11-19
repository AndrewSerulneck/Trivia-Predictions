/**
 * Speed -> Live conversions (docs/speed-trivia-backlog-and-quality-plan.md Phase 4e, D37): what the question list
 * shows for one Speed question. `none`: never queued, cancelled, or its Live version was rejected in review.
 */
export type LiveConversionState =
  | { state: "none" }
  | { state: "queued" }
  | { state: "converting" }
  | { state: "in_review" }
  | { state: "kept" }
  | { state: "in_live" }
  | { state: "not_convertible"; reason: string };

export type LiveConversionStatusMap = Record<string, LiveConversionState>;

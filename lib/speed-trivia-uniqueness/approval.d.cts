import type { SpeedIndex } from "@/types/speedTriviaUniqueness";
export function approvedIndex(index: SpeedIndex): SpeedIndex;
/** D5: `released` maps a row id to the revision it was released at. */
export function releasedIndex(index: SpeedIndex, released: ReadonlyMap<string, number> | null): SpeedIndex;

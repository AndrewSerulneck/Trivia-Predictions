import type { SpeedIndex } from "@/types/speedTriviaUniqueness";
export function approvedIndex(index: SpeedIndex): SpeedIndex;
export function releasedIndex(index: SpeedIndex, releasedIds: ReadonlySet<string> | null): SpeedIndex;

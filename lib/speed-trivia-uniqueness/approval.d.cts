import type { SpeedIndex } from "@/types/speedTriviaUniqueness";
export function approvedIndex(index: SpeedIndex): SpeedIndex;
/** D38 + D45: live questions plus reserved previous facts (`history:` rows); cached and refreshed. */
export function liveEditIndex(index: SpeedIndex): SpeedIndex;
/** The `history:<rowId>:<revision>` ids in `view`. */
export function historyOf(view: SpeedIndex, rowId: string): Set<string>;
/** `view` minus `ids`, filtered lazily at retrieval (never cached). Only lookups by key are supported on its maps. */
export function without(view: SpeedIndex, ids: Iterable<string>): SpeedIndex;
/** D5: `released` maps a row id to the revision it was released at. */
export function releasedIndex(index: SpeedIndex, released: ReadonlyMap<string, number> | null): SpeedIndex;

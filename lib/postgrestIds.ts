// PostgREST sends `.in("id", ids)` as a URL query string, and a long URL is refused (or silently
// cut) somewhere past ≈ 150 UUIDs. Any write or read filtered by a list of ids goes through
// chunkIds() so no single request carries more than POSTGREST_ID_CHUNK of them
// (docs/squares-and-brackets-plan.md §13 F2).

export const POSTGREST_ID_CHUNK = 150;

/** `ids` split into lists of at most `size` (default POSTGREST_ID_CHUNK), in order. */
export const chunkIds = <T>(ids: readonly T[], size: number = POSTGREST_ID_CHUNK): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
};

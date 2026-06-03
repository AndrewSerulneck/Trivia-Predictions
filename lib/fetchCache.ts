/**
 * Lightweight in-memory fetch cache with request deduplication and TTL.
 *
 * - **Deduplication**: multiple concurrent calls with the same key share one in-flight promise.
 * - **TTL**: cached responses expire after `ttlMs` (default 4 seconds).
 * - **Manual eviction**: call `clearCacheEntry(key)` or `clearAllCache()` when needed
 *   (e.g. after a user claims points so the next read is fresh).
 *
 * Usage:
 * ```ts
 * const data = await cachedFetch(
 *   "summary:user-id-venue-id",
 *   () => fetch(`/api/users/summary?userId=...&venueId=...`).then(r => r.json()),
 *   4_000
 * );
 * ```
 */
const inflightMap = new Map<string, Promise<unknown>>();
const cacheMap = new Map<string, { data: unknown; expiresAt: number }>();

export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 4_000
): Promise<T> {
  // 1. Check hard cache (fulfilled responses within TTL)
  const cached = cacheMap.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data as T;
  }

  // 2. Check in-flight deduplication (same key currently being fetched)
  const inflight = inflightMap.get(key);
  if (inflight) {
    return inflight as Promise<T>;
  }

  // 3. Fire the actual request and store the promise
  const promise = fetcher()
    .then((data) => {
      // Store successful response in cache
      cacheMap.set(key, { data, expiresAt: Date.now() + ttlMs });
      return data;
    })
    .catch((error) => {
      // On error, remove from cache if stale so a retry can happen
      cacheMap.delete(key);
      throw error;
    })
    .finally(() => {
      // Remove from in-flight map *after* the promise settles
      inflightMap.delete(key);
    });

  inflightMap.set(key, promise);
  return promise;
}

/** Remove a single cache entry (both in-flight and hard cache). */
export function clearCacheEntry(key: string): void {
  cacheMap.delete(key);
  inflightMap.delete(key);
}

/** Remove all cached entries (useful on sign-out or venue change). */
export function clearAllCache(): void {
  cacheMap.clear();
  inflightMap.clear();
}

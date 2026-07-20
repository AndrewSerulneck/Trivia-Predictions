/**
 * FNV-1a 32-bit hash. Deterministic, non-cryptographic — used for stable
 * pseudo-random selection (seeded copy variety, seeded sort order) and for
 * building short opaque ids (e.g. realtime channel names) from a longer
 * string. Never use for anything security-sensitive.
 */
export function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5; // 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // 16777619
  }
  return hash >>> 0;
}

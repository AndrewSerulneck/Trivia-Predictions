import "server-only";

// Shared balldontlie HTTP client. Extracted verbatim out of lib/sportsBingo.ts in Phase 2 of
// docs/prop-bingo-nfl-plan.md so lib/sportsBingoOdds.ts can reuse it without importing
// lib/sportsBingo.ts (which imports the odds module — that would be a cycle).
//
// Behavior is deliberately unchanged from the original: a network error or a non-2xx response
// logs and resolves to `{}` rather than throwing, so one bad provider minute degrades a board to
// "no candidates" instead of surfacing a 500 to a player mid-game.

const BALLDONTLIE_API_BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const BALLDONTLIE_API_KEY = process.env.BALLDONTLIE_API_KEY?.trim() ?? "";

const DEFAULT_MAX_PAGES = 12;

export type BallDontLieListResponse<T> = {
  data?: T[];
  meta?: {
    next_cursor?: number | null;
  };
};

export function isBallDontLieConfigured(): boolean {
  return Boolean(BALLDONTLIE_API_KEY);
}

/**
 * A box a caller passes in to learn that a request *failed* rather than legitimately came back
 * empty. Both failure modes below resolve to `{}` — that degradation is deliberate and unchanged —
 * but "the provider said this league has no games" and "the provider was down" must not be cached
 * for the same length of time. Callers that cache their result read this and give a failure a short
 * negative TTL instead. See docs/prop-bingo-code-review-fix-plan.md, Phase 5.
 */
export type BallDontLieFailureBox = { failed: boolean };

export async function fetchBallDontLieJson(
  path: string,
  query: URLSearchParams,
  options?: { failure?: BallDontLieFailureBox }
): Promise<unknown> {
  const isTestEnv = process.env.NODE_ENV === "test";
  if (!isBallDontLieConfigured() && !isTestEnv) {
    throw new Error("BALLDONTLIE_API_KEY is not configured.");
  }

  let response: Response;
  try {
    response = await fetch(`${BALLDONTLIE_API_BASE_URL}${path}?${query.toString()}`, {
      method: "GET",
      headers: BALLDONTLIE_API_KEY
        ? {
            Authorization: BALLDONTLIE_API_KEY,
          }
        : undefined,
      next: { revalidate: 15 },
    });
  } catch (fetchError) {
    console.error(`[BallDontLie] Network error fetching ${path}:`, fetchError);
    if (options?.failure) {
      options.failure.failed = true;
    }
    return {};
  }

  if (!response.ok) {
    console.error(`[BallDontLie] Request failed (${response.status}) for ${path}. Returning empty result.`);
    if (options?.failure) {
      options.failure.failed = true;
    }
    return {};
  }

  return response.json();
}

/**
 * Cursor-paginate a balldontlie list endpoint.
 *
 * `maxPages` caps the walk so a malformed or unexpectedly huge response can't loop unbounded
 * against a paid provider API on a hot read path. Pass `truncation` when the caller needs to know
 * it hit that cap (the odds feed fans out one row per game *per sportsbook*, so it is the one
 * endpoint here that realistically can).
 *
 * Pass `failure` when the caller caches the result: it is set when any page of the walk failed, so
 * "provider said empty" can be told apart from "provider was down" (see {@link BallDontLieFailureBox}).
 */
export async function fetchBallDontLieList<T>(
  path: string,
  baseQuery: URLSearchParams,
  options?: { maxPages?: number; truncation?: { truncated: boolean }; failure?: BallDontLieFailureBox }
): Promise<T[]> {
  const maxPages = Math.max(1, options?.maxPages ?? DEFAULT_MAX_PAGES);
  const allRows: T[] = [];
  let cursor: number | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams(baseQuery.toString());
    if (cursor !== null) {
      query.set("cursor", String(cursor));
    }

    const payload = (await fetchBallDontLieJson(path, query, {
      failure: options?.failure,
    })) as BallDontLieListResponse<T>;
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    allRows.push(...rows);

    const nextCursor = payload?.meta?.next_cursor;
    if (typeof nextCursor !== "number") {
      return allRows;
    }
    cursor = nextCursor;
  }

  if (options?.truncation) {
    options.truncation.truncated = true;
  }
  return allRows;
}

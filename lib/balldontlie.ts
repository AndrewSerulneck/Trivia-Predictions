import "server-only";

const BALLDONTLIE_API_BASE_URL = process.env.BALLDONTLIE_API_BASE_URL?.trim() ?? "https://api.balldontlie.io";
const BALLDONTLIE_API_KEY = process.env.BALLDONTLIE_API_KEY?.trim() ?? "";

export type BallDontLieListResponse<T> = {
  data?: T[];
  meta?: {
    next_cursor?: number | string | null;
    per_page?: number;
  };
};

function assertApiKey(): void {
  if (!BALLDONTLIE_API_KEY) {
    throw new Error("BALLDONTLIE_API_KEY is not configured.");
  }
}

export async function fetchBallDontLieJson(path: string, query?: URLSearchParams, revalidateSeconds = 60): Promise<unknown> {
  assertApiKey();

  const qs = query?.toString() ?? "";
  const url = qs ? `${BALLDONTLIE_API_BASE_URL}${path}?${qs}` : `${BALLDONTLIE_API_BASE_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: BALLDONTLIE_API_KEY,
      },
      next: { revalidate: revalidateSeconds },
    });
  } catch (fetchError) {
    console.error(`[BallDontLie] Network error fetching ${path}:`, fetchError);
    return {};
  }

  if (!response.ok) {
    console.error(`[BallDontLie] Request failed (${response.status}) for ${url}. Returning empty result.`);
    return {};
  }

  return response.json();
}

/**
 * `truncation`, if passed, is set to `truncated: true` when the page cap is
 * hit while the provider still had more pages to give (i.e. paging stopped
 * because of `maxPages`, not because the data ran out). Callers on a path
 * where a truncated result is a real data-loss risk (not just "fetched a
 * little less than the full catalog") should pass this and log on it rather
 * than absorb the truncation silently.
 */
export async function fetchBallDontLieList<T>(
  path: string,
  baseQuery: URLSearchParams,
  maxPages = 4,
  truncation?: { truncated: boolean }
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;

  for (let i = 0; i < maxPages; i += 1) {
    const query = new URLSearchParams(baseQuery);
    if (cursor) {
      query.set("cursor", cursor);
    }

    const payload = (await fetchBallDontLieJson(path, query)) as BallDontLieListResponse<T>;
    const data = Array.isArray(payload.data) ? payload.data : [];
    rows.push(...data);

    const nextCursorRaw = payload.meta?.next_cursor;
    if (nextCursorRaw === null || nextCursorRaw === undefined || String(nextCursorRaw).trim() === "") {
      cursor = null;
      break;
    }
    cursor = String(nextCursorRaw).trim();

    if (i === maxPages - 1 && truncation) {
      truncation.truncated = true;
    }
  }

  return rows;
}

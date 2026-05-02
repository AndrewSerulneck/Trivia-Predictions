import "server-only";

type HeaderMode = "apisports" | "rapidapi";

export type ApiSportsRequestResult = {
  ok: boolean;
  status: number;
  mode: HeaderMode;
  url: string;
  json: unknown;
  error?: string;
};

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function buildHeaders(mode: HeaderMode, apiKey: string, host: string): HeadersInit {
  if (mode === "rapidapi") {
    return {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": host,
      Accept: "application/json",
    };
  }
  return {
    "x-apisports-key": apiKey,
    Accept: "application/json",
  };
}

function parseHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "";
  }
}

function looksLikeDocumentationUrl(baseUrl: string): boolean {
  return /\/documentation\//i.test(baseUrl);
}

async function requestWithMode(
  baseUrl: string,
  pathWithQuery: string,
  apiKey: string,
  mode: HeaderMode,
  timeoutMs = 8000
): Promise<ApiSportsRequestResult> {
  const host = parseHost(baseUrl);
  const normalizedPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const url = `${normalizeBaseUrl(baseUrl)}${normalizedPath}`;
  const headers = buildHeaders(mode, apiKey, host);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 2000) };
    }
    return {
      ok: response.ok,
      status: response.status,
      mode,
      url,
      json,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      mode,
      url,
      json: null,
      error: error instanceof Error ? error.message : "Request failed.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiSportsGet(
  baseUrlRaw: string,
  pathWithQuery: string,
  apiKeyRaw: string
): Promise<ApiSportsRequestResult> {
  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  const apiKey = apiKeyRaw.trim();

  if (!baseUrl) {
    return { ok: false, status: 0, mode: "apisports", url: "", json: null, error: "Base URL is missing." };
  }
  if (!apiKey) {
    return { ok: false, status: 0, mode: "apisports", url: "", json: null, error: "API key is missing." };
  }
  if (looksLikeDocumentationUrl(baseUrl)) {
    return {
      ok: false,
      status: 0,
      mode: "apisports",
      url: baseUrl,
      json: null,
      error: "Configured base URL points to documentation, not an API host.",
    };
  }

  const firstTry = await requestWithMode(baseUrl, pathWithQuery, apiKey, "apisports");
  if (firstTry.ok) {
    return firstTry;
  }

  // If direct API-Sports auth fails, fall back to RapidAPI-style headers.
  const shouldTryRapidApi = [0, 401, 403, 404].includes(firstTry.status);
  if (!shouldTryRapidApi) {
    return firstTry;
  }

  const secondTry = await requestWithMode(baseUrl, pathWithQuery, apiKey, "rapidapi");
  if (secondTry.ok) {
    return secondTry;
  }

  // Return richer auth-context error with both attempts.
  return {
    ...secondTry,
    error: `Auth/endpoint failed with both modes. Direct: ${firstTry.status || firstTry.error}, RapidAPI: ${
      secondTry.status || secondTry.error
    }`,
  };
}


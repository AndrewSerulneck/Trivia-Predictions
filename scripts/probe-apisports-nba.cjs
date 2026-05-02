#!/usr/bin/env node

const apiKey = String(process.env.APISPORTS_API_KEY ?? "").trim();
const baseUrl = String(process.env.APISPORTS_NBA_BASE_URL ?? "").trim().replace(/\/+$/, "");

if (!apiKey || !baseUrl) {
  console.error("Missing APISPORTS_API_KEY or APISPORTS_NBA_BASE_URL.");
  process.exit(1);
}

if (/\/documentation\//i.test(baseUrl)) {
  console.error("APISPORTS_NBA_BASE_URL points to documentation, not an API host.");
  process.exit(1);
}

function utcDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

async function request(path, mode) {
  const host = parseHost(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const headers =
    mode === "rapidapi"
      ? {
          "x-rapidapi-key": apiKey,
          "x-rapidapi-host": host,
          Accept: "application/json",
        }
      : {
          "x-apisports-key": apiKey,
          Accept: "application/json",
        };

  try {
    const response = await fetch(`${baseUrl}${normalizedPath}`, {
      method: "GET",
      headers,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 1000) };
    }
    return {
      ok: response.ok,
      status: response.status,
      mode,
      path: normalizedPath,
      json,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      mode,
      path: normalizedPath,
      error: error instanceof Error ? error.message : String(error),
      json: null,
    };
  }
}

async function probe(path) {
  const first = await request(path, "apisports");
  if (first.ok) {
    return first;
  }
  if (![0, 401, 403, 404].includes(first.status)) {
    return first;
  }
  const second = await request(path, "rapidapi");
  if (second.ok) {
    return second;
  }
  return {
    ...second,
    error: `Auth/endpoint failed in both modes. Direct=${first.status || first.error}, RapidAPI=${
      second.status || second.error
    }`,
  };
}

function firstGameId(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const response = payload.response;
  if (!Array.isArray(response) || response.length === 0) {
    return "";
  }
  const first = response[0];
  const id = first?.id;
  if (typeof id === "string" || typeof id === "number") {
    return String(id).trim();
  }
  return "";
}

function listGameIds(payload, limit = 10) {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const response = payload.response;
  if (!Array.isArray(response)) {
    return [];
  }

  const ids = [];
  for (const item of response) {
    const id = item?.id;
    if (typeof id === "number" || typeof id === "string") {
      const normalized = String(id).trim();
      if (normalized) {
        ids.push(normalized);
      }
    }
    if (ids.length >= limit) {
      break;
    }
  }
  return ids;
}

function responseCount(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const response = payload.response;
  return Array.isArray(response) ? response.length : null;
}

function summarize(result) {
  const body = result?.json;
  const response = body && typeof body === "object" ? body.response : null;
  const errors = body && typeof body === "object" ? body.errors : null;
  const responseCount = Array.isArray(response) ? response.length : null;
  return {
    path: result.path,
    ok: result.ok,
    status: result.status,
    authMode: result.mode,
    responseCount,
    errors,
    error: result.error,
  };
}

function hasEndpointErrorPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const errors = payload.errors;
  if (Array.isArray(errors)) {
    return errors.length > 0;
  }
  if (!errors || typeof errors !== "object") {
    return false;
  }
  const values = Object.values(errors);
  if (values.length === 0) {
    return false;
  }
  return values.some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    const text = String(value ?? "").toLowerCase();
    return text.length > 0;
  });
}

function isUsableProbeResult(result) {
  return Boolean(result?.ok) && !hasEndpointErrorPayload(result?.json);
}

async function main() {
  const today = utcDate(0);
  const yesterday = utcDate(-1);

  const status = await probe("/status");
  const gamesToday = await probe(`/games?date=${encodeURIComponent(today)}`);
  const gamesYesterday = await probe(`/games?date=${encodeURIComponent(yesterday)}`);

  const candidateGameIds = [
    ...listGameIds(gamesYesterday.json, 8),
    ...listGameIds(gamesToday.json, 8),
  ].filter((id, index, all) => all.indexOf(id) === index);

  const fallbackGameId = firstGameId(gamesYesterday.json) || firstGameId(gamesToday.json) || "1";
  const probeIds = candidateGameIds.length > 0 ? candidateGameIds : [fallbackGameId];

  let gameId = probeIds[0] ?? fallbackGameId;
  let gameStats = null;
  let playerStats = null;
  let events = null;

  for (const candidateId of probeIds.slice(0, 2)) {
    const [nextGameStats, nextPlayerStats, nextEvents] = await Promise.all([
      probe(`/games/statistics?id=${encodeURIComponent(candidateId)}`),
      probe(`/players/statistics?game=${encodeURIComponent(candidateId)}`),
      probe(`/events?game=${encodeURIComponent(candidateId)}`),
    ]);

    gameId = candidateId;
    gameStats = nextGameStats;
    playerStats = nextPlayerStats;
    events = nextEvents;

    const hasSomePayload =
      (responseCount(nextGameStats.json) ?? 0) > 0 ||
      (responseCount(nextPlayerStats.json) ?? 0) > 0 ||
      (responseCount(nextEvents.json) ?? 0) > 0;

    if (hasSomePayload) {
      break;
    }
  }

  gameStats = gameStats ?? (await probe(`/games/statistics?id=${encodeURIComponent(gameId)}`));
  playerStats = playerStats ?? (await probe(`/players/statistics?game=${encodeURIComponent(gameId)}`));
  events = events ?? (await probe(`/events?game=${encodeURIComponent(gameId)}`));

  const canAuthenticate = Boolean(
    isUsableProbeResult(status) || isUsableProbeResult(gamesToday) || isUsableProbeResult(gamesYesterday)
  );
  const hasStats = Boolean(isUsableProbeResult(gameStats) || isUsableProbeResult(playerStats));
  const hasEvents = Boolean(isUsableProbeResult(events));

  const payload = {
    ok: true,
    config: {
      baseUrl,
      hasApiKey: Boolean(apiKey),
      discoveredGameId: gameId === "1" ? null : gameId,
      attemptedGameIds: probeIds,
      probedAtUtc: new Date().toISOString(),
    },
    capabilityAssessment: {
      canAuthenticate,
      hasStatsEndpoints: hasStats,
      hasEventsEndpoint: hasEvents,
      supportsDynamicBingoLikely: canAuthenticate && (hasStats || hasEvents),
    },
    probes: {
      status: summarize(status),
      gamesToday: summarize(gamesToday),
      gamesYesterday: summarize(gamesYesterday),
      gameStats: summarize(gameStats),
      playerStats: summarize(playerStats),
      events: summarize(events),
    },
  };

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

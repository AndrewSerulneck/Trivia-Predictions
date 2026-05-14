import "server-only";

const THESPORTSDB_API_BASE_URL = process.env.THESPORTSDB_API_BASE_URL?.trim() || "https://www.thesportsdb.com/api/v1/json";
const THESPORTSDB_API_KEY = process.env.THESPORTSDB_API_KEY?.trim() || "";
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME?.trim() || "";
const HEADSHOT_SIZE = Number.parseInt(process.env.HEADSHOT_SIZE?.trim() || "200", 10) || 200;

type TheSportsDbPlayer = {
  strPlayer?: string | null;
  strCutout?: string | null;
};

type TheSportsDbSearchPlayersResponse = {
  player?: TheSportsDbPlayer[] | null;
};

function normalizeName(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function assertApiKey(): void {
  if (!THESPORTSDB_API_KEY) {
    throw new Error("THESPORTSDB_API_KEY is not configured.");
  }
}

function toCloudinaryFetchUrl(sourceUrl: string): string {
  if (!CLOUDINARY_CLOUD_NAME) {
    return sourceUrl;
  }
  const encoded = encodeURIComponent(sourceUrl);
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/w_${HEADSHOT_SIZE},h_${HEADSHOT_SIZE},c_thumb,g_face/${encoded}`;
}

export async function fetchNBAHeadshot(playerName: string): Promise<string | null> {
  assertApiKey();

  const normalized = normalizeName(playerName);
  if (!normalized) {
    return null;
  }

  const url = new URL(`${THESPORTSDB_API_BASE_URL}/${THESPORTSDB_API_KEY}/searchplayers.php`);
  url.searchParams.set("p", normalized);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`TheSportsDB request failed (${response.status}).`);
  }

  const payload = (await response.json()) as TheSportsDbSearchPlayersResponse;
  const players = Array.isArray(payload.player) ? payload.player : [];
  if (players.length === 0) {
    return null;
  }

  const lower = normalized.toLowerCase();
  const exact = players.find((row) => normalizeName(String(row.strPlayer ?? "")).toLowerCase() === lower);
  const selected = exact ?? players[0];

  const cutout = String(selected?.strCutout ?? "").trim();
  if (!cutout) {
    return null;
  }

  return toCloudinaryFetchUrl(cutout);
}

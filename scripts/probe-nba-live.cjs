#!/usr/bin/env node

const baseUrl = String(process.env.APISPORTS_NBA_BASE_URL || 'https://v2.nba.api-sports.io').trim().replace(/\/+$/, '');
const key = String(process.env.APISPORTS_API_KEY || '').trim();
const provider = String(process.env.APISPORTS_PROVIDER || 'direct').trim().toLowerCase();
const rapidKey = String(process.env.APISPORTS_RAPIDAPI_KEY || key).trim();
const rapidHost = String(process.env.APISPORTS_NBA_RAPIDAPI_HOST || 'api-nba-v1.p.rapidapi.com').trim();

if (!key && provider !== 'rapidapi') {
  console.error('Missing APISPORTS_API_KEY');
  process.exit(1);
}

function rowsOf(json) {
  const rows = json && json.response;
  return Array.isArray(rows) ? rows : [];
}
function statusShort(g) {
  return String(g?.status?.short ?? g?.status?.long ?? g?.game?.status?.short ?? g?.fixture?.status?.short ?? '').trim();
}
function gameId(g) {
  return String(g?.id ?? g?.game?.id ?? g?.fixture?.id ?? '').trim();
}
async function hit(path) {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = { accept: 'application/json' };
  if (provider === 'rapidapi') {
    headers['x-rapidapi-key'] = rapidKey;
    headers['x-rapidapi-host'] = rapidHost;
  } else {
    headers['x-apisports-key'] = key;
  }
  const res = await fetch(url, { headers });
  const json = await res.json().catch(() => ({}));
  return { url, status: res.status, json };
}

(async () => {
  const primary = await hit('/games?live=all');
  const primaryRows = rowsOf(primary.json);
  const primaryLive = primaryRows.filter((r) => /^(Q1|Q2|Q3|Q4|OT|HT|BT|LIVE|IN PLAY)$/i.test(statusShort(r)));

  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const iso = `${yyyy}-${mm}-${dd}`;
  const fallback = await hit(`/games?date=${encodeURIComponent(iso)}`);
  const fallbackRows = rowsOf(fallback.json);
  const fallbackLive = fallbackRows.filter((r) => /^(Q1|Q2|Q3|Q4|OT|HT|BT|LIVE|IN PLAY)$/i.test(statusShort(r)));

  const sampleGame = primaryLive[0] || fallbackLive[0] || primaryRows[0] || fallbackRows[0] || null;

  console.log(JSON.stringify({
    provider,
    baseUrl,
    primary: { status: primary.status, rows: primaryRows.length, liveFiltered: primaryLive.length },
    fallbackDate: iso,
    fallback: { status: fallback.status, rows: fallbackRows.length, liveFiltered: fallbackLive.length },
    sampleGame: sampleGame ? { id: gameId(sampleGame), status: statusShort(sampleGame), keys: Object.keys(sampleGame).slice(0, 20) } : null,
  }, null, 2));

  const gid = sampleGame ? gameId(sampleGame) : '';
  if (!gid) return;
  const players = await hit(`/games/statistics/players?id=${encodeURIComponent(gid)}`);
  const playerRows = rowsOf(players.json);
  const playerKeys = playerRows[0] && typeof playerRows[0] === 'object' ? Object.keys(playerRows[0]).slice(0, 20) : [];
  console.log(JSON.stringify({
    players: { status: players.status, gameId: gid, rows: playerRows.length, firstRowKeys: playerKeys }
  }, null, 2));
})();

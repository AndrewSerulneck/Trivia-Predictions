#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const BDL_BASE = (process.env.BALLDONTLIE_API_BASE_URL || 'https://api.balldontlie.io').trim().replace(/\/+$/, '');
const BDL_KEY = (process.env.BALLDONTLIE_API_KEY || '').trim();
const TSD_BASE = (process.env.THESPORTSDB_API_BASE_URL || 'https://www.thesportsdb.com/api/v1/json').trim().replace(/\/+$/, '');
const TSD_KEY = (process.env.THESPORTSDB_API_KEY || '').trim();
const CLOUDINARY_CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const HEADSHOT_SIZE = Number.parseInt(process.env.HEADSHOT_SIZE || '200', 10) || 200;
const RATE_DELAY_MS = Number.parseInt(process.env.HEADSHOT_RATE_DELAY_MS || '450', 10) || 450;
const MAX_BACKFILL = Number.parseInt(process.env.HEADSHOT_MAX_BACKFILL || '400', 10) || 400;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
if (!BDL_KEY) {
  throw new Error('Missing BALLDONTLIE_API_KEY');
}
if (!TSD_KEY) {
  throw new Error('Missing THESPORTSDB_API_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeName(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function wrapCloudinaryFetch(url) {
  if (!url) return null;
  if (!CLOUDINARY_CLOUD_NAME) return url;
  const encoded = encodeURIComponent(url);
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/w_${HEADSHOT_SIZE},h_${HEADSHOT_SIZE},c_thumb,g_face/${encoded}`;
}

async function fetchBdlPage(cursor) {
  const url = new URL(`${BDL_BASE}/nba/v1/players`);
  url.searchParams.set('per_page', '100');
  if (cursor) url.searchParams.set('cursor', String(cursor));

  const response = await fetch(url.toString(), {
    headers: { Authorization: BDL_KEY },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`BALLDONTLIE players request failed (${response.status})`);
  }
  return response.json();
}

async function syncNbaPlayersToTable() {
  let cursor = null;
  let pages = 0;
  let upserts = 0;

  while (pages < 60) {
    const payload = await fetchBdlPage(cursor);
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    if (rows.length === 0) break;

    const toUpsert = rows
      .map((row) => {
        const first = normalizeName(row?.first_name);
        const last = normalizeName(row?.last_name);
        const name = normalizeName(`${first} ${last}`);
        const externalId = String(row?.id ?? '').trim();
        if (!name || !externalId) return null;
        return {
          external_id: externalId,
          player_name: name,
          league: 'NBA',
        };
      })
      .filter(Boolean);

    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from('players')
        .upsert(toUpsert, { onConflict: 'external_id,league', ignoreDuplicates: false });
      if (error) throw new Error(`players upsert failed: ${error.message}`);
      upserts += toUpsert.length;
    }

    const nextCursor = payload?.meta?.next_cursor;
    if (nextCursor === null || nextCursor === undefined || String(nextCursor).trim() === '') break;
    cursor = String(nextCursor).trim();
    pages += 1;
  }

  return { upserts };
}

async function fetchNBAHeadshot(playerName) {
  const name = normalizeName(playerName);
  if (!name) return null;

  const url = new URL(`${TSD_BASE}/${TSD_KEY}/searchplayers.php`);
  url.searchParams.set('p', name);

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`TheSportsDB request failed (${response.status})`);
  }

  const payload = await response.json();
  const players = Array.isArray(payload?.player) ? payload.player : [];
  if (!players.length) return null;

  const lower = name.toLowerCase();
  const exact = players.find((p) => normalizeName(p?.strPlayer).toLowerCase() === lower);
  const selected = exact || players[0];
  const cutout = normalizeName(selected?.strCutout);
  return cutout || null;
}

async function backfillHeadshots() {
  const { data, error } = await supabase
    .from('players')
    .select('id,player_name,league,headshot_url')
    .eq('league', 'NBA')
    .or('headshot_url.is.null,headshot_url.eq.')
    .order('id', { ascending: true })
    .limit(MAX_BACKFILL);

  if (error) throw new Error(`players select failed: ${error.message}`);

  const rows = Array.isArray(data) ? data : [];
  let updated = 0;
  let missing = 0;
  let failed = 0;

  for (const row of rows) {
    const name = normalizeName(row.player_name);
    if (!name) continue;

    try {
      const raw = await fetchNBAHeadshot(name);
      const url = wrapCloudinaryFetch(raw);
      if (!url) {
        missing += 1;
      } else {
        const { error: updateError } = await supabase
          .from('players')
          .update({ headshot_url: url })
          .eq('id', row.id);
        if (updateError) {
          failed += 1;
          console.error(`update failed for ${name}:`, updateError.message);
        } else {
          updated += 1;
          console.log(`updated: ${name}`);
        }
      }
    } catch (err) {
      failed += 1;
      console.error(`headshot fetch failed for ${name}:`, err instanceof Error ? err.message : String(err));
    }

    await sleep(RATE_DELAY_MS);
  }

  return { scanned: rows.length, updated, missing, failed };
}

(async () => {
  console.log('sync_nba_headshots:start');
  const seed = await syncNbaPlayersToTable();
  console.log('sync_nba_headshots:seed', seed);
  const result = await backfillHeadshots();
  console.log('sync_nba_headshots:done', result);
})();

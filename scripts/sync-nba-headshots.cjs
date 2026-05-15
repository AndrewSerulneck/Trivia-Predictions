#!/usr/bin/env node
/**
 * sync-nba-headshots.cjs
 *
 * Throttled backfill for missing NBA player headshots.
 *
 * Source priority per player:
 *   1. NBA CDN  (HEAD-checked before saving)
 *   2. TheSportsDB cutout  (name-matched fallback)
 *   3. NULL  (leaves the row untouched; frontend silhouette handles it)
 *
 * Rate-limit protection:
 *   - Players are processed in batches of BATCH_SIZE (default 10).
 *   - A mandatory BETWEEN_BATCH_DELAY_MS (default 2 000 ms) pause follows each batch.
 *   - Any HTTP 429 triggers a RATE_429_BACKOFF_MS (default 60 000 ms) sleep + one retry.
 *
 * Run:
 *   node -r dotenv/config scripts/sync-nba-headshots.cjs
 *
 * Tunable env vars (all optional — defaults shown):
 *   HEADSHOT_MAX_BACKFILL=400      max players to process per run
 *   HEADSHOT_BATCH_SIZE=10         players per batch
 *   HEADSHOT_BATCH_DELAY_MS=2000   cooldown between batches
 *   HEADSHOT_429_BACKOFF_MS=60000  sleep duration on HTTP 429
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const BDL_BASE = (process.env.BALLDONTLIE_API_BASE_URL || 'https://api.balldontlie.io').trim().replace(/\/+$/, '');
const BDL_KEY = (process.env.BALLDONTLIE_API_KEY || '').trim();
const TSD_BASE = (process.env.THESPORTSDB_API_BASE_URL || 'https://www.thesportsdb.com/api/v1/json').trim().replace(/\/+$/, '');
const TSD_KEY = (process.env.THESPORTSDB_API_KEY || '').trim();
const CLOUDINARY_CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const HEADSHOT_SIZE = Number.parseInt(process.env.HEADSHOT_SIZE || '200', 10) || 200;
const BATCH_SIZE = Number.parseInt(process.env.HEADSHOT_BATCH_SIZE || '10', 10) || 10;
const BETWEEN_BATCH_DELAY_MS = Number.parseInt(process.env.HEADSHOT_BATCH_DELAY_MS || '2000', 10) || 2000;
const RATE_429_BACKOFF_MS = Number.parseInt(process.env.HEADSHOT_429_BACKOFF_MS || '60000', 10) || 60000;
const MAX_BACKFILL = Number.parseInt(process.env.HEADSHOT_MAX_BACKFILL || '400', 10) || 400;

const NBA_CDN_BASE = 'https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/260x190';
const NBA_PLAYER_IDS_PATH = path.join(__dirname, 'nba-player-ids.json');

// ─── Guards ───────────────────────────────────────────────────────────────────

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
if (!BDL_KEY) {
  throw new Error('Missing BALLDONTLIE_API_KEY');
}
if (!TSD_KEY) {
  throw new Error('Missing THESPORTSDB_API_KEY');
}

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── NBA player-ID lookup (from nba-player-ids.json) ─────────────────────────

function buildNbaIdMap() {
  if (!fs.existsSync(NBA_PLAYER_IDS_PATH)) {
    console.warn('[nba-id-map] nba-player-ids.json not found — NBA CDN lookup via mapping disabled');
    return new Map();
  }
  const entries = JSON.parse(fs.readFileSync(NBA_PLAYER_IDS_PATH, 'utf8'));
  const map = new Map();
  for (const { player_name, nba_person_id } of entries) {
    if (player_name && nba_person_id) {
      // Normalise key: lowercase, collapse whitespace, strip apostrophes/dots
      map.set(normaliseKey(player_name), Number(nba_person_id));
    }
  }
  console.log(`[nba-id-map] loaded ${map.size} entries from nba-player-ids.json`);
  return map;
}

function normaliseKey(name) {
  return String(name)
    .toLowerCase()
    .replace(/['.]/g, '')   // De'Aaron → deaaron, Jr. → Jr
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeName(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function buildNbaCdnUrl(externalId) {
  return `${NBA_CDN_BASE}/${externalId}.png`;
}

/**
 * Wraps a source image URL in a Cloudinary fetch transformation.
 * gravity:face + format:auto ensures face-centred cropping and modern format delivery.
 */
function toCloudinaryUrl(sourceUrl) {
  if (!sourceUrl) return null;
  if (!CLOUDINARY_CLOUD_NAME) return sourceUrl;
  const encoded = encodeURIComponent(sourceUrl);
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/w_${HEADSHOT_SIZE},h_${HEADSHOT_SIZE},c_fill,g_face,f_auto/${encoded}`;
}

// ─── Rate-limit-aware fetch helpers ──────────────────────────────────────────

/**
 * Performs a HEAD request to check whether an image URL resolves.
 * Returns true (exists), false (404), or throws on other errors.
 * Backs off and retries once on HTTP 429.
 */
async function urlExists(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { method: 'HEAD' });

    if (res.ok) return true;
    // NBA CDN returns 403 for missing headshots, not 404 — treat both as "not found".
    if (res.status === 404 || res.status === 403) return false;

    if (res.status === 429) {
      console.warn(`  [429] HEAD ${url} — sleeping ${RATE_429_BACKOFF_MS / 1000}s before retry`);
      await sleep(RATE_429_BACKOFF_MS);
      continue;
    }

    throw new Error(`HEAD ${url} → HTTP ${res.status}`);
  }

  // Both attempts hit 429 — propagate so the player is counted as failed, not missing.
  throw new Error(`HEAD ${url} → persistent 429, skipping player`);
}

/**
 * GET with JSON parsing. Backs off and retries once on HTTP 429.
 */
async function fetchJson(url, options = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { ...options, cache: 'no-store' });

    if (res.ok) return res.json();

    if (res.status === 429) {
      console.warn(`  [429] GET ${url} — sleeping ${RATE_429_BACKOFF_MS / 1000}s before retry`);
      await sleep(RATE_429_BACKOFF_MS);
      continue;
    }

    throw new Error(`GET ${url} → HTTP ${res.status}`);
  }

  throw new Error(`GET ${url} → persistent 429, skipping player`);
}

// ─── TheSportsDB fallback ─────────────────────────────────────────────────────

async function fetchSportsDbCutout(playerName) {
  const name = normalizeName(playerName);
  if (!name) return null;

  const url = new URL(`${TSD_BASE}/${TSD_KEY}/searchplayers.php`);
  url.searchParams.set('p', name);

  const payload = await fetchJson(url.toString(), { headers: { Accept: 'application/json' } });
  const players = Array.isArray(payload?.player) ? payload.player : [];
  if (!players.length) return null;

  const lower = name.toLowerCase();
  const exact = players.find((p) => normalizeName(p?.strPlayer).toLowerCase() === lower);
  const selected = exact ?? players[0];
  const cutout = normalizeName(selected?.strCutout);
  return cutout || null;
}

// ─── Per-player headshot resolution ──────────────────────────────────────────

/**
 * Attempts to resolve a Cloudinary-wrapped headshot URL for one player.
 * Priority: nba-player-ids.json → NBA CDN (BDL id) → TheSportsDB → null
 * Returns null (not a failure) when no source has an image.
 */
async function resolveHeadshotUrl(row, nbaIdMap) {
  // 1. Authoritative NBA CDN via the curated nba-player-ids.json mapping.
  const mappedId = nbaIdMap.get(normaliseKey(row.player_name));
  if (mappedId) {
    const cdnUrl = buildNbaCdnUrl(mappedId);
    try {
      if (await urlExists(cdnUrl)) {
        console.log(`  [cdn-map]   ${row.player_name} (nba_id=${mappedId})`);
        return toCloudinaryUrl(cdnUrl);
      }
      console.log(`  [cdn-map-miss] ${row.player_name} (nba_id=${mappedId}) — 403/404 on CDN`);
    } catch (err) {
      console.warn(`  [cdn-map-err]  ${row.player_name}: ${err.message}`);
    }
  }

  // 2. NBA CDN via BDL external_id (coincides with NBA id for some older players).
  if (row.external_id && String(row.external_id) !== String(mappedId)) {
    const cdnUrl = buildNbaCdnUrl(row.external_id);
    try {
      if (await urlExists(cdnUrl)) {
        console.log(`  [cdn-bdl]   ${row.player_name} (bdl_id=${row.external_id})`);
        return toCloudinaryUrl(cdnUrl);
      }
    } catch (err) {
      // silent — just fall through to TheSportsDB
    }
  }

  // 3. TheSportsDB — cutout image fallback.
  try {
    const cutout = await fetchSportsDbCutout(row.player_name);
    if (cutout) {
      return toCloudinaryUrl(cutout);
    }
    console.log(`  [tsd-miss]  ${row.player_name}`);
  } catch (err) {
    console.warn(`  [tsd-err]   ${row.player_name}: ${err.message}`);
  }

  // 4. Nothing found — return null so frontend silhouette fallback applies.
  return null;
}

// ─── Player seeding (BallDontLie → players table) ────────────────────────────

async function fetchBdlPage(cursor) {
  const url = new URL(`${BDL_BASE}/nba/v1/players`);
  url.searchParams.set('per_page', '100');
  if (cursor) url.searchParams.set('cursor', String(cursor));
  return fetchJson(url.toString(), { headers: { Authorization: BDL_KEY } });
}

async function syncNbaPlayersToTable() {
  let cursor = null;
  let pages = 0;
  let upserts = 0;

  while (pages < 60) {
    const payload = await fetchBdlPage(cursor);
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    if (!rows.length) break;

    const toUpsert = rows
      .map((row) => {
        const name = normalizeName(`${normalizeName(row?.first_name)} ${normalizeName(row?.last_name)}`);
        const externalId = String(row?.id ?? '').trim();
        if (!name || !externalId) return null;
        return { external_id: externalId, player_name: name, league: 'NBA' };
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

// ─── Main backfill ────────────────────────────────────────────────────────────

async function backfillHeadshots() {
  const nbaIdMap = buildNbaIdMap();

  // Fetch players where headshot_url is absent or a known placeholder.
  const { data, error } = await supabase
    .from('players')
    .select('id,external_id,player_name,league,headshot_url')
    .eq('league', 'NBA')
    .or('headshot_url.is.null,headshot_url.eq.,headshot_url.ilike.%placeholder%')
    .order('id', { ascending: true })
    .limit(MAX_BACKFILL);

  if (error) throw new Error(`players select failed: ${error.message}`);

  const rows = Array.isArray(data) ? data : [];
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
  console.log(`[backfill] ${rows.length} players to process across ${totalBatches} batches\n`);

  let updated = 0;
  let missing = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`[batch ${batchNum}/${totalBatches}] players ${i + 1}–${i + batch.length}`);

    for (const row of batch) {
      const name = normalizeName(row.player_name);
      if (!name) continue;

      try {
        const url = await resolveHeadshotUrl(row, nbaIdMap);

        if (!url) {
          missing += 1;
          console.log(`  ✗ no image:  ${name}`);
        } else {
          const { error: dbErr } = await supabase
            .from('players')
            .update({ headshot_url: url })
            .eq('id', row.id);

          if (dbErr) {
            failed += 1;
            console.error(`  ✗ db error:  ${name} — ${dbErr.message}`);
          } else {
            updated += 1;
            console.log(`  ✓ updated:   ${name}`);
          }
        }
      } catch (err) {
        failed += 1;
        console.error(`  ✗ exception: ${name} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Mandatory cooldown after each batch (skip after the very last one).
    if (i + BATCH_SIZE < rows.length) {
      console.log(`  ↺ batch cooldown ${BETWEEN_BATCH_DELAY_MS / 1000}s…\n`);
      await sleep(BETWEEN_BATCH_DELAY_MS);
    }
  }

  return { scanned: rows.length, updated, missing, failed };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

(async () => {
  console.log('=== sync-nba-headshots start ===');
  console.log(`  CLOUDINARY_CLOUD_NAME  : ${CLOUDINARY_CLOUD_NAME || '(none — raw source URLs will be saved)'}`);
  console.log(`  MAX_BACKFILL           : ${MAX_BACKFILL}`);
  console.log(`  BATCH_SIZE             : ${BATCH_SIZE}`);
  console.log(`  BETWEEN_BATCH_DELAY_MS : ${BETWEEN_BATCH_DELAY_MS}`);
  console.log(`  RATE_429_BACKOFF_MS    : ${RATE_429_BACKOFF_MS}`);
  console.log('');

  try {
    console.log('[step 1/2] seeding players from BallDontLie…');
    const seed = await syncNbaPlayersToTable();
    console.log(`[step 1/2] done — upserted ${seed.upserts} player rows\n`);

    console.log('[step 2/2] backfilling missing headshots…');
    const result = await backfillHeadshots();

    console.log('\n=== sync-nba-headshots done ===');
    console.log(`  scanned : ${result.scanned}`);
    console.log(`  updated : ${result.updated}  ← successfully written to Supabase`);
    console.log(`  missing : ${result.missing}  ← no image found on any source (NULL kept)`);
    console.log(`  failed  : ${result.failed}   ← errors during fetch or DB write`);

    process.exitCode = result.failed > 0 ? 1 : 0;
  } catch (err) {
    console.error('\n[fatal]', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
})();

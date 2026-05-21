#!/usr/bin/env node
/**
 * sync-mlb-headshots.cjs
 *
 * Throttled backfill for missing MLB player headshots.
 *
 * Source priority per player:
 *   1. BDL native fields (draft_kings_picture_url → headshot_url → picture_url)
 *      — captured during seeding so most active players are covered immediately.
 *   2. TheSportsDB cutout filtered to strSport="Baseball"
 *      — name-matched fallback for players without BDL images.
 *   3. NULL  (leaves the row untouched; frontend silhouette handles it)
 *
 * Why no MLB CDN equivalent to the NBA CDN:
 *   MLB.com and ESPN CDNs use internal player IDs (MLBAM ID / ESPN ID) that do
 *   not match BDL IDs and there is no public cross-reference table. Attempting
 *   to build a mapping at runtime would require a separate API subscription.
 *   BDL-native URLs + TheSportsDB are the best available free-tier sources.
 *
 * Rate-limit protection:
 *   - Players are processed in batches of BATCH_SIZE (default 10).
 *   - A mandatory BETWEEN_BATCH_DELAY_MS (default 2 000 ms) pause follows each batch.
 *   - Any HTTP 429 triggers a RATE_429_BACKOFF_MS (default 60 000 ms) sleep + one retry.
 *
 * Run:
 *   node -r dotenv/config scripts/sync-mlb-headshots.cjs
 *
 * Tunable env vars (all optional — defaults shown):
 *   HEADSHOT_MAX_BACKFILL=400      max players to process per run
 *   HEADSHOT_BATCH_SIZE=10         players per batch
 *   HEADSHOT_BATCH_DELAY_MS=2000   cooldown between batches
 *   HEADSHOT_429_BACKOFF_MS=60000  sleep duration on HTTP 429
 */

'use strict';

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

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeName(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function isValidUrl(str) {
  const s = normalizeName(str);
  return s.startsWith('http://') || s.startsWith('https://');
}

function toCloudinaryUrl(sourceUrl) {
  if (!sourceUrl) return null;
  if (!CLOUDINARY_CLOUD_NAME) return sourceUrl;
  const encoded = encodeURIComponent(sourceUrl);
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/w_${HEADSHOT_SIZE},h_${HEADSHOT_SIZE},c_fill,g_face,f_auto/${encoded}`;
}

// ─── Rate-limit-aware fetch helpers ──────────────────────────────────────────

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

// ─── TheSportsDB lookup (Baseball-sport-filtered) ─────────────────────────────
//
// Bug fixed: the original code took players[0] without filtering by sport, so
// a common name like "Mike Williams" would resolve to a football/basketball
// player's headshot instead of the baseball player.
//
// Fix: filter candidates to strSport === "Baseball" before accepting a match.
// If no baseball-sport result exists, log and return null rather than returning
// a wrong-sport image.

async function fetchSportsDbCutout(playerName) {
  const name = normalizeName(playerName);
  if (!name) return null;

  const url = new URL(`${TSD_BASE}/${TSD_KEY}/searchplayers.php`);
  url.searchParams.set('p', name);

  const payload = await fetchJson(url.toString(), { headers: { Accept: 'application/json' } });
  const allPlayers = Array.isArray(payload?.player) ? payload.player : [];
  if (!allPlayers.length) return null;

  // Keep only Baseball entries — prevents cross-sport name collisions.
  const baseballPlayers = allPlayers.filter(
    (p) => String(p?.strSport ?? '').trim().toLowerCase() === 'baseball'
  );

  if (!baseballPlayers.length) {
    console.log(`  [tsd-sport-miss] ${playerName} — ${allPlayers.length} result(s) found but none are Baseball`);
    return null;
  }

  const lower = name.toLowerCase();
  const exact = baseballPlayers.find(
    (p) => normalizeName(String(p?.strPlayer ?? '')).toLowerCase() === lower
  );
  const selected = exact ?? baseballPlayers[0];
  const cutout = normalizeName(selected?.strCutout);
  return cutout || null;
}

// ─── Per-player headshot resolution ──────────────────────────────────────────
//
// Priority:
//   1. BDL-native URL already captured into row.bdl_headshot_url during seeding
//      (only present as metadata on the in-memory row — not a DB column).
//   2. TheSportsDB Baseball-filtered cutout.
//   3. null → frontend silhouette.

async function resolveHeadshotUrl(row) {
  // 1. BDL native URL (populated during the seed phase on the in-memory object).
  if (row.bdl_headshot_url) {
    console.log(`  [bdl-native]  ${row.player_name}`);
    return toCloudinaryUrl(row.bdl_headshot_url);
  }

  // 2. TheSportsDB fallback — filtered to Baseball sport.
  try {
    const cutout = await fetchSportsDbCutout(row.player_name);
    if (cutout) {
      console.log(`  [tsd-hit]     ${row.player_name}`);
      return toCloudinaryUrl(cutout);
    }
    console.log(`  [tsd-miss]    ${row.player_name}`);
  } catch (err) {
    console.warn(`  [tsd-err]     ${row.player_name}: ${err.message}`);
  }

  // 3. No source found.
  // Note: MLB.com (img.mlbstatic.com) and ESPN CDN (a.espncdn.com/i/headshots/mlb/)
  // both require internal player IDs (MLBAM ID / ESPN ID) that differ from BDL IDs.
  // Without a live cross-reference table these CDNs cannot be used here.
  return null;
}

// ─── Player seeding (BallDontLie → players table) ────────────────────────────
//
// Bug fixed: the original code discarded BDL's native image fields
// (draft_kings_picture_url, headshot_url, picture_url). These are now captured
// during seeding and written directly to headshot_url when present, so the
// majority of active players are resolved without hitting TheSportsDB at all.

async function fetchBdlPage(cursor) {
  const url = new URL(`${BDL_BASE}/mlb/v1/players`);
  url.searchParams.set('per_page', '100');
  if (cursor) url.searchParams.set('cursor', String(cursor));
  return fetchJson(url.toString(), { headers: { Authorization: BDL_KEY } });
}

async function syncMlbPlayersToTable() {
  let cursor = null;
  let pages = 0;
  let upserts = 0;
  let bdlImagesFound = 0;

  while (pages < 60) {
    const payload = await fetchBdlPage(cursor);
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    if (!rows.length) break;

    const toUpsert = rows
      .map((row) => {
        const firstName = normalizeName(row?.first_name);
        const lastName = normalizeName(row?.last_name);
        const name = normalizeName(`${firstName} ${lastName}`);
        const externalId = String(row?.id ?? '').trim();
        if (!name || !externalId) return null;

        // Capture any image URL BDL provides on the player record.
        const bdlImageUrl =
          isValidUrl(row?.draft_kings_picture_url) ? normalizeName(row.draft_kings_picture_url) :
          isValidUrl(row?.headshot_url)             ? normalizeName(row.headshot_url) :
          isValidUrl(row?.picture_url)              ? normalizeName(row.picture_url) :
          null;

        const record = { external_id: externalId, player_name: name, league: 'MLB' };
        if (bdlImageUrl) {
          record.headshot_url = toCloudinaryUrl(bdlImageUrl);
        }
        return record;
      })
      .filter(Boolean);

    bdlImagesFound += toUpsert.filter((r) => r.headshot_url).length;

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

  return { upserts, bdlImagesFound };
}

// ─── Main backfill ────────────────────────────────────────────────────────────
//
// Only targets rows still lacking a headshot after seeding. Rows where the seed
// step wrote a BDL-native URL are excluded by the .or() filter.

async function backfillHeadshots() {
  const { data, error } = await supabase
    .from('players')
    .select('id,external_id,player_name,league,headshot_url')
    .eq('league', 'MLB')
    .or('headshot_url.is.null,headshot_url.eq.,headshot_url.ilike.%placeholder%')
    .order('id', { ascending: false })
    .limit(MAX_BACKFILL);

  if (error) throw new Error(`players select failed: ${error.message}`);

  const rows = Array.isArray(data) ? data : [];
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
  console.log(`[backfill] ${rows.length} players still need images across ${totalBatches} batches\n`);

  if (rows.length === 0) {
    console.log('  ✓ All MLB players already have headshots — nothing to backfill.');
    return { scanned: 0, updated: 0, missing: 0, failed: 0 };
  }

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
        const url = await resolveHeadshotUrl(row);

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

    if (i + BATCH_SIZE < rows.length) {
      console.log(`  ↺ batch cooldown ${BETWEEN_BATCH_DELAY_MS / 1000}s…\n`);
      await sleep(BETWEEN_BATCH_DELAY_MS);
    }
  }

  return { scanned: rows.length, updated, missing, failed };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

(async () => {
  console.log('=== sync-mlb-headshots start ===');
  console.log(`  CLOUDINARY_CLOUD_NAME  : ${CLOUDINARY_CLOUD_NAME || '(none — raw source URLs will be saved)'}`);
  console.log(`  MAX_BACKFILL           : ${MAX_BACKFILL}`);
  console.log(`  BATCH_SIZE             : ${BATCH_SIZE}`);
  console.log(`  BETWEEN_BATCH_DELAY_MS : ${BETWEEN_BATCH_DELAY_MS}`);
  console.log(`  RATE_429_BACKOFF_MS    : ${RATE_429_BACKOFF_MS}`);
  console.log('');
  console.log('  Image source priority:');
  console.log('    1. BDL native fields (draft_kings_picture_url / headshot_url / picture_url)');
  console.log('    2. TheSportsDB cutout (Baseball sport filter applied)');
  console.log('    3. NULL — ESPN/MLB CDNs require internal IDs not available from BDL');
  console.log('');

  try {
    console.log('[step 1/2] seeding MLB players from BallDontLie (captures BDL-native images)…');
    const seed = await syncMlbPlayersToTable();
    console.log(`[step 1/2] done — upserted ${seed.upserts} rows, ${seed.bdlImagesFound} with BDL-native images\n`);

    console.log('[step 2/2] backfilling remaining missing headshots via TheSportsDB…');
    const result = await backfillHeadshots();

    console.log('\n=== sync-mlb-headshots done ===');
    console.log(`  seeded with BDL images : ${seed.bdlImagesFound}`);
    console.log(`  backfill scanned       : ${result.scanned}`);
    console.log(`  backfill updated       : ${result.updated}  ← successfully written to Supabase`);
    console.log(`  backfill missing       : ${result.missing}  ← no image found on any source (NULL kept)`);
    console.log(`  backfill failed        : ${result.failed}   ← errors during fetch or DB write`);

    process.exitCode = result.failed > 0 ? 1 : 0;
  } catch (err) {
    console.error('\n[fatal]', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
})();

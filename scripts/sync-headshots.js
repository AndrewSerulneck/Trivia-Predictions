#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

function loadLocalEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    break;
  }
}

loadLocalEnv();

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
const MAX_BDL_PAGES = Number.parseInt(process.env.HEADSHOT_MAX_BDL_PAGES || '60', 10) || 60;

const SPORT_CONFIG = {
  nba: {
    league: 'NBA',
    bdlPlayersPath: '/nba/v1/players',
    tsdSport: 'Basketball',
    cdnBase: 'https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/260x190',
    idMapFile: 'nba-player-ids.json',
    idMapField: 'nba_person_id',
  },
  wnba: {
    league: 'WNBA',
    bdlPlayersPath: '/wnba/v1/players',
    tsdSport: 'Basketball',
    cdnBase: 'https://ak-static.cms.nba.com/wp-content/uploads/headshots/wnba/latest/260x190',
    idMapFile: 'wnba-player-ids.json',
    idMapField: 'wnba_person_id',
  },
  mlb: {
    league: 'MLB',
    bdlPlayersPath: '/mlb/v1/players',
    tsdSport: 'Baseball',
  },
  nfl: {
    league: 'NFL',
    bdlPlayersPath: '/nfl/v1/players',
    tsdSport: 'American Football',
  },
  nhl: {
    league: 'NHL',
    bdlPlayersPath: '/nhl/v1/players',
    tsdSport: 'Ice Hockey',
  },
};

function parseSportArg(argv) {
  const fromEq = argv.find((arg) => arg.startsWith('--sport='));
  if (fromEq) {
    return fromEq.slice('--sport='.length).trim().toLowerCase();
  }
  const index = argv.findIndex((arg) => arg === '--sport');
  if (index >= 0) {
    return String(argv[index + 1] || '').trim().toLowerCase();
  }
  return '';
}

function usageAndExit() {
  const sports = Object.keys(SPORT_CONFIG).join(', ');
  console.error(`Usage: node scripts/sync-headshots.js --sport=<${sports}>`);
  process.exit(1);
}

const sportSlug = parseSportArg(process.argv.slice(2));
const sportConfig = SPORT_CONFIG[sportSlug];
if (!sportConfig) {
  usageAndExit();
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
if (!TSD_KEY) {
  throw new Error('Missing THESPORTSDB_API_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeName(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(name) {
  return String(name)
    .toLowerCase()
    .replace(/["'.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidUrl(value) {
  const str = normalizeName(value);
  return str.startsWith('http://') || str.startsWith('https://');
}

function toCloudinaryUrl(sourceUrl) {
  if (!sourceUrl) return null;
  if (!CLOUDINARY_CLOUD_NAME) return sourceUrl;
  const encoded = encodeURIComponent(sourceUrl);
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/w_${HEADSHOT_SIZE},h_${HEADSHOT_SIZE},c_fill,g_face,f_auto/${encoded}`;
}

function buildCdnUrl(cdnBase, personId) {
  return `${cdnBase}/${personId}.png`;
}

function loadIdMap(config) {
  if (!config.idMapFile || !config.idMapField) {
    return new Map();
  }
  const filePath = path.join(__dirname, config.idMapFile);
  if (!fs.existsSync(filePath)) {
    console.warn(`[${sportSlug}] id map file missing: ${config.idMapFile}`);
    return new Map();
  }

  const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const playerName = normalizeName(row?.player_name);
    const personId = Number.parseInt(String(row?.[config.idMapField] ?? ''), 10);
    if (!playerName || !Number.isFinite(personId) || personId <= 0) {
      continue;
    }
    map.set(normalizeKey(playerName), personId);
  }
  return map;
}

async function fetchJson(url, options = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, { ...options, cache: 'no-store' });
    if (response.ok) {
      return response.json();
    }
    if (response.status === 429) {
      console.warn(`[${sportSlug}] 429 from ${url}; sleeping ${RATE_429_BACKOFF_MS}ms`);
      await sleep(RATE_429_BACKOFF_MS);
      continue;
    }
    throw new Error(`GET ${url} failed (${response.status})`);
  }
  throw new Error(`GET ${url} failed after retry`);
}

async function urlExists(url) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.ok) {
      return true;
    }
    if (response.status === 404 || response.status === 403) {
      return false;
    }
    if (response.status === 429) {
      console.warn(`[${sportSlug}] 429 from HEAD ${url}; sleeping ${RATE_429_BACKOFF_MS}ms`);
      await sleep(RATE_429_BACKOFF_MS);
      continue;
    }
    throw new Error(`HEAD ${url} failed (${response.status})`);
  }
  throw new Error(`HEAD ${url} failed after retry`);
}

async function fetchSportsDbCutout(playerName, tsdSportFilter) {
  const name = normalizeName(playerName);
  if (!name) {
    return null;
  }

  const url = new URL(`${TSD_BASE}/${TSD_KEY}/searchplayers.php`);
  url.searchParams.set('p', name);

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  const players = Array.isArray(payload?.player) ? payload.player : [];
  if (players.length === 0) {
    return null;
  }

  const filtered = tsdSportFilter
    ? players.filter((row) => String(row?.strSport ?? '').trim().toLowerCase() === tsdSportFilter.toLowerCase())
    : players;
  if (filtered.length === 0) {
    return null;
  }

  const lower = name.toLowerCase();
  const exact = filtered.find((row) => normalizeName(row?.strPlayer).toLowerCase() === lower);
  const selected = exact || filtered[0];
  const cutout = normalizeName(selected?.strCutout);
  return cutout || null;
}

async function fetchBdlPlayersPage(config, cursor) {
  const url = new URL(`${BDL_BASE}${config.bdlPlayersPath}`);
  url.searchParams.set('per_page', '100');
  if (cursor) {
    url.searchParams.set('cursor', String(cursor));
  }
  return fetchJson(url.toString(), {
    headers: { Authorization: BDL_KEY },
  });
}

async function seedPlayersFromBdl(config) {
  if (!BDL_KEY) {
    return {
      pagesScanned: 0,
      upserts: 0,
      skipped: true,
    };
  }

  let cursor = null;
  let pages = 0;
  let upserts = 0;

  while (pages < MAX_BDL_PAGES) {
    const payload = await fetchBdlPlayersPage(config, cursor);
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    if (rows.length === 0) {
      break;
    }

    const toUpsert = rows
      .map((row) => {
        const firstName = normalizeName(row?.first_name);
        const lastName = normalizeName(row?.last_name);
        const playerName = normalizeName(`${firstName} ${lastName}`);
        const externalId = String(row?.id ?? '').trim();

        if (!playerName || !externalId) {
          return null;
        }

        const record = {
          external_id: externalId,
          player_name: playerName,
          league: config.league,
        };
        return record;
      })
      .filter(Boolean);

    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from('players')
        .upsert(toUpsert, { onConflict: 'external_id,league', ignoreDuplicates: false });

      if (error) {
        throw new Error(`players upsert failed: ${error.message}`);
      }

      upserts += toUpsert.length;
    }

    const nextCursor = payload?.meta?.next_cursor;
    if (nextCursor === null || nextCursor === undefined || String(nextCursor).trim() === '') {
      break;
    }

    cursor = String(nextCursor).trim();
    pages += 1;
  }

  return {
    pagesScanned: pages + 1,
    upserts,
    skipped: false,
  };
}

async function seedPlayersFromFantasyReferences(config) {
  const { data, error } = await supabase
    .from('fantasy_player_headshots')
    .select('player_id, player_name')
    .limit(5000);

  if (error) {
    const message = String(error.message || '').toLowerCase();
    const missingTable = message.includes("could not find the table 'public.fantasy_player_headshots'") ||
      message.includes('relation "public.fantasy_player_headshots" does not exist') ||
      message.includes('relation "fantasy_player_headshots" does not exist');
    // Some environments may not have this table; continue silently.
    if (!missingTable) {
      console.warn(`[${sportSlug}] fantasy_player_headshots lookup skipped: ${error.message}`);
    }
    return { scanned: 0, upserts: 0 };
  }

  const rows = Array.isArray(data) ? data : [];
  const toUpsert = rows
    .map((row) => {
      const playerId = String(row?.player_id ?? '').trim();
      const playerName = normalizeName(row?.player_name);
      if (!playerId || !playerName) {
        return null;
      }
      return {
        external_id: playerId,
        player_name: playerName,
        league: config.league,
      };
    })
    .filter(Boolean);

  if (toUpsert.length === 0) {
    return { scanned: rows.length, upserts: 0 };
  }

  const { error: upsertError } = await supabase
    .from('players')
    .upsert(toUpsert, { onConflict: 'external_id,league', ignoreDuplicates: false });
  if (upsertError) {
    throw new Error(`players upsert from fantasy refs failed: ${upsertError.message}`);
  }

  return { scanned: rows.length, upserts: toUpsert.length };
}

async function resolveHeadshotForRow(row, config, idMap) {
  const nameKey = normalizeKey(row.player_name);

  if (config.cdnBase) {
    const mappedId = idMap.get(nameKey);
    if (mappedId) {
      const mappedUrl = buildCdnUrl(config.cdnBase, mappedId);
      if (await urlExists(mappedUrl)) {
        return toCloudinaryUrl(mappedUrl);
      }
    }

    const externalId = String(row.external_id ?? '').trim();
    if (externalId && String(mappedId || '') !== externalId) {
      const externalUrl = buildCdnUrl(config.cdnBase, externalId);
      if (await urlExists(externalUrl)) {
        return toCloudinaryUrl(externalUrl);
      }
    }
  }

  const cutout = await fetchSportsDbCutout(row.player_name, config.tsdSport);
  if (cutout) {
    return toCloudinaryUrl(cutout);
  }

  return null;
}

async function backfillMissingHeadshots(config, idMap) {
  const { data, error } = await supabase
    .from('players')
    .select('id, external_id, player_name, league, headshot_url')
    .eq('league', config.league)
    .or('headshot_url.is.null,headshot_url.eq.,headshot_url.ilike.%placeholder%')
    .order('id', { ascending: false })
    .limit(MAX_BACKFILL);

  if (error) {
    throw new Error(`players select failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  let updated = 0;
  let missing = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      try {
        const url = await resolveHeadshotForRow(row, config, idMap);
        if (!url) {
          missing += 1;
          continue;
        }

        const { error: updateError } = await supabase
          .from('players')
          .update({ headshot_url: url })
          .eq('id', row.id);

        if (updateError) {
          failed += 1;
        } else {
          updated += 1;
        }
      } catch (_error) {
        failed += 1;
      }
    }

    if (totalBatches > 0 && i + BATCH_SIZE < rows.length) {
      await sleep(BETWEEN_BATCH_DELAY_MS);
    }
  }

  return {
    scanned: rows.length,
    updated,
    missing,
    failed,
  };
}

(async () => {
  const start = Date.now();
  console.log(`=== sync-headshots start (${sportSlug.toUpperCase()}) ===`);
  console.log(`league=${sportConfig.league} maxBackfill=${MAX_BACKFILL} batchSize=${BATCH_SIZE}`);
  if (!BDL_KEY) {
    console.log(`[${sportSlug}] BALLDONTLIE_API_KEY missing; skipping BDL player seed and using SportsDB-only headshot backfill`);
  }

  try {
    const idMap = loadIdMap(sportConfig);
    const fantasyRefs = await seedPlayersFromFantasyReferences(sportConfig);
    const seed = await seedPlayersFromBdl(sportConfig);
    const backfill = await backfillMissingHeadshots(sportConfig, idMap);

    console.log('--- summary ---');
    console.log(`sport=${sportSlug}`);
    console.log(`fantasy_refs_scanned=${fantasyRefs.scanned}`);
    console.log(`fantasy_refs_upserted=${fantasyRefs.upserts}`);
    console.log(`seed_skipped=${seed.skipped ? 'true' : 'false'}`);
    console.log(`seed_pages_scanned=${seed.pagesScanned}`);
    console.log(`seed_upserts=${seed.upserts}`);
    console.log(`missing_scanned=${backfill.scanned}`);
    console.log(`successful_updates=${backfill.updated}`);
    console.log(`missing_after_lookup=${backfill.missing}`);
    console.log(`failed_queries_or_writes=${backfill.failed}`);
    console.log(`elapsed_ms=${Date.now() - start}`);
    console.log(`=== sync-headshots done (${sportSlug.toUpperCase()}) ===`);
  } catch (error) {
    console.error(`sync-headshots failed for sport=${sportSlug}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
})();

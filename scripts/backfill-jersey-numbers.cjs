#!/usr/bin/env node
/**
 * Backfills jersey_number on live_player_stats rows by fetching player data
 * from the BallDontLie API. Handles NBA, WNBA, and MLB via their respective
 * sport-specific endpoints. Batches player ID lookups to stay within API limits.
 *
 * Usage:
 *   BALLDONTLIE_API_KEY=<key> SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
 *     node scripts/backfill-jersey-numbers.cjs
 *
 * Optional flags:
 *   --dry-run   Print what would be updated without writing to the DB
 *   --sport nba|wnba|mlb   Limit to one sport
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY || '';
const BDL_BASE = (process.env.BALLDONTLIE_API_BASE_URL || 'https://api.balldontlie.io').replace(/\/+$/, '');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SPORT_FILTER = (() => {
  const idx = args.indexOf('--sport');
  return idx !== -1 ? args[idx + 1] : null;
})();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!BDL_API_KEY) {
  console.error('Missing BALLDONTLIE_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// BallDontLie endpoints and the jersey_number field path per sport
const SPORT_CONFIG = {
  nba: {
    sportKeys: ['basketball_nba', 'nba'],
    endpoint: '/v1/players',
    jerseyField: 'jersey_number',
  },
  wnba: {
    sportKeys: ['basketball_wnba', 'wnba'],
    endpoint: '/v1/wnba/players',
    jerseyField: 'jersey_number',
  },
  mlb: {
    sportKeys: ['baseball_mlb', 'mlb'],
    endpoint: '/v1/mlb/players',
    jerseyField: 'jersey_number',
  },
};

async function bdlGet(path, params) {
  const url = new URL(`${BDL_BASE}${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (Array.isArray(v)) {
      v.forEach((item) => url.searchParams.append(k, String(item)));
    } else {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: BDL_API_KEY },
  });
  if (!res.ok) {
    throw new Error(`BDL ${path} → ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchJerseyNumbers(endpoint, jerseyField, playerIds) {
  // BDL accepts up to 100 ids[] per request
  const BATCH = 100;
  const results = new Map(); // player_id → jersey_number

  for (let i = 0; i < playerIds.length; i += BATCH) {
    const batch = playerIds.slice(i, i + BATCH);
    let cursor = null;

    do {
      const params = { per_page: 100, 'ids[]': batch };
      if (cursor) params.cursor = cursor;

      const payload = await bdlGet(endpoint, params);
      const rows = Array.isArray(payload.data) ? payload.data : [];

      for (const row of rows) {
        const id = row.id ?? row.player_id;
        const jersey = row[jerseyField];
        if (id != null && jersey != null && String(jersey).trim() !== '') {
          results.set(Number(id), String(jersey).trim());
        }
      }

      cursor = payload.meta?.next_cursor ?? null;
    } while (cursor);

    process.stdout.write(`  fetched batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(playerIds.length / BATCH)}\r`);
  }
  console.log('');
  return results;
}

async function runSport(sportName, config) {
  console.log(`\n=== ${sportName.toUpperCase()} ===`);

  // Pull distinct player_ids from live_player_stats for this sport
  const { data, error } = await supabase
    .from('live_player_stats')
    .select('player_id')
    .in('sport_key', config.sportKeys);

  if (error) {
    console.error(`  DB query failed: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) {
    console.log('  No players found — skipping.');
    return;
  }

  const uniqueIds = [...new Set(data.map((r) => Number(r.player_id)).filter((id) => id > 0))];
  console.log(`  ${uniqueIds.length} distinct player IDs found`);

  const jerseyMap = await fetchJerseyNumbers(config.endpoint, config.jerseyField, uniqueIds);
  console.log(`  ${jerseyMap.size} jersey numbers returned by BDL`);

  if (jerseyMap.size === 0) {
    console.log('  Nothing to update.');
    return;
  }

  if (DRY_RUN) {
    console.log('  DRY RUN — sample:');
    let count = 0;
    for (const [id, num] of jerseyMap) {
      console.log(`    player_id=${id}  jersey_number=${num}`);
      if (++count >= 10) { console.log('    ...'); break; }
    }
    return;
  }

  // Update in batches of 500
  const entries = [...jerseyMap.entries()];
  const UPDATE_BATCH = 500;
  let updated = 0;

  for (let i = 0; i < entries.length; i += UPDATE_BATCH) {
    const batch = entries.slice(i, i + UPDATE_BATCH);

    // Supabase doesn't support bulk "update different value per row" in one call,
    // so we group by jersey number value to minimise round-trips.
    const byNumber = new Map();
    for (const [id, num] of batch) {
      if (!byNumber.has(num)) byNumber.set(num, []);
      byNumber.get(num).push(id);
    }

    for (const [num, ids] of byNumber) {
      const { error: updateError } = await supabase
        .from('live_player_stats')
        .update({ jersey_number: num })
        .in('player_id', ids)
        .in('sport_key', config.sportKeys);

      if (updateError) {
        console.error(`  Update failed for jersey #${num}: ${updateError.message}`);
      } else {
        updated += ids.length;
      }
    }
  }

  console.log(`  Updated ${updated} rows.`);
}

async function main() {
  console.log(`BDL jersey number backfill${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const sports = Object.entries(SPORT_CONFIG).filter(([name]) => !SPORT_FILTER || name === SPORT_FILTER);

  if (sports.length === 0) {
    console.error(`Unknown sport filter: ${SPORT_FILTER}. Valid: nba, wnba, mlb`);
    process.exit(1);
  }

  for (const [name, config] of sports) {
    await runSport(name, config);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

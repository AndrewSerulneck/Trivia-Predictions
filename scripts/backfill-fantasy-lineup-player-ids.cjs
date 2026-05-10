#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
const APISPORTS_BASE_URL = String(process.env.APISPORTS_NBA_BASE_URL || 'https://v1.basketball.api-sports.io').replace(/\/+$/, '');
const APISPORTS_API_KEY = String(process.env.APISPORTS_API_KEY || '').trim();

function normalizeNameKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(value) {
  return normalizeNameKey(value)
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean);
}

function isNameTokenMatch(targetName, candidateName) {
  const a = Array.from(new Set(nameTokens(targetName)));
  const b = Array.from(new Set(nameTokens(candidateName)));
  if (a.length === 0 || b.length === 0) return false;
  if (a.join(' ') === b.join(' ')) return true;
  const aSet = new Set(a);
  const bSet = new Set(b);
  if (aSet.size !== bSet.size) return false;
  for (const token of aSet) {
    if (!bSet.has(token)) return false;
  }
  return true;
}

function parseLineup(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return {
          player_id: Number.parseInt(String(item.player_id ?? item.playerId ?? ''), 10) || null,
          player_name: String(item.player_name ?? item.playerName ?? '').trim(),
        };
      }
      return {
        player_id: null,
        player_name: String(item ?? '').trim(),
      };
    })
    .filter((p) => p.player_name);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: liveRows, error: liveErr } = await supabase
    .from('live_player_stats')
    .select('player_id,player_name,source_updated_at')
    .eq('league_name', 'NBA')
    .order('source_updated_at', { ascending: false })
    .limit(20000);
  if (liveErr) throw new Error(`live_player_stats load failed: ${liveErr.message}`);

  const idByName = new Map();
  for (const row of liveRows || []) {
    const keyName = normalizeNameKey(row.player_name);
    const id = Number.parseInt(String(row.player_id ?? ''), 10);
    if (!keyName || !Number.isFinite(id) || id <= 0 || idByName.has(keyName)) continue;
    idByName.set(keyName, id);
  }

  const apiSportsCache = new Map();
  async function resolveViaApiSports(playerName) {
    if (!APISPORTS_API_KEY) return null;
    const keyName = normalizeNameKey(playerName);
    if (!keyName) return null;
    if (apiSportsCache.has(keyName)) return apiSportsCache.get(keyName);

    const tokens = playerName
      .replace(/[^a-zA-Z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const queryCandidates = Array.from(
      new Set([
        playerName,
        tokens.slice(0, 2).join(' '),
        tokens[tokens.length - 1] || '',
        tokens[0] || '',
      ].filter(Boolean)),
    );
    const paths = queryCandidates.flatMap((q) => {
      const search = encodeURIComponent(q);
      return [`/players?search=${search}`, `/players?name=${search}`];
    });
    for (const path of paths) {
      try {
        const response = await fetch(`${APISPORTS_BASE_URL}${path}`, {
          method: 'GET',
          headers: {
            'x-apisports-key': APISPORTS_API_KEY,
            accept: 'application/json',
          },
        });
        if (!response.ok) continue;
        const json = await response.json().catch(() => null);
        const rows = Array.isArray(json?.response) ? json.response : [];
        for (const row of rows) {
          const player = row?.player && typeof row.player === 'object' ? row.player : row;
          const id = Number.parseInt(String(player?.id ?? ''), 10);
          const direct = String(player?.name ?? '').trim();
          const first = String(player?.firstname ?? player?.first_name ?? '').trim();
          const last = String(player?.lastname ?? player?.last_name ?? '').trim();
          const combined = `${first} ${last}`.trim();
          const resolvedName = direct || combined;
          if (!Number.isFinite(id) || id <= 0 || !resolvedName) continue;
          if (isNameTokenMatch(playerName, resolvedName)) {
            apiSportsCache.set(keyName, id);
            return id;
          }
        }
      } catch {
        // ignore and continue
      }
    }
    apiSportsCache.set(keyName, null);
    return null;
  }

  let offset = 0;
  const pageSize = 500;
  let scanned = 0;
  let updated = 0;
  let unresolvedEntries = 0;

  while (true) {
    const { data: entries, error } = await supabase
      .from('fantasy_entries')
      .select('id,lineup')
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`fantasy_entries page failed: ${error.message}`);
    if (!entries || entries.length === 0) break;

    for (const entry of entries) {
      scanned += 1;
      const current = parseLineup(entry.lineup);
      if (current.length === 0) continue;

      let needsWrite = false;
      let unresolved = false;
      const next = [];
      for (const player of current) {
        if (Number.isFinite(player.player_id) && player.player_id > 0) {
          next.push({ player_id: player.player_id, player_name: player.player_name });
          continue;
        }
        const resolvedFromLive = idByName.get(normalizeNameKey(player.player_name)) || null;
        const resolvedFromApi = resolvedFromLive || (await resolveViaApiSports(player.player_name));
        const resolved = resolvedFromApi || null;
        if (!resolved) {
          unresolved = true;
          next.push({ player_id: null, player_name: player.player_name });
          continue;
        }
        needsWrite = true;
        next.push({ player_id: resolved, player_name: player.player_name });
      }

      if (unresolved) {
        unresolvedEntries += 1;
      }

      if (needsWrite) {
        const { error: upErr } = await supabase
          .from('fantasy_entries')
          .update({ lineup: next })
          .eq('id', entry.id);
        if (upErr) throw new Error(`update failed for ${entry.id}: ${upErr.message}`);
        updated += 1;
      }
    }

    offset += entries.length;
    if (entries.length < pageSize) break;
  }

  console.log(JSON.stringify({ scanned, updated, unresolvedEntries }, null, 2));
  if (unresolvedEntries > 0) {
    console.log('Some entries could not be fully resolved by name->id using live_player_stats snapshot.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

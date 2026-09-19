#!/usr/bin/env node
/* Read-only incident capture. Run from repo root with node --env-file=.env.local.
 * All requests are GET. No application imports, progress sweeps, or RPCs.
 * Private before-state stays under ignored tmp/, mode 0700/0600; never commit it.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const run = async () => {
  process.umask(0o077);
  const output = path.resolve('tmp/bingo-incident-private', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const manifest = { collectedAt: new Date().toISOString(), mode: 'GET-only', output, requests: [], files: [] };
  const save = (name, data) => {
    const contents = JSON.stringify(data, null, 2) + '\n';
    fs.writeFileSync(path.join(output, name + '.json'), contents, { mode: 0o600, flag: 'wx' });
    manifest.files.push({ name: name + '.json', sha256: crypto.createHash('sha256').update(contents).digest('hex') });
  };
  const request = async (service, endpoint, query) => {
    const base = service === 'database' ? process.env.NEXT_PUBLIC_SUPABASE_URL : (process.env.BALLDONTLIE_API_BASE_URL || 'https://api.balldontlie.io');
    const key = service === 'database' ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.BALLDONTLIE_API_KEY;
    const entry = { service, endpoint, query: query.toString(), collectedAt: new Date().toISOString(), status: null };
    manifest.requests.push(entry);
    if (!base || !key) { entry.error = 'missing-configuration'; throw new Error('missing-configuration'); }
    try {
      const response = await fetch(base.replace(/\/$/, '') + endpoint + '?' + query.toString(), {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: service === 'database' ? { apikey: key, Authorization: 'Bearer ' + key } : { Authorization: key },
      });
      entry.status = response.status;
      if (!response.ok) { entry.error = 'http-' + response.status; throw new Error(entry.error); }
      const json = await response.json();
      entry.rows = Array.isArray(json) ? json.length : Array.isArray(json.data) ? json.data.length : 1;
      entry.nextCursor = json.meta?.next_cursor ?? null;
      return json;
    } catch (error) {
      entry.error ||= error.cause?.code || error.name || 'request-failed';
      // Do not print error messages, URLs, response bodies, or headers with credentials.
      throw new Error(entry.error);
    }
  };
  const database = async (table, filters) => {
    const rows = [];
    for (let page = 0; page < 100; page++) {
      const result = await request('database', '/rest/v1/' + table,
        new URLSearchParams({ select: '*', order: 'id.asc', ...filters, limit: '500', offset: String(page * 500) }));
      if (!Array.isArray(result)) throw new Error('malformed-database-list');
      rows.push(...result);
      if (result.length < 500) return rows;
    }
    throw new Error('database-page-cap');
  };
  const provider = async (name, endpoint, filters, single = false) => {
    const rows = [], seen = new Set();
    let cursor = null, complete = false, error = null;
    try {
      for (let page = 0; page < 100; page++) {
        const query = new URLSearchParams({ per_page: '100', ...filters });
        if (cursor !== null) query.set('cursor', cursor);
        const result = await request('provider', endpoint, query);
        if (single && result.data && !Array.isArray(result.data)) { rows.push(result.data); complete = true; break; }
        if (!Array.isArray(result.data)) throw new Error('malformed-provider-list');
        rows.push(...result.data);
        const next = result.meta?.next_cursor;
        if (next === null || next === undefined || String(next) === '') { complete = true; break; }
        cursor = String(next);
        if (seen.has(cursor)) throw new Error('repeated-cursor');
        seen.add(cursor);
      }
      if (!complete) error = 'provider-page-cap';
    } catch (failure) { error = failure.message; }
    if (!complete) {
      manifest.providerErrors ||= [];
      manifest.providerErrors.push({ endpoint, error });
    }
    const result = { endpoint, filters, collectedAt: new Date().toISOString(), complete, error, rows };
    save(name, result);
    return result;
  };
  if (process.argv.includes('--coverage-only')) {
    // Representative provider-shape evidence, separate from the original incident boards.
    for (const [league, date] of [['nba', '2026-04-12'], ['wnba', '2026-08-12'], ['mlb', '2026-09-10']]) {
      const prefix = '/' + league + '/v1';
      const games = await provider(league + '-games', prefix + '/games', { 'dates[]': date });
      const game = games.rows.find(row => /final|post|completed/i.test(String(row.status) + ' ' + String(row.status_state)));
      if (!game) { manifest.coverageSelectionErrors ||= []; manifest.coverageSelectionErrors.push(league); continue; }
      save(league + '-selected-game', game);
      const statsPath = league === 'wnba' ? '/player_stats' : '/stats';
      await provider(league + '-stats', prefix + statsPath, { 'game_ids[]': String(game.id), ...(league === 'nba' ? { period: '0' } : {}) });
      await provider(league + '-plays', prefix + '/plays', { game_id: String(game.id) });
      if (league !== 'wnba') await provider(league + '-lineups', prefix + '/lineups', { 'game_ids[]': String(game.id) });
      if (league === 'nba') for (const period of [1, 2, 3, 4]) {
        await provider(league + '-period-' + period, prefix + statsPath, { 'game_ids[]': String(game.id), period: String(period) });
      }
    }
    save('manifest', manifest);
    console.log(JSON.stringify({ output, mode: 'coverage-only', requests: manifest.requests.map(({ endpoint, status, rows, error }) => ({ endpoint, status, rows, error })) }, null, 2));
    if (manifest.coverageSelectionErrors?.length || manifest.providerErrors?.length || manifest.requests.some(item => item.error)) process.exitCode = 1;
    return;
  }
  try {
    const venues = await database('venues', { name: 'ilike.*Brunswick*Grove*' });
    save('venues', venues);
    if (venues.length !== 1) throw new Error('venue-match-count-' + venues.length);
    const cards = await database('sports_bingo_cards', { venue_id: 'eq.' + venues[0].id });
    save('venue-cards-before', cards);
    // All statuses and all creation dates. Keep matching normalized ID OR matchup/date leads.
    const incidentCards = cards.filter(card => String(card.game_id).includes('1392216') ||
      (/patriots|seahawks/i.test([card.game_label, card.home_team, card.away_team].join(' ')) &&
       String(card.starts_at) >= '2026-09-09' && String(card.starts_at) < '2026-09-11'));
    save('incident-cards-before', incidentCards);
    const squares = [];
    for (const card of incidentCards) squares.push(...await database('sports_bingo_squares', { card_id: 'eq.' + card.id }));
    save('incident-squares-before', squares);
    manifest.venueId = venues[0].id;
    manifest.venueCardCount = cards.length;
    manifest.incidentCardCount = incidentCards.length;
    manifest.incidentSquareCount = squares.length;
    const incidentUserIds = [...new Set(incidentCards.map(card => card.user_id))];
    for (const [userIndex, userId] of incidentUserIds.entries()) {
      // Private consequence snapshots, restricted to this incident's player and venue.
      const lookups = [
        ['users', { id: 'eq.' + userId, select: 'id,venue_id,points' }],
        ['notifications', { user_id: 'eq.' + userId, created_at: 'gte.2026-09-09T00:00:00Z' }],
        ['challenge_campaign_progress', { user_id: 'eq.' + userId, venue_id: 'eq.' + venues[0].id }],
        ['challenge_cycle_winners', { winner_user_id: 'eq.' + userId, venue_id: 'eq.' + venues[0].id }],
        ['challenge_campaign_redemptions', { winner_user_id: 'eq.' + userId, venue_id: 'eq.' + venues[0].id }],
      ];
      for (const [table, filters] of lookups) {
        const name = 'consequences-' + table + (incidentUserIds.length > 1 ? '-player-' + (userIndex + 1) : '');
        try { save(name, await database(table, filters)); }
        catch (failure) {
          manifest.consequenceErrors ||= [];
          manifest.consequenceErrors.push({ table, error: failure.message });
          save(name, { error: failure.message });
        }
      }
    }
  } catch (failure) { manifest.databaseError = failure.message; }
  const game = await provider('provider-game', '/nfl/v1/games/1392216', {}, true);
  await provider('provider-stats', '/nfl/v1/stats', { 'game_ids[]': '1392216' });
  await provider('provider-team-stats', '/nfl/v1/team_stats', { 'game_ids[]': '1392216' });
  await provider('provider-plays', '/nfl/v1/plays', { game_id: '1392216' });
  const teams = [game.rows[0]?.home_team?.id, game.rows[0]?.visitor_team?.id].filter(Number.isFinite);
  for (const team of teams) {
    await provider('provider-roster-' + team, '/nfl/v1/players', { 'team_ids[]': String(team) });
    await provider('provider-designations-' + team, '/nfl/v1/player_designations',
      { season: '2026', week: '1', 'season_types[]': '2', 'team_ids[]': String(team) });
  }
  await provider('provider-injuries-current', '/nfl/v1/player_injuries', {});
  save('manifest', manifest);
  console.log(JSON.stringify({ output, venueId: manifest.venueId, cards: manifest.incidentCardCount, squares: manifest.incidentSquareCount,
    failures: manifest.requests.filter(item => item.error).map(({ service, endpoint, error }) => ({ service, endpoint, error })) }, null, 2));
  if (manifest.databaseError || manifest.providerErrors?.length || manifest.consequenceErrors?.length || manifest.requests.some(item => item.error)) process.exitCode = 1;
};
run().catch(() => { console.error('Capture failed; inspect private manifest if present. No remote writes were attempted.'); process.exitCode = 1; });

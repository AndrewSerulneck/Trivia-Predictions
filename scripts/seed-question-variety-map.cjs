#!/usr/bin/env node
/* Seed the variety map from data/question-variety/draft-map.json
 * (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a; D14: Andrew reviews the draft once).
 *
 *   node --env-file=.env.local scripts/seed-question-variety-map.cjs                 # dry run: what would be added
 *   node --env-file=.env.local scripts/seed-question-variety-map.cjs --apply         # adds the missing areas
 *   node scripts/seed-question-variety-map.cjs --markdown <file>                     # writes a readable copy (no DB)
 *   ... --game speed                                                                 # one game only
 *
 * Only ADDS areas that aren't there yet (matched by game, category and name). It never edits, switches off or removes
 * an area, so Andrew's changes on the Variety page always win. Free: no paid calls.
 */
const fs = require('node:fs');
const path = require('node:path');
const map = require('../lib/question-variety/map.cjs');

const DRAFT_PATH = path.resolve(__dirname, '../data/question-variety/draft-map.json');
const PAGE = 1000;

const parseArgs = argv => {
  const args = { apply: false, game: null, markdown: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--game') args.game = String(argv[++i] ?? '');
    else if (arg === '--markdown') args.markdown = String(argv[++i] ?? '').trim();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.game !== null && !map.isGame(args.game)) throw new Error('--game must be speed or live.');
  if (args.markdown && args.apply) throw new Error('--markdown never touches the database; drop --apply.');
  return args;
};

const readDraft = (file = DRAFT_PATH) => JSON.parse(fs.readFileSync(file, 'utf8'));

const readExisting = async (client, game) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let query = client.from('question_coverage_areas').select('id, game, category, name, position').order('id').range(from, from + PAGE - 1);
    if (game) query = query.eq('game', game);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
};

/** What the seed would add: draft areas missing from the database, positioned after what's there. */
const planSeed = (draftRows, existing) => {
  const have = new Set(existing.map(r => `${r.game}|${r.category}|${map.areaKey(r.name)}`));
  const maxPosition = new Map();
  for (const r of existing) {
    const key = `${r.game}|${r.category}`;
    maxPosition.set(key, Math.max(maxPosition.get(key) ?? -1, r.position ?? 0));
  }
  const add = [];
  const indexInCategory = new Map();
  for (const row of draftRows) {
    const key = `${row.game}|${row.category}`;
    const i = indexInCategory.get(key) ?? 0;
    indexInCategory.set(key, i + 1);
    if (have.has(`${key}|${map.areaKey(row.name)}`)) continue;
    add.push({ ...row, position: (maxPosition.get(key) ?? -1) + 1 + i });
  }
  return add;
};

const summarize = rows => rows.reduce((acc, r) => {
  const key = `${r.game} / ${r.category}`;
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

const seed = async ({ client, apply, game, draft = readDraft() }) => {
  const draftRows = map.draftAreas(draft).filter(r => !game || r.game === game);
  const existing = await readExisting(client, game);
  const add = planSeed(draftRows, existing);
  const result = { mode: apply ? 'apply' : 'dry-run', version: draft.version, draftAreas: draftRows.length, existing: existing.length, toAdd: add.length, byCategory: summarize(add) };
  if (!apply || !add.length) return { ...result, added: 0 };
  const createdBy = `seed:${draft.version}`;
  let added = 0;
  for (let i = 0; i < add.length; i += 200) {
    const part = add.slice(i, i + 200).map(r => ({ game: r.game, category: r.category, name: r.name, eras: r.eras, note: r.note, position: r.position, created_by: createdBy }));
    const { data, error } = await client.from('question_coverage_areas').insert(part).select('id');
    if (error) throw new Error(error.message);
    added += data.length;
  }
  return { ...result, added };
};

/** A plain-English copy of the draft for review. */
const toMarkdown = draft => {
  const lines = [`# Variety map draft (${draft.version})`, '', 'Review once (D14). Afterwards, edit areas on Admin → Trivia Questions → Variety.', ''];
  for (const [game, categories] of Object.entries(draft.games)) {
    lines.push(`## ${game === 'speed' ? 'Speed Trivia' : 'Live Trivia'}`, '');
    for (const [category, spec] of Object.entries(categories)) {
      const set = draft.eraSets[spec.eraSet];
      lines.push(`### ${category}`, '', `Eras: ${set.join(', ')}`, '');
      for (const area of spec.areas) {
        const eras = area.eras ? ` — ${area.eras.join(', ')}` : '';
        const note = area.note ? ` (${area.note})` : '';
        lines.push(`- ${area.name}${eras}${note}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const draft = readDraft();
  map.draftAreas(draft); // validates
  if (args.markdown) {
    fs.writeFileSync(path.resolve(args.markdown), toMarkdown(draft));
    console.log(JSON.stringify({ mode: 'markdown', file: args.markdown }, null, 2));
    return;
  }
  const { clientFromEnv } = require('./lib/speedTriviaServiceClient.cjs');
  console.log(JSON.stringify(await seed({ client: clientFromEnv(), apply: args.apply, game: args.game, draft }), null, 2));
};

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

module.exports = { parseArgs, readDraft, planSeed, seed, toMarkdown };

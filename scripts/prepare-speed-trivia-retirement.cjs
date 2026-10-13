#!/usr/bin/env node
// Refresh content-bound evidence without buying more comparisons or changing data.
const fs = require('node:fs');
const path = require('node:path');
const core = require('../lib/speed-trivia-uniqueness/core.cjs');
const retirement = require('../lib/speed-trivia-uniqueness/retirement.cjs');
const support = require('./speed-trivia-phase2-support.cjs');

const prepare = ({ snapshot, journal, revision, output }) => {
  if (!/^\d+$/.test(revision)) throw new Error('numeric-live-revision-required');
  const original = support.readSnapshot(snapshot);
  const corpus = core.createCorpus(original.rows, { complete: true, expectedCount: original.rows.length, revision });
  const byId = new Map(corpus.rows.map(row => [row.id, row]));
  const modelVersion = 'gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1';
  const comparisons = [], stale = [];
  for (const line of fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean)) {
    const pair = JSON.parse(line), a = byId.get(pair.aId), b = byId.get(pair.bId);
    if (pair.modelVersion !== modelVersion) throw new Error('comparison-model-drift');
    if (!a || !b || core.contentHash(a) !== pair.aHash || core.contentHash(b) !== pair.bHash) {
      stale.push(pair.id); continue;
    }
    if (!core.validDecision(pair.result)) throw new Error('invalid-cached-decision');
    comparisons.push(pair);
  }
  const bytes = fs.readFileSync(path.join(snapshot, 'dependencies.json'));
  const expected = fs.readFileSync(path.join(snapshot, 'dependencies.sha256'), 'utf8').split(' ')[0];
  if (core.hash(bytes.toString()) !== expected) throw new Error('reference-checksum-mismatch');
  const dependencies = JSON.parse(bytes)[0].evidence, references = {};
  for (const count of dependencies.per_question_counts) {
    references[count.id] ||= { total: 0, byTable: {} };
    references[count.id].byTable[count.reference] = Number(count.records);
    references[count.id].total += Number(count.records);
  }
  const manifest = retirement.createRetirementManifest({ corpus, comparisons, references, modelVersion,
    referenceEvidence: { capturedAt: dependencies.captured_at, sha256: expected, source: path.join(snapshot, 'dependencies.json') },
    coverage: { exhaustive: false, reusedPairs: comparisons.length, stalePairs: stale.length, paidRequests: 0,
      warning: 'Reused direct-pair evidence only. Unexamined or newly added rows are not certified unique.' } });
  support.privateDirectory(output);
  support.writeExclusive(path.join(output, 'refreshed-manifest.json'), manifest);
  support.writeExclusive(path.join(output, 'reuse-evidence.json'), { snapshot, journal, revision, stale, summary: manifest.summary });
  return { manifest, corpus, comparisons, references };
};
module.exports = { prepare };
if (require.main === module) {
  const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
  try {
    for (const name of ['--snapshot', '--journal', '--revision', '--output']) if (!args.includes(name)) throw new Error('missing-' + name);
    const { manifest } = prepare({ snapshot: value('--snapshot'), journal: value('--journal'), revision: value('--revision'), output: value('--output') });
    console.log(JSON.stringify(manifest.summary));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

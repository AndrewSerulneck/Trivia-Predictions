#!/usr/bin/env node
/* Freeze a passing paid evaluation of the Speed repeat checker as release evidence (Phase 4f.2, D40).
 *
 *   node scripts/freeze-speed-trivia-uniqueness-evidence.cjs --report <evaluation-*.json> --output <the run's dir> \
 *     --fixture tests/fixtures/speed-trivia-uniqueness/evaluation-v1.json --out tests/fixtures/speed-trivia-uniqueness/release-openai-evaluation-v1.json
 *
 * Reads the run's report (metrics, retrieval, gates) and its private pair cache, and writes every recorded verdict the
 * fixture's pairs need, plus the core and provider file hashes, so tests replay the decision with no API call.
 * Refuses a report whose gates failed, a fixture or core that changed since, or a missing verdict. Free.
 */
const fs = require('node:fs');
const path = require('node:path');
const core = require('../lib/speed-trivia-uniqueness/core.cjs');
const support = require('./speed-trivia-phase2-support.cjs');

const PROVIDER = 'lib/speed-trivia-uniqueness/openai.cjs';

const freeze = ({ report: reportFile, output, fixture: fixtureFile, out }) => {
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  if (report.gates !== true || report.mode !== 'paid-fixed-set') throw new Error('Only a passing paid evaluation can be frozen.');
  const fixtureBytes = fs.readFileSync(fixtureFile, 'utf8');
  if (core.hash(fixtureBytes) !== report.fixtureHash) throw new Error('The fixture changed since the evaluation.');
  for (const key of ['policyVersion', 'extractorVersion', 'retrievalVersion']) {
    const current = { policyVersion: core.POLICY_VERSION, extractorVersion: core.EXTRACTOR_VERSION, retrievalVersion: core.RETRIEVAL_VERSION }[key];
    if (report[key] !== current) throw new Error(`${key} changed since the evaluation.`);
  }
  const cache = support.openCache(path.resolve(output));
  const fixture = JSON.parse(fixtureBytes);
  const recordedComparisons = [];
  for (const pair of fixture.pairs) {
    const a = support.fixtureRow(pair.a, `${pair.id}:a`), b = support.fixtureRow(pair.b, `${pair.id}:b`);
    try { core.content(a); core.content(b); } catch { continue; }
    if (core.deterministicPair(a, b)) continue;
    const key = core.pairKey(a, b, report.modelVersion);
    const entry = cache.get(key);
    if (!entry || entry.modelVersion !== report.modelVersion) throw new Error(`Missing recorded verdict for ${pair.id}.`);
    recordedComparisons.push({ id: pair.id, key, modelVersion: entry.modelVersion, firstHash: entry.firstHash, result: entry.result });
  }
  const evidence = {
    version: `speed-uniqueness-release-evaluation-${path.basename(fixtureFile, '.json')}-openai`,
    createdDate: new Date().toISOString().slice(0, 10),
    policyVersion: report.policyVersion, extractorVersion: report.extractorVersion, retrievalVersion: report.retrievalVersion,
    modelVersion: report.modelVersion, fixtureHash: report.fixtureHash,
    coreSha256: core.hash(fs.readFileSync('lib/speed-trivia-uniqueness/core.cjs', 'utf8')),
    providerSha256: core.hash(fs.readFileSync(PROVIDER, 'utf8')),
    corpusRevision: report.corpusRevision, corpusDigest: report.corpusDigest, corpusRows: report.corpusRows,
    scope: report.scope, metrics: report.metrics, gates: report.gates, budget: report.budget,
    recordedComparisons,
    retrieval: report.cases.map(c => ({ id: c.id, label: c.label, split: c.split, found: c.retrieval?.found ?? false, complete: c.retrieval?.complete ?? false, hits: c.retrieval?.hits ?? 0 })),
  };
  const body = `${JSON.stringify(evidence, null, 2)}\n`;
  fs.writeFileSync(out, body);
  fs.writeFileSync(out.replace(/\.json$/, '.sha256'), `${core.hash(body)}\n`);
  return { out, comparisons: recordedComparisons.length, modelVersion: evidence.modelVersion };
};

module.exports = { freeze };
if (require.main === module) {
  const args = process.argv.slice(2);
  const value = key => args[args.indexOf(key) + 1];
  for (const key of ['--report', '--output', '--fixture', '--out']) if (!args.includes(key)) throw new Error('Provide --report --output --fixture --out.');
  console.log(JSON.stringify(freeze({ report: value('--report'), output: value('--output'), fixture: value('--fixture'), out: value('--out') })));
}

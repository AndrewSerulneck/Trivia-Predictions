#!/usr/bin/env node
// Explicitly capped, resumable Phase 5 comparisons. No production writes.
const fs = require('node:fs');
const path = require('node:path');
const core = require('../lib/speed-trivia-uniqueness/core.cjs');
const gemini = require('../lib/speed-trivia-uniqueness/gemini.cjs');
const retirement = require('../lib/speed-trivia-uniqueness/retirement.cjs');
const support = require('./speed-trivia-phase2-support.cjs');
const run = async ({ snapshot, planFile, planHash, oldJournal, output, cap, paid = false }) => {
  const bytes = fs.readFileSync(planFile, 'utf8');
  if (core.hash(bytes) !== planHash) throw new Error('audit-plan-checksum-mismatch');
  const plan = JSON.parse(bytes), original = support.readSnapshot(snapshot);
  if (!/^\d+$/.test(plan.corpusRevision)) throw new Error('numeric-live-revision-required');
  const corpus = core.createCorpus(original.rows, { complete: true, expectedCount: original.rows.length, revision: plan.corpusRevision });
  if (plan.corpusDigest !== corpus.digest) throw new Error('audit-corpus-digest-mismatch');
  const byId = new Map(corpus.rows.map(row => [row.id, row]));
  for (const task of plan.tasks) if (!byId.has(task.aId) || !byId.has(task.bId) || core.contentHash(byId.get(task.aId)) !== task.aHash || core.contentHash(byId.get(task.bId)) !== task.bHash) throw new Error('stale-audit-task');
  if (!paid) return { tasks: plan.tasks.length, mutations: 0, paidRequests: 0, capRequired: true };
  const directory = support.privateDirectory(output);
  const budget = support.openBudget(directory, { dollars: cap, maxRequests: 8000, maxInputTokens: 20000000, maxOutputTokens: 4500000, maxElapsedMs: 7200000 });
  // Every handled failure after acquisition must release this run's lock.
  try {
    const cache = support.openCache(directory);
    const judge = gemini.createJudge({ apiKey: process.env.GEMINI_API_KEY, budget, cache });
    const journal = path.join(directory, 'adjudicated-pairs.jsonl'), comparisons = new Map();
    const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
    for (const pair of read(oldJournal)) {
      if (pair.modelVersion !== judge.modelVersion) throw new Error('model-version-drift');
      if (byId.has(pair.aId) && byId.has(pair.bId) && core.contentHash(byId.get(pair.aId)) === pair.aHash && core.contentHash(byId.get(pair.bId)) === pair.bHash) comparisons.set(pair.id, pair);
    }
    const complete = new Set();
    for (const pair of read(journal)) {
      if (pair.corpusDigest !== corpus.digest || pair.modelVersion !== judge.modelVersion) throw new Error('refresh-journal-drift');
      comparisons.set(pair.id, pair); complete.add(pair.id);
    }
    let cursor = 0, processed = complete.size, failure = null, retries = 0;
    const worker = async () => {
      while (!failure && cursor < plan.tasks.length) {
        const task = plan.tasks[cursor++];
        if (complete.has(task.id)) continue;
        const input = { id: task.id, a: byId.get(task.aId), b: byId.get(task.bId) };
        let result;
        try {
          try { [result] = await judge.adjudicate([input]); }
          catch (error) {
            if (failure || !/^semantic-http-(429|502|503|504)$/.test(error.message) || retries >= 20) throw error;
            retries++; [result] = await judge.adjudicate([input]);
          }
        } catch (error) {
          if (['semantic-result-incomplete-or-invalid', 'semantic-json-invalid', 'semantic-truncated-or-blocked'].includes(error.message)) {
            result = { id: task.id, decision: 'uncertain', fact: 'Unverified comparison', explanation: error.message, qualityA: 'unverified', qualityB: 'unverified', confidence: 'low' };
          } else { failure ||= error.message; break; }
        }
        const pair = { ...task, result, corpusDigest: corpus.digest, modelVersion: judge.modelVersion };
        fs.appendFileSync(journal, JSON.stringify(pair) + '\n', { mode: 0o600 });
        comparisons.set(task.id, pair); complete.add(task.id); processed++;
        if (processed % 100 === 0) console.log(JSON.stringify({ processed, total: plan.tasks.length, budget: budget.summary() }));
      }
    };
    // A failed write must stop new work, while already-started requests retain
    // exclusive ownership of the budget until they have all settled.
    const workers = await Promise.allSettled(Array.from({ length: 6 }, () => worker().catch(error => {
      failure ||= error.message || 'audit-worker-failure';
      throw error;
    })));
    const rejected = workers.find(result => result.status === 'rejected');
    if (rejected) throw rejected.reason;
    const dependenciesBytes = fs.readFileSync(path.join(snapshot, 'dependencies.json'));
    const dependencies = JSON.parse(dependenciesBytes)[0].evidence, references = {};
    for (const count of dependencies.per_question_counts) {
      references[count.id] ||= { total: 0, byTable: {} };
      references[count.id].byTable[count.reference] = Number(count.records);
      references[count.id].total += Number(count.records);
    }
    const coverage = { exhaustive: false, selectedTasks: plan.tasks.length, processed, failure, retries, budget: budget.summary(), productionMutations: 0 };
    const manifest = retirement.createRetirementManifest({ corpus, comparisons: [...comparisons.values()], references, modelVersion: judge.modelVersion,
      referenceEvidence: { capturedAt: dependencies.captured_at, sha256: core.hash(dependenciesBytes.toString()), source: path.join(snapshot, 'dependencies.json') }, coverage });
    support.writeExclusive(path.join(directory, `refreshed-manifest-${Date.now()}.json`), manifest);
    support.writeExclusive(path.join(directory, `coverage-${Date.now()}.json`), coverage);
    return { summary: manifest.summary, coverage };
  } finally { budget.close(); }
};
module.exports = { run };
if (require.main === module) {
  const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
  run({ snapshot: value('--snapshot'), planFile: value('--plan'), planHash: value('--sha256'), oldJournal: value('--journal'), output: value('--output'), cap: Number(value('--cap')), paid: args.includes('--paid') })
    .then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}

#!/usr/bin/env node
// Read-only GitHub audit. Raw logs remain private and are never printed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repo = 'AndrewSerulneck/Trivia-Predictions';
const main = () => {
  process.umask(0o077);
  const directory = process.argv[2];
  if (!directory || !fs.existsSync(path.join(directory,'manifest.json'))) throw new Error('Pass completed private inventory directory');
  const inventory = JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
  if (!inventory.completed) throw new Error('Inventory incomplete');
  const output = path.join(directory,'github'); fs.mkdirSync(output,{mode:0o700});
  const files = [];
  const save = (name, body) => {
    const value = typeof body === 'string' ? body : JSON.stringify(body,null,2)+'\n';
    fs.writeFileSync(path.join(output,name),value,{mode:0o600,flag:'wx'});
    files.push({name,bytes:Buffer.byteLength(value),sha256:crypto.createHash('sha256').update(value).digest('hex')});
  };
  const gh = args => execFileSync('gh',args,{encoding:'utf8',maxBuffer:30*1024*1024,timeout:60000,stdio:['ignore','pipe','pipe']});
  const api = suffix => JSON.parse(gh(['api',`repos/${repo}/${suffix}`]));
  const workflow = api('actions/workflows/trivia-nightly.yml'); save('workflow.json',workflow);
  const list = api('actions/workflows/trivia-nightly.yml/runs?per_page=14'); save('runs.json',list);
  const summary = [];
  for (const run of list.workflow_runs) {
    const jobs = api(`actions/runs/${run.id}/jobs?per_page=100`); save(`${run.id}-jobs.json`,jobs);
    const logs = gh(['run','view',String(run.id),'--repo',repo,'--log']); save(`${run.id}-logs.txt`,logs);
    const captures = regex => Array.from(logs.matchAll(regex));
    const numbers = regex => captures(regex).map(match=>Number(match[1]));
    const loaded = numbers(/Loaded (\d+) existing anytime_blitz questions from Supabase\./g);
    const generated = numbers(/\bAdded: (\d+)/g).reduce((sum,n)=>sum+n,0);
    const attempts = captures(/Attempt (\d+)\/10: accepted (\d+)\/(\d+) questions for (\S+)/g);
    const importedProgress = captures(/Upserted (\d+)\/(\d+) questions/g);
    const importerSkipped = numbers(/Skipped (\d+) duplicate question\(s\) already present/g).reduce((s,n)=>s+n,0);
    const nearSkipped = numbers(/Skipped (\d+) near-duplicate question\(s\) already present/g).reduce((s,n)=>s+n,0);
    const childExact = numbers(/Skipped exact duplicates: (\d+)/g).reduce((s,n)=>s+n,0);
    const childNear = numbers(/Skipped near duplicates: (\d+)/g).reduce((s,n)=>s+n,0);
    summary.push({id:run.id,runNumber:run.run_number,createdAt:run.created_at,headSha:run.head_sha,event:run.event,conclusion:run.conclusion,
      seconds:(Date.parse(run.updated_at)-Date.parse(run.created_at))/1000,children:loaded.length,loadedRows:loaded,
      refillInvocations:captures(/pass [2-4]\)/g).length,loggedGenerationAttempts:attempts.length,
      providerRetryMessages:captures(/Gemini request retry /g).length,fallbackMessages:captures(/Model "/g).length,
      generated,importAttempted:importedProgress.length?Number(importedProgress.at(-1)[2]):0,
      imported:importedProgress.length?Number(importedProgress.at(-1)[1]):0,importerSkipped,nearSkipped,childExact,childNear,
      // Existing logs lack raw candidates, billed tokens, actual model/fallback success and cost.
      candidateCount:null,billedTokens:null,spend:null});
  }
  for (const source of ['.github/workflows/trivia-nightly.yml','scripts/generate-trivia-nightly.cjs','scripts/generate-trivia-questions.cjs','scripts/import-trivia-questions.cjs']) {
    const remote = api(`contents/${source}?ref=${list.workflow_runs[0].head_sha}`);
    const content = Buffer.from(remote.content,'base64').toString('utf8');
    save('latest-'+path.basename(source), content);
  }
  save('summary.json',summary); save('manifest.json',{repo,collectedAt:new Date().toISOString(),workflowState:workflow.state,files});
  console.log(JSON.stringify({workflowState:workflow.state,runs:summary.length,summary:summary.map(({id,children,loggedGenerationAttempts,generated,imported,seconds})=>({id,children,loggedGenerationAttempts,generated,imported,seconds}))},null,2));
};
try { main(); } catch { console.error('Workflow capture incomplete; raw logs are private. No workflow changes attempted.'); process.exitCode=1; }

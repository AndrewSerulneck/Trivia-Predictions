#!/usr/bin/env node
// Free, offline Phase 3 preparation. Never loads credentials or calls a provider.
const fs=require('node:fs');
const path=require('node:path');
const core=require('../lib/speed-trivia-uniqueness/core.cjs');
const runtime=require('../lib/speed-trivia-uniqueness/runtime.cjs');
const review=require('../lib/speed-trivia-uniqueness/review.cjs');
const audit=require('../lib/speed-trivia-uniqueness/audit.cjs');
const gemini=require('../lib/speed-trivia-uniqueness/gemini.cjs');
const {checkedJSON}=require('./audit-speed-trivia-pending.cjs');
const {verifyBackup}=require('./audit-speed-trivia-inventory.cjs');
const {privateDirectory,writeExclusive}=require('./speed-trivia-phase2-support.cjs');
const verifiedCache=(files,corpus)=>{
 const hashes=new Set(corpus.rows.map(core.contentHash)),cache=new Map(),sources=[];
 for(const file of files){
  const bytes=fs.readFileSync(file),entries=audit.readLines(file);let rejected=0;
  for(const entry of entries){
   if(typeof entry.key!=='string'||entry.value?.modelVersion!==audit.MODEL_VERSION||!core.validDecision(entry.value.result)||!hashes.has(entry.value.firstHash)){rejected++;continue;}
   cache.set(entry.key,entry.value);
  }
  sources.push({file,bytes:bytes.length,sha256:core.hash(bytes.toString('utf8')),entries:entries.length,rejected});
 }
 return {cache,sources};
};
const reconcile=(original,corpus)=>{
 const current=new Map(corpus.rows.map(row=>[row.id,row])),targets=[],concurrent=[];
 for(const target of original){
  const row=current.get(target.id);
  if(!row||row.status!=='pending_review'||core.contentHash(row)!==target.contentHash||runtime.stateHash(row)!==target.stateHash){
   concurrent.push({...target,currentStatus:row?.status||null,reason:!row?'left_speed_pool':row.status!=='pending_review'?'status_changed':'version_changed'});
  }else targets.push({id:target.id,contentHash:target.contentHash,stateHash:target.stateHash});
 }
 const originalIds=new Set(original.map(row=>row.id));
 return {targets,concurrent,newPending:corpus.rows.filter(row=>row.status==='pending_review'&&!originalIds.has(row.id)).map(row=>({id:row.id,contentHash:core.contentHash(row),stateHash:runtime.stateHash(row)}))};
};
const main=args=>{
 process.umask(0o077);
 const value=name=>args[args.indexOf(name)+1],snapshot=value('--snapshot'),output=privateDirectory(value('--output'));
 const backup=verifyBackup(snapshot),referenceReport=checkedJSON(value('--reference-report')),references=checkedJSON(value('--references'));
 if(backup.project!=='pkmxupsayzshvpirkaav'||referenceReport.rows!==backup.rows)throw new Error('reference-snapshot-mismatch');
 const referenceDirectory=path.dirname(value('--reference-report'));
 const before=checkedJSON(path.join(referenceDirectory,'audit-revision-before.json'))[0],after=checkedJSON(path.join(referenceDirectory,'audit-revision-after.json'))[0];
 if(before.state_digest!==backup.corpusRevision||after.state_digest!==backup.corpusRevision||before.revision!==referenceReport.revision||after.revision!==referenceReport.revision)throw new Error('reference-snapshot-revision-mismatch');
 const rows=JSON.parse(fs.readFileSync(path.join(snapshot,'speed-questions.json'))),corpus=core.createCorpus(rows,{complete:true,expectedCount:backup.rows,revision:referenceReport.revision});
 const original=checkedJSON(value('--targets')),cohort=reconcile(original.rows||original,corpus);
 writeExclusive(path.join(output,'corpus.json'),corpus);
 writeExclusive(path.join(output,'targets.json'),cohort.targets);
 writeExclusive(path.join(output,'references.json'),references);
 writeExclusive(path.join(output,'cohort-reconciliation.json'),{originalTargets:(original.rows||original).length,...cohort});
 const {cache,sources}=verifiedCache(value('--caches').split(',').filter(Boolean),corpus);
 const cacheText=[...cache].map(([key,val])=>JSON.stringify({key,value:val})+'\n').join(''),cacheFile=path.join(output,'validated-cache.jsonl');
 fs.writeFileSync(cacheFile,cacheText,{flag:'wx',mode:0o600});fs.writeFileSync(cacheFile+'.sha256',core.hash(cacheText)+'\n',{flag:'wx',mode:0o600});
 const plan=audit.planAudit({corpus,targets:cohort.targets,cache,references});
 writeExclusive(path.join(output,'pending-audit-plan.json'),plan);
 const missing=plan.tasks.filter(task=>!task.cached),maxRetries=plan.summary.retryCeiling;
 const inputBase=missing.reduce((n,task)=>n+task.inputTokens,0),maxInput=missing.reduce((n,task)=>Math.max(n,task.inputTokens),0);
 const maximumReservation=missing.reduce((n,task)=>Math.max(n,task.reservationMicrodollars),0)/1e6;
 const mean=plan.summary.meanEstimateDollars,lostAllowance=plan.summary.allLostReservationDollars*.01;
 const allowance=mean*.2,retryAllowance=maxRetries*.000664214;
 const cap=Math.ceil((mean+allowance+retryAllowance+lostAllowance)/5)*5;
 // Bounds include a 20% dynamic-work allowance, still confined to direct family
 // competitors by the controller, and <=5% retries of the original frozen tasks.
 const dynamicRequests=Math.ceil(missing.length*.2),maxRequests=missing.length+maxRetries+dynamicRequests;
 const approvalDraft={auditId:'speed-pending-variety-phase3-2026-10-14',approvedBy:null,questionTransferApproved:false,
  planHash:core.hash(runtime.canonicalText(plan)),capMicrodollars:cap*1e6,maxRequests,maxRetries,
  maxInputTokens:inputBase+(maxRetries+dynamicRequests)*maxInput,maxOutputTokens:maxRequests*8192};
 writeExclusive(path.join(output,'approval-draft-NOT-AUTHORIZED.json'),approvalDraft);
 const report={mode:'read-only-preparation',output,snapshot,revision:corpus.revision,corpusDigest:corpus.digest,
  originalTargets:(original.rows||original).length,eligibleTargets:cohort.targets.length,concurrentlyChanged:cohort.concurrent.length,newPending:cohort.newPending.length,
  counts:rows.reduce((counts,row)=>(counts[row.status]=(counts[row.status]||0)+1,counts),{}),
  indexReady:referenceReport.indexReady,missingIndexes:referenceReport.missingIndexes,cacheSources:sources,validatedCacheEntries:cache.size,
  planHash:approvalDraft.planHash,taskHash:plan.taskHash,summary:plan.summary,
  cost:{historicalMeanPerCall:.000664214,meanDollars:mean,workAndUsageAllowanceDollars:allowance,retryAllowanceDollars:retryAllowance,
   onePercentLostReservationDollars:lostAllowance,recommendedCapDollars:cap,maximumSingleLostReservationDollars:maximumReservation,
   basePromptBytes:inputBase-missing.length*4096,baseInputReservationTokens:inputBase,dynamicRequests,maxRequests,maxRetries,maxInputTokens:approvalDraft.maxInputTokens,maxOutputTokens:approvalDraft.maxOutputTokens,
   providerInvoicesMeasured:false,completionGuaranteed:false},paidRequests:0,mutations:0};
 writeExclusive(path.join(output,'preparation-report.json'),report);
 // Exact outstanding list; cache flags and families are workload evidence, not
 // per-row semantic completion or an application-ready disposition.
 writeExclusive(path.join(output,'unfinished-proposal.json'),{mode:'proposal-only',applyReady:false,planHash:approvalDraft.planHash,
  outcomes:cohort.targets.map(target=>({...target,disposition:{state:'not_processed',reason:'paid_approval_required'},evidence:null})),
  concurrentlyChanged:cohort.concurrent,summary:{active:0,retired_repeat:0,hold:0,not_processed:cohort.targets.length,concurrently_changed:cohort.concurrent.length},paidRequests:0,mutations:0});
 const index=core.buildIndex(corpus);
 for(const task of plan.tasks){
  const a=index.byId.get(task.aId).row,b=index.byId.get(task.bId).row;
  if(task.key!==core.pairKey(a,b,audit.MODEL_VERSION)||task.aHash!==core.contentHash(a)||task.bHash!==core.contentHash(b)||task.promptHash!==core.hash(gemini.buildPrompt([{id:'comparison',a,b}])))throw new Error('task-proof-mismatch');
  if(task.cached&&!review.cachedVerdict(cache,a,b,audit.MODEL_VERSION))throw new Error('invalid-cached-task');
 }
 for(const file of fs.readdirSync(output).filter(name=>name.endsWith('.sha256'))) if(core.hash(fs.readFileSync(path.join(output,file.slice(0,-7)),'utf8'))!==fs.readFileSync(path.join(output,file),'utf8').trim())throw new Error('reopened-checksum-failure');
 writeExclusive(path.join(output,'verification-report.json'),{checksumsReopened:fs.readdirSync(output).filter(name=>name.endsWith('.sha256')).length,taskHashesVerified:plan.tasks.length,targetsVerified:cohort.targets.length,paidRequests:0,mutations:0});
 return report;
};
module.exports={verifiedCache,reconcile,main};
if(require.main===module){try{console.log(JSON.stringify(main(process.argv.slice(2))));}catch(error){console.error(error.message);process.exitCode=1;}}

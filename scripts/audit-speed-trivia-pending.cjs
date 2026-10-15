#!/usr/bin/env node
// Phase 3 entry point. Dry-run by default. Never applies proposals or loads env files.
const fs=require('node:fs');
const path=require('node:path');
const core=require('../lib/speed-trivia-uniqueness/core.cjs');
const runtime=require('../lib/speed-trivia-uniqueness/runtime.cjs');
const audit=require('../lib/speed-trivia-uniqueness/audit.cjs');
const support=require('./speed-trivia-phase2-support.cjs');
const checkedJSON=file=>{
 const bytes=fs.readFileSync(file,'utf8'),expected=fs.readFileSync(file+'.sha256','utf8').trim().split(' ')[0];
 if(core.hash(bytes)!==expected)throw new Error('input-checksum-mismatch');return JSON.parse(bytes);
};
const loadCaches=files=>{
 const cache=new Map();
 for(const file of files)for(const entry of audit.readLines(file)){
  if(entry.value?.modelVersion===audit.MODEL_VERSION&&core.validDecision(entry.value.result))cache.set(entry.key,entry.value);
 }
 return cache;
};
const main=async args=>{
 const value=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
 const output=support.privateDirectory(value('--output'));
 if(args.includes('--recover-lock')){audit.recoverLock(output,value('--nonce'));return {recovered:true};}
 const source=checkedJSON(value('--corpus')),targets=checkedJSON(value('--targets')),references=checkedJSON(value('--references'));
 const corpus=core.createCorpus(source.rows||source,{complete:true,expectedCount:(source.rows||source).length,revision:value('--revision')});
 const cache=loadCaches((value('--caches')||'').split(',').filter(Boolean));
 if(args.includes('--plan')){
  const plan=audit.planAudit({corpus,targets:targets.rows||targets,cache,references});
  const file=path.join(output,'pending-audit-plan.json');support.writeExclusive(file,plan);
  return {summary:plan.summary,planHash:core.hash(runtime.canonicalText(plan)),file,paidRequests:0,mutations:0};
 }
 const plan=checkedJSON(value('--plan-file'));
 const approval=args.includes('--paid')?checkedJSON(value('--approval')):null;
 const result=await audit.runAudit({corpus,plan,references,cache,directory:output,approval,paid:args.includes('--paid'),refreshBase:args.includes('--base-corpus')?{
  basePlan:checkedJSON(value('--base-plan')),
  baseCorpus:(()=>{const original=checkedJSON(value('--base-corpus'));return core.createCorpus(original.rows||original,{complete:true,expectedCount:(original.rows||original).length,revision:checkedJSON(value('--base-plan')).corpusRevision});})()
 }:null});
 return {summary:result.summary,budget:result.budget,stop:result.stop||null,paidRequests:result.paidRequests,mutations:0};
};
module.exports={main,checkedJSON,loadCaches};
if(require.main===module)main(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});

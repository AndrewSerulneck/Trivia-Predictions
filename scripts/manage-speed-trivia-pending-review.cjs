#!/usr/bin/env node
// Phase 4 application/undo tool. Default is concrete, read-only preparation.
// Cache misses never launch a paid call. No automatic migration or deployment.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const core=require('../lib/speed-trivia-uniqueness/core.cjs');
const runtime=require('../lib/speed-trivia-uniqueness/runtime.cjs');
const review=require('../lib/speed-trivia-uniqueness/review.cjs');
const audit=require('../lib/speed-trivia-uniqueness/audit.cjs');
const support=require('./speed-trivia-phase2-support.cjs');
const {checkedJSON,loadCaches}=require('./audit-speed-trivia-pending.cjs');
const cacheOnlyJudge=cache=>({modelVersion:audit.MODEL_VERSION,adjudicate:async tasks=>tasks.map(task=>{
 const result=review.cachedVerdict(cache,task.a,task.b,audit.MODEL_VERSION);
 if(!result)throw new Error('missing-audited-comparison-no-paid-fallback');return {id:task.id,...result};
})});
const prepare=async({session,proposal,cache,references,operationId})=>{
 const index=session.index(),get=id=>index.byId.get(id)?.row;
 const target=get(proposal.id||proposal.keeperId);
 if(!target||target.status!=='pending_review'||proposal.contentHash&&core.contentHash(target)!==proposal.contentHash)throw new Error('pending-review-current-target-drift');
 const judge=cacheOnlyJudge(cache);
 if(proposal.kind==='family'){
  const keeper=target,losers=proposal.loserIds.map(get);
  if(losers.some(row=>!row))throw new Error('family-member-missing');
  const proofs=losers.map(row=>review.directProof(row,keeper,review.cachedVerdict(cache,row,keeper,audit.MODEL_VERSION),audit.MODEL_VERSION));
  const verified=await review.verifyKeeper(index,keeper,losers,proofs,judge);
  if(!verified.ready)throw new Error('current-family-keeper-check-failed');
  return review.makeAuthority({index,kind:'family',keeper,losers,proofs,keeperProof:verified.evidence,references,operationId});
 }
 if(proposal.kind==='active'){
  const verified=await review.verifyKeeper(index,target,[],[],judge);if(!verified.ready)throw new Error('current-activation-check-failed');
  return review.makeAuthority({index,kind:'activate',keeper:target,keeperProof:verified.evidence,references,operationId});
 }
 if(proposal.kind==='retired_repeat'){
  const keeper=get(proposal.keeperId);if(!keeper||keeper.status!=='active')throw new Error('current-active-keeper-required');
  const proof=review.directProof(target,keeper,review.cachedVerdict(cache,target,keeper,audit.MODEL_VERSION),audit.MODEL_VERSION);
  return review.makeAuthority({index,kind:'retire',keeper,losers:[target],proofs:[proof],references,operationId});
 }
 if(proposal.kind==='hold')return review.makeAuthority({index,kind:'hold',rows:[target],reason:proposal.reason,references,operationId});
 throw new Error('unfinished-work-has-no-application-authority');
};
const run=async({client,secret=process.env.SPEED_TRIVIA_ADMISSION_SECRET,manifest,cache=new Map(),output,apply=false,backups=[]})=>{
 if(manifest.version!==audit.VERSION||manifest.applyReady!==false||!Array.isArray(manifest.outcomes))throw new Error('invalid-pending-proposal');
 if(apply){
  if(backups.length!==2||path.resolve(backups[0])===path.resolve(backups[1]))throw new Error('two-independent-verified-backups-required');
  const first=support.readSnapshot(backups[0]),second=support.readSnapshot(backups[1]);
  if(first.digest!==second.digest)throw new Error('backup-copies-disagree');
  const backedUp=new Map(first.rows.map(row=>[row.id,row]));
  for(const outcome of manifest.outcomes){const row=backedUp.get(outcome.id);if(!row||core.contentHash(row)!==outcome.contentHash)throw new Error('manifest-target-not-in-verified-backup');}
 }
 const directory=support.privateDirectory(output),journal=path.join(directory,'application-results.jsonl');
 const session=await runtime.createSession({client,secret,budget:runtime.createBudget({dollars:.5}),judge:cacheOnlyJudge(cache)});
 const processed=new Set(),proposals=[];
 for(const group of manifest.groups||[]){proposals.push({...group,kind:'family'});processed.add(group.keeperId);group.loserIds.forEach(id=>processed.add(id));}
 for(const outcome of manifest.outcomes)if(!processed.has(outcome.id)&&outcome.disposition.state!=='not_processed')proposals.push({id:outcome.id,contentHash:outcome.contentHash,kind:outcome.disposition.state,keeperId:outcome.disposition.keeperId,reason:outcome.disposition.reason});
 const prepared=[],committed=[],skipped=[];
 const requiredIds=[...new Set(proposals.flatMap(proposal=>proposal.kind==='family'?[proposal.keeperId,...proposal.loserIds]:[proposal.id]))];
 let referenceSchema=null;const referenceCounts={};
 for(let offset=0;offset<requiredIds.length;offset+=200){
  const evidence=await runtime.rpc(client,'speed_trivia_review_references',{p_ids:requiredIds.slice(offset,offset+200)});
  if(referenceSchema&&runtime.canonicalText(referenceSchema)!==runtime.canonicalText(evidence.schema))throw new Error('reference-schema-drift');
  referenceSchema=evidence.schema;
  for(const [name,counts]of Object.entries(evidence.counts))Object.assign(referenceCounts[name] ||= {},counts);
 }
 const referenceFor=ids=>({schema:referenceSchema||[],counts:Object.fromEntries(Object.entries(referenceCounts).map(([name,counts])=>[name,Object.fromEntries(ids.map(id=>[id,counts[id]]))]))});
 for(const proposal of proposals){
  try{
   await session.refresh();
   const ids=proposal.kind==='family'?[proposal.keeperId,...proposal.loserIds]:[proposal.id];
   const operationId='pending-'+core.hash([manifest.planHash,...ids]);
   const existing=await runtime.rpc(client,'speed_trivia_review_state',{p_operation_id:operationId}).catch(error=>{if(error.code==='verification_unavailable'&&error.message.startsWith('Missing result'))return null;throw error;});
   if(existing){
    if(existing.undone)throw new Error('operation-was-undone');
    for(const after of existing.after_states)if(runtime.stateHash(session.index().byId.get(after.id)?.row)!==runtime.stateHash(after))throw new Error('committed-operation-state-drift');
    committed.push({operationId,ids,idempotent:true});continue;
   }
   const references=referenceFor(ids);
   const authority=await prepare({session,proposal,cache,references,operationId});
   prepared.push({operationId,ids,kind:authority.kind});
   if(apply){
    // Store the authority/before evidence durably before one atomic operation.
    audit.durableAppend(path.join(directory,'prepared-authorities.jsonl'),{authority,signature:runtime.signText(secret,runtime.canonicalText(authority))});
    const result=await review.applyAuthority(client,secret,authority);
    audit.durableAppend(journal,{operationId,result});committed.push({operationId,ids});await session.refresh();
   }
  }catch(error){skipped.push({ids:[proposal.id||proposal.keeperId],reason:error.code||error.message});break;}
 }
 const result={prepared,committed,skipped,unpreparedOperations:proposals.length-prepared.length-committed.filter(row=>row.idempotent).length,remainingOperations:proposals.length-committed.length,paidRequests:0,mode:apply?'apply':'read-only-prepare'};
 audit.exclusive(path.join(directory,'application-summary-'+crypto.randomUUID()+'.json'),result);return result;
};
const undo=async({client,secret=process.env.SPEED_TRIVIA_ADMISSION_SECRET,operationId})=>{
 const log=await runtime.rpc(client,'speed_trivia_review_state',{p_operation_id:operationId});
 const inventory=await runtime.rpc(client,'speed_trivia_inventory');
 const references=await runtime.rpc(client,'speed_trivia_review_references',{p_ids:log.before_states.map(row=>row.id)});
 const authority={version:'speed-pending-review-undo-v1',operationId,authorityHash:log.authority_hash,corpusRevision:inventory.revision,expiresAt:Date.now()+300000,references};
 return runtime.rpc(client,'undo_speed_trivia_review',{p_authority:runtime.canonicalText(authority),p_signature:runtime.signText(secret,runtime.canonicalText(authority))});
};
module.exports={cacheOnlyJudge,prepare,run,undo};
if(require.main===module){
 const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
 const {createClient}=require('@supabase/supabase-js');
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const action=args.includes('--undo')?undo({client,operationId:value('--operation-id')}):run({client,manifest:checkedJSON(value('--manifest')),cache:loadCaches((value('--caches')||'').split(',').filter(Boolean)),output:value('--output'),apply:args.includes('--apply'),backups:(value('--backups')||'').split(',').filter(Boolean)});
 action.then(result=>console.log(JSON.stringify({prepared:result.prepared?.length,committed:result.committed?.length,skipped:result.skipped?.length,remainingOperations:result.remainingOperations,paidRequests:0,mode:result.mode}))).catch(error=>{console.error(error.message);process.exitCode=1;});
}

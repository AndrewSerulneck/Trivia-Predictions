/* Dedicated one-time pending audit. Never widens normal $0.50 budgets or the
 * historical <=$25 helper. All application/mutation work remains separate. */
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const core=require('./core.cjs');
const gemini=require('./gemini.cjs');
const review=require('./review.cjs');
const runtime=require('./runtime.cjs');
const VERSION='speed-pending-audit-v1';
const MODEL_VERSION=gemini.modelVersion('gemini-2.5-flash');
const durableAppend=(file,value)=>{
 const fd=fs.openSync(file,'a',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
};
const exclusive=(file,value)=>{
 const fd=fs.openSync(file,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const parent=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
};
const readLines=file=>{
 if(!fs.existsSync(file))return [];
 const bytes=fs.readFileSync(file,'utf8');if(bytes&&!bytes.endsWith('\n'))throw new Error('incomplete-durable-journal');
 return bytes.split('\n').filter(Boolean).map(JSON.parse);
};
const micro=dollars=>Math.ceil(dollars*1e6);
const openLedger=(directory,config,{now=Date.now,sliceMs=3600000}={})=>{
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const lock=path.join(directory,'audit.lock'), file=path.join(directory,'global-ledger.jsonl'), binding=path.join(directory,'audit-binding.json');
 const owner={host:os.hostname(),pid:process.pid,nonce:crypto.randomUUID(),auditId:config.auditId,startedAt:new Date(now()).toISOString(),processStartedAt:Math.floor(Date.now()-process.uptime()*1000)};
 exclusive(lock,owner);
 let closed=false;
 const assertOwner=()=>{if(closed||runtime.canonicalText(JSON.parse(fs.readFileSync(lock,'utf8')))!==runtime.canonicalText(owner))throw new Error('audit-lock-ownership-lost');};
 const close=()=>{assertOwner();fs.unlinkSync(lock);closed=true;};
 try{
  if(!Number.isSafeInteger(config.maxInputTokens)||config.maxInputTokens<=0||!Number.isSafeInteger(config.maxOutputTokens)||config.maxOutputTokens<=0||!config.auditId||!Number.isSafeInteger(config.capMicrodollars)||config.capMicrodollars<=0||config.modelVersion!==MODEL_VERSION||!Number.isSafeInteger(config.maxRequests)||config.maxRequests<1||!Number.isSafeInteger(config.maxRetries)||config.maxRetries<0)throw new Error('invalid-global-audit-config');
  if(fs.existsSync(binding)){if(runtime.canonicalText(JSON.parse(fs.readFileSync(binding,'utf8')))!==runtime.canonicalText(config))throw new Error('immutable-audit-binding-drift');}else exclusive(binding,config);
  let sequence=0,previous='root';const claims=new Map();
  const replay=record=>{
   const {recordHash,...body}=record;
   if(body.sequence!==sequence+1||body.previous!==previous||recordHash!==core.hash(runtime.canonicalText(body)))throw new Error('global-ledger-integrity-failure');
   sequence=body.sequence;previous=recordHash;
   if(body.type==='reserve'){
    if(claims.has(body.id)||!Number.isSafeInteger(body.microdollars)||body.microdollars<0||!Number.isSafeInteger(body.inputTokens)||body.inputTokens<0||!Number.isSafeInteger(body.outputTokens)||body.outputTokens<0||body.attempt<0||body.attempt>1)throw new Error('invalid-audit-reservation');
    claims.set(body.id,body);
   }else if(body.type==='settle'||body.type==='oversized'){
    const claim=claims.get(body.id);
    if(!claim||claim.settled||!Number.isSafeInteger(body.microdollars)||body.microdollars<0||!Number.isSafeInteger(body.inputTokens)||body.inputTokens<0||!Number.isSafeInteger(body.outputTokens)||body.outputTokens<0||body.type==='settle'&&(body.microdollars>claim.microdollars||body.inputTokens>claim.inputTokens||body.outputTokens>claim.outputTokens))throw new Error('invalid-audit-settlement');
    claims.set(body.id,{...claim,...body,attempt:claim.attempt,settled:true});
   }else throw new Error('invalid-global-ledger-event');
  };
  for(const record of readLines(file))replay(record);
  const append=body=>{assertOwner();const value={...body,sequence:sequence+1,previous};const record={...value,recordHash:core.hash(runtime.canonicalText(value))};durableAppend(file,record);replay(record);};
  const summary=()=>{
   const values=[...claims.values()];return {microdollars:values.reduce((n,c)=>n+c.microdollars,0),dollars:values.reduce((n,c)=>n+c.microdollars,0)/1e6,requests:values.length,retries:values.filter(c=>c.attempt>0).length,inputTokens:values.reduce((n,c)=>n+c.inputTokens,0),outputTokens:values.reduce((n,c)=>n+c.outputTokens,0),unsettled:values.filter(c=>!c.settled).length,capMicrodollars:config.capMicrodollars};
  };
  const started=now();
  const assertTime=()=>{assertOwner();if(now()-started>=sliceMs)throw new Error('audit-slice-time-exhausted');};
  const scope=(taskKey,attempt=0)=>{
   let id=null,actual=null;
   return {reserve:claim=>{
    assertTime();const total=summary(),amount=micro(claim.dollars);
    if(id||claims.has(taskKey+':'+attempt)||attempt>1||attempt<0||!Number.isSafeInteger(amount)||amount<0||!Number.isSafeInteger(claim.inputTokens)||claim.inputTokens<0||!Number.isSafeInteger(claim.outputTokens)||claim.outputTokens<0)throw new Error('invalid-or-replayed-task-attempt');
    if(total.microdollars+amount>config.capMicrodollars||total.requests+1>config.maxRequests||total.inputTokens+claim.inputTokens>config.maxInputTokens||total.outputTokens+claim.outputTokens>config.maxOutputTokens||attempt>0&&total.retries>=config.maxRetries)throw new Error('global-audit-budget-exhausted');
    id=taskKey+':'+attempt;append({type:'reserve',id,taskKey,attempt,microdollars:amount,inputTokens:claim.inputTokens,outputTokens:claim.outputTokens});return id;
   },settle:(reservation,usage)=>{
    const c=claims.get(id);
    if(reservation!==id||!c||actual||!Number.isFinite(usage.dollars)||usage.dollars<0||!Number.isSafeInteger(usage.inputTokens)||usage.inputTokens<0||!Number.isSafeInteger(usage.outputTokens)||usage.outputTokens<0)throw new Error('audit-provider-usage-mismatch');
    if(micro(usage.dollars)>c.microdollars||usage.inputTokens>c.inputTokens||usage.outputTokens>c.outputTokens){append({type:'oversized',id,microdollars:Math.max(c.microdollars,micro(usage.dollars)),inputTokens:Math.max(c.inputTokens,usage.inputTokens),outputTokens:Math.max(c.outputTokens,usage.outputTokens)});throw new Error('audit-provider-usage-mismatch');}
    // Usage remains provisional until schema, cache and result journal succeed.
    actual={microdollars:micro(usage.dollars),inputTokens:usage.inputTokens,outputTokens:usage.outputTokens};
   },commit:()=>{if(id&&actual){if(claims.get(id)?.settled)throw new Error('duplicate-audit-settlement');append({type:'settle',id,...actual});}},assertTime};
  };
  return {scope,summary,assertTime,close,claims,owner};
 }catch(error){close();throw error;}
};
const recoverLock=(directory,nonce)=>{
 const file=path.join(directory,'audit.lock'),owner=JSON.parse(fs.readFileSync(file,'utf8'));
 if(owner.nonce!==nonce||owner.host!==os.hostname())throw new Error('cannot-verify-lock-owner');
 try{process.kill(owner.pid,0);throw new Error('audit-owner-still-live');}catch(error){if(error.code!=='ESRCH')throw error;}
 // Integrity is checked before recovery; age alone is never authority.
 const records=readLines(path.join(directory,'global-ledger.jsonl'));let prev='root',seq=0;
 for(const record of records){const {recordHash,...body}=record;if(body.sequence!==++seq||body.previous!==prev||recordHash!==core.hash(runtime.canonicalText(body)))throw new Error('cannot-recover-corrupt-ledger');prev=recordHash;}
 if(JSON.parse(fs.readFileSync(file,'utf8')).nonce!==nonce)throw new Error('lock-owner-changed');
 durableAppend(path.join(directory,'lock-recovery.jsonl'),{owner,recoveredAt:new Date().toISOString()});fs.unlinkSync(file);
};
const planAudit=({corpus,targets,cache=new Map(),references,modelVersion=MODEL_VERSION})=>{
 if(!corpus?.complete||modelVersion!==MODEL_VERSION||!references)throw new Error('checked-corpus-and-references-required');
 const index=core.buildIndex(corpus),tasks=new Map(),rowPlans=[];
 const adjacency={...references,directNeighbours:{...(references.directNeighbours||{})}};
 const add=(a,b,reason)=>{
  const key=core.pairKey(a,b,modelVersion);if(tasks.has(key))return;
  const cached=review.cachedVerdict(cache,a,b,modelVersion);
  if(cached?.decision==='duplicate'&&cached.qualityA==='sound'&&cached.qualityB==='sound'&&cached.confidence==='high')for(const [x,y]of [[a.id,b.id],[b.id,a.id]])adjacency.directNeighbours[x]=[...new Set([...(adjacency.directNeighbours[x]||[]),y])];
  const prompt=gemini.buildPrompt([{id:'comparison',a,b}]),inputTokens=Buffer.byteLength(prompt)+4096;
  tasks.set(key,{key,aId:a.id,bId:b.id,aHash:core.contentHash(a),bHash:core.contentHash(b),reason,cached:!!cached,inputTokens,outputTokens:8192,reservationMicrodollars:micro((inputTokens*.3+8192*2.5)/1e6),promptHash:core.hash(prompt)});
 };
 for(const target of targets){
  const row=index.byId.get(target.id)?.row;
  if(!row||row.status!=='pending_review'||target.contentHash!==core.contentHash(row)||target.stateHash!==runtime.stateHash(row))throw new Error('stale-frozen-audit-target');
  const retrieval=core.retrieve(index,row,{excludeId:row.id});
  rowPlans.push({id:row.id,contentHash:target.contentHash,stateHash:target.stateHash,retrieval});
  for(const hit of retrieval.matches)add(row,index.byId.get(hit.id).row,'current-retrieval');
  add(row,row,'candidate-soundness');
 }
 const stars=review.proposeStars(index,targets.map(t=>t.id),cache,modelVersion,adjacency);
 for(const group of stars){const filtered=review.externalIndex(index,new Set(group.losers.map(r=>r.id)));for(const hit of core.retrieve(filtered,group.keeper,{excludeId:group.keeper.id}).matches)add(group.keeper,index.byId.get(hit.id).row,'exposed-family-competitor');}
 const selected=[...tasks.values()],uncached=selected.filter(t=>!t.cached),retryCeiling=Math.floor(uncached.length*.05);
 return {version:VERSION,policyVersion:core.POLICY_VERSION,modelVersion,corpusRevision:corpus.revision,corpusDigest:corpus.digest,targetHash:core.hash(runtime.canonicalText(targets)),referenceHash:core.hash(runtime.canonicalText(references)),targets,rowPlans,tasks:selected,taskHash:core.hash(runtime.canonicalText(selected)),dynamicTaskPolicy:'direct-proven-family-external-retrieval-only',summary:{targetRows:targets.length,tasks:selected.length,cached:selected.length-uncached.length,uncached:uncached.length,provisionalFamilies:stars.length,retryCeiling,meanEstimateDollars:uncached.length*.000664214,allLostReservationDollars:uncached.reduce((n,t)=>n+t.reservationMicrodollars,0)/1e6,paidRequests:0,mutations:0}};
};
const refreshAuditPlan=({baseCorpus,basePlan,corpus,references,cache=new Map()})=>{
 if(basePlan.corpusDigest!==baseCorpus.digest||basePlan.corpusRevision!==baseCorpus.revision||basePlan.targetHash!==core.hash(runtime.canonicalText(basePlan.targets)))throw new Error('invalid-base-audit-snapshot');
 const before=new Map(baseCorpus.rows.map(row=>[row.id,row])),after=new Map(corpus.rows.map(row=>[row.id,row]));
 const schemaCompatibleState=row=>{const copy={...row};for(const key of ['speed_subject_evidence','speed_review_state'])if(copy[key]==null)delete copy[key];return runtime.stateHash(copy);};
 const changed=[...new Set([...before.keys(),...after.keys()])].filter(id=>!before.has(id)||!after.has(id)||schemaCompatibleState(before.get(id))!==schemaCompatibleState(after.get(id)));
 if(changed.length>500)throw new Error('audit-refresh-delta-bound-exceeded');
 const targets=[],concurrent=[];
 for(const target of basePlan.targets){
  const current=after.get(target.id);
  if(!current||current.status!=='pending_review')concurrent.push({...target,reason:current?'status_changed':'left_speed_pool',currentStatus:current?.status||null});
  else targets.push({id:current.id,contentHash:core.contentHash(current),stateHash:runtime.stateHash(current)});
 }
 // Empty remaining cohorts need no paid run; reconciliation is explicit.
 if(!targets.length)throw new Error('audit-cohort-already-concurrently-resolved');
 const fresh=planAudit({corpus,targets,cache,references});
 return {...fresh,refresh:{basePlanHash:core.hash(runtime.canonicalText(basePlan)),baseCorpusDigest:baseCorpus.digest,changedRows:changed.length,originalTargetHash:basePlan.targetHash,concurrent}};
};
const runAudit=async({corpus,plan,cache=new Map(),references,directory,approval=null,paid=false,transport=fetch,concurrency=6,sliceMs=3600000,refreshBase=null})=>{
 if(plan.version!==VERSION||plan.modelVersion!==MODEL_VERSION||core.hash(runtime.canonicalText(plan.targets))!==plan.targetHash||core.hash(runtime.canonicalText(plan.tasks))!==plan.taskHash||corpus.digest!==plan.corpusDigest||corpus.revision!==plan.corpusRevision||core.hash(runtime.canonicalText(references))!==plan.referenceHash)throw new Error('audit-plan-binding-drift');
 if(!paid)return {summary:plan.summary,capRequired:true,paidRequests:0,mutations:0};
 const currentPlanHash=core.hash(runtime.canonicalText(plan));
 let approvedPlan=plan;
 if(plan.refresh){
  if(!refreshBase)throw new Error('audit-refresh-base-required');
  const expected=refreshAuditPlan({...refreshBase,corpus,references,cache});
  // Cache flags can improve after a restart; scope/hash/delta membership cannot.
  if(runtime.canonicalText(expected.targets)!==runtime.canonicalText(plan.targets)||runtime.canonicalText(expected.refresh)!==runtime.canonicalText(plan.refresh))throw new Error('audit-refresh-scope-drift');
  approvedPlan=refreshBase.basePlan;
 }
 if(!approval||approval.questionTransferApproved!==true||approval.planHash!==core.hash(runtime.canonicalText(approvedPlan))||approval.approvedBy!=='Andrew Serulneck')throw new Error('explicit-audit-cap-and-data-transfer-approval-required');
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>6)throw new Error('audit-concurrency-bound');
 const config={auditId:approval.auditId,planHash:approval.planHash,modelVersion:MODEL_VERSION,capMicrodollars:approval.capMicrodollars,maxRequests:approval.maxRequests,maxRetries:Math.min(approval.maxRetries,approvedPlan.summary.retryCeiling),maxInputTokens:approval.maxInputTokens,maxOutputTokens:approval.maxOutputTokens};
 const ledger=openLedger(directory,config,{sliceMs});
 try{
  if(plan.refresh)durableAppend(path.join(directory,'snapshot-refreshes.jsonl'),{planHash:currentPlanHash,refresh:plan.refresh,corpusDigest:corpus.digest,at:new Date().toISOString()});
  const index=core.buildIndex(corpus),byHash=new Map(corpus.rows.map(row=>[core.contentHash(row),row]));
  const persistentCache={get:key=>cache.get(key),set:(key,value)=>{durableAppend(path.join(directory,'pair-cache.jsonl'),{key,value});cache.set(key,value);}};
  for(const entry of readLines(path.join(directory,'pair-cache.jsonl'))){if(entry.value.modelVersion!==MODEL_VERSION||!core.validDecision(entry.value.result))throw new Error('invalid-audit-cache');if(byHash.has(entry.value.firstHash))cache.set(entry.key,entry.value);}
  const completed=new Map(),resultsFile=path.join(directory,'row-results.jsonl'),pairFile=path.join(directory,'pair-results.jsonl');
  for(const entry of readLines(resultsFile)){
   if(entry.planHash!==config.planHash||!approvedPlan.targets.some(target=>target.id===entry.id))throw new Error('stale-audit-row-journal');
   const target=plan.targets.find(t=>t.id===entry.id);
   if(!target||entry.contentHash!==target.contentHash||entry.stateHash!==target.stateHash||entry.snapshotDigest&&entry.snapshotDigest!==corpus.digest)continue;
   if(entry.disposition?.state!=='not_processed'&&entry.disposition?.reason!=='provider_unavailable')completed.set(entry.id,entry);
  }
  let stop=null,cursor=0;
  const planned=new Set(plan.tasks.map(t=>t.key)),dynamic=new Set();
  const inFlight=new Map();
  const compareUnshared=async(task,reason='current-retrieval')=>{
   const key=core.pairKey(task.a,task.b,MODEL_VERSION),cached=review.cachedVerdict(cache,task.a,task.b,MODEL_VERSION);
   if(cached)return {id:task.id,...cached};
   ledger.assertTime();if(stop)throw new Error(stop);
   if(!planned.has(key)){
    if(reason!=='exposed-family-competitor'||dynamic.size>=plan.targets.length*128)throw new Error('unplanned-audit-task');
    if(!dynamic.has(key)){durableAppend(path.join(directory,'dynamic-tasks.jsonl'),{key,aId:task.a.id,bId:task.b.id,aHash:core.contentHash(task.a),bHash:core.contentHash(task.b),reason});dynamic.add(key);}
   }
   let attempt=ledger.claims.has(key+':0')?1:0;
   if(ledger.claims.has(key+':1'))throw new Error('audit-task-attempts-exhausted');
   for(;attempt<=1;attempt++){
    const budget=ledger.scope(key,attempt),judge=gemini.createJudge({apiKey:process.env.GEMINI_API_KEY,budget,cache:persistentCache,transport});
    try{
     const [result]=await judge.adjudicate([{...task,id:'comparison'}]);
     if(!core.validDecision(result))throw new Error('invalid-audit-verdict');
     durableAppend(pairFile,{key,aHash:core.contentHash(task.a),bHash:core.contentHash(task.b),result,modelVersion:MODEL_VERSION});budget.commit();return {...result,id:task.id};
    }catch(error){
     if(attempt===0&&!stop&&/^semantic-http-(429|502|503|504)$/.test(error.message))continue;
     throw error;
    }
   }
  };
  const compare=async(task,reason='current-retrieval')=>{
   const key=core.pairKey(task.a,task.b,MODEL_VERSION);
   if(!inFlight.has(key)){
    const promise=compareUnshared(task,reason);inFlight.set(key,promise);
    promise.finally(()=>inFlight.delete(key)).catch(()=>{});
   }
   const result=await inFlight.get(key);
   // Shared pending task results may have reversed quality orientation.
   const oriented=review.cachedVerdict(cache,task.a,task.b,MODEL_VERSION);
   return {...(oriented||result),id:task.id};
  };
  const evaluate=async row=>{
   const retrieval=core.retrieve(index,row,{excludeId:row.id}),comparisons=[];
   const evidence={policyVersion:core.POLICY_VERSION,contentHash:core.contentHash(row),corpusRevision:corpus.revision,retrieval,comparisons,matchedRowIds:[],decision:'uncertain',explanation:'Evidence incomplete.'};
   if(!retrieval.complete)return evidence;
   const priority=hit=>{const other=index.byId.get(hit.id).row,cached=review.cachedVerdict(cache,row,other,MODEL_VERSION);return cached?.decision==='duplicate'?other.status==='active'?0:other.status==='deleted'?1:2:cached?3:other.status==='active'?4:5;};
   for(const hit of [...retrieval.matches].sort((a,b)=>priority(a)-priority(b)||a.id.localeCompare(b.id))){
    const other=index.byId.get(hit.id).row,deterministic=core.deterministicPair(row,other);
    if(deterministic?.decision==='uncertain'){comparisons.push({id:hit.id,...deterministic});evidence.explanation=deterministic.explanation;return evidence;}
    let result=await compare({id:hit.id,a:row,b:other});
    if(deterministic?.decision==='duplicate'&&result.decision==='unique')result={...result,decision:'duplicate',fact:deterministic.fact,explanation:deterministic.explanation};
    comparisons.push(result);
    if(result.decision==='duplicate'){evidence.decision='duplicate';evidence.matchedRowIds=[hit.id];evidence.explanation=result.explanation;return evidence;}
    if(result.decision==='uncertain'||result.qualityA!=='sound'){evidence.explanation=result.explanation;return evidence;}
   }
   const quality=await compare({id:'candidate-soundness',a:row,b:row});
   if(quality.qualityA==='sound'&&quality.decision!=='uncertain'){evidence.decision='unique';evidence.explanation='Complete bounded retrieval and soundness verified.';evidence.verifiedComparisonCount=Math.max(1,comparisons.length);}
   else {comparisons.push(quality);evidence.explanation=quality.explanation;}
   return evidence;
  };
  const worker=async()=>{
   while(!stop&&cursor<plan.targets.length){
    const target=plan.targets[cursor++];if(completed.has(target.id))continue;
    const row=index.byId.get(target.id).row;
    let evidence;
    try{evidence=await evaluate(row);}catch(error){
     stop ||=error.message;
     evidence={decision:'uncertain',comparisons:[],failure:/budget-exhausted|slice-time-exhausted|attempts-exhausted/.test(error.message)?'budget_exhausted':'provider_unavailable',explanation:error.message};
    }
    const result={...target,planHash:config.planHash,snapshotDigest:corpus.digest,evidence,disposition:review.disposition(row,evidence,index)};
    durableAppend(resultsFile,result);completed.set(row.id,result);
   }
  };
  // Drain all started workers even when fsync/cache/transport fails.
  const workers=await Promise.allSettled(Array.from({length:concurrency},()=>worker().catch(error=>{stop ||=error.message;throw error;})));
  const rejected=workers.find(result=>result.status==='rejected');if(rejected)throw rejected.reason;
  // Build reference-aware direct stars from completed semantic edges. New edges
  // extend local adjacency; they never imply transitive family authority.
  const adjacency={...references,directNeighbours:{...references.directNeighbours}};
  for(const result of completed.values())for(const pair of result.evidence.comparisons||[])if(pair.decision==='duplicate'&&pair.confidence==='high'&&pair.qualityA==='sound'&&pair.qualityB==='sound'){
   for(const [a,b]of [[result.id,pair.id],[pair.id,result.id]])adjacency.directNeighbours[a]=[...new Set([...(adjacency.directNeighbours[a]||[]),b])];
  }
  const groups=[];
  if(!stop)for(const group of review.proposeStars(index,plan.targets.map(t=>t.id),cache,MODEL_VERSION,adjacency)){
   // Never absorb a row already proven against an active keeper or a reservation.
   if([group.keeper,...group.losers].some(row=>['retired_repeat','hold'].includes(completed.get(row.id)?.disposition.state)))continue;
   try{
    const verified=await review.verifyKeeper(index,group.keeper,group.losers,group.proofs,{modelVersion:MODEL_VERSION,adjudicate:async tasks=>Promise.all(tasks.map(task=>compare(task,'exposed-family-competitor')))});
    if(!verified.ready){for(const row of [group.keeper,...group.losers])completed.get(row.id).disposition={state:'hold',reason:'reservation_review'};continue;}
    groups.push({keeperId:group.keeper.id,loserIds:group.losers.map(r=>r.id),proofs:group.proofs,keeperProof:verified.evidence});
    completed.get(group.keeper.id).disposition={state:'active',familyKeeper:true};
    for(const row of group.losers)completed.get(row.id).disposition={state:'retired_repeat',keeperId:group.keeper.id,family:true};
   }catch(error){stop ||=error.message;break;}
  }
  const outcomes=plan.targets.map(target=>{const result=completed.get(target.id);return {...target,disposition:result?.disposition?.state==='pending_family'?{state:'hold',reason:'reservation_review'}:result?.disposition||{state:'not_processed',reason:stop||'not_started'},evidence:result?.evidence||null};});
  const summary={active:0,retired_repeat:0,hold:0,not_processed:0};for(const outcome of outcomes)summary[outcome.disposition.state]++;
  if(plan.refresh)summary.concurrently_changed=plan.refresh.concurrent.length;
  const manifest={version:VERSION,mode:'proposal-only',applyReady:false,planHash:config.planHash,currentPlanHash,corpusRevision:corpus.revision,corpusDigest:corpus.digest,outcomes,concurrentlyChanged:plan.refresh?.concurrent||[],groups,summary,stop,budget:ledger.summary(),mutations:0};
  const artifact=path.join(directory,'proposal-'+crypto.randomUUID()+'.json');
  exclusive(artifact,manifest);
  const checksum=fs.openSync(artifact+'.sha256','wx',0o600);try{fs.writeFileSync(checksum,core.hash(fs.readFileSync(artifact,'utf8'))+'\n');fs.fsyncSync(checksum);}finally{fs.closeSync(checksum);}
  return manifest;
 }finally{ledger.close();}
};
module.exports={VERSION,MODEL_VERSION,durableAppend,exclusive,readLines,openLedger,recoverLock,planAudit,refreshAuditPlan,runAudit};

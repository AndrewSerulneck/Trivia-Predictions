#!/usr/bin/env node
/* Phase 2 bounded dry run: no database/model writes except local derived evidence.
 * Low-overlap competitors remain UNRESOLVED, not certified distinct. The later
 * cleanup must refresh/expand coverage against a new snapshot and released gate.
 */
const fs=require('node:fs'),path=require('node:path');
const core=require('../lib/speed-trivia-uniqueness/core.cjs');
const retirement=require('../lib/speed-trivia-uniqueness/retirement.cjs');
const gemini=require('../lib/speed-trivia-uniqueness/gemini.cjs');
const support=require('./speed-trivia-phase2-support.cjs');
const buildAudit = (corpus,mandatoryIds=new Set()) => {
  const index=core.buildIndex(corpus),pairs=new Map(),retrieval=[];
  for(const row of corpus.rows){
    const meta=index.byId.get(row.id).meta,hits=core.retrieve(index,row,{excludeId:row.id});
    retrieval.push({id:row.id,total:hits.total,complete:hits.complete,matches:hits.matches.map(h=>h.id)});
    for(const hit of hits.matches){
      const [aId,bId]=[row.id,hit.id].sort(),key=aId+':'+bId;
      if(pairs.has(key))continue;
      const other=index.byId.get(hit.id).meta,shared=meta.lexical.filter(t=>other.lexical.includes(t)).length;
      const overlap=2*shared/(meta.lexical.length+other.lexical.length);
      const mandatory=mandatoryIds.has(aId)&&mandatoryIds.has(bId);
      pairs.set(key,{id:key,aId,bId,overlap,mandatory,selected:overlap>=.8||mandatory});
    }
  }
  return {pairs:[...pairs.values()],retrieval,index};
};
const componentsFor = selected => {
  const neighbours=new Map();
  for(const pair of selected)for(const [a,b]of [[pair.aId,pair.bId],[pair.bId,pair.aId]]){if(!neighbours.has(a))neighbours.set(a,new Set());neighbours.get(a).add(b);}
  const seen=new Set(),components=[];
  for(const id of neighbours.keys()){
    if(seen.has(id))continue;
    const members=[],queue=[id];seen.add(id);
    for(let n=0;n<queue.length;n++){const item=queue[n];members.push(item);for(const next of neighbours.get(item)||[])if(!seen.has(next)){seen.add(next);queue.push(next);}}
    components.push(members);
  }
  return components.sort((a,b)=>a[0].localeCompare(b[0]));
};
const run = async ({snapshot,output,paid=false,cap=10,limit=12000,thinkingBudget=0,concurrency=3}) => {
  process.umask(0o077);
  if(!Number.isSafeInteger(limit)||limit<1||limit>12000||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>12)throw new Error('invalid-audit-limit');
  const directory=support.privateDirectory(output),corpus=support.readSnapshot(snapshot);
  // Matches original reported rows; no evaluation labels/rationales are inputs.
  const familyPacket=JSON.parse(fs.readFileSync(path.join(snapshot,'six-families.json'),'utf8'));
  const collectIds = object => {const ids=new Set();const walk=v=>{if(Array.isArray(v))for(const x of v)walk(x);else if(v&&typeof v==='object'){if(typeof v.id==='string')ids.add(v.id);for(const x of Object.values(v))walk(x);}};walk(object);return ids;};
  const started=Date.now(),audit=buildAudit(corpus,collectIds(familyPacket));
  const selected=audit.pairs.filter(p=>p.selected).sort((a,b)=>Number(b.mandatory)-Number(a.mandatory)||b.overlap-a.overlap||a.id.localeCompare(b.id)).slice(0,limit);
  const components=componentsFor(selected);
  const plan={version:'bounded-audit-v2',corpusRevision:corpus.revision,corpusDigest:corpus.digest,rows:corpus.rows.length,retrievedPairs:audit.pairs.length,selectedPairs:selected.length,selectedComponents:components.length,unadjudicatedPairs:audit.pairs.length-selected.length,selection:'Prioritize high-overlap edges >=0.8 and the six original reported families. Components select work only; every duplicate must be compared DIRECTLY with its proposed keeper. Distinct or uncertain matches start separate comparisons. Never infer a retirement from a transitive chain.',estimatedDollars:selected.length*.00055,estimateBasis:'Conservative all-selected-pairs estimate from measured isolated Flash comparisons, zero thinking; direct keeper groups usually require fewer requests. Retries may differ.',explicitCap:cap,limit,concurrency,productionMutations:0};
  if(!paid){console.log(JSON.stringify(plan));support.writeExclusive(path.join(directory,`audit-plan-${Date.now()}.json`),plan);return plan;}
  const budget=support.openBudget(directory,{dollars:cap,maxRequests:11000,maxInputTokens:20000000,maxOutputTokens:4500000,maxElapsedMs:7200000});
  const cache=support.openCache(directory),judge=gemini.createJudge({model:'gemini-2.5-flash',thinkingBudget,batchSize:1,apiKey:process.env.GEMINI_API_KEY,budget,cache});
  const journal=path.join(directory,'adjudicated-pairs.jsonl'),existing=new Map();
  if(fs.existsSync(journal))for(const line of fs.readFileSync(journal,'utf8').trim().split('\n').filter(Boolean)){const p=JSON.parse(line);if(p.corpusDigest!==corpus.digest||p.modelVersion!==judge.modelVersion)throw new Error('audit-journal-version-drift');existing.set(p.id,p);}
  const dependenciesBytes=fs.readFileSync(path.join(snapshot,'dependencies.json')),deps=JSON.parse(dependenciesBytes)[0].evidence,references={};
  for(const count of deps.per_question_counts){if(!references[count.id])references[count.id]={total:0,byTable:{}};references[count.id].byTable[count.reference]=Number(count.records);references[count.id].total+=Number(count.records);}
  const rankedRows=[...corpus.rows].sort((a,b)=>retirement.rankKeepers(a,b,references));
  const rank=new Map(rankedRows.map((row,n)=>[row.id,n]));
  const agenda=[...selected].sort((a,b)=>Math.min(rank.get(a.aId),rank.get(a.bId))-Math.min(rank.get(b.aId),rank.get(b.bId))||a.id.localeCompare(b.id));
  const memberKeeper=new Map(),coveredByKeeper=new Map(),inFlight=new Map();
  let cursor=0,failed=null,processed=0,directComparisons=0,transientRetries=0;
  const fetchDecision=async task=>{
    const previous=existing.get(task.id);
    if(previous)return [previous.result];
    const guard=core.deterministicPair(task.a,task.b);
    if(guard?.decision==='uncertain')return [{id:task.id,...guard}];
    if(!inFlight.has(task.id))inFlight.set(task.id,(async()=>{
      try{return await judge.adjudicate([task]);}catch(error){
        // One retry per transient failure, at most 50 across this audit process.
        // Both attempts reserve worst-case cost in the persistent shared ledger.
        if(!/^semantic-http-(429|502|503|504)$/.test(error.message)||transientRetries>=50)throw error;
        transientRetries++;await new Promise(resolve=>setTimeout(resolve,1000));
        return judge.adjudicate([task]);
      }
    })());
    try{return await inFlight.get(task.id);}finally{inFlight.delete(task.id);}
  };
  const worker=async()=>{
    while(!failed&&cursor<agenda.length){
      const original=agenda[cursor++];
      // Rewire a candidate to an already directly verified keeper; never turn
      // A-B/B-C into an assumed A-C duplicate. A-C must get its own verdict.
      const rootA=memberKeeper.get(original.aId)||original.aId;
      const rootB=memberKeeper.get(original.bId)||original.bId;
      if(rootA===rootB){coveredByKeeper.set(original.id,rootA);processed++;continue;}
      if(directComparisons>=limit){failed='audit-comparison-budget-exhausted';break;}
      const [aId,bId]=[rootA,rootB].sort(),id=aId+':'+bId;
      const task={id,a:audit.index.byId.get(aId).row,b:audit.index.byId.get(bId).row};
      let result;
      try{result=await fetchDecision(task);}catch(e){
        if(['semantic-result-incomplete-or-invalid','semantic-json-invalid','semantic-truncated-or-blocked'].includes(e.message))result=[{id,decision:'uncertain',fact:'Unverified required-knowledge comparison',explanation:e.message,qualityA:'unverified',qualityB:'unverified',confidence:'low'}];
        else{failed=e.message;break;}
      }
      const record={id,aId,bId,aHash:core.contentHash(task.a),bHash:core.contentHash(task.b),result:result[0],corpusDigest:corpus.digest,modelVersion:judge.modelVersion};
      if(!existing.has(id))fs.appendFileSync(journal,JSON.stringify(record)+'\n',{mode:0o600});
      existing.set(id,record);directComparisons++;
      const verdict=result[0];
      if(verdict.decision==='duplicate'&&verdict.confidence==='high'&&verdict.qualityA==='sound'&&verdict.qualityB==='sound'){
        const [keeper,member]=[task.a,task.b].sort((a,b)=>retirement.rankKeepers(a,b,references));
        // A root may have changed during a concurrent call. Do not inherit its
        // members or assign against a keeper that this pair never compared.
        if((!memberKeeper.has(keeper.id)||memberKeeper.get(keeper.id)===keeper.id)&&!memberKeeper.has(member.id)){
          memberKeeper.set(keeper.id,keeper.id);memberKeeper.set(member.id,keeper.id);
        }
      }
      processed++;if(processed%120===0)console.log(JSON.stringify({selectedEdgesProcessed:processed,totalSelectedEdges:agenda.length,directComparisons,coveredByKeeper:coveredByKeeper.size,budget:budget.summary()}));
    }
  };
  try{
    await Promise.all(Array.from({length:concurrency},worker));
    const referenceEvidence={capturedAt:deps.captured_at,sha256:core.hash(dependenciesBytes.toString()),source:path.join(snapshot,'dependencies.json'),warning:'Aggregate captured separately from corpus transaction. Refresh before apply.'};
    const coverage={...plan,selectedEdgesProcessed:processed,directComparisons,coveredByDirectKeeperGroups:coveredByKeeper.size,transientRetries,adjudicatedPairs:existing.size,remainingPairs:audit.pairs.length-audit.pairs.filter(p=>existing.has(p.id)).length,exhaustive:false,failed,elapsedMs:Date.now()-started,budget:budget.summary()};
    const manifest=retirement.createRetirementManifest({corpus,comparisons:[...existing.values()],references,referenceEvidence,modelVersion:judge.modelVersion,coverage});
    const stamp=Date.now();support.writeExclusive(path.join(directory,`retirement-manifest-${stamp}.json`),manifest);
    support.writeExclusive(path.join(directory,`retrieval-and-coverage-${stamp}.json`),{coverage,rows:audit.retrieval,pairs:audit.pairs.map(p=>({...p,adjudicated:existing.has(p.id),directKeeperGroup:coveredByKeeper.get(p.id)||null}))});
    support.writeExclusive(path.join(directory,`derived-facts-${stamp}.json`),{corpusRevision:corpus.revision,corpusDigest:corpus.digest,policyVersion:core.POLICY_VERSION,extractorVersion:core.EXTRACTOR_VERSION,retrievalVersion:core.RETRIEVAL_VERSION,modelVersion:judge.modelVersion,rows:corpus.rows.map(r=>({id:r.id,status:r.status,...core.derive(r)}))});
    console.log(JSON.stringify({summary:manifest.summary,coverage,manifest:path.join(directory,`retirement-manifest-${stamp}.json`)}));return manifest;
  }finally{budget.close();}
};
module.exports={buildAudit,componentsFor,run};
if(require.main===module){const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];if(!args.includes('--snapshot')||!args.includes('--output'))throw new Error('Provide --snapshot verified-dir --output private-dir [--paid --cap approved-dollars]');run({snapshot:value('--snapshot'),output:value('--output'),paid:args.includes('--paid'),cap:args.includes('--cap')?Number(value('--cap')):10,thinkingBudget:args.includes('--thinking')?Number(value('--thinking')):0,concurrency:args.includes('--concurrency')?Number(value('--concurrency')):3}).catch(e=>{console.error(e.message);process.exitCode=1;});}

/* One checked corpus/index per process; only bounded deltas after each write.
 * Missing release prerequisites are failures, never an empty question bank. */
const crypto = require('node:crypto');
const core = require('./core.cjs');
const gemini = require('./gemini.cjs');
const canonicalText = value => JSON.stringify(core.canonical(value));
const stateHash = row => core.hash(core.canonical(row));
const signText = (secret, text) => crypto.createHmac('sha256',secret).update(text).digest('hex');
const sign = (secret, envelope) => signText(secret,canonicalText(envelope));
const speed = row => row?.question_pool === 'anytime_blitz';
class AdmissionError extends Error {
  constructor(code, message, evidence=null) { super(message); this.code=code; this.evidence=evidence; }
}
const rpc = async (client, name, args={}) => {
  const {data,error}=await client.rpc(name,args);
  if(error) throw new AdmissionError(error.message?.includes('stale-speed-revision')?'stale_revision':'verification_unavailable', `Speed Trivia verification failed (${name}).`);
  if(data==null) throw new AdmissionError('verification_unavailable',`Missing result (${name}).`);
  return data;
};
const createBudget = ({dollars,inputTokens=2000000,outputTokens=500000,requests=8000,candidates=200,retries=2,elapsedMs=600000,now=Date.now}={}) => {
  if(!Number.isFinite(dollars)||dollars<=0) throw new AdmissionError('budget_configuration','Set an explicitly approved SPEED_TRIVIA_MAX_DOLLARS before paid checking.');
  for(const value of [inputTokens,outputTokens,requests,candidates,retries,elapsedMs]) if(!Number.isSafeInteger(value)||value<0) throw new Error('invalid-run-budget');
  const ceiling={dollars,inputTokens,outputTokens,requests,candidates,retries}, used=Object.fromEntries(Object.keys(ceiling).map(k=>[k,0])),started=now();
  const assertTime=()=>{if(now()-started>=elapsedMs)throw new AdmissionError('budget_exhausted','Run time budget exhausted.');};
  const reserve=amount=>{
    assertTime(); for(const [key,value]of Object.entries(amount)) if(key in ceiling&&(!Number.isFinite(value)||value<0||used[key]+value>ceiling[key]))throw new AdmissionError('budget_exhausted',`Run ${key} budget exhausted.`);
    for(const key of Object.keys(ceiling))used[key]+=amount[key]||0;
    return {...amount};
  };
  const remainingTime=()=>Math.max(0,elapsedMs-(now()-started));
  const limit=promise=>new Promise((resolve,reject)=>{
    let timer;
    // Always consume the in-flight result, even if the deadline expires between
    // starting it and entering this wrapper. Otherwise a late abort is unhandled.
    Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
    try{assertTime();timer=setTimeout(()=>reject(new AdmissionError('budget_exhausted','Run time budget exhausted.')),remainingTime());}
    catch(error){reject(error);}
  });
  return {reserve,remainingTime,limit,settle:(reserved,actual)=>{for(const key of ['dollars','inputTokens','outputTokens']){
    if(!Number.isFinite(actual[key])||actual[key]<0)throw new Error('invalid-usage');
    // Never refund a lost/oversized attempt; reservations are conservative.
    used[key]+=actual[key]-(reserved[key]||0);
    if(used[key]>ceiling[key])throw new AdmissionError('budget_exhausted','Provider exceeded reserved usage.');
  }
    if(['inputTokens','outputTokens'].some(key=>actual[key]>(reserved[key]||0)))throw new AdmissionError('budget_exhausted','Provider exceeded this request\'s reserved tokens.');
  },assertTime,remaining:key=>Math.max(0,ceiling[key]-used[key]),summary:()=>({...used,elapsedMs:now()-started,ceiling:{...ceiling,elapsedMs}})};
};
const readerFor = client => ({
  readEvidence:()=>rpc(client,'speed_trivia_inventory'),
  readPage:({offset,limit,revision})=>rpc(client,'speed_trivia_corpus_page',{p_revision:revision,p_offset:offset,p_limit:limit}),
});
// Update only changed postings; extraction of unchanged rows is reused.
const applyDelta = (index, delta) => {
  const remove=id=>{
    const value=index.byId.get(id);if(!value)return;
    const postings=[[index.answers,value.meta.answerEntity],[index.answers,'bag:'+value.meta.semantic.filter(t=>!t.startsWith('relation:')).sort().join('|')],[index.exact,core.exactKey(value.row.question)]];
    // Answer bag tokens are private to core: remove this ID from all answer keys.
    for(const ids of index.answers.values())ids.delete(id);
    for(const token of value.meta.lexical)postings.push([index.lexical,token]);
    for(const token of value.meta.semantic)postings.push([index.semantic,token]);
    for(const [map,key]of postings){map.get(key)?.delete(id);if(map.get(key)?.size===0)map.delete(key);}
    index.byId.delete(id);
  };
  for(const id of delta.removedIds)remove(id);
  // Small delta indexes use the frozen core's exact posting semantics.
  if(delta.rows.length){
    const mini=core.buildIndex(core.createCorpus(delta.rows,{complete:true,expectedCount:delta.rows.length,revision:delta.revision}));
    for(const row of delta.rows)remove(row.id);
    for(const [id,value]of mini.byId)index.byId.set(id,value);
    for(const key of ['answers','exact','lexical','semantic'])for(const [term,ids]of mini[key]){
      if(!index[key].has(term))index[key].set(term,new Set());for(const id of ids)index[key].get(term).add(id);
    }
  }
  const rows=Object.freeze([...index.byId.values()].map(v=>v.row));
  index.corpus=Object.freeze({rows,complete:true,revision:delta.revision,digest:core.hash([...index.byId].map(([id,v])=>[id,v.row.status,v.meta.contentHash]).sort((a,b)=>a[0].localeCompare(b[0])))});
};
const createSession = async ({client,secret=process.env.SPEED_TRIVIA_ADMISSION_SECRET,budget,judge,cache=new Map(),apiKey=process.env.GEMINI_API_KEY,cachedIndex=null}={}) => {
  if(!client||!secret||secret.length<32)throw new AdmissionError('verification_unavailable','Speed Trivia admission is not configured.');
  budget ||= createBudget({dollars:Number(process.env.SPEED_TRIVIA_MAX_DOLLARS)});
  const originalClient=client;
  client={rpc:(name,args)=>{
    budget.assertTime();let request=originalClient.rpc(name,args);
    if(typeof request.abortSignal==='function')request=request.abortSignal(AbortSignal.timeout(Math.max(1,budget.remainingTime())));
    return budget.limit(request).then(result=>{
      if(result.error)budget.assertTime();
      return result;
    },error=>{budget.assertTime();throw error;});
  }};
  const transport=(url,init)=>{
    budget.assertTime();return fetch(url,{...init,signal:AbortSignal.any([init.signal,AbortSignal.timeout(Math.max(1,budget.remainingTime()))])});
  };
  if(!judge){
    const provider=gemini.createJudge({apiKey,budget,cache,transport});
    judge={modelVersion:provider.modelVersion,adjudicate:async tasks=>{
      if(tasks.length!==1)throw new Error('semantic-comparisons-must-be-isolated');
      // Row IDs are local bookkeeping, not facts. A short fixed provider label
      // avoids UUID transcription failures while retaining strict ID validation.
      const task=tasks[0];
      const results=await provider.adjudicate([{...task,id:'comparison'}]);
      if(results.length!==1||results[0].id!=='comparison')throw new Error('invalid-provider-comparison-label');
      return [{...results[0],id:task.id}];
    }};
  }
  const cappedJudge={modelVersion:judge.modelVersion,adjudicate:async tasks=>{
    const keys=tasks.map(t=>core.pairKey(t.a,t.b,judge.modelVersion));
    const missing=keys.filter(k=>!cache.has(k));
    if(missing.length){
      const persisted=await rpc(client,'speed_trivia_cached_pairs',{p_keys:missing});
      for(const [key,value]of Object.entries(persisted))cache.set(key,value);
    }
    const toPersist=missing.filter(k=>!cache.has(k));
    const results=[];
    for(let i=0;i<tasks.length;i++){
      budget.assertTime();
      let verdicts;
      try{verdicts=await budget.limit(judge.adjudicate([tasks[i]]));}
      catch(error){
        // The fetch abort may beat the budget timer at the same deadline.
        // Preserve the global cutoff instead of reporting a provider outage.
        budget.assertTime();throw error;
      }
      if(!Array.isArray(verdicts)||verdicts.length!==1||verdicts[0].id!==tasks[i].id||!core.validDecision(verdicts[0]))throw new Error('invalid-semantic-result');
      const verdict=verdicts[0];results.push(verdict);
      if(verdict.decision!=='unique'||verdict.qualityA!=='sound'){
        // These are explicit unexamined holds, never fabricated provider verdicts.
        for(const task of tasks.slice(i+1))results.push({id:task.id,decision:'uncertain',explanation:'Not examined after an earlier rejecting/uncertain comparison.',fact:'Unexamined comparison',qualityA:'unverified',qualityB:'unverified',confidence:'low'});
        break;
      }
    }
    const entries=Object.fromEntries(toPersist.filter(k=>cache.has(k)).map(k=>[k,cache.get(k)]));
    if(Object.keys(entries).length){
      const payload=canonicalText(entries);
      await rpc(client,'speed_trivia_cache_pairs',{p_entries:payload,p_signature:signText(secret,payload)});
    }
    return results;
  }};
  const corpus=cachedIndex?.corpus||await core.loadCorpus(readerFor(client));
  const index=cachedIndex||core.buildIndex(corpus);let revision=corpus.revision;
  const refresh=async()=>{
    const delta=await rpc(client,'speed_trivia_corpus_delta',{p_revision:revision,p_limit:500});
    if(!delta.complete)throw new AdmissionError('verification_unavailable','Too many changed questions; restart with a fresh checked corpus.');
    if(delta.revision===revision)return;
    revision=delta.revision;
    applyDelta(index,delta);
  };
  const write=async (input,{existing=null,importMode=false,restore=false,undo=null}={})=>{
    // A slug is an identity; a retired row never becomes a fresh insertion.
    let old=existing;
    if(!old&&input.slug)old=await rpc(client,'speed_trivia_find',{p_identifier:input.slug});
    if(Array.isArray(old))old=old[0]||null;
    let row={...old,...input,id:old?.id||input.id||crypto.randomUUID(),slug:old?.slug||input.slug||`q-${crypto.randomUUID()}`,status:input.status||old?.status||'pending_review'};
    if(!speed(row))throw new AdmissionError('invalid_pool','Speed admission cannot write Live Trivia.');
    core.content(row);
    if(old?.status==='deleted'&&!restore)throw new AdmissionError('retired','This question is retired. Use the reviewed undo tool; it cannot be reimported or approved.');
    if(!old||old.question_pool!=='anytime_blitz')row.status='pending_review';
    if(importMode&&old&&core.contentHash(row)===core.contentHash(old)&&row.status===old.status)return {row:old,idempotent:true};
    for(let attempt=0;attempt<=2;attempt++){
      budget.assertTime(); await refresh();
      const evidence=await core.checkCandidate(index,row,{...cappedJudge,excludeId:old?.id||null});
      if(evidence.decision!=='unique'){
        if(evidence.explanation.startsWith('Unverified comparison:')||evidence.explanation==='Semantic dependency unavailable.'){
          const exhausted=/budget exhausted/i.test(evidence.explanation);
          throw new AdmissionError(exhausted?'budget_exhausted':'verification_unavailable',exhausted?'The checking budget is exhausted.':'Question checks are unavailable. Nothing was saved.',evidence);
        }
        const matches=evidence.matchedRowIds.map(id=>index.byId.get(id)?.row).filter(Boolean).slice(0,3);
        const reason=evidence.decision==='duplicate'
          ? `This tests a fact already used in Speed Trivia.${matches.length?` Existing question: ${matches.map(r=>`“${r.question}” (answer: ${r.options[r.correct_answer]})`).join('; ')}.`:''}`
          : `This question could not be verified. ${evidence.comparisons.find(r=>r.decision==='uncertain'||r.qualityA!=='sound')?.explanation||evidence.explanation}`;
        throw new AdmissionError(evidence.decision,reason,evidence);
      }
      let reservePreviousFact=false;
      if(speed(old)&&core.contentHash(old)!==core.contentHash(row)){
        // A wording edit keeps one representative. An edit testing a different
        // fact reserves the previous fact; it must not return under another ID.
        const exact=core.deterministicPair(row,old);
        const previous=exact?.decision==='duplicate'?exact:(await cappedJudge.adjudicate([{id:'previous-version',a:row,b:old}]))[0];
        if(previous.decision==='uncertain'||(previous!==exact&&previous.qualityA!=='sound'))throw new AdmissionError('uncertain','The relationship to the previous question remains uncertain.',evidence);
        reservePreviousFact=previous.decision==='unique';
      }
      const payload=Object.fromEntries(['id','slug','question','options','correct_answer','category','difficulty','question_pool','answer_format','image_url','image_context','status'].filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
      const generation=typeof input.subtopic==='string'&&typeof input.primarySubject==='string'?{version:'speed-subject-plan-v1',subtopic:input.subtopic,primarySubject:input.primarySubject}:null;
      budget.assertTime();
      const envelope={payloadHash:core.hash(canonicalText(payload)),contentHash:evidence.contentHash,policyVersion:core.POLICY_VERSION,corpusRevision:revision,oldHash:old?stateHash(old):null,expiresAt:Date.now()+Math.min(300000,budget.remainingTime()),restore,reservePreviousFact,generation};
      try{
        // Durable pair-cache keys avoid storing the same full verdict twice.
        const {comparisons,...compactEvidence}=evidence;
        const comparisonKeys=evidence.retrieval?.matches.length?evidence.retrieval.matches.map(hit=>core.pairKey(row,index.byId.get(hit.id).row,judge.modelVersion)):[core.pairKey(row,row,judge.modelVersion)];
        const args={p_payload:canonicalText(payload),p_check:envelope,p_signature:sign(secret,envelope),p_evidence:{...compactEvidence,comparisonKeys,verifiedComparisonCount:comparisons.length,derivedFact:core.derive(row)}};
        if(undo){args.p_manifest_hash=undo.manifestHash;args.p_row_id=row.id;}
        const saved=await rpc(client,undo?'speed_trivia_undo_retirement':'admit_speed_trivia',args);
        await refresh(); return {row:saved,idempotent:false,evidence};
      }catch(error){
        if(error.code!=='stale_revision'||attempt===2)throw error;
        budget.reserve({retries:1});
        // Only this row's optimistic old state is retried; content drift fails closed.
      }
    }
  };
  const leave=async(input,old)=>{
    if(!speed(old)||old.status==='deleted')throw new AdmissionError('retired','A retired Speed question cannot be converted.');
    const row={...old,...input,id:old.id,slug:old.slug};
    if(row.question_pool!=='live_showdown'||!['write_in','numeric','true_false'].includes(row.answer_format))throw new AdmissionError('invalid_pool','Live Trivia needs a write-in-compatible answer format.');
    for(let attempt=0;attempt<=2;attempt++){
      budget.assertTime();await refresh();
      const payload=canonicalText(Object.fromEntries(['id','slug','question','options','correct_answer','category','difficulty','question_pool','answer_format','image_url','image_context','status'].filter(k=>row[k]!==undefined).map(k=>[k,row[k]])));
      budget.assertTime();
      const envelope={operation:'leave_speed',payloadHash:core.hash(payload),oldHash:stateHash(old),policyVersion:core.POLICY_VERSION,corpusRevision:revision,expiresAt:Date.now()+Math.min(300000,budget.remainingTime())};
      try{
        const saved=await rpc(client,'leave_speed_trivia',{p_payload:payload,p_check:envelope,p_signature:sign(secret,envelope)});
        await refresh();return saved;
      }catch(error){if(error.code!=='stale_revision'||attempt===2)throw error;budget.reserve({retries:1});}
    }
  };
  return {write,leave,refresh,budget,corpus:()=>index.corpus,index:()=>index,client};
};
module.exports={canonicalText,stateHash,sign,signText,speed,rpc,AdmissionError,createBudget,readerFor,createSession};

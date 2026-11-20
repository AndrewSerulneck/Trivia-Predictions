/* One checked corpus/index per process; only bounded deltas after each write.
 * Missing release prerequisites are failures, never an empty question bank. */
const crypto = require('node:crypto');
const core = require('./core.cjs');
const openai = require('./openai.cjs');
const approval = require('./approval.cjs');
const varietyMap = require('../question-variety/map.cjs');
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
  if(error){
    // Phase 4a.1: the admission guard's star cap (5 approved per subject) and untagged refusals are the row's own state.
    if(/\bstar-cap-untagged\b/.test(error.message??''))throw new AdmissionError('untagged','No subject tag yet.');
    if(/\bstar-cap\b/.test(error.message??''))throw new AdmissionError('subject_full','Subject full.');
    throw new AdmissionError(error.message?.includes('stale-speed-revision')?'stale_revision':'verification_unavailable', `Speed Trivia verification failed (${name}).`);
  }
  if(data==null) throw new AdmissionError('verification_unavailable',`Missing result (${name}).`);
  return data;
};
const createBudget = ({dollars,inputTokens=2000000,outputTokens=500000,requests=8000,candidates=200,retries=2,elapsedMs=600000,now=Date.now,signal}={}) => {
  if(!Number.isFinite(dollars)||dollars<=0) throw new AdmissionError('budget_configuration','Set an explicitly approved SPEED_TRIVIA_MAX_DOLLARS before paid checking.');
  for(const value of [inputTokens,outputTokens,requests,candidates,retries,elapsedMs]) if(!Number.isSafeInteger(value)||value<0) throw new Error('invalid-run-budget');
  const ceiling={dollars,inputTokens,outputTokens,requests,candidates,retries}, used=Object.fromEntries(Object.keys(ceiling).map(k=>[k,0])),started=now();
  const assertTime=()=>{if(signal?.aborted)throw new AdmissionError('cancelled','Review connection closed.');if(now()-started>=elapsedMs)throw new AdmissionError('budget_exhausted','Run time budget exhausted.');};
  const reserve=amount=>{
    assertTime(); for(const [key,value]of Object.entries(amount)) if(key in ceiling&&(!Number.isFinite(value)||value<0||used[key]+value>ceiling[key]))throw new AdmissionError('budget_exhausted',`Run ${key} budget exhausted.`);
    for(const key of Object.keys(ceiling))used[key]+=amount[key]||0;
    return {...amount};
  };
  const remainingTime=()=>Math.max(0,elapsedMs-(now()-started));
  const limit=promise=>new Promise((resolve,reject)=>{
    let timer;
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);};
    const cancel=()=>{cleanup();reject(new AdmissionError('cancelled','Review connection closed.'));};
    // Always consume the in-flight result, even if the deadline expires between
    // starting it and entering this wrapper. Otherwise a late abort is unhandled.
    Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
    try{assertTime();signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{cleanup();reject(new AdmissionError('budget_exhausted','Run time budget exhausted.'));},remainingTime());}
    catch(error){reject(error);}
  });
  // Phase 4f.2: settled usage per model, for the cost ledger (lib/openai/ledger.cjs). Bookkeeping only; caps above.
  const byModel={};
  const tally=actual=>{
    if(typeof actual.model!=='string'||!actual.model)return;
    const entry=byModel[actual.model]??={calls:0,inputTokens:0,outputTokens:0,reasoningTokens:0,dollars:0};
    entry.calls++;entry.inputTokens+=actual.inputTokens;entry.outputTokens+=actual.outputTokens;entry.dollars+=actual.dollars;
    // Phase 7e: reasoning tokens for the ledger (the judge reports them as thoughtTokens).
    const reasoning=Number(actual.reasoningTokens??actual.thoughtTokens);entry.reasoningTokens+=Number.isFinite(reasoning)&&reasoning>0?reasoning:0;
  };
  return {signal,reserve,remainingTime,limit,settle:(reserved,actual)=>{for(const key of ['dollars','inputTokens','outputTokens']){
    if(!Number.isFinite(actual[key])||actual[key]<0)throw new Error('invalid-usage');
    // Never refund a lost/oversized attempt; reservations are conservative.
    used[key]+=actual[key]-(reserved[key]||0);
    if(used[key]>ceiling[key]){tally(actual);throw new AdmissionError('budget_exhausted','Provider exceeded reserved usage.');}
  }
    tally(actual);
    if(['inputTokens','outputTokens'].some(key=>actual[key]>(reserved[key]||0)))throw new AdmissionError('budget_exhausted','Provider exceeded this request\'s reserved tokens.');
  },assertTime,remaining:key=>Math.max(0,ceiling[key]-used[key]),summary:()=>({...used,elapsedMs:now()-started,ceiling:{...ceiling,elapsedMs},byModel:Object.fromEntries(Object.entries(byModel).map(([model,entry])=>[model,{...entry}]))})};
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
  approval.refreshApprovedIndex(index,delta,applyDelta);
};
// concurrency: pair comparisons in flight at once (Phase 3). Admission is unchanged: a question is unique only when
// every compared pair is unique and sound. Same-answer competitors go first and the first PROBE pairs run one at a
// time (measured 2026-11-15: the repeat was the first same-answer pair for 40 of 43 repeats), then up to
// `concurrency` at once. No new pair starts after a non-unique result; pairs not examined stay explicit holds.
// releasedRows: 'read' skips rows rejected in Quick Review as dull or obscure in full-bank checks (D5), each only at
// the revision it was released at; omitted, nothing is skipped (the conservative default).
// Phase 4b: the daily writer's provenance rides in speed_generation_metadata (signed with the rest of the envelope):
// source, writer version, model, candidate id, area, era, the writer's whyTrue note (D30, Phase 4c.5) and, for
// Current Events, sourceUrl and expiresOn (D16). Not part of the content key or the signed payload hash.
// Only these keys, only short strings; anything else is dropped.
const WRITER_META_KEYS=Object.freeze(['source','writer','model','candidateId','area','era','sourceUrl','expiresOn','whyTrue']);
const writerMeta=meta=>{
  if(!meta||typeof meta!=='object'||Array.isArray(meta))return {};
  return Object.fromEntries(WRITER_META_KEYS.filter(key=>typeof meta[key]==='string'&&meta[key].length>0&&meta[key].length<=500).map(key=>[key,meta[key]]));
};
const DEFAULT_CONCURRENCY=6;
const PROBE=2;
// Current Events (Andrew, 2026-11-19, D39): a news fact usually postdates the judge model's knowledge, so it answers
// "can't confirm" (quality uncertain or unverified) and nearly every news question was refused. For a Current Events
// question (from the writer, a Keep or an Admin edit alike) the check decides repeats only; a fact the judge calls
// wrong ("invalid") is still refused. The writer's web search, its required source link and Andrew's Quick Review
// confirm the fact. The frozen comparison policy (core.cjs, pinned by
// tests/speed-trivia-uniqueness-release.test.ts) is unchanged: such a verdict reaches it as sound, marked
// recentFactUnconfirmed. The pair cache keeps the judge's raw verdict.
const RECENT_FACT_CATEGORY=varietyMap.CURRENT_EVENTS;
const recentFact=(candidate,verdict)=>candidate?.category===RECENT_FACT_CATEGORY&&(verdict.qualityA==='uncertain'||verdict.qualityA==='unverified')
  ?{...verdict,qualityA:'sound',recentFactUnconfirmed:true}:verdict;
const sameAnswer=task=>{try{return core.answerKey(core.content(task.a).answer)===core.answerKey(core.content(task.b).answer);}catch{return false;}};
const createSession = async ({client,secret=process.env.SPEED_TRIVIA_ADMISSION_SECRET,budget,judge,cache=new Map(),apiKey=process.env.OPENAI_API_KEY,cachedIndex=null,concurrency=DEFAULT_CONCURRENCY,releasedRows=null}={}) => {
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>12)throw new Error('invalid-comparison-concurrency');
  if(releasedRows!=null&&releasedRows!=='read')throw new Error('invalid-released-rows-option');
  if(!client||!secret||secret.length<32)throw new AdmissionError('verification_unavailable','Speed Trivia admission is not configured.');
  budget ||= createBudget({dollars:Number(process.env.SPEED_TRIVIA_MAX_DOLLARS)});
  const originalClient=client;
  client={rpc:(name,args)=>{
    budget.assertTime();let request=originalClient.rpc(name,args);
    if(typeof request.abortSignal==='function')request=request.abortSignal(AbortSignal.any([budget.signal,AbortSignal.timeout(Math.max(1,budget.remainingTime()))].filter(Boolean)));
    return budget.limit(request).then(result=>{
      if(result.error)budget.assertTime();
      return result;
    },error=>{budget.assertTime();throw error;});
  }};
  const transport=(url,init)=>{
    budget.assertTime();return fetch(url,{...init,signal:AbortSignal.any([init.signal,budget.signal,AbortSignal.timeout(Math.max(1,budget.remainingTime()))].filter(Boolean))});
  };
  if(!judge){
    const provider=openai.createJudge({apiKey,budget,cache,transport});
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
  // thorough=false (every check): no new pair starts after a non-unique result. thorough=true (only D38b's set-aside
  // pass, Phase 7d): every pair is judged, so all of an edit's repeats are known at once.
  const judgeWith=thorough=>({modelVersion:judge.modelVersion,adjudicate:async tasks=>{
    const keys=tasks.map(t=>core.pairKey(t.a,t.b,judge.modelVersion));
    const missing=keys.filter(k=>!cache.has(k));
    if(missing.length){
      const persisted=await rpc(client,'speed_trivia_cached_pairs',{p_keys:missing});
      for(const [key,value]of Object.entries(persisted))cache.set(key,value);
    }
    const toPersist=missing.filter(k=>!cache.has(k));
    // Likely repeats first, so the early stop comes sooner. Stable within each group.
    const order=tasks.map((task,i)=>({task,i,first:sameAnswer(task)})).sort((x,y)=>(y.first-x.first)||(x.i-y.i)).map(entry=>entry.task);
    const verdicts=new Map();let next=0,stop=false,failure=null;
    const worker=async until=>{
      while(!stop&&next<until){
        const task=order[next++];
        try{
          budget.assertTime();
          let reply;
          try{reply=await budget.limit(judge.adjudicate([task]));}
          catch(error){
            // The fetch abort may beat the budget timer at the same deadline.
            // Preserve the global cutoff instead of reporting a provider outage.
            budget.assertTime();throw error;
          }
          if(!Array.isArray(reply)||reply.length!==1||reply[0].id!==task.id||!core.validDecision(reply[0]))throw new Error('invalid-semantic-result');
          const verdict=recentFact(task.a,reply[0]);
          verdicts.set(task.id,verdict);
          if(!thorough&&(verdict.decision!=='unique'||verdict.qualityA!=='sound'))stop=true;
        }catch(error){stop=true;failure??=error;}
      }
    };
    // Probe alone first, then fan out. Every in-flight pair settles before returning; none runs unobserved.
    await worker(Math.min(PROBE,order.length));
    if(!stop)await Promise.allSettled(Array.from({length:Math.min(concurrency,order.length-next)},()=>worker(order.length)));
    // Persist first (Phase 3b): paid verdicts are saved even when another pair failed, so they are never paid twice.
    const entries=Object.fromEntries(toPersist.filter(k=>cache.has(k)).map(k=>[k,cache.get(k)]));
    if(Object.keys(entries).length){
      const payload=canonicalText(entries);
      try{await rpc(client,'speed_trivia_cache_pairs',{p_entries:payload,p_signature:signText(secret,payload)});}
      catch(error){throw failure??error;}
    }
    // A confirmed duplicate wins over a failed pair: the question can't be admitted either way, and the repeat is the
    // useful answer. Without a duplicate, the failure stands (nothing that could admit is ever returned).
    if(failure&&![...verdicts.values()].some(verdict=>verdict.decision==='duplicate'))throw failure;
    // Explicit unexamined holds (failed or never started), never fabricated provider verdicts.
    return tasks.map(task=>verdicts.get(task.id)||{id:task.id,decision:'uncertain',explanation:'Not examined after an earlier rejecting/uncertain comparison.',fact:'Unexamined comparison',qualityA:'unverified',qualityB:'unverified',confidence:'low'});
  }});
  const cappedJudge=judgeWith(false),thoroughJudge=judgeWith(true);
  const corpus=cachedIndex?.corpus||await core.loadCorpus(readerFor(client));
  const index=cachedIndex||core.buildIndex(corpus);let revision=corpus.revision;
  // D5 released set, read lazily: only by the first full-bank write of this session, never by approved-only checks.
  // If it can't be read, nothing is skipped (the whole bank is compared, the conservative default).
  let released=null,releasedRead=releasedRows!=='read';
  const readReleased=async()=>{
    if(releasedRead)return released;
    releasedRead=true;
    try{
      const list=await rpc(client,'speed_trivia_released_rows_v2');
      if(!Array.isArray(list)||list.some(entry=>typeof entry?.id!=='string'||!Number.isSafeInteger(Number(entry.revision))))throw new Error('invalid-released-rows');
      released=new Map(list.map(entry=>[entry.id,Number(entry.revision)]));
    }catch(error){
      if(error?.code==='budget_exhausted'||error?.code==='cancelled')throw error;
      console.warn('Speed Trivia: released questions unavailable; comparing with the whole bank.');
      released=null;
    }
    return released;
  };
  const refresh=async()=>{
    const delta=await rpc(client,'speed_trivia_corpus_delta',{p_revision:revision,p_limit:500});
    if(!delta.complete)throw new AdmissionError('verification_unavailable','Too many changed questions; restart with a fresh checked corpus.');
    if(delta.revision===revision)return;
    revision=delta.revision;
    applyDelta(index,delta);
  };
  // Candidate checking converts provider failures into conservative evidence.
  // Keep cancellation/deadline authoritative before interpreting that evidence.
  const requireUnique=evidence=>{
    budget.assertTime();
    if(evidence.decision==='unique')return;
    if(evidence.explanation.startsWith('Unverified comparison:')||evidence.explanation==='Semantic dependency unavailable.'){
      const exhausted=/budget exhausted/i.test(evidence.explanation);
      throw new AdmissionError(exhausted?'budget_exhausted':'verification_unavailable',exhausted?'The checking budget is exhausted.':'Question checks are unavailable for this item.',evidence);
    }
    const matches=evidence.matchedRowIds.map(id=>index.byId.get(id)?.row).filter(Boolean).slice(0,3);
    const reason=evidence.decision==='duplicate'
      ? `This tests a fact already used in Speed Trivia.${matches.length?` Existing question: ${matches.map(r=>`“${r.question}” (answer: ${r.options[r.correct_answer]})`).join('; ')}.`:''}`
      : `This question could not be verified. ${evidence.comparisons.find(r=>r.decision==='uncertain'||r.qualityA!=='sound')?.explanation||evidence.explanation}`;
    throw new AdmissionError(evidence.decision,reason,evidence);
  };
  // D17 pre-check: the approved-only check a Keep would get, without writing anything. Returns the evidence when
  // unique; throws the same AdmissionError codes as write() otherwise.
  const checkApproved=async row=>{
    if(!speed(row)||row.answer_format!=='multiple_choice')throw new AdmissionError('invalid_pool','Speed admission cannot check Live Trivia.');
    core.content(row);
    budget.assertTime();await refresh();
    const evidence=await core.checkCandidate(approval.approvedIndex(index),{...row,status:'active'},{...cappedJudge,excludeId:row.id});
    evidence.comparisonScope='approved';
    requireUnique(evidence);
    return evidence;
  };
  // Phase 4a.1: refuse before any paid check when the guard would refuse anyway. Best effort: if the check can't be
  // read, the database guard still decides.
  const requireStarCapRoom=async rowId=>{
    let state=null;
    try{const {data,error}=await client.rpc('speed_trivia_star_cap_check',{p_row_ids:[rowId]});if(!error)state=data?.[rowId]??null;}catch{state=null;}
    if(state==='full')throw new AdmissionError('subject_full','Subject full.');
    if(state==='untagged')throw new AdmissionError('untagged','No subject tag yet.');
  };
  const write=async (input,{existing=null,importMode=false,restore=false,undo=null,generated=false,approvedOnly=false}={})=>{
    // A slug is an identity; a retired row never becomes a fresh insertion.
    let old=existing;
    if(!old&&input.slug)old=await rpc(client,'speed_trivia_find',{p_identifier:input.slug});
    if(Array.isArray(old))old=old[0]||null;
    let row={...old,...input,id:old?.id||input.id||crypto.randomUUID(),slug:old?.slug||input.slug||`q-${crypto.randomUUID()}`,status:input.status||old?.status||'pending_review'};
    if(!speed(row))throw new AdmissionError('invalid_pool','Speed admission cannot write Live Trivia.');
    core.content(row);
    if(old?.status==='deleted'&&!restore)throw new AdmissionError('retired','This question is retired. Use the reviewed undo tool; it cannot be reimported or approved.');
    if(!old||old.question_pool!=='anytime_blitz')row.status='pending_review';
    if(approvedOnly)approval.requireUnchangedPendingApproval(input,old,row,{generated,restore,undo});
    if(row.status==='active'&&old?.status!=='active')await requireStarCapRoom(row.id);
    if(importMode&&old&&core.contentHash(row)===core.contentHash(old)&&row.status===old.status)return {row:old,idempotent:true};
    // D38 (Andrew, 2026-11-19): an edit that keeps a live question live is compared with live questions only. The
    // question already holds its place, so a deleted or waiting copy of the fact can't make a live repeat (waiting
    // rows are checked against live ones when approved). New rows, imports, generation, restores and undo keep the
    // full bank; a changed fact is still reserved below (reservePreviousFact). D45 (Phase 7d): another question's
    // reserved previous fact still counts. Quick Keep sends any question admitted before a live edit to the overnight
    // check (migration 20261119193552), since this check didn't compare the edit with waiting questions.
    const liveEdit=!approvedOnly&&!importMode&&!restore&&!undo&&!generated&&speed(old)&&old.status==='active'&&row.status==='active';
    const scope=approvedOnly?'approved':liveEdit?'live-edit':null;
    const releasedNow=scope?null:await readReleased();
    const contentChanged=speed(old)&&core.contentHash(old)!==core.contentHash(row);
    // The edit's relation to its previous version: one judgement per write, shared by D38b and the reservation below.
    let previousMemo=null;
    const previousRelation=()=>previousMemo??=(async()=>{
      const exact=core.deterministicPair(row,old);
      return {exact,previous:exact?.decision==='duplicate'?exact:(await cappedJudge.adjudicate([{id:'previous-version',a:row,b:old}]))[0]};
    })();
    // D38b (one pass, Phase 7d): the live questions the previous version already repeated, among those this edit
    // repeats. Every retrieved pair for the edit is judged (no early stop; the final check reuses these verdicts from
    // the pair cache), then the previous version only against the edit's repeats. Empty when the edit has an uncertain
    // pair or a repeat the previous version didn't have: the edit is then refused as before.
    const preexistingRepeats=async view=>{
      const retrieval=core.retrieve(view,row,{excludeId:old.id});
      if(!retrieval.complete)return new Set();
      const decided=new Map(),tasks=[];
      for(const hit of retrieval.matches){
        const other=view.byId.get(hit.id).row,exact=core.deterministicPair(row,other);
        if(exact)decided.set(other.id,exact);else tasks.push({id:other.id,a:row,b:other});
      }
      for(const verdict of tasks.length?await thoroughJudge.adjudicate(tasks):[])decided.set(verdict.id,verdict);
      if([...decided.values()].some(verdict=>verdict.decision==='uncertain'))return new Set();
      const repeats=[...decided].filter(([,verdict])=>verdict.decision==='duplicate').map(([id])=>view.byId.get(id).row);
      const oldExact=new Map(repeats.map(other=>[other.id,core.deterministicPair(old,other)]));
      const oldTasks=repeats.filter(other=>!oldExact.get(other.id)).map(other=>({id:other.id,a:old,b:other}));
      for(const verdict of oldTasks.length?await thoroughJudge.adjudicate(oldTasks):[])oldExact.set(verdict.id,verdict);
      if(!repeats.every(other=>oldExact.get(other.id)?.decision==='duplicate'))return new Set();
      return new Set(repeats.map(other=>other.id));
    };
    for(let attempt=0;attempt<=2;attempt++){
      budget.assertTime(); await refresh();
      // A question's own reserved facts never block it (they "must not return under another ID").
      const liveView=scope==='live-edit'?approval.liveEditIndex(index):null;
      const ownHistory=liveView?approval.historyOf(liveView,old.id):null;
      const comparisonIndex=scope==='approved'?approval.approvedIndex(index):liveView?approval.without(liveView,ownHistory):approval.releasedIndex(index,releasedNow);
      let evidence=await core.checkCandidate(comparisonIndex,row,{...cappedJudge,excludeId:old?.id||null});
      // D38b: a live edit that keeps its fact (a rewording, or a difficulty-only change) can't create a repeat. Live
      // questions the previous version already repeated are set aside once and the edit is checked again; a repeat
      // the edit would newly create still refuses.
      if(liveView&&evidence.decision==='duplicate'&&(!contentChanged||(await previousRelation()).previous.decision==='duplicate')){
        let preexisting;
        try{preexisting=await preexistingRepeats(comparisonIndex);}
        catch(error){
          if(error instanceof AdmissionError)throw error;
          budget.assertTime();
          throw new AdmissionError('verification_unavailable','Question checks are unavailable for this item.',evidence);
        }
        if(preexisting.size){
          evidence=await core.checkCandidate(approval.without(liveView,new Set([...ownHistory,...preexisting])),row,{...cappedJudge,excludeId:old.id});
          if(evidence.decision==='unique')evidence.preexistingRepeats=[...preexisting];
        }
      }
      if(scope)evidence.comparisonScope=scope;
      requireUnique(evidence);
      let reservePreviousFact=false;
      if(contentChanged){
        // A wording edit keeps one representative. An edit testing a different
        // fact reserves the previous fact; it must not return under another ID.
        const {exact,previous}=await previousRelation();
        if(previous.decision==='uncertain'||(previous!==exact&&previous.qualityA!=='sound'))throw new AdmissionError('uncertain','The relationship to the previous question remains uncertain.',evidence);
        reservePreviousFact=previous.decision==='unique';
      }
      const payload=Object.fromEntries(['id','slug','question','options','correct_answer','category','difficulty','question_pool','answer_format','image_url','image_context','status'].filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
      const generation=typeof input.subtopic==='string'&&typeof input.primarySubject==='string'?{version:'speed-subject-plan-v1',...writerMeta(input.writerMeta),subtopic:input.subtopic,primarySubject:input.primarySubject}:null;
      budget.assertTime();
      const envelope={payloadHash:core.hash(canonicalText(payload)),contentHash:evidence.contentHash,policyVersion:core.POLICY_VERSION,corpusRevision:revision,oldHash:old?stateHash(old):null,expiresAt:Date.now()+Math.min(300000,budget.remainingTime()),restore,reservePreviousFact,generation,...(scope?{comparisonScope:scope}:{})};
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
  return {write,checkApproved,leave,refresh,budget,corpus:()=>index.corpus,index:()=>index,client};
};
module.exports={WRITER_META_KEYS,writerMeta,DEFAULT_CONCURRENCY,PROBE,RECENT_FACT_CATEGORY,recentFact,sameAnswer,canonicalText,stateHash,sign,signText,speed,rpc,AdmissionError,createBudget,readerFor,createSession};

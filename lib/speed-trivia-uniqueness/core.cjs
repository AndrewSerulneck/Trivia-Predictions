/* Shared Speed-only comparison policy. No application/database writes or provider calls.
 * Retrieval is evidence selection, never an automatic semantic duplicate decision.
 */
const { createHash } = require('node:crypto');
const POLICY_VERSION = 'speed-facts-v2';
const EXTRACTOR_VERSION = 'answer-concepts-v2';
const RETRIEVAL_VERSION = 'union-answer-bm25-concepts-v4';
const LIMITS = Object.freeze({ lexical: 24, concepts: 24, total: 128 });
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
const deepFreeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); }
  return value;
};
const normalize = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const exactKey = value => normalize(value).replaceAll(' ', '');
// Broad geography/entity aliases, not fixture fact IDs. Neither titles nor people
// with the same surname get merged. Distractors never enter entity postings.
const ALIASES = [
  ['soviet union','ussr','u s s r','union of soviet socialist republics'],
  ['united states','united states of america','usa','u s a','us','u s'],
  ['united kingdom','uk','u k','great britain'],
  ['ancient egyptians','egyptians','egyptian'],
  ['mount everest','everest'], ['sputnik 1','sputnik i','sputnik'],
];
const aliasText = text => {
  let result = normalize(text);
  // Replace each group in one pass: a canonical phrase containing a shorter
  // alias must not expand again ("ancient Egyptians" -> "ancient ancient ...").
  for (const group of ALIASES) result=result.replace(new RegExp('\\b(?:'+[...group].sort((a,b)=>b.length-a.length).join('|')+')\\b','g'),group[0]);
  return result.trim();
};
const answerKey = text => exactKey(aliasText(text));
const STOP = new Set('a an the what which who whose where when why how is are was were be been being has have had do does did of in on at to for from by as it its this that these those with and or often known called name primarily famous most world worlds following'.split(' '));
const tokens = text => [...new Set(aliasText(text).split(' ').filter(t => t && !STOP.has(t)).map(t => t.length > 5 ? t.replace(/(ing|ed|s)$/,'') : t))];
// Low-cost semantic route: controlled relation concepts over question AND answer.
// This small ontology is not a universal fact identity; semantic judgment follows.
const CONCEPTS = [
  ['origin','origin','began','begin','started','first','birthplace','invented','created','founded'],
  ['location','located','location','situated','lies','lie','found','home','belongs','belong'],
  ['authorship','author','wrote','written','writer','created','creator'],
  ['performance','perform','performed','sang','singer','artist','musician','instrument','plays','playing'],
  ['lifespan','lifespan','longevity','longest','living','lived','oldest','age'],
  ['classification','type','kind','class','group','category','termed','term'],
  ['composition','contains','made','consists','composed','comprises','element','chemical'],
  ['circulation','pump','pumping','circulates','circulate','blood'],
  ['transport','sent','send','launch','launched','orbit','satellite'],
  ['hemispheres','equator','meridian','hemisphere','hemispheres','four'],
  ['comparison','highest','tallest','largest','biggest','smallest','fastest','maximum'],
];
const content = row => {
  if (!row || typeof row !== 'object' || row.question_pool !== 'anytime_blitz' || row.answer_format !== 'multiple_choice') throw new Error('invalid-speed-pool-or-format');
  if (typeof row.id !== 'string' || !row.id || typeof row.question !== 'string' || !row.question.trim() || typeof row.category !== 'string' || !row.category.trim()) throw new Error('malformed-question');
  if (!['active','pending_review','deleted'].includes(row.status)) throw new Error('invalid-status');
  if (!Array.isArray(row.options) || row.options.length < 2 || row.options.some(o => typeof o !== 'string' || !o.trim()) || !Number.isInteger(row.correct_answer) || row.correct_answer < 0 || row.correct_answer >= row.options.length) throw new Error('malformed-answer');
  const answer = row.options[row.correct_answer];
  if (row.answer != null && answerKey(row.answer) !== answerKey(answer)) throw new Error('conflicting-answer');
  if (row.image_url != null && typeof row.image_url !== 'string') throw new Error('malformed-image');
  if (row.image_url && !row.image_context) throw new Error('unverified-image-context');
  if (row.image_context != null && (typeof row.image_context !== 'object' || Array.isArray(row.image_context))) throw new Error('malformed-image-context');
  return { question:row.question, answer, options:row.options, correctAnswer:row.correct_answer, category:row.category, imageUrl:row.image_url || null, imageContext:canonical(row.image_context || null), pool:row.question_pool, format:row.answer_format };
};
const contentHash = row => hash(canonical(content(row)));
const derive = row => {
  const c = content(row), words = tokens(c.question + ' ' + c.answer), wordSet = new Set(words);
  const concepts = CONCEPTS.filter(group => group.slice(1).some(word => wordSet.has(tokens(word)[0]))).map(group => `relation:${group[0]}`);
  const primaryMentions = (c.question.match(/\b[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*/g) || []).filter(v => !STOP.has(normalize(v)));
  return { contentHash:contentHash(row), extractorVersion:EXTRACTOR_VERSION, answerEntity:answerKey(c.answer), primaryEntities:primaryMentions.map(aliasText), description:`${c.question} Answer: ${c.answer}`, qualifiers:c.question.match(/\b(?:\d{1,4}|first|last|largest|longest|current|modern|ancient|general|special)\b/gi) || [], lexical:tokens(c.question), semantic:[...new Set([...words,...concepts])] };
};
const corpusDigest = rows => hash(rows.map(row => [row.id,row.status,contentHash(row)]).sort((a,b) => a[0].localeCompare(b[0])));
const createCorpus = (rows, evidence) => {
  if (!evidence || evidence.complete !== true || !Number.isSafeInteger(evidence.expectedCount) || evidence.expectedCount <= 0 || evidence.expectedCount !== rows?.length || typeof evidence.revision !== 'string' || !evidence.revision) throw new Error('incomplete-corpus');
  const seen = new Set();
  const copy = rows.map(row => {
    content(row);
    if (seen.has(row.id)) throw new Error('duplicate-corpus-id');
    seen.add(row.id);
    // Freeze a copy: caller edits cannot silently invalidate an index/evidence.
    return deepFreeze(JSON.parse(JSON.stringify(row)));
  });
  const digest = corpusDigest(copy);
  if (evidence.digest && evidence.digest !== digest) throw new Error('stale-corpus-digest');
  return Object.freeze({ rows:Object.freeze(copy), revision:evidence.revision, digest, complete:true });
};
// Reader must supply independent count/revision evidence before and after paging.
// Future atomic admission revision is Phase 3. Current snapshot audits are not receipts.
const loadCorpus = async ({ readEvidence, readPage, pageSize=500 }) => {
  if (typeof readEvidence !== 'function' || typeof readPage !== 'function') throw new Error('missing-corpus-dependency');
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0 || pageSize > 1000) throw new Error('invalid-page-size');
  const before = await readEvidence();
  if (!before || !Number.isSafeInteger(before.count) || before.count <= 0 || typeof before.revision !== 'string' || !before.revision) throw new Error('invalid-corpus-evidence');
  const rows = [];
  for (let offset=0; offset<before.count; offset+=pageSize) {
    const page = await readPage({ offset, limit:pageSize, revision:before.revision });
    if (!page || page.revision !== before.revision || !Array.isArray(page.rows) || page.rows.length !== Math.min(pageSize,before.count-offset)) throw new Error('incomplete-or-stale-page');
    for (const row of page.rows) {
      if (rows.length && rows.at(-1).id >= row.id) throw new Error('unordered-page');
      rows.push(row);
    }
  }
  const after = await readEvidence();
  if (before.count !== after?.count || before.revision !== after?.revision) throw new Error('stale-corpus-revision');
  return createCorpus(rows,{ complete:true,expectedCount:before.count,revision:before.revision });
};
const buildIndex = corpus => {
  if (!corpus?.complete || corpus.digest !== corpusDigest(corpus.rows)) throw new Error('invalid-corpus');
  const byId = new Map(), answers = new Map(), exact = new Map(), lexical = new Map(), semantic = new Map();
  const post = (index,key,id) => { if (!index.has(key)) index.set(key,new Set()); index.get(key).add(id); };
  for (const row of corpus.rows) {
    const meta = derive(row); byId.set(row.id,{ row, meta });
    post(answers,meta.answerEntity,row.id);
    // Answer token sets retrieve reordered multi-entity answers as well as
    // literal aliases. They are not a semantic equivalence/identity rule.
    post(answers,'bag:'+tokens(content(row).answer).sort().join('|'),row.id);
    post(exact,exactKey(row.question),row.id);
    for (const token of meta.lexical) post(lexical,token,row.id);
    for (const token of meta.semantic) post(semantic,token,row.id);
  }
  return { corpus, byId, answers, exact, lexical, semantic };
};
const ranked = (postings, query, count) => {
  const scores = new Map();
  for (const word of query) for (const id of postings.get(word) || []) scores.set(id,(scores.get(id)||0)+Math.log(1+count/(postings.get(word).size+1)));
  return [...scores].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
};
const retrieve = (index,candidate,{ excludeId=null }={}) => {
  const meta = derive(candidate), routes = new Map();
  const add = (id,route,score=0) => {
    if (id === excludeId) return;
    if (!routes.has(id)) routes.set(id,{ id, routes:[], score:0 });
    routes.get(id).routes.push(route); routes.get(id).score += score;
  };
  // All same-answer and exact hits are retained; overflow is uncertain, not truncated success.
  for (const id of index.exact.get(exactKey(candidate.question)) || []) add(id,'exact',100);
  for (const id of index.answers.get(meta.answerEntity) || []) add(id,'answer',10);
  for (const id of index.answers.get('bag:'+tokens(content(candidate).answer).sort().join('|')) || []) add(id,'answer-set',5);
  for (const [id,score] of ranked(index.lexical,meta.lexical,index.byId.size).filter(([id]) => id !== excludeId).slice(0,LIMITS.lexical)) add(id,'lexical',score);
  for (const [id,score] of ranked(index.semantic,meta.semantic,index.byId.size).filter(([id]) => id !== excludeId).slice(0,LIMITS.concepts)) add(id,'semantic-concepts',score);
  // Small corpora can be compared exhaustively at bounded cost, even when two
  // distinct facts share no retrieval token. This also isolates adjudication
  // evaluation from retrieval. Large banks still use the measured union above.
  if(index.byId.size<=LIMITS.total)for(const id of index.byId.keys())add(id,'small-corpus');
  const matches = [...routes.values()].sort((a,b) => b.score-a.score || a.id.localeCompare(b.id));
  return { matches:matches.slice(0,LIMITS.total), complete:matches.length<=LIMITS.total, total:matches.length, retrievalVersion:RETRIEVAL_VERSION };
};
const pairKey = (a,b,modelVersion) => hash([POLICY_VERSION,EXTRACTOR_VERSION,modelVersion,...[contentHash(a),contentHash(b)].sort()]);
const deterministicPair = (a,b) => {
  const ca=content(a), cb=content(b);
  if (JSON.stringify(ca.imageContext) !== JSON.stringify(cb.imageContext) || ca.imageUrl !== cb.imageUrl) return null;
  if (exactKey(ca.question) !== exactKey(cb.question)) {
    // Conservative contradiction hold, not a claim of semantic identity. A
    // judge must not rationalize conflicting answers to nearly the same scope
    // as novelty. Different named subjects/years/images bypass this guard.
    const ma=derive(a),mb=derive(b),shared=ma.lexical.filter(t=>mb.lexical.includes(t)).length;
    const overlap=2*shared/(ma.lexical.length+mb.lexical.length);
    if (answerKey(ca.answer)!==answerKey(cb.answer) && overlap>=.65 && JSON.stringify([...ma.primaryEntities].sort())===JSON.stringify([...mb.primaryEntities].sort()) && JSON.stringify([...ma.qualifiers].map(normalize).sort())===JSON.stringify([...mb.qualifiers].map(normalize).sort())) return {decision:'uncertain',explanation:'Similar question scope and subjects but contradictory correct answers require verification; wording cannot silently repair the answer.',fact:`${ca.question} / ${cb.question}`,qualityA:'uncertain',qualityB:'uncertain',confidence:'high'};
    return null;
  }
  if (answerKey(ca.answer) !== answerKey(cb.answer)) return { decision:'uncertain', explanation:'Identical question with conflicting correct answers.', fact:ca.question, qualityA:'uncertain', qualityB:'uncertain', confidence:'high' };
  return { decision:'duplicate', explanation:'Same normalized question, correct answer and image context; category/options do not supply novelty.', fact:`${ca.question} → ${ca.answer}`, qualityA:'unverified', qualityB:'unverified', confidence:'high' };
};
const validDecision = result => result && ['duplicate','unique','uncertain'].includes(result.decision) && typeof result.explanation === 'string' && result.explanation.trim().length>0 && typeof result.fact === 'string' && result.fact.trim().length>0 && ['sound','invalid','uncertain','unverified'].includes(result.qualityA) && ['sound','invalid','uncertain','unverified'].includes(result.qualityB) && ['high','medium','low'].includes(result.confidence);
const checkCandidate = async (index,candidate,{ adjudicate, modelVersion, excludeId=null, expectedRevision=index?.corpus.revision }={}) => {
  const base={ policyVersion:POLICY_VERSION, extractorVersion:EXTRACTOR_VERSION, retrievalVersion:RETRIEVAL_VERSION, modelVersion:modelVersion || 'unavailable', corpusRevision:index?.corpus.revision || null, corpusDigest:index?.corpus.digest || null, contentHash:null, matchedRowIds:[], comparisons:[] };
  const uncertain = explanation => ({ ...base, decision:'uncertain',explanation });
  try {
    base.contentHash=contentHash(candidate);
    if (!index?.corpus.complete || expectedRevision !== index.corpus.revision) return uncertain('Incomplete or stale corpus.');
    const retrieval=retrieve(index,candidate,{excludeId}); base.retrieval=retrieval;
    if (!retrieval.complete) return uncertain('Retrieval competitor budget exhausted.');
    const tasks=[],results=[];
    for (const hit of retrieval.matches) {
      const other=index.byId.get(hit.id).row, deterministic=deterministicPair(candidate,other);
      if (deterministic) results.push({ id:hit.id,...deterministic });
      else tasks.push({ id:hit.id, a:candidate,b:other,key:pairKey(candidate,other,modelVersion) });
    }
    if (results.some(r=>r.decision==='duplicate')) { base.comparisons=results; base.matchedRowIds=results.filter(r=>r.decision==='duplicate').map(r=>r.id); return { ...base,decision:'duplicate',explanation:'Exact repeated knowledge.' }; }
    if (typeof adjudicate !== 'function' || !modelVersion) return uncertain('Semantic dependency unavailable.');
    // Even no-hit candidates require a soundness check, never empty-corpus optimism.
    const verdicts=await adjudicate(tasks.length ? tasks : [{ id:'candidate-soundness',a:candidate,b:candidate,key:pairKey(candidate,candidate,modelVersion) }]);
    if (!Array.isArray(verdicts) || verdicts.length !== (tasks.length || 1) || new Set(verdicts.map(r=>r.id)).size !== verdicts.length) return uncertain('Incomplete semantic result.');
    const expectedIds=new Set(tasks.length ? tasks.map(t=>t.id) : ['candidate-soundness']);
    if (verdicts.some(r=>!expectedIds.has(r.id) || !validDecision(r))) return uncertain('Invalid semantic schema.');
    if (tasks.length) results.push(...verdicts);
    base.comparisons=results; base.matchedRowIds=results.filter(r=>r.decision==='duplicate').map(r=>r.id);
    if (base.matchedRowIds.length) return { ...base,decision:'duplicate',explanation:results.find(r=>r.decision==='duplicate').explanation };
    if (verdicts.some(r=>r.decision==='uncertain' || r.qualityA!=='sound') || results.some(r=>r.decision==='uncertain')) return uncertain('Fact scope, accuracy or comparison remains uncertain.');
    return { ...base,decision:'unique',explanation:'No repeated required knowledge among verified retrieved competitors; empirical retrieval policy applies.' };
  } catch (error) { return uncertain(`Unverified comparison: ${error instanceof Error ? error.message : 'dependency-failed'}`); }
};
// Batch shares ALL earlier candidates (including quarantined facts) across categories.
const checkBatch = async (corpus,candidates,options) => {
  const index=buildIndex(corpus),results=[];
  const post=(map,key,id)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(id);};
  for (const candidate of candidates) {
    results.push(await checkCandidate(index,candidate,options));
    try {
      const row=deepFreeze(JSON.parse(JSON.stringify(candidate))),meta=derive(row);
      if(index.byId.has(row.id))continue;
      index.byId.set(row.id,{row,meta});
      post(index.answers,meta.answerEntity,row.id);post(index.answers,'bag:'+tokens(content(row).answer).sort().join('|'),row.id);post(index.exact,exactKey(row.question),row.id);
      for(const token of meta.lexical)post(index.lexical,token,row.id);
      for(const token of meta.semantic)post(index.semantic,token,row.id);
      // Reuse per-row content hashes; no repeated full-corpus extraction/index
      // construction in the candidate loop. Digest matches corpusDigest().
      const digest=hash([...index.byId].map(([id,value])=>[id,value.row.status,value.meta.contentHash]).sort((a,b)=>a[0].localeCompare(b[0])));
      index.corpus=Object.freeze({rows:Object.freeze([...index.corpus.rows,row]),complete:true,revision:`${corpus.revision}:batch:${results.length}`,digest});
    } catch { /* malformed candidate already uncertain */ }
  }
  return results;
};
module.exports={ POLICY_VERSION,EXTRACTOR_VERSION,RETRIEVAL_VERSION,LIMITS,hash,canonical,normalize,exactKey,answerKey,content,contentHash,derive,corpusDigest,createCorpus,loadCorpus,buildIndex,retrieve,pairKey,deterministicPair,validDecision,checkCandidate,checkBatch };

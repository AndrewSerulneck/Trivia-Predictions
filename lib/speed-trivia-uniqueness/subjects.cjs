/* Local subject evidence, separate from speed-facts-v2. Registry matches are
 * partial coverage; model labels alone never establish identity or a role. */
const core = require('./core.cjs');
const registry = require('../../docs/fixtures/speed-trivia-variety-subject-registry-v1.json');
const POLICY = 'speed-subject-variety-v1';
const CLASSIFIER = 'speed-subject-roles-v1';
const COOLDOWN_MS = 30 * 86400000;
const CONCENTRATION = 24;
const normalize = text => String(text || '').replace(/[łŁ]/g, 'l').replace(/[øØ]/g, 'o').replace(/[ß]/g, 'ss').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const entities = new Map(registry.entities.map(entity => [entity.key, entity]));
const aliases = registry.entities.flatMap(entity => entity.aliases.map(alias => ({ entity, alias: normalize(alias) }))).sort((a,b) => b.alias.length-a.alias.length);
const creatorRelation = /\b(author|authored|wrote|written|writer|compos\w*|released|recorded|sang|sung|singer|artist|album|song|novel|book by|created by|directed by)\b/;
const personRole = /\b(poet|singer|performer|musician|artist|author|writer|composer|chemist|physicist|scientist|sculptor|inventor|actor|actress|director|athlete|player|leader|president|explorer|collaborat\w*)\b/;
const groupRole = /\b(band|group|orchestra|team|duo|trio|ensemble)\b/;
const workContext = /\b(character|characters|episode|season|premier\w*|setting|fictional|protagonist|network|television|tv|screen|literary|narrative|published|publication|genre|plot|story|stories)\b/;
const workRole = /\b(song|album|novel|book|film|movie|series|franchise|play|poem|painting|sculpture|opera|symphony|work|adaptation|narrative)\b/;
const genericRole = /\b(country|continent|city|river|island|mountain|material|metal|element|planet|animal|species|organ|structure|climate|pattern|technique|instrument|genre|language|number|year|force|process|chemical|mineral|ocean|food|sport|rule|unit|color|colour)\b/;
const namedSlot = /\b(who|whose|which (?:sculptor|explorer|poet|singer|performer|musician|artist|author|writer|composer|actor|actress|director|athlete|leader|president|inventor|scientist|chemist|band|group|novel|album|song|film|movie|book))\b/;

// Preserve original spans despite normalization expanding punctuation/diacritics.
const mapped = text => {
 let normalized='', offsets=[];
 for(let i=0;i<text.length;i++) {
  const c=normalize(text[i]);
  const value=c || ' ';
  for(const letter of value){normalized+=letter;offsets.push(i);}
 }
 return {text:normalized,offsets};
};
const spansFor = (m, alias) => {
 const words=alias.split(' ').filter(Boolean);
 const pattern=new RegExp('(?<![a-z0-9])'+words.join(' +')+'(?![a-z0-9])','g'), spans=[];
 for(const match of m.text.matchAll(pattern))spans.push({start:m.offsets[match.index],end:m.offsets[match.index+match[0].length-1]+1});
 return spans;
};
const incidental = (text, span) => /\b(unlike|compared (?:with|to)|rather than|not)\s*$/.test(normalize(text.slice(Math.max(0,span.start-35),span.start)));
const roleAllows = (entity, question, text, span, source) => {
 if(incidental(text,span))return false;
 const q=normalize(question);
 if(entity.key==='group:queen' && (/queen of soul|queen of (?:england|britain)|royal|kingdom|monarch/.test(q)||!groupRole.test(q)))return false;
 if(entity.ambiguous) {
  if(entity.kind==='work'&&!workRole.test(q)&&!workContext.test(q))return false;
  if(entity.kind==='person'&&!personRole.test(q))return false;
  if(entity.kind==='group'&&!groupRole.test(q))return false;
 }
 // Full curated identities are evidence; aliases marked ambiguous need roles.
 if(source==='question'&&entity.kind==='person'&&!personRole.test(q)&&!creatorRelation.test(q)&&!namedSlot.test(q)&&!/\b(born|birth|died|death|tour|award|won|collaborat\w*|invented|discovered|ruled|reign|played|instrument|printed|developed|designed|created|attended|studied|published|married|father|mother|family|name|age|nationality|associated)\b/.test(q))return false;
 return source==='answer'||source==='image'||entity.kind!=='work'||workRole.test(q)||workContext.test(q)||creatorRelation.test(q);
};
const extract = (row, {proposals=[], generated=false}={}) => {
 const question=String(row.question||''), answer=String(row.options?.[row.correct_answer]??row.answer??'');
 const image=String(row.image_context?.subject||'');
 const sources={question,answer,...(image&&/\b(image|photo|picture|depicted|shown|portrait|pictured)\b/.test(normalize(question))?{image}: {})};
 const mappings=Object.fromEntries(Object.entries(sources).map(([key,text])=>[key,mapped(text)]));
 const found=new Map(), unresolved=[];
 const add=(entity,span,source,role='registered-focus')=>{
  const prior=found.get(entity.key);
  const evidence={source,...span,text:sources[source].slice(span.start,span.end),role};
  if(prior)prior.spans.push(evidence);else found.set(entity.key,{key:entity.key,kind:entity.kind,name:entity.name,spans:[evidence],creators:[]});
 };
 for(const {entity,alias} of aliases) for(const [source,text]of Object.entries(sources))for(const span of spansFor(mappings[source],alias)) {
  if(roleAllows(entity,question,text,span,source))add(entity,span,source);
 }
 // Relations expand only reviewed links and only creator-focused questions.
 if(creatorRelation.test(normalize(question))&&!/\b(narrative technique|adaptation|cast|played the lead|setting|set in)\b/.test(normalize(question))) {
  for(const subject of [...found.values()])for(const key of entities.get(subject.key)?.creators||[]) {
   const creator=entities.get(key);if(!creator)continue;
   subject.creators.push(key);
   if(!found.has(key))found.set(key,{key,kind:creator.kind,name:creator.name,spans:subject.spans.map(span=>({...span,role:'reviewed-creator-relation'})),creators:[]});
  }
 }
 // Open-world admission: exact supplied spans plus independently recognizable
 // grammatical role, full name/title, and no conflicting curated identity.
 for(const proposal of proposals) {
  const text=sources[proposal?.source];
  if(typeof text!=='string'||!Number.isInteger(proposal.start)||!Number.isInteger(proposal.end)||proposal.start<0||proposal.end<=proposal.start||proposal.end>text.length||!['person','group','work'].includes(proposal.kind)) {unresolved.push('invalid-source-span');continue;}
  const name=text.slice(proposal.start,proposal.end),normalized=normalize(name);
  if(normalized!==normalize(proposal.name)||normalized.length<4||normalized.length>160||incidental(text,proposal)) {unresolved.push('untrusted-subject-label');continue;}
  if([...found.values()].some(subject=>subject.kind===proposal.kind&&(normalize(subject.name)===normalized||subject.spans.some(span=>span.source===proposal.source&&span.start===proposal.start&&span.end===proposal.end))))continue;
  const before=normalize(text.slice(Math.max(0,proposal.start-32),proposal.start));
  const q=normalize(question);
  const role=proposal.kind==='person'?personRole:proposal.kind==='group'?groupRole:workRole;
  const precise=normalized.split(' ').length>=2 && !/^(a|an|the|this|that|which|what|who)\b/.test(normalized);
  const grounded=role.test(before)||proposal.source==='answer'&&role.test(q)&&/\b(which|what|who|whose)\b/.test(q)&&!genericRole.test(q.split(' ').slice(0,4).join(' '));
  // A single ambiguous title cannot establish a universal work identity.
  if(!precise||!grounded||aliases.some(a=>a.alias===normalized&&a.entity.ambiguous)) {unresolved.push('identity-role-unresolved');continue;}
  const key=proposal.kind+':'+normalized.replaceAll(' ','-');
  add({key,kind:proposal.kind,name},proposal,proposal.source,'grounded-role');
 }
 if(generated) {
  // Suspicious named spans only produce unknown coverage, never guessed keys.
  const patterns=[/\b(?:singer|performer|musician|artist|author|writer|composer|sculptor|explorer|actor|chemist|physicist|band|group|album|song|novel|book|film|movie)\s+["“]?([\p{Lu}][\p{L}'’.-]*(?:\s+[\p{Lu}][\p{L}'’.-]*)*)/gu,/\b(?:released|recorded|collaborated with|written by|created by|directed by)\s+["“]?([\p{Lu}][\p{L}'’.-]*(?:\s+[\p{Lu}][\p{L}'’.-]*)*)/gu];
  for(const pattern of patterns)for(const match of question.matchAll(pattern)){
   const start=match.index+match[0].indexOf(match[1]),end=start+match[1].length;
   if(![...found.values()].some(subject=>subject.spans.some(span=>span.source==='question'&&span.start<=start&&span.end>=end)))unresolved.push('named-primary-span-unresolved');
  }
 }
 const q=normalize(question), a=normalize(answer);
 const placeholder=/^(a|an) (?:actor|performer|chemist|album|artist|poet)|^free indirect discourse$/.test(a);
 const unknownNamed=namedSlot.test(q)&&!placeholder&&!found.size;
 const unknown=unresolved.length>0||unknownNamed||(!found.size&&(!genericRole.test(q)||/\bunlike\b/.test(q)&&namedSlot.test(q)));
 // Generated named slots must be covered even when another known subject exists.
 const answerIdentified=[...found.values()].some(subject=>subject.spans.some(span=>span.source==='answer'));
 const missingAnswer=generated&&namedSlot.test(q)&&!placeholder&&!answerIdentified&&!genericRole.test(q);
 if(missingAnswer)unresolved.push('answer-identity-unresolved');
 return {policyVersion:POLICY,classifierVersion:CLASSIFIER,registryVersion:registry.version,contentHash:core.contentHash(row),coverage:unknown||missingAnswer?'unknown':found.size?'identified':'generic',subjects:[...found.values()].sort((a,b)=>a.key.localeCompare(b.key)),unresolved};
};
const evidenceFor = row => {
 const value=row.speed_subject_evidence;
 if(value?.policyVersion===POLICY&&value.classifierVersion===CLASSIFIER&&value.contentHash===core.contentHash(row)&&Array.isArray(value.subjects))return value;
 return extract(row);
};
const createState = (rows, now=Date.now()) => {
 const records=new Map(), counters=new Map(), history=new Map(), invalid=new Set();
 const coverage={identified:0,generic:0,unknown:0};
 const add=row=>{
  const evidence=evidenceFor(row), keys=[...new Set(evidence.subjects.map(s=>s.key))];
  records.set(row.id,{row,evidence,keys});coverage[evidence.coverage]++;
  for(const key of keys)if(row.status!=='deleted')counters.set(key,(counters.get(key)||0)+1);
  const events=evidence.history||keys.map(key=>({key,introducedAt:row.created_at,source:'legacy-created-at-proxy'}));
  for(const event of events){const time=Date.parse(event.introducedAt);if(!Number.isFinite(time)||time>now){invalid.add(event.key);continue;}history.set(event.key,Math.max(history.get(event.key)||0,time));}
 };
 const remove=id=>{const old=records.get(id);if(!old)return;coverage[old.evidence.coverage]--;for(const key of old.keys)if(old.row.status!=='deleted')counters.set(key,(counters.get(key)||1)-1);records.delete(id);};
 for(const row of rows)add(row);
 return {records,counters,history,invalid,coverage,applyDelta:delta=>{for(const id of delta.removedIds||[])remove(id);for(const row of delta.rows||[]){remove(row.id);add(row);}},check:(evidence,used=new Set(),checkNow=now)=>{
  if(evidence.coverage==='unknown')return 'subject_identity_unresolved';
  for(const {key}of evidence.subjects){if(used.has(key))return 'subject_run_repeat';if(invalid.has(key))return 'subject_history_unknown';if((counters.get(key)||0)>=CONCENTRATION)return 'subject_concentration';const time=history.get(key);if(time!==undefined&&checkNow-time<COOLDOWN_MS)return 'subject_cooldown';}
  return null;
 }};
};
const introductionEvidence = (row, prior, evidence, now=Date.now()) => {
 const old=prior?evidenceFor(prior):null;
 const history=new Map((old?.history||old?.subjects.map(s=>({key:s.key,introducedAt:prior.created_at,source:'legacy-created-at-proxy'}))||[]).map(event=>[event.key,event]));
 for(const subject of evidence.subjects)if(!old?.subjects.some(s=>s.key===subject.key))history.set(subject.key,{key:subject.key,introducedAt:new Date(now).toISOString(),source:'signed-introduction'});
 return {...evidence,history:[...history.values()].sort((a,b)=>a.key.localeCompare(b.key))};
};
module.exports={POLICY,CLASSIFIER,COOLDOWN_MS,CONCENTRATION,normalize,extract,evidenceFor,createState,introductionEvidence};

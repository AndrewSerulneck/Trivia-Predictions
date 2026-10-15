/* Pending-only authorities. No caller-supplied arbitrary exclusion list. */
const core=require('./core.cjs');
const runtime=require('./runtime.cjs');
const {rankKeepers}=require('./retirement.cjs');
const VERSION='speed-pending-review-v1';
const cachedVerdict=(cache,a,b,modelVersion)=>{
 const value=cache.get(core.pairKey(a,b,modelVersion));
 if(!value||value.modelVersion!==modelVersion||!core.validDecision(value.result)||![core.contentHash(a),core.contentHash(b)].includes(value.firstHash))return null;
 const reverse=value.firstHash!==core.contentHash(a);
 return {...value.result,qualityA:reverse?value.result.qualityB:value.result.qualityA,qualityB:reverse?value.result.qualityA:value.result.qualityB};
};
const directProof=(loser,keeper,result,modelVersion)=>{
 if(typeof modelVersion!=='string'||!modelVersion||!core.validDecision(result)||result.decision!=='duplicate'||result.confidence!=='high'||result.qualityA!=='sound'||result.qualityB!=='sound')throw new Error('unproven-direct-sound-link');
 return {aId:loser.id,bId:keeper.id,aHash:core.contentHash(loser),bHash:core.contentHash(keeper),modelVersion,policyVersion:core.POLICY_VERSION,result};
};
// Only postings reached by retrieval are filtered, rather than rebuilding or
// extracting the full bank for every family. The frozen retrieval is rerun.
const externalIndex=(index,exclusions)=>{
 const postings=map=>({get:key=>{const values=map.get(key);return values?new Set([...values].filter(id=>!exclusions.has(id))):undefined;}});
 return {...index,byId:{size:index.byId.size-exclusions.size,get:id=>exclusions.has(id)?undefined:index.byId.get(id),keys:function*(){for(const id of index.byId.keys())if(!exclusions.has(id))yield id;}},answers:postings(index.answers),exact:postings(index.exact),lexical:postings(index.lexical),semantic:postings(index.semantic)};
};
const verifyKeeper=async(index,keeper,losers,proofs,judge)=>{
 if(keeper.status!=='pending_review'||losers.some(row=>row.status!=='pending_review'||row.id===keeper.id)||new Set(losers.map(r=>r.id)).size!==losers.length||losers.length>49)throw new Error('invalid-pending-family');
 if(proofs.length!==losers.length)throw new Error('missing-direct-proof');
 for(let i=0;i<losers.length;i++){
  const expected=directProof(losers[i],keeper,proofs[i].result,judge.modelVersion);
  if(runtime.canonicalText(expected)!==runtime.canonicalText(proofs[i]))throw new Error('stale-direct-proof');
 }
 const exclusions=new Set(losers.map(row=>row.id));
 const evidence=await core.checkCandidate(externalIndex(index,exclusions),keeper,{...judge,excludeId:keeper.id});
 if(evidence.decision!=='unique')return {ready:false,evidence};
 // Self-quality is independently required even when the candidate has a single
// direct sibling and no externally retrieved competitors.
 const [quality]=await judge.adjudicate([{id:'keeper-soundness',a:keeper,b:keeper}]);
 if(!core.validDecision(quality)||quality.qualityA!=='sound'||quality.decision==='uncertain')return {ready:false,evidence:{...evidence,decision:'uncertain',explanation:'Keeper soundness is unresolved.'}};
 return {ready:true,evidence:{...evidence,excludedSiblings:proofs.map(p=>({id:p.aId,contentHash:p.aHash})),verifiedComparisonCount:Math.max(1,evidence.comparisons.length),selfQuality:quality}};
};
const member=row=>({id:row.id,stateHash:runtime.stateHash(row),contentHash:core.contentHash(row)});
const makeAuthority=({index,kind,keeper=null,losers=[],proofs=[],keeperProof=null,rows=[],reason=null,references,operationId,now=Date.now()})=>{
 if(!references||!operationId||!['family','activate','retire','hold'].includes(kind))throw new Error('missing-review-authority-input');
 const members=kind==='family'?[keeper,...losers]:kind==='activate'?[keeper]:kind==='retire'?losers:rows;
 if(!members.length||members.length>50||members.some(row=>row.status!=='pending_review'||index.byId.get(row.id)?.meta.contentHash!==core.contentHash(row)))throw new Error('review-members-must-be-current-pending');
 if(['family','activate'].includes(kind)&&(!keeperProof||keeperProof.decision!=='unique'||keeperProof.contentHash!==core.contentHash(keeper)||keeperProof.corpusRevision!==index.corpus.revision||!keeperProof.retrieval?.complete||!keeperProof.verifiedComparisonCount))throw new Error('missing-current-keeper-proof');
 if(kind==='retire'&&keeper?.status!=='active')throw new Error('retirement-needs-active-keeper');
 for(let i=0;i<losers.length;i++){
  const expected=directProof(losers[i],keeper,proofs[i]?.result,proofs[i]?.modelVersion);
  if(runtime.canonicalText(expected)!==runtime.canonicalText(proofs[i]))throw new Error('invalid-direct-family-proof');
 }
 if(kind==='family'&&runtime.canonicalText(keeperProof.excludedSiblings)!==runtime.canonicalText(proofs.map(p=>({id:p.aId,contentHash:p.aHash}))))throw new Error('arbitrary-sibling-exclusion');
 return {version:VERSION,policyVersion:core.POLICY_VERSION,corpusRevision:index.corpus.revision,operationId,kind,expiresAt:now+300000,references,keeperId:keeper?.id||null,keeperStateHash:keeper?runtime.stateHash(keeper):null,keeperContentHash:keeper?core.contentHash(keeper):null,keeperProof,members:members.map(row=>({...member(row),...(proofs.find(p=>p.aId===row.id)?{directProof:proofs.find(p=>p.aId===row.id)}:{}),...(reason?{reason}:{})}))};
};
const disposition=(row,evidence,index)=>{
 if(evidence.failure==='provider_unavailable')return {state:'hold',reason:'provider_unavailable'};
 if(evidence.failure==='budget_exhausted'||!evidence)return {state:'not_processed',reason:'unfinished_comparisons'};
 if(evidence.decision==='unique'&&evidence.retrieval?.complete)return {state:'active'};
 if(evidence.decision==='duplicate'){
  const sound=evidence.comparisons.filter(p=>p.decision==='duplicate'&&p.qualityA==='sound'&&p.qualityB==='sound'&&p.confidence==='high');
  const active=sound.find(p=>index.byId.get(p.id)?.row.status==='active');
  if(active)return {state:'retired_repeat',keeperId:active.id};
  if(sound.some(p=>index.byId.get(p.id)?.row.status==='deleted'))return {state:'hold',reason:'reservation_review'};
  if(sound.some(p=>index.byId.get(p.id)?.row.status==='pending_review'))return {state:'pending_family',matches:sound.map(p=>p.id)};
  return {state:'hold',reason:'evidence_incomplete'};
 }
 return {state:'hold',reason:evidence.comparisons.some(p=>p.qualityA==='invalid'||p.qualityA==='uncertain')?'factual_uncertainty':'evidence_incomplete'};
};
const proposeStars=(index,targets,cache,modelVersion,references)=>{
 if(!references)throw new Error('reference-evidence-required-for-keepers');
 const targetSet=new Set(targets),assigned=new Set(),groups=[],ranking={...references};
 for(const counts of Object.values(references.counts||{}))for(const [id,count]of Object.entries(counts))ranking[id]={total:(ranking[id]?.total||0)+Number(count)};
 for(const keeper of targets.map(id=>index.byId.get(id)?.row).filter(row=>row?.status==='pending_review').sort((a,b)=>rankKeepers(a,b,ranking))){
  if(assigned.has(keeper.id))continue;
  const losers=[],proofs=[];
  // Cached edges are supplied through a content-hash adjacency, not an N²
  // scan of all pending pairs. References influence ranking, never proof.
  for(const id of references.directNeighbours?.[keeper.id]||[]){
   const loser=index.byId.get(id)?.row;
   if(!loser||!targetSet.has(id)||assigned.has(id)||loser.status!=='pending_review')continue;
   const result=cachedVerdict(cache,loser,keeper,modelVersion);
   try{proofs.push(directProof(loser,keeper,result,modelVersion));losers.push(loser);}catch{/* weak/unknown links remain unassigned */}
   if(losers.length===49)break;
  }
  if(losers.length){assigned.add(keeper.id);losers.forEach(row=>assigned.add(row.id));groups.push({keeper,losers,proofs});}
 }
 return groups;
};
const applyAuthority=(client,secret,authority)=>runtime.rpc(client,'apply_speed_trivia_review',{p_authority:runtime.canonicalText(authority),p_signature:runtime.signText(secret,runtime.canonicalText(authority))});
module.exports={VERSION,cachedVerdict,directProof,externalIndex,verifyKeeper,makeAuthority,disposition,proposeStars,applyAuthority};

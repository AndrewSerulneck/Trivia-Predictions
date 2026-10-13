/* Reviewable manifest only. No write/apply path, no implicit promotions.
 * Every retirement is justified directly against its selected keeper. A-B/B-C
 * similarity is never used as evidence for A-C. Unknown accuracy remains a hold.
 */
const core=require('./core.cjs');
const qualityScore = row => {
  const uniqueOptions=new Set(row.options.map(core.answerKey)).size;
  return (uniqueOptions===row.options.length?10:0)+(row.question.trim().endsWith('?')?2:0)-(row.question.length>240?2:0);
};
const rankKeepers = (a,b,references) => {
  const status=r=>r.status==='active'?2:r.status==='pending_review'?1:0;
  return status(b)-status(a)||qualityScore(b)-qualityScore(a)||(references[b.id]?.total||0)-(references[a.id]?.total||0)||(a.created_at||'9999').localeCompare(b.created_at||'9999')||a.id.localeCompare(b.id);
};
const createRetirementManifest = ({corpus,comparisons,references={},referenceEvidence=null,modelVersion,coverage}) => {
  if(!corpus?.complete || !modelVersion || !Array.isArray(comparisons))throw new Error('invalid-manifest-input');
  const byId=new Map(corpus.rows.map(row=>[row.id,row])),edges=new Map(),adj=new Map(),unresolved=[];
  const key=(a,b)=>[a,b].sort().join(':');
  for(const pair of comparisons){
    const a=byId.get(pair.aId),b=byId.get(pair.bId);
    if(!a||!b||a.id===b.id||pair.aHash!==core.contentHash(a)||pair.bHash!==core.contentHash(b)||!core.validDecision(pair.result))throw new Error('stale-or-invalid-pair-evidence');
    if(pair.result.decision==='unique')continue;
    edges.set(key(a.id,b.id),pair);
    if(pair.result.decision==='uncertain'||pair.result.confidence!=='high'||pair.result.qualityA!=='sound'||pair.result.qualityB!=='sound') {
      unresolved.push({aId:a.id,bId:b.id,reason:'Unresolved scope/accuracy/confidence.',evidence:pair.result});continue;
    }
    for(const [x,y]of [[a.id,b.id],[b.id,a.id]]){if(!adj.has(x))adj.set(x,new Set());adj.get(x).add(y);}
  }
  const blocked=new Set(unresolved.flatMap(p=>[p.aId,p.bId])),assigned=new Set(),groups=[],retirements=[];
  for(const row of [...corpus.rows].sort((a,b)=>rankKeepers(a,b,references))){
    if(assigned.has(row.id)||!adj.has(row.id))continue;
    const neighbours=[...adj.get(row.id)].filter(id=>!assigned.has(id));
    if(row.status!=='active'||blocked.has(row.id)){
      unresolved.push({aId:row.id,matchedIds:neighbours,reason:row.status==='deleted'?'Deleted history reserves the fact; original retirement/accuracy reason needs review.':row.status==='pending_review'?'No sound already-approved keeper; ordinary approval required.':'Keeper participates in an unresolved comparison.'});continue;
    }
    const members=neighbours.filter(id=>!blocked.has(id)&&byId.get(id).status!=='deleted');
    if(!members.length)continue;
    const groupId=core.hash([corpus.digest,row.id,...members.sort()]);
    groups.push({groupId,keeperId:row.id,keeperHash:core.contentHash(row),keeperStatus:row.status,members:[row.id,...members]});assigned.add(row.id);
    for(const id of members){
      const retired=byId.get(id),pair=edges.get(key(row.id,id));assigned.add(id);
      retirements.push({id,slug:retired.slug,oldStatus:retired.status,oldContentHash:core.contentHash(retired),keeperId:row.id,keeperSlug:row.slug,keeperContentHash:core.contentHash(row),groupId,matchedFact:pair.result.fact,explanation:pair.result.explanation,confidence:pair.result.confidence,evidence:pair,expectedReferences:references[id]||{total:0,byTable:{}},referenceEvidence,changedFields:['status','retirement_metadata'],proposedStatus:'deleted'});
    }
  }
  const disposition=new Map(groups.flatMap(group=>group.members.map(id=>[id,group.groupId])));
  for(const pair of edges.values())if(pair.result.decision==='duplicate' && (!disposition.has(pair.aId)||disposition.get(pair.aId)!==disposition.get(pair.bId))) unresolved.push({aId:pair.aId,bId:pair.bId,reason:'Duplicate edge not resolved by one directly verified approved keeper; no transitive retirement is authorized.',evidence:pair.result});
  return {version:'speed-retirement-manifest-v1',mode:'dry-run-only',applyReady:false,policyVersion:core.POLICY_VERSION,extractorVersion:core.EXTRACTOR_VERSION,retrievalVersion:core.RETRIEVAL_VERSION,modelVersion,corpusRevision:corpus.revision,corpusDigest:corpus.digest,referenceEvidence,coverage,groups,retirements,unresolved,summary:{corpusRows:corpus.rows.length,comparedPairs:comparisons.length,groups:groups.length,proposedActiveRetirements:retirements.filter(r=>r.oldStatus==='active').length,proposedPendingRetirements:retirements.filter(r=>r.oldStatus==='pending_review').length,unresolvedItems:unresolved.length,physicalDeletes:0,productionMutations:0}};
};
module.exports={qualityScore,rankKeepers,createRetirementManifest};

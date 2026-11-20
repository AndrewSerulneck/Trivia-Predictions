/* Comparison views over the checked corpus/features: approved-only (explicit, unchanged pending approvals) and
 * full-bank minus released rows (D5). Reuses the checked index; no query, provider call or full rebuild inside
 * the per-question loop. Every view is refreshed with the same bounded delta as its complete index. */
const core=require('./core.cjs');
const views=new WeakMap();
const build=(index,keep)=>{
 const byId=new Map([...index.byId].filter(([,entry])=>keep(entry.row)));
 const postings=source=>new Map([...source].map(([key,ids])=>[key,new Set([...ids].filter(id=>byId.has(id)))]).filter(([,ids])=>ids.size));
 const rows=Object.freeze([...byId.values()].map(entry=>entry.row));
 return {byId,answers:postings(index.answers),exact:postings(index.exact),lexical:postings(index.lexical),semantic:postings(index.semantic),
  corpus:Object.freeze({rows,complete:true,revision:index.corpus.revision,digest:core.corpusDigest(rows)})};
};
const scoped=(index,key,keep)=>{
 let byKey=views.get(index);
 if(!byKey){byKey=new Map();views.set(index,byKey);}
 let entry=byKey.get(key);
 if(!entry){entry={view:build(index,keep),keep};byKey.set(key,entry);}
 return entry.view;
};
const approvedIndex=index=>scoped(index,'approved',row=>row.status==='active');
const HISTORY_PREFIX='history:';
// D38 + D45 (Phase 7d): an edit that keeps a live question live meets live questions and the reserved previous facts
// of edited questions (`history:` rows), never deleted or waiting copies. Cached and refreshed like the others.
const liveEditIndex=index=>scoped(index,'live-edit',row=>row.status==='active'||String(row.id).startsWith(HISTORY_PREFIX));
// A question's own reserved facts (`history:<id>:<revision>`): a fact may come back under its own id, never another.
const historyOf=(view,rowId)=>{
 const prefix=`${HISTORY_PREFIX}${rowId}:`,ids=new Set();
 for(const id of view.byId.keys())if(id.startsWith(prefix))ids.add(id);
 return ids;
};
// R2 #26.6 (Phase 7d): `view` minus a few ids, filtered as retrieval reads it. Nothing is copied but the posting sets
// that hold a dropped id; never cached (the ids belong to one edit's check).
const without=(view,ids)=>{
 const gone=new Set([...ids].filter(id=>view.byId.has(id)));
 if(!gone.size)return view;
 const pick=set=>{
  if(!set)return set;
  for(const id of gone)if(set.has(id))return new Set([...set].filter(other=>!gone.has(other)));
  return set;
 };
 const postings=source=>({get:key=>pick(source.get(key)),has:key=>Boolean(pick(source.get(key))?.size)});
 const byId={
  get:id=>gone.has(id)?undefined:view.byId.get(id),
  has:id=>!gone.has(id)&&view.byId.has(id),
  get size(){return view.byId.size-gone.size;},
  *keys(){for(const id of view.byId.keys())if(!gone.has(id))yield id;},
  *values(){for(const [id,entry] of view.byId)if(!gone.has(id))yield entry;},
  *entries(){for(const entry of view.byId)if(!gone.has(entry[0]))yield entry;},
  [Symbol.iterator](){return this.entries();},
 };
 const digest=core.hash([view.corpus.digest,[...gone].sort()]);
 return {byId,answers:postings(view.answers),exact:postings(view.exact),lexical:postings(view.lexical),semantic:postings(view.semantic),
  corpus:Object.freeze({get rows(){return Object.freeze(view.corpus.rows.filter(row=>!gone.has(row.id)));},complete:view.corpus.complete,revision:view.corpus.revision,digest})};
};
// D5: questions rejected in Quick Review as dull or obscure no longer reserve their fact. `released` maps a row id
// to the revision it was released at (speed_trivia_released_rows_v2). A row is skipped only while it is still
// retired at exactly that revision: one brought back by Undo, or retired again later (for example as wrong), has a
// new revision and is compared again. A stale set can only miss later releases, which means comparing more, never
// fewer. History rows (`history:` ids) never match. The database revokes the fast lane for anything admitted while
// a since-restored row was skipped.
const releasedIndex=(index,released)=>{
 if(!released||released.size===0)return index;
 const key='released:'+core.hash([...released].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0));
 const byKey=views.get(index);
 // One released view per index: an older set is stale once a newer one is read.
 if(byKey)for(const name of [...byKey.keys()])if(name.startsWith('released:')&&name!==key)byKey.delete(name);
 return scoped(index,key,row=>!(row.status==='deleted'&&released.has(row.id)&&released.get(row.id)===Number(row.speed_revision)));
};
// Call after the complete index is refreshed. A row leaving a view is removed from it. The same revision binds
// every scope and catches other writers.
const refreshApprovedIndex=(index,delta,applyDelta)=>{
 const byKey=views.get(index);
 if(!byKey)return;
 for(const {view,keep} of byKey.values())applyDelta(view,{...delta,rows:delta.rows.filter(keep),
  removedIds:[...new Set([...delta.removedIds,...delta.rows.filter(row=>!keep(row)).map(row=>row.id)])]});
};
const requireUnchangedPendingApproval=(input,old,row,{generated,restore,undo}={})=>{
 if(!old||old.status!=='pending_review'||row.status!=='active'||generated||restore||undo||
  Object.keys(input).length!==1||input.status!=='active'||core.contentHash(old)!==core.contentHash(row))
  throw new Error('approved-only-requires-unchanged-pending-approval');
};
module.exports={approvedIndex,liveEditIndex,historyOf,without,releasedIndex,refreshApprovedIndex,requireUnchangedPendingApproval};

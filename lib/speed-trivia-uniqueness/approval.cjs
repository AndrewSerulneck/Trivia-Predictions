/* Approved-only comparison view for explicit, unchanged pending approvals.
 * Reuses the checked corpus/features; no query, provider call or full rebuild
 * inside the per-question loop. Generation keeps the original complete index. */
const core=require('./core.cjs');
const views=new WeakMap();
const approvedIndex=index=>{
 let view=views.get(index);
 if(view)return view;
 const byId=new Map([...index.byId].filter(([,entry])=>entry.row.status==='active'));
 const postings=source=>new Map([...source].map(([key,ids])=>[key,new Set([...ids].filter(id=>byId.has(id)))]).filter(([,ids])=>ids.size));
 const rows=Object.freeze([...byId.values()].map(entry=>entry.row));
 view={byId,answers:postings(index.answers),exact:postings(index.exact),lexical:postings(index.lexical),semantic:postings(index.semantic),
  corpus:Object.freeze({rows,complete:true,revision:index.corpus.revision,digest:core.corpusDigest(rows)})};
 views.set(index,view);return view;
};
// Call after the complete index is refreshed. Nonactive changes remove any old
// active version. The same revision binds both scopes and catches other writers.
const refreshApprovedIndex=(index,delta,applyDelta)=>{
 const view=views.get(index);
 if(!view)return;
 applyDelta(view,{...delta,rows:delta.rows.filter(row=>row.status==='active'),
  removedIds:[...new Set([...delta.removedIds,...delta.rows.filter(row=>row.status!=='active').map(row=>row.id)])]});
};
const requireUnchangedPendingApproval=(input,old,row,{generated,restore,undo}={})=>{
 if(!old||old.status!=='pending_review'||row.status!=='active'||generated||restore||undo||
  Object.keys(input).length!==1||input.status!=='active'||core.contentHash(old)!==core.contentHash(row))
  throw new Error('approved-only-requires-unchanged-pending-approval');
};
module.exports={approvedIndex,refreshApprovedIndex,requireUnchangedPendingApproval};

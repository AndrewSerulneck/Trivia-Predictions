#!/usr/bin/env node
/* Dry-run default. No grouping/recomputation and no blanket resurrection.
 * A Phase 2 dry-run manifest is NEVER an apply input. */
const fs=require('node:fs');
const path=require('node:path');
const core=require('../lib/speed-trivia-uniqueness/core.cjs');
const {canonicalText,signText,rpc,createSession,stateHash}=require('../lib/speed-trivia-uniqueness/runtime.cjs');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const validateManifest=manifest=>{
 if(manifest.version!=='speed-retirement-apply-v1'||manifest.applyReady!==true||manifest.policyVersion!==core.POLICY_VERSION||!/^\d+$/.test(manifest.corpusRevision)||!Array.isArray(manifest.retirements)||!manifest.retirements.length)throw new Error('not-a-reviewed-apply-manifest');
 const ids=new Set(manifest.retirements.map(r=>r.id));if(ids.size!==manifest.retirements.length)throw new Error('duplicate-manifest-id');
 for(const row of manifest.retirements){
  const pair=row.evidence,result=pair?.result;
  if(!UUID.test(row.id)||!UUID.test(row.keeperId)||!row.slug||!['active','pending_review'].includes(row.oldStatus)||ids.has(row.keeperId)||row.confidence!=='high'||!core.validDecision(result)||result.decision!=='duplicate'||result.confidence!=='high'||result.qualityA!=='sound'||result.qualityB!=='sound')throw new Error('unproven-or-invalid-keeper');
  const forward=pair.aId===row.id&&pair.bId===row.keeperId&&pair.aHash===row.oldContentHash&&pair.bHash===row.keeperContentHash;
  const reverse=pair.bId===row.id&&pair.aId===row.keeperId&&pair.bHash===row.oldContentHash&&pair.aHash===row.keeperContentHash;
  if(!forward&&!reverse)throw new Error('keeper-evidence-not-content-bound');
  if(row.proposedStatus!=='deleted'||JSON.stringify(row.changedFields)!==JSON.stringify(['status','retirement_metadata']))throw new Error('unsupported-retirement-fields');
 }
 return manifest;
};
const readManifest=(file,expected)=>{
 const bytes=fs.readFileSync(file,'utf8');if(!expected||core.hash(bytes)!==expected)throw new Error('manifest-checksum-mismatch');
 const manifest=validateManifest(JSON.parse(bytes)),text=canonicalText(manifest);
 return {manifest,text,manifestHash:core.hash(text),fileHash:core.hash(bytes)};
};
const run=async({client,source,apply=false,undo=false,secret=process.env.SPEED_TRIVIA_ADMISSION_SECRET,output,sessionFactory=createSession})=>{
 const {manifest,text,manifestHash}=source;
 const state=await rpc(client,'speed_trivia_cleanup_state',{p_manifest_hash:manifestHash});
 // Both apply and undo bind the ORIGINAL immutable file; the DB log is authoritative.
 if(!apply){
  // One complete revision-bound load, rather than two RPCs per retirement.
  const corpus=await core.loadCorpus({
   readEvidence:()=>rpc(client,'speed_trivia_inventory'),
   readPage:({offset,limit,revision})=>rpc(client,'speed_trivia_corpus_page',{p_revision:revision,p_offset:offset,p_limit:limit}),
  });
  if(corpus.revision!==state.revision)throw new Error('cleanup-state-revision-drift');
  const byId=new Map(corpus.rows.map(row=>[row.id,row]));
  const loggedById=new Map(state.rows.map(row=>[row.row_id,row]));
  for(const entry of manifest.retirements){
   const q=byId.get(entry.id);
   const logged=loggedById.get(entry.id);
   if(undo){if(logged&&!logged.undone&&stateHash(q)!==stateHash(logged.after_state))throw new Error('undo-state-drift');continue;}
   const keeper=byId.get(entry.keeperId);
   if(!q||q.slug!==entry.slug||(!logged&&(q.status!==entry.oldStatus||core.contentHash(q)!==entry.oldContentHash))||!keeper||keeper.status!=='active'||core.contentHash(keeper)!==entry.keeperContentHash)throw new Error('retirement-state-or-keeper-drift');
  }
  return {mode:undo?'undo-dry-run':'retirement-dry-run',manifestHash,proposed:manifest.retirements.length,alreadyApplied:state.rows.length,revision:state.revision,requiresCurrentAdmission:undo};
 }
 if(!secret||secret.length<32)throw new Error('missing-admission-signing-secret');
 if(!output||!path.resolve(output).startsWith(path.resolve('tmp/speed-trivia-uniqueness-private')+path.sep))throw new Error('apply-requires-private-output-directory');
 fs.mkdirSync(output,{recursive:true,mode:0o700});
 const journal=entry=>fs.appendFileSync(path.join(output,'operations.jsonl'),JSON.stringify({at:new Date().toISOString(),manifestHash,...entry})+'\n',{mode:0o600});
 journal({operation:undo?'undo-start':'retirement-start',fileHash:source.fileHash,revision:state.revision});
 if(undo){
  const session=await sessionFactory({client,secret});
  for(const logged of state.rows){
   if(logged.undone)continue;
   const current=(await rpc(client,'speed_trivia_find',{p_identifier:logged.row_id}))[0];
   if(stateHash(current)!==stateHash(logged.after_state))throw new Error('undo-state-drift');
   // A duplicate keeper (including any new keeper) blocks this restore. Never bypass.
   await session.write(logged.before_state,{existing:current,restore:true,undo:{manifestHash}});
   journal({operation:'undo-row',id:logged.row_id});
  }
 }else{
  const signature=signText(secret,text);
  for(let start=0;start<manifest.retirements.length;start+=50){
   const result=await rpc(client,'speed_trivia_retire_batch',{p_manifest:text,p_signature:signature,p_start:start,p_limit:50});
   journal({operation:'retirement-batch',start,result});
  }
 }
 const after=await rpc(client,'speed_trivia_cleanup_state',{p_manifest_hash:manifestHash});
 fs.writeFileSync(path.join(output,'undo-state.json'),JSON.stringify(after,null,2),{mode:0o600});
 if(!undo&&after.rows.length!==manifest.retirements.length)throw new Error('retirement-count-mismatch');
 journal({operation:'complete',rows:after.rows.length,revision:after.revision});return {manifestHash,rows:after.rows.length,revision:after.revision};
};
const main=async argv=>{
 const option=name=>argv.includes(name)?argv[argv.indexOf(name)+1]:null;
 const source=readManifest(option('--manifest'),option('--sha256'));
 if(argv.includes('--check-manifest'))return {valid:true,rows:source.manifest.retirements.length,manifestHash:source.manifestHash};
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('missing-Supabase-credentials');
 const {createClient}=require('@supabase/supabase-js');
 return run({client:createClient(url,key,{auth:{persistSession:false}}),source,apply:argv.includes('--apply'),undo:argv.includes('--undo'),output:option('--output')});
};
if(require.main===module)main(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateManifest,readManifest,run,main};

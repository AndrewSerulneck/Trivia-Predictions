#!/usr/bin/env node
// Synthetic copied-database apply/undo proof. No production data or paid models.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const core=require('../lib/speed-trivia-uniqueness/core.cjs');
const runtime=require('../lib/speed-trivia-uniqueness/runtime.cjs');
const cleanup=require('./manage-speed-trivia-retirement.cjs');
const {PGlite}=require(path.resolve(process.env.SPEED_TRIVIA_PGLITE_MODULE||'tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite'));
const {setup,call,clientFor,checked,row,SECRET}=require('./test-speed-trivia-admission-sql.cjs');
const run=async()=>{
 const db=new PGlite();await setup(db);
 try{
  const client=clientFor(db),inventory=await call(db,'speed_trivia_inventory');
  const duplicate=row('40000000-0000-4000-8000-000000000001','The Gobi Desert lies on which continent?','Asia','Geography');
  // Simulates a pre-existing approved duplicate on a copy. Signed synthetic check only.
  await call(db,'admit_speed_trivia',checked(duplicate,inventory.revision));
  const extra=row('40000000-0000-4000-8000-000000000002','On which continent would you find the Gobi?','Asia','Geography');
  await call(db,'admit_speed_trivia',checked(extra,(await call(db,'speed_trivia_inventory')).revision));
  const target=(await call(db,'speed_trivia_find',{p_identifier:duplicate.id}))[0],keeper=(await call(db,'speed_trivia_find',{p_identifier:'gobi'}))[0];
  await db.exec('reset role');await db.exec('create table trivia_answers(id int primary key,question_id uuid references trivia_questions(id) on delete cascade);');
  await db.query('insert into trivia_answers values(1,$1),(2,$1)',[target.id]);await db.exec('set role service_role');
  const entry={id:target.id,slug:target.slug,oldStatus:target.status,oldContentHash:core.contentHash(target),keeperId:keeper.id,keeperContentHash:core.contentHash(keeper),proposedStatus:'deleted',changedFields:['status','retirement_metadata'],confidence:'high',expectedReferences:{total:2},evidence:{aId:target.id,bId:keeper.id,aHash:core.contentHash(target),bHash:core.contentHash(keeper),result:{decision:'duplicate',explanation:'Same Gobi continent fact',fact:'Gobi is in Asia',qualityA:'sound',qualityB:'sound',confidence:'high'}}};
  const manifest={version:'speed-retirement-apply-v1',applyReady:true,policyVersion:core.POLICY_VERSION,corpusRevision:(await call(db,'speed_trivia_inventory')).revision,retirements:[entry]};
  cleanup.validateManifest(manifest);
  const text=runtime.canonicalText(manifest),source={manifest,text,manifestHash:core.hash(text),fileHash:core.hash(text)};
  const dry=await cleanup.run({client,source});assert.equal(dry.mode,'retirement-dry-run');assert.equal((await call(db,'speed_trivia_find',{p_identifier:target.id}))[0].status,'pending_review');
  const args={p_manifest:text,p_signature:runtime.signText(SECRET,text),p_start:0,p_limit:50};
  const second=(await call(db,'speed_trivia_find',{p_identifier:extra.id}))[0];
  const secondEntry={...entry,id:second.id,slug:second.slug,oldContentHash:core.contentHash(second),keeperContentHash:'wrong'};
  const badBatch=runtime.canonicalText({...manifest,retirements:[entry,secondEntry]});
  await assert.rejects(()=>call(db,'speed_trivia_retire_batch',{...args,p_manifest:badBatch,p_signature:runtime.signText(SECRET,badBatch)}),/invalid-keeper/);
  assert.equal((await call(db,'speed_trivia_find',{p_identifier:target.id}))[0].status,'pending_review');
  assert.equal((await call(db,'speed_trivia_cleanup_state',{p_manifest_hash:core.hash(badBatch)})).rows.length,0);
  const result=await call(db,'speed_trivia_retire_batch',args);assert.equal(result.rows.length,1);
  assert.equal((await call(db,'speed_trivia_find',{p_identifier:target.id}))[0].status,'deleted');
  const replay=await call(db,'speed_trivia_retire_batch',args);assert.equal(replay.rows[0].idempotent,true);
  const state=await call(db,'speed_trivia_cleanup_state',{p_manifest_hash:source.manifestHash});assert.equal(state.rows.length,1);assert.equal(state.rows[0].before_state.question,state.rows[0].after_state.question);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from trivia_answers')).rows[0].n,2);await db.exec('set role service_role');
  const session=await runtime.createSession({client,secret:SECRET,budget:runtime.createBudget({dollars:1}),judge:{modelVersion:'copied-db-undo-fixture',adjudicate:async tasks=>tasks.map(t=>({id:t.id,decision:'duplicate',explanation:'Existing keeper reserves this fact',fact:'Gobi is in Asia',qualityA:'sound',qualityB:'sound',confidence:'high'}))}});
  await assert.rejects(()=>session.write(state.rows[0].before_state,{existing:state.rows[0].after_state,restore:true,undo:{manifestHash:source.manifestHash}}),error=>error.code==='duplicate');
  // Test transaction rollback on invalid keeper, and invalid signature/checksum.
  const malformed={...manifest,corpusRevision:result.revision,retirements:[{...entry,keeperContentHash:'wrong',oldStatus:'deleted'}]};
  const invalidText=runtime.canonicalText(malformed);
  await assert.rejects(()=>call(db,'speed_trivia_retire_batch',{...args,p_manifest:invalidText,p_signature:runtime.signText(SECRET,invalidText)}),/old-state-drift/);
  await assert.rejects(()=>call(db,'speed_trivia_retire_batch',{...args,p_signature:'forged'}),/invalid-speed-manifest/);
  // SQL undo success on a copied fixture with an injected unique verdict proves
  // mechanics only. The real runtime above correctly refused its duplicate keeper.
  const before=state.rows[0].before_state,after=state.rows[0].after_state;
  const payload=Object.fromEntries(['id','slug','question','options','correct_answer','category','difficulty','question_pool','answer_format','image_url','image_context','status'].map(k=>[k,before[k]]));
  const undo=checked(payload,result.revision,after,true);
  const restored=await call(db,'speed_trivia_undo_retirement',{p_manifest_hash:source.manifestHash,p_row_id:target.id,...undo});assert.equal(restored.status,'pending_review');
  assert.equal((await call(db,'speed_trivia_cleanup_state',{p_manifest_hash:source.manifestHash})).rows[0].undone,true);
  await assert.rejects(()=>call(db,'speed_trivia_retire_batch',args),/already-undone/);
  await db.exec("update trivia_questions set status='deleted' where slug='gobi'");
  await assert.rejects(()=>call(db,'speed_trivia_retire_batch',args),/already-undone/);
  console.log('Speed Trivia copied-database retirement/undo: 16 checks passed; history retained, immutable replay idempotent, duplicate undo blocked by current admission.');
 }finally{await db.close();}
};
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={run};

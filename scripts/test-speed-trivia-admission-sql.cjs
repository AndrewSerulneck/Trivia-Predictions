#!/usr/bin/env node
// Pure isolated PostgreSQL. NEVER loads environment files or contacts Supabase.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../lib/speed-trivia-uniqueness/core.cjs');
const runtime=require('../lib/speed-trivia-uniqueness/runtime.cjs');
const {PGlite}=require(process.env.SPEED_TRIVIA_PGLITE_MODULE?path.resolve(process.env.SPEED_TRIVIA_PGLITE_MODULE):'@electric-sql/pglite');
const SECRET='isolated-test-key-only-00000000000000000000';
const MIGRATION='supabase/migrations/20261013120000_speed_trivia_admission.sql';
const setup=async (db,extraRows=0,variety=false)=>{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table public.trivia_questions(id uuid primary key default gen_random_uuid(),slug text unique default ('q-'||gen_random_uuid()),question text not null,options jsonb not null,correct_answer int not null,category text,difficulty text,question_pool text not null default 'anytime_blitz',answer_format text not null default 'multiple_choice',status text not null default 'active' check(status in ('active','pending_review','deleted')),image_url text,created_at timestamptz not null default now());
 grant select,insert,update,delete on public.trivia_questions to service_role;
 insert into public.trivia_questions(slug,question,options,correct_answer,category,status) values
 ('gobi','Which continent contains the Gobi Desert?','["Asia","Africa","Europe","Antarctica"]',0,'Geography','active'),
 ('retired','Which country launched Sputnik 1?','["Soviet Union","France","Japan","UK"]',0,'History','deleted');`);
 if(extraRows){
  assert(Number.isSafeInteger(extraRows)&&extraRows>0&&extraRows<=10000);
  await db.query("insert into trivia_questions(slug,question,options,correct_answer,category) select 'fixture-extra-'||n,'Isolated numbered fact '||n||'?','[\"Yes\",\"No\"]'::jsonb,0,'Science' from generate_series(1,$1::int) n",[extraRows]);
 }
 // Installed June uniqueness behavior, without replaying historical data updates.
 await db.exec(fs.readFileSync('supabase/migrations/20260609103000_prevent_duplicate_trivia_question_text.sql','utf8'));
 await db.exec('drop index idx_trivia_questions_pool_question_key_active; create unique index idx_trivia_questions_speed_question_key_active on public.trivia_questions(normalized_question_key) where question_pool=\'anytime_blitz\' and status<>\'deleted\';');
 await db.exec(fs.readFileSync(MIGRATION,'utf8'));
 if(variety)await db.exec(fs.readFileSync('supabase/migrations/20261014020000_speed_trivia_variety_review.sql','utf8'));
 await db.query('update public.speed_trivia_control set admission_secret=$1',[SECRET]);
 await db.exec('set role service_role');
};
const call=async(db,name,args={})=>{
 const entries=Object.entries(args),params=entries.map(([k,v])=>['p_keys','p_ids'].includes(k)?'{'+v.map(s=>JSON.stringify(s)).join(',')+'}':typeof v==='object'&&v!==null?JSON.stringify(v):v);
 const sql=`select public.${name}(${entries.map(([k],i)=>`${k} => $${i+1}`).join(',')}) result`;
 return (await db.query(sql,params)).rows[0].result;
};
const clientFor=db=>({rpc:async(name,args)=>{try{return{data:await call(db,name,args),error:null};}catch(error){return{data:null,error:{message:error.message}};}}});
const row=(id,question,answer,category='Science')=>({id,slug:'test-'+id,question,options:[answer,'False A','False B','False C'],correct_answer:0,category,difficulty:'medium',question_pool:'anytime_blitz',answer_format:'multiple_choice',status:'pending_review'});
const checked=(candidate,revision,old=null,restore=false)=>{
 const payload=runtime.canonicalText(candidate),evidence={decision:'unique',contentHash:core.contentHash(candidate),policyVersion:core.POLICY_VERSION,corpusRevision:String(revision),matchedRowIds:[],explanation:'Isolated fixture verification'};
 const envelope={payloadHash:core.hash(payload),contentHash:evidence.contentHash,policyVersion:core.POLICY_VERSION,corpusRevision:String(revision),oldHash:old?runtime.stateHash(old):null,expiresAt:Date.now()+300000,restore,reservePreviousFact:!!old&&core.contentHash(old)!==core.contentHash(candidate)};
 return {p_payload:payload,p_check:envelope,p_signature:runtime.sign(SECRET,envelope),p_evidence:evidence};
};
const run=async()=>{
 const db=new PGlite();await setup(db);
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 let checks=0;const rejects=async(sql,pattern,args=[])=>{await assert.rejects(()=>db.query(sql,args),pattern);checks++;};
 await rejects("insert into trivia_questions(question,options,correct_answer,category) values('Unchecked question','[\"One\",\"Two\"]',0,'Science')",/speed-admission-required/);
 await rejects("update trivia_questions set status='active' where slug='retired'",/speed-admission-required/);
 await rejects("update trivia_questions set question='Changed' where slug='gobi'",/speed-admission-required/);
 await rejects("update trivia_questions set options='[\"Africa\",\"Asia\"]' where slug='gobi'",/speed-admission-required/);
 await rejects("update trivia_questions set category='History' where slug='gobi'",/speed-admission-required/);
 await rejects("delete from trivia_questions where slug='retired'",/speed-physical-delete-forbidden/);
 await rejects('truncate trivia_questions cascade',/permission denied/);
 await rejects('select * from speed_trivia_control',/permission denied/);
 await rejects("insert into speed_trivia_permits values(txid_current(),gen_random_uuid(),'x')",/permission denied/);
 await db.exec("insert into trivia_questions(slug,question,options,correct_answer,category,question_pool,answer_format) values('live','Live question','[\"One\"]',0,'History','live_showdown','write_in'); update trivia_questions set question='Updated Live',status='pending_review' where slug='live'; update trivia_questions set status='active' where slug='live';");checks++;
 await rejects("update trivia_questions set question_pool='anytime_blitz',answer_format='multiple_choice',options='[\"One\",\"Two\"]' where slug='live'",/speed-admission-required/);
 // Different fact keys/wording checked at ONE revision: at most one commit.
 const rev=(await call(db,'speed_trivia_inventory')).revision;
 const a=row('10000000-0000-4000-8000-000000000001','What type of stellar remnant is a pulsar?','Neutron star');
 const b=row('10000000-0000-4000-8000-000000000002','A pulsar is a rapidly rotating example of what?','Neutron star');
 const outcomes=await Promise.allSettled([call(db,'admit_speed_trivia',checked(a,rev)),call(db,'admit_speed_trivia',checked(b,rev))]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.match(outcomes.find(r=>r.status==='rejected').reason.message,/stale-speed-revision/);checks++;
 const next=(await call(db,'speed_trivia_inventory')).revision;
 const c=row('10000000-0000-4000-8000-000000000003','Which botanical structure houses pollen?','Anther');
 const bad=checked(c,next);bad.p_payload=bad.p_payload.replace('Anther','Stigma');
 await assert.rejects(()=>call(db,'admit_speed_trivia',bad),/invalid-speed-check/);checks++;
 const badHash=checked(c,next);badHash.p_evidence.contentHash='false';await assert.rejects(()=>call(db,'admit_speed_trivia',badHash),/invalid-speed-evidence/);checks++;
 const active={...c,status:'active'};await assert.rejects(()=>call(db,'admit_speed_trivia',checked(active,next)),/must-be-pending/);checks++;
 const saved=await call(db,'admit_speed_trivia',checked(c,next));assert.equal(saved.status,'pending_review');checks++;
 // Hash compatibility includes Unicode, nested image context, escaping and arrays.
 const image={...c,question:'Café "star"\nwater?',image_url:'https://example.invalid/a',image_context:{z:2,a:{b:'é',a:['𝄞',true]}}};
 // Helpers aren't executable by service role; owner may inspect them for this check.
 await db.exec('reset role');
 assert.equal(await scalar('select public.speed_content_hash($1::jsonb)',[JSON.stringify(image)]),core.contentHash(image));checks++;
 for(const secret of [SECRET,'é'.repeat(50)])assert.equal(await scalar('select public.speed_sign($1,$2)',[secret,'Unicode é𝄞\n"message"']),runtime.signText(secret,'Unicode é𝄞\n"message"'));checks++;
 await db.exec('set role service_role');
 const prior=(await call(db,'speed_trivia_find',{p_identifier:saved.id}))[0];
 const edited={...c,question:'What part of a flower receives pollen?',options:['Stigma','False A','False B','False C']};
 const editRev=(await call(db,'speed_trivia_inventory')).revision;
 await call(db,'admit_speed_trivia',checked(edited,editRev,prior));
 const memory=await call(db,'speed_trivia_corpus_delta',{p_revision:editRev,p_limit:500});assert.equal(memory.rows.length,2);assert(memory.rows.some(r=>r.id.startsWith('history:')&&r.options[0]==='Anther'));checks++;
 await db.exec("update trivia_questions set normalized_question_key='forged' where slug='gobi'");
 assert.notEqual(await scalar("select normalized_question_key from trivia_questions where slug='gobi'"),'forged');checks++;
 // Deleted facts remain in every complete corpus; status-only delete bumps revision.
 await db.exec("update trivia_questions set status='deleted' where slug='gobi'");
 const inventory=await call(db,'speed_trivia_inventory'),page=await call(db,'speed_trivia_corpus_page',{p_revision:inventory.revision,p_offset:0,p_limit:1000});
 assert(page.rows.some(r=>r.slug==='retired'));assert(page.rows.some(r=>r.slug==='gobi'&&r.status==='deleted'));checks++;
 await rejects("update trivia_questions set slug='changed' where slug='gobi'",/identity-change/);
 await rejects("update trivia_questions set question_pool='live_showdown',answer_format='write_in' where slug='retired'",/speed-admission-required/);
 const leaving=(await call(db,'speed_trivia_find',{p_identifier:c.id}))[0];
 const gate=await runtime.createSession({client:clientFor(db),secret:SECRET,budget:runtime.createBudget({dollars:1}),prerequisitesChecked:true,judge:{modelVersion:'no-call-leave-fixture',adjudicate:async()=>{throw new Error('must not call paid checks for a Live departure');}}});
 await gate.leave({question_pool:'live_showdown',answer_format:'write_in'},leaving);
 await db.query('update trivia_questions set speed_revision=0 where id=$1',[c.id]);
 await rejects('delete from trivia_questions where id=$1',/speed-physical-delete-forbidden/,[c.id]);
 const converted=await call(db,'speed_trivia_corpus_delta',{p_revision:page.revision,p_limit:500});
 assert(converted.rows.some(r=>r.id.startsWith('history:')&&r.slug===leaving.slug));assert(converted.removedIds.length===1);checks++;
 await db.exec('set role anon');await rejects('select speed_trivia_inventory()',/permission denied/);await db.exec('reset role');
 await db.close();console.log(`Speed Trivia isolated SQL: ${checks} checks passed (PGlite queued competing transactions).`);
};
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={setup,call,clientFor,checked,row,SECRET,MIGRATION,run};

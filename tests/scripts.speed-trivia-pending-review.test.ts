import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import * as review from "@/lib/speed-trivia-uniqueness/review.cjs";
import * as audit from "@/lib/speed-trivia-uniqueness/audit.cjs";
import { prerequisites } from "@/lib/speed-trivia-uniqueness/diagnostics.cjs";
import type { SpeedQuestion, ComparisonTask, ComparisonResult, AdmissionEvidence } from "@/types/speedTriviaUniqueness";
import type { AdmissionClient } from "@/types/speedTriviaAdmission";
import type { LedgerConfig, AuditPlan, AuditApproval } from "@/lib/speed-trivia-uniqueness/audit.cjs";
const require=createRequire(import.meta.url);
const harness=require("../scripts/test-speed-trivia-admission-sql.cjs") as {setup:(db:PGlite,extra?:number,variety?:boolean)=>Promise<void>;call:(db:PGlite,name:string,args?:Record<string,unknown>)=>Promise<unknown>;clientFor:(db:PGlite)=>AdmissionClient;SECRET:string;row:(id:string,q:string,answer:string,category?:string)=>SpeedQuestion};
const directories:string[]=[];
const temp=()=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),"speed-review-v1-"));directories.push(directory);return directory;};
const config=(cap=1000000):LedgerConfig=>({auditId:"synthetic-audit",planHash:"synthetic-plan",modelVersion:audit.MODEL_VERSION,capMicrodollars:cap,maxRequests:100,maxRetries:5,maxInputTokens:1000000,maxOutputTokens:1000000});
const decision=(id:string,duplicate=false):ComparisonResult=>({id,decision:duplicate?"duplicate":"unique",qualityA:"sound",qualityB:"sound",confidence:"high",fact:"Synthetic fact",explanation:"Synthetic direct fact proof"});
const judge={modelVersion:audit.MODEL_VERSION,adjudicate:async(tasks:ComparisonTask[])=>tasks.map(t=>decision(t.id))};
const fixtureRow=(n:number,q="Which performer released synthetic album ",a="Taylor Swift")=>harness.row(`30000000-0000-4000-8000-${String(n).padStart(12,"0")}`,q+n+"?",a,"Music");
const signed=(authority:Record<string,unknown>)=>({p_authority:runtime.canonicalText(authority),p_signature:runtime.signText(harness.SECRET,runtime.canonicalText(authority))});
const manager=require("../scripts/manage-speed-trivia-pending-review.cjs") as {prepare:(input:{session:Awaited<ReturnType<typeof runtime.createSession>>;proposal:Record<string,unknown>;cache:Map<string,unknown>;references:review.ReferenceEvidence;operationId:string})=>Promise<Record<string,unknown>>;run:(input:Record<string,unknown>)=>Promise<unknown>;undo:(input:{client:AdmissionClient;secret:string;operationId:string})=>Promise<unknown>};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();for(const dir of directories.splice(0))fs.rmSync(dir,{recursive:true,force:true});});

describe("global one-time audit reservations and failures",()=>{
 it("ledger-crash: keeps a full lost claim across restarts, with an immutable cap",()=>{
  const dir=temp(),ledger=audit.openLedger(dir,config());ledger.scope("lost").reserve({dollars:.75,inputTokens:10,outputTokens:10});ledger.close();
  const resumed=audit.openLedger(dir,config());try{expect(resumed.summary()).toMatchObject({dollars:.75,unsettled:1});expect(()=>resumed.scope("next").reserve({dollars:.3,inputTokens:1,outputTokens:1})).toThrow("budget");}finally{resumed.close();}
  expect(()=>audit.openLedger(dir,config(2000000))).toThrow("binding-drift");expect(fs.existsSync(path.join(dir,"audit.lock"))).toBe(false);
 });
 it("settles exactly once, retains malformed usage and caps retries globally",()=>{
  const dir=temp(),ledger=audit.openLedger(dir,{...config(),maxRetries:1});try{
   const scope=ledger.scope("success"),id=scope.reserve({dollars:.2,inputTokens:20,outputTokens:10});scope.settle(id,{dollars:.05,inputTokens:5,outputTokens:2});scope.commit();expect(ledger.summary().dollars).toBe(.05);
   expect(()=>scope.commit()).toThrow("settlement");
   const bad=ledger.scope("bad"),reservation=bad.reserve({dollars:.2,inputTokens:20,outputTokens:10});expect(()=>bad.settle(reservation,{dollars:.3,inputTokens:21,outputTokens:2})).toThrow("mismatch");
   ledger.scope("retry",1).reserve({dollars:.1,inputTokens:1,outputTokens:1});expect(()=>ledger.scope("other",1).reserve({dollars:.1,inputTokens:1,outputTokens:1})).toThrow("budget");
   expect(ledger.summary()).toMatchObject({dollars:.45,unsettled:1,retries:1});
  }finally{ledger.close();}
 });
 it("does not steal a live/foreign lock or ignore corrupt/partial journals",()=>{
  const dir=temp(),ledger=audit.openLedger(dir,config());try{expect(()=>audit.openLedger(dir,config())).toThrow();expect(()=>audit.recoverLock(dir,ledger.owner.nonce)).toThrow("still-live");}finally{ledger.close();}
  fs.writeFileSync(path.join(dir,"global-ledger.jsonl"),"{partial");expect(()=>audit.openLedger(dir,config())).toThrow("incomplete");expect(fs.existsSync(path.join(dir,"audit.lock"))).toBe(false);
 });
 it("cache-direction rejects wrong orientation/version/hash and swaps directional quality",()=>{
  const a=fixtureRow(1),b=fixtureRow(2),cache=new Map<string,unknown>();
  cache.set(core.pairKey(a,b,audit.MODEL_VERSION),{modelVersion:audit.MODEL_VERSION,firstHash:core.contentHash(a),result:{...decision("unused"),qualityB:"invalid"}});
  expect(review.cachedVerdict(cache,b,a,audit.MODEL_VERSION)?.qualityA).toBe("invalid");
  expect(review.cachedVerdict(cache,{...a,question:"Changed?"},b,audit.MODEL_VERSION)).toBeNull();expect(review.cachedVerdict(cache,a,b,"other")).toBeNull();
 });
 it("diagnoses prerequisites without exposing secrets and preserves normal caps",()=>{
  const env={GEMINI_API_KEY:"private-fixture-key",SPEED_TRIVIA_ADMISSION_SECRET:"private-fixture-signing-key-00000000000",SPEED_TRIVIA_MAX_DOLLARS:".5"};
  expect(prerequisites(env).ready).toBe(true);expect(JSON.stringify(prerequisites(env))).not.toContain("private-fixture");expect(prerequisites({...env,SPEED_TRIVIA_MAX_DOLLARS:"225"}).ready).toBe(false);
 });
});

const auditFixture=()=>{
 const rows=[fixtureRow(1),fixtureRow(2)],corpus=core.createCorpus(rows,{complete:true,expectedCount:2,revision:"1"}),references={directNeighbours:{}};
 const targets=rows.map(row=>({id:row.id,contentHash:core.contentHash(row),stateHash:runtime.stateHash(row)}));
 const plan=audit.planAudit({corpus,targets,references}),directory=temp();
 const approval:AuditApproval={...config(),auditId:"fixture-only-not-real-approval",planHash:core.hash(runtime.canonicalText(plan)),approvedBy:"Andrew Serulneck",questionTransferApproved:true};
 // A minimum 5% retry floor can be zero for tiny synthetic plans.
 const transport:typeof fetch=async()=>new Response(JSON.stringify({usageMetadata:{promptTokenCount:10,candidatesTokenCount:10},candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify([decision("comparison")])}]}}]}),{status:200});
 return {corpus,plan,references,directory,approval,transport};
};
describe("resumable pending task/disposition controller",()=>{
 it("requires concrete total and question-data transfer authorization; dry-run spends nothing",async()=>{
  const fixture=auditFixture(),transport=vi.fn(fixture.transport);const result=await audit.runAudit({...fixture,transport});expect(result.summary.targetRows).toBe(2);expect(transport).not.toHaveBeenCalled();
  await expect(audit.runAudit({...fixture,transport,paid:true,approval:null})).rejects.toThrow("approval-required");expect(transport).not.toHaveBeenCalled();
 });
 it("plans current hashes and completes/restarts with cache reuse and no mutations",async()=>{
  vi.stubEnv("GEMINI_API_KEY","synthetic-only");const fixture=auditFixture(),transport=vi.fn(fixture.transport);
  const first=await audit.runAudit({...fixture,transport,paid:true});expect(first.summary).toMatchObject({active:2,retired_repeat:0,hold:0,not_processed:0});const calls=transport.mock.calls.length;
  const second=await audit.runAudit({...fixture,transport,paid:true});expect(second.summary.active).toBe(2);expect(transport).toHaveBeenCalledTimes(calls);
  const stale:AuditPlan={...fixture.plan,taskHash:"bad"};await expect(audit.runAudit({...fixture,plan:stale})).rejects.toThrow("binding-drift");
 });
 it("provider-failure is an operational hold, while untouched rows stay not processed",async()=>{
  vi.stubEnv("GEMINI_API_KEY","synthetic-only");const fixture=auditFixture();
  const transport:typeof fetch=async()=>{throw new Error("synthetic timeout");};const result=await audit.runAudit({...fixture,transport,paid:true,concurrency:1});
  expect(result.summary).toMatchObject({active:0,hold:1,not_processed:1});expect(result.outcomes?.[0].disposition.reason).toBe("provider_unavailable");expect(result.budget?.unsettled).toBe(1);
 });
 it("refreshes <=500 changed rows under the original total ledger and reconciles concurrent approvals",async()=>{
  vi.stubEnv("GEMINI_API_KEY","synthetic-only");const f=auditFixture();
  await audit.runAudit({...f,paid:true});
  const refreshedRows=f.corpus.rows.map((row,index)=>index===0?{...row,status:"active" as const}:row);
  const corpus=core.createCorpus(refreshedRows,{complete:true,expectedCount:2,revision:"2"});
  const plan=audit.refreshAuditPlan({baseCorpus:f.corpus,basePlan:f.plan,corpus,references:f.references});
  const transport=vi.fn(f.transport);
  const result=await audit.runAudit({...f,corpus,plan,transport,paid:true,refreshBase:{baseCorpus:f.corpus,basePlan:f.plan}});
  expect(result.summary).toMatchObject({active:1,concurrently_changed:1});expect(transport).not.toHaveBeenCalled();
  const binding=JSON.parse(fs.readFileSync(path.join(f.directory,"audit-binding.json"),"utf8"));expect(binding.planHash).toBe(f.approval.planHash);
 });
 it("exact-unverified stays held, distinct-concentrated remains valid, retired-memory is reserved",()=>{
  const a=fixtureRow(1),b={...fixtureRow(2),status:"deleted" as const},index=core.buildIndex(core.createCorpus([a,b],{complete:true,expectedCount:2,revision:"1"}));
  const evidence={explanation:"Fixture",policyVersion:core.POLICY_VERSION,extractorVersion:core.EXTRACTOR_VERSION,retrievalVersion:core.RETRIEVAL_VERSION,modelVersion:audit.MODEL_VERSION,corpusRevision:"1",corpusDigest:index.corpus.digest,contentHash:core.contentHash(a),matchedRowIds:[b.id],decision:"duplicate",comparisons:[{...decision(b.id,true),qualityA:"unverified",qualityB:"unverified"}],retrieval:{complete:true,matches:[],total:0,retrievalVersion:core.RETRIEVAL_VERSION}} as AdmissionEvidence;
  expect(review.disposition(a,evidence,index)).toMatchObject({state:"hold",reason:"evidence_incomplete"});
  expect(review.disposition(a,{...evidence,decision:"unique",comparisons:[]},index).state).toBe("active");
  expect(review.disposition(a,{...evidence,comparisons:[decision(b.id,true)]},index)).toMatchObject({state:"hold",reason:"reservation_review"});
 });
 it("drains in-flight workers before releasing its ledger lock after a worker write failure",async()=>{
  vi.stubEnv("GEMINI_API_KEY","synthetic-only");const fixture=auditFixture();let release:()=>void=()=>{};let count=0;
  const transport:typeof fetch=async(input,init)=>{if(++count===2)await new Promise<void>(resolve=>{release=resolve;});return fixture.transport(input,init);};
  const original=fs.writeFileSync;let failed=false;
  vi.spyOn(fs,"writeFileSync").mockImplementation((file,data,options)=>{if(typeof data==="string"&&data.includes('"disposition"')&&!failed){failed=true;throw new Error("synthetic fsync path failure");}return original(file,data,options);});
  let finished=false;const outcome=audit.runAudit({...fixture,transport,paid:true,concurrency:2}).then(()=>{finished=true;return null;},error=>{finished=true;return error;});
  await new Promise<void>(resolve=>setTimeout(resolve,40));expect(finished).toBe(false);expect(fs.existsSync(path.join(fixture.directory,"audit.lock"))).toBe(true);release();
  expect((await outcome)?.message).toBe("synthetic fsync path failure");expect(fs.existsSync(path.join(fixture.directory,"audit.lock"))).toBe(false);
 });
});

describe("isolated pending-family atomicity, drift, undo and admission",()=>{
 const familyFixture=async()=>{
  const db=new PGlite();await harness.setup(db,0,true);const session=await runtime.createSession({client:harness.clientFor(db),secret:harness.SECRET,budget:runtime.createBudget({dollars:1}),judge});
  const saved=[];for(let n=1;n<=3;n++)saved.push((await session.write(fixtureRow(n))).row as SpeedQuestion);
  const index=session.index(),keeper=saved[0],losers=saved.slice(1),proofs=losers.map(row=>review.directProof(row,keeper,decision(row.id,true),judge.modelVersion));
  const verified=await review.verifyKeeper(index,keeper,losers,proofs,judge);
  const references=await harness.call(db,"speed_trivia_review_references",{p_ids:saved.map(row=>row.id)}) as review.ReferenceEvidence;
  const authority=review.makeAuthority({index,kind:"family",keeper,losers,proofs,keeperProof:verified.evidence,references,operationId:"synthetic-family"});
  return {db,session,index,keeper,losers,proofs,authority};
 };
 it("family-atomic: one transaction activates exactly one keeper, preserves IDs/content, and is idempotent",async()=>{
  const f=await familyFixture();try{
   await harness.call(f.db,"apply_speed_trivia_review",signed(f.authority));
   const rows=(await f.db.query<{id:string;status:string}>("select id,status from trivia_questions where id=any($1::uuid[]) order by id",["{"+[f.keeper.id,...f.losers.map(row=>row.id)].join(",")+"}"])).rows;
   expect(rows.map(row=>row.status)).toEqual(["active","deleted","deleted"]);const repeat=await harness.call(f.db,"apply_speed_trivia_review",signed(f.authority)) as {idempotent:boolean};expect(repeat.idempotent).toBe(true);
   await f.session.refresh();for(const row of [f.keeper,...f.losers])expect(core.contentHash(f.session.index().byId.get(row.id)!.row)).toBe(core.contentHash(row));
  }finally{await f.db.close();}
 });
 it("family-nontransitive: missing direct link and arbitrary exclusions cannot authorize C against A",async()=>{
  const f=await familyFixture();try{
   const bad={...f.authority,members:(f.authority.members as Record<string,unknown>[]).map((member,i)=>i===2?{...member,directProof:review.directProof(f.losers[1],f.losers[0],decision("synthetic",true),judge.modelVersion)}:member)};
   await expect(harness.call(f.db,"apply_speed_trivia_review",signed(bad))).rejects.toThrow("unproven-direct-link");
   expect((await f.db.query<{status:string}>("select status from trivia_questions where id=$1",[f.keeper.id])).rows[0].status).toBe("pending_review");
   await expect(review.verifyKeeper(f.index,f.keeper,f.losers,f.proofs.slice(0,1),judge)).rejects.toThrow("missing-direct");
  }finally{await f.db.close();}
 });
 it("admission-replay: refuses changed hashes, status/revision drift and competing group authorities",async()=>{
  const f=await familyFixture();try{
   const bad={...f.authority,members:(f.authority.members as Record<string,unknown>[]).map((member,i)=>i===1?{...member,stateHash:"stale"}:member)};
   await expect(harness.call(f.db,"apply_speed_trivia_review",signed(bad))).rejects.toThrow("old-state-drift");
   const outcomes=await Promise.allSettled([harness.call(f.db,"apply_speed_trivia_review",signed(f.authority)),harness.call(f.db,"apply_speed_trivia_review",signed({...f.authority,operationId:"racing-family"}))]);expect(outcomes.filter(result=>result.status==="fulfilled")).toHaveLength(1);
   const result=outcomes.find(result=>result.status==="rejected");expect(result?.status==="rejected"&&result.reason.message).toContain("stale-speed-review");
  }finally{await f.db.close();}
 });
 it("verifies reference drift, FK preservation, service-only grants, metadata protection and exact group undo",async()=>{
  const f=await familyFixture();try{
   await f.db.exec("reset role; create table synthetic_references(question_id uuid references trivia_questions(id)); create index synthetic_reference_question_idx on synthetic_references(question_id); insert into synthetic_references select id from trivia_questions where slug like 'test-%' limit 1; set role service_role;");
   await expect(harness.call(f.db,"apply_speed_trivia_review",signed(f.authority))).rejects.toThrow("reference-drift");
   const references=await harness.call(f.db,"speed_trivia_review_references",{p_ids:[f.keeper.id,...f.losers.map(row=>row.id)]}) as review.ReferenceEvidence;
   const authority={...f.authority,references};await harness.call(f.db,"apply_speed_trivia_review",signed(authority));await f.session.refresh();
   const undo={version:"speed-pending-review-undo-v1",operationId:"synthetic-family",authorityHash:core.hash(runtime.canonicalText(authority)),corpusRevision:f.session.corpus().revision,expiresAt:Date.now()+300000,references};
   await harness.call(f.db,"undo_speed_trivia_review",signed(undo));await f.session.refresh();expect([f.keeper,...f.losers].map(row=>f.session.index().byId.get(row.id)!.row.status)).toEqual(["pending_review","pending_review","pending_review"]);
   expect((await harness.call(f.db,"undo_speed_trivia_review",signed(undo)) as {idempotent:boolean}).idempotent).toBe(true);
   await expect(f.db.query("update trivia_questions set speed_subject_evidence='{}' where id=$1",[f.keeper.id])).rejects.toThrow("variety-permit-required");
   await f.db.exec("set role anon");await expect(harness.call(f.db,"apply_speed_trivia_review",signed(authority))).rejects.toThrow("permission denied");
  }finally{await f.db.close();}
 });
 it("rejects generated cooldown before comparisons and cannot reset it through status-only approval",async()=>{
  const f=await familyFixture();try{
   const adjudicate=vi.fn(judge.adjudicate),gate=await runtime.createSession({client:harness.clientFor(f.db),secret:harness.SECRET,budget:runtime.createBudget({dollars:1}),judge:{...judge,adjudicate}});
   await expect(gate.write({...fixtureRow(10),primarySubject:"Taylor Swift",subtopic:"jazz"},{generated:true})).rejects.toMatchObject({code:"subject_cooldown"});expect(adjudicate).not.toHaveBeenCalled();
   const old=f.keeper.speed_subject_evidence?.history;await gate.write({status:"active"},{existing:f.keeper});expect(gate.index().byId.get(f.keeper.id)?.row.speed_subject_evidence?.history).toEqual(old);
  }finally{await f.db.close();}
 });
 it("prepares fresh family authority from cached proof, requires backups for apply, and exposes journaled undo",async()=>{
  const f=await familyFixture();try{
   const cache=new Map<string,unknown>();
   for(const row of f.losers)cache.set(core.pairKey(row,f.keeper,audit.MODEL_VERSION),{modelVersion:audit.MODEL_VERSION,firstHash:core.contentHash(row),result:decision(row.id,true)});
   const external=review.externalIndex(f.index,new Set(f.losers.map(row=>row.id)));
   for(const hit of core.retrieve(external,f.keeper,{excludeId:f.keeper.id}).matches){const other=f.index.byId.get(hit.id)!.row;cache.set(core.pairKey(f.keeper,other,audit.MODEL_VERSION),{modelVersion:audit.MODEL_VERSION,firstHash:core.contentHash(f.keeper),result:decision(hit.id)});}
   cache.set(core.pairKey(f.keeper,f.keeper,audit.MODEL_VERSION),{modelVersion:audit.MODEL_VERSION,firstHash:core.contentHash(f.keeper),result:decision("self")});
   const references=await harness.call(f.db,"speed_trivia_review_references",{p_ids:[f.keeper.id,...f.losers.map(row=>row.id)]}) as review.ReferenceEvidence;
   const authority=await manager.prepare({session:f.session,proposal:{kind:"family",keeperId:f.keeper.id,loserIds:f.losers.map(row=>row.id)},cache,references,operationId:"prepared-family"});
   expect(authority.corpusRevision).toBe(f.session.corpus().revision);
   await expect(manager.run({client:harness.clientFor(f.db),secret:harness.SECRET,manifest:{version:audit.VERSION,applyReady:false,outcomes:[]},output:temp(),apply:true})).rejects.toThrow("backups-required");
   await harness.call(f.db,"apply_speed_trivia_review",signed(authority));
   await manager.undo({client:harness.clientFor(f.db),secret:harness.SECRET,operationId:"prepared-family"});await f.session.refresh();expect(f.session.index().byId.get(f.keeper.id)?.row.status).toBe("pending_review");
  }finally{await f.db.close();}
 });
 it("preserves open-world identity evidence on ordinary approval and rejects mismatched signing prerequisites",async()=>{
  const f=await familyFixture();try{
   const input=fixtureRow(20,"Which sculptor named Aster Vale created synthetic work ","Aster Vale");
   const saved=await f.session.write(input,{subjectProposals:[{kind:"person",name:"Aster Vale",source:"answer",start:0,end:10}]});
   expect(saved.row.speed_subject_evidence?.subjects.map(subject=>subject.key)).toEqual(["person:aster-vale"]);
   const approved=await f.session.write({status:"active"},{existing:saved.row});
   expect(approved.row.speed_subject_evidence).toEqual(saved.row.speed_subject_evidence);
   await expect(runtime.createSession({client:harness.clientFor(f.db),secret:"wrong-fixture-secret-0000000000000000",budget:runtime.createBudget({dollars:1}),judge})).rejects.toThrow("prerequisites");
  }finally{await f.db.close();}
 });
});

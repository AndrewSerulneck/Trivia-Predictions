import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import type { AdmissionClient, AdmissionRow } from "@/types/speedTriviaAdmission";
import type { ComparisonTask, ComparisonResult, SpeedQuestion, SpeedIndex } from "@/types/speedTriviaUniqueness";
const require=createRequire(import.meta.url);
const {approvedIndex}=require("../lib/speed-trivia-uniqueness/approval.cjs") as {approvedIndex:(index:SpeedIndex)=>SpeedIndex};
const harness=require("../scripts/test-speed-trivia-admission-sql.cjs") as {setup:(db:PGlite,extra?:number,variety?:boolean)=>Promise<void>;call:(db:PGlite,name:string,args?:Record<string,unknown>)=>Promise<unknown>;clientFor:(db:PGlite)=>AdmissionClient;SECRET:string;row:(id:string,q:string,answer:string,category?:string)=>SpeedQuestion};
// The Quick Review + Keep Queue + star cap chain, then Phase 7d's Quick Keep (as tests/speed-trivia-star-cap-sql.test.ts).
const QUICK_KEEP_MIGRATIONS=[
 "supabase/migrations/20261115151703_speed_trivia_quick_review.sql",
 "supabase/migrations/20261115153905_speed_trivia_bar_test_scores.sql",
 "supabase/migrations/20261115170333_speed_trivia_keep_queue.sql",
 "supabase/migrations/20261115212126_speed_trivia_queue_repairs.sql",
 "supabase/migrations/20261115213124_speed_trivia_released_rows_revision.sql",
 "supabase/migrations/20261115214254_speed_trivia_undo_needs_look.sql",
 "supabase/migrations/20261115220356_question_variety_map.sql",
 "supabase/migrations/20261116014954_speed_trivia_star_cap.sql",
 "supabase/migrations/20261119193552_speed_trivia_quick_keep_after_live_edit.sql",
];
const row=(n:number,q:string,answer:string)=>harness.row(`50000000-0000-4000-8000-${String(n).padStart(12,"0")}`,q,answer);
const verdict=(task:ComparisonTask):ComparisonResult=>({id:task.id,decision:"unique",qualityA:"sound",qualityB:"sound",confidence:"high",fact:"Synthetic distinct fact",explanation:"Synthetic fixture"});
const judge={modelVersion:"approved-only-synthetic",adjudicate:async(tasks:ComparisonTask[]):Promise<ComparisonResult[]>=>tasks.map(task=>{
 const a=core.content(task.a),b=core.content(task.b);
 return {...verdict(task),decision:task.a.id!==task.b.id&&a.answer===b.answer?"duplicate":"unique"};
})};
const seedPending=async(db:PGlite,rows:SpeedQuestion[])=>{
 // Fixture arrangement before the test; production writes remain signed below.
 await db.exec('reset role;alter table trivia_questions disable trigger all;');
 for(const r of rows)await db.query("insert into trivia_questions(id,slug,question,options,correct_answer,category,status,normalized_question_key) values($1,$2,$3,$4::jsonb,0,$5,'pending_review',$6)",[r.id,r.slug,r.question,JSON.stringify(r.options),r.category,core.exactKey(r.question)]);
 await db.exec('alter table trivia_questions enable trigger all;set role service_role;');
};
describe.each([false])("approved-only manual review, variety schema=%s",variety=>{
 it("ignores waiting/deleted competitors, then blocks the next version after the first is approved",async()=>{
  const db=new PGlite();try{
   await harness.setup(db,0,variety);
   const a=row(1,"Which country sent Sputnik 1 into orbit?","Soviet Union"),b=row(2,"Sputnik 1 was launched by which country?","Soviet Union");
   await seedPending(db,[a,b]);
   const names:string[]=[],client=harness.clientFor(db),adjudicate=vi.fn(judge.adjudicate);
   const gate=await runtime.createSession({client:{rpc:(name,args)=>{names.push(name);return client.rpc(name,args);}},secret:harness.SECRET,budget:runtime.createBudget({dollars:1}),judge:{...judge,adjudicate}});
   const pending=gate.index().byId.get(a.id)!.row as AdmissionRow;
   expect((await gate.write({status:"active"},{existing:pending,approvedOnly:true})).row.status).toBe("active");
   expect(adjudicate.mock.calls.flatMap(([tasks])=>tasks).every(task=>task.b.status==='active')).toBe(true);
   await expect(gate.write({status:"active"},{existing:gate.index().byId.get(b.id)!.row as AdmissionRow,approvedOnly:true})).rejects.toMatchObject({code:"duplicate"});
   expect(gate.index().byId.get(b.id)!.row.status).toBe("pending_review");
   expect(names.filter(name=>name==='speed_trivia_corpus_page')).toHaveLength(1);
   // A new explicit operation must also see approvals from previous requests.
   const next=await runtime.createSession({client,secret:harness.SECRET,budget:runtime.createBudget({dollars:0.50}),judge,cachedIndex:gate.index()});
   await expect(next.write({status:"active"},{existing:next.index().byId.get(b.id)!.row as AdmissionRow,approvedOnly:true})).rejects.toMatchObject({code:"duplicate"});
   // The original retired fact remains reserved to normal new admissions.
   await expect(gate.write(row(3,"Which country launched Sputnik 1?","Soviet Union"))).rejects.toMatchObject({code:"duplicate"});
  }finally{await db.close();}
 });
 it("rechecks a competing approval made during the database save",async()=>{
  const db=new PGlite();try{
   await harness.setup(db,0,variety);
   const a=row(4,"What flower structure makes pollen?","Anther"),b=row(5,"Which flower part produces pollen?","Anther");await seedPending(db,[a,b]);
   const underlying=harness.clientFor(db);let race=true;
   const client:AdmissionClient={rpc:async(name,args)=>{
    if(name==='admit_speed_trivia'&&race){race=false;
     const other=await runtime.createSession({client:underlying,secret:harness.SECRET,budget:runtime.createBudget({dollars:1}),judge});
     await other.write({status:'active'},{existing:other.index().byId.get(b.id)!.row as AdmissionRow,approvedOnly:true});
     return {data:null,error:{message:'stale-speed-revision'}};
    }return underlying.rpc(name,args);
   }};
   const gate=await runtime.createSession({client,secret:harness.SECRET,budget:runtime.createBudget({dollars:1}),judge});
   await expect(gate.write({status:'active'},{existing:gate.index().byId.get(a.id)!.row as AdmissionRow,approvedOnly:true})).rejects.toMatchObject({code:'duplicate'});
   expect(gate.budget.summary().retries).toBe(1);
   expect(approvedIndex(gate.index()).byId.has(b.id)).toBe(true);
  }finally{await db.close();}
 });
 it("removes retired competitors from the cached approval view and refuses scope misuse",async()=>{
  const db=new PGlite();try{
   await harness.setup(db,0,variety);const a=row(6,"Which continent is home to the Gobi Desert?","Asia");await seedPending(db,[a]);
   const gate=await runtime.createSession({client:harness.clientFor(db),secret:harness.SECRET,budget:runtime.createBudget({dollars:1}),judge});
   const pending=gate.index().byId.get(a.id)!.row as AdmissionRow;
   await expect(gate.write({status:'active'},{existing:pending,approvedOnly:true})).rejects.toMatchObject({code:'duplicate'});
   const view=approvedIndex(gate.index());await db.exec("update trivia_questions set status='deleted' where slug='gobi'");
   await gate.refresh();expect(approvedIndex(gate.index())).toBe(view);expect(view.byId.size).toBe(0);
   expect((await gate.write({status:'active'},{existing:pending,approvedOnly:true})).row.status).toBe('active');
   await expect(gate.write(row(7,'A new generated fact?','New answer'),{approvedOnly:true,generated:true})).rejects.toThrow('unchanged-pending');
   await expect(gate.write({status:'active',question:'Edited fact?'},{existing:pending,approvedOnly:true})).rejects.toThrow('unchanged-pending');
  }finally{await db.close();}
 });
 it("still checks approval accuracy and keeps waiting facts blocked for new generation",async()=>{
  const db=new PGlite();try{
   await harness.setup(db,0,variety);const a=row(8,'Which force keeps planets in orbit?','Gravity');await seedPending(db,[a]);
   const gate=await runtime.createSession({client:harness.clientFor(db),secret:harness.SECRET,budget:runtime.createBudget({dollars:1}),
    judge:{modelVersion:'invalid-approval-synthetic',adjudicate:async tasks=>tasks.map(task=>({...verdict(task),qualityA:'invalid' as const,decision:'uncertain' as const,explanation:'Synthetic incorrect premise'}))}});
   await expect(gate.write({status:'active'},{existing:gate.index().byId.get(a.id)!.row as AdmissionRow,approvedOnly:true})).rejects.toMatchObject({code:'uncertain'});
   expect(gate.index().byId.get(a.id)!.row.status).toBe('pending_review');
   await expect(gate.write(row(9,a.question,'Gravity'))).rejects.toMatchObject({code:'duplicate'});
  }finally{await db.close();}
 });
});

it("D38: an edit to a live question ignores deleted and waiting copies, but not live ones or new questions",async()=>{
 const db=new PGlite();try{
  await harness.setup(db,0,false);
  const live=row(20,"Which planet is known as the Red Planet?","Mars"),waiting=row(21,"What planet is nicknamed the Red Planet?","Mars");
  const gone=row(22,"The Red Planet is which planet?","Mars"),other=row(23,"Which is the largest planet?","Jupiter"),twin=row(24,"What is the biggest planet in the Solar System?","Jupiter");
  await seedPending(db,[live,waiting,gone,other,twin]);
  await db.exec(`reset role;alter table trivia_questions disable trigger all;update trivia_questions set status='active' where id in ('${live.id}','${other.id}');update trivia_questions set status='deleted' where id='${gone.id}';alter table trivia_questions enable trigger all;set role service_role;`);
  const adjudicate=vi.fn(judge.adjudicate);
  const gate=await runtime.createSession({client:harness.clientFor(db),secret:harness.SECRET,budget:runtime.createBudget({dollars:1}),judge:{...judge,adjudicate}});
  const existing=gate.index().byId.get(live.id)!.row as AdmissionRow;
  const saved=(await gate.write({question:"Which planet is called the Red Planet because of its rusty soil?"},{existing})).row;
  expect(saved.status).toBe("active");expect(saved.question).toContain("rusty soil");
  expect(adjudicate.mock.calls.flatMap(([tasks])=>tasks).filter(task=>task.id!=='previous-version').every(task=>task.b.status==='active')).toBe(true);
  // A live repeat still blocks the edit.
  const edited=gate.index().byId.get(live.id)!.row as AdmissionRow;
  await expect(gate.write({question:"Which planet is the largest?",options:["Mars","Venus","Jupiter","Mercury"],correct_answer:2},{existing:edited})).rejects.toMatchObject({code:"duplicate"});
  // New questions still meet the whole bank, including deleted and waiting copies.
  await expect(gate.write(row(25,"Which planet is famously red?","Mars"))).rejects.toMatchObject({code:"duplicate"});
  // An edit to a waiting question is not a live edit: it still meets waiting copies.
  await expect(gate.write({question:"Which planet has the most mass?"},{existing:gate.index().byId.get(twin.id)!.row as AdmissionRow})).rejects.toMatchObject({code:"duplicate"});
 }finally{await db.close();}
});

it("D38b: a live edit that keeps its fact passes a repeat its previous version already had, but not a new one",async()=>{
 const db=new PGlite();try{
  await harness.setup(db,0,false);
  const a=row(30,"Which planet is called the Red Planet?","Mars"),b=row(31,"Which planet is red from iron oxide dust?","Mars");
  const c=row(32,"Which planet is the largest?","Jupiter");
  await seedPending(db,[a,b,c]);
  await db.exec(`reset role;alter table trivia_questions disable trigger all;update trivia_questions set status='active' where id in ('${a.id}','${b.id}','${c.id}');alter table trivia_questions enable trigger all;set role service_role;`);
  // Same answer = same fact, including an edit against its own previous version.
  const sameFact={modelVersion:"same-fact-synthetic",adjudicate:async(tasks:ComparisonTask[]):Promise<ComparisonResult[]>=>tasks.map(task=>({...verdict(task),
   decision:task.id!=="candidate-soundness"&&core.content(task.a).answer===core.content(task.b).answer?"duplicate":"unique"}))};
  const gate=await runtime.createSession({client:harness.clientFor(db),secret:harness.SECRET,budget:runtime.createBudget({dollars:1}),judge:sameFact});
  const saved=(await gate.write({question:"Which planet is nicknamed the Red Planet?"},{existing:gate.index().byId.get(a.id)!.row as AdmissionRow})).row;
  expect(saved.question).toBe("Which planet is nicknamed the Red Planet?");expect(saved.status).toBe("active");
  // Changing the fact to one another live question holds is still a repeat.
  await expect(gate.write({question:"Which planet is the biggest?",options:["Mars","Venus","Jupiter","Mercury"],correct_answer:2},{existing:gate.index().byId.get(a.id)!.row as AdmissionRow})).rejects.toMatchObject({code:"duplicate"});
  expect(gate.index().byId.get(a.id)!.row.question).toBe("Which planet is nicknamed the Red Planet?");
 }finally{await db.close();}
});

// Phase 7d (R2 #26.3–#26.5, #26.8, D45). Fixture rows are arranged directly; every edit below goes through the signed
// admission path.
const arrange=async(db:PGlite,active:SpeedQuestion[],pending:SpeedQuestion[]=[])=>{
 await seedPending(db,[...active,...pending]);
 if(active.length)await db.exec(`reset role;alter table trivia_questions disable trigger all;update trivia_questions set status='active' where id in (${active.map(r=>`'${r.id}'`).join(",")});alter table trivia_questions enable trigger all;set role service_role;`);
};
// Same answer = same fact (the pair "candidate-soundness" is the lone soundness check).
const sameFact={modelVersion:"same-fact-7d",adjudicate:async(tasks:ComparisonTask[]):Promise<ComparisonResult[]>=>tasks.map(task=>({...verdict(task),
 decision:task.id!=="candidate-soundness"&&core.content(task.a).answer===core.content(task.b).answer?"duplicate":"unique"}))};
const sessionFor=(db:PGlite,adjudicate=vi.fn(sameFact.adjudicate))=>runtime.createSession({client:harness.clientFor(db),secret:harness.SECRET,budget:runtime.createBudget({dollars:1}),judge:{modelVersion:sameFact.modelVersion,adjudicate}});
const current=(gate:Awaited<ReturnType<typeof runtime.createSession>>,id:string)=>gate.index().byId.get(id)!.row as AdmissionRow;

describe("Phase 7d: D38b in one pass",()=>{
 it.each([2,4])("a rewording saves when the old wording already repeated %i live questions",async count=>{
  const db=new PGlite();try{
   await harness.setup(db,0,false);
   const edited=row(40,"Which planet is called the Red Planet?","Mars");
   const twins=Array.from({length:count},(_,n)=>row(41+n,`Which planet is red, clue number ${n+1}?`,"Mars"));
   await arrange(db,[edited,...twins]);
   const adjudicate=vi.fn(sameFact.adjudicate),gate=await sessionFor(db,adjudicate);
   const {row:saved,evidence}=await gate.write({question:"Which planet is nicknamed the Red Planet?"},{existing:current(gate,edited.id)});
   expect(saved.question).toBe("Which planet is nicknamed the Red Planet?");expect(saved.status).toBe("active");
   expect(new Set(evidence!.preexistingRepeats)).toEqual(new Set(twins.map(t=>t.id)));
   expect(evidence!.comparisonScope).toBe("live-edit");
   // One pass: the old wording is judged once against each of the edit's repeats, and never against anything else.
   // (This fake judge has no pair cache; the OpenAI judge answers the final check's repeated pairs from its cache.)
   const oldPairs=adjudicate.mock.calls.flatMap(([tasks])=>tasks).filter(task=>task.id!=="previous-version"&&task.a.question===edited.question);
   expect(oldPairs.map(task=>task.b.id).sort()).toEqual(twins.map(t=>t.id).sort());
  }finally{await db.close();}
 });
 it("a difficulty-only edit saves on a live question with a live twin",async()=>{
  const db=new PGlite();try{
   await harness.setup(db,0,false);
   const a=row(50,"Which planet is called the Red Planet?","Mars"),twin=row(51,"Which planet is red from iron oxide dust?","Mars");
   await arrange(db,[a,twin]);
   const gate=await sessionFor(db);
   const {row:saved,evidence}=await gate.write({difficulty:"hard"},{existing:current(gate,a.id)});
   expect(saved.difficulty).toBe("hard");expect(evidence!.preexistingRepeats).toEqual([twin.id]);
  }finally{await db.close();}
 });
 it("an edit that keeps its fact but creates a new repeat is still refused",async()=>{
  const db=new PGlite();try{
   await harness.setup(db,0,false);
   // Facts are the marker words each question names; two questions repeat when they share one.
   const facts=(q:string)=>["red","moons"].filter(word=>q.toLowerCase().includes(word));
   const markers={modelVersion:"markers-7d",adjudicate:async(tasks:ComparisonTask[]):Promise<ComparisonResult[]>=>tasks.map(task=>({...verdict(task),
    decision:task.id!=="candidate-soundness"&&facts(task.a.question).some(word=>facts(task.b.question).includes(word))?"duplicate":"unique"}))};
   const a=row(60,"Which planet is the red one?","Mars"),b=row(61,"Which planet looks red at night?","Mars"),c=row(62,"Which planet has the moons Phobos and Deimos?","Mars");
   await arrange(db,[a,b,c]);
   const gate=await sessionFor(db,vi.fn(markers.adjudicate));
   await expect(gate.write({question:"Which red planet has the moons Phobos and Deimos?"},{existing:current(gate,a.id)})).rejects.toMatchObject({code:"duplicate",evidence:{matchedRowIds:[c.id]}});
   expect(current(gate,a.id).question).toBe(a.question);
  }finally{await db.close();}
 });
 it("#26.8: an edit to a waiting question is refused by a waiting copy, the only possible match",async()=>{
  const db=new PGlite();try{
   await harness.setup(db,0,false);
   const w1=row(70,"Which metal is liquid at room temperature?","Mercury"),w2=row(71,"Name the metal that is a liquid at room temperature.","Mercury");
   await arrange(db,[],[w1,w2]);
   const gate=await sessionFor(db);
   await expect(gate.write({question:"Which metal stays liquid at room temperature?"},{existing:current(gate,w2.id)})).rejects.toMatchObject({code:"duplicate",evidence:{matchedRowIds:[w1.id]}});
  }finally{await db.close();}
 });
 it("D45: a live edit can't take another question's reserved previous fact, but a question may return to its own",async()=>{
  const db=new PGlite();try{
   await harness.setup(db,0,false);
   const a=row(80,"Which planet is called the Red Planet?","Mars"),b=row(81,"Which planet is the largest?","Jupiter");
   await arrange(db,[a,b]);
   const gate=await sessionFor(db);
   // a moves to a new fact; Mars is reserved as a's previous fact (history:<a>:<revision>).
   await gate.write({question:"Which planet has the most famous rings?",options:["Saturn","Venus","Jupiter","Mercury"],correct_answer:0},{existing:current(gate,a.id)});
   expect([...gate.index().byId.keys()].some(id=>id.startsWith(`history:${a.id}:`))).toBe(true);
   await expect(gate.write({question:"Which planet is nicknamed the Red Planet?",options:["Mars","Venus","Jupiter","Mercury"],correct_answer:0},{existing:current(gate,b.id)})).rejects.toMatchObject({code:"duplicate"});
   expect(current(gate,b.id).question).toBe(b.question);
   const back=(await gate.write({question:"Which planet is nicknamed the Red Planet?",options:["Mars","Venus","Jupiter","Mercury"],correct_answer:0},{existing:current(gate,a.id)})).row;
   expect(back.question).toBe("Which planet is nicknamed the Red Planet?");
  }finally{await db.close();}
 });
});

it("R2 #26.1: Quick Keep sends a waiting question overnight after a live edit takes its fact",async()=>{
 const db=new PGlite();try{
  await harness.setup(db,0,false);
  await db.exec("reset role;");
  for(const file of QUICK_KEEP_MIGRATIONS)await db.exec(readFileSync(file,"utf8"));
  await db.exec("set role service_role;");
  const tagged=async(rows:SpeedQuestion[])=>{
   await db.exec("reset role;");
   for(const r of rows)await db.query("insert into question_tags(game,question_ref,category,subject,subject_key) values('speed',$1,$2,$3,$3)",[r.id,r.category,r.id]);
   await db.exec("set role service_role;");
  };
  const keep=async(rows:SpeedQuestion[])=>{
   const envelope={operation:"quick_keep",policyVersion:core.POLICY_VERSION,expiresAt:Date.now()+300_000,rows:rows.map(r=>({id:r.id,contentHash:core.contentHash(r)}))};
   return ((await harness.call(db,"speed_trivia_quick_keep",{p_check:envelope,p_signature:runtime.sign(harness.SECRET,envelope)})) as {rows:{id:string;outcome:string}[]}).rows.map(r=>r.outcome);
  };
  const p=row(90,"Which planet is called the Red Planet?","Mars"),control=row(91,"Which ocean is the largest?","Pacific"),live=row(92,"Which planet is the largest?","Jupiter");
  await arrange(db,[live],[p,control]);await tagged([p,control,live]);
  const gate=await sessionFor(db);
  // Full-bank admissions of the waiting rows: what earns the free fast lane.
  for(const r of [p,control])await gate.write({question:r.question},{existing:current(gate,r.id)});
  // The live edit takes P's fact; the live-only check doesn't see the waiting P.
  const edit=await gate.write({question:"Which planet is nicknamed the Red Planet?",options:["Mars","Venus","Jupiter","Mercury"],correct_answer:0},{existing:current(gate,live.id)});
  expect(edit.evidence!.comparisonScope).toBe("live-edit");
  expect(await keep([p])).toEqual(["queued"]);
  expect(current(gate,p.id).status).toBe("pending_review");
  // Admitted after the live edit (here: re-admitted), a waiting question earns the fast lane again.
  await gate.write({question:control.question+" "},{existing:current(gate,control.id)});
  const reread=(await harness.call(db,"speed_trivia_find",{p_identifier:control.id}) as SpeedQuestion[])[0];
  expect(await keep([reread])).toEqual(["approved"]);
 }finally{await db.close();}
});

it("filters before retrieval ranking, so pending competitors cannot hide an approved match",()=>{
 const pending=Array.from({length:150},(_,n)=>row(100+n,'Which synthetic desert is largest on this continent? '+n,'Unknown '+n));
 const active={...row(999,'Which continent contains the Gobi Desert?','Asia'),status:'active' as const};
 const corpus=core.createCorpus([...pending,active],{complete:true,expectedCount:151,revision:'1'}),index=core.buildIndex(corpus),view=approvedIndex(index);
 expect(view.byId.size).toBe(1);expect(core.retrieve(view,row(998,'The Gobi Desert lies on which continent?','Asia')).matches.map(hit=>hit.id)).toEqual([active.id]);
 expect(index.byId.size).toBe(151);expect(approvedIndex(index)).toBe(view);
});

it("cancels a delayed semantic check before signed admission and consumes its late result",async()=>{
 const db=new PGlite();try{
  await harness.setup(db,0,false);const candidate=row(8000,"Which force attracts masses?","Gravity");await seedPending(db,[candidate]);
  const controller=new AbortController(),budget=runtime.createBudget({dollars:0.50,signal:controller.signal});
  const underlying=harness.clientFor(db),names:string[]=[];
  let finish!:(results:ComparisonResult[])=>void,started!:()=>void;
  const waiting=new Promise<void>(resolve=>{started=resolve;});
  const delayed=vi.fn(async(tasks:ComparisonTask[])=>{started();return new Promise<ComparisonResult[]>(resolve=>{finish=resolve;});});
  const gate=await runtime.createSession({client:{rpc:(name,args)=>{names.push(name);return underlying.rpc(name,args);}},secret:harness.SECRET,budget,judge:{modelVersion:"cancelled-synthetic",adjudicate:delayed}});
  const writing=gate.write({status:"active"},{existing:gate.index().byId.get(candidate.id)!.row as AdmissionRow,approvedOnly:true});
  const rejected=expect(writing).rejects.toMatchObject({code:"cancelled"});
  await waiting;controller.abort();await rejected;
  finish(delayed.mock.calls[0][0].map(verdict));await new Promise(resolve=>setTimeout(resolve,0));
  expect(names).not.toContain("admit_speed_trivia");expect(gate.index().byId.get(candidate.id)!.row.status).toBe("pending_review");
  expect(()=>budget.reserve({requests:1})).toThrow("connection closed");
 }finally{await db.close();}
});

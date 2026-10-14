import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import type { AdmissionClient, AdmissionRow } from "@/types/speedTriviaAdmission";
import type { ComparisonTask, ComparisonResult, SpeedQuestion, SpeedIndex } from "@/types/speedTriviaUniqueness";
const require=createRequire(import.meta.url);
const {approvedIndex}=require("../lib/speed-trivia-uniqueness/approval.cjs") as {approvedIndex:(index:SpeedIndex)=>SpeedIndex};
const harness=require("../scripts/test-speed-trivia-admission-sql.cjs") as {setup:(db:PGlite,extra?:number,variety?:boolean)=>Promise<void>;clientFor:(db:PGlite)=>AdmissionClient;SECRET:string;row:(id:string,q:string,answer:string,category?:string)=>SpeedQuestion};
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

it("filters before retrieval ranking, so pending competitors cannot hide an approved match",()=>{
 const pending=Array.from({length:150},(_,n)=>row(100+n,'Which synthetic desert is largest on this continent? '+n,'Unknown '+n));
 const active={...row(999,'Which continent contains the Gobi Desert?','Asia'),status:'active' as const};
 const corpus=core.createCorpus([...pending,active],{complete:true,expectedCount:151,revision:'1'}),index=core.buildIndex(corpus),view=approvedIndex(index);
 expect(view.byId.size).toBe(1);expect(core.retrieve(view,row(998,'The Gobi Desert lies on which continent?','Asia')).matches.map(hit=>hit.id)).toEqual([active.id]);
 expect(index.byId.size).toBe(151);expect(approvedIndex(index)).toBe(view);
});

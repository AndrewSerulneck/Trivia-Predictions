import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import * as audit from "@/lib/speed-trivia-uniqueness/audit.cjs";
import * as review from "@/lib/speed-trivia-uniqueness/review.cjs";
import type { SpeedQuestion, SpeedCorpus } from "@/types/speedTriviaUniqueness";
const require=createRequire(import.meta.url);
const preparation=require("../scripts/prepare-speed-trivia-pending-audit.cjs") as {
 reconcile:(original:Record<string,unknown>[],corpus:SpeedCorpus)=>{targets:Record<string,unknown>[];concurrent:Record<string,unknown>[];newPending:Record<string,unknown>[]};
 verifiedCache:(files:string[],corpus:SpeedCorpus)=>{cache:Map<string,unknown>;sources:{rejected:number}[]};
};
const references=require("../scripts/capture-speed-trivia-pending-audit-references.cjs") as {referenceSQL:(schema:Record<string,unknown>[])=>string};
const directories:string[]=[];
afterEach(()=>{for(const directory of directories.splice(0))fs.rmSync(directory,{recursive:true,force:true});});
const row=(id:string,question="Which synthetic letter precedes B?"):SpeedQuestion=>({id,slug:id,question,options:["A","Z"],correct_answer:0,category:"General Knowledge",status:"pending_review",question_pool:"anytime_blitz",answer_format:"multiple_choice"});
const corpus=(rows:SpeedQuestion[])=>core.createCorpus(rows,{complete:true,expectedCount:rows.length,revision:"1"});
const target=(r:SpeedQuestion)=>({id:r.id,contentHash:core.contentHash(r),stateHash:runtime.stateHash(r)});
describe("Phase 3 snapshot and evidence preparation",()=>{
 it("keeps the original denominator and separates edits, status changes, removals and new arrivals",()=>{
  const rows=[row("one"),row("two"),row("three"),row("four"),row("five")];
  const current=corpus([rows[0],{...rows[1],question:"A changed fact?"},{...rows[2],status:"active"},{...rows[3],speed_generation_metadata:{version:"speed-subject-plan-v1",primarySubject:"Synthetic name",subtopic:"Synthetic topic"}},row("new")]);
  const result=preparation.reconcile(rows.map(target),current);
  expect(result.targets.map(r=>r.id)).toEqual(["one"]);
  expect(result.concurrent.map(r=>r.reason)).toEqual(["version_changed","status_changed","version_changed","left_speed_pool"]);
  expect(result.newPending.map(r=>r.id)).toEqual(["new"]);
  expect(result.targets.length+result.concurrent.length).toBe(rows.length);
 });
 it("rejects stale orientation/model evidence and refuses an incomplete durable cache",()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"speed-phase3-"));directories.push(directory);
  const a=row("a"),b=row("b","Which synthetic letter follows Y?"),key=core.pairKey(a,b,audit.MODEL_VERSION);
  const result={decision:"unique",qualityA:"sound",qualityB:"invalid",confidence:"high",fact:"Different facts",explanation:"Synthetic fixture"};
  const value={modelVersion:audit.MODEL_VERSION,firstHash:core.contentHash(a),result};
  const file=path.join(directory,"cache.jsonl");
  fs.writeFileSync(file,[{key,value},{key:"bad",value:{...value,firstHash:"foreign-content"}},{key:"old",value:{...value,modelVersion:"old"}}].map(v=>JSON.stringify(v)+"\n").join(""));
  const loaded=preparation.verifiedCache([file],corpus([a,b]));
  expect(loaded.sources[0].rejected).toBe(2);expect(loaded.cache.size).toBe(1);
  expect(review.cachedVerdict(loaded.cache,b,a,audit.MODEL_VERSION)?.qualityA).toBe("invalid");
  fs.appendFileSync(file,"{partial");expect(()=>preparation.verifiedCache([file],corpus([a,b]))).toThrow("incomplete-durable-journal");
 });
 it("counts UUID and slug references, including true zero counts, without reading player payloads",async()=>{
  const db=new PGlite();
  try{
   await db.exec(`create table trivia_questions(id text,slug text,question_pool text,answer_format text);
    create table by_id(question_id text,private_player text);create table by_slug(question_id text,private_player text);
    insert into trivia_questions values ('a','slug-a','anytime_blitz','multiple_choice'),('b','slug-b','anytime_blitz','multiple_choice'),('live','slug-live','live_showdown','write_in');
    insert into by_id values ('a','private-one'),('a','private-two');insert into by_slug values ('slug-b','private-three'),('slug-live','private-four');`);
   const schema=[{name:"id_fk",schema:"public",table:"by_id",column:"question_id",target:"id",width:1},{name:"slug_fk",schema:"public",table:"by_slug",column:"question_id",target:"slug",width:1}];
   const result=await db.query(references.referenceSQL(schema));
   expect(result.rows).toEqual([{name:"id_fk",counts:{a:2,b:0}},{name:"slug_fk",counts:{a:0,b:1}}]);
   expect(JSON.stringify(result.rows)).not.toContain("private-");
   expect(()=>references.referenceSQL([{...schema[0],width:2}])).toThrow("unsupported-reference-schema");
  }finally{await db.close();}
 });
});

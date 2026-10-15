import { describe, expect, it, vi } from "vitest";
import * as subjects from "@/lib/speed-trivia-uniqueness/subjects.cjs";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import { selectVariedTrivia, SELECTION_NODE_LIMIT } from "@/lib/speedTriviaSelection";
import evaluation from "@/docs/fixtures/speed-trivia-variety-evaluation-v1.json";
import type { SpeedQuestion } from "@/types/speedTriviaUniqueness";
import type { TriviaQuestion } from "@/types";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const generation = require("../lib/speed-trivia-uniqueness/generation.cjs") as {planTopics:(corpus:unknown,now?:number,ordinal?:number)=>{category:string;topics:{topic:string}[]}[];allocateBriefs:(plan:unknown,attempted:Set<string>,accepted:Record<string,number>,day:number,ordinal:number)=>{topic:string;lens:string}[]};
const now = Date.parse("2026-10-14T02:00:00Z");
const row = (id: string, question = "Which singer released this recording?", answer = "Taylor Swift", status: SpeedQuestion["status"] = "active", created_at = "2026-01-01T00:00:00Z"): SpeedQuestion => ({id,question,options:[answer,"X","Y","Z"],correct_answer:0,category:"Music",status,created_at,question_pool:"anytime_blitz",answer_format:"multiple_choice"});
const player = (id: string, names: string[], category="Music"): TriviaQuestion => ({id,question:names.length ? `Which performer collaborated with ${names.join(" and ")}?` : "Which unfamiliar concept is described?",options:["A performer","X","Y","Z"],correctAnswer:0,category});

describe("frozen subject identity and clocks", () => {
 for(const fixture of evaluation.cases.filter(c=>"question" in c)) it(fixture.id, () => {
  if(!("question" in fixture) || !("answer" in fixture) || !("expected" in fixture)) throw new Error("Bad identity fixture");
  const input=row(fixture.id,fixture.question!,fixture.answer!);if("distractors" in fixture)input.options=[fixture.answer!,...fixture.distractors!];
  const evidence=subjects.extract(input);
  expect(evidence.subjects.map(subject=>subject.key).sort()).toEqual([...(fixture.expected as string[])].sort());
  if("unknown" in fixture&&fixture.unknown)expect(evidence.coverage).toBe("unknown");
 });
 for(const fixture of evaluation.cases.filter(c=>c.kind==="clock")) it(fixture.id, () => {
  if(!("ageDays" in fixture))throw new Error("Bad clock fixture");
  const history=row("old",undefined,undefined,fixture.status as SpeedQuestion["status"],new Date(now-fixture.ageDays!*86400000).toISOString());
  expect(Boolean(subjects.createState([history],now).check(subjects.extract(row("new"))))).toBe(fixture.expectedBlocked);
 });
 for(const fixture of evaluation.cases.filter(c=>c.kind==="concentration"))it(fixture.id,()=>{
  if(!("bankCount" in fixture))throw new Error("Bad concentration fixture");
  expect(Boolean(subjects.createState(Array.from({length:fixture.bankCount!},(_,i)=>row(String(i))),now).check(subjects.extract(row("new"))))).toBe(fixture.expectedBlocked);
 });
 it("multiple-counts-all",()=>{const evidence=subjects.extract(row("new","Which musician collaborated with Beyoncé and Lady Gaga?","A performer"));expect(subjects.createState([row("old",undefined,"Lady Gaga")],now).check(evidence,new Set(["person:lady-gaga"]))).toBe("subject_run_repeat");});
 it("blocks bad/future history and retains held/retired clocks without concentration",()=>{
  for(const time of ["invalid","2027-01-01T00:00:00Z"])expect(subjects.createState([row("old",undefined,undefined,"deleted",time)],now).check(subjects.extract(row("new")))).toBe("subject_history_unknown");
  const held={...row("held",undefined,undefined,"pending_review",new Date(now-86400000).toISOString()),speed_review_state:{state:"held" as const,contentHash:"x"}};
  expect(subjects.createState([held],now).check(subjects.extract(row("new")))).toBe("subject_cooldown");
  expect(subjects.createState([row("deleted",undefined,undefined,"deleted")],now).counters.size).toBe(0);
 });
 it("preserves status-only clocks and records new edit subjects while keeping earlier memory",()=>{
  const old=row("old");old.speed_subject_evidence=subjects.introductionEvidence(old,null,subjects.extract(old),now-31*86400000);
  const approved={...old,status:"active" as const};expect(subjects.introductionEvidence(approved,old,subjects.extract(approved),now).history).toEqual(old.speed_subject_evidence.history);
  const edit=row("old",undefined,"Beyoncé");const evidence=subjects.introductionEvidence(edit,old,subjects.extract(edit),now);
  expect(evidence.history?.find(event=>event.key==="person:taylor-swift")?.introducedAt).toBe(new Date(now-31*86400000).toISOString());
  expect(evidence.history?.find(event=>event.key==="person:beyoncé")?.introducedAt).toBe(new Date(now).toISOString());
 });
 it("accepts an open-world precise name only with role and source-span evidence",()=>{
  const input=row("open","Which sculptor named Aster Vale created this work?","Aster Vale");
  expect(subjects.extract(input,{generated:true}).coverage).toBe("unknown");
  const proposal={kind:"person" as const,name:"Aster Vale",source:"answer" as const,start:0,end:10};
  expect(subjects.extract(input,{generated:true,proposals:[proposal]}).subjects.map(s=>s.key)).toEqual(["person:aster-vale"]);
  expect(subjects.extract(input,{generated:true,proposals:[{...proposal,start:1}]}).coverage).toBe("unknown");
  expect(subjects.extract(row("untrusted","What material forms this pot?","Taylor Swift"),{proposals:[proposal],generated:true}).coverage).toBe("unknown");
 });
 it("changed work labels cannot hide a concentrated artist",()=>{
  const bank=Array.from({length:24},(_,i)=>row(String(i)));
  const candidate=row("new","Which artist released Shake It Off?","Taylor Swift");
  expect(subjects.createState(bank,now).check(subjects.extract(candidate))).toBe("subject_concentration");
 });
 it("rotates tied topics each UTC day and caps accepted topics while preserving category opportunity order",()=>{
  const rows=[row("music"),{...row("science","What metal forms this wire?","Copper"),category:"Science"}];
  const corpus=core.createCorpus(rows,{complete:true,expectedCount:rows.length,revision:"1"});
  const p1=generation.planTopics(corpus,now),p2=generation.planTopics(corpus,now+86400000);
  expect(p1.map(p=>p.category).sort()).toEqual(["Music","Science"]);
  expect(p1.find(p=>p.category==="Music")?.topics.slice(0,3)).not.toEqual(p2.find(p=>p.category==="Music")?.topics.slice(0,3));
  const allocation=p1[0],accepted=Object.fromEntries(allocation.topics.slice(0,3).map(topic=>[topic.topic,3]));
  const briefs=generation.allocateBriefs(allocation,new Set(),accepted,Math.floor(now/86400000),0);
  expect(briefs).toHaveLength(3);expect(briefs.every(brief=>!accepted[brief.topic])).toBe(true);expect(briefs.some(brief=>/Africa|Asia|Latin America|Oceania/.test(brief.lens))).toBe(true);
 });
});

describe("bounded player variety",()=>{
 it("selection-full",()=>{const names=["Taylor Swift","Beyoncé","Lady Gaga","Michael Jackson","Adele","Madonna","Billie Eilish","Jimi Hendrix","Whitney Houston","Dolly Parton","Louis Armstrong","Jane Austen","J K Rowling","William Shakespeare","Charles Dickens"];
  const result=selectVariedTrivia(names.map((name,i)=>player(String(i),[name])),15);expect(result.questions).toHaveLength(15);expect(result.selection.reason).toBeNull();});
 it("selection-insufficient",()=>{const names=["Taylor Swift","Beyoncé","Lady Gaga","Michael Jackson"];const result=selectVariedTrivia(Array.from({length:30},(_,i)=>player(String(i),[names[i%4]])),15);expect(result.questions).toHaveLength(4);expect(result.selection.reason).toBe("insufficient_subject_variety");});
 it("selection-unknowns",()=>{const result=selectVariedTrivia(Array.from({length:15},(_,i)=>player(String(i),[])),15);expect(result.questions).toHaveLength(15);expect(result.selection.coverage.unknown).toBe(15);});
 it("selection-unseen-first",()=>{const questions=Array.from({length:30},(_,i)=>player(String(i),[]));const answered=new Set(questions.slice(15).map(q=>q.id));expect(selectVariedTrivia(questions,15,answered).questions.every(q=>!answered.has(q.id))).toBe(true);});
 it("selection-balance",()=>{const questions=Array.from({length:9},(_,c)=>Array.from({length:20},(_,i)=>player(c+":"+i,[],"Category "+c))).flat();const result=selectVariedTrivia(questions,15);for(let c=0;c<9;c++)expect(result.questions.filter(q=>q.category==="Category "+c).length).toBeGreaterThanOrEqual(1);expect(Math.max(...Array.from({length:9},(_,c)=>result.questions.filter(q=>q.category==="Category "+c).length))).toBe(2);});
 it("reconsiders a greedy multi-subject choice and equally unseen alternatives that allow seen fill",()=>{
  const choices=[player("AB",["Taylor Swift","Beyoncé"]),player("A",["Taylor Swift"]),player("B",["Beyoncé"])];
  expect(selectVariedTrivia(choices,2).questions.map(q=>q.id)).toEqual(["A","B"]);
  expect(selectVariedTrivia(choices,2,new Set(["B"])).questions.map(q=>q.id)).toEqual(["A","B"]);
 });
 it("bounds work, limits category-filtered internal rounds, and never repeats a known key",()=>{
  const questions=Array.from({length:100},(_,i)=>player(String(i),i%2?["Taylor Swift"]:["Beyoncé"],"Music"));
  const result=selectVariedTrivia(questions,100);expect(result.questions).toHaveLength(2);expect(result.selection.explored).toBeLessThanOrEqual(SELECTION_NODE_LIMIT);expect(result.questions.every(q=>q.category==="Music")).toBe(true);
  expect(selectVariedTrivia([],15).selection).toMatchObject({returned:0,reason:"insufficient_subject_variety"});
 });
});

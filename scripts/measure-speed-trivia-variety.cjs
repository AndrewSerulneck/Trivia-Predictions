#!/usr/bin/env node
// Offline paired baseline/selection measurement. Reads no env, player or provider.
const fs=require('node:fs');
const path=require('node:path');
const core=require('../lib/speed-trivia-uniqueness/core.cjs');
const subjects=require('../lib/speed-trivia-uniqueness/subjects.cjs');
const {selectVariedTrivia}=require('../lib/speedTriviaSelection.ts');
const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
const dir=value('--snapshot'),file=path.join(dir,'corpus.json'),bytes=fs.readFileSync(file,'utf8');
if(core.hash(bytes)!==fs.readFileSync(file+'.sha256','utf8').trim().split(' ')[0])throw new Error('corpus-checksum-mismatch');
const corpus=JSON.parse(bytes),active=corpus.rows.filter(r=>r.status==='active'),tags=new Map(JSON.parse(fs.readFileSync(path.join(dir,'subject-row-tags.json'))).map(t=>[t.id,t.keys]));
let state=20261013;const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const balanced=(rows,limit)=>{const buckets=new Map();for(const r of rows){if(!buckets.has(r.category))buckets.set(r.category,[]);buckets.get(r.category).push(r);}for(const [k,v]of buckets)buckets.set(k,shuffle(v));let keys=shuffle([...buckets.keys()]),out=[],cursor=0;while(out.length<limit&&keys.length){if(cursor>=keys.length){cursor=0;keys=shuffle(keys);}const row=buckets.get(keys[cursor]).pop();if(!row){keys.splice(cursor,1);continue;}out.push(row);cursor++;}return out;};
const repeats=(rows,getKeys)=>{const keys=rows.flatMap(getKeys);return keys.length!==new Set(keys).size;};
const measuredBytes=rows=>Buffer.byteLength(JSON.stringify(rows.map(r=>Object.fromEntries(['id','question','options','correct_answer','category','difficulty'].map(k=>[k,r[k]])))));
const now=Date.parse(corpus.capturedAt||'2026-10-14T01:36:30.649Z'),start=performance.now(),subjectState=subjects.createState(corpus.rows,now),aggregationMs=performance.now()-start;
const reports=[];
for(const category of [null,...new Set(active.map(r=>r.category))]){
 const bank=active.filter(r=>!category||r.category===category),trials=[];
 for(let t=0;t<1000;t++){
  const transferred=bank.length<=600?[...bank]:[0,...Array.from({length:4},()=>Math.floor(random()*(bank.length-220+1)))].flatMap(offset=>bank.slice(offset,offset+220));
  const pool=[...new Map(transferred.map(r=>[r.id,r])).values()],baseline=balanced(pool,15);
  // The baseline consumes exactly its original RNG sequence. Independently
  // seeded question order randomizes the new selector without changing pools.
  let selectionSeed=(20261013+t*7919+reports.length*104729)>>>0;
  const ordered=[...pool];for(let i=ordered.length-1;i>0;i--){selectionSeed=(1664525*selectionSeed+1013904223)>>>0;const j=Math.floor(selectionSeed/4294967296*(i+1));[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}
  const before=performance.now(),result=selectVariedTrivia(ordered.map(r=>({id:r.id,question:r.question,options:r.options,correctAnswer:r.correct_answer,category:r.category,difficulty:r.difficulty})),15),ms=performance.now()-before;
  trials.push({baselineRepeat:repeats(baseline,row=>tags.get(row.id)||[]),identifiedRepeat:repeats(result.questions,row=>subjectState.records.get(row.id).keys),referenceRepeat:repeats(result.questions,row=>tags.get(row.id)||[]),count:result.questions.length,coverage:result.selection.coverage,reason:result.selection.reason,nodes:result.selection.explored,ms,bytes:measuredBytes(transferred),candidates:pool.length});
 }
 const avg=key=>trials.reduce((sum,t)=>sum+Number(t[key]),0)/trials.length;
 reports.push({category:category||'All',trials:1000,baselineReferenceRepeats:trials.filter(t=>t.baselineRepeat).length,selectedIdentifiedRepeats:trials.filter(t=>t.identifiedRepeat).length,selectedReferenceRepeats:trials.filter(t=>t.referenceRepeat).length,shortSelections:trials.filter(t=>t.count<15).length,meanCount:avg('count'),meanBytes:avg('bytes'),meanCandidates:avg('candidates'),meanSelectionMs:avg('ms'),maxSelectionMs:Math.max(...trials.map(t=>t.ms)),maxNodes:Math.max(...trials.map(t=>t.nodes)),meanCoverage:Object.fromEntries(['identified','generic','unknown'].map(key=>[key,trials.reduce((sum,t)=>sum+t.coverage[key],0)/1000]))});
}
const evidenceBytes=corpus.rows.reduce((n,row)=>n+Buffer.byteLength(JSON.stringify(subjects.introductionEvidence(row,row,subjectState.records.get(row.id).evidence,now))),0);
const report={version:'speed-variety-phase2-measurement-v1',seed:20261013,corpusRevision:corpus.revision,corpusHash:core.hash(bytes),aggregationMs,coverage:subjectState.coverage,subjectKeys:subjectState.counters.size,projectedEvidenceBytesIfAllRowsTagged:evidenceBytes,extraSelectionQueries:0,extraSelectionProviderCalls:0,reports};
fs.writeFileSync(value('--output'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report));

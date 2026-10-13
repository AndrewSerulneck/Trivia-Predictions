#!/usr/bin/env node
// Existing preserved snapshot only: no credentials, DB requests or provider calls.
const fs=require('node:fs');
const {performance}=require('node:perf_hooks');
const core=require('../lib/speed-trivia-uniqueness/core.cjs');
const {readSnapshot,fixtureRow}=require('./speed-trivia-phase2-support.cjs');
const {planTopics}=require('../lib/speed-trivia-uniqueness/generation.cjs');
const main=argv=>{
 const option=name=>argv[argv.indexOf(name)+1];
 if(!argv.includes('--snapshot'))throw new Error('preserved-snapshot-required');
 const start=performance.now(),corpus=readSnapshot(option('--snapshot')),loaded=performance.now();
 const index=core.buildIndex(corpus),indexed=performance.now();
 const pairs=JSON.parse(fs.readFileSync('tests/fixtures/speed-trivia-uniqueness/evaluation-v1.json','utf8')).pairs;
 const measurements=[];
 for(const pair of pairs){try{const row=fixtureRow(pair.a,pair.id),retrieval=core.retrieve(index,row),exact=retrieval.matches.some(hit=>core.deterministicPair(row,index.byId.get(hit.id).row)?.decision==='duplicate');measurements.push({complete:retrieval.complete,competitors:retrieval.total,exact});}catch{/* Malformed frozen cases stay unverified, never admitted. */}}
 const report={mode:'offline-only',rows:corpus.rows.length,corpusBytes:Buffer.byteLength(JSON.stringify(corpus.rows)),snapshotVerifyAndLoadMs:Math.round(loaded-start),indexBuildMs:Math.round(indexed-loaded),retrievalMs:Math.round(performance.now()-indexed),sampleCandidates:measurements.length,completeRetrieval:measurements.filter(m=>m.complete).length,overflowHolds:measurements.filter(m=>!m.complete).length,exactRejectedBeforePaidCalls:measurements.filter(m=>m.exact).length,meanCompetitors:measurements.reduce((n,m)=>n+m.competitors,0)/measurements.length,initialInventoryAndPageRPCs:2+Math.ceil(corpus.rows.length/500),generationPlan:planTopics(corpus).map(p=>({category:p.category,count:p.count,subtopics:p.topics.map(t=>t.topic)})),paidCalls:0,productionMutations:0};
 if(argv.includes('--output'))fs.writeFileSync(option('--output'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({...report,generationPlan:report.generationPlan.map(p=>({category:p.category,count:p.count}))}));return report;
};
if(require.main===module){try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={main};

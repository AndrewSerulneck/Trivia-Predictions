#!/usr/bin/env node
// Offline baseline only. Extract the actual lexical helpers, never run generator main().
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const loadLegacyHelpers = () => {
  const source=fs.readFileSync(path.resolve('scripts/generate-trivia-questions.cjs'),'utf8');
  const start=source.indexOf('const QUESTION_STOP_WORDS = new Set(');
  const end=source.indexOf('function toDisplayCategory(',start);
  if(start<0||end<0)throw new Error('Legacy helper boundaries changed; inspect extraction.');
  const context={};vm.runInNewContext(source.slice(start,end)+';globalThis.compare=areQuestionsNearDuplicates;',context,{timeout:1000});
  return context.compare;
};
const evaluate = document => {
  const near=loadLegacyHelpers();
  const exact=text=>String(text).toLowerCase().replace(/[^a-z0-9]/g,'');
  const totals={};const cases=[];
  for(const pair of document.pairs){
    const blocked=pair.a.source.status!=='deleted' && (exact(pair.a.question)===exact(pair.b.question)||
      (pair.a.category.toLowerCase()===pair.b.category.toLowerCase()&&near(pair.a.question,pair.b.question)));
    const key=pair.split+'/'+pair.label;
    totals[key]??={total:0,blocked:0,accepted:0};totals[key].total++;totals[key][blocked?'blocked':'accepted']++;
    cases.push({id:pair.id,label:pair.label,split:pair.split,blocked});
  }
  return {evaluationVersion:document.version,mode:'offline isolated-pair baseline: actual lexical helper, category gate, exact identity, deleted-history exclusion; not an end-to-end full-corpus replay',totals,cases};
};
module.exports={evaluate,loadLegacyHelpers};
if(require.main===module){
  const document=JSON.parse(fs.readFileSync('tests/fixtures/speed-trivia-uniqueness/evaluation-v1.json'));
  const result=evaluate(document);
  if(process.argv[2]==='--output')fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({evaluationVersion:result.evaluationVersion,totals:result.totals},null,2));
}

#!/usr/bin/env node
/* Phase 2 fixed-set benchmark. --paid requires an explicit shared ledger/cap.
 * Offline scoring uses the identical cache; missing results remain uncertain.
 */
const fs=require('node:fs');
const path=require('node:path');
const core=require('../lib/speed-trivia-uniqueness/core.cjs');
const gemini=require('../lib/speed-trivia-uniqueness/gemini.cjs');
const support=require('./speed-trivia-phase2-support.cjs');
const evaluate = async ({snapshot,output,paid=false,model='gemini-2.5-flash',thinkingBudget=0,split='all',batchSize=1,fixtureFile='tests/fixtures/speed-trivia-uniqueness/evaluation-v1.json'}) => {
  process.umask(0o077);
  const directory=support.privateDirectory(output),corpus=support.readSnapshot(snapshot);
  if(!path.resolve(fixtureFile).startsWith(path.resolve('tests/fixtures/speed-trivia-uniqueness')+path.sep))throw new Error('invalid-fixture-path');
  const fixtureBytes=fs.readFileSync(fixtureFile);
  const expectedFixtureHash=fixtureFile.endsWith('/evaluation-v1.json')?'44d2056a27e30d317f7b7b4e30185a3c7a60b53ca1ce09c8a44f847a68e37045':fs.readFileSync(fixtureFile.replace(/\.json$/,'.sha256'),'utf8').trim();
  if(core.hash(fixtureBytes.toString())!==expectedFixtureHash) throw new Error('frozen-evaluation-drift');
  const fixture=JSON.parse(fixtureBytes),pairs=fixture.pairs.filter(p=>split==='all'||p.split===split);
  const ids=new Map(corpus.rows.map(row=>[core.hash(row.id),row.id]));
  const rows=[...corpus.rows],extra=new Map();
  const target=side=> {
    const actual=ids.get(side.source?.sourceHash);if(actual)return actual;
    const row=support.fixtureRow(side,'authored:'+core.hash([side.question,side.answer,side.imageContext]));
    try{core.content(row);}catch{return null;}
    if(!extra.has(row.id)){extra.set(row.id,row);rows.push(row);}return row.id;
  };
  const targets=new Map(pairs.map(p=>[p.id,{a:target(p.a),b:target(p.b)}]));
  const combined=core.createCorpus(rows,{complete:true,expectedCount:rows.length,revision:corpus.revision+':evaluation'});
  const started=Date.now(),index=core.buildIndex(combined),retrieval=[],tasks=[],deterministic=new Map();
  for(const pair of pairs){
    const a=support.fixtureRow(pair.a,pair.id+':a'),b=support.fixtureRow(pair.b,pair.id+':b');
    try {
      core.content(a);core.content(b);
      const result=core.retrieve(index,a,{excludeId:targets.get(pair.id).a});
      retrieval.push({id:pair.id,label:pair.label,split:pair.split,found:result.matches.some(h=>h.id===targets.get(pair.id).b),complete:result.complete,hits:result.total});
      const exact=core.deterministicPair(a,b);
      if(exact)deterministic.set(pair.id,exact);
      else tasks.push({id:pair.id,a,b});
    }catch {deterministic.set(pair.id,{decision:'uncertain',explanation:'Malformed or missing content/answer/context.'});retrieval.push({id:pair.id,label:pair.label,split:pair.split,found:false,complete:false,hits:0});}
  }
  const budget=support.openBudget(directory,{dollars:5,maxRequests:1000,maxInputTokens:4000000,maxOutputTokens:1500000});
  const cache=support.openCache(directory),judge=gemini.createJudge({model,thinkingBudget,batchSize,apiKey:paid?process.env.GEMINI_API_KEY:null,budget,cache});
  const decisions=[];let error=null;
  try{
    // Independent pair decisions isolate adjudication quality from retrieval.
    for(let offset=0;offset<tasks.length;offset+=12){
      const batch=tasks.slice(offset,offset+12);let result;
      try {
        if(batchSize===1){
          result=[];
          for(let n=0;n<batch.length;n+=3){
            const settled=await Promise.allSettled(batch.slice(n,n+3).map(t=>judge.adjudicate([t])));
            const failed=settled.find(r=>r.status==='rejected');
            if(failed)throw failed.reason;
            for(const item of settled)result.push(...item.value);
          }
        }else result=await judge.adjudicate(batch);
      }
      catch(e){error=e.message;result=batch.map(t=>({id:t.id,decision:'uncertain',explanation:'Unverified: '+e.message}));}
      decisions.push(...result);
      if(paid)console.log(JSON.stringify({stage:'adjudication',model,processed:Math.min(offset+12,tasks.length),total:tasks.length,budget:budget.summary(),error}));
      if(error && error!=='missing-GEMINI_API_KEY')break;
    }
    for(const [id,result] of deterministic)decisions.push({id,...result});
    const byId=new Map(decisions.map(d=>[d.id,d]));
    const cases=pairs.map(pair=>({id:pair.id,split:pair.split,label:pair.label,tags:pair.tags,factId:pair.factId,...byId.get(pair.id),decision:byId.get(pair.id)?.decision||'uncertain',retrieval:retrieval.find(r=>r.id===pair.id)}));
    const metrics=subset=>({total:subset.length,duplicates:subset.filter(p=>p.label==='duplicate').length,duplicateDetected:subset.filter(p=>p.label==='duplicate'&&p.decision==='duplicate').length,duplicateEscapes:subset.filter(p=>p.label==='duplicate'&&p.decision==='unique').length,duplicateHolds:subset.filter(p=>p.label==='duplicate'&&p.decision==='uncertain').length,distinct:subset.filter(p=>p.label==='unique').length,distinctAccepted:subset.filter(p=>p.label==='unique'&&p.decision==='unique'&&p.qualityA==='sound').length,uncertain:subset.filter(p=>p.label==='uncertain').length,uncertainEscapes:subset.filter(p=>p.label==='uncertain'&&p.decision==='unique'&&p.qualityA==='sound').length,retrievalFound:subset.filter(p=>p.label==='duplicate'&&p.retrieval.found).length,retrievalComplete:subset.filter(p=>p.label==='duplicate'&&p.retrieval.complete).length});
    const report={policyVersion:core.POLICY_VERSION,retrievalVersion:core.RETRIEVAL_VERSION,extractorVersion:core.EXTRACTOR_VERSION,modelVersion:judge.modelVersion,fixtureHash:core.hash(fixtureBytes.toString()),corpusRevision:corpus.revision,corpusDigest:corpus.digest,corpusRows:corpus.rows.length,indexRows:rows.length,elapsedMs:Date.now()-started,mode:paid?'paid-fixed-set':'offline-cached',scope:'Full-corpus retrieval; isolated-pair adjudication, NOT full-corpus distinct admission.',budget:budget.summary(),error,metrics:{all:metrics(cases),heldOut:metrics(cases.filter(p=>p.split==='held-out')),mandatory:metrics(cases.filter(p=>p.tags.includes('mandatory-family'))),exact:metrics(cases.filter(p=>p.tags.some(t=>t.includes('exact'))))},cases};
    const m=report.metrics;
    report.gates=Boolean(!error&&m.all.duplicateEscapes===0&&m.all.uncertainEscapes===0&&m.all.distinctAccepted/m.all.distinct>=.95&&m.heldOut.duplicateEscapes===0&&(!m.heldOut.total||m.heldOut.distinctAccepted/m.heldOut.distinct>=.95)&&m.all.retrievalFound===m.all.duplicates&&m.all.retrievalComplete===m.all.duplicates);
    const filename=path.join(directory,`evaluation-${model}-thinking-${thinkingBudget}-${split}-${Date.now()}.json`);support.writeExclusive(filename,report);
    console.log(JSON.stringify({report:filename,metrics:report.metrics,gates:report.gates,budget:report.budget,error}));return report;
  }finally{budget.close();}
};
module.exports={evaluate};
if(require.main===module){const args=process.argv.slice(2);const value=key=>args[args.indexOf(key)+1];if(!args.includes('--snapshot')||!args.includes('--output'))throw new Error('Provide --snapshot verified-dir --output private-dir [--paid] [--model name] [--split calibration|held-out|all]');evaluate({snapshot:value('--snapshot'),output:value('--output'),paid:args.includes('--paid'),model:args.includes('--model')?value('--model'):'gemini-2.5-flash',thinkingBudget:args.includes('--thinking')?Number(value('--thinking')):0,batchSize:args.includes('--batch-size')?Number(value('--batch-size')):1,split:args.includes('--split')?value('--split'):'all',fixtureFile:args.includes('--fixture')?value('--fixture'):'tests/fixtures/speed-trivia-uniqueness/evaluation-v1.json'}).catch(e=>{console.error(e.message);process.exitCode=1;});}

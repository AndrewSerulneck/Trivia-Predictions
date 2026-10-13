const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const core=require('../lib/speed-trivia-uniqueness/core.cjs');
const {verifyBackup}=require('./audit-speed-trivia-inventory.cjs');
const privateDirectory = directory => {
  const absolute=path.resolve(directory);
  const parent=path.resolve('tmp/speed-trivia-uniqueness-private');
  if (!absolute.startsWith(parent+path.sep)) throw new Error('output-must-be-private-workspace-path');
  execFileSync('git',['check-ignore','--quiet',absolute+'/evidence.json']);
  fs.mkdirSync(absolute,{recursive:true,mode:0o700});return absolute;
};
const readSnapshot = directory => {
  const verified=verifyBackup(directory);
  const rows=JSON.parse(fs.readFileSync(path.join(directory,'speed-questions.json'),'utf8'));
  return core.createCorpus(rows,{complete:true,expectedCount:verified.rows,revision:`snapshot:${verified.corpusRevision}`});
};
// Authored comparisons sometimes supply only the correct option. Add a neutral
// placeholder for the row-shape contract; never mutate the frozen fixture.
const fixtureRow = (side,id) => ({id,slug:id,question:side.question,answer:side.answer,options:side.options?.length===1?[...side.options,'[evaluation-only distractor]']:side.options,correct_answer:side.correctAnswer,category:side.category,image_context:side.imageContext,image_url:null,status:side.source?.status||'pending_review',question_pool:'anytime_blitz',answer_format:'multiple_choice',created_at:'2026-10-12T00:00:00Z'});
const writeExclusive = (filename,value) => {const body=JSON.stringify(value,null,2)+'\n';fs.writeFileSync(filename,body,{flag:'wx',mode:0o600});fs.writeFileSync(filename+'.sha256',core.hash(body)+'\n',{flag:'wx',mode:0o600});};
// One process per budget ledger. A persistent lock prevents concurrent spending.
// Crash leaves reservations charged; do not delete a stale lock until PID checked.
const openBudget = (directory,{dollars,maxRequests=100,maxInputTokens=1000000,maxOutputTokens=1000000,maxElapsedMs=1800000}) => {
  if (!(dollars>0) || dollars>25) throw new Error('invalid-explicit-budget');
  const filename=path.join(directory,'budget.jsonl'), lock=filename+'.lock';
  const fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);
  const records=fs.existsSync(filename)?fs.readFileSync(filename,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];
  const reservations=new Map(),started=Date.now();
  for(const record of records) {
    if(record.type==='reserve') reservations.set(record.id,record);
    else if(record.type==='settle'&&reservations.has(record.id)) reservations.set(record.id,{...reservations.get(record.id),...record});
    else throw new Error('invalid-budget-ledger');
  }
  const summary = () => ({ dollars:[...reservations.values()].reduce((n,r)=>n+r.dollars,0),requests:reservations.size,inputTokens:[...reservations.values()].reduce((n,r)=>n+r.inputTokens,0),outputTokens:[...reservations.values()].reduce((n,r)=>n+r.outputTokens,0),unsettled:[...reservations.values()].filter(r=>r.type==='reserve').length });
  const append = record => { fs.appendFileSync(filename,JSON.stringify(record)+'\n',{mode:0o600});reservations.set(record.id,record); };
  return { reserve:claim => {
    const total=summary();
    if(Date.now()-started>maxElapsedMs || total.dollars+claim.dollars>dollars || total.requests+1>maxRequests || total.inputTokens+claim.inputTokens>maxInputTokens || total.outputTokens+claim.outputTokens>maxOutputTokens) throw new Error('semantic-budget-exhausted');
    const id=core.hash([process.pid,Date.now(),reservations.size]);append({type:'reserve',id,...claim});return id;
  },settle:(id,actual)=>{
    const claim=reservations.get(id);
    if(!claim||claim.type!=='reserve'||actual.dollars>claim.dollars||actual.inputTokens>claim.inputTokens||actual.outputTokens>claim.outputTokens) throw new Error('semantic-budget-accounting-mismatch');
    append({type:'settle',id,...actual});
  },summary,close:()=>fs.unlinkSync(lock) };
};
const openCache = directory => {
  const filename=path.join(directory,'pair-cache.jsonl'),entries=new Map();
  if(fs.existsSync(filename))for(const line of fs.readFileSync(filename,'utf8').trim().split('\n').filter(Boolean)){const e=JSON.parse(line);entries.set(e.key,e.value);}
  return {get:key=>entries.get(key),set:(key,value)=>{fs.appendFileSync(filename,JSON.stringify({key,value})+'\n',{mode:0o600});entries.set(key,value);},size:()=>entries.size};
};
module.exports={privateDirectory,readSnapshot,fixtureRow,writeExclusive,openBudget,openCache};

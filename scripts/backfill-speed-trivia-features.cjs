#!/usr/bin/env node
// Derived metadata only. Does NOT certify old rows unique or approve/retire them.
const fs=require('node:fs');
const path=require('node:path');
const core=require('../lib/speed-trivia-uniqueness/core.cjs');
const {readerFor,rpc}=require('../lib/speed-trivia-uniqueness/runtime.cjs');
const run=async({client,output,apply=false})=>{
 if(!output||!path.resolve(output).startsWith(path.resolve('tmp/speed-trivia-uniqueness-private')+path.sep))throw new Error('private-output-directory-required');
 const corpus=await core.loadCorpus(readerFor(client));
 fs.mkdirSync(output,{recursive:true,mode:0o700});
 const checkpoint=path.join(output,'feature-checkpoint.json');
 let progress={corpusDigest:corpus.digest,revision:corpus.revision,extractorVersion:core.EXTRACTOR_VERSION,next:0};
 if(fs.existsSync(checkpoint)){
  const old=JSON.parse(fs.readFileSync(checkpoint,'utf8'));
  if(old.corpusDigest!==progress.corpusDigest||old.revision!==progress.revision||old.extractorVersion!==progress.extractorVersion)throw new Error('backfill-checkpoint-drift');
  progress=old;
 }
 if(!apply)return {mode:'dry-run',rows:corpus.rows.length,requests:Math.ceil(corpus.rows.length/500),alreadyProcessed:progress.next,paidCalls:0,revision:corpus.revision};
 for(let start=progress.next;start<corpus.rows.length;start+=500){
  const rows=corpus.rows.slice(start,start+500).map(row=>{const derived=core.derive(row);return {id:row.id,contentHash:derived.contentHash,extractorVersion:derived.extractorVersion,derived};});
  const saved=await rpc(client,'speed_trivia_backfill_features',{p_rows:rows,p_revision:corpus.revision});
  if(saved!==rows.length)throw new Error('backfill-count-mismatch');
  progress.next=start+rows.length;
  fs.writeFileSync(checkpoint+'.next',JSON.stringify(progress),{mode:0o600});fs.renameSync(checkpoint+'.next',checkpoint);
 }
 return {mode:'applied-derived-metadata-only',rows:progress.next,paidCalls:0,revision:corpus.revision};
};
const main=async argv=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('missing-Supabase-credentials');
 const output=argv[argv.indexOf('--output')+1];const {createClient}=require('@supabase/supabase-js');
 return run({client:createClient(url,key,{auth:{persistSession:false}}),output,apply:argv.includes('--apply')});
};
if(require.main===module)main(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={run,main};

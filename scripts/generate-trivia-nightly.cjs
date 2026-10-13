#!/usr/bin/env node
const {createClient}=require('@supabase/supabase-js');
const {runGeneration}=require('../lib/speed-trivia-uniqueness/generation.cjs');
const parseArgs=argv=>{
 const args={};const names={'--total':'total','--count':'total','--batch-size':'batchSize','--category':'category','--model':'model','--new-only-dir':'outputDir'};
 for(let i=0;i<argv.length;i++){
  if(names[argv[i]]){const key=names[argv[i]];args[key]=['total','batchSize'].includes(key)?Number(argv[++i]):argv[++i];}
  else if(argv[i]==='--allow-category-errors')args.allowCategoryErrors=true;
  else if(argv[i]==='--dry-run')args.dryRun=true;
  else if(argv[i]==='--dir')i++; // Local exports no longer decide inventory or receive edits.
  else if(argv[i]==='--new-categories'){if(Number(argv[++i])!==0)throw new Error('Choose existing database categories; new category invention is disabled.');}
  else if(argv[i]!=='--allow-partial')throw new Error('unknown-generation-option');
 }
 return args;
};
const main=async argv=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Missing Supabase credentials; generation cannot use an empty corpus.');
 return runGeneration({...parseArgs(argv),client:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})});
};
const reportFailure=e=>{console.error(e.message);if(!e.report)console.error(JSON.stringify({generated:0,admitted:0,fatal:e.code||'configuration_failure'}));process.exitCode=1;};
if(require.main===module)main(process.argv.slice(2)).catch(reportFailure);
module.exports={main,parseArgs,reportFailure};

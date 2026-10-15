#!/usr/bin/env node
// Phase 3: aggregate references and index prerequisites only; never export players.
const fs = require('node:fs');
const path = require('node:path');
const core = require('../lib/speed-trivia-uniqueness/core.cjs');
const { verifyBackup } = require('./audit-speed-trivia-inventory.cjs');
const { writeExclusive } = require('./speed-trivia-phase2-support.cjs');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const catalogSQL = `select c.conname as name,n.nspname as schema,t.relname as table,
 a.attname as column,b.attname as target,cardinality(c.conkey) as width,
 pg_get_constraintdef(c.oid) as definition,
 exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid
 and i.indisready and i.indpred is null and i.indkey[0]=a.attnum) as index_ready
 from pg_constraint c join pg_class t on t.oid=c.conrelid
 join pg_namespace n on n.oid=t.relnamespace
 join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
 join pg_attribute b on b.attrelid=c.confrelid and b.attnum=c.confkey[1]
 where c.contype='f' and c.confrelid='public.trivia_questions'::regclass order by c.conname`;
const referenceSQL = schema => {
 if (!schema.length || schema.some(ref => Number(ref.width) !== 1)) throw new Error('unsupported-reference-schema');
 // One bounded inventory cohort per run, one aggregate join per FK, never per row.
 return `with speed as materialized (select id,slug from public.trivia_questions
 where question_pool='anytime_blitz' and answer_format='multiple_choice')\n` + schema.map(ref =>
 `select ${literal(ref.name)}::text as name,coalesce(jsonb_object_agg(id::text,n),'{}'::jsonb) as counts
 from (select q.id,count(r.${quote(ref.column)}) as n from speed q
 left join ${quote(ref.schema)}.${quote(ref.table)} r on r.${quote(ref.column)}=q.${quote(ref.target)} group by q.id) g`
 ).join('\nunion all\n');
};
const revisionSQL = `select (select revision::text from public.speed_trivia_control where singleton) as revision,
 (select md5(string_agg(to_jsonb(q)::text, E'\\n' order by q.id)) from public.trivia_questions q
 where question_pool='anytime_blitz' and answer_format='multiple_choice') as state_digest`;
const main = async directory => {
 process.umask(0o077);
 const backup = verifyBackup(directory), requests = [];
 if (backup.project !== 'pkmxupsayzshvpirkaav' || !process.env.SUPABASE_ACCESS_TOKEN) throw new Error('missing-reference-configuration');
 const output=path.join(directory,'audit-references-'+new Date().toISOString().replace(/[:.]/g,'-'));
 fs.mkdirSync(output,{mode:0o700});
 const query = async (name, sql) => {
  writeExclusive(path.join(output,name+'-query.json'),{query:sql});
  const response = await fetch('https://api.supabase.com/v1/projects/pkmxupsayzshvpirkaav/database/query/read-only',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),
   headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:sql})
  });
  const bytes=await response.text(), data=JSON.parse(bytes);
  requests.push({name,receivedBytes:Buffer.byteLength(bytes)});
  writeExclusive(path.join(output,name+'.json'),data);
  if (!response.ok) throw new Error('read-only-reference-http-'+response.status);
  return data;
 };
 const before=(await query('audit-revision-before',revisionSQL))[0];
 if (before.state_digest !== backup.corpusRevision) throw new Error('snapshot-drift-before-references');
 const catalog=await query('audit-reference-catalog',catalogSQL);
 const expected=JSON.parse(fs.readFileSync(path.join(directory,'schema.json')))[0].schema.references;
 if(catalog.length!==expected.length||catalog.some(ref=>!expected.some(old=>old.name===ref.name&&old.definition===ref.definition))) throw new Error('snapshot-reference-schema-drift');
 const records=await query('audit-reference-counts',referenceSQL(catalog));
 const after=(await query('audit-revision-after',revisionSQL))[0];
 if (after.state_digest!==before.state_digest || after.revision!==before.revision) throw new Error('snapshot-drift-after-references');
 const references={schema:catalog.map(({index_ready,width,...ref})=>ref),counts:Object.fromEntries(records.map(record=>[record.name,record.counts]))};
 const rows=JSON.parse(fs.readFileSync(path.join(directory,'speed-questions.json'))),ids=new Set(rows.map(row=>row.id));
 for(const counts of Object.values(references.counts)) if(Object.keys(counts).length!==rows.length||Object.entries(counts).some(([id,n])=>!ids.has(id)||!Number.isSafeInteger(Number(n))||Number(n)<0)) throw new Error('incomplete-reference-counts');
 writeExclusive(path.join(output,'audit-references.json'),references);
 const report={output,capturedAt:new Date().toISOString(),revision:before.revision,rows:rows.length,
  referenceConstraints:catalog.length,indexReady:catalog.every(ref=>ref.index_ready),missingIndexes:catalog.filter(ref=>!ref.index_ready).map(ref=>({name:ref.name,table:ref.table,column:ref.column})),
  counts:records.map(record=>({name:record.name,totalSpeedReferences:Object.values(record.counts).reduce((n,c)=>n+Number(c),0)})),requests,receivedBytes:requests.reduce((n,r)=>n+r.receivedBytes,0),paidRequests:0,mutations:0,playerRecordsExported:0};
 writeExclusive(path.join(output,'audit-reference-report.json'),report);return report;
};
module.exports={catalogSQL,referenceSQL,revisionSQL,main};
if(require.main===module)main(process.argv[2]).then(report=>console.log(JSON.stringify(report))).catch(error=>{console.error(error.message);process.exitCode=1;});

#!/usr/bin/env node
// Supplement the immutable snapshot with aggregate dependencies and SQL writer evidence.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const main = async () => {
  process.umask(0o077);
  const directory = process.argv[2];
  const manifest = JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
  if (!manifest.completed || manifest.project !== 'pkmxupsayzshvpirkaav') throw new Error('invalid-inventory');
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('missing-access-token');
  const query = `with speed as materialized (
    select id,slug,status from public.trivia_questions where question_pool='anytime_blitz' and answer_format='multiple_choice'
  ), refs as (
    select q.id,'trivia_answers'::text as reference,count(*) as records from speed q join public.trivia_answers r on r.question_id=q.id group by q.id
    union all select q.id,'answer_variants',count(*) from speed q join public.answer_variants r on r.question_id=q.id group by q.id
    union all select q.id,'trivia_session_questions',count(*) from speed q join public.trivia_session_questions r on r.question_id=q.slug group by q.id
    union all select q.id,'live_showdown_answers',count(*) from speed q join public.live_showdown_answers r on r.question_id=q.slug group by q.id
    union all select q.id,'venue_seen_questions',count(*) from speed q join public.venue_seen_questions r on r.question_id=q.slug group by q.id
    union all select q.id,'user_seen_questions',count(*) from speed q join public.user_seen_questions r on r.question_id in (q.id::text,q.slug) group by q.id
  ) select jsonb_build_object(
    'captured_at',statement_timestamp(),
    'per_question_counts',(select coalesce(jsonb_agg(to_jsonb(refs) order by id,reference),'[]'::jsonb) from refs),
    'user_seen_aggregates',(select jsonb_build_object('total_records',count(*),'speed_records',count(*) filter(where q.id is not null)) from public.user_seen_questions r left join speed q on r.question_id in (q.id::text,q.slug)),
    'pool_format_counts',(select jsonb_agg(to_jsonb(g)) from (select question_pool,answer_format,status,count(*) as count from public.trivia_questions group by question_pool,answer_format,status) g),
    'extensions',(select jsonb_agg(jsonb_build_object('name',e.extname,'schema',n.nspname)) from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace),
    'sql_writer_functions',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'security_definer',p.prosecdef,'definition',pg_catalog.pg_get_functiondef(p.oid))),'[]'::jsonb) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname not in ('pg_catalog','information_schema') and p.prosrc ~* '(insert\\s+into|update|delete\\s+from)\\s+(public\\.)?trivia_questions'),
    'defaults',(select jsonb_agg(jsonb_build_object('column',c.column_name,'default',c.column_default)) from information_schema.columns c where c.table_schema='public' and c.table_name='trivia_questions')
  ) as evidence`;
  const response = await fetch(`https://api.supabase.com/v1/projects/${manifest.project}/database/query/read-only`,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query}),
  });
  if (!response.ok) throw new Error('dependency-query-http-'+response.status);
  const raw=await response.text(), result=JSON.parse(raw);
  if (!Array.isArray(result)||result.length!==1||!result[0].evidence) throw new Error('invalid-dependencies');
  const file=path.join(directory,'dependencies.json');fs.writeFileSync(file,raw+'\n',{mode:0o600,flag:'wx'});
  fs.writeFileSync(path.join(directory,'dependencies.sha256'),crypto.createHash('sha256').update(raw+'\n').digest('hex')+'  dependencies.json\n',{mode:0o600,flag:'wx'});
  fs.writeFileSync(path.join(directory,'dependencies-query.sql'),query+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({questionReferenceGroups:result[0].evidence.per_question_counts.length,userSeen:result[0].evidence.user_seen_aggregates,sqlWriterFunctions:result[0].evidence.sql_writer_functions.map(f=>f.name),bytes:Buffer.byteLength(raw)}));
};
main().catch(()=>{console.error('Dependency capture incomplete. No production writes attempted.');process.exitCode=1;});

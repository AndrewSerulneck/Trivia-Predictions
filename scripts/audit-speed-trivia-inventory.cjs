#!/usr/bin/env node
/* Phase 1 only: no content writes, generation, workflow dispatch, or player export.
 * node --env-file=.env.local scripts/audit-speed-trivia-inventory.cjs
 * The database endpoint executes as supabase_read_only_user. A single MVCC SELECT
 * returns ordered 250-row pages and independent count/digest evidence. This avoids
 * offset drift, PostgREST's 1,000-row cap, and a full scan for each page.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const PROJECT = 'pkmxupsayzshvpirkaav';
const PAGE_SIZE = 250;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const validatePages = packets => {
  if (!Array.isArray(packets) || packets.length === 0) throw new Error('missing-pages');
  const rows = [], ids = new Set();
  const expected = Number(packets[0].total_count);
  if (!Number.isSafeInteger(expected) || expected <= 0) throw new Error('invalid-corpus-count');
  const expectedPages = Math.ceil(expected / PAGE_SIZE);
  if (packets.length !== expectedPages) throw new Error('truncated-pages');
  for (let index = 0; index < packets.length; index++) {
    const packet = packets[index];
    if (Number(packet.page) !== index || Number(packet.total_count) !== expected || !Array.isArray(packet.rows)) throw new Error('invalid-page-schema');
    if (packet.rows.length !== Math.min(PAGE_SIZE, expected - rows.length)) throw new Error('truncated-page');
    for (const row of packet.rows) {
      if (typeof row.id !== 'string' || ids.has(row.id) || (rows.length && rows.at(-1).id >= row.id)) throw new Error('unordered-or-duplicate-id');
      if (row.question_pool !== 'anytime_blitz' || row.answer_format !== 'multiple_choice') throw new Error('mixed-pool');
      ids.add(row.id); rows.push(row);
    }
  }
  if (rows.length !== expected) throw new Error('count-mismatch');
  const idDigest = crypto.createHash('md5').update(rows.map(row => row.id).join(',')).digest('hex');
  if (packets.some(packet => packet.id_digest !== idDigest || packet.corpus_revision !== packets[0].corpus_revision)) throw new Error('revision-mismatch');
  return rows;
};

const SNAPSHOT_SQL = `with corpus as materialized (
  select q.*, row_number() over (order by q.id) as audit_row_number
  from public.trivia_questions q
  where q.question_pool = 'anytime_blitz' and q.answer_format = 'multiple_choice'
), evidence as (
  select count(*) as total_count, md5(string_agg(id::text, ',' order by id)) as id_digest,
    md5(string_agg((to_jsonb(corpus) - 'audit_row_number')::text, '\n' order by id)) as corpus_revision
  from corpus
)
select ((audit_row_number - 1) / ${PAGE_SIZE})::integer as page,
  jsonb_agg(to_jsonb(corpus) - 'audit_row_number' order by id) as rows,
  evidence.total_count, evidence.id_digest, evidence.corpus_revision,
  statement_timestamp() as snapshot_at, pg_catalog.txid_current_snapshot()::text as mvcc_snapshot
from corpus cross join evidence
group by page, evidence.total_count, evidence.id_digest, evidence.corpus_revision
order by page`;

const SCHEMA_SQL = `select jsonb_build_object(
 'columns', (select jsonb_agg(to_jsonb(c) order by c.ordinal_position) from information_schema.columns c where c.table_schema='public' and c.table_name='trivia_questions'),
 'constraints', (select jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_catalog.pg_get_constraintdef(c.oid),'type',c.contype)) from pg_catalog.pg_constraint c where c.conrelid='public.trivia_questions'::regclass),
 'indexes', (select jsonb_agg(to_jsonb(i)) from pg_catalog.pg_indexes i where i.schemaname='public' and i.tablename='trivia_questions'),
 'triggers', (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_catalog.pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',pg_catalog.pg_get_functiondef(t.tgfoid))) from pg_catalog.pg_trigger t where t.tgrelid='public.trivia_questions'::regclass and not t.tgisinternal),
 'rls', (select jsonb_build_object('enabled',c.relrowsecurity,'forced',c.relforcerowsecurity) from pg_catalog.pg_class c where c.oid='public.trivia_questions'::regclass),
 'policies', (select jsonb_agg(to_jsonb(p)) from pg_catalog.pg_policies p where p.schemaname='public' and p.tablename='trivia_questions'),
 'grants', (select jsonb_agg(to_jsonb(g)) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name='trivia_questions'),
 'effective_role_privileges', (select jsonb_agg(jsonb_build_object('role',r.rolname,'bypassrls',r.rolbypassrls,'select',pg_catalog.has_table_privilege(r.rolname,'public.trivia_questions','select'),'insert',pg_catalog.has_table_privilege(r.rolname,'public.trivia_questions','insert'),'update',pg_catalog.has_table_privilege(r.rolname,'public.trivia_questions','update'),'delete',pg_catalog.has_table_privilege(r.rolname,'public.trivia_questions','delete'))) from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated','service_role')),
 'references', (select jsonb_agg(jsonb_build_object('name',c.conname,'table_schema',n.nspname,'table',t.relname,'column',a.attname,'target_column',b.attname,'definition',pg_catalog.pg_get_constraintdef(c.oid))) from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid join pg_catalog.pg_namespace n on n.oid=t.relnamespace join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] join pg_catalog.pg_attribute b on b.attrelid=c.confrelid and b.attnum=c.confkey[1] where c.confrelid='public.trivia_questions'::regclass and c.contype='f'),
 'related_columns', (select jsonb_agg(jsonb_build_object('schema',c.table_schema,'table',c.table_name,'column',c.column_name,'type',c.data_type)) from information_schema.columns c where c.table_schema='public' and c.column_name ~ '(question|trivia)' and c.table_name <> 'trivia_questions'),
 'related_functions', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'identity',pg_catalog.pg_get_function_identity_arguments(p.oid),'security_definer',p.prosecdef,'acl',p.proacl,'definition',pg_catalog.pg_get_functiondef(p.oid))) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prosrc ilike '%trivia_questions%'),
 'installed_migrations', (select jsonb_agg(jsonb_build_object('version',m.version,'name',m.name) order by m.version) from supabase_migrations.schema_migrations m)
) as schema`;

const quoteIdentifier = value => '"' + value.replaceAll('"', '""') + '"';
const referenceSQL = references => {
  if (!references?.length) throw new Error('missing-reference-schema');
  // Identifiers come from PostgreSQL's catalogs, never command-line SQL.
  const queries = references.map(ref => `select '${ref.name.replaceAll("'", "''")}'::text as reference,
    count(*) as total_records, count(*) filter (where q.id is not null) as speed_records,
    count(*) filter (where q.status='active') as active_records,
    count(*) filter (where q.status='pending_review') as pending_records,
    count(*) filter (where q.status='deleted') as deleted_records
    from ${quoteIdentifier(ref.table_schema)}.${quoteIdentifier(ref.table)} r
    left join public.trivia_questions q on r.${quoteIdentifier(ref.column)} = q.${quoteIdentifier(ref.target_column)}
    and q.question_pool='anytime_blitz' and q.answer_format='multiple_choice'`);
  return queries.join('\nunion all\n');
};

const verifyBackup = directory => {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
  const body = fs.readFileSync(path.join(directory,'manifest.json'));
  const expectedManifest = fs.readFileSync(path.join(directory,'manifest.sha256'),'utf8').split(' ')[0];
  if (!manifest.completed || sha256(body) !== expectedManifest) throw new Error('invalid-backup-manifest');
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(directory,file.name));
    if (sha256(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error('backup-file-integrity-failed');
  }
  const rows = validatePages(JSON.parse(fs.readFileSync(path.join(directory,'snapshot-pages.json'))));
  if (manifest.rowCount !== rows.length || manifest.pages !== Math.ceil(rows.length/PAGE_SIZE)) throw new Error('backup-count-integrity-failed');
  if (JSON.stringify(rows) !== JSON.stringify(JSON.parse(fs.readFileSync(path.join(directory,'speed-questions.json'))))) throw new Error('backup-row-integrity-failed');
  return { completed:true, project:manifest.project, rows:rows.length, pages:manifest.pages, verifiedFiles:manifest.files.length, corpusRevision:manifest.corpusRevision };
};

const main = async () => {
  process.umask(0o077);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!url || new URL(url).hostname !== `${PROJECT}.supabase.co` || fs.readFileSync('supabase/.temp/project-ref','utf8').trim() !== PROJECT) throw new Error('project-mismatch');
  if (!token) throw new Error('missing-SUPABASE_ACCESS_TOKEN');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const output = path.resolve('tmp/speed-trivia-uniqueness-private', runId);
  execFileSync('git', ['check-ignore', '--quiet', output + '/snapshot.json']);
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const manifest = { runId, project: PROJECT, mode: 'supabase_read_only_user; SELECT-only', completed: false, files: [], requests: [], mutations: 0, playerRecordsExported: 0 };
  const save = (name, value) => {
    const body = JSON.stringify(value, null, 2) + '\n';
    fs.writeFileSync(path.join(output, name), body, { mode: 0o600, flag: 'wx' });
    manifest.files.push({ name, bytes: Buffer.byteLength(body), sha256: sha256(body) });
  };
  const query = async (name, sql) => {
    if (!/^(select|with)\b/i.test(sql.trim()) || /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke)\b/i.test(sql.replace(/'[^']*'/g,''))) throw new Error('non-read-only-sql');
    const request = { name, querySha256: sha256(sql), startedAt: new Date().toISOString() }; manifest.requests.push(request);
    save(name + '.sql.json', { query: sql });
    const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query/read-only`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
    });
    request.status = response.status;
    const raw = await response.text(); request.bytes = Buffer.byteLength(raw); request.finishedAt = new Date().toISOString();
    if (!response.ok) throw new Error(`read-only-http-${response.status}-${name}`);
    const data = JSON.parse(raw); if (!Array.isArray(data)) throw new Error('invalid-query-response');
    save(name + '.json', data); return data;
  };
  try {
    const schemaRows = await query('schema', SCHEMA_SQL);
    if (schemaRows.length !== 1 || !schemaRows[0].schema?.columns) throw new Error('invalid-schema');
    const schema = schemaRows[0].schema;
    const packets = await query('snapshot-pages', SNAPSHOT_SQL);
    const rows = validatePages(packets);
    save('speed-questions.json', rows);
    manifest.corpusRevision = packets[0].corpus_revision;
    manifest.snapshotAt = packets[0].snapshot_at;
    manifest.mvccSnapshot = packets[0].mvcc_snapshot;
    manifest.rowCount = rows.length; manifest.pages = packets.length;
    await query('reference-counts', referenceSQL(schema.references));
    // Aggregates only; no question/user/session arrays from player tables.
    const verify = await query('revision-after', `select count(*) as total_count, md5(string_agg(to_jsonb(q)::text, '\n' order by q.id)) as corpus_revision from public.trivia_questions q where q.question_pool='anytime_blitz' and q.answer_format='multiple_choice'`);
    if (verify.length !== 1 || Number(verify[0].total_count) !== rows.length || verify[0].corpus_revision !== manifest.corpusRevision) throw new Error('corpus-drift-after-snapshot');
    manifest.completed = true;
  } catch (error) {
    manifest.failure = /^read-only-http-|^(invalid|missing|project|count|truncated|mixed|unordered|revision|corpus|non-read)/.test(error.message) ? error.message : 'capture-failed';
    throw error;
  } finally {
    const body = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(path.join(output,'manifest.json'), body, {mode:0o600,flag:'wx'});
    fs.writeFileSync(path.join(output,'manifest.sha256'), sha256(body) + '  manifest.json\n', {mode:0o600,flag:'wx'});
    console.log(JSON.stringify({ output, completed: manifest.completed, rows: manifest.rowCount, pages: manifest.pages, bytes: manifest.requests.reduce((sum,r)=>sum+(r.bytes||0),0), failure: manifest.failure }));
  }
};
module.exports = { validatePages, SNAPSHOT_SQL, SCHEMA_SQL, referenceSQL, PAGE_SIZE, verifyBackup };
if (require.main === module) {
  if (process.argv[2] === '--verify') {
    try { console.log(JSON.stringify(verifyBackup(process.argv[3]))); }
    catch { console.error('Private backup verification failed.'); process.exitCode=1; }
  } else main().catch(() => { console.error('Inventory incomplete; inspect private manifest. No production writes attempted.'); process.exitCode=1; });
}

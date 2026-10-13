#!/usr/bin/env node
// Real simultaneous PostgreSQL sessions, LOCAL ephemeral cluster only.
// Requires ignored tmp/speed-trivia-postgres (see Phase 3 handoff).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {setup,call,checked,row}=require('./test-speed-trivia-admission-sql.cjs');
const run=async()=>{
 const moduleRoot=path.resolve(process.env.SPEED_TRIVIA_POSTGRES_MODULE||'tmp/speed-trivia-postgres/node_modules');
 const {default:EmbeddedPostgres}=await import(pathToFileURL(path.join(moduleRoot,'embedded-postgres/dist/index.js')).href);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'speed-trivia-concurrency-'));
 const server=new EmbeddedPostgres({databaseDir:directory,user:'postgres',password:'isolated-test-only',port:55483,persistent:false,onLog:()=>{},onError:()=>{}});
 let owner,a,b;
 try{
  await server.initialise();await server.start();
  owner=server.getPgClient();await owner.connect();
  const wrapper={exec:sql=>owner.query(sql),query: (...args)=>owner.query(...args)};
  await setup(wrapper);await owner.query('reset role');
  a=server.getPgClient();b=server.getPgClient();await Promise.all([a.connect(),b.connect()]);
  await Promise.all([a.query('set role service_role'),b.query('set role service_role')]);
  const revision=(await call(a,'speed_trivia_inventory')).revision;
  const candidateA=row('30000000-0000-4000-8000-000000000001','What stellar remnant is a pulsar?','Neutron star');
  const candidateB=row('30000000-0000-4000-8000-000000000002','Pulsars are rapidly spinning examples of what?','Neutron star');
  await a.query('begin');await b.query('begin');
  await call(a,'admit_speed_trivia',checked(candidateA,revision));
  let completed=false;
  const second=call(b,'admit_speed_trivia',checked(candidateB,revision)).then(value=>{completed=true;return {value};},error=>{completed=true;return {error};});
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(completed,false,'second session must wait while first holds shared corpus lock');
  const locks=await owner.query("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock'");
  assert(locks.rows[0].n>=1,'PostgreSQL must report real lock waiting');
  await a.query('commit');
  const outcome=await second;assert.match(outcome.error?.message||'',/stale-speed-revision/);await b.query('rollback');
  const count=await owner.query("select count(*)::int n from trivia_questions where id=any($1::uuid[])",[[candidateA.id,candidateB.id]]);
  assert.equal(count.rows[0].n,1);
  // A direct retirement also waits on the SAME revision lock.
  await a.query('begin');await a.query("update trivia_questions set status='deleted' where slug='gobi'");
  const current=(await owner.query('select revision::text from speed_trivia_control')).rows[0].revision;
  let thirdCompleted=false;
  const third=call(b,'admit_speed_trivia',checked(row('30000000-0000-4000-8000-000000000003','Which structure stores flower pollen?','Anther'),current)).then(value=>{thirdCompleted=true;return {value};},error=>{thirdCompleted=true;return {error};});
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(thirdCompleted,false);
  await a.query('commit');assert.match((await third).error?.message||'',/stale-speed-revision/);
  console.log('Real PostgreSQL concurrency: 7 checks passed; competing admission and direct retirement wait on the same lock, then reject stale evidence.');
 }finally{
  await Promise.allSettled([owner,a,b].filter(Boolean).map(c=>c.end()));
  await server.stop();
 }
};
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={run};

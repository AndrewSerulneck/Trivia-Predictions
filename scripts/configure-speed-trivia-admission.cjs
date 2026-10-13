#!/usr/bin/env node
// DBA setup only, after the separately confirmed production migration.
// Secret travels as a bind parameter, never SQL text, CLI arguments or output.
const PROJECT = 'pkmxupsayzshvpirkaav';
const configure = async ({ token, secret, apply = false, transport = fetch }) => {
  if (!token) throw new Error('missing-management-token');
  if (apply && (typeof secret !== 'string' || secret.length < 32)) throw new Error('missing-admission-secret');
  const query = async (sql, parameters = [], readOnly = true) => {
    const response = await transport(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, parameters, read_only: readOnly }),
    });
    if (!response.ok) throw new Error(`management-http-${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('invalid-management-result');
    return rows;
  };
  const [state] = await query(`select current_user as executor,
    (select rolbypassrls or rolsuper from pg_catalog.pg_roles where rolname=$1) as bypass_rls,
    to_regclass('public.speed_trivia_control') is not null as schema_present`, ['postgres']);
  if (!state || typeof state.schema_present !== 'boolean' || typeof state.bypass_rls !== 'boolean') throw new Error('invalid-readiness-result');
  if (!apply) return { mode: 'dry-run', ...state, mutations: 0 };
  if (!state.schema_present || !state.bypass_rls) throw new Error('DBA-prerequisites-missing');
  // Idempotent for this key. Refuse replacement of an existing different key.
  const rows = await query(`update public.speed_trivia_control set admission_secret=$1
    where singleton and (admission_secret is null or admission_secret=$1)
    returning true as configured`, [secret], false);
  if (rows.length !== 1 || rows[0].configured !== true) throw new Error('existing-key-or-control-state-conflict');
  return { mode: 'configured', executor: state.executor, configured: true };
};
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--apply', '--check'].includes(arg))) {
    console.error('Use --check (read-only default) or --apply after production confirmation.'); process.exitCode = 1;
  } else configure({ token: process.env.SUPABASE_ACCESS_TOKEN, secret: process.env.SPEED_TRIVIA_ADMISSION_SECRET, apply: args.includes('--apply') })
    .then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('Admission key setup did not verify. No credentials or upstream responses were printed.'); process.exitCode = 1; });
}
module.exports = { configure };

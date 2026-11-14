// Backfill log for venues.display_code (docs/live-trivia-pregame-and-display-cleanup-plan.md, Phase 4).
//
// READ-ONLY: selects venues and writes a JSON log; never writes the database.
//   node --env-file=.env.local scripts/display-code-backfill-log.mjs preview   # before `supabase db push`
//   node --env-file=.env.local scripts/display-code-backfill-log.mjs applied   # after it
// Output: docs/live-trivia-pregame-and-display-cleanup-plan_PHASE_4_BACKFILL_LOG_<YYYY-MM-DD>[_applied].json
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2] === "applied" ? "applied" : "preview";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase URL or service role key (run with --env-file=.env.local).");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const probe = await supabase.from("venues").select("display_code").limit(1);
const columnExists = !probe.error;
const columns = columnExists ? "id, name, display_code" : "id, name";
const { data, error } = await supabase.from("venues").select(columns).order("id");
if (error) {
  console.error(error.message);
  process.exit(1);
}

const rows = data ?? [];
const capturedAt = new Date().toISOString();
const log = {
  mode,
  capturedAt,
  columnExists,
  totalRows: rows.length,
  withCode: rows.filter((r) => r.display_code).length,
  undo: "alter table public.venues drop column display_code; (plus the trigger and functions, see the migration header)",
  changes: rows.map((r) => ({ id: r.id, name: r.name, display_code: r.display_code ?? null })),
};

const date = capturedAt.slice(0, 10);
const out = `docs/live-trivia-pregame-and-display-cleanup-plan_PHASE_4_BACKFILL_LOG_${date}${mode === "applied" ? "_applied" : ""}.json`;
writeFileSync(out, `${JSON.stringify(log, null, 2)}\n`);
console.log(`${mode}: ${rows.length} venues, column ${columnExists ? "exists" : "missing"}, ${log.withCode} with a code → ${out}`);

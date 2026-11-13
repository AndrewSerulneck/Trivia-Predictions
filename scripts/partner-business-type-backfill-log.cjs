#!/usr/bin/env node
/**
 * Partner business type — Phase 1 backfill undo log.
 * docs/partner-business-type-plan.md §3.
 *
 * READ ONLY. Lists every `venue_owners` row the migration's backfill
 * (`update venue_owners set business_type = 'bar_restaurant' where business_type is null`)
 * will change — id, name, email, current value — and writes it as JSON. Run it
 * right BEFORE `supabase db push`; that file is the undo log.
 *
 * Works before and after the migration: if the column does not exist yet, every
 * row's current value is reported as null (which is what the backfill sees).
 * After the push, re-run with `--after` to confirm no NULL rows remain.
 *
 * Run: node --env-file=.env.local scripts/partner-business-type-backfill-log.cjs [--after] [--out <file>]
 */
const fs = require("node:fs");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local.");
  process.exit(1);
}

const args = process.argv.slice(2);
const after = args.includes("--after");
const outIndex = args.indexOf("--out");
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const PAGE = 1000;

async function readAll(columns) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("venue_owners")
      .select(columns)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows: null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return { rows, error: null };
  }
}

async function main() {
  let columnExists = true;
  let { rows, error } = await readAll("id, name, email, created_at, business_type");
  if (error && (error.code === "42703" || /business_type/.test(error.message || ""))) {
    columnExists = false;
    ({ rows, error } = await readAll("id, name, email, created_at"));
  }
  if (error) {
    console.error("venue_owners read failed:", error.message);
    process.exit(1);
  }

  const withValue = rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    created_at: row.created_at,
    business_type: columnExists ? row.business_type ?? null : null,
  }));
  const willChange = withValue.filter((row) => row.business_type === null);
  const counts = withValue.reduce((acc, row) => {
    const key = row.business_type ?? "null";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const report = {
    mode: after ? "after" : "preview",
    capturedAt: new Date().toISOString(),
    columnExists,
    totalRows: withValue.length,
    counts,
    ...(after
      ? { nullRows: willChange }
      : {
          backfillTo: "bar_restaurant",
          undo: "update public.venue_owners set business_type = null where id in (<changes[].id>);",
          changes: willChange.map(({ id, name, email, business_type }) => ({ id, name, email, business_type })),
        }),
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outFile) {
    fs.writeFileSync(outFile, json);
    console.log(`Wrote ${outFile}: ${withValue.length} rows, ${willChange.length} with business_type NULL.`);
  } else {
    process.stdout.write(json);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

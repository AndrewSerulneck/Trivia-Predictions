import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Phase 1 of docs/supabase-data-api-grants-plan.md.
//
// From 2026-10-30, Supabase stops auto-granting anon/authenticated/service_role on any NEW
// public table, view, materialized view or sequence (discussion #45329). Our server code
// (lib/supabaseAdmin.ts) reaches every table through service_role, and no migration before
// this plan ever granted it explicitly — it always relied on the automatic grant. This test
// makes it impossible to merge a future migration that creates a public table/view/sequence
// without an explicit service_role grant in the same file, and requires RLS on anything also
// granted to anon/authenticated.
//
// Every migration at or before 20260914010000 is grandfathered — Phase 2 of the plan
// (docs/supabase-data-api-grants-plan.md) backfills their real production grants in one
// generated "catch-up" migration instead of hand-editing 186 files of history.
const GRANDFATHERED_UP_TO = "20260914010000";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");

const MIGRATION_FILENAME = /^(\d{14})_.*\.sql$/;

// ---------------------------------------------------------------------------
// SQL text shaping helpers
// ---------------------------------------------------------------------------

/** Masks $tag$...$tag$ / $$...$$ dollar-quoted bodies so their `;` don't split statements. */
const maskDollarQuoted = (source: string): string =>
  source.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, (match) => match.replace(/[^\n]/g, " "));

/** Strips block and line comments. Run AFTER any raw-text scan that needs the comments. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");

/** Splits a depth-0-comma list, respecting nested parens (e.g. `check (a in (1,2))`). */
const splitTopLevel = (text: string, separator: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
};

/** Strips an optional `public.` schema prefix and surrounding quotes from an object name. */
const bareName = (name: string): string =>
  name
    .trim()
    .replace(/^public\./i, "")
    .replace(/^"|"$/g, "")
    .trim();

// ---------------------------------------------------------------------------
// Statement-level extraction
// ---------------------------------------------------------------------------

interface GrantInfo {
  roles: Set<string>;
}

interface MigrationAnalysis {
  tables: Set<string>;
  views: Set<string>;
  sequences: Set<string>;
  rlsEnabledTables: Set<string>;
  /** object name -> roles granted anything on it */
  grants: Map<string, GrantInfo>;
  /** object name -> reason (from a "no-api-access" escape hatch comment) */
  exemptions: Map<string, string>;
  /** errors found while parsing exemption comments (e.g. missing reason) */
  exemptionErrors: string[];
}

const CREATE_TABLE_RE = /^create\s+table\s+(?:if\s+not\s+exists\s+)?"?(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i;
const CREATE_VIEW_RE =
  /^create\s+(?:or\s+replace\s+)?(materialized\s+)?view\s+"?(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i;
const CREATE_SEQUENCE_RE =
  /^create\s+sequence\s+(?:if\s+not\s+exists\s+)?"?(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i;
const ALTER_TABLE_RLS_RE =
  /^alter\s+table\s+"?(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+enable\s+row\s+level\s+security/i;
const GRANT_RE = /^grant\s+.+?\s+on\s+(?:table\s+|sequence\s+)?(.+?)\s+to\s+(.+)$/i;

const SERIAL_COLUMN_RE = /^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+(bigserial|smallserial|serial)\b/i;

/** Extracts the substring between a statement's first `(` and its matching `)`. */
const columnListBody = (statement: string): string | null => {
  const start = statement.indexOf("(");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < statement.length; i++) {
    if (statement[i] === "(") depth++;
    else if (statement[i] === ")") {
      depth--;
      if (depth === 0) return statement.slice(start + 1, i);
    }
  }
  return null;
};

const analyzeMigrationSql = (rawSource: string): MigrationAnalysis => {
  const analysis: MigrationAnalysis = {
    tables: new Set(),
    views: new Set(),
    sequences: new Set(),
    rlsEnabledTables: new Set(),
    grants: new Map(),
    exemptions: new Map(),
    exemptionErrors: [],
  };

  // Escape-hatch comments are scanned on the RAW text, before comments are stripped.
  const EXEMPTION_LOOSE_RE = /--\s*grants-contract:\s*no-api-access\s+(\S+)(.*)$/gim;
  const EXEMPTION_STRICT_RE = /--\s*grants-contract:\s*no-api-access\s+(\S+)\s*(?:—|-)\s*(\S.*\S|\S)\s*$/i;
  let loose: RegExpExecArray | null;
  while ((loose = EXEMPTION_LOOSE_RE.exec(rawSource)) !== null) {
    const line = loose[0];
    const strict = line.match(EXEMPTION_STRICT_RE);
    const name = bareName(loose[1]);
    if (strict && strict[2] && strict[2].trim().length > 0) {
      analysis.exemptions.set(name, strict[2].trim());
    } else {
      analysis.exemptionErrors.push(
        `exemption for "${name}" is missing a reason (use "-- grants-contract: no-api-access ${loose[1]} — <reason>")`
      );
    }
  }

  const masked = maskDollarQuoted(rawSource);
  const noComments = stripComments(masked);
  const statements = noComments.split(";");

  const recordGrant = (objectList: string, roleList: string) => {
    const roles = new Set(
      roleList
        .split(",")
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean)
    );
    for (const rawObject of splitTopLevel(objectList, ",")) {
      const name = bareName(rawObject);
      if (!name) continue;
      const existing = analysis.grants.get(name) ?? { roles: new Set<string>() };
      for (const role of roles) existing.roles.add(role);
      analysis.grants.set(name, existing);
    }
  };

  for (const rawStatement of statements) {
    const flat = rawStatement.replace(/\s+/g, " ").trim();
    if (!flat) continue;

    const createTable = flat.match(CREATE_TABLE_RE);
    if (createTable) {
      const tableName = createTable[1].toLowerCase();
      analysis.tables.add(tableName);

      const body = columnListBody(flat);
      if (body) {
        for (const columnDef of splitTopLevel(body, ",")) {
          const serial = columnDef.trim().match(SERIAL_COLUMN_RE);
          if (serial) {
            const columnName = serial[1].toLowerCase();
            analysis.sequences.add(`${tableName}_${columnName}_seq`);
          }
        }
      }
      continue;
    }

    const createView = flat.match(CREATE_VIEW_RE);
    if (createView) {
      analysis.views.add(createView[2].toLowerCase());
      continue;
    }

    const createSequence = flat.match(CREATE_SEQUENCE_RE);
    if (createSequence) {
      analysis.sequences.add(createSequence[1].toLowerCase());
      continue;
    }

    const rls = flat.match(ALTER_TABLE_RLS_RE);
    if (rls) {
      analysis.rlsEnabledTables.add(rls[1].toLowerCase());
      continue;
    }

    const grant = flat.match(GRANT_RE);
    if (grant) {
      recordGrant(grant[1], grant[2]);
      continue;
    }
  }

  return analysis;
};

/** Runs the Phase 1 rules against one migration file's SQL; returns human-readable violations. */
const checkMigration = (sql: string): string[] => {
  const a = analyzeMigrationSql(sql);
  const errors: string[] = [...a.exemptionErrors];

  const hasServiceRoleGrant = (name: string): boolean =>
    a.grants.get(name.toLowerCase())?.roles.has("service_role") ?? false;

  const isExempt = (name: string): boolean => a.exemptions.has(name.toLowerCase());

  for (const table of a.tables) {
    if (isExempt(table)) continue;
    if (!hasServiceRoleGrant(table)) {
      errors.push(
        `table "${table}" is created without a "grant ... to service_role" in the same migration ` +
          `(required for lib/supabaseAdmin.ts server access after the 2026-10-30 Supabase change — ` +
          `see supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md)`
      );
    }
  }

  for (const view of a.views) {
    if (isExempt(view)) continue;
    if (!hasServiceRoleGrant(view)) {
      errors.push(`view "${view}" is created without a "grant select ... to service_role" in the same migration`);
    }
  }

  for (const sequence of a.sequences) {
    if (isExempt(sequence)) continue;
    if (!hasServiceRoleGrant(sequence)) {
      errors.push(
        `sequence "${sequence}" needs "grant usage, select on sequence ... to service_role" in the same migration`
      );
    }
  }

  for (const [object, info] of a.grants) {
    if (!a.tables.has(object)) continue; // RLS requirement only applies to tables created in this file
    const grantedToBrowser = info.roles.has("anon") || info.roles.has("authenticated");
    if (grantedToBrowser && !a.rlsEnabledTables.has(object)) {
      errors.push(
        `table "${object}" is granted to anon/authenticated but has no ` +
          `"alter table ... enable row level security" in the same migration`
      );
    }
  }

  return errors;
};

// ---------------------------------------------------------------------------
// Self-tests: prove the parser catches each case before trusting it on real migrations.
// ---------------------------------------------------------------------------

describe("supabase migration grants contract — parser self-tests", () => {
  it("passes a table with service_role granted and RLS enabled", () => {
    const sql = `
      create table public.widgets (
        id uuid primary key default gen_random_uuid(),
        venue_id text not null
      );
      alter table public.widgets enable row level security;
      grant select, insert, update, delete on table public.widgets to service_role;
    `;
    expect(checkMigration(sql)).toEqual([]);
  });

  it("flags a table with no service_role grant at all", () => {
    const sql = `
      create table public.widgets (
        id uuid primary key default gen_random_uuid()
      );
      alter table public.widgets enable row level security;
    `;
    const errors = checkMigration(sql);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/widgets.*service_role/);
  });

  it("flags a serial column whose sequence has no service_role grant", () => {
    const sql = `
      create table public.widgets (
        id serial primary key,
        venue_id text not null
      );
      alter table public.widgets enable row level security;
      grant select, insert, update, delete on table public.widgets to service_role;
    `;
    const errors = checkMigration(sql);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/sequence "widgets_id_seq"/);
  });

  it("passes a serial column once its sequence is granted to service_role", () => {
    const sql = `
      create table public.widgets (
        id serial primary key
      );
      alter table public.widgets enable row level security;
      grant select, insert, update, delete on table public.widgets to service_role;
      grant usage, select on sequence public.widgets_id_seq to service_role;
    `;
    expect(checkMigration(sql)).toEqual([]);
  });

  it("flags anon/authenticated access with no RLS enabled", () => {
    const sql = `
      create table public.widgets (
        id uuid primary key default gen_random_uuid()
      );
      grant select, insert, update, delete on table public.widgets to service_role;
      grant select on table public.widgets to authenticated;
    `;
    const errors = checkMigration(sql);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/anon\/authenticated.*enable row level security/);
  });

  it("passes anon/authenticated access when RLS is enabled", () => {
    const sql = `
      create table public.widgets (
        id uuid primary key default gen_random_uuid()
      );
      alter table public.widgets enable row level security;
      grant select, insert, update, delete on table public.widgets to service_role;
      grant select on table public.widgets to authenticated;
    `;
    expect(checkMigration(sql)).toEqual([]);
  });

  it("honors a no-api-access exemption with a reason", () => {
    const sql = `
      -- grants-contract: no-api-access widgets — reached only via public.claim_widget(), never directly
      create table public.widgets (
        id uuid primary key default gen_random_uuid()
      );
      alter table public.widgets enable row level security;
    `;
    expect(checkMigration(sql)).toEqual([]);
  });

  it("rejects a no-api-access exemption with no reason", () => {
    const sql = `
      -- grants-contract: no-api-access widgets
      create table public.widgets (
        id uuid primary key default gen_random_uuid()
      );
      alter table public.widgets enable row level security;
    `;
    const errors = checkMigration(sql);
    expect(errors.some((e) => e.includes("missing a reason"))).toBe(true);
  });

  it("does not let a table name falsely match a longer table's grant (word-boundary safety)", () => {
    const sql = `
      create table public.foo (
        id uuid primary key default gen_random_uuid()
      );
      create table public.foo_bar (
        id uuid primary key default gen_random_uuid()
      );
      alter table public.foo enable row level security;
      alter table public.foo_bar enable row level security;
      grant select, insert, update, delete on table public.foo_bar to service_role;
    `;
    const errors = checkMigration(sql);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^table "foo"/);
  });

  it("handles a comma-separated grant object list", () => {
    const sql = `
      create table public.foo (id uuid primary key default gen_random_uuid());
      create table public.bar (id uuid primary key default gen_random_uuid());
      alter table public.foo enable row level security;
      alter table public.bar enable row level security;
      grant select, insert, update, delete on table public.foo, public.bar to service_role;
    `;
    expect(checkMigration(sql)).toEqual([]);
  });

  it("requires service_role select on a materialized view", () => {
    const sql = `
      create materialized view public.widget_stats as select 1;
    `;
    const errors = checkMigration(sql);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/view "widget_stats"/);
  });

  it("does not flag a plain create sequence with its own grant", () => {
    const sql = `
      create sequence public.order_numbers;
      grant usage, select on sequence public.order_numbers to service_role;
    `;
    expect(checkMigration(sql)).toEqual([]);
  });

  it("ignores dollar-quoted function bodies containing semicolons", () => {
    const sql = `
      create table public.widgets (id uuid primary key default gen_random_uuid());
      alter table public.widgets enable row level security;
      grant select, insert, update, delete on table public.widgets to service_role;

      create or replace function public.noop() returns void language plpgsql as $$
      begin
        perform 1;
        perform 2;
      end;
      $$;
    `;
    expect(checkMigration(sql)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Real migrations
// ---------------------------------------------------------------------------

describe("supabase migration grants contract — real migrations", () => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => MIGRATION_FILENAME.test(name))
    .filter((name) => {
      const [, timestamp] = name.match(MIGRATION_FILENAME)!;
      return timestamp > GRANDFATHERED_UP_TO;
    })
    .sort();

  it("has no migrations to check yet, or all of them pass (update this test's expectation once Phase 2 lands)", () => {
    // This is informational, not a hard requirement — it just makes an empty run visible.
    expect(Array.isArray(files)).toBe(true);
  });

  for (const file of files) {
    it(`${file} grants service_role on every object it creates and RLS-gates any anon/authenticated access`, () => {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      const errors = checkMigration(sql);
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
});

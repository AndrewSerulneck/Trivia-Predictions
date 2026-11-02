import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pick 'Em Phase 7.1 / 7.1b tripwires (docs/pickem-college-football-and-prize-plan.md §9 F1):
 * players can't write `pickem_picks` or `users` through the public API. Only the server writes
 * them, as service_role. A forged `won` pick is paid 10 points and counts toward real prizes; a
 * forged `users.points` feeds every leaderboard. So:
 *  - the two lockdown migrations revoke the writes and drop the "own row" write policies;
 *  - no LATER migration grants a write on either table to anon/authenticated/public, adds a
 *    non-SELECT policy on it, or turns its RLS off;
 *  - no browser-client file (one importing `@/lib/supabase`) names either table.
 * SQL proof: `npm run test:player-write-lockdown-sql`.
 */
const MIGRATIONS_DIR = "supabase/migrations";

const LOCKDOWNS = [
  {
    table: "pickem_picks",
    file: "20261101150024_pickem_picks_server_only_writes.sql",
    writePolicies: ["Users can insert own pickem picks", "Users can update own pickem picks"],
  },
  {
    table: "users",
    file: "20261101150026_users_server_only_writes.sql",
    writePolicies: ["Users can create own profiles", "Users can update own profiles"],
  },
] as const;

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** Statements with comments and dollar-quoted bodies removed, whitespace collapsed, lower-cased. */
const statements = (sql: string): string[] =>
  sql
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);

const tableRef = (table: string) => `(?:public\\.)?"?${table}"?(?=[\\s,]|$)`;

/** A statement that would let the API's player roles write `table` again. */
const reopensWrites = (statement: string, table: string): boolean => {
  const ref = tableRef(table);
  const grant = new RegExp(`^grant (.+?) on (?:table )?(.+?) to (.+)$`).exec(statement);
  if (grant) {
    const [, privileges, objects, grantees] = grant;
    const namesTable =
      new RegExp(`(?:^|,\\s*)${ref}`).test(objects) || /^all tables in schema public$/.test(objects.trim());
    const writes = /\b(all|insert|update|delete|truncate)\b/.test(privileges);
    const toPlayers = /\b(anon|authenticated|public)\b/.test(grantees);
    if (namesTable && writes && toPlayers) return true;
  }
  if (new RegExp(`^create policy .+? on ${ref}`).test(statement) && !/ for select\b/.test(statement)) return true;
  if (new RegExp(`^alter table (?:if exists )?(?:only )?${ref} (?:disable|no force) row level security`).test(statement)) {
    return true;
  }
  return false;
};

const sourceFiles = (dir: string): string[] =>
  readdirSync(resolve(process.cwd(), dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(resolve(process.cwd(), path)).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

describe("player table write lockdown contract", () => {
  const migrationFiles = readdirSync(resolve(process.cwd(), MIGRATIONS_DIR))
    .filter((name) => /^\d{14}_.*\.sql$/.test(name))
    .sort();

  for (const lockdown of LOCKDOWNS) {
    it(`${lockdown.file} revokes player writes on ${lockdown.table} and drops its write policies`, () => {
      const sql = statements(read(join(MIGRATIONS_DIR, lockdown.file)));
      const revoke = sql.find((statement) => statement.startsWith("revoke "));
      expect(revoke).toBeDefined();
      for (const privilege of ["insert", "update", "delete", "truncate"]) expect(revoke).toContain(privilege);
      expect(revoke).toMatch(new RegExp(`on table public\\.${lockdown.table} from anon, authenticated$`));
      for (const policy of lockdown.writePolicies) {
        expect(sql).toContain(`drop policy if exists "${policy.toLowerCase()}" on public.${lockdown.table}`);
      }
      // SELECT (and its read policy) stays: the lockdown file never touches reads.
      expect(sql.some((statement) => /\bselect\b/.test(statement))).toBe(false);
    });

    it(`no migration after ${lockdown.file} re-opens writes on ${lockdown.table}`, () => {
      const later = migrationFiles.filter((name) => name > lockdown.file);
      const offenders = later.flatMap((name) =>
        statements(read(join(MIGRATIONS_DIR, name)))
          .filter((statement) => reopensWrites(statement, lockdown.table))
          .map((statement) => `${name}: ${statement}`),
      );
      expect(offenders).toEqual([]);
    });
  }

  it("the re-open detector catches the statements it is meant to", () => {
    expect(reopensWrites("grant all privileges on table public.pickem_picks to authenticated", "pickem_picks")).toBe(true);
    expect(reopensWrites("grant select, update on public.users, public.venues to anon", "users")).toBe(true);
    expect(reopensWrites("grant insert on all tables in schema public to authenticated", "users")).toBe(true);
    expect(reopensWrites('create policy "x" on public.users for update using (true)', "users")).toBe(true);
    expect(reopensWrites('create policy "x" on pickem_picks using (true)', "pickem_picks")).toBe(true);
    expect(reopensWrites("alter table public.users disable row level security", "users")).toBe(true);
    expect(reopensWrites("grant all privileges on table public.users to service_role", "users")).toBe(false);
    expect(reopensWrites("grant select on table public.users to authenticated", "users")).toBe(false);
    expect(reopensWrites("grant all on table public.users_extra to authenticated", "users")).toBe(false);
    expect(reopensWrites('create policy "x" on public.users for select using (true)', "users")).toBe(false);
  });

  it("no browser-client file names pickem_picks or users", () => {
    const browserFiles = ["app", "components", "lib"]
      .flatMap(sourceFiles)
      .filter((path) => /from\s+["']@\/lib\/supabase["']/.test(read(path)));
    expect(browserFiles.length).toBeGreaterThan(0);
    const offenders = browserFiles.filter((path) => {
      const source = read(path);
      return source.includes("pickem_picks") || /\.from\(\s*["'`]users["'`]\s*\)/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});

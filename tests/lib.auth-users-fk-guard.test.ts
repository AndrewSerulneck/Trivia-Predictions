import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Partner Self-Serve Signup — Phase 5a §1 tripwire
 * (docs/partner-self-serve-signup-plan.md).
 *
 * **`auth.users` is NOT the venue-owner credential store.** It is shared with the
 * PLAYER identity tables, and several of those FKs are `ON DELETE SET NULL` —
 * so deleting an `auth.users` row does not error, it silently detaches a
 * player's account from their identity (or, on the `CASCADE` ones, deletes their
 * gameplay rows).
 *
 * Two things depend on that set staying exactly what it is today:
 *
 *  1. The standing prohibition in CLAUDE.md and in
 *     `app/api/owner/signup/route.ts` — no signup or owner code path may adopt,
 *     delete, or reset the password of a PRE-EXISTING `auth.users` row. Deleting
 *     one is legitimate only for a row the same request just created, which is
 *     exactly and only what that route's `unwind()` does.
 *  2. Phase 6's orphaned-auth-user reconciliation in `/api/cron/signup-sweep`,
 *     which may delete an `auth.users` row ONLY when no row in any of these
 *     tables references it and it is older than 24h.
 *
 * A migration that adds an eighth consumer fails here — loudly, with the guard
 * it invalidates named — instead of quietly widening the blast radius of that
 * sweep. Modelled on tests/lib.venue-fk-cascade-guard.test.ts, which walks
 * migrations in filename order for exactly this kind of question.
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");

/**
 * Any column, any name, referencing auth.users(id) — with or without a rule.
 * The rule alternation is spelled out rather than `(\w+)`: `\w+` stops at the
 * space in "set null" and reports the rule as "set".
 */
const ON_DELETE = String.raw`(?:\s*on delete\s+(no action|restrict|cascade|set null|set default))?`;
const INLINE_COLUMN_FK = new RegExp(
  String.raw`(\w+)\s+uuid[^,;()]*?references\s+auth\.users\s*\(\s*id\s*\)` + ON_DELETE,
  "gi"
);
const NAMED_CONSTRAINT_FK = new RegExp(
  String.raw`foreign key\s*\(\s*(\w+)\s*\)\s*references\s+auth\.users\s*\(\s*id\s*\)` + ON_DELETE,
  "gi"
);

/**
 * Tables renamed after they declared their FK. The regex walk sees the name in
 * the CREATE TABLE, so the rename has to be replayed by hand — see
 * 20260628170000_rename_scategories_to_category_blitz.sql.
 */
const RENAMES: Record<string, string> = {
  scategories_submissions: "category_blitz_submissions",
};

function extractTableName(statement: string): string | null {
  const createMatch = statement.match(/create table\s+(?:if not exists\s+)?(?:public\.)?(\w+)/i);
  if (createMatch) return createMatch[1];
  const alterMatch = statement.match(/alter table\s+(?:if exists\s+)?(?:public\.)?(\w+)/i);
  if (alterMatch) return alterMatch[1];
  return null;
}

type FkInfo = { column: string; rule: string; file: string };

function authUserFkRules(): Map<string, FkInfo> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const rules = new Map<string, FkInfo>();

  for (const file of files) {
    const source = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

    for (const statement of source.split(";")) {
      if (!/references\s+auth\.users\s*\(\s*id\s*\)/i.test(statement)) continue;

      const rawTable = extractTableName(statement);
      if (!rawTable) continue;
      const table = RENAMES[rawTable] ?? rawTable;

      for (const regex of [INLINE_COLUMN_FK, NAMED_CONSTRAINT_FK]) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(statement)) !== null) {
          rules.set(table, {
            column: match[1],
            rule: (match[2] ?? "no action").toLowerCase(),
            file,
          });
        }
      }
    }
  }

  return rules;
}

/**
 * The complete, intended set as of 2026-09-07 — and note that it is SEVEN
 * tables, not the three (`venue_owners`, `accounts`, `users`) the Phase 5a plan
 * text assumed. That discrepancy is the whole point of writing this down.
 *
 * `owner` marks the one table that is a partner credential; every other row here
 * belongs to a PLAYER, directly or through `public.users`.
 */
const EXPECTED: Record<string, { rule: string; who: "owner" | "player" }> = {
  users: { rule: "set null", who: "player" },
  accounts: { rule: "set null", who: "player" },
  username_change_attempts: { rule: "set null", who: "player" },
  username_change_audit: { rule: "set null", who: "player" },
  category_blitz_submissions: { rule: "cascade", who: "player" },
  category_blitz_session_participants: { rule: "cascade", who: "player" },
  venue_owners: { rule: "cascade", who: "owner" },
};

describe("auth.users foreign key guard", () => {
  it("has exactly the seven known consumers of auth.users(id)", () => {
    const rules = authUserFkRules();

    expect(
      Array.from(rules.keys()).sort(),
      "A migration changed the set of tables with an auth.users(id) FK. Deleting an " +
        "auth user touches every one of them — SET NULL silently detaches a player's " +
        "identity, CASCADE deletes their rows. Before updating EXPECTED, widen the " +
        "guard on Phase 6's orphaned-auth-user sweep in /api/cron/signup-sweep to " +
        "check the new table too, and re-read the prohibition in CLAUDE.md."
    ).toEqual(Object.keys(EXPECTED).sort());
  });

  it("keeps each consumer's on-delete rule where the sweep's guard assumes it", () => {
    const rules = authUserFkRules();

    const actual = Object.fromEntries(
      Array.from(rules.entries()).map(([table, info]) => [table, info.rule])
    );
    const expected = Object.fromEntries(
      Object.entries(EXPECTED).map(([table, info]) => [table, info.rule])
    );

    expect(actual).toEqual(expected);
  });

  it("still sees the two PLAYER tables the prohibition is written about", () => {
    // accounts + users are the pair app/api/join/profile/route.ts reads and
    // writes. If either ever stops carrying the FK, the "is this auth user a
    // player?" question stops being answerable the way Phase 5a §1 answers it.
    const rules = authUserFkRules();

    expect(rules.get("accounts")).toMatchObject({ column: "auth_id", rule: "set null" });
    expect(rules.get("users")).toMatchObject({ column: "auth_id", rule: "set null" });
  });

  it("names venue_owners as the only partner-credential consumer", () => {
    const owners = Object.entries(EXPECTED)
      .filter(([, info]) => info.who === "owner")
      .map(([table]) => table);

    expect(owners).toEqual(["venue_owners"]);
  });
});

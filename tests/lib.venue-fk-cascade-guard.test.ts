import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard for the bug fixed by 20260722120000_cascade_venue_deletes_stragglers.sql:
// venue_presence_sessions and story_share_events were added with ON DELETE RESTRICT after
// 20260625200000_cascade_venue_deletes.sql already cascaded every other venue_id FK, which
// silently re-blocked venue deletion from the admin "Venue Profiles" page.
//
// This walks every migration in chronological (filename) order and tracks the *effective*
// on-delete rule per table for any FK targeting venues(id), so a future migration that
// re-introduces RESTRICT (or forgets to set a rule) fails loudly here instead of surfacing
// as a foreign key violation when someone tries to delete a venue.

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");

const INLINE_COLUMN_FK = /venue_id[^,;]*?references\s+(?:public\.)?venues\s*\(\s*id\s*\)\s*on delete\s+(\w+)/gi;
const NAMED_CONSTRAINT_FK =
  /foreign key\s*\(\s*venue_id\s*\)\s*references\s+(?:public\.)?venues\s*\(\s*id\s*\)\s*on delete\s+(\w+)/gi;

function extractTableName(statement: string): string | null {
  const createMatch = statement.match(/create table\s+(?:if not exists\s+)?(?:public\.)?(\w+)/i);
  if (createMatch) return createMatch[1];
  const alterMatch = statement.match(/alter table\s+(?:if exists\s+)?(?:public\.)?(\w+)/i);
  if (alterMatch) return alterMatch[1];
  return null;
}

function effectiveVenueFkRules(): Map<string, { rule: string; file: string }> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const rules = new Map<string, { rule: string; file: string }>();

  for (const file of files) {
    const source = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const statements = source.split(";");

    for (const statement of statements) {
      if (!/venues\s*\(\s*id\s*\)/i.test(statement)) continue;

      const tableName = extractTableName(statement);
      if (!tableName || tableName === "venues") continue;

      for (const regex of [INLINE_COLUMN_FK, NAMED_CONSTRAINT_FK]) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(statement)) !== null) {
          rules.set(tableName, { rule: match[1].toLowerCase(), file });
        }
      }
    }
  }

  return rules;
}

describe("venue_id foreign key cascade guard", () => {
  it("has no table left with ON DELETE RESTRICT on its venues(id) FK", () => {
    const rules = effectiveVenueFkRules();

    expect(rules.size).toBeGreaterThan(10);

    const restricted = Array.from(rules.entries())
      .filter(([, info]) => info.rule === "restrict")
      .map(([table, info]) => `${table} (set in ${info.file})`);

    expect(
      restricted,
      restricted.length > 0
        ? `The following tables still RESTRICT venue deletion. Either the venue delete flow ` +
            `must pre-delete these rows, or the FK should cascade like the rest ` +
            `(see 20260625200000_cascade_venue_deletes.sql / 20260722120000_cascade_venue_deletes_stragglers.sql):\n` +
            restricted.join("\n")
        : undefined
    ).toEqual([]);
  });

  it("still recognizes the previously-blocking tables as cascading", () => {
    const rules = effectiveVenueFkRules();

    expect(rules.get("venue_presence_sessions")?.rule).toBe("cascade");
    expect(rules.get("story_share_events")?.rule).toBe("cascade");
  });
});

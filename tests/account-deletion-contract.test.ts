import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

import sitemap from "@/app/sitemap";
import { PLAYER_DELETE_ACCOUNT_PATH } from "@/lib/accountDeletionShared";
import { classifyPage, decideDomainSplit } from "@/lib/domainSplit";
import { AUTH_USER_FK_CONSUMERS } from "@/lib/signupSweep";

/**
 * Player account deletion tripwire (docs/native-app-store-plan.md Phase 1b).
 *
 * Andrew's rule is REMOVE, don't anonymise. Every FK into `users` is CASCADE or SET NULL; the
 * CASCADE ones go with the users row, but a SET NULL one silently leaves the player's row behind
 * with its id cleared. So `delete_player_account` must handle every SET NULL consumer by name.
 * A migration that adds a new SET NULL consumer fails here until the function handles it.
 * Its all-or-nothing behaviour runs against real PostgreSQL in `npm run test:account-deletion-sql`.
 */

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");
const DELETION_MIGRATION = "20261008044524_player_account_deletion.sql";
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), "utf8");

const functionBody = (): string => {
  const sql = read(`supabase/migrations/${DELETION_MIGRATION}`);
  const start = sql.indexOf("create or replace function public.delete_player_account");
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf("$$;", start)).toLowerCase();
};

/** Tables whose FK into users(id) is ON DELETE SET NULL, replayed across every migration. */
const setNullUserConsumers = (): Set<string> => {
  const tables = new Set<string>();
  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").split(";")) {
      if (!/references\s+(?:public\.)?users\s*\(\s*id\s*\)\s+on delete set null/i.test(statement)) continue;
      const match = statement.match(/(?:create table|alter table)\s+(?:if not exists\s+|if exists\s+)?(?:public\.)?(\w+)/i);
      if (match) tables.add(match[1].toLowerCase());
    }
  }
  return tables;
};

/** How the function handles each SET NULL consumer that is not simply deleted. */
const HANDLED_OTHERWISE: Record<string, RegExp> = {
  // Keep the slot, blank the winner (Andrew, 2026-10-08).
  challenge_cycle_winners: /update challenge_cycle_winners\s+set winner_user_id = null/,
  // A "resolved" marker; its FK is dropped by the same migration, so nothing nulls it.
  challenge_campaigns: /./,
};

describe("delete_player_account", () => {
  it("handles every ON DELETE SET NULL consumer of users explicitly", () => {
    const body = functionBody();
    const consumers = setNullUserConsumers();
    expect(consumers.size).toBeGreaterThan(0);
    for (const table of consumers) {
      const handled = HANDLED_OTHERWISE[table] ?? new RegExp(`delete from ${table}\\b`);
      expect(body, `${table} is ON DELETE SET NULL — delete_player_account must handle it`).toMatch(handled);
    }
  });

  it("checks all seven auth.users consumers before reporting an auth id as deletable", () => {
    const body = functionBody();
    for (const { table, column } of AUTH_USER_FK_CONSUMERS) {
      expect(body, `${table}.${column}`).toMatch(new RegExp(`from ${table} where ${column} = v_auth`));
    }
  });

  it("never deletes from auth.users itself and is service-role only", () => {
    const sql = read(`supabase/migrations/${DELETION_MIGRATION}`).toLowerCase();
    expect(sql).not.toMatch(/delete\s+from\s+auth\.users/);
    expect(sql).toMatch(/revoke all on function public\.delete_player_account\(uuid\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.delete_player_account\(uuid\) to service_role/);
  });
});

describe("account deletion surfaces", () => {
  it("binds the route to the signed session and refuses without one", () => {
    const route = read("app/api/account/delete/route.ts");
    expect(route).toContain("resolveRequestUserId(");
    expect(route).toContain("isSessionEnforced()");
  });

  it("puts Delete my account in the player menu, separated from Sign Out by the legal row", () => {
    const menu = read("components/navigation/AccountMenuList.tsx");
    const del = menu.indexOf("href={PLAYER_DELETE_ACCOUNT_PATH}");
    const legal = menu.indexOf("LEGAL_LINKS.map");
    const signOut = menu.indexOf("<SignOutButton");
    expect(del).toBeGreaterThan(-1);
    expect(del).toBeLessThan(legal);
    expect(legal).toBeLessThan(signOut);
  });

  it("serves the signed-in screen on the game host and the public explainer on the apex", () => {
    expect(classifyPage(PLAYER_DELETE_ACCOUNT_PATH)).toBe("game");
    expect(classifyPage("/delete-account")).toBe("marketing");
    const saved = process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED;
    process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED = "true";
    try {
      expect(decideDomainSplit("hightopchallenge.com", "/delete-account")).toEqual({ action: "none" });
      expect(decideDomainSplit("play.hightopchallenge.com", "/delete-account")).toEqual({
        action: "redirect",
        host: "hightopchallenge.com",
      });
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED;
      else process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED = saved;
    }
    expect(read("proxy.ts")).toMatch(/LEGAL_PUBLIC_PREFIXES = \[[^\]]*"\/delete-account"/);
    expect(sitemap().map((entry) => new URL(entry.url).pathname)).toContain("/delete-account");
  });

  it("lets a signed-in player stay on the deletion screen (AuthNavigationGuard allowlist)", () => {
    const guard = read("components/auth/AuthNavigationGuard.tsx");
    expect(guard).toContain("pathname.startsWith(PLAYER_DELETE_ACCOUNT_PATH)");
    // …and the legal pages, which the drawer links to (a Phase 1a regression found in 1b).
    expect(guard).toContain("LEGAL_PAGE_PATHS.some(");
  });

  it("links the public explainer from Support and Privacy", () => {
    expect(read("app/support/page.tsx")).toContain('href="/delete-account"');
    expect(read("app/privacy/page.tsx")).toContain('href="/delete-account"');
  });
});

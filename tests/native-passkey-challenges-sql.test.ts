import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const accountId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const migration = readFileSync(path.join(process.cwd(),
  "supabase/migrations/20261025150000_native_discoverable_passkeys.sql"), "utf8");

describe("discoverable passkey challenge migration (real PostgreSQL)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create table public.accounts (id uuid primary key);
      create table public.users (id uuid primary key);
      create table public.webauthn_challenges (
        id uuid primary key default gen_random_uuid(),
        account_id uuid not null references public.accounts(id) on delete cascade,
        user_id uuid references public.users(id) on delete cascade,
        flow_type text not null check (flow_type in ('registration', 'authentication')),
        challenge_b64url text not null unique,
        used_at timestamptz
      );
      insert into public.accounts values ('${accountId}');
      insert into public.users values ('${userId}');
      insert into public.webauthn_challenges(account_id, flow_type, challenge_b64url)
      values ('${accountId}', 'registration', 'existing-registration');
    `);
    // Reproduce the actual production error before the migration.
    await expect(db.query(`insert into public.webauthn_challenges(flow_type, challenge_b64url)
      values ('authentication', 'pre-migration')`)).rejects.toThrow(/not-null constraint/);
    await db.exec(migration);
  });
  afterAll(async () => { await db?.close(); });

  it("preserves existing account-bound registration challenges", async () => {
    const result = await db.query<{ account_id: string }>(
      "select account_id from public.webauthn_challenges where challenge_b64url = 'existing-registration'");
    expect(result.rows).toEqual([{ account_id: accountId }]);
  });

  it("allows authentication before the credential identifies an account", async () => {
    const result = await db.query<{ account_id: null; user_id: null }>(`
      insert into public.webauthn_challenges(flow_type, challenge_b64url)
      values ('authentication', 'discoverable-auth') returning account_id, user_id`);
    expect(result.rows).toEqual([{ account_id: null, user_id: null }]);
  });

  it("still rejects registration with no account or legacy profile", async () => {
    await expect(db.query(`insert into public.webauthn_challenges(flow_type, challenge_b64url)
      values ('registration', 'anonymous-registration')`)).rejects.toThrow(/registration_identity_required/);
  });

  it("preserves account-bound authentication and legacy profile-bound registration", async () => {
    await db.query(`insert into public.webauthn_challenges(account_id, flow_type, challenge_b64url)
      values ($1, 'authentication', 'account-auth')`, [accountId]);
    await db.query(`insert into public.webauthn_challenges(user_id, flow_type, challenge_b64url)
      values ($1, 'registration', 'legacy-registration')`, [userId]);
  });

  it("still enforces account foreign keys, flow types and unique challenges", async () => {
    await expect(db.query(`insert into public.webauthn_challenges(account_id, flow_type, challenge_b64url)
      values ('00000000-0000-4000-8000-000000000099', 'authentication', 'unknown-account')`)).rejects.toThrow(/foreign key/);
    await expect(db.query(`insert into public.webauthn_challenges(flow_type, challenge_b64url)
      values ('invalid-flow', 'invalid-flow')`)).rejects.toThrow(/check constraint/);
    await expect(db.query(`insert into public.webauthn_challenges(account_id, flow_type, challenge_b64url)
      values ($1, 'registration', 'existing-registration')`, [accountId])).rejects.toThrow(/unique constraint/);
  });
});

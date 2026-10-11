#!/usr/bin/env node
// Isolated PostgreSQL check for supabase/migrations/20261011134820_multi_venue_billing.sql.
// No network, no application imports, never touches Supabase. Multi-venue billing plan Phase 1.
//
// The tables below are a minimal synthetic copy of the live schema: only the columns the
// migration touches, with production's FK targets and ON DELETE rules
// (20260627100000_venue_owner_billing.sql). The real migration file is then applied on top —
// twice, to prove it is re-runnable.
//
// MULTI_VENUE_PGLITE_MODULE=<path>/node_modules/@electric-sql/pglite \
//   node scripts/test-multi-venue-billing-sql.cjs
// (npm run test:multi-venue-billing-sql — see the package.json entry for the default path.)
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.MULTI_VENUE_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATION = "supabase/migrations/20261011134820_multi_venue_billing.sql";

const SCHEMA = `
  create role anon; create role authenticated; create role service_role;
  create table venues(id text primary key);
  create table venue_owners(id uuid primary key default gen_random_uuid());
  create table billing_subscriptions(
    id uuid primary key default gen_random_uuid(),
    venue_id text references venues(id) on delete cascade unique not null,
    owner_id uuid references venue_owners(id) on delete cascade not null,
    status text not null default 'active',
    stripe_subscription_id text,
    created_at timestamptz default now(),
    updated_at timestamptz default now());
  create table billing_invoices(id uuid primary key default gen_random_uuid(),
    subscription_id uuid references billing_subscriptions(id) on delete cascade not null);
  create or replace function update_billing_subscription_updated_at() returns trigger
    language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
  create trigger billing_subscriptions_updated_at before update on billing_subscriptions
    for each row execute function update_billing_subscription_updated_at();
`;

async function main() {
  const db = new PGlite();
  const q = (sql, params = []) => db.query(sql, params);
  const rows = async (sql, params = []) => (await q(sql, params)).rows;

  await db.exec(SCHEMA);
  await q(`insert into venues values ('pacific'), ('hightop-test'), ('garden'), ('carrabbas'), ('new-a'), ('new-b'), ('member')`);
  const [owner] = await rows(`insert into venue_owners default values returning id`);
  // Today's production shape: three bills, one of them an offline cancelled row; one owner has a
  // second, unbilled venue (hightop-test).
  await q(
    `insert into billing_subscriptions(venue_id, owner_id, status, stripe_subscription_id) values
      ('pacific', $1, 'active', 'sub_p'), ('garden', $1, 'cancelled', null), ('carrabbas', $1, 'active', 'sub_c')`,
    [owner.id]
  );

  const migration = fs.readFileSync(MIGRATION, "utf8");
  await db.exec(migration);
  await db.exec(migration); // re-runnable

  // 1. Backfill: exactly one anchor per bill, never the unbilled second venue.
  const anchors = await rows(
    `select m.venue_id, m.role, m.subscription_id = b.id as matches
       from billing_subscription_venues m join billing_subscriptions b on b.venue_id = m.venue_id
      order by m.venue_id`
  );
  assert.deepEqual(
    anchors.map((r) => [r.venue_id, r.role, r.matches]),
    [
      ["carrabbas", "anchor", true],
      ["garden", "anchor", true],
      ["pacific", "anchor", true],
    ]
  );
  assert.equal((await rows(`select count(*)::int as n from billing_subscription_venues`))[0].n, 3);
  assert.equal(
    (await rows(`select count(*)::int as n from billing_subscription_venues where venue_id = 'hightop-test'`))[0].n,
    0,
    "an owner's unbilled venue must never be backfilled onto a bill"
  );

  // 2. Trigger: a new bill gets its anchor row; an upsert that UPDATES does not add another.
  await q(`insert into billing_subscriptions(venue_id, owner_id) values ('new-a', $1)`, [owner.id]);
  assert.equal(
    (await rows(`select count(*)::int as n from billing_subscription_venues where venue_id = 'new-a' and role = 'anchor'`))[0].n,
    1
  );
  await q(
    `insert into billing_subscriptions(venue_id, owner_id, stripe_subscription_id) values ('pacific', $1, 'sub_p2')
       on conflict (venue_id) do update set stripe_subscription_id = excluded.stripe_subscription_id`,
    [owner.id]
  );
  assert.equal((await rows(`select count(*)::int as n from billing_subscription_venues where venue_id = 'pacific'`))[0].n, 1);

  // 3. The trigger never steals a venue already on another bill.
  const [pacificBill] = await rows(`select id from billing_subscriptions where venue_id = 'pacific'`);
  await q(`insert into billing_subscription_venues(subscription_id, venue_id, role) values ($1, 'new-b', 'added')`, [
    pacificBill.id,
  ]);
  await q(`insert into billing_subscriptions(venue_id, owner_id) values ('new-b', $1)`, [owner.id]);
  const [newB] = await rows(`select subscription_id = $1 as on_pacific, role from billing_subscription_venues where venue_id = 'new-b'`, [
    pacificBill.id,
  ]);
  assert.equal(newB.on_pacific, true);
  assert.equal(newB.role, "added");

  // 4. quantity mirror column exists and rejects negatives.
  await q(`update billing_subscriptions set quantity = 3 where venue_id = 'pacific'`);
  await assert.rejects(q(`update billing_subscriptions set quantity = -1 where venue_id = 'pacific'`));

  // 5. Delete rules (plan §7 trap 2).
  //    a. single-venue partner: deleting the venue still works (its own membership row cascades).
  await q(`delete from venues where id = 'carrabbas'`);
  assert.equal((await rows(`select count(*)::int as n from billing_subscriptions where venue_id = 'carrabbas'`))[0].n, 0);
  //    b. a chain's anchor venue cannot be deleted while another venue is on its bill.
  await q(`insert into billing_subscription_venues(subscription_id, venue_id, role) values ($1, 'member', 'added')`, [
    pacificBill.id,
  ]);
  await assert.rejects(q(`delete from venues where id = 'pacific'`), /foreign key/);
  assert.equal((await rows(`select count(*)::int as n from billing_subscriptions where venue_id = 'pacific'`))[0].n, 1);
  //    c. deleting a non-anchor member only removes its membership row.
  await q(`delete from venues where id = 'member'`);
  await q(`delete from venues where id = 'new-b'`);
  assert.equal((await rows(`select count(*)::int as n from billing_subscriptions where venue_id = 'pacific'`))[0].n, 1);
  //    d. ...and once it is alone again, the anchor deletes normally.
  await q(`delete from venues where id = 'pacific'`);
  assert.equal((await rows(`select count(*)::int as n from billing_subscriptions where venue_id = 'pacific'`))[0].n, 0);

  // 6. Ledger: unique idempotency key; history survives the venue and bill being deleted.
  const [gardenBill] = await rows(`select id from billing_subscriptions where venue_id = 'garden'`);
  await q(
    `insert into billing_venue_additions(idempotency_key, subscription_id, venue_id, venue_name, quantity_before, quantity_after)
       values ('k1', $1, 'new-a', 'New A', 1, 2)`,
    [gardenBill.id]
  );
  await assert.rejects(q(`insert into billing_venue_additions(idempotency_key) values ('k1')`), /duplicate key/);
  await assert.rejects(q(`insert into billing_venue_additions(idempotency_key, status) values ('k2', 'refunded')`));
  await q(`delete from venues where id = 'new-a'`);
  const [ledger] = await rows(`select venue_id, venue_name, status from billing_venue_additions where idempotency_key = 'k1'`);
  assert.deepEqual(ledger, { venue_id: null, venue_name: "New A", status: "pending" });

  // 7. Grants: service_role only; RLS forced.
  const grants = await rows(
    `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
       from information_schema.role_table_grants
      where table_name in ('billing_subscription_venues', 'billing_venue_additions')
        and grantee in ('anon', 'authenticated', 'service_role')
      group by table_name, grantee order by table_name, grantee`
  );
  assert.deepEqual(
    grants.map((g) => [g.table_name, g.grantee, g.privs]),
    [
      ["billing_subscription_venues", "service_role", "DELETE,INSERT,SELECT,UPDATE"],
      ["billing_venue_additions", "service_role", "DELETE,INSERT,SELECT,UPDATE"],
    ]
  );
  const rls = await rows(
    `select relname, relrowsecurity, relforcerowsecurity from pg_class
      where relname in ('billing_subscription_venues', 'billing_venue_additions') order by relname`
  );
  assert.ok(rls.every((r) => r.relrowsecurity && r.relforcerowsecurity));

  console.log("multi-venue billing migration: all SQL checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

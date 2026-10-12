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
// Phase 3: the advisory-locked claim that starts an "Add a venue".
const CLAIM_MIGRATION = "supabase/migrations/20261011153607_venue_addition_claim.sql";
// Phase 5: Remove / Undo ledger + claim/finish RPCs, and claim_venue_addition's change-busy rule.
const CHANGES_MIGRATION = "supabase/migrations/20261011210033_venue_bill_changes.sql";
// Phase 6.1: the admin price swap claims on the same ledger + lock.
const PRICE_MIGRATION = "supabase/migrations/20261011224839_bill_price_change_lock.sql";

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

  // 8. Phase 3 — claim_venue_addition (re-runnable, like the Phase 1 file).
  const claimMigration = fs.readFileSync(CLAIM_MIGRATION, "utf8");
  await db.exec(claimMigration);
  await db.exec(claimMigration);

  await q(`insert into venues values ('chain-anchor'), ('chain-two'), ('other-anchor')`);
  const [chainOwner] = await rows(`insert into venue_owners default values returning id`);
  const [otherOwner] = await rows(`insert into venue_owners default values returning id`);
  const [chainBill] = await rows(
    `insert into billing_subscriptions(venue_id, owner_id, status, stripe_subscription_id)
       values ('chain-anchor', $1, 'active', 'sub_chain') returning id`,
    [chainOwner.id]
  );
  const [otherBill] = await rows(
    `insert into billing_subscriptions(venue_id, owner_id, status, stripe_subscription_id)
       values ('other-anchor', $1, 'active', 'sub_other') returning id`,
    [otherOwner.id]
  );
  const claim = async (key, ownerId, billId, name = "New Venue") =>
    (await rows(`select * from claim_venue_addition($1, $2, $3, $4)`, [key, ownerId, billId, name]))[0];

  //    a. the first claim inserts a pending row priced off the billed venue count (anchor = 1).
  const first = await claim("add-1", chainOwner.id, chainBill.id, "  Second Bar  ");
  assert.equal(first.outcome, "claimed");
  assert.equal(first.addition_status, "pending");
  assert.equal(first.addition_quantity_before, 1);
  assert.equal(first.addition_quantity_after, 2);
  const [firstRow] = await rows(`select venue_name, owner_id, subscription_id from billing_venue_additions where id = $1`, [
    first.addition_id,
  ]);
  assert.equal(firstRow.venue_name, "Second Bar");
  assert.equal(firstRow.subscription_id, chainBill.id);

  //    b. same key → the same row, never a second one (double-tap / retry).
  const again = await claim("add-1", chainOwner.id, chainBill.id);
  assert.equal(again.outcome, "existing");
  assert.equal(again.addition_id, first.addition_id);
  assert.equal((await rows(`select count(*)::int as n from billing_venue_additions where idempotency_key = 'add-1'`))[0].n, 1);

  //    c. a different add on the same bill while one is in flight → busy, nothing inserted.
  const second = await claim("add-2", chainOwner.id, chainBill.id);
  assert.equal(second.outcome, "busy");
  assert.equal(second.addition_id, first.addition_id);
  assert.equal((await rows(`select count(*)::int as n from billing_venue_additions where idempotency_key = 'add-2'`))[0].n, 0);
  //       ...and requires_action (3-D Secure outstanding) is still in flight.
  await q(`update billing_venue_additions set status = 'requires_action', stripe_invoice_id = 'in_1' where id = $1`, [
    first.addition_id,
  ]);
  const third = await claim("add-3", chainOwner.id, chainBill.id);
  assert.equal(third.outcome, "busy");
  assert.equal(third.addition_invoice_id, "in_1");

  //    d. once it settles, the next add claims off the NEW billed count.
  await q(`update billing_venue_additions set status = 'paid', venue_id = 'chain-two' where id = $1`, [first.addition_id]);
  await q(`insert into billing_subscription_venues(subscription_id, venue_id, role) values ($1, 'chain-two', 'added')`, [
    chainBill.id,
  ]);
  const fourth = await claim("add-4", chainOwner.id, chainBill.id);
  assert.equal(fourth.outcome, "claimed");
  assert.equal(fourth.addition_quantity_before, 2);
  assert.equal(fourth.addition_quantity_after, 3);
  await q(`update billing_venue_additions set status = 'failed' where id = $1`, [fourth.addition_id]);

  //    e. a venue scheduled for removal (Phase 5: Stripe quantity already lowered) or removed is not billed.
  await q(`update billing_subscription_venues set remove_at = now() + interval '5 days' where venue_id = 'chain-two'`);
  const fifth = await claim("add-5", chainOwner.id, chainBill.id);
  assert.equal(fifth.addition_quantity_before, 1);
  await q(`update billing_venue_additions set status = 'failed' where id = $1`, [fifth.addition_id]);
  await q(`update billing_subscription_venues set remove_at = null where venue_id = 'chain-two'`);

  //    f. a failed / paid key stays itself: retrying it never restarts the add.
  const retried = await claim("add-4", chainOwner.id, chainBill.id);
  assert.equal(retried.outcome, "existing");
  assert.equal(retried.addition_status, "failed");

  //    g. ownership and key isolation.
  assert.equal((await claim("add-6", otherOwner.id, chainBill.id)).outcome, "not_owner");
  const conflict = await claim("add-1", otherOwner.id, otherBill.id);
  assert.equal(conflict.outcome, "key_conflict");
  assert.equal(conflict.addition_id, null, "a key_conflict must not leak the other owner's row");
  assert.equal((await claim("add-7", chainOwner.id, "00000000-0000-0000-0000-000000000000")).outcome, "no_bill");
  assert.equal((await claim("   ", chainOwner.id, chainBill.id)).outcome, "invalid");

  //    h. other bills are independent: an in-flight add on one never blocks another.
  await q(`insert into billing_venue_additions(idempotency_key, owner_id, subscription_id, status) values ('x', $1, $2, 'pending')`, [
    chainOwner.id,
    chainBill.id,
  ]);
  assert.equal((await claim("other-1", otherOwner.id, otherBill.id)).outcome, "claimed");

  //    i. execute is service_role only.
  const fnGrants = await rows(
    `select grantee from information_schema.routine_privileges
      where routine_name = 'claim_venue_addition' and privilege_type = 'EXECUTE' order by grantee`
  );
  const grantees = fnGrants.map((g) => g.grantee);
  assert.ok(grantees.includes("service_role"));
  assert.ok(!grantees.includes("anon") && !grantees.includes("authenticated") && !grantees.includes("PUBLIC"));

  // 9. Phase 5 — Remove / Undo (claim_venue_bill_change, finish_venue_bill_change) and the
  //    replaced claim_venue_addition (re-runnable).
  const changesMigration = fs.readFileSync(CHANGES_MIGRATION, "utf8");
  await db.exec(changesMigration);
  await db.exec(changesMigration);

  await q(`insert into venues values ('r-anchor'), ('r-two'), ('r-three'), ('r-own-bill')`);
  const [rOwner] = await rows(`insert into venue_owners default values returning id`);
  const [rBill] = await rows(
    `insert into billing_subscriptions(venue_id, owner_id, status, stripe_subscription_id)
       values ('r-anchor', $1, 'active', 'sub_r') returning id`,
    [rOwner.id]
  );
  await q(
    `insert into billing_subscription_venues(subscription_id, venue_id, role, added_at) values
       ($1, 'r-two', 'added', now() - interval '2 days'), ($1, 'r-three', 'added', now() - interval '1 day')`,
    [rBill.id]
  );
  const periodEnd = "2099-01-01T00:00:00Z";
  const change = async (key, venue, action, removeAt = periodEnd, ownerId = rOwner.id, billId = rBill.id) =>
    (await rows(`select * from claim_venue_bill_change($1, $2, $3, $4, $5, $6)`, [key, ownerId, billId, venue, action, removeAt]))[0];
  const finish = async (id, outcome, reason = null) =>
    (await rows(`select * from finish_venue_bill_change($1, $2, $3)`, [id, outcome, reason]))[0];
  const member = async (venue) =>
    (await rows(`select remove_at, removed_at from billing_subscription_venues where venue_id = $1`, [venue]))[0];
  const anchorOf = async (billId) => (await rows(`select venue_id from billing_subscriptions where id = $1`, [billId]))[0].venue_id;

  //    a. argument checks.
  assert.equal((await change("c-0", "r-two", "remove", null)).outcome, "invalid");
  assert.equal((await change("c-0", "r-two", "remove", "2000-01-01T00:00:00Z")).outcome, "invalid", "remove_at in the past");
  assert.equal((await change("c-0", "r-two", "delete")).outcome, "invalid");
  assert.equal((await change("c-0", "r-two", "remove", periodEnd, otherOwner.id)).outcome, "not_owner");
  assert.equal((await change("c-0", "r-own-bill", "remove")).outcome, "not_on_bill");

  //    b. an add in flight blocks a change; a change in flight blocks an add (same lock).
  await q(`insert into billing_venue_additions(idempotency_key, owner_id, subscription_id, status) values ('r-add', $1, $2, 'requires_action')`, [
    rOwner.id,
    rBill.id,
  ]);
  assert.equal((await change("c-1", "r-two", "remove")).outcome, "busy_addition");
  await q(`update billing_venue_additions set status = 'failed' where idempotency_key = 'r-add'`);

  const removeTwo = await change("c-1", "r-two", "remove");
  assert.equal(removeTwo.outcome, "claimed");
  assert.equal(removeTwo.change_quantity_before, 3);
  assert.equal(removeTwo.change_quantity_after, 2);
  assert.equal(removeTwo.change_new_anchor_venue_id, null, "a non-anchor leaving never moves the anchor");
  assert.equal((await change("c-1", "r-two", "remove")).outcome, "existing");
  assert.equal((await change("c-1", "r-three", "remove")).outcome, "key_conflict");
  const blocked = await change("c-2", "r-three", "remove");
  assert.equal(blocked.outcome, "busy_change");
  assert.equal(blocked.change_id, removeTwo.change_id);
  const addWhileChanging = await claim("r-add-2", rOwner.id, rBill.id);
  assert.equal(addWhileChanging.outcome, "busy");
  assert.equal(addWhileChanging.addition_id, null, "a change-busy add gets no addition row");

  //    c. claiming changes nothing on the membership; finishing 'done' applies it.
  assert.equal((await member("r-two")).remove_at, null);
  assert.equal((await finish(removeTwo.change_id, "done")).outcome, "done");
  assert.ok((await member("r-two")).remove_at instanceof Date);
  assert.equal((await finish(removeTwo.change_id, "done")).outcome, "already", "finish is idempotent");
  assert.equal((await change("c-3", "r-two", "remove")).outcome, "already_leaving");

  //    d. the add claim now prices off 2 billed venues.
  const addAfter = await claim("r-add-3", rOwner.id, rBill.id);
  assert.equal(addAfter.outcome, "claimed");
  assert.equal(addAfter.addition_quantity_before, 2);
  await q(`update billing_venue_additions set status = 'failed' where id = $1`, [addAfter.addition_id]);

  //    e. the anchor leaving: the oldest billed venue with no bill row of its own takes over.
  await q(`insert into billing_subscription_venues(subscription_id, venue_id, role, added_at) values ($1, 'r-own-bill', 'added', now() - interval '9 days')`, [
    rBill.id,
  ]);
  await q(`insert into billing_subscriptions(venue_id, owner_id, status) values ('r-own-bill', $1, 'cancelled')`, [rOwner.id]);
  const removeAnchor = await change("c-4", "r-anchor", "remove");
  assert.equal(removeAnchor.outcome, "claimed");
  assert.equal(removeAnchor.change_quantity_before, 3);
  assert.equal(removeAnchor.change_new_anchor_venue_id, "r-three", "r-own-bill anchors its own (old) bill row, so it cannot");
  assert.equal(await anchorOf(rBill.id), "r-anchor", "the anchor moves only on finish");
  assert.equal((await finish(removeAnchor.change_id, "done")).outcome, "done");
  assert.equal(await anchorOf(rBill.id), "r-three");
  assert.ok((await member("r-anchor")).remove_at instanceof Date);

  //    f. the last billed venue(s): r-three and r-own-bill are billed; remove one, then the last is refused.
  const removeOwn = await change("c-5", "r-own-bill", "remove");
  assert.equal(removeOwn.outcome, "claimed");
  assert.equal((await finish(removeOwn.change_id, "failed", "card error")).outcome, "failed");
  assert.equal((await member("r-own-bill")).remove_at, null, "a failed change leaves the membership alone");
  const [failedRow] = await rows(`select status, failure_reason from billing_venue_changes where id = $1`, [removeOwn.change_id]);
  assert.deepEqual(failedRow, { status: "failed", failure_reason: "card error" });
  const removeOwnAgain = await change("c-6", "r-own-bill", "remove");
  await finish(removeOwnAgain.change_id, "done");
  assert.equal((await change("c-7", "r-three", "remove")).outcome, "last_venue");

  //    g. undo: only while leaving and before remove_at; finishing clears remove_at.
  assert.equal((await change("c-8", "r-three", "undo")).outcome, "not_leaving");
  const undoTwo = await change("c-9", "r-two", "undo");
  assert.equal(undoTwo.outcome, "claimed");
  assert.equal(undoTwo.change_quantity_before, 1);
  assert.equal(undoTwo.change_quantity_after, 2);
  assert.equal((await finish(undoTwo.change_id, "done")).outcome, "done");
  assert.equal((await member("r-two")).remove_at, null);
  await q(`update billing_subscription_venues set remove_at = now() - interval '1 minute' where venue_id = 'r-anchor'`);
  assert.equal((await change("c-10", "r-anchor", "undo")).outcome, "too_late");
  await q(`update billing_subscription_venues set removed_at = now() where venue_id = 'r-anchor'`);
  assert.equal((await change("c-11", "r-anchor", "undo")).outcome, "not_on_bill", "a removed venue comes back only through a paid add");

  //    h. drift: finishing when the membership moved underneath is recorded, not hidden.
  const removeTwoAgain = await change("c-12", "r-two", "remove");
  await q(`update billing_subscription_venues set remove_at = now() + interval '1 day' where venue_id = 'r-two'`);
  const drifted = await finish(removeTwoAgain.change_id, "done");
  assert.equal(drifted.outcome, "drift");
  const [driftRow] = await rows(`select status, failure_reason from billing_venue_changes where id = $1`, [removeTwoAgain.change_id]);
  assert.deepEqual(driftRow, { status: "done", failure_reason: "membership-not-billed" });

  //    i. no other venue can take over the anchor → no_new_anchor.
  await q(`insert into venues values ('solo-a'), ('solo-b')`);
  const [soloBill] = await rows(
    `insert into billing_subscriptions(venue_id, owner_id, status) values ('solo-a', $1, 'active') returning id`,
    [rOwner.id]
  );
  await q(`insert into billing_subscriptions(venue_id, owner_id, status) values ('solo-b', $1, 'cancelled')`, [rOwner.id]);
  await q(`update billing_subscription_venues set subscription_id = $1, role = 'added' where venue_id = 'solo-b'`, [soloBill.id]);
  assert.equal((await change("c-13", "solo-a", "remove", periodEnd, rOwner.id, soloBill.id)).outcome, "no_new_anchor");

  //    j. grants: table service_role only + RLS forced; functions service_role only.
  const changeGrants = await rows(
    `select grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
       from information_schema.role_table_grants
      where table_name = 'billing_venue_changes' and grantee in ('anon', 'authenticated', 'service_role')
      group by grantee order by grantee`
  );
  assert.deepEqual(changeGrants.map((g) => [g.grantee, g.privs]), [["service_role", "DELETE,INSERT,SELECT,UPDATE"]]);
  const [changeRls] = await rows(`select relrowsecurity, relforcerowsecurity from pg_class where relname = 'billing_venue_changes'`);
  assert.ok(changeRls.relrowsecurity && changeRls.relforcerowsecurity);
  for (const fn of ["claim_venue_bill_change", "finish_venue_bill_change", "claim_venue_addition"]) {
    const g = (
      await rows(
        `select grantee from information_schema.routine_privileges where routine_name = $1 and privilege_type = 'EXECUTE'`,
        [fn]
      )
    ).map((r) => r.grantee);
    assert.ok(g.includes("service_role"), fn);
    assert.ok(!g.includes("anon") && !g.includes("authenticated") && !g.includes("PUBLIC"), fn);
  }

  // 10. Phase 6.1 — the admin price swap is a claimed change on the same lock
  //     (claim_bill_price_change, finish_bill_price_change, finish_venue_bill_change refusing it).
  //    a. Postgres's own name for 20261011210033's inline action check — what the new file replaces.
  const actionChecks = async () =>
    (
      await rows(
        `select c.conname, pg_get_constraintdef(c.oid) as def from pg_constraint c
          where c.conrelid = 'billing_venue_changes'::regclass and c.contype = 'c'
            and pg_get_constraintdef(c.oid) like '%action%' and c.conname <> 'billing_venue_changes_price_row_check'`
      )
    ).map((r) => r.conname);
  assert.deepEqual(await actionChecks(), ["billing_venue_changes_action_check"]);

  const priceMigration = fs.readFileSync(PRICE_MIGRATION, "utf8");
  await db.exec(priceMigration);
  await db.exec(priceMigration); // re-runnable
  assert.deepEqual(await actionChecks(), ["billing_venue_changes_action_check"], "exactly one action check, replaced");

  await q(`insert into venues values ('p-anchor'), ('p-two')`);
  const [pOwner] = await rows(`insert into venue_owners default values returning id`);
  const [pBill] = await rows(
    `insert into billing_subscriptions(venue_id, owner_id, status, stripe_subscription_id)
       values ('p-anchor', $1, 'active', 'sub_price') returning id`,
    [pOwner.id]
  );
  await q(`insert into billing_subscription_venues(subscription_id, venue_id, role) values ($1, 'p-two', 'added')`, [pBill.id]);
  const priceClaim = async (key, priceId = "price_custom_7000", ownerId = pOwner.id, billId = pBill.id) =>
    (await rows(`select * from claim_bill_price_change($1, $2, $3, $4)`, [key, ownerId, billId, priceId]))[0];
  const priceFinish = async (id, outcome, reason = null) =>
    (await rows(`select * from finish_bill_price_change($1, $2, $3)`, [id, outcome, reason]))[0];
  const pChange = async (key, venue, action) =>
    (await rows(`select * from claim_venue_bill_change($1, $2, $3, $4, $5, $6)`, [key, pOwner.id, pBill.id, venue, action, periodEnd]))[0];
  const changeRow = async (id) =>
    (await rows(`select action, status, venue_id, price_id, failure_reason from billing_venue_changes where id = $1`, [id]))[0];

  //    b. the shape constraints: a price row names a Price and no venue; a remove never names a Price.
  await assert.rejects(
    q(`insert into billing_venue_changes(idempotency_key, subscription_id, action) values ('bad-action', $1, 'refund')`, [pBill.id]),
    /billing_venue_changes_action_check/
  );
  await assert.rejects(
    q(`insert into billing_venue_changes(idempotency_key, subscription_id, action) values ('bad-price-1', $1, 'price')`, [pBill.id]),
    /billing_venue_changes_price_row_check/
  );
  await assert.rejects(
    q(
      `insert into billing_venue_changes(idempotency_key, subscription_id, venue_id, action, price_id) values ('bad-price-2', $1, 'p-two', 'price', 'price_x')`,
      [pBill.id]
    ),
    /billing_venue_changes_price_row_check/
  );
  await assert.rejects(
    q(
      `insert into billing_venue_changes(idempotency_key, subscription_id, venue_id, action, price_id) values ('bad-remove', $1, 'p-two', 'remove', 'price_x')`,
      [pBill.id]
    ),
    /billing_venue_changes_price_row_check/
  );

  //    c. argument checks.
  assert.equal((await priceClaim("")).outcome, "invalid");
  assert.equal((await priceClaim("p-0", "")).outcome, "invalid");
  assert.equal((await priceClaim("p-0", "price_x", pOwner.id, "00000000-0000-0000-0000-000000000000")).outcome, "no_bill");
  assert.equal((await priceClaim("p-0", "price_x", otherOwner.id)).outcome, "not_owner");

  //    d. THE REVIEW FINDING: an add in flight blocks the swap; a remove in flight blocks it too.
  await q(`insert into billing_venue_additions(idempotency_key, owner_id, subscription_id, status) values ('p-add', $1, $2, 'pending')`, [
    pOwner.id,
    pBill.id,
  ]);
  assert.equal((await priceClaim("p-1")).outcome, "busy_addition");
  await q(`update billing_venue_additions set status = 'requires_action' where idempotency_key = 'p-add'`);
  assert.equal((await priceClaim("p-1")).outcome, "busy_addition", "a 3-D Secure add waiting is still busy");
  await q(`update billing_venue_additions set status = 'failed' where idempotency_key = 'p-add'`);

  const pRemove = await pChange("p-remove", "p-two", "remove");
  assert.equal(pRemove.outcome, "claimed");
  const blockedByRemove = await priceClaim("p-1");
  assert.equal(blockedByRemove.outcome, "busy_change");
  assert.equal(blockedByRemove.change_id, pRemove.change_id);
  assert.equal(blockedByRemove.change_action, "remove");
  assert.equal((await rows(`select count(*)::int as n from billing_venue_changes where action = 'price'`))[0].n, 0, "nothing claimed");
  assert.equal((await finish(pRemove.change_id, "failed", "test")).outcome, "failed");

  //    e. claimed; the same key returns the same row; a different Price under that key conflicts.
  const swap = await priceClaim("p-1");
  assert.equal(swap.outcome, "claimed");
  assert.equal(swap.change_status, "pending");
  assert.equal(swap.change_action, "price");
  assert.equal(swap.change_price_id, "price_custom_7000");
  assert.deepEqual(await changeRow(swap.change_id), {
    action: "price",
    status: "pending",
    venue_id: null,
    price_id: "price_custom_7000",
    failure_reason: null,
  });
  const swapAgain = await priceClaim("p-1");
  assert.equal(swapAgain.outcome, "existing");
  assert.equal(swapAgain.change_id, swap.change_id);
  assert.equal((await priceClaim("p-1", "price_other")).outcome, "key_conflict");
  assert.equal((await priceClaim("p-remove")).outcome, "key_conflict", "a remove's key is never a price swap");
  assert.equal((await change("p-1", "p-two", "remove", periodEnd, pOwner.id, pBill.id)).outcome, "key_conflict");

  //    f. while the swap is pending: a second swap, a partner add and a partner remove are all busy.
  const secondSwap = await priceClaim("p-2", "price_graduated");
  assert.equal(secondSwap.outcome, "busy_change");
  assert.equal(secondSwap.change_id, swap.change_id);
  const addDuringSwap = await claim("p-add-2", pOwner.id, pBill.id);
  assert.equal(addDuringSwap.outcome, "busy");
  assert.equal(addDuringSwap.addition_id, null);
  const removeDuringSwap = await pChange("p-remove-2", "p-two", "remove");
  assert.equal(removeDuringSwap.outcome, "busy_change");
  assert.equal(removeDuringSwap.change_id, swap.change_id);

  //    g. each finish function refuses the other's rows, writing nothing.
  const wrong = await finish(swap.change_id, "done");
  assert.equal(wrong.outcome, "wrong_action");
  assert.equal(wrong.change_status, "pending");
  assert.equal((await changeRow(swap.change_id)).status, "pending", "finish_venue_bill_change never touches a price row");
  assert.equal((await priceFinish(pRemove.change_id, "done")).outcome, "wrong_action");
  assert.equal((await changeRow(pRemove.change_id)).status, "failed");

  //    h. finishing: done (idempotent), then failed with a reason; the bill is free again after each.
  assert.equal((await priceFinish(swap.change_id, "maybe")).outcome, "invalid");
  assert.equal((await priceFinish("00000000-0000-0000-0000-000000000000", "done")).outcome, "not_found");
  assert.deepEqual(await priceFinish(swap.change_id, "done"), { outcome: "done", change_status: "done" });
  assert.deepEqual(await priceFinish(swap.change_id, "failed", "late"), { outcome: "already", change_status: "done" });
  assert.equal((await changeRow(swap.change_id)).failure_reason, null);
  const addAfterSwap = await claim("p-add-3", pOwner.id, pBill.id);
  assert.equal(addAfterSwap.outcome, "claimed", "a finished swap no longer blocks an add");
  await q(`update billing_venue_additions set status = 'failed' where id = $1`, [addAfterSwap.addition_id]);

  const swapBack = await priceClaim("p-3", "price_graduated");
  assert.equal(swapBack.outcome, "claimed");
  assert.deepEqual(await priceFinish(swapBack.change_id, "failed", "x".repeat(600)), { outcome: "failed", change_status: "failed" });
  const failedSwap = await changeRow(swapBack.change_id);
  assert.equal(failedSwap.status, "failed");
  assert.equal(failedSwap.failure_reason.length, 500);
  assert.equal((await pChange("p-remove-3", "p-two", "remove")).outcome, "claimed", "a failed swap no longer blocks a remove");

  //    i. the replaced finish_venue_bill_change still applies a remove exactly as before.
  const removeLater = (await rows(`select id from billing_venue_changes where idempotency_key = 'p-remove-3'`))[0];
  assert.equal((await finish(removeLater.id, "done")).outcome, "done");
  assert.ok((await member("p-two")).remove_at instanceof Date);

  //    j. execute is service_role only.
  for (const fn of ["claim_bill_price_change", "finish_bill_price_change", "finish_venue_bill_change"]) {
    const g = (
      await rows(
        `select grantee from information_schema.routine_privileges where routine_name = $1 and privilege_type = 'EXECUTE'`,
        [fn]
      )
    ).map((r) => r.grantee);
    assert.ok(g.includes("service_role"), fn);
    assert.ok(!g.includes("anon") && !g.includes("authenticated") && !g.includes("PUBLIC"), fn);
  }

  console.log("multi-venue billing migration: all SQL checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

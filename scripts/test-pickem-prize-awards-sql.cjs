#!/usr/bin/env node
// Isolated PostgreSQL check for supabase/migrations/20261031203914_pickem_prize_awards.sql
// (docs/pickem-college-football-and-prize-plan.md Phase 4b). No network, no application imports,
// never touches Supabase. Runs on PGlite (devDependency):
//   npm run test:pickem-prize-awards-sql
// or point at another copy: PICKEM_POINTS_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-pickem-prize-awards-sql.cjs
//
// venues, users, challenge_campaigns, challenge_cycle_winners, challenge_campaign_redemptions and
// pickem_picks are minimal stand-ins (only the columns the migration names). What is proven:
// award_pickem_tier_prize pays the highest tier reached, copies THAT tier's prize onto the ledger and
// the coupon under the tier's own key, falls to a lower tier when the top one is out of prizes, never
// pays one player twice in a period (D4), answers not_reached / exhausted without writing, refuses
// anything that isn't an "X out of N" Pick 'Em Prize at that venue; the two tables' checks, uniques,
// cascades and grants; the resolved_at index.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PICKEM_POINTS_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATION = "supabase/migrations/20261031203914_pickem_prize_awards.sql";

const SCHEMA = `
  create role anon; create role authenticated; create role service_role;
  create table public.venues(id text primary key);
  create table public.users(id uuid primary key);
  create table public.challenge_campaigns(
    id uuid primary key default gen_random_uuid(),
    name text not null,
    reward_definition_id text,
    venue_ids text[] not null default '{}',
    pickem_tiers jsonb
  );
  create table public.challenge_cycle_winners(
    challenge_id uuid not null references public.challenge_campaigns(id) on delete cascade,
    cycle_start timestamptz not null,
    winner_user_id uuid,
    venue_id text not null,
    points_earned integer not null default 0,
    prize_type text,
    prize_gift_certificate_amount numeric(10,2),
    unique (challenge_id, cycle_start, winner_user_id)
  );
  create table public.challenge_campaign_redemptions(
    id serial primary key,
    challenge_id uuid not null,
    winner_user_id uuid not null,
    venue_id text not null,
    cycle_start timestamptz not null,
    prize_expires_at timestamptz,
    reward_name text,
    prize_type text,
    prize_gift_certificate_amount numeric(10,2),
    prize_kind text,
    prize_menu_item text,
    prize_menu_item_name text,
    prize_discount_kind text,
    prize_discount_value numeric(10,2),
    prize_pos_value_cents integer,
    prize_pos_delivery text,
    unique (challenge_id, winner_user_id, cycle_start)
  );
  create table public.pickem_picks(id serial primary key, resolved_at timestamptz);
`;

const PERIOD = "2026-11-07T05:00:00Z"; // venue-local midnight (America/New_York), a whole minute
const EXPIRES = "2026-11-15T05:00:00Z";
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const TIERS = JSON.stringify([
  { place: 1, correct: 12, quantity: 2, prize_kind: "gift_card", prize_gift_certificate_amount: 10 },
  { place: 2, correct: 15, quantity: 1, prize_kind: "gift_card", prize_gift_certificate_amount: 20 },
  {
    place: 3,
    correct: 18,
    quantity: 1,
    prize_kind: "menu_item",
    prize_menu_item: "appetizer",
    prize_menu_item_name: "Nachos",
    prize_discount_kind: "percent",
    prize_discount_value: 50,
    prize_pos_value_cents: 1200,
  },
]);

async function run() {
  const db = new PGlite();
  const award = async (challengeId, user, correct, extra = {}) => {
    const { rows } = await db.query(`select * from award_pickem_tier_prize($1, $2, $3, $4, $5, $6)`, [
      challengeId,
      extra.period ?? PERIOD,
      user,
      extra.venue ?? "venue-a",
      correct,
      EXPIRES,
    ]);
    return rows[0];
  };
  const winners = async (challengeId) =>
    (
      await db.query(
        `select winner_user_id, extract(epoch from cycle_start - $2::timestamptz)::int as tier, points_earned,
                prize_gift_certificate_amount::float as amount
         from challenge_cycle_winners where challenge_id = $1 order by cycle_start, winner_user_id`,
        [challengeId, PERIOD],
      )
    ).rows;

  try {
    await db.exec(SCHEMA);
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    console.log("ok - applies");

    await db.exec(`insert into venues values ('venue-a'), ('venue-b');`);
    for (let n = 1; n <= 9; n += 1) await db.query(`insert into users values ($1)`, [U(n)]);
    const {
      rows: [{ id: tiered }],
    } = await db.query(
      `insert into challenge_campaigns(name, reward_definition_id, venue_ids, pickem_tiers)
       values ('College Saturday', 'pickem_challenge', '{venue-a}', $1) returning id`,
      [TIERS],
    );

    // ── Which tier ────────────────────────────────────────────────────────────────────────────
    assert.deepEqual(await award(tiered, U(1), 11), { status: "not_reached", tier: null });
    assert.equal((await winners(tiered)).length, 0);
    console.log("ok - below the lowest tier: not_reached, nothing written");

    assert.deepEqual(await award(tiered, U(1), 19), { status: "awarded", tier: 3 });
    const coupon = (
      await db.query(
        `select reward_name, prize_kind, prize_menu_item_name, prize_discount_kind, prize_discount_value::float as dv,
                prize_pos_value_cents, extract(epoch from cycle_start - $2::timestamptz)::int as tier
         from challenge_campaign_redemptions where challenge_id = $1 and winner_user_id = $3`,
        [tiered, PERIOD, U(1)],
      )
    ).rows[0];
    assert.deepEqual(coupon, {
      reward_name: "College Saturday",
      prize_kind: "menu_item",
      prize_menu_item_name: "Nachos",
      prize_discount_kind: "percent",
      dv: 50,
      prize_pos_value_cents: 1200,
      tier: 3,
    });
    console.log("ok - pays the top tier reached, with THAT tier's prize on the coupon, under key + 3 s");

    assert.deepEqual(await award(tiered, U(1), 19), { status: "already_won", tier: null });
    assert.deepEqual(await award(tiered, U(1), 12), { status: "already_won", tier: null });
    console.log("ok - D4: a second award for the same player in the period is refused at any tier");

    assert.deepEqual(await award(tiered, U(2), 18), { status: "awarded", tier: 2 });
    console.log("ok - the top tier out of prizes: falls to the next tier reached");

    assert.deepEqual(await award(tiered, U(3), 16), { status: "awarded", tier: 1 });
    assert.deepEqual(await award(tiered, U(4), 15), { status: "awarded", tier: 1 });
    assert.deepEqual(await award(tiered, U(5), 20), { status: "exhausted", tier: null });
    console.log("ok - every tier reached out of prizes: exhausted, nothing written");

    assert.deepEqual(
      (await winners(tiered)).map((row) => [row.winner_user_id, row.tier, row.points_earned, row.amount]),
      [
        [U(3), 1, 16, 10],
        [U(4), 1, 15, 10],
        [U(2), 2, 18, 20],
        [U(1), 3, 19, null],
      ],
    );
    assert.equal(Number((await db.query(`select count(*) from challenge_campaign_redemptions`)).rows[0].count), 4);
    console.log("ok - ledger: one row per winner, each tier within its quantity, one coupon each");

    // A different period is a fresh set of quotas.
    const nextWeek = "2026-11-14T05:00:00Z";
    assert.deepEqual(await award(tiered, U(1), 18, { period: nextWeek }), { status: "awarded", tier: 3 });
    console.log("ok - another period has its own quotas and its own D4");

    // ── Refusals ──────────────────────────────────────────────────────────────────────────────
    await assert.rejects(award(tiered, U(6), 15, { venue: "venue-b" }), /does not run at venue/);
    await assert.rejects(award(tiered, U(6), 15, { period: "2026-11-07T05:00:30Z" }), /whole minute/);
    await assert.rejects(award(tiered, U(6), -1), /negative/);
    const {
      rows: [{ id: target }],
    } = await db.query(
      `insert into challenge_campaigns(name, reward_definition_id, venue_ids) values ('Get 10', 'pickem_challenge', '{venue-a}') returning id`,
    );
    await assert.rejects(award(target, U(6), 15), /not an "X out of N"/);
    const {
      rows: [{ id: other }],
    } = await db.query(
      `insert into challenge_campaigns(name, reward_definition_id, venue_ids, pickem_tiers) values ('Trivia', 'live_trivia_challenge', '{venue-a}', $1) returning id`,
      [TIERS],
    );
    await assert.rejects(award(other, U(6), 15), /not an "X out of N"/);
    await assert.rejects(
      db.query(`select * from award_pickem_tier_prize($1, $2, $3, 'venue-a', 15, null)`, [tiered, PERIOD, U(6)]),
      /every argument is required/,
    );
    console.log("ok - refuses another venue, a non-minute key, negative counts, non-tier prizes, a missing expiry");

    // ── Tables ────────────────────────────────────────────────────────────────────────────────
    await db.query(
      `insert into pickem_prize_settlements(challenge_id, period_start, venue_id, outcome, participant_count, winner_count)
       values ($1, $2, 'venue-a', 'awarded', 9, 4)`,
      [tiered, PERIOD],
    );
    await assert.rejects(
      db.query(
        `insert into pickem_prize_settlements(challenge_id, period_start, venue_id, outcome, participant_count, winner_count)
         values ($1, $2, 'venue-a', 'no_winner', 9, 0)`,
        [tiered, PERIOD],
      ),
      /duplicate key/,
    );
    await assert.rejects(
      db.query(
        `insert into pickem_prize_settlements(challenge_id, period_start, venue_id, outcome, participant_count, winner_count)
         values ($1, '2026-11-21T05:00:00Z', 'venue-a', 'awarded', 3, 0)`,
        [tiered],
      ),
      /pickem_prize_settlements_shape_check/,
    );
    await db.query(
      `insert into pickem_prize_settlements(challenge_id, period_start, venue_id, outcome, participant_count, winner_count)
       values ($1, '2026-11-21T05:00:00Z', 'venue-a', 'below_minimum', 1, 0)`,
      [tiered],
    );
    console.log("ok - settlements: one per (prize, period); 'awarded' exactly when someone won");

    const guess = (user, total) =>
      db.query(
        `insert into pickem_prize_tiebreakers(challenge_id, period_start, user_id, venue_id, sport_key, game_id, game_starts_at, predicted_total)
         values ($1, $2, $3, 'venue-a', 'americanfootball_ncaaf', 'game-1', '2026-11-08T03:30:00Z', $4)`,
        [tiered, PERIOD, user, total],
      );
    await guess(U(7), 51);
    await assert.rejects(guess(U(7), 40), /pickem_prize_tiebreakers_unique/);
    await assert.rejects(guess(U(8), 401), /pickem_prize_tiebreakers_total_check/);
    await assert.rejects(guess(U(8), -1), /pickem_prize_tiebreakers_total_check/);
    await db.query(`delete from users where id = $1`, [U(7)]);
    assert.equal(Number((await db.query(`select count(*) from pickem_prize_tiebreakers`)).rows[0].count), 0);
    console.log("ok - tiebreakers: one guess per player per period, 0–400, removed with the player");

    await db.query(`delete from challenge_campaigns where id = $1`, [tiered]);
    assert.equal(Number((await db.query(`select count(*) from pickem_prize_settlements`)).rows[0].count), 0);
    console.log("ok - settlements go with their prize");

    // ── Grants and index ──────────────────────────────────────────────────────────────────────
    for (const table of ["pickem_prize_settlements", "pickem_prize_tiebreakers"]) {
      const { rows } = await db.query(
        `select grantee, privilege_type from information_schema.role_table_grants where table_name = $1 order by grantee, privilege_type`,
        [table],
      );
      const grantees = new Set(rows.map((row) => row.grantee));
      assert.ok(grantees.has("service_role"), `${table} grants service_role`);
      assert.ok(!grantees.has("anon") && !grantees.has("authenticated"), `${table} has no browser grant`);
      const rls = (await db.query(`select relrowsecurity, relforcerowsecurity from pg_class where relname = $1`, [table])).rows[0];
      assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });
    }
    const fnGrants = (
      await db.query(
        `select grantee from information_schema.role_routine_grants where routine_name = 'award_pickem_tier_prize' and privilege_type = 'EXECUTE'`,
      )
    ).rows.map((row) => row.grantee);
    assert.ok(fnGrants.includes("service_role"));
    assert.ok(!fnGrants.includes("anon") && !fnGrants.includes("authenticated") && !fnGrants.includes("PUBLIC"));
    const indexes = (await db.query(`select indexname from pg_indexes where schemaname = 'public'`)).rows.map((row) => row.indexname);
    assert.ok(indexes.includes("idx_pickem_picks_resolved_at"));
    console.log("ok - service_role only (RLS forced), the function too; resolved_at index exists");

    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    console.log("ok - re-applies cleanly");
  } finally {
    await db.close();
  }
}

run().then(
  () => console.log("pickem prize awards SQL: all checks passed"),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);

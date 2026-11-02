#!/usr/bin/env node
// Isolated PostgreSQL check for the Pick 'Em Phase 7.1c migration
// (docs/pickem-college-football-and-prize-plan.md §9 finding F11):
//   supabase/migrations/20261101153306_server_only_security_definer_functions.sql
// No network, no application imports, never touches Supabase. Runs on PGlite (devDependency):
//   npm run test:security-definer-sql
// or point at another copy: PICKEM_POINTS_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-security-definer-sql.cjs
//
// The ten functions are stand-ins with production's exact signatures, SECURITY DEFINER and owned
// by the superuser, created under Supabase's default privileges (EXECUTE granted to anon,
// authenticated and service_role) and then put through the same earlier revokes production had
// (`from public` in 20260216204000 / 20260227152000 / 20260601160000 / 20260601161000, `from anon`
// in 20260602140000). What is proven: before the fix a signed-in player CAN settle a market and be
// credited (the hole is real, and `revoke ... from public` never closed it); after it, anon and
// authenticated are refused on all ten; service_role still calls all ten; a trigger that calls an
// inventory refresh still fires for a player's write; the RLS helper stays callable; re-running is
// harmless.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PICKEM_POINTS_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATION = "supabase/migrations/20261101153306_server_only_security_definer_functions.sql";

// [signature, call with arguments]. The older overload of each pair has no call: with the newer
// one's trailing default, a call by position is "not unique" (in production too), so those two are
// checked through has_function_privilege only.
const LOCKED = [
  ["public.settle_prediction_market(text, text, boolean)", null],
  ["public.settle_prediction_market(text, text, boolean, text)", "select * from public.settle_prediction_market('m1', 'yes', false, 'Who wins?')"],
  ["public.get_challenge_leaderboard_snapshot(uuid, text, uuid, integer, text)", null],
  [
    "public.get_challenge_leaderboard_snapshot(uuid, text, uuid, integer, text, timestamptz)",
    "select * from public.get_challenge_leaderboard_snapshot('00000000-0000-0000-0000-000000000001'::uuid, 'venue-a', null::uuid, 10, 'first_to_score', now())",
  ],
  ["public.prune_user_analytics_raw_events(interval)", "select * from public.prune_user_analytics_raw_events(interval '90 days')"],
  ["public.refresh_user_analytics_rollups()", "select public.refresh_user_analytics_rollups()"],
  [
    "public.refresh_live_trivia_inventory_summary_for_venue_category(text, text)",
    "select public.refresh_live_trivia_inventory_summary_for_venue_category('venue-a', 'History')",
  ],
  ["public.refresh_live_trivia_inventory_summary_for_category(text)", "select public.refresh_live_trivia_inventory_summary_for_category('History')"],
  ["public.refresh_live_trivia_inventory_summary_for_venue(text)", "select public.refresh_live_trivia_inventory_summary_for_venue('venue-a')"],
  ["public.refresh_live_trivia_inventory_summary()", "select public.refresh_live_trivia_inventory_summary()"],
];

const PLAYER_AUTH = "11111111-1111-1111-1111-111111111111";

const SCHEMA = `
  create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase's default privileges for functions (not changed by 20260923130842, which covers
  -- tables and sequences only).
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create table public.users(id uuid primary key, venue_id text not null, points integer not null default 0);
  create table public.calls(fn text not null);
  create table public.trivia_questions(id serial primary key, category text);
  insert into public.users values ('00000000-0000-0000-0000-0000000000aa', 'venue-a', 40);

  create function public.settle_prediction_market(p_prediction_id text, p_winning_outcome_id text default null, p_settle_as_canceled boolean default false)
  returns table (settled boolean) language plpgsql security definer set search_path = public as $$
  begin
    update users set points = points + 500;
    return query select true;
  end $$;
  create function public.settle_prediction_market(p_prediction_id text, p_winning_outcome_id text default null, p_settle_as_canceled boolean default false, p_market_question text default null)
  returns table (settled boolean) language plpgsql security definer set search_path = public as $$
  begin
    update users set points = points + 500;
    return query select true;
  end $$;
  create function public.get_challenge_leaderboard_snapshot(p_challenge_id uuid, p_venue_id text, p_viewer_user_id uuid default null, p_limit integer default 10, p_tiebreaker text default 'first_to_score')
  returns table (user_id uuid, points_earned integer) language sql stable security definer set search_path = public as $$
    select id, points from users
  $$;
  create function public.get_challenge_leaderboard_snapshot(p_challenge_id uuid, p_venue_id text, p_viewer_user_id uuid default null, p_limit integer default 10, p_tiebreaker text default 'first_to_score', p_cycle_start timestamptz default null)
  returns table (user_id uuid, points_earned integer) language sql stable security definer set search_path = public as $$
    select id, points from users
  $$;
  create function public.prune_user_analytics_raw_events(raw_retention interval default interval '90 days')
  returns table (deleted bigint) language plpgsql security definer set search_path = public as $$
  begin
    insert into calls values ('prune');
    return query select 0::bigint;
  end $$;
  create function public.refresh_user_analytics_rollups()
  returns void language plpgsql security definer set search_path = public as $$
  begin insert into calls values ('rollups'); end $$;
  create function public.refresh_live_trivia_inventory_summary_for_venue_category(target_venue_id text, target_category text)
  returns void language plpgsql security definer set search_path = public as $$
  begin insert into calls values ('inventory:venue_category'); end $$;
  create function public.refresh_live_trivia_inventory_summary_for_category(target_category text)
  returns void language plpgsql security definer set search_path = public as $$
  begin insert into calls values ('inventory:category'); end $$;
  create function public.refresh_live_trivia_inventory_summary_for_venue(target_venue_id text)
  returns void language plpgsql security definer set search_path = public as $$
  begin insert into calls values ('inventory:venue'); end $$;
  create function public.refresh_live_trivia_inventory_summary()
  returns void language plpgsql security definer set search_path = public as $$
  begin insert into calls values ('inventory:all'); end $$;

  -- The production trigger path (20260701052000): a SECURITY DEFINER trigger function calls a
  -- refresh as its owner, so revoking the refresh from the player roles must not break it.
  create function public.live_trivia_inventory_questions_trigger()
  returns trigger language plpgsql security definer set search_path = public as $$
  begin
    perform refresh_live_trivia_inventory_summary_for_category(new.category);
    return new;
  end $$;
  create trigger trivia_questions_live_trivia_inventory_summary_insert
    after insert on public.trivia_questions
    for each row execute function public.live_trivia_inventory_questions_trigger();
  grant insert on public.trivia_questions to authenticated, service_role;
  grant usage on sequence public.trivia_questions_id_seq to authenticated, service_role;

  -- An RLS helper that must stay callable (left alone on purpose).
  create function public.is_current_user_for_analytics(target_user_id uuid, target_venue_id text)
  returns boolean language sql stable security definer set search_path = public as $$ select true $$;

  -- Production's earlier revokes.
  revoke all on function public.settle_prediction_market(text, text, boolean) from public;
  grant execute on function public.settle_prediction_market(text, text, boolean) to service_role;
  revoke all on function public.settle_prediction_market(text, text, boolean, text) from public;
  grant execute on function public.settle_prediction_market(text, text, boolean, text) to service_role;
  revoke all on function public.prune_user_analytics_raw_events(interval) from public;
  grant execute on function public.prune_user_analytics_raw_events(interval) to service_role;
  revoke all on function public.refresh_user_analytics_rollups() from public;
  grant execute on function public.refresh_user_analytics_rollups() to service_role;
  revoke execute on function public.settle_prediction_market(text, text, boolean) from anon;
  revoke execute on function public.settle_prediction_market(text, text, boolean, text) from anon;
  revoke execute on function public.prune_user_analytics_raw_events(interval) from anon;
  revoke execute on function public.refresh_user_analytics_rollups() from anon;
`;

const DENIED = /permission denied/i;

async function run() {
  const db = new PGlite();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;

  // Runs `fn` as `role`, always returning to the superuser.
  const as = async (role, fn) => {
    await db.exec(`set role ${role}`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [role === "authenticated" ? PLAYER_AUTH : ""]);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role`);
      await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };
  const canExecute = async (role, signature) =>
    (await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, signature]))[0].ok;
  const points = async () => (await rows(`select points from users`))[0].points;

  try {
    await db.exec(SCHEMA);

    // ── Before the fix: the hole is real, and the old `from public` / `from anon` revokes left it ─
    await db.exec("begin");
    await as("authenticated", () => rows(LOCKED[1][1]));
    assert.equal(await points(), 540);
    await db.exec("rollback");
    for (const [signature] of LOCKED) {
      assert.equal(await canExecute("authenticated", signature), true, `before: authenticated on ${signature}`);
    }
    assert.equal(await canExecute("anon", "public.get_challenge_leaderboard_snapshot(uuid, text, uuid, integer, text)"), true);
    console.log("ok - before the fix a signed-in player can settle a market and be credited; all ten are callable");

    await db.exec(fs.readFileSync(MIGRATION, "utf8"));

    // ── After: anon and authenticated are refused on all ten ─────────────────────────────────────
    for (const [signature, call] of LOCKED) {
      for (const role of ["anon", "authenticated"]) {
        assert.equal(await canExecute(role, signature), false, `${role} EXECUTE on ${signature}`);
        if (call) await assert.rejects(as(role, () => rows(call)), DENIED, `${role}: ${call}`);
      }
    }
    assert.equal(await points(), 40);
    assert.equal((await rows(`select count(*)::int as n from calls`))[0].n, 0);
    // PUBLIC holds nothing either (no role can reach them through PUBLIC).
    const publicGrants = await rows(`
      select p.oid::regprocedure::text as signature
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where acl.grantee = 0 and p.pronamespace = 'public'::regnamespace
        and p.proname in ('settle_prediction_market', 'get_challenge_leaderboard_snapshot', 'prune_user_analytics_raw_events',
          'refresh_user_analytics_rollups', 'refresh_live_trivia_inventory_summary_for_venue_category',
          'refresh_live_trivia_inventory_summary_for_category', 'refresh_live_trivia_inventory_summary_for_venue',
          'refresh_live_trivia_inventory_summary')`);
    assert.deepEqual(publicGrants, []);
    console.log("ok - after the fix anon and authenticated (and PUBLIC) can't execute any of the ten");

    // ── The server (service_role) still calls all ten ────────────────────────────────────────────
    await as("service_role", async () => {
      for (const [, call] of LOCKED) if (call) await rows(call);
    });
    for (const [signature] of LOCKED) assert.equal(await canExecute("service_role", signature), true, signature);
    assert.equal(await points(), 540);
    assert.equal((await rows(`select count(*)::int as n from calls`))[0].n, 6);
    console.log("ok - service_role still executes all ten");

    // ── The trigger path still works, even for a player's write ──────────────────────────────────
    await rows(`delete from calls`);
    await as("authenticated", () => rows(`insert into trivia_questions(category) values ('History')`));
    await as("service_role", () => rows(`insert into trivia_questions(category) values ('Sports')`));
    assert.deepEqual((await rows(`select fn from calls`)).map((row) => row.fn), ["inventory:category", "inventory:category"]);
    console.log("ok - the inventory trigger still refreshes (the trigger function runs as the owner)");

    // ── Left alone on purpose ────────────────────────────────────────────────────────────────────
    assert.equal(await canExecute("authenticated", "public.is_current_user_for_analytics(uuid, text)"), true);
    console.log("ok - the RLS helper stays callable by authenticated");

    // ── Re-running the migration is harmless ─────────────────────────────────────────────────────
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    assert.equal(await canExecute("service_role", LOCKED[0][0]), true);
    assert.equal(await canExecute("authenticated", LOCKED[0][0]), false);
    console.log("ok - the migration re-runs cleanly");
  } finally {
    await db.close();
  }
}

run().then(
  () => console.log("security definer lockdown SQL: all checks passed"),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);

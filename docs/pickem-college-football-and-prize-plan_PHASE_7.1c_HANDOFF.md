# Pick 'Em plan: Phase 7.1c handoff (players can't call server-only database functions)

Plan: `docs/pickem-college-football-and-prize-plan.md` — finding **F11** in §9, "### Phase 7.1c" in §7, Andrew's answer
§8 Q6 ("Yes", 2026-11-01). Previous handoff: `…_PHASE_7.2_HANDOFF.md`. Built 2026-11-01, in the same session as 7.3
(`…_PHASE_7.3_HANDOFF.md`, the latest handoff).

## For Andrew (plain English)

**What changed:** one small database change is written and tested, but **not applied**. It stops signed-in players from
running ten "server only" database functions directly. The important one settles a Predictions market and pays the
winners: before this change, a player who knew how could probably settle any market with the answer they wanted and
collect the points. While checking every similar function (as planned), I found six more with the same gap and added
them to the same change:
- a leaderboard lookup that hands out every player's internal id, username and points for any prize at any bar (it was
  open even to logged-out visitors);
- four Live Trivia "recount the question inventory" jobs and two analytics jobs that anyone could have triggered over
  and over (cost, not money).

Nothing in the app calls these from a phone (only the server does), so nobody will notice any change. A new automatic
check now fails if any future database function is left open to players the same way.

**Is it live?** No. It's a file waiting for you: `supabase/migrations/20261101153306_server_only_security_definer_functions.sql`.
It doesn't depend on the code deploy, so you can apply it any time, even during the App Store freeze. It only removes
permissions the app doesn't use.

**What needs you:** apply it when you're ready (how: §8). Nothing else.

## For the next agent

### 1. Next phase goal and scope
7.3 was built right after this in the same session; **the next phase is 7.4** (stuck pending picks can't stop
settlement, F4; Opus 5.5 · high). Its spec is "### Phase 7.4" in plan §7; start from `…_PHASE_7.3_HANDOFF.md`. Out of
scope for 7.4: 7.5, 7.6, F7.

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated). Phases 1–6, all Phase 7 docs, 7.1/7.1b/7.2/7.1c/7.3 are
  **uncommitted** (Andrew hasn't asked for a commit). Nothing pushed or deployed. `main` is frozen for App Store review:
  never push `main`, never `supabase db push`, never change Production env without Andrew.
- **Production DB:** unchanged by this phase (nothing written, nothing read). `20261101153306` is **not applied**. The
  earlier seven Pick 'Em migrations (incl. 7.1/7.1b) are applied.
- No data scripts, no backups needed: the migration only revokes/grants EXECUTE.

### 3. Decisions already made (don't re-ask)
- §8 Q6: **Yes** (Andrew, 2026-11-01).
- The six extra functions were added WITHOUT a separate question: the plan's 7.1c scope said "after re-scanning every
  SECURITY DEFINER function for the same gap", and all six are server-only (no browser caller), same fix, same file.
- Revoke from `public, anon, authenticated` (all three; `from public` alone does nothing on Supabase, whose default
  privileges grant EXECUTE to anon/authenticated/service_role explicitly) and `grant execute … to service_role`
  explicitly (the leaderboard and inventory functions never had an explicit service_role grant — they worked via
  defaults/PUBLIC).
- **Left alone on purpose:** trigger functions (the API can't call a `returns trigger` function, and triggers don't
  check EXECUTE at fire time) and the three RLS helpers `current_admin_venue_ids()`,
  `is_current_user_for_analytics(uuid,text)`, `is_current_admin_for_analytics_venue(text)` (RLS policies run them as the
  querying role, so `authenticated` must keep EXECUTE; each only answers about the caller). They're the allowlist in the
  contract test.

### 4. Files created or changed
- `supabase/migrations/20261101153306_server_only_security_definer_functions.sql` (new): for each of
  `settle_prediction_market(text,text,boolean)`, `settle_prediction_market(text,text,boolean,text)`,
  `get_challenge_leaderboard_snapshot(uuid,text,uuid,integer,text)`,
  `get_challenge_leaderboard_snapshot(uuid,text,uuid,integer,text,timestamptz)`, `prune_user_analytics_raw_events(interval)`,
  `refresh_user_analytics_rollups()`, `refresh_live_trivia_inventory_summary_for_venue_category(text,text)`,
  `refresh_live_trivia_inventory_summary_for_category(text)`, `refresh_live_trivia_inventory_summary_for_venue(text)`,
  `refresh_live_trivia_inventory_summary()`: `revoke all … from public, anon, authenticated;` +
  `grant execute … to service_role;`. Header explains why, callers, what was left alone.
- `scripts/test-security-definer-sql.cjs` (new) + `package.json` `"test:security-definer-sql"`: PGlite proof. Stand-ins
  with production's exact signatures, SECURITY DEFINER, created under Supabase-like default privileges, then put through
  production's earlier `from public` / `from anon` revokes. Proves: before, a signed-in player settles a market and is
  credited, and all ten are executable; after, anon/authenticated (and PUBLIC) hold no EXECUTE and calls are refused,
  service_role still executes all ten, the inventory trigger still refreshes for a player's insert (trigger function runs
  as the owner), the RLS helper stays callable, the migration re-runs cleanly. The older overload of each pair is checked
  by `has_function_privilege` only: a positional call is "not unique" with the newer overload's trailing default (true in
  production too).
- `tests/security-definer-execute-contract.test.ts` (new, in `npm run test`): replays every migration (creates, drops,
  revokes, grants, per signature with normalized types; `create or replace` of an existing signature keeps its ACL, a new
  signature starts open to anon/authenticated) and fails if any live SECURITY DEFINER function — not a trigger, not an
  allowlisted RLS helper — ends executable by anon or authenticated. Also pins that the 7.1c file revokes exactly the ten
  signatures from `public, anon, authenticated`, grants each to `service_role`, and that each signature really exists (a
  wrong signature would make the migration fail in production). Self-test of the replay included.
- Plan: status line, Phase 7 restructured into real sub-phase headings with a model/effort table, F11 row. `CLAUDE.md`
  Pick 'Em Phase 7 bullet. This file.

### 5. Facts and traps
- **The replay is non-vacuous:** with the 7.1c file excluded, the contract test reports exactly the ten signatures above
  (16 role/function pairs: settle/prune/rollups open to authenticated only, the other six to anon too) — matching the
  manual scan. Checked 2026-11-01 with a throwaway copy of the test.
- The parser removes dollar-quoted bodies before splitting on `;`, so `security definer` / `returns trigger` are read from
  the header and trailer only. Comma-separated revoke lists (`20261013120000_speed_trivia_admission.sql`) are handled.
  Revoke/grant argument lists are read as types only (true of every migration in this repo); a future revoke that names
  argument names would be mis-keyed and the test would (safely) fail.
- `get_challenge_leaderboard_snapshot` has TWO live overloads (5-arg from `20260601113000`, never dropped; 6-arg from
  `20260617000002`). `lib/challengeCampaigns.ts:1091` calls it through `supabaseAdmin`.
- Callers: `settle_prediction_market` only `lib/admin.ts:3607` (`supabaseAdmin`). Prune / rollups / inventory refreshes
  have no app caller (inventory refreshes run from SECURITY DEFINER trigger functions as the owner).
- **Live state still unverified:** `supabase db dump` needs Docker (not installed). I tried one read-only public-key call
  of the STABLE leaderboard function to confirm anon can call it today; it needed `.env.local` and that Bash read was
  denied, so I stopped there. Never probe `settle_prediction_market` on production (it writes).
- Typecheck and build must not run at the same time (`.next/types`).

### 6. Build / test / verification (2026-11-01, after 7.1c AND 7.3)
- `npx tsc --noEmit` clean; `npx eslint` clean on every new/changed file.
- `npm run test` after 7.1c alone: 5,984 pass / 13 skipped / 4 fail; after 7.3 too: 5,994 pass / 13 skipped / 4 fail.
  The 4 are the same date-based Prop Bingo star-index tripwires as every phase since 1
  (`tests/lib.sportsBingo.{nfl,mlb}-star-index{,-freshness}.test.ts`).
- `npm run test:security-definer-sql`, `test:player-write-lockdown-sql`, `test:pickem-points-sql`,
  `test:pickem-lines-sql`, `test:pickem-prizes-sql`, `test:pickem-prize-awards-sql` pass. `npm run test:bingo-nfl`: 292
  pass, 2 fail (the NFL half of the same star-index tripwires).
- `npm run build`: see `…_PHASE_7.3_HANDOFF.md` §6.
- **Unverified:** live function grants (no Docker); PGlite is not Supabase (the default-privilege setup is simulated).

### 7. Open questions for Andrew
- Apply `20261101153306` (his call; independent of the deploy).
- Still open from before: §8 Q1 (NBA/WNBA spreads later), Q3 (Pick 'Em standings in Partner Results; default no).

### 8. How Andrew applies it, and how to check
- `supabase migration list` first: only `20261101153306` should be pending. Then `supabase db push` (applies to the
  linked production project `pkmxupsayzshvpirkaav`).
- After: the app keeps working (only the server calls these). A player/public-key call to
  `/rest/v1/rpc/get_challenge_leaderboard_snapshot` answers 42501 / "permission denied" instead of rows.
- Undo (only if something unexpected breaks): a NEW migration granting EXECUTE back to the role that needs it — and
  `tests/security-definer-execute-contract.test.ts` would then fail until the function is deliberately allowlisted.

### 9. Recommended first steps for the next phase
Go to `…_PHASE_7.3_HANDOFF.md` §9 (Phase 7.4, Opus 5.5 · high).

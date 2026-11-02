# Pick 'Em plan: Phase 7.1 + 7.1b handoff (players can't write `pickem_picks` or `users`)

Plan: `docs/pickem-college-football-and-prize-plan.md` — finding **F1** and new finding **F11** in §9, the 7.1 bullet
under "### Phase 7" in §7, answered questions §8 Q4–Q5 and new question **§8 Q6**. Previous handoff:
`docs/pickem-college-football-and-prize-plan_PHASE_7_HANDOFF.md` (the review). Built 2026-11-01.

## For Andrew (plain English)

**What changed:** two small database changes are written and tested, but **not applied**:
1. Players can no longer write their own Pick 'Em picks straight into the database (so nobody can mark a lost pick as
   won and get paid or move up a prize).
2. As you asked (§8 Q4 "Yes"), players can no longer write their own profile row either (so nobody can set their own
   points).

Players can still *read* their own rows, exactly as before. Nothing in the app writes these tables from a phone — the
server does all of it — so nobody will notice any change. A new automatic check fails if anyone ever re-opens these
writes later.

**Is it live?** No. The two database changes are files in the repo, waiting for you. They don't depend on the code
deploy, so you can apply them any time — even during the App Store freeze, like the additive Pick 'Em changes you
applied on 2026-10-31. They only *remove* permissions the app doesn't use. Applying them is your call.

**Your answer on Q5** (TBA college kickoffs): left as the default — no change. Recorded in the plan.

**One new problem I found while checking (F11, needs your yes — §8 Q6):** the database function that settles a
Predictions market and pays the winners (`settle_prediction_market`) was locked away from logged-out visitors in June,
but probably *not* from signed-in players — and every player is "signed in" to the database behind the scenes. If so, a
player who knows how could settle any market with the answer they want and collect the points. I couldn't confirm it
on the live database without either installing Docker or actually calling the function on production (which I won't do).
The fix is another tiny database change (call it 7.1c). It isn't Pick 'Em, so I need your yes. I recommend yes.

**What needs you:**
- Apply the two migrations when you're ready (how: §8 below).
- Answer §8 Q6 (lock `settle_prediction_market` too?).

## For the next agent

### 1. Next phase goal and scope
**Next: Phase 7.2 — the venue Prizes panel tells the truth about Pick 'Em Prizes (F2). Opus 5.5 · high.** Spec: the 7.2
bullet in plan §7 and the "F2 mechanics" paragraph in `…_PHASE_7_HANDOFF.md` §5. Out of scope for 7.2: 7.3–7.5, F11.

**If Andrew answers §8 Q6 yes before/while you work, 7.1c is a separate small sub-phase** (its own handoff): a NEW
migration that revokes EXECUTE from `authenticated` (and `anon`, `public`, harmlessly) on
`public.settle_prediction_market(text, text, boolean)` (if it still exists — `20260602140000` names it, so it probably
does), `public.settle_prediction_market(text, text, boolean, text)`, `public.prune_user_analytics_raw_events(interval)`,
`public.refresh_user_analytics_rollups()`; keep `grant execute … to service_role`. The only caller is
`lib/admin.ts:3607` via `supabaseAdmin`. Add a PGlite proof and extend the contract test. Before writing it, re-scan
every SECURITY DEFINER function in `supabase/migrations/` for a missing `authenticated` revoke (comma-separated revoke
lists, as in `20261013120000_speed_trivia_admission.sql`, are easy to miss with a regex — read them).

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated). Phases 1–6, the Phase 7 docs and this phase are all
  **uncommitted** (Andrew hasn't asked for a commit). Nothing pushed or deployed. `main` is frozen for App Store review:
  never push `main`, never `supabase db push`, never change Production env without Andrew.
- **Production DB:** unchanged by this phase (nothing was written). The two new migrations are **not applied**. The five
  earlier Pick 'Em migrations are applied (2026-11-01 `supabase migration list`).
- No backups/data scripts needed: the migrations only revoke privileges and drop two policies each.

### 3. Decisions already made (don't re-ask)
- §8 Q4 (lock `users` too): **Yes** (Andrew, 2026-11-01) → built as 7.1b, a SEPARATE file so either can be applied or
  reverted alone.
- §8 Q5 (TBA college kickoffs, F7): **leave the default** (Andrew, 2026-11-01) → build nothing for F7.
- Kept SELECT and the read policies ("Users can read own pickem picks", "Users can read own profiles") on purpose: the
  plan said so, and the `pickem_picks` read policy subqueries `users`, so `users` SELECT must stay for it to work.
- Revoked TRUNCATE, REFERENCES and TRIGGER as well as INSERT/UPDATE/DELETE (TRUNCATE ignores RLS; none is used by
  anyone but the server). The plan listed insert/update/delete/truncate; the extra two are a strict tightening.
- Did NOT revoke anything from `service_role` (the server's role, `lib/supabaseAdmin.ts`).

### 4. Files created or changed
- `supabase/migrations/20261101150024_pickem_picks_server_only_writes.sql` (new, 7.1): `revoke insert, update, delete,
  truncate, references, trigger on table public.pickem_picks from anon, authenticated;` + drops "Users can insert own
  pickem picks" and "Users can update own pickem picks". Header says why, what stays, deploy independence.
- `supabase/migrations/20261101150026_users_server_only_writes.sql` (new, 7.1b): same for `public.users`, dropping
  "Users can create own profiles" and "Users can update own profiles".
- `scripts/test-player-write-lockdown-sql.cjs` (new): PGlite proof. Stand-in `users`/`pickem_picks` tables with the
  production policies copied verbatim from `20260214153000_initial_schema.sql` / `20260427113000_add_pickem_tables.sql`
  and the ALL grants from `20260923130841_explicit_api_grants_baseline.sql`; `auth.uid()` reads
  `request.jwt.claim.sub`. Proves: BEFORE the fix a signed-in player can forge a won pick / un-pay a paid pick / set
  own points / add a profile (so the test isn't vacuous); AFTER, authenticated and anon get "permission denied" on
  insert/update/delete/truncate of both tables, rows unchanged, only the read policies remain, anon/authenticated keep
  SELECT and nothing else (`has_table_privilege`), a player still reads only their own rows, service_role still
  inserts/updates/deletes both tables, and re-running both migrations is harmless.
- `package.json`: `"test:player-write-lockdown-sql": "node scripts/test-player-write-lockdown-sql.cjs"`.
- `tests/player-table-write-lockdown-contract.test.ts` (new, runs in `npm run test`): (a) each lockdown file revokes
  the four writes from `anon, authenticated` and drops its two write policies, and never mentions SELECT; (b) no
  migration NEWER than the lockdown file grants all/insert/update/delete/truncate on the table to
  anon/authenticated/public (including `on all tables in schema public`), creates a non-`for select` policy on it, or
  disables its RLS; (c) a self-test of that detector; (d) no `app/ components/ lib/` file importing `@/lib/supabase`
  (the browser client) names `pickem_picks` or `.from("users")`.
- `docs/pickem-college-football-and-prize-plan.md`: status line; 7.1 bullet marked built; §8 Q4/Q5 answers; new §8 Q6;
  new §9 row F11.
- `CLAUDE.md` (Pick 'Em Phase 7 bullet): 7.1/7.1b built, not applied; "never add a browser write to `pickem_picks` or
  `users`".
- This file.

### 5. Facts and traps
- **Browser-client usage (re-checked 2026-11-01):** the 9 files importing `@/lib/supabase` use only
  `.from("venues")`, `.from("live_player_stats")`, realtime `.channel(…)` broadcasts and `auth.*`
  (`signInAnonymously`, `getSession`, `signOut`). No `.rpc(`, no `/rest/v1/` fetch anywhere in `app lib components`.
  The two server files that use the anon key (`app/api/owner/auth/login/route.ts`, `lib/ownerAccount.ts`) call only
  `/auth/v1/token`. `app/api/join/profile/route.ts` writes `users` through `supabaseAdmin`.
- Triggers on `users` (`users_set_username_normalized`, `users_sync_auth_display_name`) and FK cascade actions run
  regardless of the revoked grants — unaffected.
- The points RPCs added recently (`pay_pickem_points`, `credit_seasonal_points`, the Squares RPCs, `claim_pickem_points`
  since `20261031182914`) already revoke EXECUTE from `public, anon, authenticated`. SECURITY DEFINER functions are NOT
  closed by table revokes — they run as their owner — hence F11.
- **F11 evidence:** `settle_prediction_market(p_prediction_id, p_winning_outcome_id, p_settle_as_canceled,
  p_market_question)` is `security definer`; revokes in history: `from public` (`20260227152000`, `20260421113000`),
  `from anon` (`20260602140000`) — never `authenticated`. `20260923130842_adopt_explicit_grant_defaults.sql` changed
  default privileges for tables and sequences only ("Functions (EXECUTE) are not affected").
- **`supabase db dump --linked` needs Docker** (not installed on this Mac: `LegacyDockerRunError`). So the live
  policies and function ACLs are still not read directly. Don't probe by calling an RPC on production.
- I wrote two scratch logs to `/tmp/claude-sql-*.log` by mistake and deleted them; nothing else outside the repo and
  the scratchpad.
- `supabase/migrations/Warnings` is an old non-migration file (a Supabase advisor JSON, committed in `ef5d1c0e`) —
  ignore it; the contract tests filter on `^\d{14}_.*\.sql$`.
- Typecheck and build must not run at the same time (`.next/types`).

### 6. Build / test / verification (2026-11-01, after the change)
- `npx tsc --noEmit` clean.
- `npx eslint tests/player-table-write-lockdown-contract.test.ts scripts/test-player-write-lockdown-sql.cjs` clean.
- `npm run test`: 5,964 pass / 13 skipped / **4 fail** — the same four date-based Prop Bingo star-index tripwires as
  Phases 1–7 (`tests/lib.sportsBingo.{nfl,mlb}-star-index{,-freshness}.test.ts`). The new contract test (6 tests) and
  `tests/supabase-migration-grants-contract.test.ts` pass.
- `npm run test:pickem-points-sql`, `test:pickem-lines-sql`, `test:pickem-prizes-sql`, `test:pickem-prize-awards-sql`,
  `test:player-write-lockdown-sql` all pass.
- `npm run build` passes.
- **Unverified:** the live policy list and live function grants (no Docker); F11 on production; PGlite is one
  connection (not relevant here — no concurrency in a revoke).

### 7. Open questions for Andrew
- **§8 Q6 (new):** lock `settle_prediction_market` (+ the two analytics functions) away from signed-in players as 7.1c?
  Recommended yes.
- **Apply 7.1/7.1b** (his call; independent of the deploy).
- Still open from before: §8 Q1 (NBA/WNBA spreads later), Q3 (Pick 'Em standings in Partner Results; default no).

### 8. How Andrew applies the migrations, and how to check
- `supabase db push` applies every unapplied migration in `supabase/migrations/` to the LINKED production project
  (`pkmxupsayzshvpirkaav`). Check first with `supabase migration list` that only `20261101150024` and `20261101150026`
  are pending (plus any 7.1c file if one exists by then).
- After applying: the app keeps working (players read nothing from these tables in the browser). A public-key SELECT on
  `pickem_picks`/`users` still answers (0 rows for anon — RLS); a write is refused with 42501. Prove refusals in PGlite,
  never by writing to production.
- Undo (only if something unexpected breaks): a NEW migration re-granting the revoked privileges and re-creating the two
  policies per table, copied from `20260214153000_initial_schema.sql` lines 146–155 and
  `20260427113000_add_pickem_tables.sql` lines 53–62 — and the contract test would then have to be changed on purpose.

### 9. Recommended first steps for 7.2 (Opus 5.5 · high)
1. Read plan §9 F2, the 7.2 bullet in §7, and `…_PHASE_7_HANDOFF.md` §5 "F2 mechanics".
2. Read `getChallengeCampaignSnapshotForUser` / `resolveCurrentCycleWinnersForSnapshot` in `lib/challengeCampaigns.ts`,
   `pickemPrizePeriodAt` / `pickemPrizeCycleStart` in `lib/pickemPrizes.ts`, and the venue Prizes panel's gauge
   (`RewardProgressGauge`).
3. Keep the 30-second guest poll at zero extra requests (plan 7.2 text). Tests in
   `tests/lib.rewards-cycle-snapshot.test.ts`.

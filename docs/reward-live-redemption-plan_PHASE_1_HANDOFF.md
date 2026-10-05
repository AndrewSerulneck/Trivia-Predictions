# Live Coupon plan — Phase 1 handoff (redemption bugs fixed)

**Plan:** `docs/reward-live-redemption-plan.md` · **Phase:** 1 of 3 · **Written:** 2026-10-05 ·
**By:** Claude Opus 5.5 (high) · **Next:** Phase 2 — the live coupon (Sonnet 5.5, high).

---

## For Andrew (plain English)

**What changed.** Prize coupons are now safe in three ways guests never see:

1. **Only you can see or spend your prizes.** Before, anyone who knew a player's ID could list
   that player's prizes or mark them redeemed. Now every prize request is checked against the
   player's signed login cookie; a mismatch is refused.
2. **A coupon can be redeemed once.** Before, two taps at the same moment (two phones, two tabs)
   could both say "Redeemed!". Now the database itself makes it once-only, and a second tap gets
   "This prize was already redeemed." instead of a second success screen.
3. **A bug I found while doing this:** *every reward made by a partner* (both live ones — the Live
   Trivia and NFL Pick 'Em rewards) **could not be redeemed at all.** Tapping "Confirm Redemption"
   would have said "This challenge does not have a prize coupon." Nobody has hit it yet (all 6
   coupons ever issued are old-style and already expired), but the first winner of a partner
   reward would have. This is fixed too.

**Is it live?** **No.** Nothing is committed, pushed, deployed, or applied to the database.

**What I need from you — one decision, in this order:**

1. **OK to apply the database change to production?** It only *adds* a column and a function;
   nothing existing changes, and the current live site keeps working the same before and after.
   ⚠️ The command (`supabase db push`) applies **every** pending change, so it will also apply the
   POS plan's database change (`20261004192844_pos_foundation.sql`), which is also still pending
   and also add-only. Say "yes to both" or tell me to hold.
2. **Then** commit + deploy the code. **The order matters:** if the code goes live before the
   database change, redeeming a prize shows "temporarily unavailable" until the database change
   is applied (it fails safe — it never redeems without the once-only check).

**What's left in the plan:** Phase 2 (the moving coupon with the ticking clock and tap-sparkle)
and Phase 3 (code review + your phone check).

---

## For the next agent (Phase 2)

### 1. Goal and scope of Phase 2

Read `docs/reward-live-redemption-plan.md` §3 "Phase 2 — The live coupon" — it is the spec.
In short: new `components/prizes/LiveCouponFrame.tsx` wrapping the `large` coupon inside
`RedeemModal` (`components/prizes/PrizeWalletPanel.tsx`); holographic band (`coupon-shimmer`
keyframe in `tailwind.config.ts`), `HH:MM:SS` clock from **server** time (add `serverNowMs` to the
wallet GET), guest username + venue name, tap → sparkle + `haptic("light")`, staff tip line,
Screen Wake Lock, Reduce Motion branch. Zero new requests/routes/polling.

**Out of scope (Andrew, 2026-10-03):** staff PIN, staff scan page, rotating codes/QR, POS, native
apps. Do not touch the redeem backend built in Phase 1 except to read from it.

### 2. Starting state

- Branch `main`. Last commit `b23ddac` ("Reward descriptions: record 2026-10-04 production deploy
  in plans and handoff"). **Phase 1 is entirely uncommitted**, sitting in the same working tree as
  the POS plan's uncommitted Phase 1 (see §4 for which files are whose).
- Nothing pushed or deployed. **Migration `20261005123950_reward_redeem_once.sql` is NOT applied**
  to production (`pkmxupsayzshvpirkaav`). Probed read-only 2026-10-05: column `redeemed_method`
  → 42703 (absent), RPC → PGRST202 (absent). Andrew's OK is required before `supabase db push`;
  see the warning above about it also pushing `20261004192844_pos_foundation.sql`.
- **Deploy order: migration first, then code.** Code-before-migration fails closed (redeem → 503,
  log `[RewardRedeem] rpc-missing`). Migration-before-code is harmless (old code ignores both the
  column and the function).
- No production data changed. No backups needed (no data writes). Production at 2026-10-05:
  6 redemption rows ever, 0 redeemed, all 6 expired, all on legacy `prize_type='gift_certificate'`
  campaigns. Live campaigns: 2 partner rewards with `prize_type=null, prize_kind='gift_card'`
  (`live_trivia_challenge`, `nfl_pickem_challenge`), 2 legacy `gift_certificate`, 1 prize-less.

### 3. Decisions made (don't re-ask)

- **Andrew (2026-10-03, plan §5):** motion-only coupon; guest keeps tapping "Confirm Redemption"
  themselves. Phase 1 stays in the plan (he did not ask to drop it).
- **Mine, within the plan's brief — flag in Phase 3 review if you disagree:**
  - RPC signature is `redeem_challenge_prize(p_challenge_id uuid, p_user_id uuid, p_venue_id text
    default null, p_method text default 'guest_confirm', p_redemption_id uuid default null)`
    returning `table(outcome text, redemption_id uuid, redeemed_at timestamptz, cycle_start
    timestamptz)`. The plan sketched only the first two params. Added:
    - `p_venue_id` — the coupon must be spent at the venue it was won at (the old code never
      checked; the wallet always lists by venue, so the client always sends the right one).
    - `p_method` — POS plan Phases 2–3 call this same RPC with `'pos_square'` / `'pos_clover'`.
      Allowlist (`guest_confirm`, `pos_square`, `pos_clover`, `pos_toast`) is enforced by both a
      column CHECK and the function (raises 22023 on anything else).
    - `p_redemption_id` — names the exact coupon. Without it, "oldest eligible" meant a double tap
      by a guest holding two coupons for one reward (weekly cycles) redeemed **both**. The wallet
      now returns `redemptionId` per coupon and sends it back. POS webhooks also need it (a Square
      gift card maps to one specific redemption row).
  - **Already-redeemed → HTTP 409** `{ ok:false, code:"already_redeemed", error:"This prize was
    already redeemed." }`. `redeemChallengePrize()` keeps its `{ redeemed, redeemedAt }` shape and
    returns `redeemed:false`; the route turns that into 409 because the current client treats any
    `ok:true` as success and would replay the "Redeemed!" screen — the exact thing staff could be
    fooled by.
  - The campaign lookup in `redeemChallengePrize()` was **removed**: it gated on legacy
    `prize_type` (the bug in "For Andrew" #3) and the redemption row's existence already proves a
    prize (rows are minted only for prize-bearing rewards — `award_cycle_winner`). One RPC call
    replaces three queries.
  - "Oldest **eligible**" (not "oldest unredeemed"): an expired older coupon no longer blocks a
    newer valid one (the old code threw "expired" in that case).
  - Unbound `GET /api/challenge-campaigns?userId=` (reward progress snapshot) was **not** changed —
    the plan names only prize routes. It leaks a player's reward progress, not prizes. Listed for
    Phase 3's `/security-review`.

### 4. Files

**Phase 1 (this plan) — new:**
- `supabase/migrations/20261005123950_reward_redeem_once.sql` — `redeemed_method` column +
  `redeem_challenge_prize` function (security definer, `search_path=public`, execute revoked from
  `public, anon, authenticated`, granted to `service_role`). Header comments explain each outcome.
- `scripts/test-reward-redeem-once.cjs` — applies the real redemptions migration chain + the new
  one to in-memory PGlite and checks 9 groups (see §6).
- `tests/api.prize-redeem-identity.test.ts` — 14 route tests with the REAL `resolveRequestUserId`
  and `SESSION_SECRET` set: forged / missing / tampered session → 403 on every prize route; own
  session passes through; 409 / 503 mapping.
- `tests/lib.redeem-challenge-prize.test.ts` — 11 tests: exact RPC args, no table access, outcome
  mapping, concurrent calls (lib and route level), next-coupon isolation, fail-closed on missing RPC
  / other errors / malformed result, 22P02 → not found.

**Phase 1 — modified (these files had NO prior uncommitted changes, except where noted):**
- `lib/challengeCampaigns.ts` — **also carries uncommitted POS Phase 1 edits** in
  `createChallengeCampaign` (`prizePosValueCents`, ~line 1386 and ~1473). Phase 1's edits:
  `redeemChallengePrize()` rewritten (~line 2645 onward) plus new exports `PrizeRedeemMethod`,
  `PrizeRedeemUnavailableError`, private `isMissingRedeemRpc`, `RedeemPrizeRpcRow`;
  `listChallengeCampaignWinsForUser()` selects `id` and returns `redemptionId`.
- `types/index.ts` — `ChallengeCampaignWin.redemptionId?: string | null`.
- `app/api/prizes/redeem-challenge/route.ts` — session binding, `redemptionId` passthrough, 409/503.
- `app/api/challenge-campaigns/redeem/route.ts` — session binding on GET (wallet) and POST (claim).
- `app/api/prizes/route.ts` — session binding on GET (weekly prize wins) and POST (claim).
- `app/api/prizes/has-unclaimed/route.ts` — session binding (403 `{ok:false, hasUnclaimed:false}`).
- `components/prizes/PrizeWalletPanel.tsx` — `handleRedeemConfirm` body now includes
  `redemptionId: redeemingWin.redemptionId ?? undefined`. **The only client change.** Phase 2 edits
  this file heavily — keep that field in the body.
- `tests/lib.rewards-cycle-snapshot.test.ts` — one new case: wallet rows carry `redemptionId`.
- `docs/reward-live-redemption-plan.md` (status line), `docs/rewards-trust-and-pos-roadmap.md`
  (B1 row), `CLAUDE.md` (one Rewards bullet).

**Everything else in `git status`** (`app/api/owner/pos/`, `components/owner/pos/`, `lib/pos/`,
`20261004192844_pos_foundation.sql`, owner menu/dashboard files, `CreateRewardWizard`, `lib/rewards.ts`,
`package.json`, `app/api/admin/route.ts`, …) is the **POS plan's** uncommitted Phase 1 — not yours,
don't revert it. If committing, `git add` Phase 1's paths explicitly; `lib/challengeCampaigns.ts`
and `CLAUDE.md` contain both plans' edits (commit them together or use `git add -p`).

**How it fits:** wallet GET (`listChallengeCampaignWinsForUser` → `attachRewardWinDescriptions`)
returns each coupon with `redemptionId` → guest taps Redeem → `RedeemModal` → "Confirm Redemption"
→ `POST /api/prizes/redeem-challenge` `{userId, venueId, challengeId, redemptionId}` → route binds
`userId` to `tp_sess` → `maybeRequireActiveVenuePresence` → `redeemChallengePrize()` → one
`supabaseAdmin.rpc("redeem_challenge_prize", …)`.

### 5. Facts and traps

- `resolveRequestUserId` (`lib/serverSession.ts`) passes the claim through when `SESSION_SECRET`
  is unset (local dev without a secret, and **the Vitest environment**). Tests that need the check
  must set `process.env.SESSION_SECRET` (see `tests/api.prize-redeem-identity.test.ts`) and restore
  it after. Production + Preview have `SESSION_SECRET` (since ~2026-06-02); the local `.env.local`
  also has it (confirmed indirectly — the live check below ran with enforcement on).
- No session + a `userId` claim → 403 (`forbidden`). No session + no claim → anonymous (`userId`
  null). `/api/prizes` GET keeps serving the anonymous weekly-prize read.
- Cookie lifetimes: `tp_sess` 90 days (HttpOnly, set by `/api/join/profile`), `tp_user_id` 30 days;
  both set at the same login, so a player who can reach `/redeem-prizes` (proxy needs
  `tp_user_id`) holds a valid `tp_sess` too. The NFL Pick 'Em routes have used the same binding
  since before this phase.
- PostgREST error codes handled: `PGRST202` / `42883` = RPC missing → 503 + `[RewardRedeem]
  rpc-missing`; `22P02` (non-uuid id) → "No redemption record found" 400; anything else → 503 +
  `[RewardRedeem] rpc-failed`. Never falls back to a plain UPDATE.
- `supabaseAdmin.rpc(...)` returns the table-function result as an array; this repo casts
  (`(Array.isArray(data) ? data[0] : data) as …`), same as `award_cycle_winner`.
- PGlite is **not** a project dependency (it wasn't installed anywhere either). I installed
  `@electric-sql/pglite@0.3.16` into the session scratchpad only. To rerun:
  `npm i @electric-sql/pglite@0.3` in any directory OUTSIDE the repo (e.g. your scratchpad, `$DIR`),
  then from the repo root `REDEEM_PGLITE_MODULE=$DIR/node_modules/@electric-sql/pglite node scripts/test-reward-redeem-once.cjs`.
  The script needs stub `users`, `venues`, `challenge_campaigns` tables (it creates them).
- `.env.local` names can't be listed by the agent (`cut` on it was denied by the permission hook
  this session) — don't fight it; production reads via `node --env-file=.env.local <script>` work.
- A `next dev` instance was already running on port 3000 (Andrew's); a second one can't start
  (`.next/dev/lock`). I used the existing one read-only rather than killing it.
- Do not run `npx tsc --noEmit` and `npm run build` at the same time (`.next/types` regenerates).

### 6. Build / test / verification

Commands (all run 2026-10-05, all green):
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (only the standing Babel "deoptimised styling of lib/sportsBingo.ts" note).
- `npm run test` — **292 files passed / 1 skipped; 3,228 tests passed / 13 skipped / 0 failed.**
- `npm run build` — success.
- Focused: `npx vitest run tests/api.prize-redeem-identity.test.ts tests/lib.redeem-challenge-prize.test.ts tests/lib.rewards-cycle-snapshot.test.ts tests/api.challenge-campaigns-descriptions.test.ts`.
- Isolated SQL: `scripts/test-reward-redeem-once.cjs` (command in §5) — passes: column + CHECK
  allowlist; once-only (second call `already_redeemed`, writes nothing); 3 competing calls → exactly
  1 `redeemed`; id targeting never touches the next coupon; oldest-eligible fallback; expired refused
  and untouched, expired-older doesn't block newer; null expiry never expires; wrong user / venue /
  challenge → `not_found`; detached (`challenge_id` null) never matches; `pos_square` recorded,
  unknown method raises before writing; anon/authenticated cannot execute, service_role can.
- Live (read-only) against the running dev server on :3000 with real production data and a
  correctly HMAC-signed cookie: own wallet → 200 with `redemptionId` present; another session's
  cookie → 403; no cookie → 403; own `has-unclaimed` → 200. **No redeem POST was sent** (the RPC
  isn't in production, and there are no unexpired coupons to try it on).

**Unverified / risky:**
- PGlite is one connection, so the SQL's "lost the race" branch (UPDATE matches 0 rows after the
  SELECT chose the row) is reasoned, not executed. Postgres READ COMMITTED semantics make the
  second UPDATE re-check `prize_redeemed_at is null` on the committed row; Phase 3 can confirm on a
  real multi-connection Postgres if desired.
- A real end-to-end redeem on production has never run (needs the migration + a fresh win).
  Andrew's Phase 3 phone check should include redeeming a real coupon once and tapping again.

**Cost (global rule):** identity binding is an in-process HMAC — 0 DB calls. Redeem went from 3
DB round trips (campaign read, redemption read, update) to **1** RPC. Wallet GET reads one more
column (`id`). Net: fewer calls; at today's volume (6 coupons ever) negligible either way.

### 7. Open questions for Andrew

1. Apply `supabase db push` (this migration **and** the pending POS foundation migration)? — needed
   before deploying.
2. Commit/deploy Phase 1 now, or wait to ship it with Phase 2? Either is fine; migration first.

Nothing blocks Phase 2 from starting — it doesn't need the migration applied locally (tests fake it).

### 8. Recommended first steps for Phase 2 (Sonnet 5.5, high)

1. Read `docs/reward-live-redemption-plan.md` §2–§3 and this note. `CLAUDE.md` rules that bite:
   no inline `style={{}}` (use keyframes + CSS-variable classes), keyframes in `tailwind.config.ts`
   transform/opacity only (like `HightopLoader`), Reduce Motion honored, no `any`, `@/` imports.
2. Read `components/prizes/PrizeWalletPanel.tsx` fully — `RedeemModal`, the coupon variants, and
   how Plan A's `winDescription` renders (build on it; don't overwrite).
3. Server time: add `serverNowMs: Date.now()` to `GET /api/challenge-campaigns/redeem`'s JSON
   (`app/api/challenge-campaigns/redeem/route.ts` — keep the session binding at the top). Username:
   check what the page already holds (`getUserId()`/storage, `usePointsSummary`, venue presence
   context) before adding a join; venue name likewise — if absent, add it to the same GET response.
4. Keep the `redemptionId` field in `handleRedeemConfirm`'s body; the 409 `already_redeemed`
   response surfaces as `errorMessage` "This prize was already redeemed." — the live coupon should
   not show any success flourish on it.
5. Gates: `npm run test:pwa-contract`, `npx tsc --noEmit`, `npm run lint`, `npm run test`,
   `npm run build` (not typecheck and build together); screenshot with the `verify` skill.
6. Write `docs/reward-live-redemption-plan_PHASE_2_HANDOFF.md` and update the plan's status line.

# Live Coupon plan — Phase 3 handoff (review done; waiting on Andrew's phone check)

**Plan:** `docs/reward-live-redemption-plan.md` · **Phase:** 3 of 3 · **Written:** 2026-10-05 ·
**By:** Claude Opus 5.5 (medium) · **State:** review + fixes done; **phone check OPEN** (Andrew);
then clean-up + commit + deploy.

---

## For Andrew (plain English)

**What happened in this phase**

- **Code review:** 10 possible problems found, all checked by hand. 6 were real in this plan and are
  **fixed**. The most important one: if a coupon had *already* been spent and the guest tapped
  Confirm again, the live, shimmering coupon stayed on screen. That looked valid to staff. Now it
  closes, says "This prize was already redeemed." and refreshes the list. The other fixes are smaller:
  - The clock no longer runs slow on a sluggish connection.
  - The screen-awake lock can't get stuck on.
  - The prize badge no longer lights up for a coupon from a different venue.
  - A bad coupon id reports "bad request" instead of "server error".
  - The **Rewards progress** on the venue page now belongs to the signed-in player only. Before,
    anyone who knew a player's id could read their progress.
- **One alarming-sounding finding was a false alarm:** "could a browser rewrite coupons directly
  in the database?" I checked production: the coupon table is locked to the browser (it sees 0 of 6
  coupons and can change none).
- **Security review:** no vulnerabilities found.
- **All automated checks pass** (3,274 tests; typecheck; lint; production build).
- **Test coupon added to production** with your OK: a $25 gift card for **Andrew at Brunswick Grove**,
  expiring Oct 19. Nobody else can see it.
- **Phone checklist written:** `docs/reward-live-redemption-device-checklist.md`.

**What's blocking the phone check:** the new coupon isn't on the live site, and you want to deploy
*after* the check. So the phone needs a **Vercel preview** (a private test copy at a `…vercel.app`
address, using the real database). When I tried to create one, Claude Code's safety filter blocked
it as a "production deploy". It isn't one: `vercel deploy` without `--prod` doesn't touch
hightopchallenge.com. Either:

- **Run it yourself** in the project folder: `vercel deploy` (no `--prod`). Then open the address it
  prints on your phone; or
- **Tell me "go ahead with the preview deploy"** and approve the prompt.

**Is it live?** No. Nothing is committed, pushed or deployed. The database changes from Phase 1 were
already applied on 2026-10-05.

**What's left:**
1. A preview deploy (above).
2. Your phone check (the checklist).
3. I delete the test coupon.
4. Commit + deploy, as you decided.

---

## For the next agent

### 1. Goal and scope

Finish Plan B:
- Get a preview deploy to Andrew. **`vercel deploy` was denied by the auto-mode classifier
  ("[Production Deploy]") on 2026-10-05.** Do not retry or route around it. Andrew runs it, or
  explicitly OKs it.
- Andrew works through `docs/reward-live-redemption-device-checklist.md`. Fix anything he reports.
- **Clean-up after he says done.** Delete the seeded production rows by id (see §2).
- **Commit + deploy** only after the phone check (Andrew, 2026-10-05). Use explicit `git add` paths
  (see §4). The POS plan's uncommitted Phase 1 is in the same tree.

Out of scope (Andrew, 2026-10-03): staff PIN, staff scan page, rotating codes/QR, staff logins,
native apps, POS work.

### 2. Starting state

- Branch `main`, last commit `b23ddac`. Plans B (Phases 1–3) and C (Phase 1) are **all
  uncommitted**. Nothing has been pushed or deployed.
- **DB:** both pending migrations were applied 2026-10-05 (Phase 2 handoff §2). This phase changed no
  schema.
- **Production data written by this phase (Andrew approved: "Yes"):**
  - `challenge_campaigns.id = a8062067-303d-4e71-b022-fbd631e46870`:
    - name "TEST — live coupon phone check (delete me)"
    - `is_active=false`, `venue_ids={hc-cbz-live}` (the hidden (0,0) room, so no venue panel,
      partner dashboard or venue list shows it)
    - `prize_kind='gift_card'`, $25
  - `challenge_campaign_redemptions.id = cbb59f90-8107-4166-837e-e7d5ffaf3ffc`:
    - `winner_user_id = 57753c32-1cc1-4666-81b8-3a135b3cd4f2` (Andrew's `users` row at
      `brunswick-grove`; account `4666a13a-…`, God Mode, so the presence gate doesn't apply)
    - `venue_id='brunswick-grove'`, expires 2026-10-19 13:43 UTC
    - `expiry_2d/1d_notified_at` stamped so no expiry notifications fire
  - Verified with the real `listChallengeCampaignWinsForUser` that the wallet lists it, and that
    `getVenueDisplayName('brunswick-grove')` → "Brunswick Grove".
  - **Clean-up SQL** (run with `supabase db query --linked "…"`; delete the redemption first, then
    the campaign):
    `delete from challenge_campaign_redemptions where id='cbb59f90-8107-4166-837e-e7d5ffaf3ffc';`
    `delete from challenge_campaigns where id='a8062067-303d-4e71-b022-fbd631e46870';`
    Before deleting, check whether any other rows reference the campaign
    (`challenge_cycle_winners`, notifications). There shouldn't be any, because nothing awarded it.
- **The old live site can't redeem this coupon.** Its `redeemChallengePrize` gates on legacy
  `prize_type` and throws "does not have a prize coupon". The checklist tells Andrew to use the
  preview only.

### 3. Decisions (don't re-ask)

- Andrew, 2026-10-05: seeding a throwaway production coupon is OK (delete it afterwards); commit and
  deploy **after** the phone check.
- Mine:
  - **409 already_redeemed now closes the live coupon and refreshes the wallet.** Phase 2 had kept it
    open. The message is set *after* `load(false)` because `load()` clears `errorMessage`. Other
    failures (503, presence, network) keep the coupon open so the guest can retry.
  - **`GET /api/challenge-campaigns?userId=` is bound to the session, but a mismatch degrades to the
    public listing (no progress), not 403.** The venue page polls it every 30 s, and a 403 would
    blank the Rewards panel.
  - Not fixed, noted only:
    - The wallet GET's venue-name read is also paid by `ChallengeRedeemPanel` (venue home), which
      ignores it. That's ≤1 cached primary-key read per server instance per 10 min, which is
      negligible.
    - `isMissingRedeemRpc` duplicates `lib/rateLimit.ts`'s private `isMissingFunctionError`.
    - `has-unclaimed` counts only coupons with an expiry. Coupons are only ever minted with one
      (`award_cycle_winner`), so that's fine.

### 4. Files changed in Phase 3

- `components/prizes/PrizeWalletPanel.tsx`:
  - The clock offset is stamped when the wallet response arrives (`receivedAtMs`), not after
    `Promise.all`.
  - The 409 branch in `handleRedeemConfirm`.
- `components/prizes/LiveCouponFrame.tsx`: `acquire()` hands back a surplus lock (`if (cancelled ||
  handle)`), so overlapping requests can't leak one.
- `app/api/prizes/redeem-challenge/route.ts`: "no redemption record" → 400 (was 500).
- `app/api/prizes/has-unclaimed/route.ts`: `.eq("venue_id", venueId)` on the coupon count (it uses
  the existing `(winner_user_id, venue_id, …)` index).
- `app/api/challenge-campaigns/route.ts`: `resolveRequestUserId` binding (see §3).
- Tests:
  - `tests/components.prize-wallet-live-coupon.test.ts`: the 409 test rewritten, plus a 503
    keeps-open test.
  - `tests/components.live-coupon-frame.test.ts`: an overlapping-wake-lock test.
  - `tests/api.prize-redeem-identity.test.ts`: a 400 mapping test, a has-unclaimed venue-filter
    test, and two progress-route identity tests. Its `@/lib/challengeCampaigns` and `@/lib/rewards`
    mocks gained the progress route's exports.
- Docs:
  - `SYSTEM_CONTEXT.md` §2 "Prize flow" (live coupon + once-only) and §8 (also removed the stale
    `NEXT_PUBLIC_REWARDS_ENABLED` claim).
  - New `docs/reward-live-redemption-device-checklist.md`.
  - The plan's status line.

**Plan B's full commit list** = Phase 1 handoff §4 + Phase 2 handoff §4 + the list above + the
three handoffs, the plan, the checklist and the roadmap doc. `lib/challengeCampaigns.ts` and
`CLAUDE.md` hold edits from both plans; commit them together with Plan C Phase 1 or use `git add -p`.

### 5. Facts and traps

- **RLS on `challenge_campaign_redemptions` and `challenge_campaigns` is ON in production with no
  policies** (`relrowsecurity=true`, `pg_policies` empty; anon REST sees 0 of 6 rows). **No migration
  in the repo enables it.** It was set outside the migration files. A database rebuilt from
  migrations alone would leave the tables open to the anon role, because the 2026-09-23 grants
  baseline grants `all` to anon/authenticated. Worth a future one-line migration (`enable row level
  security`, which is idempotent) if Andrew wants the repo to match production. Not done, because
  it needs `db push`.
- `challenge_cycle_winners` has RLS **off** but anon has no grant (42501). It is safe for the same
  reason.
- `supabase db query --linked "<sql>"` works for read-only production checks. Results come wrapped in
  an untrusted-data boundary.
- Preview env: the same Supabase project as production (`NEXT_PUBLIC_SUPABASE_URL` is shared). Preview
  has `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` set, but `hostKind()` treats `*.vercel.app` as `"other"`,
  so a preview never redirects.
- Passkeys won't work on a `vercel.app` host. Andrew signs in there with username + PIN.
- A tsx script outside the repo needs `TSX_TSCONFIG_PATH=tsconfig.json` for `@/` imports:
  `TSX_TSCONFIG_PATH=tsconfig.json node --env-file=.env.local --conditions react-server --import tsx <file>.mts`.
- No dev server was running on :3000 this session.

### 6. Verification (2026-10-05, after the last code edit)

- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the standing `sportsBingo.ts` Babel note).
- `npm run test`: **296 files passed / 1 skipped; 3,274 tests passed / 13 skipped / 0 failed.**
- `npm run test:pwa-contract`: 20/20. `npm run build`: success. Typecheck and build were run
  separately.
- Code review: `/code-review high`, 10 findings, each verified by hand as below.

  | # | Finding | Outcome |
  |---|---|---|
  | 1 | Live coupon stays up after a 409 | Fixed |
  | 2 | RLS bypass | False in production (§5) |
  | 3 | POS: `posValueCents` | Plan C |
  | 4 | Badge ignores venue | Fixed |
  | 5 | Wake-lock leak | Fixed |
  | 6 | Clock offset lag | Fixed |
  | 7 | 22P02 → 500 | Fixed |
  | 8 | POS: `?sheet=pos` with flag off | Plan C |
  | 9 | Venue-name cost | Noted |
  | 10 | Duplicate helpers | Noted |

- `/security-review`: no finding ≥ 8/10. The leftover unbound progress route (Phase 1 handoff §3) is
  now bound.
- **Unverified:** everything on real phones (the checklist), and the first real end-to-end redeem on
  production (checklist §E).

### 7. Open questions for Andrew

1. Preview deploy: run `vercel deploy` himself, or OK Claude to run it.
2. The phone checklist results.
3. (Optional) Add a migration so the repo enables RLS on the two coupon tables like production does?

### 8. For Plan C (POS) Phase 2's agent

- The redeem RPC accepts `p_method = 'pos_square'` and `p_redemption_id` (Phase 1 handoff §3); use it,
  never a plain UPDATE.
- Two review findings belong to the POS plan's Phase 1 code. Neither is fixed:
  - `createChallengeCampaign` writes `prize_pos_value_cents` whenever the body carries `posValueCents`,
    with no `isPosIntegrationsEnabled()` / connected-POS check (`lib/challengeCampaigns.ts` ~1477).
  - `'pos'` is in `OWNER_SHEET_IDS` (`lib/ownerSheetParams.ts:23`) even with the flag off, so
    `?sheet=pos` parses but nothing renders.
- `lib/pos/providers.ts` adds another copy of the `truthy` env parser.
- The POS OAuth connect/callback (Phase 2) must bind `state` to the owner session and the venue.

### 9. Recommended next steps

1. Wait for Andrew (preview deploy + checklist). Fix anything he reports and re-run the gates.
2. When he says done: run the clean-up SQL in §2, then verify that both ids are gone.
3. Commit Plan B with explicit paths (ask whether Plan C Phase 1 goes in the same push). Deploy
   per Andrew. The migration is already applied, so code can go any time.
4. Mark the plan complete in its status line and in `docs/rewards-trust-and-pos-roadmap.md`.

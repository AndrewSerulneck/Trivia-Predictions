# Live Coupon — Plan B (make a screenshot of a reward obviously fake)

**Status:** **COMPLETE — committed `27f5eea` and deployed to production 2026-10-05** (Vercel
`hightop-challenge-ayzjanpqm`, on Andrew's word). Migration `20261005123950_reward_redeem_once.sql` applied
2026-10-05. Phone check passed (Andrew, 2026-10-05). **One leftover:** the seeded test coupon still exists —
the agent's delete was blocked twice by the safety filter, even with Andrew's OK; Andrew runs the two lines in
the Phase 3 handoff §2 (it is hidden, unredeemable by anyone but Andrew, and expires 2026-10-19).
Latest handoff: `docs/reward-live-redemption-plan_PHASE_3_HANDOFF.md`.
**2026-10-05 09:15 CDT — "nothing on the checklist shows" was NOT a code bug.** Andrew tested on
hightopchallenge.com. That site runs the 2026-10-04 14:18 CDT production build
(`hightop-challenge-k99hfyqpv`), which is older than the live-coupon code (written 2026-10-05 ~08:30).
`vercel ls` showed **no preview deploy at all**. The 42 live-coupon tests pass, and Phase 2's
real-browser screenshots rendered every element. Fix: `vercel deploy` (no `--prod`), then run the
checklist on the printed `…vercel.app` link. Preview env has no `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`,
so Plan C's uncommitted POS code in the same tree stays switched off there.
Rewritten 2026-10-03 after Andrew cut the scope: **motion-only coupon. No staff PIN, no staff scan
page, no rotating code.**
**Handoffs:** each phase ends with `docs/reward-live-redemption-plan_PHASE_<N>_HANDOFF.md` (global
rule in `~/.claude/CLAUDE.md`). Update this status line to point at the latest handoff.
**Part of:** `docs/rewards-trust-and-pos-roadmap.md` (Plan B of three; after Plan A, before Plan C).

---

## 1. Summary (plain English, for Andrew)

A website (including our installed home-screen app) **cannot block screenshots or screen
recording** — iPhone gives web pages no way to do it; only a native App Store app can. So instead
of blocking the screenshot, we make one **easy for staff to spot**:

- **A shimmering band that never stops moving** across the coupon.
- **A live clock ticking in seconds** plus today's date. A screenshot is frozen and shows the wrong
  time; a picture from last week shows last week's date.
- **The guest's username and the venue's name** on the coupon, so a coupon forwarded from another
  guest or another bar shows the wrong name.
- **It reacts to touch.** When staff tap the coupon, it bursts with sparkles. A screen recording
  can't respond to a tap, so "tap it" is the staff member's one-second check.
- A small line on the coupon tells staff what to look for: *"Staff: tap the coupon — it should
  sparkle, and the clock should match the time now."*

The coupon otherwise works exactly as today: the guest shows it, then taps "Confirm Redemption."

**What this does and doesn't stop.** It stops screenshots, forwarded pictures and old coupons. A
determined cheater could still hand over a *live* phone signed in as someone else, and a staff
member who doesn't look won't catch anything. Rotating codes or a staff PIN would close more of
that gap; Andrew chose to keep coupons simple for now (decision 2026-10-03). Those designs are
summarized in §6 in case they're wanted later.

---

## 2. Facts for the agent

- Coupons render in `components/prizes/PrizeWalletPanel.tsx` (`/redeem-prizes`). Coupon variants:
  `GiftCardCoupon`, `MenuItemCoupon`, `ChallengeCoupon` (dispatcher), plus legacy `WineCoupon`,
  `AppetizerCoupon`, `GiftCertificateCoupon`. Tapping **Redeem** opens `RedeemModal`, which renders
  the coupon `large` with "Show this coupon to venue staff" and the guest's own "Confirm
  Redemption" button → `POST /api/prizes/redeem-challenge` → `redeemChallengePrize()` in
  `lib/challengeCampaigns.ts` (~line 2573).
- Wallet data comes from `GET /api/challenge-campaigns/redeem?userId=&venueId=` →
  `listChallengeCampaignWinsForUser()`.
- **Two security bugs found while planning** (independent of screenshots, invisible to guests):
  1. `POST /api/prizes/redeem-challenge` and `GET`/`POST /api/challenge-campaigns/redeem` take
     `userId` from the body/query and never call `resolveRequestUserId()` (`lib/serverSession.ts`);
     `proxy.ts` lets all `/api/*` through. Anyone who knows a player's id can list or redeem that
     player's prizes.
  2. `redeemChallengePrize()` reads the oldest unredeemed row, then updates without
     `.is("prize_redeemed_at", null)`; two simultaneous taps can both succeed.
  Phase 1 fixes both. Plan C (Square) also needs the once-only redeem, so it is a prerequisite.
- **Plan A also edits these coupons** (adds "what you won it for" via `describeRewardWin()`).
  Whichever plan runs second must build on the other's change, not overwrite it.
- Animation rules in this repo: CSS keyframes in `tailwind.config.ts`, transform/opacity only
  (same as `HightopLoader`); Tailwind utilities only, no inline `style={{}}` outside
  `components/venue-screen/*` — use a keyframe + CSS variable class approach instead. Reduce
  Motion must be honored.
- New tables/functions need explicit grants (`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`,
  enforced by `tests/supabase-migration-grants-contract.test.ts`). `supabase db push` only with
  Andrew's OK.

---

## 3. Phases

### Phase 1 — Fix the two redemption bugs (backend only; guests see no change)
**Model / effort:** Opus 5.5, **high**.
- Bind identity: `/api/prizes/redeem-challenge`, `/api/challenge-campaigns/redeem` (GET + POST),
  and any `/api/prizes/*` sibling that takes a `userId` use `resolveRequestUserId()`; `forbidden`
  → 403. Confirm the wallet still works (the client sends its own id, which matches the cookie).
- Once-only: new migration with a service-role-only RPC `redeem_challenge_prize(p_challenge_id,
  p_user_id)` doing one conditional `UPDATE … WHERE prize_redeemed_at IS NULL AND (prize_expires_at
  IS NULL OR prize_expires_at > now()) … RETURNING` on the oldest eligible row (revoke execute from
  `public, anon, authenticated`). Add nullable `redeemed_method text` to
  `challenge_campaign_redemptions` now (`'guest_confirm'` today; Plan C writes `'pos_square'`).
  `redeemChallengePrize()` calls it and keeps its return shape. If the RPC is missing (deploy
  before migration), fail closed with log `[RewardRedeem] rpc-missing`.
- Tests: forged `userId` → 403; two concurrent redeems → exactly one `redeemed: true`; expired →
  refused. Migration applied to production only on Andrew's word.

### Phase 2 — The live coupon
**Model / effort:** Sonnet 5.5, **high**.
- New `components/prizes/LiveCouponFrame.tsx` that wraps the existing `large` coupon inside
  `RedeemModal` (the moment the coupon is shown to staff). Keep the small wallet-list cards static
  so the list stays calm.
- Contents: moving holographic band (new `coupon-shimmer` keyframe in `tailwind.config.ts`);
  `HH:MM:SS` clock + "Fri, Oct 3" date; guest username; venue name; tap/press → sparkle burst
  (CSS keyframes, ~600 ms, a few absolutely-positioned dots; plus `haptic("light")`); the staff
  tip line from §1.
- Clock source: the **server's** time, not the phone's. Add `serverNowMs` to the existing wallet
  `GET` response and keep an offset; a phone with a wrong clock must not look fake. Display in the
  phone's local timezone (the guest is standing in the venue). **Zero new requests**: no polling,
  no new route.
- Username + venue name: from data the wallet page already has (check `listChallengeCampaignWinsForUser`
  / venue presence context); if venue name isn't available, add it to the same `GET` response —
  one join, not a second request.
- Keep the screen awake while the coupon is open (Screen Wake Lock API, feature-detected; ignore
  failure).
- Reduce Motion: no band sweep and no sparkle travel, but the clock still ticks and a tap still
  flashes the border (a ticking clock is the proof; it isn't decorative motion).
- Tests: component test that the clock advances with fake timers and uses the server offset; tap
  triggers the sparkle state; Reduce Motion branch. Run `npm run test:pwa-contract` (standalone
  PWA surface) plus `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not
  typecheck and build at once). Screenshot with the `verify` skill.

### Phase 3 — Review and phone check
**Model / effort:** Opus 5.5, **medium** (+ Andrew on a phone).
- `/code-review high`; `/security-review` for Phase 1's changes.
- `docs/reward-live-redemption-device-checklist.md`: iPhone Safari, installed home-screen app,
  Android Chrome. Check: band moves; clock ticks and matches real time; tap sparkles; a screenshot
  viewed in Photos is visibly frozen; Reduce Motion on; phone with its clock set wrong still shows
  the right time; screen stays awake. Andrew closes it.
- Update `SYSTEM_CONTEXT.md` §2 "Prize flow" with the live coupon.

---

## 4. Out of scope (decided 2026-10-03)
Staff PIN, staff scan/verify page, rotating codes, separate staff logins, native apps, POS (Plan C).

## 5. Andrew's decisions
- 2026-10-03: Keep coupons simple. **Motion only** — no PIN, no staff scan, nothing else. The
  guest keeps tapping "Confirm Redemption" themselves.
- Phase 1 (the two security bugs) is in this plan because it is invisible to guests and Plan C
  needs it. If Andrew wants it dropped, say so at the start of Phase 1.

## 6. Parked ideas (not planned — only if Andrew asks later)
- **30-second rotating code + QR** (server HMAC, TOTP-style, stateless) shown on the live coupon.
- **Staff PIN** typed on the guest's phone, hashed per venue, rate-limited.
- **Staff "Verify a reward" page** in the Partner Dashboard that scans the QR and redeems.
These would also make a Clover integration (Plan C, later) easier, because Clover needs a
staff-side action to choose the guest's open check.

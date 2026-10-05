# Live Coupon plan — Phase 2 handoff (the live coupon is built)

**Plan:** `docs/reward-live-redemption-plan.md` · **Phase:** 2 of 3 · **Written:** 2026-10-05 ·
**By:** Claude Sonnet 5.5 (high) · **Next:** Phase 3 — review + phone check (Opus 5.5, medium, + Andrew).

---

## For Andrew (plain English)

**What you run next:** open a **fresh Claude Code session**, choose **Opus 5.5** with **medium** effort
(`/model`), and say:

> Do **Phase 3** of `docs/reward-live-redemption-plan.md`. Read the plan and
> `docs/reward-live-redemption-plan_PHASE_2_HANDOFF.md` first.

(After that, the next plan in the roadmap is **Plan C — POS**: its Phase 2, "Square gift cards"
(`docs/pos-rewards-integration-plan.md`). Its Phase 1 is already built. Plan C Phase 2 needs Opus 5.5,
high. You don't have to do it right after Phase 3.)

**What changed.** When a guest taps **Redeem** on a prize, the coupon staff are shown now *proves it is
live*:

- A shimmering band that never stops moving across it.
- A **ticking clock** (seconds) and today's date, taken from **our server's** clock — so a screenshot is
  frozen and wrong, and a phone with a wrong clock still shows the right time.
- The guest's **username** and the **venue name** on the coupon.
- **Tap it → sparkles + a border flash** (and a tiny buzz on phones that support it). A recording can't
  react to a tap; that's the staff member's one-second check.
- A line telling staff what to look for: *"Staff: tap the coupon — it should sparkle, and the clock
  should match the time now."*
- The screen stays awake while it's open. With the phone's **Reduce Motion** setting on, the band and
  sparkle travel stop, but the clock still ticks and a tap still flashes the border.

The prize list itself stays calm (nothing moves there). The guest still taps "Confirm Redemption"
themselves, exactly as before. I checked it on the real page in a browser (phone-size, with and without
Reduce Motion): the clock ticks, the date is the server's, the band moves, a tap sparkles and clears.

**Is it live?** **No** — the code is not committed, pushed or deployed. **But the database is ready:**
at your OK I applied `supabase db push` to production on 2026-10-05, which added Phase 1's once-only
redemption column + function **and** the POS plan's foundation tables (both add-only; verified present).
Nothing visible changed for guests from that. **So the safe order is already satisfied — you can deploy
the code whenever you like.** (Until the code deploys, the live site keeps running the old code, which
ignores the new database pieces.)

**What's left:** Phase 3 — a code + security review, then **your phone check** (a checklist I'll write):
iPhone Safari, the installed home-screen app, and Android. Only you can do the phone part.

**Needs you:** nothing right now. At the end of Phase 3 you decide when to commit + deploy.

---

## For the next agent (Phase 3)

### 1. Goal and scope of Phase 3

From the plan §3 "Phase 3 — Review and phone check" (Opus 5.5, medium):
- `/code-review high` on the whole Plan B diff (Phases 1 + 2). `/security-review` for Phase 1's changes
  (identity binding + RPC; see "Parked for review" in the Phase 1 handoff §3, esp. the unbound
  `GET /api/challenge-campaigns?userId=` progress snapshot).
- Write `docs/reward-live-redemption-device-checklist.md` (iPhone Safari, installed home-screen app,
  Android Chrome). Check: band moves; clock ticks and matches real time; tap sparkles; a screenshot
  viewed in Photos is visibly frozen; Reduce Motion on; a phone with its clock set wrong still shows the
  right time; screen stays awake; **redeem a real coupon once and tap Confirm twice** (Phase 1's
  once-only; it has never run end-to-end on production). Andrew closes the checklist.
- Update `SYSTEM_CONTEXT.md` §2 "Prize flow" with the live coupon (not done yet — Phase 3's job).
- Update the plan's status line + write `…_PHASE_3_HANDOFF.md`.

**Out of scope (Andrew, 2026-10-03):** staff PIN, staff scan page, rotating codes/QR, separate staff
logins, native apps, POS (Plan C). Do not add them in review fixes.

### 2. Starting state

- Branch `main`, last commit `b23ddac`. **Everything from Plans B and C-Phase-1 is uncommitted** in one
  working tree (see §4). Nothing pushed or deployed.
- **Database:** `supabase db push` was run 2026-10-05 on Andrew's explicit OK. Dry-run listed exactly two
  pending migrations; both applied: `20261004192844_pos_foundation.sql` (POS plan) and
  `20261005123950_reward_redeem_once.sql` (this plan). Verified read-only afterwards with the service key:
  `challenge_campaign_redemptions.redeemed_method` present; RPC `redeem_challenge_prize` present (a call
  with all-zero ids returned `not_found`, wrote nothing); `pos_reward_applications` present. PostgREST's
  schema cache took ~20 s to show the RPC/table — a probe immediately after the push saw them as absent.
  No data rows were changed; no backups needed. Do not re-run or reverse them.
- Production data at probe time: 6 redemption rows ever, none redeemed, all expired (legacy
  `gift_certificate` campaigns). Live partner rewards (`live_trivia_challenge`, `nfl_pickem_challenge`)
  have issued no coupons yet — so **there is currently no real unexpired coupon to test with.** Andrew's
  phone check needs a fresh win, or a seeded throwaway coupon (use the `verify` skill; delete it after).

### 3. Decisions made (don't re-ask)

- **Andrew:** motion-only coupon (2026-10-03); apply the migrations (2026-10-05, "Yes, ok").
- **Mine, within the plan — flag in review if you disagree:**
  - **Clock format** is a 12-hour `3:04:09 PM` and `Sat, Oct 3` built from the phone's *local* time
    getters (`lib/liveCouponClock.ts`), not `toLocaleTimeString`, so it's deterministic and testable. The
    plan said `HH:MM:SS`; 12-hour reads naturally for US venues. If a venue is outside the US this may need
    a locale option.
  - **Haptic** is `haptic("selection")` — the plan said `haptic("light")`, which doesn't exist in
    `lib/haptics.ts` (patterns: selection/commit/success/warning).
  - **Sparkles burst from the middle of the frame**, not the tap point: placing them at the touch point
    would need inline `style={{}}`, which `CLAUDE.md` forbids outside `components/venue-screen/*`.
  - **Reduce Motion is pure CSS** (`motion-reduce:hidden` on the bands and the sparkle dots; the border
    flash `animate-coupon-flash` is deliberately NOT hidden — it's an opacity flash and the plan wants a
    tap to still react). Tests assert the classes, since jsdom can't evaluate media queries.
  - **Clock offset is measured once**, when the wallet response arrives: `serverNowMs − Date.now()`.
    Network latency (typically <300 ms) makes it that much slow; fine for "does the clock match". If the
    guest changes the phone's clock *while the coupon is open*, the offset goes stale (edge case, ignored).
    `post-redeem` `load(false)` refreshes it.
  - **Venue name is fetched server-side** with its own tiny cache (`lib/venueDisplayName.ts`) rather than
    reusing `getVenueTimezone` — folding a name into the timezone cache would change a shared helper that
    other code relies on. It adds **at most one `venues` primary-key read per server instance per
    10 minutes** (and `[]` when it can't be read). It runs in parallel with the wins query, so no added
    latency; if it can't be read the coupon just omits the venue name. The username comes from
    `getUsername()` (localStorage), no request.
  - **The redeem modal now scrolls** (`PrizeWalletPanel.tsx` `RedeemModal`): the live coupon makes it ~200 px
    taller, which would clip on a short phone. Outer is `flex-col items-center overflow-y-auto`; inner has
    `mt-auto sm:my-auto` so it still sits at the bottom on phones and centres from `sm` up, and scrolls only
    when it doesn't fit. Verified at 390×844 and 375×667 (fits, no scroll needed at 667).
- **Cost (global rule):** wallet `GET` +2 small JSON fields; +≤1 cached PK read per instance per 10 min
  (production has 11 venues and 6 coupons ever → negligible). Zero new routes, polling, or timers that hit the
  network. The only recurring work is on the phone: one `setTimeout` per second while the coupon is open.

### 4. Files

**Phase 2 — new**
- `components/prizes/LiveCouponFrame.tsx` — the wrapper. Props `{ children, clockOffsetMs, username,
  venueName }`. Internals: `useCorrectedNow` (aligned per-second `setTimeout`, cleared on unmount),
  `useScreenWakeLock` (feature-detected; re-acquires on `visibilitychange`; releases a lock that arrives after
  unmount), tap → `haptic` + burst state (`burstKey`, auto-clears after 700 ms, a second tap restarts it).
  `data-live-coupon*` attributes are test/automation hooks. Decorative layers are `pointer-events-none`.
- `lib/liveCouponClock.ts` — `clockOffsetFromServer`, `msUntilNextSecond`, `formatCouponClock`,
  `formatCouponDate` (pure).
- `lib/venueDisplayName.ts` — `getVenueDisplayName(venueId)` (`server-only`, display_name → name → null,
  10-min cache, failed read not cached) + `clearVenueDisplayNameCache` test hook.- Tests (all new, all pass): `tests/lib.live-coupon-clock.test.ts` (7), `tests/components.live-coupon-frame.test.ts`
  (20: server-time clock, ticking, sub-second alignment, burst + restart + haptic, Reduce Motion classes,
  wake lock incl. failure/late/visibility), `tests/components.prize-wallet-live-coupon.test.ts` (6: list stays
  calm, modal live with server date/guest/venue, zero extra requests, fallback, exact-coupon POST body,
  409 → no success flourish), `tests/api.live-coupon-wallet.test.ts` (7: payload + venue-name cache).

**Phase 2 — modified**
- `app/api/challenge-campaigns/redeem/route.ts` — GET returns `serverNowMs` and `venueName` (wins +
  name fetched with `Promise.all`). Phase 1's session binding at the top is untouched.
- `components/prizes/PrizeWalletPanel.tsx` — wallet fetch stores `clockOffsetMs`/`venueName`; `username` from
  `getUsername()`; `RedeemModal` takes those three props and wraps the large `ChallengeCoupon` in
  `LiveCouponFrame`; modal scroll fix. Phase 1's `redemptionId` in `handleRedeemConfirm`'s body and Plan A's
  `wonForLine()` are both intact.
- `tailwind.config.ts` — keyframes `coupon-shimmer`, `coupon-spark` (reads `--sx`/`--sy`), `coupon-flash`
  + their `animation` entries.
- `tests/api.challenge-campaigns-descriptions.test.ts` — added `vi.mock("@/lib/venueDisplayName", …)` so the
  description read-count assertions (`fake.state.log`, "no reads at all") aren't polluted by the venue-name
  read, which has its own tests. `tests/components.player-pending.test.ts` — its `@/lib/storage` mock gained
  `getUsername`.
- Docs: `CLAUDE.md` (one Rewards bullet), the plan's status line, `docs/rewards-trust-and-pos-roadmap.md`
  (B1/B2 rows). `SYSTEM_CONTEXT.md` NOT touched (Phase 3).

**Everything else in `git status`** is Phase 1 (this plan) or the POS plan's Phase 1 — not yours to revert.
`lib/challengeCampaigns.ts` and `CLAUDE.md` contain both plans' edits; when committing use explicit `git add`
paths or `git add -p`. Plan B's full path list is in the Phase 1 handoff §4 plus the list above.

### 5. Facts and traps

- **Bash flakiness this session:** the harness's auto-mode classifier returned "no verdict" for ~10 shell calls
  in a row at the start, then recovered by itself. If it recurs, read-only tools (Read/Edit/Write) still work.
- `haptic()` only knows `selection | commit | success | warning`.
- No inline `style={{}}`: per-dot sparkle direction is set with Tailwind arbitrary-property classes
  (`[--sx:84px] [--sy:0px]`) read by the `coupon-spark` keyframe. Class strings are written out in full in
  `SPARKS` so Tailwind sees them — never build them from a template string.
- A `setState` timer in the frame re-renders only the frame; the `children` element is created by the parent
  and keeps its identity, so the coupon itself doesn't re-render each second.
- `vi.useFakeTimers()` fakes `Date` too, which is what makes the clock tests deterministic; the descriptions test
  uses `{ toFake: ["Date"] }` only — don't change that.
- `PrizeWalletPanel` test mocks that replace `@/lib/storage` must now include `getUsername`.
- The redeem-prizes page only reaches players whose `tp_user_id` cookie is set (proxy gate); my browser check
  used cookies + localStorage + `page.route` stubs, with **no production writes**.
- `.next/dev` vs build: I ran `npm run build` and a throwaway `next start -p 3101` (killed afterwards).
  Andrew's `next dev` on :3000 was not touched.
- The screenshot scripts are in the session scratchpad only (not in the repo). To re-drive the page yourself:
  start `npx next start -p 3101` after a build, add cookies `tp_user_id`/`tp_venue_id`, set localStorage
  `tp:user-id`/`tp:venue-id`/`tp:username`, stub `**/api/**` with `{ok:true}`, `**/api/prizes?**` with
  `{ok:true,wins:[]}`, and `**/api/challenge-campaigns/redeem?**` with a wallet payload (see the test
  `tests/components.prize-wallet-live-coupon.test.ts` for a valid win object); grant geolocation to avoid the
  presence overlay.

### 6. Build / test / verification (all run 2026-10-05, after the final edit)

- `npx tsc --noEmit` — clean. `npm run lint` — clean (only the standing Babel note about `lib/sportsBingo.ts`).
- `npm run test` — **296 files passed / 1 skipped; 3,268 tests passed / 13 skipped / 0 failed.**
- `npm run test:pwa-contract` — 20/20.
- `npm run build` — success (run before the modal-scroll fix and again after it; typecheck was run separately,
  never at the same time as build).
- Real-browser check (Playwright/Chromium against the production build, API stubbed): clock shows the server
  date (set 2 days ahead), advances every second; holder line "Rick · The Tap Room"; tap → 10 sparkles + border
  flash, gone after ~0.7 s; Reduce Motion → bands `display:none`, clock still ticking, burst still appears.
  Screenshots looked right at 390×844; 375×667 fits without scrolling.
- DB: read-only probe after `db push` (see §2).

**Unverified / risky**
- **Real devices:** iOS Safari / installed PWA / Android — only Andrew can (Phase 3 checklist). Specifically
  unverified: Screen Wake Lock on iOS (supported iOS 16.4+, including the installed app), haptics (iOS Safari has
  no `navigator.vibrate`, so no buzz there — harmless), and how the shimmer performs on older phones.
- A **real end-to-end redeem on production** has still never run (needs a live, unexpired coupon).
- The `[BABEL] deoptimised sportsBingo.ts` lint note is pre-existing.

### 7. Open questions for Andrew
1. When to commit and deploy (migration is already applied, so code can go any time). Phase 3 can happen
   before or after; suggest after the phone check.
2. For the Phase 3 phone check: OK to seed one throwaway coupon on production for your account and delete it
   afterwards (or wait for a real partner-reward win)?

### 8. Recommended first steps for Phase 3 (Opus 5.5, medium)
1. Read the plan §3 Phase 3 and this note; skim the Phase 1 handoff §3–§5.
2. `/code-review high` over the Plan B paths (Phase 1 list + the Phase 2 list above); then `/security-review`
   for Phase 1 (identity binding, the RPC's `security definer` + grants, the fail-closed paths, the unbound
   `GET /api/challenge-campaigns?userId=` snapshot).
3. Fix anything found in small commits-in-waiting (nothing is committed; don't commit unless Andrew says).
4. Write `docs/reward-live-redemption-device-checklist.md` for Andrew (plain-English steps, the items in §1).
5. Update `SYSTEM_CONTEXT.md` §2 "Prize flow", the plan status line, and write the Phase 3 handoff (for Plan C
   Phase 2's agent too: tell them the redeem RPC accepts `p_method = 'pos_square'`, see Phase 1 handoff §3).

# Live coupon — phone checklist (Andrew only)

**Plan:** `docs/reward-live-redemption-plan.md` (Plan B, Phase 3) · **Written:** 2026-10-05
**Status:** OPEN — Andrew ticks the boxes; tell Claude when it's done (or what failed).

A headless browser can't check this, because it has no real screen, no screenshots and no
wake lock. Only a real phone can.

---

## Before you start

**The test coupon.** On 2026-10-05 Claude added one throwaway coupon to production for your
account:

- **$25 gift card** · reward name **"TEST — live coupon phone check (delete me)"**
- Your account **Andrew** at **Brunswick Grove** · expires **Mon Oct 19, 2026**
- Nobody else can see it. Its reward is switched off and lives in the hidden internal room, so it
  isn't on any venue page or partner dashboard. Its expiry reminders are switched off.

**Where to test.** The new coupon is **not on the live site yet**. Use the **preview link**
Claude gives you, a `…vercel.app` address. It uses the real database, so your coupon is
there.

- ⚠️ **Don't press "Confirm Redemption" on the live site** (hightopchallenge.com) for this
  coupon. The old code there can't redeem it and would only show an error.
- On the preview link, sign in with **username + PIN**. Face ID / passkeys only work on the
  real domain. If Vercel asks you to log in first, use your Vercel account.
- Pick **Brunswick Grove**, open the menu → **Redeem Prizes**. You should see the TEST coupon.

**Do section E (actually redeem) last.** A coupon can only be redeemed once.

---

## A. iPhone — Safari

Tap **Redeem** on the TEST coupon. The large coupon opens.

- [ ] **The band moves.** A shimmering stripe keeps sliding across the coupon and never stops.
- [ ] **The clock ticks** every second, and it **matches the real time.** Compare it with your
      lock screen or another phone; it should be within about a second.
- [ ] **The date is today's** (e.g. "MON, OCT 5").
- [ ] Under the clock it says **"Andrew · Brunswick Grove"**.
- [ ] The staff line is there: *"Staff: tap the coupon — it should sparkle, and the clock should
      match the time now."*
- [ ] **Tap the coupon → sparkles burst out and the border flashes white**, then they clear.
      Tap again: it bursts again.
- [ ] **A screenshot is obviously fake.** Take a screenshot, open it in Photos, and wait a few
      seconds. The clock is frozen, the band is stopped, and tapping it does nothing.
- [ ] **The screen stays awake.** Leave the coupon open without touching the phone for longer
      than your Auto-Lock time (Settings → Display & Brightness → Auto-Lock; 30 seconds is
      quickest). The screen should **not** dim or lock while the coupon is open. After you
      close the coupon it should lock normally again.
- [ ] **It fits.** "Confirm Redemption" and "Cancel" are reachable (scroll if needed). Nothing
      is cut off.
- [ ] Tap **Cancel**. The coupon closes, and the prize list underneath is still and not
      moving.

**Reduce Motion** (Settings → Accessibility → Motion → Reduce Motion **on**), then reopen
the coupon:

- [ ] **No moving band.**
- [ ] **The clock still ticks.**
- [ ] **Tapping still flashes the border** (no flying sparkles).
- [ ] Turn Reduce Motion back **off**.

**Wrong phone clock.** Settings → General → Date & Time → turn **Set Automatically off** and
set the time **1 hour ahead**. Go back to the preview, **reload the Redeem Prizes page** and
reopen the coupon.

- [ ] The coupon still shows the **real** time, not the phone's wrong time.
- [ ] Turn **Set Automatically back on.**

## B. iPhone — the installed home-screen app

In Safari on the preview link: Share → **Add to Home Screen**. Open it from the home screen.
It has its own sign-in, so sign in again with username + PIN and go to Redeem Prizes →
Brunswick Grove.

- [ ] The coupon opens full-screen, and the band moves.
- [ ] The clock ticks and matches the real time.
- [ ] Tapping it sparkles.
- [ ] The screen stays awake (same Auto-Lock test as in A).
- [ ] Afterwards, delete the preview icon from your home screen. It's tied to the preview
      address, not the real site.

## C. Android — Chrome

Open the preview link and sign in. Then Redeem Prizes → Brunswick Grove → **Redeem**.

- [ ] The band moves, the clock ticks and matches the real time, and the date is today's.
- [ ] Tapping sparkles and flashes the border. You should also feel **a tiny buzz** (iPhone
      doesn't buzz; that's expected).
- [ ] A screenshot viewed in Photos/Gallery is frozen.
- [ ] The screen stays awake past the screen timeout.
- [ ] Reduce Motion (Settings → Accessibility → **Remove animations**): no band, the clock
      still ticks, and a tap still flashes.

## D. Anything that looked wrong

Write it here (or just tell Claude). A screenshot or screen recording helps.

-

## E. Redeem it once, for real (do this LAST)

This is the first real end-to-end redemption on production. It checks that a coupon can only
be spent once.

1. Open the TEST coupon (**Redeem**) on **two screens at once**, for example iPhone Safari and
   the Android phone, both signed in as Andrew at Brunswick Grove.
2. On screen 1, tap **Confirm Redemption**.
   - [ ] It shows **"Redeemed!"**, then closes, and the coupon is gone from the list.
3. On screen 2 (the coupon is still open there), tap **Confirm Redemption**.
   - [ ] It says **"This prize was already redeemed."**, the live coupon **closes by itself**,
         and the list no longer shows the coupon.
   - [ ] It does **not** show "Redeemed!" a second time.

## F. Clean-up (Claude does this)

Tell Claude "phone check done". Claude will then:

- Delete the test coupon (`challenge_campaign_redemptions.id = cbb59f90-8107-4166-837e-e7d5ffaf3ffc`)
  and its reward (`challenge_campaigns.id = a8062067-303d-4e71-b022-fbd631e46870`) from production.
- Then commit and deploy, as you decided on 2026-10-05.

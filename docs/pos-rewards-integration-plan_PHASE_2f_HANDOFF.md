# POS Rewards Integration — Phase 2f Handoff (partner reporting)

**Plan:** `docs/pos-rewards-integration-plan.md` · **Phase:** 2f · **Date:** 2026-10-06 · **By:** Claude Sonnet 5.5
**State:** Built and tested, **uncommitted** (2e is also still uncommitted). Nothing pushed or deployed; the production flag is off.

## For Andrew (plain English)
- **`/info`** now says "Works with your Square register!" under the hero tagline (plain text, no Square logo). It is on the public page, so it goes live on the next deploy — even though the POS feature flag is off. Remove the line if you'd rather it wait for the pilot.
- **Partner Dashboard → Point of Sale** now has a **Rewards redeemed** list (newest 50 at that venue): guest, prize, when, and how (Confirmed by guest / Square gift card). For Square gift cards it also shows the amount, balance left, and last used (or "not used yet").
- Not live: it only appears while the Point of Sale flag is on. Nothing is saved or charged by this.
- Needs you: say "commit" (2e + 2f), and view the list on a phone once Square has a real redemption.

## For the next agent
1. **Next:** 2g (production setup, plan §2g). Opus 5.5 `/code-review high` + `/security-review` on everything Square since `27f5eea` must run before the flag turns on. Out of scope: 2h, Clover, Toast.
2. **Starting state:** branch `main`, last commit `164241d`. Uncommitted: all 2e files (see 2e handoff) plus 2f below. `clover-spike/` untracked: never `git add -A`. No migration, no data changes.
3. **Decisions:** the list lives inside the existing POS sheet (no new menu row/sheet/flag). `/info` line placed in `app/info/page.tsx` after the hero tagline. A coupon with `redeemed_method` null or `guest_confirm` reads "Confirmed by guest"; `pos_square` reads "Square gift card" (= converted to a card, not spent); other methods read "Register".
4. **Files:** new `lib/pos/redeemedRewards.ts` (`listRedeemedRewards`, `redeemedHow`), `app/api/owner/pos/redeemed/route.ts` (GET `?venueId=`; flag 404 → `requireOwnerAuth` → `auth.venueIds` check), `components/owner/pos/RedeemedRewardsList.tsx`, `tests/lib.pos-redeemed-rewards.test.ts`. Changed: `components/owner/pos/PosConnectionsSheet.tsx` (renders the list once statuses are ready), `tests/components.pos-connections-sheet.test.ts` (now expects 2 fetches on open), `app/info/page.tsx`, plan status line.
5. **Cost:** per sheet open, 3 bounded reads (redemptions newest 50 by `prize_redeemed_at`, ledger rows for the Square ones, usernames), zero Square calls, no cron. At 100 venues × a few opens/week this is negligible. Trap: there is no index on `challenge_campaign_redemptions (venue_id, prize_redeemed_at)`; the table is small today, so no migration was added. Add one if it grows to many tens of thousands of rows.
6. **Privacy:** the response carries no gift card id, card number, merchant id or user id (contract-tested). It does include the guest's username, as the coupon screen already does for staff.
7. **Verified:** `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 304 files passed, 1 skipped, 0 failed; `npm run build` OK, 190 pages (new `ƒ /api/owner/pos/redeemed`). Not verified: a browser view of the list, real Square data (the "last used" logic reads `first_redeemed_at`/`last_activity_at` written by the webhook), `/code-review high` of 2c–2f (plan asks Opus to run it).
8. **Open questions:** keep the `/info` line live before the pilot? Commit 2e+2f? Push 2c–2f? Pilot merchant (plan §6 item 14).
9. **First steps for 2g:** commit 2e+2f with Andrew's OK; run `/code-review high` and `/security-review`; then follow plan §2g and write `docs/square-go-live-runbook.md`.

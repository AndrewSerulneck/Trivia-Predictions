# POS Rewards Integration — Phase 2e Handoff (partner and staff instructions)

**Plan:** `docs/pos-rewards-integration-plan.md` · **Phase:** 2e · **Date:** 2026-10-06 · **By:** Claude Sonnet 5.5
**State:** Built and tested, **uncommitted**. Nothing pushed or deployed; the production flag is still off.
**Next:** Phase 2f (partner reporting), Sonnet 5.5 medium.

## For Andrew (plain English)
**What changed.** Partners now get plain instructions for Square:
- In the Point of Sale panel, before Square is connected: a short **"Set up Square"** checklist.
- After it's connected: a **"How staff take a prize"** card (gift card taps; the green "Hightop prize" discount taps;
  what to do if something's off) and a **Print the staff sheet** button.
- The **staff sheet** (`/owner/pos-staff-sheet`) is one big-type page with a Print button. Printing hides the app bar.
- The **Partner Manual** has a new "Point of Sale (Square)" section.
- Guests offered a Square gift card now also see "At the register, tell staff you'll pay with a Square gift card."
- Not added: the `/info` line "Works with your Square register" (the plan said only if you want it). Say so if you do.

**Is it live?** No. It's committed nowhere yet and the Point of Sale feature is still off in production.
Also done this session: 2c + 2d committed as `164241d` (not pushed).

**Needs you:** (1) say "commit" when you want 2e saved; (2) the register taps are written from Square's documented
flow, not a real device. Please glance at the staff sheet with a Square register in hand, or send screenshots, so we
can correct wording before the pilot (2h). (3) `/info` line: yes or no?

## For the next agent
1. **Next phase:** 2f, "Rewards redeemed" list in the Partner Dashboard (plan §2f). Out of scope: 2g production setup,
   2h pilot, Clover, Toast.
2. **Starting state:** branch `main`, last commit `164241d` (2c + 2d, all prior uncommitted POS docs; not pushed).
   2e changes below are uncommitted. `clover-spike/` is still untracked: never `git add -A`. No migration, no data
   changes, nothing deployed.
3. **Decisions:** all copy in one file, `lib/posStaffInstructions.ts`, read by the sheet, the printable page and the
   Partner Manual so they can't disagree. Printable page is a flag-gated `/owner/*` Next page (not a PDF): it reuses
   the shared copy and needs no extra assets. No `/info` line (not asked). No screenshots (none supplied).
4. **Files:** new `lib/posStaffInstructions.ts`, `app/owner/pos-staff-sheet/page.tsx`,
   `tests/lib.pos-staff-instructions.test.ts` (5 tests). Changed: `components/owner/pos/PosConnectionsSheet.tsx`
   (`SquareHelp`: checklist when Square not connected, staff card + print link when connected),
   `components/owner/OwnerAppBar.tsx` (`print:hidden` on the header only), `lib/partnerManual.ts` (new section before
   Venue Display), `components/prizes/SquareGiftCardPanel.tsx` (guest line on the offer screen), plan status line,
   `CLAUDE.md` POS pointer.
5. **Traps:** the register taps (Charge → Gift card; Discounts list → "Hightop prize…") are unverified on a real
   register; per-item vs per-sale cap behaviour also unverified (2d handoff §5). The partner-manual contract test bans
   the word "click". Printing was not tested in a real browser print preview.
6. **Verified 2026-10-06:** `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 303 files, 3,403 passed,
   13 skipped, 0 failed; `npm run build` OK, 189 pages (new `○ /owner/pos-staff-sheet`). Not run: browser walkthrough,
   print preview, `test:pwa-contract`/`test:god-mode-join` (no player shell/join changes).
7. **Open questions:** `/info` Square line (Andrew); screenshots for the staff sheet; commit 2e; push 2c–2e; pilot
   merchant (plan §6 item 14, for 2h); the 2d sandbox click-through is still optional and undone.
8. **First steps for 2f:** read plan §2f and `lib/pos/` ledger readers; one bounded query per open, never return a
   GAN, gift card id or merchant id; run the full gate; write the 2f handoff.

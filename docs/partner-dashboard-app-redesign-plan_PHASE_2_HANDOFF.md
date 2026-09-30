# Partner Dashboard App-Style Redesign — Phase 2 Handoff

**Plan:** `docs/partner-dashboard-app-redesign-plan.md`
**Phase finished:** Phase 2, the top bar, logo menu and compact shell. 2026-09-30, Sonnet 5.5.
**Next phase:** Phase 3, the dashboard body (two section cards). Plan's model/effort: Sonnet 5.5, medium.
**Earlier handoff:** `docs/partner-dashboard-app-redesign-plan_PHASE_1_HANDOFF.md` (still accurate; read it for the sheet/drawer/step/URL building blocks).

---

## For Andrew (plain English)

**What changed.**
- The Partner Dashboard now has a **slim top bar**. The small logo at top-left (with a little ☰ badge)
  opens a **menu that slides in from the left**: Venue Display, Billing, Partner Manual, Game Settings,
  Account Settings, then a line, then Sign Out last.
- The venue name is in the middle of the bar. With more than one venue, tapping it switches venue.
  The old venue card and the "Partner Manual" button in the page body are gone (the manual is in the menu).
- Every other partner page (Billing, Display, Account, Game Settings, Schedule, Rewards, Billing setup)
  now has a slim bar too: **Back arrow top-left, page title beside it**, and no big logo. Their small
  subtitle moved into the page body. Sign Out no longer appears on those pages; it lives in the
  dashboard menu, one Back tap away.
- The sign-in / register / password pages are **unchanged** (they keep the big logo on purpose).

**Is it live?** No. Nothing is committed, pushed or deployed (Phase 1 is uncommitted too).

**What's left.** Phases 3–6. The dashboard body still shows the old six tiles until Phase 3.

**What I need from you.**
1. Say whether to commit Phases 1 and 2. I haven't, since you didn't ask.
2. When it's deployed, glance at it on your phone: open the menu, open the Partner Manual from it, tap
   Back from Billing. Headless tests can't judge the look.
3. Heads-up: 4 Bingo "star index is stale" tests fail. They are unrelated to this work (see below).

---

## For the next agent

### 1. Phase 3 goal and scope
Exactly plan §4c and Phase 3: rewrite the body of `app/owner/dashboard/page.tsx` into two section cards
(Live Games, Rewards) with skeleton / empty / populated / error states; load venues once, then
`/api/owner/schedule?venueId=` and `/api/owner/competitions?venueId=` in parallel; add
`components/owner/dashboard/{LiveGamesSection,RewardsSection}.tsx`; move list helpers out of
`app/owner/schedule/page.tsx` and `app/owner/competitions/page.tsx` into `lib/ownerScheduleDisplay.ts` /
`lib/ownerRewardDisplay.ts` with unit tests; the section buttons open **empty placeholder `OwnerSheet`s**
driven by `useOwnerSheet()` (wrap the body in `<Suspense>`). Remove the six placeholder tiles.
**Out of scope:** the real Schedule/Rewards flows (Phases 4–5), discard confirm / ☰ pulse / toast (Phase 6),
server APIs, `proxy.ts`, migrations, `vercel.json`.

### 2. Starting state
- Branch `main`, HEAD `2694f99`. **Nothing from Phases 1 or 2 is committed.** Ask Andrew first; if yes,
  commit together (e.g. "Partner Dashboard redesign Phases 1–2: sheet/drawer building blocks, app bar and compact shell").
- Modified (Phase 2): `components/owner/OwnerShell.tsx`, `app/owner/dashboard/page.tsx`,
  `app/owner/{schedule,game-settings,competitions,display,account,billing,billing/setup}/page.tsx`
  (each just lost one `showAccountMenu` line), `tests/navigation-controls-contract.test.ts`,
  `docs/partner-dashboard-app-redesign-plan.md` (status line).
- New (Phase 2): `components/owner/OwnerAppBar.tsx`, `components/owner/menu/ownerMenuItems.ts`,
  `tests/owner-menu-contract.test.ts`, this handoff.
- No data, DB, env, Stripe or Vercel changes. No backups needed.

### 3. Decisions (do not re-ask)
All of the plan's §3 recommended answers stand (see Phase 1 handoff §3). Phase 2 implementation choices:
- **`OwnerAppBar` owns the drawer and the manual.** It holds `menuOpen`/`manualOpen` state and the logo
  button ref, so the shell/dashboard don't. Partner Manual row: closes the drawer, then opens
  `<PartnerManual showTrigger={false} open onOpenChange returnFocusRef={logoRef}>`.
- **The logo menu only exists when no `leading` is passed.** The dark `OwnerShell` passes
  `leading={<ExitBackButton/>}` when `backTo` is set, so sub-pages have Back and no drawer; a dark page
  with no `backTo` (only the dashboard) gets the logo menu. Drawer/manual aren't even mounted otherwise.
- **`OwnerShell` dark:** new optional `barCenter` (replaces the title in the bar; `title` becomes an
  `sr-only` h1). `subtitle` now renders as a small paragraph at the top of the body. `showAccountMenu`
  is **ignored on dark** (kept only for the light variant); I deleted the prop line from the 7 dark pages.
- **`OwnerAccountMenu` was kept**, not deleted: the light variant still renders it and the orphan
  `/owner/category-blitz` page (light, unlinked) passes `showAccountMenu`. Its allowlist entry stays.
- **`/owner/billing/setup` is the *dark* variant** (the Phase 1 handoff implied light), so it lost its
  Sign Out too. A partner stuck pre-payment can Back to the dashboard and use the menu; that page's own
  "Cancel and start over" button is unchanged.
- **Static logo:** the bar uses a plain `<img>` of `/brand/HTC_Logo_Final_Transparent%20copy.png` (36px),
  not `ExplodingLogo` (its burst animation and pointer handlers don't suit a button).
- Menu header copy is just "Menu"; the plan's optional venue name / email header was left out.
- Bar inner width is `max-w-2xl` while page content keeps `maxWidth` (`sm` = `max-w-sm`), so on desktop
  the bar is wider than an `sm` page. Phone-first; adjust if it bothers Andrew.

### 4. Files and how they fit
| File | Role |
|---|---|
| `components/owner/OwnerAppBar.tsx` | Sticky `h-14` bar (`z-40`, `bg-ht-canvas/90`, `backdrop-blur`, safe-area top). Props `leading?`, `children` (centre), `className?`. Logo button: `aria-label="Open menu"`, `aria-haspopup="dialog"`, `aria-expanded`, 40×40, ☰ badge. Renders `OwnerMenuDrawer` with a `<nav aria-label="Partner menu">` of `OWNER_MENU_ITEMS`, a divider, and `<SignOutButton variant="partner" />` last. **This is now a SignOutButton host** (added to the allowlist). Trailing slot is an empty 40px spacer. |
| `components/owner/menu/ownerMenuItems.ts` | `OWNER_MENU_ITEMS`: the five rows in §4b order (id, label, hint, Lucide icon, `href`; the manual has none). |
| `components/owner/OwnerShell.tsx` | Dark branch rewritten (see §3). Light branch byte-unchanged. |
| `app/owner/dashboard/page.tsx` | Passes `barCenter={venueSwitcher}` (name, or `Dropdown` with ▾ for 2+ venues); the venue card and `PartnerManual` are gone; still renders the six tiles (Phase 3 replaces them). |
| `tests/owner-menu-contract.test.ts` | Pins row order and hrefs, one `SignOutButton` after `</nav>` in the partner variant, and that the dark shell uses the bar with no `ExplodingLogo` / `OwnerAccountMenu`. |

### 5. Facts and traps
- The overlays portal to `document.body`, so the bar's `backdrop-blur` can't trap them.
- The dashboard tile "Partner Manual" text in `lib/partnerManual.ts` still says "click the button": Phase 6.
- `Dropdown`'s `renderTrigger` puts your `className` on the trigger button; the panel width follows the
  trigger, so a long venue name in a narrow bar gives a narrow list. Check on a phone.
- The 4 failing tests in `npm run test` are the Bingo star-index staleness tripwires
  (`tests/lib.sportsBingo.{nfl,mlb}-star-index{,-freshness}.test.ts`), failing since before Phase 1;
  fix is `npm run bingo:stars:nfl` / `:mlb` (live API, writes repo files). Not part of this plan; tell Andrew, don't run unasked.
- Phase 1 traps still apply: `useSearchParams` needs `<Suspense>`; step components remount on change so keep form
  state in the host; the phone Back gesture bypasses `closeGuard`.

### 6. Build, run, test
```bash
npx tsc --noEmit    # clean
npm run lint        # clean
npm run test        # 2,683 pass / 13 skip / 4 FAIL (the 4 known star-index ones only)
npm run build       # passes
```
Don't run `tsc` and `build` concurrently. `npm run test:pwa-contract` wasn't needed (no `globals.css` change in Phase 2).
**Verified:** types, lint, full test run, production build, and the new static contract test.
**Not verified:** anything visual or interactive in a real browser (bar look, drawer, focus return to the
logo after the manual closes, Back arrow layout on each sub-page, Dropdown-in-bar). There is no render test
for `OwnerAppBar`. Phase 3 should run the dashboard in a real browser (the `verify`/`run` skill, with an
owner session cookie) once the sections exist.

### 7. Open questions for Andrew
- Commit Phases 1–2 now?
- Nothing blocking.

### 8. Recommended first steps for Phase 3 (Sonnet 5.5, medium)
1. Read plan §4c and Phase 3, this handoff, `app/owner/schedule/page.tsx` (`displayWindow`, `recurrenceLabel`,
   `dateChip`, `ScheduleList`), `app/owner/competitions/page.tsx` (`glyphForCompetition`, `CompetitionList`),
   `lib/useOwnerSheet.ts`, `components/owner/sheet/OwnerSheet.tsx`.
2. Extract the helpers to `lib/ownerScheduleDisplay.ts` / `lib/ownerRewardDisplay.ts` (leave the old pages
   importing them so nothing breaks) with unit tests.
3. Build the two section components, then rewrite the dashboard body (Suspense around the `useSearchParams` user).
4. Gates as in §6; then write `..._PHASE_3_HANDOFF.md` and update the plan's status line.

# Partner Dashboard — App-Style Redesign Plan

**Status:** Phases 1–4 complete 2026-09-30. Phases 1–3 committed as `c182c06`; Phase 4 committed on top
(nothing pushed or deployed). Andrew accepted every §3 recommended default and skipped Phase 0. Next: Phase 5
(Offer Rewards sheet). Start from `docs/partner-dashboard-app-redesign-plan_PHASE_4_HANDOFF.md`.
**Handoffs:** each phase ends with `docs/partner-dashboard-app-redesign-plan_PHASE_<N>_HANDOFF.md`
(global rule in `~/.claude/CLAUDE.md`). Update this status line to point at the latest one.

---

## 1. Summary (plain English)

Today the Partner Dashboard is a big centered logo, a venue card with a "Partner Manual" button,
and a grid of six equal tiles. Every tile goes to a separate page. It works, but nothing tells a
partner what matters most or where things live.

After this redesign it will look and behave like the apps partners already use every day
(banking, food delivery, and similar apps):

- **A slim top bar.** A small logo in the top-left corner is the **menu button**. Tapping it slides a
  menu in from the left. The menu lists, in this order: **Venue Display, Billing, Partner Manual,
  Game Settings, Account Settings, Sign Out**. The venue's name sits in the middle of the bar. If a
  partner has more than one venue, tapping the name switches venues.
- **Two sections on the dashboard:** **Schedule Live Games** at the top and **Offer Rewards** below it.
  When a section is empty, it shows a large card with a dashed outline, a big **+** and a sentence
  such as *"Tap here to schedule a live game your whole room plays together."* Partners already
  know that pattern means "add something here." When a section has items, it lists them. A
  **"+ Schedule another game"** or **"+ Offer another reward"** row sits at the bottom of the list.
- **No page changes for the two main jobs.** Tapping either section slides a panel up from the
  bottom, the same way the Partner Manual opens now. Inside the panel, each step slides left or
  right, one question per screen. Finishing slides the panel back down. The new game or reward is
  then in the list, briefly highlighted, with a confirmation message.
- **Tapping an existing game or reward** opens the same panel on that item, so the partner can
  edit a game, cancel a game or end a reward. These actions all work today, so they must be kept.

What does not change: server APIs, the database, Stripe, prices, the TV display pairing, and the
rules for scheduling or creating rewards. This is a front-end change. It adds no new cloud cost:
it calls the same endpoints, and the partner makes fewer page loads overall (see §6).

---

## 2. Current state (verified 2026-09-30, commit `2694f99`)

| Piece | File | Notes |
|---|---|---|
| Dashboard | `app/owner/dashboard/page.tsx` (185 lines) | Venue card + `PartnerManual` button + 6 `Link` tiles in a 2-col grid. Fetches `/api/owner/venues` only. |
| Shell | `components/owner/OwnerShell.tsx` | Dark variant renders `ExplodingLogo width={220}` + `ht-h1` title centered — the "logo taking tons of space." `showAccountMenu` puts `OwnerAccountMenu` top-left; `backTo` puts `ExitBackButton` top-left (or top-right when both). |
| Account menu | `components/owner/OwnerAccountMenu.tsx` | A `UserRound` circle → dropdown holding only `SignOutButton variant="partner"`. It is in the `SignOutButton` host allowlist in `tests/navigation-controls-contract.test.ts:148`. |
| Partner Manual sheet | `components/owner/PartnerManual.tsx` | **The slide-up reference.** Scrim `animate-tp-fade-in/out`, panel `animate-tp-popup-sheet-up/down` (`app/globals.css:1795-1873`, 320ms in / 270ms out, reduced-motion aware), `setScrollLock(..., "popup")`, Esc to close, focus returns to trigger. Content from `lib/partnerManual.ts`. |
| Schedule page | `app/owner/schedule/page.tsx` (754 lines) | Page-level venue picker, upcoming/past `ScheduleList`, and one long `ScheduleForm` (game type, title, start, rounds, timezone, recurrence), which handles both create and edit. Delete returns a `rewardNotice`. Category Blitz is hidden from the picker when `isContinuousDefaultEnabled()`, which leaves **Live Trivia as the only option**. |
| Rewards page | `app/owner/competitions/page.tsx` (523 lines) | Venue picker, `CreateRewardWizard variant="owner"`, `CompetitionList` (active/ended), `RemoveRewardDialog` (archive vs delete with prize counts). |
| Reward wizard | `components/rewards/CreateRewardWizard.tsx` (1,211 lines) | **Shared with admin** (`ChallengesSection.tsx`) through the `variant` prop. **Do not fork it.** Steps are `venue → definition → terms → prize → confirm`, conditionally rendered with no transition. It already uses `WizardFooter variant="inline"`. `scheduleLinkHref` renders a plain `<a>` ("Schedule Live Trivia") when the chosen game isn't scheduled. |
| Other menu targets | `app/owner/{display,billing,game-settings,account}/page.tsx` | Stay as full pages. `/owner/display` is deep-linked from the TV `/tv` QR code (`?code=` pairing), so it **must stay a routable page**. |
| Orphan | `app/owner/category-blitz/page.tsx` | Nothing links to it. It is out of scope and stays unlinked. |
| Animation libs | `framer-motion` ^12 is installed (used on the venue TV screen). | This plan uses **CSS keyframes in `globals.css`**, the same way the Partner Manual sheet works. That keeps to the repo's Tailwind-first style rule (inline `style={{}}` is only allowed under `components/venue-screen/*`). |

---

## 3. Decisions for Andrew (recommended default first)

1. **Where does the menu live?** *Recommended:* only on the dashboard. The pages the menu opens
   (Billing, Display, etc.) show the standard **Back** button in the top-left, a small title and
   **no big logo**. Sign Out moves off those pages and stays in the menu, one tap away after Back.
   This is how banking apps work, and it follows the rule that there is one control in the
   top-left, never two. *Alternative:* the logo menu appears on every page, with Back on the right.
   That breaks the "Back is top-left" rule in `docs/navigation-unification-plan.md`.
2. **How will partners know the logo is a button?** A logo on its own doesn't look tappable, and
   hidden navigation is the most common first-visit failure in app design. *Recommended:* show a
   small ☰ (three-line) badge on the corner of the logo, and pulse it once on the first visit. The
   first-visit flag is stored in `localStorage`, which is safe because it is a cosmetic hint only.
3. **Tapping an existing game or reward** opens it in the same slide-up panel with **Edit / Cancel
   game** (games) or **End reward** (rewards). *Recommended:* yes. The current pages have these
   actions, so leaving them out would remove features.
4. **Past games and ended rewards.** *Recommended:* the dashboard shows only upcoming games and
   active rewards, at most 3 each, then "See all (N)". Past games and ended rewards sit behind a
   "History" link inside each panel. This keeps the home screen short.
5. **Leaving a half-finished panel.** *Recommended:* if the partner has entered anything, swiping
   down, tapping outside or pressing Close asks *"Discard this game?"* (Keep editing / Discard).
   Nothing is saved as a draft.
6. **Menu items stay full pages** (Venue Display, Billing, Game Settings, Account Settings).
   *Recommended:* yes. Display must stay a URL for the TV QR code, and Billing hands off to Stripe.
   Only the Partner Manual opens as a panel, as it does today.
7. **Phase 0 prototype.** *Recommended:* yes. It is a clickable, phone-sized HTML mock-up for
   Andrew to try on his own phone before any code changes (about half a day). It is much cheaper
   to change the design at that stage than after Phases 3–5.

---

## 4. Target design (the spec every phase builds to)

### 4a. Top app bar (dashboard)
- Sticky, `h-14`, `bg-ht-canvas/90` + `backdrop-blur`, bottom hairline on scroll, top padding for
  the phone's safe area (`env(safe-area-inset-top)`).
- **Leading (top-left):** a 40×40 tap target holding the small logo mark (`ExplodingLogo` at about
  width 36, or a static mark if the animated one doesn't scale down), plus a 14px ☰ badge
  bottom-right. `aria-label="Open menu"`, `aria-haspopup="dialog"`, `aria-expanded`.
- **Center:** the venue name (truncated, `font-black`). With 2+ venues, it gets a ▾ and opens the
  existing `Dropdown` venue switcher. The dashboard's venue card is removed.
- **Trailing:** empty (kept free for future notifications). The "Partner Manual" button leaves the
  body.

### 4b. Menu drawer
- Slides in from the **left** (new `animate-tp-drawer-in/out` keyframes), `w-[82vw] max-w-xs`,
  full height, scrim with tap-to-close, Esc to close, focus moved into the drawer and returned to
  the logo on close, scroll lock through `setScrollLock`.
- Header: the logo, the venue name and the partner's email (from `/api/owner/account` if it is
  cheap, otherwise leave it out).
- Rows (Lucide icon, label, one-line hint), **in this order:**
  1. Venue Display: `Tv`, "Put games on your TVs" → `/owner/display`
  2. Billing: `CreditCard`, "Plan, card & invoices" → `/owner/billing`
  3. Partner Manual: `BookOpen`, "How Hightop works" → closes the drawer, then opens the
     Partner Manual sheet
  4. Game Settings: `SlidersHorizontal`, "How games are scored" → `/owner/game-settings`
  5. Account Settings: `UserRound`, "Email & password" → `/owner/account`
  6. divider, then **Sign Out** (`SignOutButton variant="partner"`). It is the last item and has
     no arrow, as the nav rules require.

### 4c. Dashboard body
Two stacked **section cards** (`rounded-2xl bg-ht-surface shadow-ht-card`), in this order:

**Schedule Live Games** (accent `bg-ht-game-live`)
- Header row: game icon, "Live Games" title, and a round **+** button on the right
  (`aria-label="Schedule a live game"`).
- *Empty state:* the whole card body is one button with a dashed `border-ht-soft` border, a large
  **+** in a cyan circle, **"Schedule a live game"** and the hint *"Pick a game and a time. Your
  whole room plays together."*
- *Populated:* up to 3 rows with a date chip (reuse the `dateChip` style from
  `app/owner/schedule/page.tsx`), the title, the time range, a "Repeats Fri, Sat" pill if it
  repeats, and a chevron. Then "See all (N)" if there are more, then a dashed **"+ Schedule another
  game"** row.

**Offer Rewards** (accent `bg-ht-game-pickem`)
- The same structure. The empty state reads **"Offer your guests a reward"** / *"Give a prize to
  top players, like a free appetizer for tonight's trivia winner."*
- Populated rows show the glyph (`glyphForCompetition`), the name, the terms sentence
  (`renderTermsSentence` / `describeCampaignGameWinnerTerms`) and a chevron. Then "+ Offer another
  reward".

Loading state: two skeleton cards, not "Loading…". Errors show inside the section card with Retry.

### 4d. Slide-up flow sheet
- Generalised from `PartnerManual`: the same scrim and `tp-popup-sheet-up/down` motion. It is
  **tall on phones** (`h-[92svh]`) so the dashboard shows at the top edge, as in iOS. It has a grab
  handle, a header (title + **Close**, top-right, matching the Partner Manual), a scrolling body and
  the step footer (`WizardFooter` with StepBack and Next).
- **Steps slide horizontally.** Forward: the new step comes in from the right and the old one goes
  out to the left. Back does the reverse. The motion is 240ms and turns off under
  `prefers-reduced-motion`.
- **The phone's Back gesture must close the sheet or go back one step, not leave the dashboard.**
  Opening a sheet adds `?sheet=schedule` / `?sheet=rewards` (plus `&step=`) with
  `router.push(..., { scroll: false })`, and the sheet state is read from `useSearchParams()`. The
  hardware or browser Back button then closes the sheet or steps back, and a deep link can open it
  directly.
- On success: the sheet slides down, the section refetches its list, the new row gets a 2-second
  cyan ring and is scrolled into view, and a toast shows *"Live Trivia scheduled: Fri, Oct 3 at 8:00
  PM"*.

### 4e. Schedule Live Games flow (splitting today's single form into steps)
1. **Game.** Tapping a tile moves straight to the next step. **This step is skipped automatically
   when only one game can be scheduled** (true today, while `isContinuousDefaultEnabled()` hides
   Category Blitz).
2. **When.** Date and time (`datetime-local`), then rounds (stepper), with a live *"Ends at 9:40
   PM"* preview (existing `endsAtLabel` logic). The timezone defaults to the browser's timezone if
   it is in `TIMEZONES`, and otherwise to `America/New_York` as today. It sits under a small "Change
   timezone" disclosure.
3. **Repeat** (Live Trivia only; skipped otherwise). Choose "Just once" or "Every week on…" and pick
   days. Keep today's validation that at least one day is required.
4. **Review & name.** The title is **prefilled** with the game's name (e.g. "Live Trivia") so it can
   no longer block saving. A summary card, then the **"Schedule game"** button.

Edit mode opens straight to the Review step with every step editable ("Change" links). Cancelling a
game shows a confirmation, then displays the server's existing `rewardNotice` when there is one.

### 4f. Offer Rewards flow
- Hosts `CreateRewardWizard variant="owner"` inside the sheet. The owner flow has one venue per
  sheet (the current venue comes from the top bar), so the `venue` step never shows.
- Adds **horizontal step transitions inside the wizard** through a new opt-in prop
  (`animateSteps?: boolean`, default `false`, so admin behaviour doesn't change). This is one
  component with one extra prop, not a fork.
- Adds an optional `onRequestSchedule?: () => void`. When it is set, the "Schedule Live Trivia" link
  calls it instead of following `scheduleLinkHref`. The dashboard then closes the Rewards sheet and
  opens the Schedule sheet. After a game is saved, the toast offers **"Now offer a reward for it →"**,
  which reopens Rewards.
- Tapping an existing reward opens a detail screen: the terms, the top 3 progress entries (as
  today), and **End reward**. That reuses `RemoveRewardDialog` as a sheet step (archive vs delete,
  with prize counts, and the same copy).

### 4g. Menu destination pages
`OwnerShell variant="dark"` changes to the compact bar: `ExitBackButton` top-left (back to
`/owner/dashboard`), the page title in the bar, no `ExplodingLogo`, and the subtitle moves into the
page body. The light variant (auth pages, `/owner/billing/setup`) is **not changed**, because the
pre-payment and sign-in screens keep the large brand logo on purpose.

### 4h. Old URLs
`/owner/schedule` → `/owner/dashboard?sheet=schedule` and `/owner/competitions` →
`/owner/dashboard?sheet=rewards`, through a server-component `redirect()` in each `page.tsx`. **Do
not touch `proxy.ts`.** `CreateRewardWizard`'s admin `scheduleLinkHref` stays as it is.

---

## 5. Phases

Model guidance: **Sonnet 5.5 can handle most of this, and I agree with Andrew's estimate.**
**Opus 5.5** is used in only two places:
- **Phase 1:** the shared sheet, step and history pieces. Accessibility, focus, iOS scroll lock and
  Back-gesture problems in these parts are subtle, and every later phase depends on them.
- **The final review in Phase 6.**

No phase needs a model above Opus 5.5.

### Phase 0: Clickable prototype (recommended, optional)
- **Model / effort:** Sonnet 5.5, **medium**. About half a day.
- **Scope:** one self-contained, phone-width HTML artifact using the real `ht-*` token values from
  `docs/partner-dashboard-design.md` §1. It covers the top bar, the drawer, both empty states, both
  populated states, the schedule flow (3–4 steps with the horizontal slide), the reward flow (fake
  data) and the success return. It uses fake data and makes no repo code changes.
- **Done when:** Andrew has tried it on his phone and answered §3. Record the answers in the
  Phase 0 handoff.

### Phase 1: Shared building blocks
- **Model / effort:** **Opus 5.5, medium.**
- **Build:**
  - `components/owner/sheet/OwnerSheet.tsx`: slide-up sheet (props `open`, `onRequestClose`,
    `title`, `children`, `footer`, `closeGuard?`). Includes the scrim, the enter and exit timings
    (keep `SHEET_EXIT_MS` + `resolveExitMs` from `PartnerManual`), Esc, a focus trap, focus return,
    `setScrollLock`, safe-area padding and the grab handle. Swipe-to-dismiss is optional, and if
    built it must not fight inner scroll.
  - `components/owner/sheet/SlideSteps.tsx`: renders the current step keyed by id. It works out
    the direction from the step order and applies `animate-tp-step-in-right/left`. It keeps focus
    on the new step's heading (for screen readers).
  - `components/owner/menu/OwnerMenuDrawer.tsx`: left drawer, same behaviour as the sheet.
  - `lib/ownerSheetParams.ts` + a `useOwnerSheet()` hook: reads and writes
    `?sheet=&step=` through `useSearchParams` and `router.push/replace`. It includes the pure
    helpers `parseSheetParam` and `nextStepHref`. **`useSearchParams` needs a `<Suspense>`
    boundary in Next 16.** Wrap the dashboard body in one.
  - `app/globals.css`: add `tp-step-in-right/left`, `tp-step-out-left/right`,
    `tp-drawer-in/out` next to the existing sheet keyframes, and add them to **both**
    reduced-motion blocks (`~1870` and `~2303`).
  - Refactor `PartnerManual.tsx` to render through `OwnerSheet`. Its behaviour and look must not
    change, and it gains an `open`/`onOpenChange` controlled mode so the drawer can open it.
- **Tests:** unit tests for `ownerSheetParams` (parse, invalid values, step ordering, skipped
  steps) and a render test for `SlideSteps` direction.
- **Done when:** the Partner Manual looks and behaves as before, through the new sheet.
  `npx tsc --noEmit`, `npm run lint` and `npm run test` all pass.

### Phase 2: Top bar, logo menu, compact shell
- **Model / effort:** Sonnet 5.5, **medium**.
- **Build:**
  - `components/owner/OwnerAppBar.tsx` (the logo menu button and ☰ badge, the venue name /
    switcher slot, and a `leading` override for Back).
  - Wire `OwnerMenuDrawer` with the six items in §4b's order.
  - Change `OwnerShell`'s dark variant to the compact bar (§4g), and remove the 220px logo.
  - Per decision 1, remove `showAccountMenu` from dark sub-pages.
  - Remove `OwnerAccountMenu` once nothing uses it, **or** keep it for the light variant if
    `/owner/billing/setup` still needs Sign Out. Check the file before deleting it.
  - Update the `SignOutButton` host allowlist in `tests/navigation-controls-contract.test.ts`
    (currently `components/owner/OwnerAccountMenu.tsx`).
- **Tests:** a static contract test (`tests/owner-menu-contract.test.ts`) that pins the six menu
  items and their order, and checks that Sign Out is last.
- **Done when:** the dashboard has the bar and the drawer, and every dark `/owner/*` page shows
  the compact bar with Back. Gates are green.

### Phase 3: Dashboard body (two section cards)
- **Model / effort:** Sonnet 5.5, **medium**.
- **Build:**
  - Rewrite `app/owner/dashboard/page.tsx`: load venues once, then load schedules
    (`/api/owner/schedule?venueId=`) and rewards (`/api/owner/competitions?venueId=`) **in
    parallel**.
  - Add `components/owner/dashboard/LiveGamesSection.tsx` and `RewardsSection.tsx`, each with
    skeleton, empty (§4c copy), populated and error states.
  - Move the list helpers (`displayWindow`, `recurrenceLabel`, `dateChip`, `glyphForCompetition`,
    date/time formatters) out of the two pages into `lib/ownerScheduleDisplay.ts` /
    `lib/ownerRewardDisplay.ts`, so the lists and the sheets share them. Cover them with unit
    tests.
  - For now, the section buttons open empty placeholder `OwnerSheet`s.
- **Done when:** a partner with no games and no rewards sees two obvious "tap to add" cards, and a
  partner with data sees correct lists. The venue switcher changes both lists.

### Phase 4: Schedule Live Games sheet
- **Model / effort:** Sonnet 5.5, **high**. The timezone, recurrence and duration logic must be
  kept byte-for-byte in meaning.
- **Build:**
  - Extract `ScheduleForm` into `components/owner/schedule/ScheduleGameFlow.tsx` as the steps in
    §4e. Keep all maths through the existing helpers (`datetimeLocalValueToUtcIso`,
    `utcIsoToDatetimeLocalValue`, `durationMinutesFor`, `roundsFromWindowMinutesFor`,
    `getCurrentOrNextScheduleWindow`).
  - Keep the step sequence as a pure function (`scheduleSteps({ gameOptions, gameType })`) so the
    skip rules can be unit-tested.
  - Build the edit and cancel detail screen and the "History" (past games) screen.
  - Wire the success return from §4d.
  - Replace `app/owner/schedule/page.tsx` with the §4h redirect.
- **Tests:** step-sequence unit tests: one game option skips the Game step, and a non-Live-Trivia
  game skips Repeat. Add an equivalence test showing the submitted body (start/end ISO,
  `windowMinutes`, recurrence fields) matches what the old form produced for the same inputs.
  `tests/api.owner.schedule.test.ts` must stay green unchanged.
- **Done when:** create, edit and cancel all work from the dashboard. Phone Back steps back or
  closes. `/owner/schedule` lands on the open sheet.

### Phase 5: Offer Rewards sheet
- **Model / effort:** Sonnet 5.5, **high**. The wizard is shared with admin and is 1,200 lines.
- **Build:**
  - Host `CreateRewardWizard` in `OwnerSheet`.
  - Add the `animateSteps` and `onRequestSchedule` props (§4f). Both are optional, and when they
    are left out the admin behaviour is exactly as before.
  - Build the reward detail screen with **End reward** (from `RemoveRewardDialog`) and "History"
    (ended rewards).
  - Wire the Reward→Schedule→Reward handoff.
  - Replace `app/owner/competitions/page.tsx` with the §4h redirect.
- **Tests:** `tests/api.owner.competitions.test.ts` must stay green. Add a render test showing the
  admin variant with no new props renders the same step markup as before (no transition wrapper).
- **Done when:** a partner can offer a reward, end one, and jump to scheduling when the reward
  needs a game, all without leaving the dashboard.

### Phase 6: Polish, docs, verification
- **Model / effort:** Sonnet 5.5, **medium** for polish and docs. **Opus 5.5, high** for the final
  `/code-review high` pass and for judging the fixes.
- **Build:**
  - Discard-confirm (decision 5), first-visit ☰ pulse (decision 2), toast component (reuse any
    existing owner toast; don't add a library), highlight ring, and empty-state copy review.
  - Accessibility pass: labels, focus order, 44px targets, contrast on dashed cards.
  - Update `lib/partnerManual.ts` copy: "Click the 'Venue Display' button" becomes "Tap the logo in
    the top-left to open the menu, then Venue Display", and "Click 'Offer Rewards'" becomes "Tap
    Offer Rewards on your dashboard".
  - Update `docs/partner-dashboard-design.md` (new §§ for the bar, drawer, section card and flow
    sheet), `SYSTEM_CONTEXT.md` §0 and the `CLAUDE.md` Navigation section (the new sheet and drawer
    primitives, and where Sign Out now lives).
  - Write `docs/partner-dashboard-app-redesign-device-checklist.md` for Andrew: iPhone Safari,
    Android Chrome, the Back gesture, the keyboard covering inputs inside the sheet, landscape,
    reduced motion.
- **Gates:** `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not in parallel
  with tsc), and `npm run test:pwa-contract` (only because `globals.css` changed).
- **Done when:** gates are green, the review findings are fixed, and the device checklist has been
  handed to Andrew. Only he can close the checklist, because headless browsers can't judge this
  surface.

---

## 6. Cost estimate

- **Before:** the dashboard makes 1 request (`/api/owner/venues`). Opening Schedule or Rewards
  loads a new page, which makes 2 more requests (venues again, then the list).
- **After:** the dashboard makes 3 requests (venues, then schedules and rewards in parallel). The
  sheets reuse that data and refetch one list only after a save.
- **Net:** about the same, or lower, for a partner who opens either section. For a partner who
  only opens Billing, there are 2 extra small reads per dashboard visit. Partner traffic is small
  (tens of venues), so the monthly difference is too small to measure. There are no new endpoints,
  cron jobs, tables or third-party calls. Measuring a baseline isn't worth it at this scale.

## 7. Out of scope
- Server APIs, validation rules, Stripe, `proxy.ts`, migrations, `vercel.json`.
- Turning Billing, Display, Game Settings or Account into sheets.
- The orphan `/owner/category-blitz` page.
- The admin Rewards UI beyond the two opt-in wizard props.
- Native apps, and push notifications for the trailing bar slot.

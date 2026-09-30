# Partner Dashboard App-Style Redesign — Phase 7: Code Review Outcome (handoff)

**Plan:** `docs/partner-dashboard-app-redesign-plan.md`
**Phase finished:** the final `/code-review high` over `2694f99..a97b56f+Phase 6` (= `2694f99..8e17a03`), judging and
fixes — 2026-09-30, Opus 5.5. **Previous handoff:** `..._PHASE_6_HANDOFF.md` (still accurate except where this note says).

---

## For Andrew (plain English)

**What changed.** The review found 10 real problems. All 10 are fixed, and each fix has a test that fails without it.
None needed a database, Stripe, env or Vercel change. Your two answers are in:

- **Yes, the Back gesture now asks "Discard?"** too — but only when Back would *leave* the panel with answers typed in.
  Back that steps back one question still just steps back (your answers are kept). If you Discard after a Back, it
  finishes that Back (one step), so it doesn't skip two screens.
- **Yes, "Every day" stays** in the Repeat step. No change needed.

The fixes, in everyday terms:
1. Pressing Esc to close the time-zone list no longer also closes (or asks to close) the whole panel.
2. Ending one reward, going back fast and ending another could show the *first* reward's prize counts on the second
   one's screen. Now late answers for the wrong reward are ignored.
3. After "Change" on the review screen, using the phone's Back could leave the step stuck saying "Done" and jump to the
   wrong screen later. Fixed.
4. Menu → Partner Manual: keyboard / screen-reader focus got pulled off the manual onto the logo behind it. Fixed.
5. Going from a reward straight to "Schedule Live Trivia": the reward panel flashed to the rewards list while sliding
   away. It now keeps its own screen while it slides.
6. The one-time ☰ pulse could be "used up" on the Billing page (where there's no logo) — so a brand-new partner coming
   back from Stripe never saw it. Now only the dashboard uses it.
7. A rare path (browser Forward after picking an unscheduled reward) could show the wrong reward's terms. Fixed.
8. Tapping Billing/Display/etc. in the menu could open the new page scrolled down to where the dashboard was. Now the
   menu slides away first, then the page opens at the top.
9. After saving a game, the browser's Forward button could reopen a review screen stuck on "Scheduling…". Now the panel
   starts fresh after it closes.
10. Two identical confirmations in a row ("Live Trivia updated" twice) made the second one vanish after ~1 second. Fixed.

**Is it live?** Committed locally, **not pushed, not deployed**.

**What's left / what I need from you.** Push + deploy when you're ready, then run the phone checklist
`docs/partner-dashboard-app-redesign-device-checklist.md` — section **E** is rewritten for the new Back behaviour (and
asks you to note any flicker when Back asks). `data/sports-bingo/{mlb,nfl}-star-index.json` are still modified in git,
are **not** part of this work, and were not staged.

---

## For the next agent

### 1. Next goal and scope
The plan is **build-complete and reviewed**. What remains is Andrew's: deploy, then the device checklist. The next agent
only acts on checklist feedback. **Out of scope** (unchanged): server APIs, `proxy.ts`, migrations, `vercel.json`,
`lib/supabaseAdmin.ts`, forking `CreateRewardWizard`, turning Billing/Display/Game Settings/Account into sheets, the orphan
`/owner/category-blitz`. Never refresh `tests/__snapshots__/components.create-reward-wizard.test.ts.snap` to pass a test.

### 2. Starting state
- Branch `main`. HEAD = the Phase 7 review commit on top of `8e17a03` (`git log -1`). Nothing pushed or deployed.
- `data/sports-bingo/{mlb,nfl}-star-index.json` modified in the working tree — **not ours; stage by path, never `git add -A`.**
- No data/DB/env changes; no backups or undo logs exist or are needed.

### 3. Decisions (don't re-ask)
- **Andrew, 2026-09-30:** (a) the phone's Back gesture **also** triggers "Discard?" (overrules Phase 6 §3); (b) keep
  "Every day" in Repeat. The third §7 item (deploy + checklist) is his action, not a question.
- **Back asks only when it would LEAVE the sheet** while dirty. Back within the sheet keeps the answers (form state lives
  in the flow), so asking would be noise. Discard after a Back calls `history.back()` (finish the partner's Back), not
  `closeSheet()` — after the Rewards→Schedule swap that lands on the Rewards sheet, as Back always did.
- **Detection is at render time, not a `popstate` listener.** Verified in Chromium: Next's router `popstate` listener is
  registered first and re-renders synchronously; that render (sheet closed → not dirty) removes a component's listener
  mid-dispatch before it runs — **`{ capture: true }` does not help** (Chromium still ran Next's bubble listener first on
  `window`). So `useDiscardGuard` tracks `open`/`dirtyWhileOpen` in state and treats "open → closed while dirty and the
  flow didn't close itself" as the partner's Back; an effect then `restoreSheetEntry()`s the last sheet URL.
- **The flow's own departures must go through `closeWithoutAsking(leave?)`** (save, cancel game, end reward, reward
  created, the wizard's Cancel, and the Rewards→Schedule swap via `closeWithoutAsking(onRequestSchedule)`). A contract
  test pins that each flow calls `nav.closeSheet` exactly twice (the guard's `onDiscard` and `onRequestClose`).
- **Focus return rule (shared overlay):** after the exit animation, focus goes back only if it is still inside this panel
  or was lost (`<body>`/disconnected). If the close handed focus to another overlay, leave it there.
- **Menu links:** plain left-click is intercepted (`preventDefault`), the drawer closes, `router.push(href)` runs in the
  drawer's `onExited`. Modifier/middle clicks keep the native `<Link>` behaviour. Reopening the drawer mid-exit abandons
  the pending link.
- **Finished-flow reset:** `ScheduleGameFlow` and `RewardsFlow` set `finished` on success and reset in `OwnerSheet`
  `onExited` (Schedule: fresh form/baseline, no edit/selection, `busy` false; Rewards: idle End state, no selection). The
  wizard needs no reset — it lives inside the sheet, which unmounts it after the exit.

### 4. Findings → fixes (files, key functions)
| # | Finding (from `/code-review high`) | Fix |
|---|---|---|
| 1 | Escape used by an inner Dropdown also closed the sheet | `components/owner/sheet/useModalOverlay.ts` keydown: `if (event.defaultPrevented) return` for Escape |
| 2 | Late prize counts for reward A land on reward B's End screen | `components/owner/rewards/RewardsFlow.tsx`: `endingRewardId` ref; `startEnding` ignores replies for any other id |
| 3 | `changingStep` survives a phone Back, later "Done" pops to the wrong step | `ScheduleGameFlow.tsx`: `changing = {step, reached}`; adjust-during-render clears it once the step was shown and left |
| 4 | Drawer exit refocuses the logo behind the just-opened Partner Manual | `useModalOverlay.ts` exit timer: `focusIsOurs` check (see §3) |
| 5 | Shared `displaySheet/displayStep` → a closing Rewards sheet jumps to its list during the swap | `lib/useOwnerSheet.ts`: replaced with per-sheet `displayStepFor(id)` (`lastSteps` map); both flows use it |
| 6 | ☰ hint spent on sub-pages with `leading` | `components/owner/OwnerAppBar.tsx`: `useSyncExternalStore(…, leading ? noHint : menuHintForThisVisit, noHint)` |
| 7 | Cached unscheduled pick keeps the previous context → Forward renders mixed terms | `components/rewards/CreateRewardWizard.tsx` `handlePickDefinition`: `setContext(null)` in the cached-unscheduled branch (admin snapshots unchanged) |
| 8 | Menu `Link` navigates with the drawer's scroll lock still held → scroll offset restored on the new page | `OwnerAppBar.tsx`: `pendingHref` + drawer `onExited` → `router.push` (see §3) |
| 9 | `busy` never reset after success → Forward reopens a stuck "Scheduling…" Review | `ScheduleGameFlow.tsx` / `RewardsFlow.tsx`: `finished` + `resetIfFinished` on `onExited` |
| 10 | Toast keyed by message → identical second toast keeps the first timer | `app/owner/dashboard/page.tsx`: `ToastState.id` (incremented per change), `key={toast.id}` |
| — | Andrew: Back asks too | `components/owner/sheet/DiscardGuard.tsx` (`useDiscardGuard({open, dirty, …})` now also returns `closeWithoutAsking`); `lib/ownerSheetParams.ts` new `restoreSheetEntry(history, href)` |

Docs: `docs/partner-dashboard-design.md` §3d, `CLAUDE.md` (Partner Dashboard app shell bullet), device checklist §E + menu
item, plan status line. `components/owner/sheet/OwnerSheet.tsx` comment points at `displayStepFor`.

### 5. Traps
- **Do not "simplify" the Back detection back into a `popstate` listener** — see §3; it silently never fires in a real
  Next app (jsdom tests would still pass, which is how the first attempt looked fine).
- `useDiscardGuard`'s `selfClosing` is **state**, set in the click handler before `closeSheet()`; `history.go()` is async,
  so it commits first. If a new flow path closes or leaves the sheet, route it through `closeWithoutAsking`.
- Known cosmetic: when Back asks, the sheet may start its slide-down for a frame before the restored URL reopens it
  (reopen mid-exit cancels the unmount). Headless Chromium showed the sheet visible afterwards; the feel is on the device
  checklist §E.
- Test harness controls in `tests/components.owner-schedule-flow.test.ts` are hidden buttons (`test:phone-back`,
  `test:reopen`) — lint (`react-hooks/immutability`) forbids mutating a props object from the harness.
- `react/no-children-prop`: `tests/components.owner-app-bar.test.ts` passes children positionally via a cast helper.
- Global rules from earlier handoffs still apply (global button CSS beats Tailwind — use `!`; don't run `tsc` and `build`
  concurrently; macOS `sed -i ''`).

### 6. Build / test (all green, run sequentially)
```bash
npx tsc --noEmit    # clean
npm run lint        # clean (usual Babel note for lib/sportsBingo.ts)
npm run test        # 2,841 pass / 13 skip / 0 fail (Phase 6 was 2,825; +16)
npm run build       # passes, 179 pages
```
`test:pwa-contract` not needed (`app/globals.css` untouched). New/extended tests: `components.owner-app-bar` (new, 3),
`components.owner-schedule-flow` (+7: Change/Back, finished reset, 5 Back-gesture cases), `components.owner-rewards-flow`
(+1 stale counts), `components.owner-sheet` (+2 Escape/focus), `lib.owner-sheet-params` (+1 `restoreSheetEntry`),
`components.create-reward-wizard` (+1 context), `owner-dashboard-contract` (+1, and toast-key assertions). Mutation-checked
(fix removed → test fails) for #2, #4, #7.

**Browser check (no DB writes):** `npm run build && npx next start -p 3111`, Playwright chromium 390×844 with
`page.route("**/api/**")` mocks (venues, schedule, competitions). Verified: open Schedule → enter a date → `page.goBack()`
→ URL restored to `?sheet=schedule`, "Discard this game?" visible, sheet visible; Keep editing keeps the value; history
length unchanged (3→3); second Back → Discard → clean `/owner/dashboard`, no dialogs; an empty sheet's Back closes without
asking; Menu → Billing lands on `/owner/billing` with `scrollY 0` and no `tp-popup-open`; zero page errors. Server killed
after (`pkill -f "next start -p 3111"`). **Not verified:** real iOS/Android Back gesture, the Rewards→Schedule Back path in
a browser (jsdom only), screen-reader focus.

### 7. Open questions for Andrew
None blocking. The device checklist is his.

### 8. Recommended first steps (if feedback arrives)
Read this note and the checklist feedback; reproduce with the Playwright recipe in §6; fix in place with a test; rerun
the §6 gates sequentially; commit by path.

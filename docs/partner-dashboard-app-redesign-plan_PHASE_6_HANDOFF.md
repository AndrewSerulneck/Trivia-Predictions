# Partner Dashboard App-Style Redesign — Phase 6 Handoff (to the code review)

**Plan:** `docs/partner-dashboard-app-redesign-plan.md`
**Phase finished:** Phase 6 *build* — polish, docs, verification — 2026-09-30, Sonnet 5.5 (medium).
**Next:** the **final `/code-review high` pass, then judging and applying its fixes, on Opus 5.5 (high)**. The plan
reserves this for Opus. **The review has NOT been started.** Nothing in this phase ran a review.
**Earlier handoffs:** `..._PHASE_1_HANDOFF.md` … `..._PHASE_5_HANDOFF.md` — all still accurate.

---

## For Andrew (plain English)

**What changed.** The finishing touches are in:
- **"Discard this game?" / "Discard this reward?"** — if you've typed something into a scheduling or reward panel and tap
  Close (or press Esc, or tap outside), it asks first: *Keep editing* or *Discard*. Nothing is saved as a draft.
  The phone's **Back gesture does not ask** — it just steps back or closes (deliberate; see §3).
- **First-visit hint** — the little ☰ badge on the logo pulses three times the very first time a browser loads the
  dashboard, then never again. (Hidden if the phone has "reduce motion" on.)
- **A real confirmation toast** — "Live Trivia scheduled: Oct 9, 8:00 PM" slides in at the bottom, clears itself after
  6 seconds (10 if it has the "Now offer a reward for it →" link), and the new row glows with a blue ring for 2 seconds.
  The amber note about rewards tied to a cancelled/changed game still stays until you dismiss it.
- **Two fixes found while checking:** the dashed "tap to add" outlines were rendering as faint solid lines (a global
  button style was overriding them) — they are now truly dashed and easier to see; and the Partner Manual text no longer
  says "click" (it says to tap the logo, then Venue Display; and to tap Offer Rewards).
- **Docs updated** and a **phone checklist for you**: `docs/partner-dashboard-app-redesign-device-checklist.md`.

**Is it live?** Committed locally, **not pushed, not deployed.** No database, Stripe, env or Vercel changes.

**What's left.** (1) The code review and its fixes (Opus 5.5). (2) You: deploy, then run the phone checklist — only you
can close it. (3) You decide whether the Back gesture should also ask "Discard?" (see §7).

**What I need from you.** Nothing blocks the review. `data/sports-bingo/{mlb,nfl}-star-index.json` are still modified in
git and are **not** part of this work; I did not stage or commit them.

---

## For the next agent (the code reviewer, Opus 5.5 high)

### 1. Your job and scope
Run **`/code-review high`** over the whole redesign diff, then judge each finding yourself (don't apply blindly), fix what
is real, re-run the gates, and record the outcome. Review range: **`2694f99..HEAD`** (Phases 1–3 `c182c06`, Phase 4
`a1e0974`, Phase 5 `a97b56f`, Phase 6 = the commit on top — `git log -1`). Phase 6 alone is `git diff a97b56f..HEAD`.
**Out of scope (never touch):** server APIs, `proxy.ts`, migrations, `vercel.json`, `lib/supabaseAdmin.ts`, forking
`CreateRewardWizard`, making Billing/Display/Game Settings/Account into sheets, the orphan `/owner/category-blitz`.
Do not refresh `tests/__snapshots__/components.create-reward-wizard.test.ts.snap` to make something pass (Phase 5 §5).

### 2. Starting state
- Branch `main`; HEAD = the Phase 6 commit. Nothing pushed or deployed.
- `git status` still shows `data/sports-bingo/{mlb,nfl}-star-index.json` modified — **not from this plan; stage by path,
  never `git add -A`.**
- No data/DB/env changes in any phase; no backups or undo logs exist or are needed.

### 3. Decisions made in Phase 6 (don't re-ask; challenge only if they are wrong)
- **Dirty rules** (what triggers "Discard?"):
  - Schedule (`ScheduleGameFlow`): on a form screen (`game|when|repeat|review`), not `busy`, and
    `JSON.stringify(form) !== JSON.stringify(baseline)`. `baseline` is state, reset in `startNew()` / `startEdit()`, so an
    edit only asks after a real change. Lists/detail/history never ask. Wording: "Discard this game?" (new) /
    "Discard your changes?" (edit).
  - Rewards (`RewardsFlow`): wizard-agnostic — `screen === "wizard" && step !== "definition"` (the partner picked a reward
    and is answering). No `onDirtyChange` prop was added to the shared wizard (kept the four-prop limit).
- **Phone Back gesture does NOT trigger the discard prompt** (Phase 1 §5 asked Phase 6 to decide). Reason: the URL has
  moved before React sees it; intercepting `popstate` would fight Next's router and iOS has no equivalent prompt.
  Documented in `DiscardGuard.tsx` and the checklist (§E). Andrew can overrule.
- **Discard → `nav.closeSheet()` directly** (bypasses the guard, which only wraps Escape/Close/scrim).
- **Toast is one component, no library, no portal.** `DashboardToast` keeps its own timer (`TOAST_MS` 6000,
  `TOAST_WITH_ACTION_MS` 10000). The **advisory** (`rewardNotice`) stays a persistent `DashboardNotice`; the success tone
  was deleted from it. Dashboard state was split into `toast` + `advisory` (was one `notice`). Tapping the toast action
  clears the toast.
- **Highlight ring needs no API change.** New rows are found by diffing the refetched list against the ids known before the
  save (`lib/ownerDashboardHighlight.ts`); an edit passes its id via the new optional `ScheduleChange.scheduleId`. Cancels
  and ends pass `removed: true` (new optional field on `ScheduleChange` / `RewardsChange`) so nothing is ringed.
  A new game that sorts beyond the dashboard's 3 visible rows is simply not ringed (toast still confirms).
- **☰ pulse:** `lib/ownerMenuHint.ts`. `consumeMenuHint(storage)` is true once per browser (reads then writes
  `ht_owner_menu_hint_seen`); `menuHintForThisVisit()` caches the decision per page load; `OwnerAppBar` reads it with
  `useSyncExternalStore` (server snapshot `false`, so no hydration mismatch). If the flag can't be written the pulse is
  suppressed (never pulses forever). Uses Tailwind `motion-safe:animate-[ping_…_3]` + `motion-reduce:hidden` —
  **`app/globals.css` was NOT touched this phase.**
- **Dashed cards:** `border-ht-soft` (white@12% ≈ 1.3:1) replaced by `slate-500` (≈3.8:1 on `#0f172a`).

### 4. Files created or changed
| File | What |
|---|---|
| `components/owner/sheet/DiscardGuard.tsx` (new) | `useDiscardGuard({dirty,title,message,onDiscard}) → {closeGuard, dialog}`; `DiscardDialog` is an `alertdialog` on `useModalOverlay` (z-[5100], Escape = Keep editing, scroll-lock name `owner-discard`). |
| `components/owner/schedule/ScheduleGameFlow.tsx` | `baseline` state; `useDiscardGuard`; `closeGuard` passed to `OwnerSheet`; returns a fragment (`OwnerSheet` + `dialog`); `ScheduleChange.scheduleId?` / `.removed?`. |
| `components/owner/rewards/RewardsFlow.tsx` | same guard (past-Definition rule); `RewardsChange.removed?`; `performRemove` sets `removed: true`. |
| `components/owner/dashboard/DashboardToast.tsx` (new) | The toast. `useHighlightRing.ts` (new): `highlightRingClass`, `useScrollWhenHighlighted` (respects reduced motion), `HIGHLIGHT_MS` 2000. |
| `lib/ownerDashboardHighlight.ts` (new) | Pure: `resolvePendingHighlight`, `knownItemIds`, `PendingHighlight`. |
| `app/owner/dashboard/page.tsx` | `toast`/`advisory`/`highlightId`/`pendingHighlight` state; adjust-during-render resolution (lint forbids setState-in-effect); 2s timer effect clears the ring; `<DashboardToast>`; `highlightId` passed to both sections. |
| `components/owner/dashboard/{LiveGamesSection,RewardsSection}.tsx`, `schedule/ScheduleGameRow.tsx`, `rewards/RewardRow.tsx` | `highlightId` / `highlighted` props → ring + scroll. |
| `components/owner/dashboard/DashboardSectionCard.tsx` | dashed cards: `!rounded-[14px] !border-2 !border-dashed !border-slate-500` (**the `!` is load-bearing**, see §5), `min-h-11` on the empty card. |
| `components/owner/dashboard/DashboardNotice.tsx` | advisory only (success tone removed). |
| `components/owner/OwnerAppBar.tsx`, `lib/ownerMenuHint.ts` (new) | the pulse. |
| `lib/partnerManual.ts` | two copy edits (menu/Venue Display; "Tap Offer Rewards on your dashboard"). |
| Docs | `docs/partner-dashboard-design.md` (§3a–3e + status; old Hub text marked superseded), `SYSTEM_CONTEXT.md` (Partner surface Navigation bullet, Rewards bullet), `CLAUDE.md` (Navigation: host-shell bullet fixed, new "Partner Dashboard app shell" bullet), `docs/partner-dashboard-app-redesign-device-checklist.md` (new), the plan's status line. |
| Tests | new: `lib.owner-menu-hint` (4), `lib.owner-dashboard-highlight` (6), `components.owner-dashboard-toast` (3). Extended: `components.owner-schedule-flow` (+6 discard cases; two payload assertions gained `scheduleId` / `removed`), `components.owner-rewards-flow` (+3; two remove assertions gained `removed: true`), `owner-dashboard-contract` (+5 Phase 6 tripwires). |

### 5. Facts and traps
- **Global button CSS beats Tailwind.** `app/globals.css` ~1012 styles every bare `<button>` with un-layered
  `border: 1px solid …; border-radius: 12px`. Plain `border-dashed` / `rounded-[14px]` on a `<button>` silently loses — Phase 3's
  "dashed" cards never rendered dashed. Use `!border-…`/`!rounded-…` (Tailwind v3 important) or confirm with
  `getComputedStyle`. Phase 5 already noted the wizard's boxed "Cancel" (`secondaryButton`, owner variant) — **still boxed,
  not fixed** (shared with admin; harmless).
- **Reviewer attention suggestions** (my own uncertainty, not findings): (a) `DiscardDialog` inside a sheet — two
  `useModalOverlay` instances stack; Escape goes to the topmost (tested), focus returns to the opener (the sheet's Close
  button); (b) `ScheduleGameFlow` dirty check uses `JSON.stringify` of the form — fine for plain values, verify
  `ScheduleFormState` has no non-serialisable/ordering-unstable fields; (c) the render-phase `setPendingHighlight` /
  `setHighlightId` in `DashboardBody` (allowed pattern, but check it cannot loop: it clears `pendingHighlight` in the same
  pass); (d) `useSyncExternalStore(…, menuHintForThisVisit, () => false)` — `getSnapshot` has a write side effect on first
  call (by design; cached after), confirm React's double snapshot read in dev can't double-consume it (the module cache
  makes the second read identical); (e) toast timer restarts if `onDismiss` identity changes (it's a stable `useCallback`);
  (f) toast is `position: fixed` z-[4000], below sheets (5000) and above the app bar (40).
- Toast wording uses the existing `formatScheduleTime` ("Oct 9, 8:00 PM"), not the plan's example "Fri, Oct 3 at 8:00 PM".
- Everything in Phase 1–5 handoffs §5 still applies (history driver, `SlideSteps` live outgoing pane, jsdom traps, no `.tsx` tests).
- Tooling: macOS `sed -i ''`; don't run `tsc` and `build` concurrently (`.next/types`).

### 6. Build, run, test (all green at handoff)
```bash
npx tsc --noEmit            # clean
npm run lint                # clean (only the usual Babel note for lib/sportsBingo.ts)
npm run test                # 2,825 pass / 13 skip / 0 fail (Phase 5 was 2,798; +27)
npm run build               # passes (run alone, after tsc)
npm run test:pwa-contract   # 20/20 (globals.css untouched this phase)
```
`tests/api.owner.competitions.test.ts` and `tests/api.owner.schedule.test.ts` pass unchanged.
Browser check (no DB writes): `npm run build && npx next start -p 3111`, Playwright (`node_modules/playwright`, chromium) at
390×844 with `page.route("**/api/**", …)` mocking `/api/owner/venues`, `/schedule` (GET/POST), `/competitions`; `pkill -f
"next start -p 3111"` after. **Verified there:** ☰ pulse element present on first load, absent on reload; Close with a date
entered → "Discard this game?" alertdialog, Keep editing returns to the same step; create → toast text "Live Trivia
scheduled: Oct 9, 8:00 PM", the new row carries `ring-ht-cyan-300`, ring gone ≈2s later, toast gone by ≈6s; dashed
card computed style `dashed 2px rgb(100,116,139) 14px`; zero page errors; screenshot looked right.
**Not verified (device only — on Andrew's checklist):** iOS/Android keyboard over inputs, safe areas, real Back gesture,
slide/pulse feel, landscape, reduced-motion OS setting, screen-reader announcements, two sheets animating (Rewards→Schedule).
Also not run in a browser: the Discard prompt for the **Rewards** wizard (jsdom-tested only), NFL Pick 'Em definition in the
sheet.

### 7. Open questions for Andrew
- Should the phone's Back gesture also ask "Discard?" (currently no)? Only he can say; it needs a `popstate` interceptor.
- Carried: keep "Every day" in the Schedule Repeat step (assumed yes).
- Deploy + close the device checklist.

### 8. Recommended first steps for the review (Opus 5.5 high)
1. `git log --oneline -6` and `git diff --stat 2694f99..HEAD`; read the plan §4 (the spec) and this file §3–5.
2. Run `/code-review high` on `2694f99..HEAD` (the biggest risks are the shared pieces: `useModalOverlay`, `SlideSteps`,
   `lib/ownerSheetParams.ts`/`useOwnerSheet`, `CreateRewardWizard`'s opt-in props, `OwnerShell`/`OwnerAppBar`).
3. Judge each finding against the code and these handoffs; fix real ones in place with tests; do not widen scope.
4. Re-run the §6 gates (tsc → lint → test → build, sequentially; `test:pwa-contract` only if `globals.css` changed).
5. Record the outcome: write `..._PHASE_7_REVIEW_NOTE.md` (or append a "Code review outcome" section here): findings, which
   were fixed/skipped and why, final gate numbers. Update the plan's status line; commit by path; leave push/deploy and the
   device checklist to Andrew.

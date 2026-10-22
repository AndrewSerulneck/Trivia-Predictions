# Light Theme Plan — Phase 8 Handoff (review, fixes, phone checklist, docs)

**Date:** 2026-10-22 · **Plan:** `docs/light-theme-plan.md` · **Previous:** `docs/light-theme-plan_PHASE_7_HANDOFF.md`

## For Andrew (plain English)

- **What happened:**
  - Phases 5–7 are now **committed** (`939e7fb`).
  - I reviewed the whole light-theme change and fixed five things:
    1. Moving between two light screens no longer flashes a black loading screen.
    2. The app's status bar can no longer miss a change when you move quickly between screens.
    3. The clock and battery icons no longer blink invisible for a moment when the strip changes colour.
    4. Choosing Light in one browser tab now updates your other open tabs.
    5. One code-style tidy-up.
  - Nothing changed in Dark: the dark screens are still pixel-identical.
- **Is it live?** No. The switch (`NEXT_PUBLIC_LIGHT_THEME_ENABLED`) is still off everywhere. **Phase 8 is not
  committed**; say the word and I'll commit it, without your own files.
- **What needs you:** the phone checklist, `docs/light-theme-device-checklist.md`.
  - Website checks can run on a Vercel **Preview** with the variable on.
  - App checks need it on in **Production**, because the app loads the live site. That is the launch itself. Everyone
    still starts on Dark, so no player's screen changes until they choose Light.
  - Turning it off again = remove the variable + Redeploy.
- **Your call, any time:** should new players start on "Match my phone" instead of Dark?

## For the next agent

### 1. Goal and scope

The plan is complete. The remaining work is:

- **Andrew's phone pass.** Fix whatever it finds as numbered sub-phases 8.6+ with a note in the plan's Phase 8
  as-built section.
- **The rollout:** the plan's "Rollout runbook", run by Andrew.

**Out of scope unless Andrew asks:**
- more light screens;
- changing `DEFAULT_THEME_PREFERENCE`;
- turning the flag on yourself (Vercel env vars are Andrew's call).

### 2. Starting state

- Branch `main`.
  - `155bbb7` = Phases 1–4.
  - `939e7fb` = Phases 5–7. Committed by me on Andrew's request; **not pushed**.
- **Phase 8 is uncommitted.** Files:
  - Code:
    - `components/ui/HightopLoader.tsx`
    - `components/ui/RouteLoadingScreen.tsx` (comment only)
    - `lib/nativeStatusBar.ts`
    - `lib/theme.ts`
    - `components/ui/ThemeRouteSync.tsx`
    - `components/navigation/AppearancePicker.tsx`
  - Tokens:
    - `app/globals.css`
    - `design-system/hightop-challenge-design-system/project/colors_and_type.css`
    - `tailwind.config.ts`
  - Tests and tools:
    - `tests/light-theme-appearance.test.ts` (+6 tests)
    - `scripts/theme-pairs/make-pairs.cjs` (+1 pair)
  - Docs:
    - `AGENTS.md`
    - `SYSTEM_CONTEXT.md`
    - `CLAUDE.md`: **only the new "Light theme" section is mine.** The rest of its diff is Andrew's.
    - `docs/light-theme-plan.md`
    - `docs/light-theme-device-checklist.md` (new)
    - this file (new)
- **Andrew's uncommitted work — never stage, revert or `git checkout --`:**
  - `CLAUDE.md`: his edits plus my section. Stage it only if he says so, or use `git add -p` and take just the
    "Light theme" hunk.
  - `docs/pos-rewards-integration-plan.md`
  - `docs/rewards-trust-and-pos-roadmap.md`
  - `lib/pos/providers.ts`
  - the 7 deleted `design-system/project/public/info/*.png`
  - the untracked `design-system/project/public/info/New Folder With Items/`
- No database, Vercel env var, `.env.local`, `native/` or deploy change. The flag is not set anywhere.

### 3. Decisions made in this phase

The review was `/code-review` at high on `155bbb7^..939e7fb`. It returned 7 findings.

**Fixed:**

| Sub-phase | What was wrong | Fix |
|---|---|---|
| **8.1** | `/pickem` and `/fantasy` have no `loading.tsx`, so moving between light screens showed the root full-screen loader. It was a fixed `#030712` — a black flash. | New tokens `--ht-route-loader-bg` / `--ht-route-loader-fg`: dark `#030712` / `#ffffff` (unchanged), light `#f3f5fa` / `#0f172a`. Partner pages (`app/owner/loading.tsx`, owner login) use the same variant but are never light, so they're unchanged. |
| **8.2** | `running` was cleared in a `.finally` microtask, so a call landing in that gap was dropped. | `running = false` now sits inside `run()` straight after the last `painted !== wanted` check. |
| **8.3** | Colour, then icons, then (Android) a `getInfo` round trip: white icons on a white strip for a moment. | `paint(theme)` sends colour and icons in one `Promise.all`, and `setIconStyle` sends StatusBar + SystemBars together. Android does the colour → `getInfo` probe only on the first light paint per page load. The answer is kept in `androidStripTakesColor`; `false` means a light screen goes straight to the navy paint. |
| **8.4** | A choice made in another tab didn't reach this one. | `subscribeThemePreference` also listens to `storage` for `htc_theme` (or `key === null`, a clear). `ThemeRouteSync` subscribes and re-applies; the Appearance row's `useSyncExternalStore` updates. |
| **8.5** | `AppearancePicker` was a function declaration. | Arrow function, per CLAUDE.md style. |

**Not changed:**
- Unguarded `MediaQueryList.addEventListener`. Next 16 supports Safari 16.4+ only, and `lib/pwa.ts` +
  `SportsBingoHome` already use it.
- Coincidental token sharing, e.g. `ht-countdown` used for NFL/Fantasy notices and the hub "Points" label. There's no
  bug today, and renaming would risk dark pixels. Split a token when one of its uses needs a different colour.

**Device checklist columns:**
- iPhone app;
- Android app on 15+ and on ≤14 (the status-bar behaviour differs);
- iPhone Safari and Android Chrome;
- plus a separate installed-iPhone-PWA section and a two-tab check for 8.4.

### 4. How the pieces fit (changes only; the rest is in the Phase 7 handoff §4)

- `lib/nativeStatusBar.ts`:
  - `setIconStyle(style)` sends both plugins at once.
  - `paint(theme)` sends colour + icons at once.
  - `paintLight()` is: iOS / Android-known-good → `paint("light")`; Android-known-bad → `paint("dark")`; Android
    unknown → probe.
  - `syncNativeStatusBar` loop as before.
  - `resetNativeStatusBarForTests` also forgets `androidStripTakesColor`.
- `lib/theme.ts`: `subscribeThemePreference(listener)` adds and removes a per-listener `storage` handler.
- `components/ui/ThemeRouteSync.tsx`: a second effect, `subscribeThemePreference(() =>
  syncNativeStatusBar(applyThemeForPath(location.pathname)))`.
- A tap in the Appearance row now applies twice: once directly in `choose`, once via that listener. Both calls are
  idempotent, and the status-bar module skips an unchanged paint.

### 5. Facts and traps

- The race test in `tests/light-theme-appearance.test.ts` (8.2) sweeps 0–7 microtask delays. Together with the 8.3
  tests it **fails on the pre-fix `lib/nativeStatusBar.ts`** (checked by swapping the old file in from `HEAD`, then
  restoring it).
- The new tokens must stay in BOTH CSS files with the same values. `tests/light-theme-contract.test.ts` compares the
  light blocks.
- `/verify` before the 5–7 commit was done the plan's way: a scratchpad clone (no `.env*`), flag-on build, `next
  start -p 3102`, the Phase 7 live script and a full dark capture. My server was stopped, and :3102 is empty.
- All Phase 5–7 traps still apply. See the Phase 7 handoff §5, especially: the word "Capacitor" may only appear in
  `lib/nativeApp.ts`.

### 6. How to build, run and test; what was verified

**Main-tree gates after the 8.x fixes:**
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean.
- `npm run test`: **430 files / 5,273 pass, 13 skipped**.
- `npm run test:pwa-contract`: 20/20.

**Dark equivalence:**
- Class-pair check (recipe: Phase 5 handoff §6): 189 pairs, 188 identical. The 1 is the documented Phase 4 claim pill.
  The new pair `bg-[#030712] text-white` → `bg-ht-route-loader-bg text-ht-route-loader-fg` is identical.

**Before the 5–7 commit** (flag-on clone build of exactly the committed tree, :3102):
- Live Appearance script: dark start → Light → Match my phone → reload → `/trivia` dark. All as expected.
- Dark capture against the three baselines:
  - `42f0906`: 28/30 identical. The 2 are `venue-menu`, i.e. the new row, which is expected with the flag on.
  - phase5-states: 20/20.
  - phase6-states: 26/26.

**Not verified in a browser:**
- The 8.1 light loader. It shows only for a moment during navigation, and headless can't catch it reliably. Covered
  by a unit test plus the token values; on the checklist as 3.4.
- Everything in the device checklist (real phones, status bar, PWA band, rotation, 289 px).

### 7. Open questions for Andrew

- When to run the phone pass and turn the flag on. Runbook: plan "Rollout runbook".
- Whether to commit Phase 8, and whether to push `939e7fb` + Phase 8.
- Plan §6 Q1, any time: should new players start on "Match my phone" instead of Dark? The default stays Dark.

### 8. Recommended first steps for whoever picks this up

1. Read Andrew's checklist results. For each failure: reproduce it in the scratchpad clone (Phase 5 handoff §6
   recipe), fix it as sub-phase 8.6+, and re-run the dark screenshot + pair checks.
2. A new colour on these screens: follow `AGENTS.md` "Adding a colour to a light-capable screen".
3. Model / effort: Opus 5.5, high, for anything touching `lib/nativeStatusBar.ts` or `lib/theme.ts`. Sonnet 5.5 is
   fine for a colour token fix.

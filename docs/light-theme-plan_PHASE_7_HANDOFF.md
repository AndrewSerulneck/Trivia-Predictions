# Light Theme Plan — Phase 7 Handoff (Appearance setting, theme-color, app status bar, rollout)

**Date:** 2026-10-22 · **Plan:** `docs/light-theme-plan.md` · **Previous:** `docs/light-theme-plan_PHASE_6_HANDOFF.md`

## For Andrew (plain English)

- **What changed:** players get a new **Appearance** row in their menu, just above "Delete my account": **Dark / Light
  / Match my phone**, plus one line saying which screens can be light ("Light works on Venue Home, Pick 'Em, NFL Pick 'Em
  and Fantasy. Other games stay dark."). Tapping a choice changes the screen straight away, under the open menu, and the
  phone remembers it.
- **The bar above the page follows too:**
  - **Browser:** the colour Chrome/Android uses for its top bar is navy on dark screens and white on light ones.
  - **The app:** the status bar (clock and battery strip) turns white with dark icons on a light screen and goes back
    to navy on every other screen. On **Android 15 and newer** the phone doesn't let the app recolour that strip, so it
    stays navy with white icons there. That's on purpose: dark icons on a navy strip would be unreadable. Older app
    versions without this ability just keep the navy strip. **No new App Store / Play Store release is needed.**
  - **iPhone home-screen app (installed PWA):** iPhone always draws the clock in white there, so on a light screen a
    thin navy band stays behind the clock so it can still be read.
- **Did anything change in Dark?** No. With the switch off, the menu and the screens are pixel-identical to before. With
  the switch on, the only visible change in Dark is the new menu row.
- **Is it live?** No. The switch (`NEXT_PUBLIC_LIGHT_THEME_ENABLED`) is still off everywhere. **Phases 5, 6 and 7 are
  not committed**; say the word and I'll commit them without your own files.
- **How to turn it on (when you're ready):** Vercel → Production → add `NEXT_PUBLIC_LIGHT_THEME_ENABLED` = `true` →
  **Redeploy**. To undo it, remove the variable and redeploy. The full steps are in the plan's "Rollout runbook". The
  plan says to do Phase 8 first (code review + your phone pass).
- **To try it on your dev server now:** add `NEXT_PUBLIC_LIGHT_THEME_ENABLED=true` to `.env.local`, restart
  `npm run dev`, open a venue home, open the menu and tap **Light**.
- **What needs you:** nothing blocking. The phone checks (real iPhone and Android, app and website) are in Phase 8.

## For the next agent (Phase 8 — review, phone checklist, docs)

### 1. Goal and scope

Phase 8 (plan §4, **Opus 5.5, high**): run `/code-review` at high on the whole plan's diff (`155bbb7` + the uncommitted
Phases 5–7). Fix findings as numbered sub-phases with a note, not as silent in-place patches. Write
`docs/light-theme-device-checklist.md` for Andrew. Update `CLAUDE.md` (short "Light theme" section), `SYSTEM_CONTEXT.md`
§10 and `AGENTS.md` ("adding a colour = a token with a dark and a light value"). **Out of scope:** more screens, changing
`DEFAULT_THEME_PREFERENCE` (Andrew's call, plan §6 Q1), turning the flag on.

### 2. Starting state

- Branch `main`, last commit `155bbb7` (Phases 1–4). **Phases 5, 6 and 7 are uncommitted** (Andrew hasn't asked).
- Phase 7 files:
  - new: `lib/nativeStatusBar.ts`, `components/navigation/AppearancePicker.tsx`, `tests/light-theme-appearance.test.ts`,
    this file;
  - changed: `lib/theme.ts`, `lib/nativeApp.ts`, `components/ui/ThemeRouteSync.tsx`,
    `components/navigation/AccountMenuList.tsx`, `app/layout.tsx`, `app/globals.css` (one rule after the
    `html.tp-standalone` safe-area rules), `docs/light-theme-plan.md` (status line, Phase 7 as-built, rollout runbook,
    phase table).
- Phase 5/6 files: see their handoffs §2.
- Andrew's own uncommitted work: never stage, revert or `git checkout --` it. It is `CLAUDE.md`,
  `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, the 7 deleted
  `design-system/project/public/info/*.png`, and the untracked `design-system/project/public/info/New Folder With Items/`.
  `CLAUDE.md` has his edits, so Phase 8's CLAUDE.md section must be **added** with an Edit, never by rewriting the file.
  Stage files by name.
- No database, Vercel env var, `.env.local`, `native/` or deploy change. The flag is not set anywhere.
- Screenshots from this phase are in `~/Library/Caches/hightop-light-theme/phase7-shots/`: dark and light menus at 390
  and 350 px, light venue/Pick 'Em/Fantasy, and `appearance-live.cjs`, the live-browser check script.

### 3. Decisions made in this phase

- **The Appearance row is a segmented control, not a card.** It has a small muted "APPEARANCE" label, a pill track that
  looks like the venue hub's Games/Leaderboard/Prizes switch, and a one-line note. As a card, "Match my phone" wrapped
  onto two lines at 390 px. Columns are `auto auto 1fr`, so "Match my phone" stays on one line at 350 px. It is a
  `role="radiogroup"` with `role="radio"` buttons.
- **Placed after the four nav rows, before "Delete my account".** It appears in both player drawers (venue hub and the
  in-game `AccountMenu`), because both render `AccountMenuList`. On a dark-only game the choice saves but nothing visibly
  changes, and the note explains why.
- **The light `theme-color` is `#ffffff`, not `#F3F5FA`.** It matches the light app bar and hub header (white at 94%),
  which is what sits right under the browser bar. The plan allowed either.
- **App status bar:**
  - Uses the StatusBar plugin that has been in the shell since native Phase 2D (`@capacitor/status-bar`). Every style
    change also goes to Capacitor's core `SystemBars` plugin, because on Android `SystemBars` re-applies its own last
    style on rotation and would otherwise flip the icons back.
  - **Android safety rule:** after asking for a white strip, read it back with `StatusBar.getInfo`. Dark icons only if
    the colour really is `#FFFFFF`. Otherwise the strip and icons go back to navy and white. Reason: the shell targets
    SDK 36, and on Android 15+ `setBackgroundColor` is a silent no-op (plugin source:
    `StatusBar.java` `shouldSetStatusBarColor`).
  - iOS sets the colour + dark icons directly. With `overlaysWebView: false` the plugin owns a background view, and its
    colour always applies.
  - `overlaysWebView` and `native/capacitor.config.json` are untouched (`tests/native-safe-area-contract.test.ts` still
    pins them).
- **Installed iPhone PWA:** the band is `html.tp-standalone[data-theme="light"]::after`: fixed, height
  `env(safe-area-inset-top)`, navy, `pointer-events: none`, `z-index: 2147483000`.
  - Why: `apple-mobile-web-app-status-bar-style: black-translucent` is read once at launch and always draws a white
    clock.
  - Where the band has zero height (nothing shows): a browser tab, the Android PWA and the native app all have no top
    inset.
- **`app/layout.tsx` takes the dark colour from `THEME_COLOR.dark`** (still `#020617`, so the build output is
  unchanged).
- **`color-scheme` needs no code:** the CSS already sets it under `:root[data-theme="light"]` (Phase 2).

### 4. How the pieces fit

- `lib/theme.ts`:
  - `THEME_COLOR` (dark/light bar colours) and `APPEARANCE_COPY` (title, note, option labels; edit copy here).
  - `subscribeThemePreference`: listeners run by `writeThemePreference`, used by the row's `useSyncExternalStore`. A
    plain `useEffect` + `setState` fails lint (`react-hooks/set-state-in-effect`).
  - `applyThemeForPath` now also sets every `<meta name="theme-color">` and returns the resolved theme.
- `lib/nativeStatusBar.ts`: `syncNativeStatusBar(theme)` never throws and never waits.
  - Calls are serialised (one loop; only the latest wish is painted) and skipped when nothing changed.
  - The first call after a page load always paints, because the module state is unknown then.
  - A failing shell gets one attempt to go back to navy, then is left alone.
  - `resetNativeStatusBarForTests()` is for tests only.
- `lib/nativeApp.ts`: `NativeCapability` gained `"StatusBar"` and `"SystemBars"`.
- `components/ui/ThemeRouteSync.tsx`: `syncNativeStatusBar(applyThemeForPath(path))` on every route change and when
  the phone switches light/dark.
- `components/navigation/AppearancePicker.tsx`: on tap it runs `writeThemePreference` → `applyThemeForPath` →
  `syncNativeStatusBar`.
- `components/navigation/AccountMenuList.tsx`: `{isLightThemeEnabled() ? <li className="!mt-4"><AppearancePicker /></li>
  : null}`.

### 5. Facts and traps

- **The one-reader tripwire matches the word "Capacitor" anywhere in `app/`, `components/` and `lib/`, comments
  included** (`tests/native-app-contract.test.ts`, regex `/\bCapacitor\b/`). Only `lib/nativeApp.ts` may say it. A
  comment in `lib/nativeStatusBar.ts` tripped it once.
- Capacitor style names describe the **background**: `"DARK"` = white icons, `"LIGHT"` = dark icons.
- `SystemBars.setStyle` takes `bar: "StatusBar"` (Android constant `BAR_STATUS_BAR`). Without it, Android also restyles
  the gesture/navigation bar.
- Headless Chromium reports `prefers-color-scheme: light` by default. Emulate dark before testing "Match my phone".
- The pre-paint script can't set `theme-color` (the meta tag comes later in `<head>`). A full page load on a light
  screen shows the navy browser bar until hydration, a fraction of a second. The app's status bar behaves the same way.
- Phase 5/6 traps still apply: no `--ht-x:` inside CSS comments, Python for multi-line edits, and the `/predictions` →
  `/pickem` redirect turns the harness's `predictions` chrome shot light under `--theme light`.

### 6. How to build, run and test

- Main-tree gates, all run this phase:
  - `npx tsc --noEmit`: clean.
  - `npm run lint`: clean.
  - `npm run test`: **430 files / 5,267 pass, 13 skipped**.
  - `npm run test:pwa-contract`: 20/20.
- New test file: `tests/light-theme-appearance.test.ts` (jsdom, 11 tests):
  - iOS paint;
  - Android "white only if it stuck";
  - serialised quick changes;
  - no plugin = no calls;
  - website = no calls;
  - `theme-color` per theme, and with the flag off;
  - the row's options, the stored choice, instant apply;
  - the row only behind the flag.
- Screenshot recipe: the same as the Phase 5 handoff §6 (scratchpad clone, no `.env*`, port 3102, kill only your own
  PID). Results this phase:
  - **Flag on:** 76 dark shots against the three baselines. All identical except `venue-menu@350/390`, which is
    expected (the new row).
  - **Flag off:** `venue-menu`, `venue-games`, `pickem`, `fantasy` (both widths) are identical to
    `baseline-dark-42f0906`.
  - **Route table:** diffed against `~/Library/Caches/hightop-light-theme/route-table-42f0906.txt`: 237 routes, same
    static/dynamic split.
- Live browser check (`phase7-shots/appearance-live.cjs <repo> <outdir>`, against the clone on :3102):
  - Venue home starts dark (`theme-color #020617`).
  - Tapping Light → `data-theme="light"`, `#ffffff`, stored `light`.
  - "Match my phone" follows emulated dark → light.
  - A reload keeps light.
  - `/trivia` → dark + `#020617`.
  - The PWA band rule compiles (0 px tall headless, as expected).

### 7. Verified / unverified

**Verified:** everything in §6.

**Unverified:**
- Real phones: the status bar on iPhone and on Android ≤14 / 15+ (only read from the plugin source and mocked in tests).
- The installed iPhone PWA band.
- How the row looks at 289 px (iPhone SE zoomed).
- Rotation on Android with a light screen.
- Switching the theme while a game's own overlay is open.

All of these go on the Phase 8 checklist.

### 8. Open questions for Andrew

None blocking. Plan §6 defaults still apply (Q1: everyone starts on Dark). Committing Phases 5–7 awaits his say-so.

### 9. Recommended first steps for Phase 8 (Opus 5.5, high)

1. Read the plan §4 Phase 8 and this file.
2. Run `/code-review` at high on `155bbb7^..` plus the working-tree diff, limited to the light-theme files: exclude
   Andrew's files listed in §2.
3. Write `docs/light-theme-device-checklist.md`. Include the plan's list plus:
   - Android 15+ (strip stays navy);
   - Android ≤14 (strip turns white, icons dark, and survive rotation);
   - iPhone app (white strip, dark icons);
   - installed iPhone PWA (navy band behind the clock);
   - the Appearance row at 289 px;
   - "Match my phone" while the phone flips modes.
4. Add the CLAUDE.md / SYSTEM_CONTEXT.md / AGENTS.md notes (Edit only; CLAUDE.md has Andrew's uncommitted edits).

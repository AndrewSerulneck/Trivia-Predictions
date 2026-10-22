# Light Theme Plan — Phase 6 Handoff (Fantasy)

**Date:** 2026-10-22 · **Plan:** `docs/light-theme-plan.md` · **Previous:** `docs/light-theme-plan_PHASE_5_HANDOFF.md`

## For Andrew (plain English)

- **What changed:** every colour on the **Fantasy** screen (`/fantasy`, and `/fantasy/wnba`) now comes from a *named*
  colour with a dark value (exactly today's) and a light value: the sport and day picker, the "Your lineup" builder
  (NBA and MLB), the player list with sort/filter, Draft / Drafted buttons, the roster rows on "My Sweat", the
  Leaderboard tab, the "At the venue" notice, the warning/error/success notices, the score toasts and the submit bar.
- **The big live-points scoreboard stays the dark-green chalkboard in both themes** (your default for plan §6 Q3). In
  Light it only gains a soft shadow.
- **Did anything change in Dark?** No. 26 new Fantasy pictures (draft, draft with players picked, MLB draft, live
  roster, Leaderboard tab, final roster, warning/error notices; 390 and 350 px wide) are identical before and after,
  and the 50 pictures from Phases 2–5 are still identical. A second check compared 70 old-colour/new-colour pairs for
  the states the pictures can't reach (score toasts, "hot" rows, notices, submit toast): all identical.
- **With Light switched on (test build only):** grey-white page, white cards, deep-green accents and buttons, gold FP
  numbers, green "Live" pills, blue "At the venue" note, soft-green drafted rows, the chalkboard scoreboard. It matches
  the mockups (`FantasyDraft`, `FantasySweat`). Every other game is still dark with Light chosen.
- **Is it live?** No. The switch (`NEXT_PUBLIC_LIGHT_THEME_ENABLED`) is still off everywhere, and **Phases 5 and 6 are
  not committed** (say the word and I'll commit both, without your own files).
- **Why you saw nothing on your dev server:** expected. The switch is off, and even with it on, nothing chooses Light
  yet (the Appearance menu row is Phase 7). To preview now: add `NEXT_PUBLIC_LIGHT_THEME_ENABLED=true` to `.env.local`,
  restart `npm run dev`, open a light-capable page (venue home, `/pickem`, `/nfl-pickem`, `/fantasy`), run
  `localStorage.setItem('htc_theme','light')` in the browser console and reload. `localStorage.removeItem('htc_theme')`
  goes back to dark.
- **Small things you may notice:**
  1. Fantasy's page had a dark-green frame painted behind it (the game's tile colour). In Light that showed as a green
     border round the page, so both Fantasy pages now use a frame colour that is the same green in Dark and the page
     grey in Light. The tutorial cards are unchanged.
  2. The disabled submit bar ("Draft 3 players!") is faint in Light, as it is in Dark — it's disabled.
  3. The gold "46 proj" text on a *drafted* player's soft-green row is just over the readability bar (4.58:1); the
     mockup has the same pairing.
- **What needs you:** nothing blocking.

## For the next agent (Phase 7 — Appearance setting, native status bar, theme-color, rollout)

### 1. Goal and scope

Phase 7 (plan §4, **Opus 5.5, high**): the Appearance row in the player drawer (Dark / Light / Match my phone, writes
through `lib/theme.ts` `writeThemePreference` + `applyThemeForPath`, copy in one place, shown only with the flag on),
`<meta name="theme-color">` following the theme, the native status bar (capability-checked through `lib/nativeApp.ts`,
only if the shell exposes a StatusBar plugin; do not flip `overlaysWebView`), and the rollout runbook lines. Default
stays Dark (`DEFAULT_THEME_PREFERENCE` in `lib/theme.ts`). **Out of scope:** more screen conversions (all four are done);
the review and phone checklist (Phase 8).

### 2. Starting state

- Branch `main`, last commit `155bbb7` (Phases 1–4). **Phases 5 and 6 are uncommitted** (Andrew has not asked).
- Phase 6 files changed: `components/fantasy/FantasyHome.tsx`, `app/fantasy/page.tsx`, `app/fantasy/wnba/page.tsx`
  (`playingBackgroundClassName="bg-ht-fantasy-frame"`), `app/globals.css` and
  `design-system/hightop-challenge-design-system/project/colors_and_type.css` (a "Fantasy (Phase 6)" block in `:root`
  and in `:root[data-theme="light"]`), `tailwind.config.ts` (colours under `ht.*` + shadows `ht-toast`,
  `ht-fantasy-cta`, `ht-chalk`), `scripts/theme-screenshots.cjs` (+ `draftTwo` action and 13 Fantasy shots),
  `scripts/theme-screenshots-fixtures.cjs` (scenarios `fantasy-live`, `fantasy-final`, `fantasy-banners`,
  `fantasy-mlb`), `scripts/theme-pairs/make-pairs.cjs` (+70 Fantasy pairs), `scripts/theme-pairs/compare-pairs.cjs`
  (now also compares `stroke`), this file, the plan's status line.
- Phase 5 files (still uncommitted) are listed in its handoff §2.
- Andrew's own uncommitted work — never stage / revert / `git checkout --`: `CLAUDE.md`,
  `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, the 7 deleted
  `design-system/project/public/info/*.png`, untracked `design-system/project/public/info/New Folder With Items/`. Stage
  files by name only.
- No database, Vercel env var, `.env.local` or deploy change. Flag not set anywhere.
- **Dark baselines:** `~/Library/Caches/hightop-light-theme/baseline-dark-42f0906/` (30), `…/baseline-dark-phase5-states/`
  (20), and new `…/baseline-dark-phase6-states/` (26, captured from a pre-conversion build of the Phase-5 tree). All
  three compare SAME against the Phase 6 build (`--noise 1`).

### 3. Decisions made in this phase

- Scoreboard = §6 Q3 default **"chalkboard"**: its classes stay literal hex (no tokens), plus `shadow-ht-chalk` (none in
  dark). `ChalkGrid` got an `alwaysChalk` prop for it; every other chalk grid uses `--ht-fantasy-chalk-grid`
  (transparent in light).
- Other chalkboard cards (lineup builder, game-start card, pool loader, football "coming soon") become white cards in
  light (`--ht-fantasy-board`), per the Draft mockup.
- Two cream/gold roles split by meaning: `#fef3c7` text = `fantasy-ink` (near-black in light: names, date) or
  `fantasy-accent` (green in light: avatar numbers, slot positions, active sort chip); `#fde68a` = `fantasy-title`
  (green: labels, positions, buttons) or `fantasy-points` (gold: FP numbers, "proj", top-3 ranks).
- Draft button stays a tinted chip (green tint + green text) rather than the mockup's solid green; the Draft-your-roster
  and Submit buttons are solid (`--ht-fantasy-cta`: violet in dark, green in light).
- Not converted, on purpose: the full-screen stat pop's big label (`#22c55e` / `#ef4444` with glows — same call as Pick
  'Em's decorative numerals; its "+N pts" line IS tokenized), `SpringPop` glows, live dots, `bg-emerald-500/15`-style
  tints that read on both themes (checked ≥ 4.5:1 with the light text), the disabled NFL chip (`text-slate-600
  opacity-55`), `FantasySettledCollectAnimation` (self-contained dark overlay), `statusBadge()` (unused function),
  `components/fantasy/PointsLedger.tsx` (not imported anywhere).

### 4. New tokens (Phase 6)

Channel (take `/NN`): `fantasy-ink`, `fantasy-on-fill`. Whole colours (never `/NN`): `fantasy-ink-45/-50/-55/-60`
(chalk small print at that alpha in dark, `#5b6b82` in light), `fantasy-band-bg/-edge`, `fantasy-chip-bg/-fg`,
`fantasy-count`, `fantasy-dot-set`, `fantasy-arrow-bg`, `fantasy-board`, `fantasy-chalk-grid` (CSS var only, used in an
arbitrary gradient), `fantasy-avatar`, `fantasy-avatar-ring`, `fantasy-slot-empty`, `fantasy-slot-filled`,
`fantasy-row-bg/-edge`, `fantasy-pool-row`, `fantasy-picked-bg`, `fantasy-card-edge`, `fantasy-me-row`, `fantasy-cta`,
`fantasy-cta-fade` (gradient, used as `[background-image:var(--ht-fantasy-cta-fade)]`), `fantasy-toast-bg`,
`fantasy-pop-gain/-loss` (inline style), `fantasy-frame`, `danger-toast-bg`, `success-wash-dim` (emerald-950/30),
`success-wash-faint` (emerald-950/20), `info-edge`, `info-wash`, `info-wash-soft`, `info-icon` (used as
`stroke-ht-info-icon`; the SVG `stroke` attribute was removed), `info-fg`, `top-chip-bg`. Shadows: `--ht-shadow-toast`,
`--ht-shadow-fantasy-cta`, `--ht-shadow-chalk`. Exact values: the "Fantasy (Phase 6)" blocks in `app/globals.css`.
Reused: `fantasy-accent`, `fantasy-title`, `fantasy-points`, `success-fg/-soft`, `danger-fg/-soft`, `warn-fg/-edge`,
`warn-wash/-soft`, `danger-wash/-soft`, `countdown`, `overlay`, `border-soft`, `fg-*`, `surface`, `canvas`, `elevated`,
`shadow-ht-panel`.

### 5. Facts and traps

- **The Fantasy page scrolls inside its own container** (like Pick 'Em): a full-page screenshot shows only the first
  ~840 px. The `…-top`, `…-mid`, `…-bottom` shots exist for that.
- **`/predictions` redirects to `/pickem`**, so the harness's `predictions` "chrome" shot turns light under
  `--theme light`. That is correct, not a leak; compare chrome shots light-vs-dark knowing this (12 of 14 identical,
  `predictions@*` differ).
- **Fantasy's backdrop comes from `GameLandingExperience`'s fixed layer** (`GAME_CARD_BG_BY_KEY.fantasy` =
  `bg-[#0a3128]`) unless the page passes `playingBackgroundClassName`. Don't change `GAME_CARD_BG_BY_KEY` itself: the
  tutorial cards use it (decision §6 Q5).
- The harness's `draftTwo` clicks the first `^Draft$` button twice; the localStorage draft is per browser context, so
  each shot starts clean.
- Fantasy realtime (Supabase) is unconfigured in the harness: no stat toasts / ticker / "hot" rows can be screenshotted.
  They are covered only by the pair check (dark) and by reading the classes (light).
- The geofence pause notice is unreachable (`DISABLE_GEOFENCE_FOR_TESTING = true` in `FantasyHome.tsx`; the other path
  is a presence-overlay). Its classes are pair-checked.
- My first "every class compiled" grep reported 5 bracket-alpha classes (`/[0.06]` etc.) missing; that was the grep's
  escaping. They are in the compiled CSS (`.bg-ht-overlay\/\[0\.07\]`).
- Traps from Phase 5 §5 still apply (no `--ht-x:` inside CSS comments; `-accent-rgb`/`-fg-rgb` names are tested as text
  on white; macOS `sed -i` needs `''` — Python was used for every edit).

### 6. How to build, run and test

Same recipe as the Phase 5 handoff §6 (scratchpad clone, no `.env*`, `NEXT_PUBLIC_LIGHT_THEME_ENABLED=true npx next
build --webpack`, `next start -p 3102`, capture/compare, kill only your own PID). New shots: `fantasy-draft-picked`,
`fantasy-mlb`, `fantasy-live`, `fantasy-live-leaderboard`, `fantasy-final`, `fantasy-banners`,
`fantasy-draft-picked-top`, `fantasy-mlb-top`, `fantasy-live-mid`, `fantasy-live-bottom`, `fantasy-final-bottom`.
Pair check: `node scripts/theme-pairs/make-pairs.cjs $SP/pairs && npx tailwindcss -c tailwind.config.ts -i
app/globals.css -o $SP/pairs/pairs.css --content $SP/pairs/pairs.html && node scripts/theme-pairs/compare-pairs.cjs
$SP/pairs` → 186 of 187 identical, 1 expected (Phase 4's pair 44).

Main-tree gates run this phase: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 429 files / 5,256 pass,
13 skipped; `npm run test:pwa-contract` 20/20. `next build` was run (twice) in the scratchpad clone with the flag on;
the route table was not diffed against `route-table-42f0906.txt` (no route was added or removed).

### 7. Verified / unverified

Verified: dark identical (26 Fantasy + 50 earlier pictures); 70 Fantasy class pairs identical in dark; light viewed at
390 and 350 for all 13 Fantasy shots; non-Fantasy games unchanged under Light (except the `/predictions` redirect,
above); light contrast of each new text/background pair ≥ 4.5:1 (lowest 4.58, gold "proj" on a drafted row).
**Unverified:** real phones (Phase 8); light rendering of states the harness can't reach (stat toasts and the
full-screen stat pop, the points ticker, "hot" rows, the submission toast, the geofence pause notice, "Load more
players", the football "coming soon" card, the WNBA page, the settled-collect overlay on a light page).

### 8. Open questions for Andrew

None blocking. §6 defaults still apply (Q3 chalkboard taken). Phases 5–6 commit awaits his say-so.

### 9. Recommended first steps for Phase 7 (Opus 5.5, high)

1. Read plan §3 items 3, 6 and §4 Phase 7; `lib/theme.ts`; `components/ui/ThemeRouteSync.tsx`; `app/layout.tsx`;
   `components/navigation/AccountDrawer.tsx` and the player menu list it hosts; `lib/nativeApp.ts` and
   `native/capacitor.config.json` (is there a StatusBar capability the web can call?).
2. Build the Appearance row (flag-gated, copy in one place), apply instantly with `applyThemeForPath`, keep the
   drawer's native-Back registration intact (`tests/native-back-review-fixes.test.ts`, `tests/account-drawer.test.ts`).
3. `theme-color` + `color-scheme` follow the theme in `ThemeRouteSync` (no server read in the root layout).
4. Extend `tests/light-theme-contract.test.ts`; re-run the dark diff on all shots (the drawer is in `venue-menu`).

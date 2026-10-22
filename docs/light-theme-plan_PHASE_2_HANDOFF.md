# Light Theme Plan — Phase 2 Handoff (foundation)

**Date:** 2026-10-22 · **Plan:** `docs/light-theme-plan.md` · **Previous:** `docs/light-theme-plan_PHASE_1_HANDOFF.md`

## For Andrew (plain English)

- **What changed:** the behind-the-scenes plumbing for the light theme: the light colours are now defined
  (next to today's dark ones), there's a tiny piece of code that switches a page to light before it draws,
  and a switch (`NEXT_PUBLIC_LIGHT_THEME_ENABLED`) that keeps all of it turned **off**.
- **Did anything change on screen?** No. I took screenshots of 15 screens at two phone widths before and
  after the change and compared them pixel by pixel: identical. (The only differences were 1–2 pixels
  shifting by a single shade inside a gradient, which also happens between two screenshots of the
  *same* version.)
- **Is it live?** No. Nothing is committed, pushed or deployed. The switch stays off until Phase 7.
  **Don't turn it on yet:** the screens aren't converted, so a player who chose Light would see a
  half-light page with some text that's hard to read.
- **What's left:** Phases 3–8 (converting the shared top bar and buttons, then each screen, then the
  Appearance setting, then review and your phone pass).
- **What needs you:** nothing right now. You didn't answer the plan's six questions (§6), so I went with
  every default: a Dark / Light / Match-my-phone choice starting on Dark, white Pick 'Em tickets, the
  dark green Fantasy scoreboard kept, other games stay dark, tutorial cards and Venue Home tiles
  unchanged. Say so before the matching phase if you want any of those different.
- **Commit?** Not done — say the word and I'll commit just this phase's files (your own uncommitted
  POS/CLAUDE.md changes stay out of it).

## For the next agent (Phase 3 — shared chrome)

### 1. Goal and scope

Phase 3 (plan §4, Opus 5.5, **medium**): convert the shared chrome to tokens — `components/venue/AppBar.tsx`
(`AppBar`, `GameAppBar`; its per-game `accentText` becomes a token), `components/navigation/ExitBackButton.tsx`
(neutral both ways; light = white circle, slate chevron), the points pill, `NotificationBell`, `ViewTabs`,
`Dropdown`, `HightopLoader variant="card"`, `ButtonSpinner`, `AccountDrawer` + `AccountMenuList`,
`InlineSlotAdClient` placeholder frame, and the global form rules in `app/globals.css` (~line 1100+, the
`:where(:not(.ht-light-surface *))` rules — swap the `rgba(255,255,255,.12)` / `#334155` literals for
`var(--ht-border-soft)` etc., keep the `:where()` scoping exactly). Dark must stay pixel-identical on
**every** screen, not only the four. **Out of scope:** the screens' own content (Phases 4–6), the
Appearance row, `theme-color` meta, native status bar (Phase 7), turning the flag on.

### 2. Starting state

- Branch `main`, last commit `42f0906` (docs(squares): plan 6.7 part 1). **Phase 2 is uncommitted** (Andrew
  hasn't asked for a commit). Phase 2's files: modified `app/globals.css`, `app/layout.tsx`,
  `tailwind.config.ts`, `.env.example`, `SYSTEM_CONTEXT.md`, `docs/light-theme-plan.md`,
  `design-system/hightop-challenge-design-system/project/{colors_and_type.css,README.md,SKILL.md}`; new
  `lib/theme.ts`, `components/ui/ThemeRouteSync.tsx`, `tests/light-theme-contract.test.ts`,
  `scripts/theme-screenshots.cjs`, `scripts/theme-screenshots-fixtures.cjs`, this file. Plus Phase 1's
  untracked `docs/light-theme-plan.md`, `docs/light-theme-plan_PHASE_1_HANDOFF.md`, `docs/light-theme-mockups/`.
- **Andrew's own uncommitted work is in the tree — not this plan's:** `CLAUDE.md`,
  `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`,
  7 deleted `design-system/project/public/info/*.png`, untracked `design-system/project/public/info/New Folder
  With Items/`. Never stage, revert or `git checkout --` them; never `git add -A`.
- No database, Vercel env var or deploy change. `NEXT_PUBLIC_LIGHT_THEME_ENABLED` is **not set** anywhere
  (only documented in `.env.example` as `false`).
- **Dark baseline (the reference for every later phase):**
  `~/Library/Caches/hightop-light-theme/baseline-dark-42f0906/` — 30 PNGs (15 shots × 390/350 px), captured
  from a production build of commit `42f0906` + the working tree at the start of this phase (before any
  colour change). Route table of that build: `~/Library/Caches/hightop-light-theme/route-table-42f0906.txt`.
  It lives outside `~/Documents` on purpose (iCloud makes `name 2` copies there). If it is ever lost,
  regenerate it from a clone of commit `42f0906` with the recipe in §6 — Phase 2 itself was verified
  identical to it, so a clone of the Phase 2 state works too.

### 3. Decisions already made

- Andrew, 2026-10-22: "Execute phase 2." = go-ahead; §6 unanswered → **all defaults** (recorded as plan §1
  item 4). Don't re-ask; he can overrule before a phase.
- **Alpha modifiers (plan §5, first trap — decided):** new tokens that need opacity are channel triples
  `--ht-<name>-rgb` + Tailwind `rgb(var(--ht-<name>-rgb) / <alpha-value>)`; whole-colour tokens have no
  `-rgb` and never take a modifier. **Existing tokens stay plain `var()`** — see trap below.
- `theme-color` meta is left to Phase 7 (plan's phase table), even though §3.3 mentions ThemeRouteSync
  updating it. `color-scheme` is done in CSS (`:root[data-theme="light"] { color-scheme: light }`).
- Only the canonical design-system copy (`design-system/hightop-challenge-design-system/project/`, named in
  `SYSTEM_CONTEXT.md` §10) was updated. The second copy `design-system/project/` was left alone (stale
  duplicate, and Andrew has uncommitted deletions in it).
- Light-only background companions (success `#ECFDF5`, danger `#FFF1F2`, points pill `#FFFBEB`) were **not**
  added as tokens: their dark values must be the exact literals found when converting (points pill =
  Phase 3, the rest Phases 4–6). Add each as a token with dark = that literal.

### 4. Files and how they fit

- `app/globals.css` — `:root` gained a "SCREEN TOKENS" block (dark = today's literals) and a new
  `:root[data-theme="light"]` block right after `:root` (light values for canvas/surface/elevated/borders/
  fg/shadow-card + the screen tokens, `color-scheme: light`). Screen tokens: `--ht-venue-accent-rgb`,
  `--ht-countdown-rgb`, `--ht-countdown-label-rgb`, `--ht-pickem-accent-rgb`, `--ht-pickem-picked`,
  `--ht-fantasy-accent-rgb` (dark `#fef3c7`, Fantasy's dominant chalk), `--ht-fantasy-points-rgb` (dark
  `#fde68a`), `--ht-success-fg-rgb`, `--ht-danger-fg-rgb`, `--ht-points-fg-rgb`. Nothing uses them yet.
- `design-system/hightop-challenge-design-system/project/colors_and_type.css` — the same two blocks
  (contract test keeps the light blocks equal).
- `tailwind.config.ts` — `colors.ht` gained `venue-accent`, `countdown`, `countdown-label`, `pickem-accent`,
  `pickem-picked`, `fantasy-accent`, `fantasy-points`, `success-fg`, `danger-fg`, `points-fg` → classes like
  `text-ht-pickem-accent`, `bg-ht-venue-accent`, `border-ht-fantasy-accent/[0.22]`.
- `lib/theme.ts` — the one home: `LIGHT_THEME_PATH_PATTERN` (`/venue/<id>` hub only, `/pickem[/…]`,
  `/nfl-pickem`, `/fantasy[/…]`), `isLightThemeEnabled()` (only reader of the flag), `THEME_STORAGE_KEY =
  "htc_theme"` (only reader/writer), `DEFAULT_THEME_PREFERENCE = "dark"`, `parseThemePreference`,
  `resolveTheme`, `themePrePaintScript()` (built from the same constants), and browser helpers
  `readThemePreference`, `writeThemePreference` (for Phase 7), `prefersLightColorScheme`,
  `applyThemeForPath(pathname)` (sets/removes `data-theme`; always dark with the flag off).
- `components/ui/ThemeRouteSync.tsx` — client; `useLayoutEffect` on `usePathname()` → `applyThemeForPath`;
  also follows the phone's `prefers-color-scheme` changes.
- `app/layout.tsx` — `<html suppressHydrationWarning>`; when the flag is on, the inline script as the first
  thing in `<head>` and `<ThemeRouteSync />` in the body. No `cookies()`/`headers()`.
- `tests/light-theme-contract.test.ts` (12 tests, in `npm run test`) — paths; script = `resolveTheme` over
  a full matrix (evaluated with `new Function`); blocked storage → dark; only `lib/theme.ts` names the flag
  or `"htc_theme"` (app/components/lib/proxy.ts — **a comment naming the flag fails it too**); layout never
  imports `next/headers`; every light token exists in `:root`; `-rgb` values are triples; both CSS files'
  light blocks equal; every light text token ≥ 4.5:1 on white (`--ht-fg-dim` excepted, placeholder only).
- `scripts/theme-screenshots.cjs` + `scripts/theme-screenshots-fixtures.cjs` — the harness (§6).
- Docs: `SYSTEM_CONTEXT.md` §10 colour rule, the canonical design-system README ("Colors") and SKILL.md
  rule 1, `.env.example`.

### 5. Facts and traps

- **Dead classes — don't "fix" them:** `bg-ht-elevated/40` (20 uses), `/50` (13), `/60` (3) emit **no CSS**
  today (Tailwind 3.4 drops an opacity modifier on a plain `var()` colour; verified in the compiled CSS).
  Converting `--ht-elevated` etc. to channel triples would suddenly make them render = dark pixel change.
- **Contrast limits found:** light `--ht-fantasy-points` (`#A16207`) and `--ht-countdown-label` (`#B45309`)
  pass 4.5:1 on white/page but **fail on the grey inset `#E8EDF4`** (4.2 / 4.3). Put them on white only.
  Venue accent `#0E7490` is 4.55 on the inset — borderline, fine.
- With the flag on and Light chosen, the four screens today are half-converted (only the existing `ht-*`
  tokens flip): e.g. the leaderboard's gold headings and pale rank pills on white. Expected until Phases
  3–6 land. Pick 'Em/NFL keep a dark page because they pass `playingBackgroundClassName="bg-[#020617]"`.
- `/predictions` redirects to `/pickem`, so its "chrome" shot is really Pick 'Em and turns light with the
  light preference. Correct behaviour; just don't read it as a leak.
- `next build` in a clone fails typecheck on `tests/* 2.ts` iCloud duplicates that import from `/docs`
  — exclude `/tests` (and `/docs`) from the clone; the main tree's `npx tsc --noEmit` covers tests.
- Hub tabs are a horizontal swipe track; a full-page screenshot resizes the viewport and re-centres it
  mid-swipe, so tab/menu shots are viewport-only.
- A clone with **no Supabase env** renders `/venue/venue-uptown` from `lib/defaultVenues.ts` (no DB); keep
  `NEXT_PUBLIC_SUPABASE_URL` unset in the clone (a dummy URL makes the venue lookup time out → 404).
- Killing the `npx next start` PID also stopped the `next-server` child here; still verify the port with
  `lsof` and never broad-`pkill` (memory rule: Andrew's dev server on :3000).

### 6. Build, run, test

Main tree: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:pwa-contract` (not concurrently
with a build). Results this phase: typecheck clean, lint clean, **429 files / 5,256 tests pass, 13 skipped**,
PWA contract 20/20, light-theme contract 12/12.

Screenshot diff (never against :3000; scratchpad clone, no `.env*`):

```bash
SP=<your scratchpad>
rsync -a --exclude /node_modules --exclude /.next --exclude /.git --exclude '/.env*' --exclude /native \
  --exclude /docs --exclude /design-system --exclude /tmp --exclude /tests ./ $SP/cand/
cp -Rc node_modules $SP/cand/node_modules                      # APFS clone, seconds
cd $SP/cand && env -u SUPABASE_SERVICE_ROLE_KEY -u NEXT_PUBLIC_SUPABASE_URL npx next build --webpack
env -u SUPABASE_SERVICE_ROLE_KEY -u NEXT_PUBLIC_SUPABASE_URL nohup npx next start -p 3102 > ../srv.log 2>&1 &
echo $! > ../srv.pid                                            # kill only this PID afterwards
cd <repo> && node scripts/theme-screenshots.cjs capture --url http://localhost:3102 --out $SP/after
node scripts/theme-screenshots.cjs compare ~/Library/Caches/hightop-light-theme/baseline-dark-42f0906 \
  $SP/after --diff-out $SP/diff --noise 1
```

`--noise 1` ignores pixels whose channels moved by ≤ 1 (Chromium gradient dithering: two captures of the
same build differed by 1 px, delta 1). A real change shows as hundreds of px with a large channel delta.
Light: rebuild with `NEXT_PUBLIC_LIGHT_THEME_ENABLED=true`, then `capture … --theme light` (in-scope shots
only by default; `--group all` to prove the other games stay dark). `--verbose` lists API calls that had no
fixture (ads, bingo, blitz, trivia, prizes, predictions, NFL leaderboard/rewards/tiebreaker answer 404 →
those screens show their empty/error state, which is fine for chrome).

Verified this phase (production builds in clones):
- Flag off vs baseline: **30/30 identical** (`--noise 1`; strict: 2 shots differ by 1–2 px, delta 1).
- Flag on, no preference: **30/30 identical**. Route table identical to baseline with the flag off and on.
- Flag on, Light: only the 8 in-scope shots (+ `/predictions` → `/pickem`) change; all other games identical.
- Playwright: light on hub → in-app nav to `/trivia` removes the attribute → Back restores it; full load
  of `/trivia` stays dark; server HTML never has `data-theme`; no hydration errors; "system" follows the
  phone incl. a live switch; no stored choice → dark.
- `npm run build` was run in the clones (flag off and on), not in the main tree.

**Unverified:** real phones (iOS Safari, Android, installed PWA, native app) — Phase 8; the pre-paint
script's no-flash on a slow device; Fantasy "My Sweat" (live entry) and NFL leaderboard states are not in
the harness yet (no fixtures) — add them in Phases 5/6 *before* converting those parts, capture their dark
baseline from a pre-conversion build.

### 7. Open questions for Andrew

None blocking. §6 defaults are in force; commit of Phase 2 awaits his say-so.

### 8. Recommended first steps for Phase 3 (Opus 5.5, medium)

1. Read plan §2.1, §3, §5 and this file's §5. Confirm the baseline folder exists (`ls
   ~/Library/Caches/hightop-light-theme/baseline-dark-42f0906 | wc -l` → 30).
2. Read the light mockups' app bar/back/drawer colours in `docs/light-theme-mockups/Main.dc.html` and
   `PickEm.dc.html` (inline styles = the light values).
3. Convert one component at a time; for each literal add a token (dark = the exact literal, light from the
   mockup) to BOTH CSS files' blocks and `tailwind.config.ts`. Convert `text-white` by meaning (plan §5).
4. Build the clone, capture, compare against the baseline (all 30 shots). Add the points-pill background
   token (dark = its current literal, light `#FFFBEB`).
5. `npm run test` (navigation, account drawer, text-size floor, light-theme contract), `npm run test:pwa-contract`.
6. Write `light-theme-plan_PHASE_3_HANDOFF.md`, update the plan status line.

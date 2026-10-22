# Light Theme Plan — Phase 5 Handoff (Pick 'Em + NFL Pick 'Em)

**Date:** 2026-10-22 · **Plan:** `docs/light-theme-plan.md` · **Previous:** `docs/light-theme-plan_PHASE_4_HANDOFF.md`

## For Andrew (plain English)

- **First, the commit you asked for:** Phases 1–4 are committed as `155bbb7` ("feat(theme): light theme phases 1-4 …").
  Your own uncommitted work (`CLAUDE.md`, the two POS docs, `lib/pos/providers.ts`, the 7 deleted
  `design-system/project/public/info/*.png`, the `New Folder With Items` folder) was left out on purpose. Nothing is
  pushed or deployed.
- **What changed in Phase 5:** every colour on **Pick 'Em** and **NFL Pick 'Em** now comes from a *named* colour with a
  dark value (exactly today's) and a light value: the header card, the "Pick Tracker", the day picker, the sport
  buttons, the game tickets, the "Your Picks" history, the NFL week picker and week summary, the prize line, the
  tiebreaker, the leaderboard, and the notices. The "Double Points!" pop-up gets a halo that shows on a light page.
- **Did anything change on screen in Dark?** No. I took 10 screens at two phone widths (20 pictures) before and after,
  including states the old checks never reached (live / won / lost / tied games, the 10-of-10 limit, the "Your Picks"
  history for a past day, an NFL week with a prize line, spreads notice, tiebreaker and an opened leaderboard row):
  **all 20 identical**, and the 30 pictures from the earlier phases are still **identical**. A computer check of 116
  old-colour-vs-new-colour pairs covered the states you can't screenshot: 115 identical, 1 is the same documented
  difference from Phase 4 (the prize-claim pill).
- **With Light switched on (test build only):** both screens look like the approved mockups: grey-white page, white
  cards, navy title and accents, white tickets with a faint navy (away) and faint magenta (home) half, the picked team
  gold-tinted with a navy check box, green/red result strips, navy tracker segments. I looked at all 10 screens at 390
  and 350 px. Every other game (Live Trivia, Speed Trivia, Bingo, Category Blitz, Activity, Redeem Prizes) is still
  pixel-identical to Dark with Light chosen.
- **Is it live?** No. The switch (`NEXT_PUBLIC_LIGHT_THEME_ENABLED`) is still off everywhere, and Phase 5 is
  **not committed** (say the word and I'll commit it, again without your own files).
- **Three things you may care about:**
  1. **A shared-screen fix I found:** the app's outer game frame (`components/ui/AppShell.tsx`) had a hard-coded dark
     background. On a light page that showed as a black strip below the content. It now uses the page colour
     (identical in Dark). One existing test pinned that exact text, so I updated its expectation.
  2. **Three Pick 'Em files are not used anywhere** (`PickEmRecentPicks`, `PointsBank`, `PickEmSportSelect`). I left
     them dark; if you ever want to delete them as dead code, that's a separate, safe clean-up.
  3. **The prize-collect pop-up** (`components/animations/PickEmCollectAnimation.tsx`, the dark "+N POINTS COLLECTED"
     card over a dark scrim) is deliberately unchanged: it is a self-contained dark overlay, like the prize gift card.
- **What needs you:** nothing blocking. Optional: the first thing to eyeball on your phone later is the ticket's
  faint grid lines in Light (see "Facts and traps").

## For the next agent (Phase 6 — Fantasy)

### 1. Goal and scope

Phase 6 (plan §4, **Opus 5.5, high**): convert Fantasy to tokens with light values per the mockups
`docs/light-theme-mockups/FantasyDraft.dc.html` and `FantasySweat.dc.html` (inline styles = the light values):
`components/fantasy/FantasyHome.tsx` (3,273 lines: `ChalkGrid`, `PlayerHeadshot`, `SpringPop`, `BasketballLoader`, stat
flash toasts, full-screen stat pop, collect animation, control band, draft slots, MLB pitcher/hitter sections, sort/
filter, pool rows, the bottom submit bar gradient `from-slate-950`, the live scoreboard, roster rows, the leaderboard
tab, geofence/status/error banners), `components/fantasy/PointsLedger.tsx`, `app/fantasy/page.tsx` and
`app/fantasy/wnba/page.tsx` (WNBA is under `/fantasy/*`, so in scope), and any `app/fantasy/loading.tsx` (none exists
today). Scoreboard: plan §6 Q3 default = **"chalkboard"** (keep today's dark-green big live-points card, light page
around it). **Out of scope:** the Appearance row, `theme-color`, native status bar, turning the flag on (Phase 7);
Pick 'Em / NFL / Venue Home (done); the review (Phase 8). `grep -c tp-fantasy-compact app/globals.css` is 0, so there
is no compact-CSS to check (the plan's note is stale).

### 2. Starting state

- Branch `main`, last commit `155bbb7` (Phases 1–4). **Phase 5 is uncommitted** (Andrew has not asked).
- Phase 5 files modified: `app/globals.css`, `design-system/hightop-challenge-design-system/project/colors_and_type.css`,
  `tailwind.config.ts`, `app/pickem/page.tsx`, `app/nfl-pickem/page.tsx`, `app/nfl-pickem/loading.tsx`,
  `components/pickem/PickEmGameList.tsx`, `components/nfl-pickem/{NFLGameCard,NFLPickEmGameList,NFLPickEmLeaderboard,
  NFLPickEmRewardBanner,NFLTiebreakerCard,WeekSelector,WeeklySummary}.tsx`, `components/ui/AppShell.tsx`,
  `tests/category-blitz-mobile-shell-contract.test.ts` (pin follows the AppShell change), `scripts/theme-screenshots.cjs`,
  `scripts/theme-screenshots-fixtures.cjs`, `scripts/theme-pairs/{make-pairs,compare-pairs}.cjs`; this file; the plan's
  status line.
- Andrew's own uncommitted work (never stage / revert / `git checkout --`): `CLAUDE.md`,
  `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, the 7 deleted
  `design-system/project/public/info/*.png`, untracked `design-system/project/public/info/New Folder With Items/`.
  Never `git add -A`; stage files by name.
- No database, Vercel env var or deploy change. Flag not set anywhere.
- **Dark baselines (the references):** `~/Library/Caches/hightop-light-theme/baseline-dark-42f0906/` (30 PNGs, the 15
  original shots; still valid: after Phase 5 all 30 are identical) and the new
  `~/Library/Caches/hightop-light-theme/baseline-dark-phase5-states/` (20 PNGs = the 10 Phase-5 shots incl. the new
  scenario ones, captured from a pre-conversion build of commit `155bbb7`). Route table baseline
  `route-table-42f0906.txt` was not re-taken this phase (no route changed; the candidate build's table was not diffed).

### 3. Decisions made in this phase

- Ticket per plan §6 Q2 default **"light"** (white ticket, faint navy away half `#F5F7FD`, faint magenta home half
  `#FDF5F9`, picked half `#FEF3C7`, navy check box with white ✓, solid hairline under the header instead of the dashed
  rule). "Classic" was not built (Andrew never asked for it).
- One ticket token set serves **both** games (`PickEmGameList` and `NFLGameCard` still have separate markup, but the
  same classes). The ticket background is one token used as `[background:var(--ht-ticket-bg)]` (a gradient in dark, `#fff`
  in light); the header rule's style is `[border-bottom-style:var(--ht-ticket-rule-style)]` (dashed / solid).
- Same judgement as Phase 4: tinted translucent backgrounds that read on both themes (`bg-emerald-500/15`,
  `bg-rose-500/20`, `bg-amber-500/15`, `bg-emerald-500/10` summary tiles, `bg-amber-400/10` "Browse only") stay literals;
  checked by hand that the light text on them is ≥ 4.5:1. Tints that go muddy on white got tokens (`danger-wash-soft`,
  `warn-wash`, `warn-wash-soft`).
- The Pick 'Em accent (`#fde68a` → navy `#1a2f72`) is used at its original alpha for edges/fills (`border-ht-pickem-accent/30`
  etc.). A few spots needed a *different* light alpha, so they are whole-colour tokens: card edge
  (`pickem-card-edge`), day bar (`pickem-bar-bg/edge`), the "Points" tile label (`pickem-label`), the correct/wrong labels
  (`success-label`, `danger-label`), the amber small print (`warn-note`).
- **Not converted, on purpose:** `PickEmCollectAnimation` (self-contained dark overlay); the big "+N" pick count pop-up
  digits (`#22c55e` / `#ef4444`, huge decorative numerals); the `pickem-gold-flash` keyframes (defined but never used);
  `text-slate-600` on a disabled sport button (an emoji, colour irrelevant); the live-dot `bg-emerald-400`; the
  `bg-emerald-400 text-emerald-950` "Saved!" button.
- The unused components `PickEmRecentPicks`, `PointsBank`, `PickEmSportSelect` were left untouched.

### 4. New tokens (Phase 5) — `app/globals.css` and the canonical `colors_and_type.css`, `:root` (dark = today's literal) + `:root[data-theme="light"]`, and `tailwind.config.ts`

Channel tokens (take a `/NN` modifier): `pickem-on-fill` (text/✓ on a filled accent: navy → white), `chip-fill` (the day-arrow
buttons' fill, slate-950 → white; used at /65 and /55), `pickem-glow` (the "Double Points!" halo, yellow-400 → yellow-600;
used in inline styles as `rgb(var(--ht-pickem-glow-rgb) / 0.62)`).
Whole-colour tokens (never take a `/NN`): `ticket-bg` (+ `ticket-rule-style`, not a colour), `ticket-edge`, `ticket-rule`,
`ticket-halves`, `ticket-away`, `ticket-home`, `ticket-divider`, `ticket-box-edge`, `ticket-box-bg`, `ticket-meta`,
`pickem-card-edge`, `pickem-bar-bg`, `pickem-bar-edge`, `summary-bg`, `tracker-bg`, `tracker-head`, `seg-empty`,
`danger-wash-soft`, `warn-wash`, `warn-wash-soft`, `success-label`, `danger-label`, `pickem-label`, `warn-note`.
Existing tokens reused: `pickem-accent`, `pickem-picked`, `surface`, `canvas`, `overlay`, `fg-*`, `success-fg`, `danger-fg`,
`gain-fg`, `loss-fg`, `warn-fg`, `countdown`, `countdown-soft`, `danger-wash`, `shadow-ht-panel`. Exact values: read the
"Pick 'Em + NFL Pick 'Em (Phase 5)" blocks in `app/globals.css`.

### 5. Facts and traps

- **A comment containing `--ht-something:` is parsed as a token by `tests/light-theme-contract.test.ts`** (its regex reads
  `--name: value;` anywhere, comments included) and swallows the next token up to the next `;`. It bit the
  `--ht-shadow-drawer-closed` comment (fixed: reworded). Never write `--ht-x:` inside a CSS comment; never put a `;` in a
  comment on a token line.
- **Token names ending `-accent-rgb`, `-fg-rgb`, `-points-rgb`, `-countdown-rgb` are tested as TEXT colours on white
  (≥ 4.5:1).** A token meant as "text on a coloured fill" (white) must not end that way — hence `pickem-on-fill`, not
  `…-on-accent`. Same reason Phase 4 named it `on-fill`.
- **`bg-white/12` was a dead class** (12 is not on Tailwind's opacity scale), so the unused Pick Tracker segments draw
  nothing in dark; the token `seg-empty` is `transparent` in dark and `#e2e6ed` in light. Don't "fix" dark.
- **`.tp-clean-button` forces `border: 1px solid var(--ht-border-soft) !important`** (global rule), so each ticket half (a
  `tp-clean-button`) shows a hairline border: in light the two halves read as a faint grid. The mockup has none. Left as
  is (same decision as Phase 4's tabs); fixing it means touching the global rule — do not without a reason.
- **`GameLandingExperience`'s fixed backdrop (`playingBackgroundClassName`) only covers the viewport**, and
  `components/ui/AppShell.tsx` painted `bg-slate-950` under it for game screens → a black strip below the content in
  light. Fixed (`bg-ht-canvas`); `tests/category-blitz-mobile-shell-contract.test.ts` pins that string and was updated.
  Fantasy uses the same shell, so this already helps Phase 6. Look for other hard-coded `bg-slate-950`/`#020617` page
  backgrounds in Fantasy's own wrapper.
- **The Pick 'Em / NFL page scrolls inside an inner container**, so a full-page screenshot only shows the first ~1,000 px.
  The harness now has `scrollTo(fraction)` / `scrollToBottom` helpers and shots `…-mid`, `…-bottom`, `…-expanded`.
- Locked/disabled tickets are dimmed with `opacity-50` (existing behaviour) — in light, that dims the team text below 4.5:1.
  Accepted (disabled state), same as dark.
- The ad placeholder frame in the harness ("072 AD PLACEHOLDER … adinfo@hightopchallenge.com") overflows a little at 350 px
  in both themes; not part of this work.
- `python3` here has no Pillow (harness uses `sharp`). `sed -i` on macOS needs `-i ''` — use Python for edits.
- zsh does not word-split an unquoted `$VAR` holding several file names; pass them literally or use an array.

### 6. Files, how they fit, and how to run

- `components/pickem/PickEmGameList.tsx`: header card, tracker (`tracker-bg/head`, `seg-empty`), day bar (`pickem-bar-*`,
  `chip-fill`), sport buttons, notices, history list, tickets, the in-file `<style>` keyframe (`sport-pop` ring uses
  `--ht-pickem-accent-rgb`), the pop-up animations' inline styles.
- `components/nfl-pickem/*`: same tokens; `WeekSelector` (Dropdown), `WeeklySummary` (`summary-bg`, labels), `NFLGameCard`
  (ticket), `NFLPickEmLeaderboard`, `NFLTiebreakerCard`, `NFLPickEmRewardBanner`.
- **Harness (`scripts/theme-screenshots*.cjs`):** `fixtureFor(method, pathname, searchParams, scenario)`; a shot's `scenario`
  picks a fixture variant: `pickem-settled` (NHL: live/won/lost/push/locked/open), `pickem-limit` (10 picks today),
  `pickem-history` (a past day, 4 picks), `nfl-full` (Thursday/Sunday finals, a tie, a live game, spreads banner, prize
  banner, tiebreaker, leaderboard). New shots: `pickem-settled`, `pickem-settled-bottom`, `pickem-limit`, `pickem-history`,
  `nfl-pickem-full`, `-full-mid`, `-full-bottom`, `nfl-pickem-expanded`. **For Phase 6 add Fantasy scenarios the same way
  (a live "My Sweat" entry, the leaderboard tab, a final entry, geofence/error banners) and capture their dark baseline
  from a pre-conversion build BEFORE editing `FantasyHome.tsx`** — exactly what this phase did.
- **Recipe** (never against :3000; scratchpad clone, no `.env*`):

```bash
SP=<scratchpad>
rsync -a --exclude /node_modules --exclude /.next --exclude /.git --exclude '/.env*' --exclude /native \
  --exclude /docs --exclude /design-system --exclude /tmp --exclude /tests ./ $SP/cand/
cp -Rc node_modules $SP/cand/node_modules
cd $SP/cand && env -u SUPABASE_SERVICE_ROLE_KEY -u NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_LIGHT_THEME_ENABLED=true npx next build --webpack
env -u SUPABASE_SERVICE_ROLE_KEY -u NEXT_PUBLIC_SUPABASE_URL nohup npx next start -p 3102 > ../srv.log 2>&1 & echo $! > ../srv.pid
cd <repo> && node scripts/theme-screenshots.cjs capture --url http://localhost:3102 --out $SP/after-dark --theme dark --group all
node scripts/theme-screenshots.cjs compare <baselineDir> $SP/after-dark --noise 1      # dark must be all SAME
node scripts/theme-screenshots.cjs capture --url http://localhost:3102 --out $SP/after-light --theme light   # then LOOK at them
kill $(cat $SP/srv.pid); lsof -ti :3102     # kill only your own PID; the port must be empty
```
  A build takes ~40 s; a capture of 10 shots × 2 widths ~40 s. Build the **baseline** from a clone made BEFORE you edit.
  One build with the flag on serves both: dark (no stored preference) must equal the baseline, light via `--theme light`.
- **Class-pair check (dark equivalence for states screenshots can't reach):** add `P(old, new)` pairs to
  `scripts/theme-pairs/make-pairs.cjs` (Phase 5's 56 pairs are the example; compare now also checks `textShadow` and
  `filter`), then `node scripts/theme-pairs/make-pairs.cjs $SP/pairs && npx tailwindcss -c tailwind.config.ts -i
  app/globals.css -o $SP/pairs/pairs.css --content $SP/pairs/pairs.html && node scripts/theme-pairs/compare-pairs.cjs $SP/pairs`.
- **"Every class compiled" check:** compile the changed files with `npx tailwindcss … --content <comma list>` and confirm
  every `ht-…` class appears in the output (a token with no entry in `tailwind.config.ts` silently does nothing).
- Main-tree gates run this phase: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` **429 files / 5,256 pass,
  13 skipped**; `npm run test:pwa-contract` 20/20; `npm run test:bingo-nfl` 23 files / 294 pass. The full `next build`
  was run in the scratchpad clone (flag on), not in the main tree; the route table was not diffed this phase.

### 7. What was verified, and what is not

Verified: dark identical (10 Phase-5 shots + the 15 original shots, 50 pictures, `--noise 1`); light viewed at 390 and 350
for all 10 Phase-5 shots; other games identical to dark with Light chosen; 115/116 class pairs identical + 1 expected;
every new `ht-` class compiles; typecheck/lint/tests above.
**Unverified:** real phones (Phase 8); light states the harness can't reach: the NFL "weeks not available" notice, the
"Browse only" chip, the pick-submit message/error boxes, a won leaderboard row with a prize trophy, the "Saved!" button,
the "Season" leaderboard tab, a Thursday-night preview week; the multiplier pop-up ("Double Points!") halo in light;
the final `warn-note` token (added after the last build; pair-checked in dark only).

### 8. Open questions for Andrew

None blocking. §6 defaults still apply (Q2 light tickets taken; Q3 chalkboard next). Phase 5 commit awaits his say-so.

### 9. Recommended first steps for Phase 6 (Opus 5.5, high)

1. Read plan §2.1–2.2, §5; this file §5–§6; the two Fantasy mockups; `components/fantasy/FantasyHome.tsx` top to bottom
   (it is long: list its colour literals with `grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(|(text|bg|border|ring|from|via|to)-(white|black|slate|amber|emerald|rose|red|cyan|sky|indigo|yellow|green)"`).
2. Add Fantasy fixtures/scenarios to the harness (live entry, final entry, leaderboard tab, banners), build a clone of the
   CURRENT tree, capture a dark baseline, then convert.
3. Reuse existing tokens where the dark hex matches (`fantasy-accent` dark `#fef3c7`, `fantasy-points` dark `#fde68a`,
   `fantasy-title`, `success-fg`, `danger-fg`, `ticket-*` are Pick 'Em only); otherwise add a token to BOTH CSS files +
   `tailwind.config.ts` (dark = the exact literal) and a pair to the pair check. Watch the two traps in §5 (comments with
   `--ht-x:`; names ending `-accent-rgb`).
4. Chalkboard scoreboard stays dark green in both themes (Q3 default); its inner text tokens must not flip.
5. Diff dark (all shots), view light at 390 and 350; run `npx tsc --noEmit`, `npm run lint`, `npm run test`,
   `npm run test:pwa-contract`; write `light-theme-plan_PHASE_6_HANDOFF.md`; update the plan's status line.

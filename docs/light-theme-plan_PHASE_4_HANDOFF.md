# Light Theme Plan — Phase 4 Handoff (Venue Home)

**Date:** 2026-10-22 · **Plan:** `docs/light-theme-plan.md` · **Previous:** `docs/light-theme-plan_PHASE_3_HANDOFF.md`

## For Andrew (plain English)

- **What changed:** every colour on the Venue Home screen (header, Games / Leaderboard / Prizes tabs, the
  Live Trivia countdown card, the leaderboard table and its drop-downs, the prize cards, the prize pop-up,
  and the profile card at the top of the side menu) now comes from a *named* colour with a dark value
  (exactly today's) and a light value. The coloured game tiles keep their colours.
- **Did anything change on screen?** Not in Dark. I compared 15 screens at two phone widths, before vs after,
  pixel by pixel: all 30 identical. For states those screens can't reach (an error notice, a pulsing
  "Enter lobby" button, a won prize, the pop-up) I compared the old colour rules against the new ones in
  Dark by computer: 59 of 60 identical; the one difference is on purpose (see "Decisions").
- **With Light switched on (test build only):** Venue Home looks like the approved mockups: white header with
  teal venue name, grey-white page, white cards, teal active tab, amber countdown on white, gold/silver/bronze
  rank pills, a light-teal "You" row, white prize cards with a green "You won" chip. I looked at the Games,
  Leaderboard (and its open drop-down), Prizes, prize pop-up, alerts list and side menu, at 390 and 350 px.
- **Is it live?** No. Nothing is committed, pushed or deployed; the switch (`NEXT_PUBLIC_LIGHT_THEME_ENABLED`)
  is still off everywhere. Phases 2–4 are all uncommitted. Say the word to commit them (your own
  POS / CLAUDE.md changes stay out of it).
- **Two things I found that you may care about (no action needed):**
  1. In Dark today, **your own row on the leaderboard is not highlighted** — the code asks for a faint amber
     tint but it never actually draws (a typo-level bug in the colour name). I kept Dark exactly as is. In
     Light the row is tinted light teal as the mockup shows. If you want Dark to highlight it too, that's a
     one-line change and a visible Dark change — your call.
  2. The side menu, when closed, still casts a soft shadow onto the left edge of the screen in Dark (hidden
     by the dark page). In Light that showed as a grey band, so I switched it off for Light only.
- **Mockup pictures:** you asked to download last phase's mockups as PNGs. They're copied to
  `~/Downloads/hightop-light-theme-mockups/` — `framed/` (screen in a phone on a dark brand background,
  room for captions) and `fullscreen/` (edge to edge), 7 screens each, 1080 × 1920. The originals live in
  `docs/light-theme-mockups/social-9x16/`. They are drawings from the approved mockups, not screenshots of
  the live app.
- **What needs you:** nothing blocking.

## For the next agent (Phase 5 — Pick 'Em + NFL Pick 'Em)

### 1. Goal and scope

Phase 5 (plan §4, Sonnet 5.5, **high**): convert `components/pickem/*` (`PickEmGameList.tsx` incl. its in-file
`<style>` keyframes and the pop/limit/multiplier animations — `#fde68a` multiplier text and gold glow are
invisible on white, give them a token), `PickEmRecentPicks`, `PointsBank`, `PickEmSportSelect`,
`PickEmCollectAnimation`; `components/nfl-pickem/*` (`NFLGameCard`, `NFLPickEmGameList`,
`NFLPickEmLeaderboard`, `NFLPickEmRewardBanner`, `NFLTiebreakerCard`, `WeekSelector`, `WeeklySummary`).
Ticket = "light" per plan §2.2 / §6 Q2 default. `app/pickem/page.tsx` and `app/nfl-pickem/page.tsx` pass
`playingBackgroundClassName="bg-[#020617]"` → make it `bg-ht-canvas`. Check `.tp-pickem-compact` in
`app/globals.css`. Run `npm run test:bingo-nfl`. **Out of scope:** Fantasy (6), Appearance row /
`theme-color` / native status bar / turning the flag on (7), anything on Venue Home (done).

### 2. Starting state

- Branch `main`, last commit `42f0906`. **Phases 2, 3 and 4 are all uncommitted** (Andrew hasn't asked).
- Phase 4 files modified: `app/globals.css`, `design-system/hightop-challenge-design-system/project/colors_and_type.css`,
  `tailwind.config.ts`, `components/venue/VenueHubHeaderBar.tsx`, `VenueGamesPanel.tsx`,
  `VenueLeaderboardPanel.tsx`, `VenueChallengesPanel.tsx`, `RewardProgressGauge.tsx`, `VenueHubClient.tsx`,
  `components/leaderboard/LeaderboardTable.tsx`, `components/navigation/AccountDrawer.tsx`,
  `app/venue/[venueId]/loading.tsx`. New: `scripts/theme-pairs/{make-pairs,compare-pairs}.cjs`; modified
  `scripts/theme-screenshots.cjs` (3 new shots); this file; plan status line.
- Andrew's own uncommitted work (never stage / revert / `git checkout --`): `CLAUDE.md`,
  `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, the 7
  deleted `design-system/project/public/info/*.png`, untracked `design-system/project/public/info/New Folder
  With Items/`. Never `git add -A`.
- No database, Vercel env var or deploy change. Flag not set anywhere.
- Dark baseline unchanged and still the reference:
  `~/Library/Caches/hightop-light-theme/baseline-dark-42f0906/` (30 PNGs); route table
  `~/Library/Caches/hightop-light-theme/route-table-42f0906.txt`.
- The three new harness shots (`venue-leaderboard-menu`, `venue-prize-detail`, `venue-alerts`) are NOT in that
  baseline (compare ignores files the baseline lacks). Their dark/light were judged by eye.

### 3. Decisions made in this phase

- **Tinted translucent backgrounds were left as literals where they read on both themes** (e.g.
  `bg-amber-500/10` warning boxes, the "Upcoming" / "In Progress" chip fills, `bg-black/45` scrim). Only
  TEXT, edges that vanish on white, solid dark surfaces and shadows became tokens. Same judgement is fine in
  Phases 5–6; a tint that goes muddy on white (e.g. `bg-rose-900/30`) needs a token.
- **Prize cards keep their per-game thin border** (`CHALLENGE_ICON_STYLE[...].cardAccent`, inline) in both
  themes; the card is white with `shadow-ht-panel` (a soft card shadow in light, invisible in dark). The won
  card gets a green edge in light via `--ht-prize-won-edge`.
- **Claim pill unified (the one accepted dark difference):** the two "Prize won! Tap to claim it." pills
  (ranked-places card and points card) used slightly different amber alphas; both now use `--ht-claim-*`
  (amber-400 12% / 35%). The ranked pill changes by ≤2/255 levels in dark. Pinned in the pair check as an
  *expected* difference.
- **Leaderboard heading row** got its own token pair (`--ht-table-head` #b45309 on `--ht-table-head-bg`
  #f3f5fa, 4.6:1) because #b45309 fails 4.5:1 on the grey `--ht-elevated` the row used (4.26:1). Dark values
  = today's (#f59e0b on #1e293b).
- **"You" row:** dark `--ht-you-row` = `transparent` (today's `bg-amber-500/12` is a dead class — 12 is not on
  Tailwind's opacity scale — so no tint ever rendered); light = `#ecfeff` (mockup).
- **Closed drawer shadow:** `AccountDrawer` now uses `shadow-ht-modal` only while open and
  `shadow-ht-drawer-closed` when closed (dark value = the modal shadow, i.e. unchanged; light = none).
- Tile text, tile LIVE chip, badge counts and `ChallengeIconBadge` / `TrophyGlyph` stay as literals: they sit on
  coloured artwork, not on the page.

### 4. New tokens (Phase 4) — both CSS files, `:root` (dark = today's literal) + `:root[data-theme="light"]`, and `tailwind.config.ts`

Channel tokens (`text-ht-x`, `border-ht-x/60`, …; `-rgb` triples): `on-fill` (text on a filled accent tab),
`accent-soft`, `accent-pale`, `countdown-soft`, `countdown-edge`, `danger-soft`, `danger-ring`, `success-soft`,
`warn-fg`, `warn-edge`, `gold-fg`, `skeleton`, `skeleton-bg`.
Whole-colour tokens (never take a `/NN` modifier): `hub-bar`, `tab-track`, `tab-track-edge`, `tab-idle`,
`panel-soft`, `edge-mid`, `menu-bg`, `panel-edge`, `you-row`, `rank-{1,2,3}-{bg,edge,fg}`, `table-head`,
`table-head-bg`, `fg-bright` (pure white body text in dark / #0f172a), `prize-card-bg`, `prize-won-bg`,
`prize-won-edge`, `chip-won-{bg,edge,fg}`, `chip-neutral-{bg,edge}`, `claim-{bg,edge}`, `note-{bg,edge}`,
`danger-wash`, `danger-wash-strong`, `success-wash`. Shadows: `ht-tile`, `ht-popup`, `ht-loader`, `ht-panel`,
`ht-tab-track`, `ht-drawer-closed`; light override of the existing `--ht-shadow-glow-cyan`. Plus Tailwind
name `field-border` (the token existed, the Tailwind name did not — see traps). Exact values: read the
"Venue Home (Phase 4)" blocks in `app/globals.css`.

### 5. Facts and traps

- **More dead classes (don't "fix", they are dark pixels):** `bg-amber-500/12`; the earlier `bg-ht-elevated/40`,
  `/50`, `/60`. Tailwind 3 emits nothing for an opacity not on its scale or for `/NN` on a plain `var()`
  colour. A converted token must reproduce *nothing* in dark (use `transparent`) — otherwise the dark diff
  flags it (it did, on the leaderboard "You" row).
- **A CSS token with no Tailwind name silently does nothing as a class.** `border-ht-field-border` produced the
  default grey border until `field-border` was added to `tailwind.config.ts`. After converting, grep your classes
  against the built CSS (recipe in §6) and run the pair check.
- **`.tp-clean-button` / global `button` rules put `border: 1px solid var(--ht-border-soft) !important` on
  buttons**, so an unselected hub tab shows a hairline outline in light that the mockup doesn't. Left as is
  (readable). Changing it means touching the global rule — do not, without a reason.
- Bell button is still a grey square in light (Phase 3 decision); NFL's `barGradient` starts pale gold, so on
  the light grey gauge track only its saturated end reads — acceptable, flagged for the phone pass.
- The Pick 'Em/NFL/Fantasy screens still have dark bodies in light (they pass `bg-[#020617]` / own greens) —
  expected until Phases 5–6; Venue Home is fully light now.
- `python3` here has no Pillow (harness uses `sharp`). A bash heredoc without a quoted delimiter expands
  backticks and `${}` — quote it (`<<'EOF'`) when writing JS/TS with those characters.
- Harness fixtures already include a won prize (`$20.00 gift card`, You won) and a points prize (`Appetizer`).

### 6. Build, run, test — what was verified

Main tree: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` **429 files / 5,256 pass, 13 skipped**
(light-theme contract incl. "both CSS files' light blocks equal" and the 4.5:1 text check passes);
`npm run test:pwa-contract` 20/20.

Screenshot diff (recipe in the Phase 2 handoff §6; clone at `$SP/cand`, port 3102, own PID killed afterwards,
`lsof -ti :3102` empty):
- Flag off vs baseline: **30/30 identical** (`--noise 1`). Flag on, no preference: **30/30 identical**.
- Route table of the flag-on build identical to `route-table-42f0906.txt`.
- Flag on + Light, `--group all`: games, trivia, trivia-live, bingo, category-blitz, activity, redeem-prizes
  identical to dark (only the in-scope screens change).
- **Old-vs-new class pair check** (new, reusable): `scripts/theme-pairs/` — 60 pairs, dark computed style
  identical for 59, 1 expected (claim pill). Recipe is in `make-pairs.cjs`'s header. Use it for Phases 5–6:
  put each `old → new` replacement in `pairs`, run it, and it covers states the screenshots can't reach.
- Every `…-ht-…` class in the 8 changed files was checked against the built CSS: only inline-style `var(--…)`
  names and the known dead classes are "missing".
- Light shots viewed (390 and 350): games, leaderboard (+ timeframe menu open), prizes, prize pop-up, alerts,
  menu.

**Unverified:** real phones (Phase 8); light states the harness can't reach — the leaderboard *game*
drop-down open, retry/error boxes, loading skeleton, the pulsing "Enter lobby" button, "Upcoming" / "All
Claimed" / "Week Complete" chips, the ranked-places prize card, passkey notices, the Category Blitz LIVE tile
chip, the bell list *with* alerts. They are code-checked and (for dark) pair-checked only.

### 7. Open questions for Andrew

None blocking. §6 defaults still apply. Optional: should Dark also highlight the viewer's own leaderboard row
(see "For Andrew", item 1)? Default: no, keep Dark as is.

### 8. Recommended first steps for Phase 5 (Sonnet 5.5, high)

1. Read plan §2.1–2.2, §5; this file §3–§5; `docs/light-theme-mockups/PickEm.dc.html` and `NFLPickEm.dc.html`
   (inline styles = light values), and the light `pickem` / `nfl-pickem` shots in a fresh capture.
2. Confirm the baseline (`ls ~/Library/Caches/hightop-light-theme/baseline-dark-42f0906 | wc -l` → 30). The
   `pickem` / `nfl-pickem` baselines are empty-ish (no games in fixtures): **add fixtures for games, picks and
   a won state first**, capture a dark baseline from the *pre-conversion* build (current tree, before any
   Phase 5 edit), then convert.
3. Convert one file at a time; reuse existing tokens where the dark hex matches exactly, else add a token to
   BOTH CSS files + `tailwind.config.ts` (dark = exact literal). Add each replacement to the pair check.
4. Diff dark (all shots), view light; run `npm run test`, `npm run test:bingo-nfl`, `npm run test:pwa-contract`.
5. Write `light-theme-plan_PHASE_5_HANDOFF.md`, update the plan status line.

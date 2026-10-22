# Light Theme Plan — Phase 3 Handoff (shared chrome)

**Date:** 2026-10-22 · **Plan:** `docs/light-theme-plan.md` · **Previous:** `docs/light-theme-plan_PHASE_2_HANDOFF.md`

## For Andrew (plain English)

- **What changed:** the parts every game shares — the top bar, the round Back button, the points pill, the
  alerts bell and its list, the Fantasy "My Sweat / Leaderboard" tabs, the drop-down menus, the side menu
  and its Sign Out row, the form fields and the ad placeholder — now take their colours from named colours
  that have a dark value (exactly today's) and a light value.
- **Did anything change on screen?** No. Same check as Phase 2: 15 screens at two phone widths, before vs
  after, pixel by pixel — all 30 identical, including Bingo, Live Trivia, Speed Trivia and Category Blitz.
- **With Light switched on (test build only):** the top bar turns white with a white Back circle, "PICK 'EM"
  in navy, "FANTASY" in green, and a cream points pill; the side menu turns white. The screens' own content
  is still dark until Phases 4–6, so a light page today is half-converted — expected.
- **Is it live?** No. Nothing committed, pushed or deployed; the switch (`NEXT_PUBLIC_LIGHT_THEME_ENABLED`)
  is still off everywhere.
- **Also made for you:** 9:16 (1080 × 1920) pictures of all seven light-theme screens for a social video, in
  `docs/light-theme-mockups/social-9x16/` — `framed/` (the screen in a phone on a dark brand background,
  room above and below for captions) and `fullscreen/` (the screen edge to edge). They are drawings from
  the approved mockups, not screenshots of the live app. Re-make them with
  `node scripts/render-social-mockups.cjs`.
- **What needs you:** nothing. Say the word to commit Phases 2–3 (your own uncommitted POS/CLAUDE.md
  changes stay out of it).

## For the next agent (Phase 4 — Venue Home)

### 1. Goal and scope

Phase 4 (plan §4, Sonnet 5.5, **high**): Venue Home to tokens + light values — `VenueHubHeaderBar`,
`VenueGamesPanel`, `VenueLeaderboardPanel`, `LeaderboardTable` (its other hosts must stay dark — they do
automatically, but diff them), `VenueChallengesPanel`, `RewardProgressGauge`, `ChallengeIconBadge`, the
prize pop-up and **the venue hub's drawer contents** in `VenueHubClient.tsx` (the profile/points card at the
top of the menu is still cyan/amber literals — see the light `venue-menu` shot), the arrival skeleton,
`venueHubShared.tsx`. Tiles keep their colours. **Out of scope:** Pick 'Em/NFL (5), Fantasy (6), Appearance
row / theme-color / native status bar / turning the flag on (7).

### 2. Starting state

- Branch `main`, last commit `42f0906`. **Phases 2 and 3 are uncommitted** (Andrew hasn't asked).
- Phase 3 files (modified): `app/globals.css`, `design-system/hightop-challenge-design-system/project/colors_and_type.css`,
  `tailwind.config.ts`, `components/venue/AppBar.tsx`, `components/venue/GameChrome.tsx`,
  `components/navigation/ExitBackButton.tsx`, `components/navigation/AccountMenuList.tsx`,
  `components/navigation/SignOutButton.tsx`, `components/ui/PointsPill.tsx`, `components/ui/NotificationBell.tsx`,
  `components/ui/Dropdown.tsx`, `components/ui/InlineSlotAdClient.tsx`, `docs/light-theme-plan.md` (status
  line). New: this file, `scripts/render-social-mockups.cjs`, `docs/light-theme-mockups/social-9x16/`
  (14 PNGs, 5.7 MB — Andrew's ad material; ask before committing, it's binary weight in git).
- Phase 2's files and Andrew's own uncommitted work: see the Phase 2 handoff §2. Never `git add -A`, never
  `git checkout --` anything.
- No database, env var or deploy change. Dark baseline unchanged:
  `~/Library/Caches/hightop-light-theme/baseline-dark-42f0906/` (30 PNGs).

### 3. Decisions made in this phase

- **Only the light-capable games' app-bar names are tokens.** `GameAppBar` `accentText`: Pick 'Em and NFL
  Pick 'Em → `text-ht-pickem-accent`; Fantasy → `text-ht-fantasy-title` (new; dark amber-200, light
  `#0F5C4A` per the mockups). Bingo/Squares/Bracket keep literals (they are never light).
- **`ht-overlay` is the "white/N" replacement:** `--ht-overlay-rgb` is white in dark and slate-900 in light,
  so `border-white/[0.08]` → `border-ht-overlay/[0.08]` lifts on dark and darkens on light. Use it for any
  white-alpha hairline/tint you convert.
- **Back circle:** `border-ht-overlay/10 bg-ht-surface text-ht-fg-soft hover:text-ht-overlay` = exactly
  white/10, slate-900, slate-300, white in dark; white circle, slate chevron in light. Still neutral, never
  tinted per game. The `tone="light"` variant (owner pages) is unchanged.
- **The bell button keeps `bg-ht-elevated`** (grey square in light, the mockup drew a white circle) — kept
  as-is to stay pixel-identical and not reshape a shared control. Its drop-down list is fully tokenised.
- **ViewTabs (Fantasy branch)** uses `ht-fantasy-title` tints — light = green-tinted track and active tab,
  not the mockup's white segmented control; Phase 6 may restyle if Andrew wants the mockup exactly. Bingo's
  branch is untouched.
- **`--ht-points-fg-rgb` dark value corrected** from `#fbbf24` to `#fcd34d` (amber-300) — the pill's real
  text colour. Nothing used the token before this phase.
- **`--ht-shadow-modal` got a light value** (soft slate shadow) — drawer, dropdowns, bell list.
- **Not converted (deliberately):** `components/ui/AccountMenu.tsx` (hamburger menu's username modal) —
  it only renders through `LeftHamburgerMenu`/`PageShell`, and none of the four light screens use those
  (they use `GameAppBar`; the hub has its own drawer). `HightopLoader` card and `ButtonSpinner` needed no
  change (already tokens / `currentColor`). `GameMark` tiles are artwork (unchanged).

### 4. New tokens (both CSS files' `:root` + light block, `tailwind.config.ts` `colors.ht`)

| Token (Tailwind name) | Dark (= today) | Light |
|---|---|---|
| `--ht-overlay-rgb` (`ht-overlay`) | 255 255 255 | 15 23 42 |
| `--ht-accent-rgb` (`ht-accent`) | cyan-400 | `#0e7490` |
| `--ht-fantasy-title-rgb` (`ht-fantasy-title`) | amber-200 | `#0f5c4a` |
| `--ht-gain-fg-rgb` / `--ht-loss-fg-rgb` | emerald-400 / rose-400 | `#047857` / `#be123c` |
| `--ht-points-pill-edge-rgb` | amber-400 | `#b45309` |
| `--ht-chrome-bar` | slate-950/86 | white/94 |
| `--ht-popover` | `#111827` | `#ffffff` |
| `--ht-row-hover` | slate-800/60 | `#f1f5f9` |
| `--ht-fg-strong` / `-soft` / `-faint` | slate-100 / 300 / 500 | `#0f172a` / `#334155` / `#5b6b82` |
| `--ht-field-border` | slate-700 | `#cbd5e1` |
| `--ht-points-pill-bg` / `-flash-bg` / `--ht-points-flash-fg` | amber-500/15, amber-400/25, amber-200 | `#fffbeb`, `#fef3c7`, `#78350f` |
| `--ht-ad-label` | indigo-300 | `#4338ca` |

Global form rules (`app/globals.css`, the `:where(:not(.ht-light-surface *))` block, scoping untouched):
button/`.tp-clean-button` border → `var(--ht-border-soft)`; input/select/textarea border →
`var(--ht-field-border)`; focus → `rgb(var(--ht-accent-rgb))` + ring at `/0.18`. `.admin-select-bordered`
and the owner autofill rule left alone (admin/owner never light).

### 5. Facts and traps

- Dark-identity relies on exact matches: e.g. `divide-slate-800` → `divide-ht-elevated` works only because
  `--ht-elevated` dark is `#1e293b` = slate-800; `text-slate-400` → `text-ht-fg-muted` (`#94a3b8`);
  `text-rose-300` → `text-ht-danger-fg`; `text-emerald-300` → `text-ht-success-fg`. Check the hex before
  mapping to an existing token; otherwise add a token.
- An arbitrary shadow can take a token: `shadow-[inset_0_0_0_1px_rgb(var(--ht-success-fg-rgb)/0.5)]`
  renders identically to the old `rgba(110,231,183,0.5)`.
- The light screens still have dark bodies (Pick 'Em/NFL pass `bg-[#020617]`, Fantasy its own green), so a
  light app bar sits over a dark page until Phases 5–6. Expected.
- `python3` here has no Pillow; the harness uses `sharp` (Node) for image work.
- A `cat > file` with no heredoc waits on stdin and hangs the shell call — use the Write tool for scripts.

### 6. Build, run, test — what was verified

Main tree: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` **429 files / 5,256 pass, 13
skipped**; `npm run test:pwa-contract` 20/20; light-theme contract 12/12, navigation contract 7/7, account
drawer 6/6, text-size floor pass.

Screenshot diff (recipe in the Phase 2 handoff §6, clone at port 3102, own PID killed afterwards):
- Flag off vs baseline: **30/30 identical** (`--noise 1`), run twice (before and after the Sign Out fix).
- Route table identical to `route-table-42f0906.txt`.
- Flag on + Light, `--group all`: only the in-scope shots differ (venue games/leaderboard/prizes/menu,
  pickem, predictions→pickem, nfl-pickem, fantasy, fantasy-draft); bingo, trivia, trivia-live,
  category-blitz, activity, redeem-prizes identical to dark. Light shots viewed: white app bar, white Back,
  navy/green game names, cream points pill, white drawer with readable Sign Out.

**Unverified:** the bell's open list, a Dropdown open, and form focus in light (no harness shot opens them —
code-checked only); real phones (Phase 8).

### 7. Open questions for Andrew

None blocking. §6 defaults still apply.

### 8. Recommended first steps for Phase 4 (Sonnet 5.5, high)

1. Read plan §2.1–2.2, §5, this file §3–§5; `docs/light-theme-mockups/Main.dc.html`,
   `VenueLeaderboard.dc.html`, `VenuePrizes.dc.html` (inline styles = light values).
2. Confirm the baseline (30 PNGs). Convert one component at a time; reuse Phase 2–3 tokens where the dark
   hex matches exactly, else add a token to both CSS files + Tailwind.
3. Start with the hub drawer's profile card and header bar (visible in the light `venue-menu` /
   `venue-games` shots), then the panels.
4. Diff dark (all 30) + light; check `LeaderboardTable`'s other hosts stay dark.
5. Write `light-theme-plan_PHASE_4_HANDOFF.md`, update the plan status line.

# Light Theme for Venue Home, Pick 'Em, NFL Pick 'Em and Fantasy — Plan

**Status (2026-10-22):** Phases 1–4 done and **committed (`155bbb7`)**; Phases 5 (Pick 'Em + NFL Pick 'Em), 6
(Fantasy) and 7 (Appearance row, `theme-color`, app status bar, rollout runbook) done, **not committed**. Flag off
everywhere: no visible change. Next: Phase 8 (review, phone checklist, docs). Latest handoff:
`docs/light-theme-plan_PHASE_7_HANDOFF.md`. 9:16 social-video stills of the mockups:
`docs/light-theme-mockups/social-9x16/` (`node scripts/render-social-mockups.cjs`; copied to
`~/Downloads/hightop-light-theme-mockups/` on Andrew's request).
Handoffs go next to this file as `light-theme-plan_PHASE_<N>_HANDOFF.md`; update this line to point at
the latest one.

## 0. Summary for Andrew

Today every player screen is dark. This plan adds a **light version** of four screens:

- **Venue Home** (all three tabs: Games, Leaderboard, Prizes, plus the menu drawer and the prize pop-up)
- **Pick 'Em** (`/pickem`)
- **NFL Pick 'Em** (`/nfl-pickem`)
- **Fantasy** (`/fantasy`: building a roster, the live "My Sweat" view and its Leaderboard tab)

**Mockups:** https://claude.ai/artifact/BNXMakciHHcji3VyazXnYk (private to you). One board per screen
plus a board with the light colour set. Two boards have a **Tweaks** switch to compare options: Pick 'Em
/ NFL Pick 'Em ("light" or "classic" game tickets) and Fantasy My Sweat ("chalkboard" or "light"
scoreboard). The mockups were drawn from the real code, but they're drawings, not the app itself.

**How it works for players (recommended, see §6 Q1):** a new **Appearance** row in the player menu:
*Dark* / *Light* / *Match my phone*. Everyone starts on Dark, so nothing changes for anyone until they
pick Light, or until you decide to make Light (or "Match my phone") the default. Games outside these four
(Live Trivia, Speed Trivia, Bingo, Category Blitz, Squares, Bracket) stay dark either way.

**What changes on screen:** a soft grey-white page, white cards with a faint edge and shadow, near-black
text, and darker versions of each screen's accent colour so text stays readable. **What stays:** the
colourful game tiles on Venue Home, the prize gift card, the point pop-up animations' look, the TV screen.

**Your worry about text disappearing is handled two ways:**
1. Every colour in these screens is replaced by a *named* colour (for example "Pick 'Em accent") that has
   a dark value (exactly today's) and a light value. In dark mode nothing changes, and this is checked by
   comparing screenshots before and after, pixel for pixel.
2. Every light text colour passes the standard readability (WCAG AA contrast) bar on its background.
   The ratios are on the colour board.

**Cost:** zero recurring cost. The choice is saved on the player's phone (no database, no new requests);
the code that applies it before the page draws is a few hundred bytes.

**What needs you:** approve the mockups and answer §6 (each question has a default); later, the phone pass
in Phase 8.

---

## 1. Decisions already made (do not re-ask)

Andrew, 2026-10-22:

1. **Scope: four screens only** — Venue Home, Pick 'Em, NFL Pick 'Em, Fantasy (his words: "light-themed
   versions of the Venue Home Page, NFL Pick 'Em, Pick 'Em, and Fantasy pages").
2. **Mockups first, code only after he says "implement".** Phase 1 produced them; Phase 2 does not
   start until Andrew approves.
3. He was open to "light-themed instead of dark themed. Or maybe giving users a light/dark option" — the
   choice is §6 Q1 (default: an option, starting on Dark).
4. **2026-10-22: "Execute phase 2."** — taken as the go-ahead to implement (decision 2). He did not answer
   §6, so **every §6 default applies**: a Dark / Light / Match-my-phone choice starting on Dark; "light"
   Pick 'Em tickets; "chalkboard" Fantasy scoreboard; other games stay dark; tutorial cards unchanged;
   Venue Home tiles keep their colours. He can still overrule any of them before its phase.

Decisions by the plan (Andrew can overrule in §6):

4a. **Dark stays pixel-identical.** Converting a screen to named colours must not change a single dark
   pixel. Verified by before/after screenshot diffs (Phase 2 builds the harness).
5. **Venue Home game tiles keep their solid colours** in light (`VENUE_HUB_TILE_GRADIENT_BY_KEY`). They are
   the brightest, most recognisable thing on the screen and already read well on a light page.
6. **Out of scope:** the other games, `/owner/*` (Partner Dashboard has its own light sheets), `/admin`
   (already light), the TV display, the prize gift card (`PRIZE_CARD`), Redeem Prizes, Activity, the join
   flow, legal pages, emails, the game tutorial cards (`GameLandingExperience` / `GameIdentityPanel`, see
   §6 Q5).
7. **No service worker, no account column, no server read** for the preference (cost and the PWA rule in
   `CLAUDE.md`).

## 2. Design specification

The mockups are the visual reference. Their source files are copied to `docs/light-theme-mockups/`
(`*.dc.html`; images there point at the artifact's uploads, so open the artifact link to see them).

### 2.1 Light colour set (the single reference for Phases 2–6)

| Role | Token (proposed) | Dark (today) | Light | Contrast on white |
|---|---|---|---|---|
| Page | `--ht-canvas` | `#020617` | `#F3F5FA` | — |
| Card | `--ht-surface` | `#0f172a` | `#FFFFFF` | — |
| Inset / track | `--ht-elevated` | `#1e293b` | `#E8EDF4` | — |
| Deeper inset | `--ht-elevated-2` | `#334155` | `#E2E6ED` | — |
| Card edge | `--ht-border-hairline` | `rgba(255,255,255,.08)` | `rgba(15,23,42,.08)` | — |
| Control edge | `--ht-border-soft` | `rgba(255,255,255,.12)` | `rgba(15,23,42,.12)` | — |
| Strong edge | `--ht-border-strong` | `rgba(255,255,255,.20)` | `rgba(15,23,42,.18)` | — |
| Primary text | `--ht-fg-primary` | `#f8fafc` | `#0F172A` | 17.9 |
| Secondary text | `--ht-fg-secondary` | `#e2e8f0` | `#334155` | 10.4 |
| Muted text | `--ht-fg-muted` | `#94a3b8` | `#5B6B82` | 5.4 (4.97 on page) |
| Placeholder | `--ht-fg-dim` | `#64748b` | `#8492A6` | hints only |
| Card shadow | `--ht-shadow-card` (new) | as today | `0 1px 2px rgba(15,23,42,.05), 0 6px 16px rgba(15,23,42,.06)` | — |
| Venue accent text/fill | `--ht-venue-accent` (new) | `cyan-300` `#67e8f9` | `#0E7490` (white text on it 5.4) | 5.4 |
| Countdown amber | `--ht-countdown` (new) | `amber-200` | `#92400E`, label `#B45309` | 7.1 / 5.0 |
| Pick 'Em accent | `--ht-pickem-accent` (new) | `#fde68a` | `#1A2F72` | 12.4 |
| Pick 'Em "picked" tint | `--ht-pickem-picked` (new) | `rgba(253,230,138,.15)` | `#FEF3C7` | — |
| Fantasy accent | `--ht-fantasy-accent` (new) | `#fde68a` / `#fef3c7` | `#0F5C4A` | 7.9 |
| Fantasy points | `--ht-fantasy-points` (new) | `#fde68a` | `#A16207` | 4.9 |
| Correct / won | `--ht-success-fg` (new) | `emerald-300` | `#047857` on `#ECFDF5` | 5.5 |
| Wrong / error | `--ht-danger-fg` (new) | `rose-300` | `#BE123C` on `#FFF1F2` | 6.3 |
| Points pill | `--ht-points-fg` (new) | `#fbbf24` | `#92400E` on `#FFFBEB` | 7.1 |

Rules for anyone adding a colour: text ≥ 4.5:1 on its own background; never pale gold/cream/cyan-300 text
on white; never an accent difference by hue alone; keep the 12 px text floor (`lib/textSizeFloor.ts`).
Do not use cream (`#fff9f0`-ish) as the page — that is the retired "comic" look the brand README warns
against.

### 2.2 Per-screen notes

- **Venue Home:** header white at 94% with a hairline; venue name in venue accent; Games/Leaderboard/Prizes
  switch on an inset track with the active tab filled venue accent + white text. Live Trivia countdown card
  white with an amber edge. Leaderboard top-3 rank pills gold/silver/bronze tints; "You" row tinted cyan-50.
  Prize cards white; won prize = green edge + solid green Redeem button.
- **Pick 'Em / NFL Pick 'Em:** header card white, title in Pick 'Em navy. Pick tracker segments navy.
  Selected sport = navy chip. **Game ticket (§6 Q2), default "light":** white card, away half a faint navy
  tint (`#F5F7FD`), home half a faint magenta tint (`#FDF5F9`), picked half gold tint `#FEF3C7`, checkbox
  navy with a white ✓, solid hairline instead of the dashed rule. "Classic" keeps today's navy↔magenta
  ticket unchanged on the light page.
- **Fantasy:** controls on white; accent = deep green `#0F5C4A`; FP numbers gold `#A16207`; roster rows
  white. **Scoreboard (§6 Q3), default "chalkboard":** the big live-points card stays today's dark green
  chalkboard as the one focal point; "light" makes it a white card with green numbers.
- **Shared app bar (`GameAppBar`):** white at 94%, Back circle white with a slate chevron (still neutral,
  never tinted per game), game name in the screen's accent.

## 3. How it is built (architecture)

1. **Tokens, not per-component dark/light classes.** Every literal colour in the in-scope files becomes a
   CSS variable, defined in `app/globals.css` `:root` with **today's dark value**, and redefined under
   `:root[data-theme="light"]`. Tailwind gets names for them in `tailwind.config.ts` (`ht.*`, like the
   existing `ht-canvas`). A component writes `text-ht-pickem-accent`, never `text-[#fde68a]` and never a
   `light:` variant. Inline `style={{ color: "#fde68a" }}` (animations) becomes `var(--ht-…)`.
   Order of edits per `SYSTEM_CONTEXT.md` §10: `design-system/hightop-challenge-design-system/project/colors_and_type.css`
   first, then `app/globals.css` / `lib/themeTokens.ts` / `tailwind.config.ts`.
2. **One home for the theme: `lib/theme.ts`** (new, pure + a client part): the list of light-capable paths
   (`LIGHT_THEME_PATHS`: `/venue/[id]` hub only — not `/venue/[id]/redeem` or `/screen` —, `/pickem`,
   `/pickem/*`, `/nfl-pickem`, `/fantasy`, `/fantasy/*`), the preference read/write (localStorage key
   `htc_theme` = `dark` | `light` | `system`, every access in try/catch), the flag reader
   `isLightThemeEnabled()` for `NEXT_PUBLIC_LIGHT_THEME_ENABLED` (its only reader), and
   `resolveTheme(pref, path, prefersLight)`.
3. **Applied before first paint, without making pages dynamic.** A tiny inline `<script>` in
   `app/layout.tsx` `<head>` sets `document.documentElement.dataset.theme` from the stored preference +
   `location.pathname` (+ `matchMedia('(prefers-color-scheme: light)')` for "system"). `<html>` gets
   `suppressHydrationWarning`. **Never read `cookies()`/`headers()` in the root layout** — that turns every
   static page into a per-visit server render (cost and speed). A client `ThemeRouteSync` (in the root
   layout, `useLayoutEffect` on `usePathname()`) re-applies it on in-app navigation so moving from a light
   screen into Live Trivia goes dark before paint. It also updates `<meta name="theme-color">` and
   `color-scheme`.
4. **Flag-gated, same reversible convention as `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`:** off = the script and
   the Appearance row are inert and every page is dark. A `NEXT_PUBLIC_*` value is inlined at build time:
   env var, then redeploy.
5. **Global form CSS:** `app/globals.css` gives every `button`, `.tp-clean-button`, `input`, `select`,
   `textarea` a white-alpha border (`rgba(255,255,255,.12)`, `#334155`). Swap those literals for
   `var(--ht-border-soft)` etc. (dark values identical) so they flip too. Keep the existing
   `:where(:not(.ht-light-surface *))` scoping exactly as it is.
6. **Native app:** the status bar is a fixed dark navy strip (`@capacitor/status-bar`,
   `overlaysWebView: false`, Phase 2D). Phase 7 asks the shell to switch it to white with dark icons on a
   light screen, through `lib/nativeApp.ts` (`hasNativeCapability("StatusBar")` first — old app builds just
   keep the navy strip, which is acceptable). Do not flip `overlaysWebView`.

## 4. Phases

| Phase | What | Model | Effort |
|---|---|---|---|
| 1 | Mockups + this plan (**done**) | Opus 5.5 | high |
| 2 | Foundation: tokens, `lib/theme.ts`, pre-paint script, flag, screenshot-diff harness, brand docs (no visible change) | Opus 5.5 | high |
| 3 | Shared chrome to tokens (app bar, Back, points pill, bell, tabs, dropdown, loader card, drawer, global form CSS) | Opus 5.5 | medium |
| 4 | Venue Home to tokens + light values | Sonnet 5.5 | high |
| 5 | Pick 'Em + NFL Pick 'Em to tokens + light values | Sonnet 5.5 | high |
| 6 | Fantasy to tokens + light values | Opus 5.5 | high |
| 7 | Appearance setting, native status bar, `theme-color`, rollout switch (**done**) | Opus 5.5 | high |
| 8 | `/code-review` at high, fixes, phone checklist, docs | Opus 5.5 | high |

Why: Phases 2, 3 and 7 touch the root layout, every page's first paint, shared components used by every
game, and the native bridge — mistakes there show up everywhere, so Opus. Phases 4–5 are mechanical
colour swaps with a strict pixel-diff check and the mockups as the target, so Sonnet at high effort is
enough. Phase 6 is one 3,273-line component with many states (NBA/MLB drafting, edit roster, live, final,
geofence pause, leaderboard tab, collect animations), so Opus.

Every phase ends with a handoff note (`light-theme-plan_PHASE_<N>_HANDOFF.md`) per the global rules.

### Phase 2 — Foundation (no visible change)

- Add the light token values (§2.1) to `colors_and_type.css` (both copies under `design-system/` if both
  are live; check which one `SYSTEM_CONTEXT.md` names), `app/globals.css` (`:root[data-theme="light"]`,
  including `color-scheme: light`), `tailwind.config.ts`. New tokens get their dark value = today's exact
  literal.
- `lib/theme.ts` + the pre-paint script + `ThemeRouteSync` + flag reader. With the flag off nothing runs.
- **Screenshot-diff harness** (`scripts/theme-screenshots.cjs` or a Playwright spec, run from a scratchpad
  clone with **no `.env.local` and mocked API routes**, per the memory rule — never against Andrew's
  `next dev` on :3000, never `pkill next-server`): capture each in-scope screen in a fixed state at 390 ×
  844 and 350 px, dark and light, and compare dark to a baseline captured **before** any conversion.
  Capture the baseline in this phase.
- Update the brand rule that says "Every screen is dark-native; no light mode" (`SYSTEM_CONTEXT.md` §10,
  both design-system READMEs) to: dark is the default; four screens have a light version; tokens only.
- `tests/light-theme-contract.test.ts`: `lib/theme.ts` is the only reader of the flag and of `htc_theme`;
  `app/layout.tsx` does not import `cookies`/`headers`; every token in `:root[data-theme="light"]` also
  exists in `:root`.
- Checks: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:pwa-contract`, `npm run build`
  (build lists the same static pages as before — compare the route table).

### Phase 3 — Shared chrome

Convert to tokens (dark identical, light per mockups): `components/venue/AppBar.tsx` (`AppBar`,
`GameAppBar` — its `accentText` per game becomes a token), `components/navigation/ExitBackButton.tsx`
(neutral in both themes; light = white circle, slate chevron), the points pill, `NotificationBell`,
`ViewTabs`, `Dropdown`, `HightopLoader` `variant="card"`, `ButtonSpinner`, `AccountDrawer` +
`AccountMenuList`, `InlineSlotAdClient` placeholder frame, and the global form rules in `app/globals.css`.
These are used by every game: diff **all** game screens in dark, not only the four. Run
`npm run test` (navigation contract, account drawer, text-size floor) and `npm run test:pwa-contract`.

### Phase 4 — Venue Home

`components/venue/VenueHubHeaderBar.tsx`, `VenueGamesPanel.tsx`, `VenueLeaderboardPanel.tsx`,
`components/leaderboard/LeaderboardTable.tsx` (check its other hosts stay dark),
`VenueChallengesPanel.tsx`, `RewardProgressGauge.tsx`, `ChallengeIconBadge` and the prize pop-up + drawer
header in `VenueHubClient.tsx`, the arrival skeleton, `venueHubShared.tsx` styles. Tiles keep their colours
(decision 5). `CategoryBlitzOnboardingOverlay` and `VenueAccessOverlay` stay dark unless §6 says otherwise.
Run `npm run test:god-mode-join` only if the join flow is touched (it should not be).

### Phase 5 — Pick 'Em + NFL Pick 'Em

`components/pickem/*` (`PickEmGameList.tsx` incl. the in-file `<style>` keyframes and the pop/limit/
multiplier animations — `#fde68a` multiplier text and its gold glow are invisible on white, give them a
token), `PickEmRecentPicks`, `PointsBank`, `PickEmSportSelect`, `PickEmCollectAnimation`;
`components/nfl-pickem/*` (`NFLGameCard`, `NFLPickEmGameList`, `NFLPickEmLeaderboard`,
`NFLPickEmRewardBanner`, `NFLTiebreakerCard`, `WeekSelector`, `WeeklySummary`). The ticket is built once
for both games if they still share markup; follow §6 Q2. `app/pickem/page.tsx` and `app/nfl-pickem/page.tsx`
pass `playingBackgroundClassName="bg-[#020617]"` — make it `bg-ht-canvas`. Check `.tp-pickem-compact` rules
in `app/globals.css`. Run `npm run test:bingo-nfl` (NFL Pick 'Em shares types/settlement tests).

### Phase 6 — Fantasy

`components/fantasy/FantasyHome.tsx` (`ChalkGrid`, `PlayerHeadshot`, `SpringPop`, `BasketballLoader`,
stat flash toasts, full-screen stat pop, collect animation, control band, draft slots, MLB
pitcher/hitter sections, sort/filter, pool rows, bottom submit bar gradient `from-slate-950`, live
scoreboard, roster rows, leaderboard tab, geofence/status/error banners), `PointsLedger.tsx`,
`app/fantasy/page.tsx` and `app/fantasy/wnba/page.tsx` (check whether WNBA is in scope: it is under
`/fantasy/*`, so yes by default). Follow §6 Q3 for the scoreboard. Check `.tp-fantasy-compact` CSS.

### Phase 7 — Appearance setting, native, rollout

- **Appearance** row in `AccountMenuList` (player drawer): Dark / Light / Match my phone, writes through
  `lib/theme.ts`, applies instantly. Copy in one place. Shown only while the flag is on. Not in the native
  app's partner surfaces (there are none).
- `<meta name="theme-color">` follows the theme (navy on dark, `#F3F5FA`/white on light).
- Native status bar: add `"StatusBar"` to `NativeCapability` only if the shell exposes it (check
  `native/capacitor.config.json` and the plugin list in the Phase 3 native handoff); light screen → white
  bar, dark icons; dark → today's navy. Capability-checked; never a new app-store release requirement.
- Default theme for new visitors stays **Dark** unless Andrew answered Q1 otherwise (one constant in
  `lib/theme.ts`).
- Runbook lines: set `NEXT_PUBLIC_LIGHT_THEME_ENABLED=true` in Vercel Production, redeploy; reversal = unset
  + redeploy.

**As built (2026-10-22, handoff `light-theme-plan_PHASE_7_HANDOFF.md`):** `components/navigation/AppearancePicker.tsx`
(copy in `APPEARANCE_COPY`, `lib/theme.ts`), rendered by `AccountMenuList` behind `isLightThemeEnabled()`;
`applyThemeForPath` also sets `<meta name="theme-color">` (`THEME_COLOR`: `#020617` / `#ffffff`, the white of the light
app bar); `lib/nativeStatusBar.ts` paints the app's strip (StatusBar + SystemBars plugins; on Android the icons go
dark only if the strip really turned white — Android 15+ keeps it navy); the installed iPhone PWA gets a navy band
under its always-white clock on a light screen (`html.tp-standalone[data-theme="light"]::after`, `app/globals.css`).

### Rollout runbook (light theme)

1. Turn on: Vercel → Production → add `NEXT_PUBLIC_LIGHT_THEME_ENABLED` = `true` → **Redeploy** (a `NEXT_PUBLIC_*`
   value is baked in at build time; without a redeploy nothing changes). Preview first if you want to try it.
2. Check: open a venue home on a phone → menu → **Appearance** shows; tap Light → the page turns light at once;
   open Live Trivia → dark; back → light again.
3. Everyone still starts on Dark (`DEFAULT_THEME_PREFERENCE` in `lib/theme.ts`); changing that is a product decision.
4. Reverse: remove the variable (or set it to `false`) → Redeploy. Every page is dark again and the menu row is gone;
   a player's saved choice stays on their phone, unused, and comes back if the flag returns.
5. Cost: none recurring (no request, no database, no cron). The app needs no new store release: shells without the
   StatusBar plugin keep the navy strip.

### Phase 8 — Review and phone pass

`/code-review` at high on the whole plan's diff; fix findings as sub-phases (no in-place patches without a
note). Write `docs/light-theme-device-checklist.md` for Andrew: iPhone + Android, website + app, each of
the four screens in dark and light, switching mid-session, moving from a light screen into Live Trivia
(no flash), Reduce Motion, iPhone SE width, installed PWA. Headless browsers can't judge this surface;
only Andrew can close the checklist. Update `CLAUDE.md` (a short "Light theme" section), `SYSTEM_CONTEXT.md`
§10 and `AGENTS.md` ("adding a colour = a token with a dark and a light value").

## 5. Traps

- **Arbitrary Tailwind colours can't switch.** `text-[#fde68a]`, `bg-[#020617]/55`, `border-[#fef3c7]/[0.22]`
  must become tokens. **Decided in Phase 2:** a NEW token that needs opacity is a channel triple named
  `--ht-<name>-rgb` ("253 230 138"), exposed in Tailwind as `rgb(var(--ht-<name>-rgb) / <alpha-value>)`, so
  `text-ht-pickem-accent/80` renders exactly what `text-[#fde68a]/80` did; in a style attribute write
  `rgb(var(--ht-<name>-rgb) / 0.8)`. A colour whose light version needs a *different* alpha (or is a solid
  colour where dark is translucent, like `--ht-pickem-picked`) is its own whole-colour token without `-rgb`,
  never used with a modifier. **The existing tokens (`--ht-canvas`, `--ht-surface`, `--ht-elevated`, …) stay
  plain `var()` values — do NOT convert them to channels:** `bg-ht-elevated/40`, `/50`, `/60` (≈36 uses today)
  currently emit **no CSS at all** (Tailwind 3 drops an opacity modifier on a `var()` colour), so making them
  work would change dark pixels. Leave those dead classes alone, or replace one only with something that also
  renders nothing in dark.
- **Inline styles in animations** (`PickEmGameList`, `FantasyHome`) carry hex colours and glows; framer
  keyframes can use `var(--…)`.
- **`text-white` means two things:** text on a coloured tile (stays white) vs. body text (flips). Convert by
  meaning, not by search-and-replace.
- **`.tp-game-page .tp-page-main .text-xs` is inflated to 1.2rem** — unchanged, but don't "fix" sizes while
  converting colours.
- **`.tp-page-main section` gets phone padding `!important`** — irrelevant to colour, don't move elements
  between `section` and `div` while converting.
- **`LeaderboardTable` has other hosts** (e.g. in-game leaderboards) — they stay dark because their routes
  aren't light-capable; the tokens make that automatic, but diff them.
- **Hydration:** the pre-paint script changes `<html>` before React; `suppressHydrationWarning` on `<html>`
  only.
- **Static pages:** the build's static/dynamic route table must be unchanged after Phase 2.
- **Dev server:** Andrew runs `next dev` on :3000 (`.next/dev/lock`); browser-test from a scratchpad clone
  with mocked routes; kill only your own PIDs.
- **Uncommitted work in the tree** (as of 2026-10-22: `CLAUDE.md`, two POS docs, `lib/pos/providers.ts`,
  deleted `design-system/project/public/info/*.png`) is Andrew's — never `git checkout --` a file to undo
  an edit; never stage those files unasked.

## 6. Open questions for Andrew (defaults apply if unanswered)

- **Q1 — Light for everyone, or a choice?** Default: a choice (*Dark / Light / Match my phone*), starting
  on Dark. Alternatives: start everyone on "Match my phone", or make these four screens light for everyone
  with no setting.
- **Q2 — Pick 'Em game tickets:** "light" (default, white tickets with faint navy/magenta halves) or
  "classic" (today's navy↔magenta ticket on a light page). Compare with the Tweaks switch on the board.
- **Q3 — Fantasy scoreboard:** "chalkboard" (default, keeps the dark green live-points card) or "light".
- **Q4 — Other games stay dark** when a player has chosen Light? Default: yes, until a later plan.
- **Q5 — Game tutorial cards** shown before "Make your picks" / "Play Fantasy": default unchanged (they're
  artwork).
- **Q6 — Venue Home game tiles keep their solid colours?** Default: yes.

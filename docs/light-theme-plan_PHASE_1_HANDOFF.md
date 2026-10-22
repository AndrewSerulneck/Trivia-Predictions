# Light Theme Plan — Phase 1 Handoff (mockups)

**Date:** 2026-10-22 · **Plan:** `docs/light-theme-plan.md`

## For Andrew (plain English)

- **What changed:** nothing in the app. I drew light versions of Venue Home (Games, Leaderboard, Prizes
  tabs), Pick 'Em, NFL Pick 'Em and Fantasy (building a roster, and the live "My Sweat" view), plus a board
  showing every light colour and how readable it is.
- **Where:** https://claude.ai/artifact/BNXMakciHHcji3VyazXnYk (private to you). On the Pick 'Em, NFL
  Pick 'Em and Fantasy My Sweat boards, the **Tweaks** button switches between the two options for the game
  tickets / the live scoreboard.
- **Is it live?** No. Nothing was committed, pushed or deployed.
- **What's left:** Phases 2–8 in the plan (the actual build), which start only when you say "implement".
- **What needs you:** look at the mockups and answer the six questions in §6 of the plan (each has a
  default, so "go with the defaults" is a valid answer).

## For the next agent (Phase 2 — Foundation)

### 1. Goal and scope

Phase 2 builds the theme plumbing with **zero visible change**: light token values, `lib/theme.ts`, the
pre-paint `<script>` + `ThemeRouteSync`, the `NEXT_PUBLIC_LIGHT_THEME_ENABLED` flag (off), the
screenshot-diff harness and its **dark baseline captured before any conversion**, brand-doc updates and
`tests/light-theme-contract.test.ts`. Full list: plan §4 "Phase 2".
**Out of scope:** converting any component (Phases 3–6), the Appearance row and native status bar
(Phase 7). **Do not start Phase 2 until Andrew has approved the mockups** (plan decision 2). If he changed
anything in §6, record his answers in plan §1 first.

### 2. Starting state

- Branch `main`, last commit `42f0906` (docs(squares): plan 6.7 part 1). This phase added only untracked
  docs: `docs/light-theme-plan.md`, this file, `docs/light-theme-mockups/` (9 files). Nothing staged,
  committed or pushed.
- **Andrew's own uncommitted work is in the tree** and is not part of this plan: `CLAUDE.md`,
  `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`
  (modified), `design-system/project/public/info/*.png` (7 deleted), `design-system/project/public/info/New
  Folder With Items/` (untracked). Don't stage, revert or `git checkout --` them.
- No data, database, env var or Vercel change.

### 3. Decisions already made

Plan §1. In short: four screens only; mockups before code; dark must stay pixel-identical; Venue Home tiles
keep their colours; preference lives on the device (no DB column, no server read, no cookies in the root
layout); flag-gated. Defaults pending Andrew (§6): a Dark/Light/Match-my-phone choice starting on Dark;
"light" Pick 'Em tickets; "chalkboard" Fantasy scoreboard; other games stay dark; tutorial cards unchanged.

### 4. Files created

- `docs/light-theme-plan.md` — the plan, including the colour table (§2.1) that is the reference for every
  later phase.
- `docs/light-theme-mockups/*.dc.html` + `canvas.json` — source of the mockup boards (Design-canvas format:
  inline styles only; `/_blob/...` image URLs resolve only inside the artifact). Boards: `Main` (Venue Home
  Games), `VenueLeaderboard`, `VenuePrizes`, `Palette`, `PickEm`, `NFLPickEm`, `FantasySweat`,
  `FantasyDraft`. Colours in these files are the light values to implement.
- Artifact: https://claude.ai/artifact/BNXMakciHHcji3VyazXnYk (Design canvas; working copy was in the
  session scratchpad, which is gone — edit by reading the artifact's `project/*.dc.html` files).

### 5. Facts and traps found while reading the code

- Colour usage measured 2026-10-22 across `app/` + `components/` (368 TSX files): ~5,800 colour utilities,
  ~1,100 dark-background/white-text uses in 152 files, 662 hex literals, ~90 inline `style` colours, 740
  uses of the existing `ht-*` tokens in 76 files, 7 `dark:` uses. The in-scope files are mostly literal
  colours (e.g. Pick 'Em's `text-[#fde68a]`, Fantasy's `#0a3128` / `#fef3c7`), not tokens.
- In-scope file sizes: `VenueHubClient.tsx` 1,824 lines, `PickEmGameList.tsx` 1,375, `FantasyHome.tsx`
  3,273, `NFLPickEmGameList.tsx` 583.
- `body`/`html` background already use `var(--ht-canvas)` (`app/globals.css` ~line 237/255), so they flip
  with the token. `:root` sets `color-scheme: dark` (line 6).
- Global form rules (`app/globals.css` ~1037–1097) hard-code `rgba(255,255,255,.12)` and `#334155` borders
  for every button/input, scoped `:where(:not(.ht-light-surface *))`. They need tokens or buttons on light
  pages get invisible borders.
- `app/layout.tsx:107` `themeColor: "#020617"` (viewport export) — Phase 7 makes the meta follow the theme.
- `app/pickem/page.tsx` and `app/nfl-pickem/page.tsx` pass `playingBackgroundClassName="bg-[#020617]"`.
- Venue Home tile order is `VENUE_HUB_GAME_ORDER` in `VenueHubClient.tsx:108` (Squares/Bracket are
  seasonal and hidden in October). Tile colours: `VENUE_HUB_TILE_GRADIENT_BY_KEY` in
  `components/venue/venueHubShared.tsx:109`.
- The brand docs say "Every screen is dark-native; no light mode" (`SYSTEM_CONTEXT.md:378`; the
  design-system `colors_and_type.css` header). Two design-system copies exist
  (`design-system/project/` and `design-system/hightop-challenge-design-system/project/`); `SYSTEM_CONTEXT.md`
  §10 names the second as canonical.
- `lib/nativeApp.ts` `NativeCapability` has no `StatusBar` today; `native/capacitor.config.json` does
  configure a `StatusBar` plugin (Phase 2D).

### 6. Build, run, test

Nothing to build this phase. For Phase 2: `npx next typegen` on a fresh clone, then `npx tsc --noEmit`,
`npm run lint`, `npm run test`, `npm run test:pwa-contract`, `npm run build` (don't run typecheck and build
at the same time). Screenshots: scratchpad clone, no `.env.local`, mocked API routes, your own port; never
the dev server on :3000. **Unverified:** the mockups are drawn from reading the code, not from screenshots
of the running app, so small layout differences from the real dark screens are expected; the dark baseline
screenshots in Phase 2 are the real reference.

### 7. Open questions / waiting on Andrew

Plan §6 Q1–Q6, and approval of the mockups.

### 8. Recommended first steps for Phase 2 (Opus 5.5, high)

1. Re-read plan §2.1, §3 and §5; record Andrew's §6 answers in plan §1.
2. Build the screenshot harness and capture the **dark baseline** for all in-scope screens (and every other
   game screen that uses `GameAppBar`, for Phase 3) before touching any colour.
3. Decide the alpha-modifier approach for tokens (plan §5 first trap) and record it in the plan.
4. Add tokens (dark = today's literals) → `lib/theme.ts` → pre-paint script → `ThemeRouteSync` → contract
   test. Confirm the build's static route table is unchanged.

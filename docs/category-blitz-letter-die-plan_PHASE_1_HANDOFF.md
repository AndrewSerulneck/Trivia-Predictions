# Category Blitz Letter Die — Phase 1 handoff (prototype)

**Date:** 2026-10-30 · **Branch:** `after-app-review` · **Plan:** `docs/category-blitz-letter-die-plan.md`

## For Andrew (plain English)

- **What changed:** a stand-alone prototype of the letter die. Nothing in the game changed.
- **Open it on your iPhone:** https://claude.ai/artifact/Da1TFJzQfn5NBa3oVm7ryG (private to you).
  It plays a fake "Round 3 results" break, then the die drops in, bounces and tumbles with letters
  changing, lands on the round's letter, holds, flies into the corner badge, and the 12 categories
  slide in.
- **Buttons:** **Replay**, **Late letter** (the letter arrives a few seconds late, so you can see the
  die keep tumbling), and **Tune**, a panel of sliders and switches: timing, die size, bounce height
  and speed, spin speed, how often letters change, landing hop, settle bounces, hold time, fly time,
  "Wait for my tap" (the die tumbles until you press **Send letter**), Majority Rules round, and
  Reduce Motion.
- **Haptics:** a web page can't buzz an iPhone, so a small pill in the top-right corner shows
  "light buzz" (each bounce) and "strong buzz" (the landing) at the moments the real app will buzz.
- **What I need from you:** play with it, then press **Copy numbers** in Tune and paste them back
  (or say "defaults are fine"). Also tell me any feel notes, e.g. too slow, too bouncy, letters
  changing too fast, die too big, and your answers to the open questions below.
- **Not live, not deployed, nothing committed.** Zero cost: no requests or data of any kind.

## For the next agent

### 1. Next phase goal and scope
Phase 2 is the pure timing logic, `lib/categoryBlitzLetterDie.ts` + unit tests (see plan §5 Phase 2).
Andrew accepted the defaults in §3 (2026-10-30); use them as-is, don't re-ask. Out of scope for Phase 2: any React,
any change to `CategoryBlitzGame.tsx` / `RoundStartReveal.tsx`, the venue TV, a feature flag.

### 2. Starting state
- Branch `after-app-review`, last commit `c3ecdb8a` ("Add the live Google Play listing URL").
- **Nothing committed by Phase 1.** New, uncommitted files: `docs/category-blitz-letter-die-plan.md`
  (already untracked before Phase 1), `docs/prototypes/category-blitz-letter-die.html`, this handoff.
  `main` is frozen during App Store review: never push `main`, deploy, or change Production env.
- No data, migration, env var or script touched.

### 3. Decisions and prototype defaults
Andrew's decisions are in plan §2 (tumble early / land at start, CSS 3D cube, haptics only, MR = die
first then announcement, phones only, no flag). Do not re-ask.

Prototype defaults (= the `DEFAULTS` object in the prototype; **replace with Andrew's numbers when he
sends them**, and record them in the plan):

| Setting | Default | Meaning |
|---|---|---|
| `leadS` | 5 s | tumble starts this long before the round (= plan's `DIE_TUMBLE_LEAD_S`) |
| `size` | 168 px | die edge (~43% of a 390 px phone) |
| `hopH` | 0.55 × die | waiting-bounce height |
| `hopMs` | 520 ms | one waiting bounce, floor to floor (light buzz on each impact) |
| `spin` | 620 °/s | tumble spin; the axis is nudged randomly at every bounce |
| `flickerMs` | 110 ms | filler letters swap on faces turned away from the viewer only (`flicker: "hidden"`) |
| `landMs` | 760 ms | the landing hop; rotation slerps to the letter face, done at 88% of the hop |
| `landH` | 1.4 × bounce | landing hop height; strong buzz + shockwave ring on its impact |
| `settle` | 2 | small settle bounces after landing (each 0.18× the previous height, no buzz) |
| `holdMs` | 700 ms | letter holds centred (die grows to 1.06× over 220 ms) |
| `flyMs` | 450 ms | fly into the badge, `EASE_SNAP` (same as today's `LAYOUT_MORPH_TRANSITION`) |
| `mrMs` | 1600 ms | mock Majority Rules card (stand-in for the real MR flip) |

Behaviour the prototype settled (keep unless Andrew objects):
- **Landing starts at the next bounce impact after the letter arrives** (average wait ≈ `hopMs`/2),
  so the landing hop always starts from the floor. The total arrival → badge time with defaults is
  ≈ 260 (avg wait) + 760 + ~340 (settles) + 700 + 450 ≈ **2.5 s**.
- **The real letter is written on the face that is most hidden at landing start**, then that face
  rotates to the front during the hop, so the letter is never seen "popping" onto a visible face.
  No other face may show the real letter after that.
- Filler letters come only from `usableLetters` (copied into the prototype from
  `data/category-blitz/category-letter-index.json`: A B C D E F G H I L M N O P R S T W).
- **Majority Rules:** the die starts emerald (the client doesn't know the mode while tumbling) and
  cross-fades to the magenta/gold `blitzReverse` gradient during the landing hop (from 35% of the
  hop), then flies into a magenta badge, then the MR card, then the categories.
- **Reduce Motion:** no die. A static "?" tile at the die position, cross-fades to the letter on
  arrival (strong buzz), holds `max(250, holdMs)`, then fades into the badge (no flight).
- A small "Rolling the letter / 5…1" countdown under the die (switchable, `count`). Andrew to decide.

### 4. Files
- `docs/prototypes/category-blitz-letter-die.html`: the prototype (a copy of what is published;
  plain JS + CSS 3D, no framer-motion, because it is a stand-alone page). To republish from another
  session: Artifact publish with `url: https://claude.ai/artifact/Da1TFJzQfn5NBa3oVm7ryG` (read it
  first). Useful pieces to port in Phase 3:
  - quaternion helpers (`qMul`, `qAxis`, `qSlerp`, `qMat`, `cssMat`); face orientations `FACE_Q`;
    target orientation for face *i* = `qConj(FACE_Q[i])` (front-facing and upright).
  - per-face shading from a fixed light direction, an inner "core" cube at 0.94× so the rounded
    face corners don't show gaps, squash on impact (`scaleY 1−0.16k`, `scaleX 1+0.11k`, 170 ms,
    origin at the bottom), floor shadow scaled by height.
  - the fly hand-off: at hold end the cube is hidden and a flat tile is placed exactly over the
    front face's `getBoundingClientRect()`, then FLIPped to the badge. In the game, use the
    `CB_LETTER_BADGE_LAYOUT_ID` layoutId instead (plan Phase 3).
- `docs/category-blitz-letter-die-plan.md`: status line updated to point here.

### 5. Facts and traps
- In Category Blitz gameplay, `.tp-game-page .tp-page-main .text-xs` is inflated; use
  `text-caption`/`text-footnote` (CLAUDE.md text-size floor). The prototype keeps text ≥ 12 px.
- The badge in the game is `h-[3.75rem] w-[3.75rem]` (60 px), `rounded-2xl`, `h-9 w-9` when the
  keyboard is open (`compactChrome`), the FLIP target can change size.
- Badge colours come from `lib/themeTokens.ts` `blitzStandard.letterGradient` / `blitzReverse.letterGradient`;
  don't copy hex values into components (the prototype does, it's not app code).
- A per-frame JS loop drives the prototype (`requestAnimationFrame`, writes `transform` and 6 shade
  opacities per frame). Phase 3 should check frame rate on an old phone; framer-motion
  `useAnimationFrame` + motion values is the closest port.
- `navigator.vibrate` doesn't exist on iOS, and inside the artifact frame it may be blocked
  everywhere: the buzz pill is the only reliable haptic signal in the prototype.
- Tooling: `node --check` on the extracted `<script>` passed. No Playwright or screenshot run was made;
  feel has only been judged by Andrew on his phone (pending).

### 6. Build / run / test
Nothing to build. Open the artifact link, or open `docs/prototypes/category-blitz-letter-die.html`
in a browser (needs internet only for the Nunito font). Verified: script syntax. Unverified: look and
frame rate on a real iPhone / Android (Andrew).

### 7. Open questions for Andrew — ANSWERED 2026-10-30
1. Numbers: **defaults are fine** (the table in §3 is final).
2. Countdown under the die: **keep**.
3. Letter swaps: **hidden faces only** (the default).
4. Majority Rules: **magenta during the landing is right**.
Recorded as plan §2 items 6–9. Nothing is waiting on Andrew for Phase 2.

### 8. Recommended first steps for Phase 2 (Sonnet 5.5, medium)
1. Andrew's answers are in §7 and plan §2 items 6–9; the §3 table is final.
2. Read `components/category-blitz/CategoryBlitzGame.tsx` around `showReveal` (~line 2384) and the
   "about to start" check (~line 2476), and `ROUND_START_REVEAL_MAX_MS` in `RoundStartReveal.tsx`.
3. Write `lib/categoryBlitzLetterDie.ts` (pure, constants exported, including "land waits for the next
   impact" and the arrival → badge duration budget) and `tests/category-blitz-letter-die.test.ts`.
4. `npx tsc --noEmit`, `npm run lint`, `npm run test` (not at the same time as a build).

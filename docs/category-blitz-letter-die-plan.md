# Category Blitz — Letter Die Roll (plan)

**Status:** Phase 1 (prototype) done 2026-10-30; Andrew accepted the prototype defaults (§2 items 6–9).
Phase 2 (timing logic, `lib/categoryBlitzLetterDie.ts` + tests) done 2026-10-30, uncommitted; handoff
`docs/category-blitz-letter-die-plan_PHASE_2_HANDOFF.md`. Phase 3 (the die component,
`components/category-blitz/LetterDieRoll.tsx`) done 2026-10-30, uncommitted; handoff
`docs/category-blitz-letter-die-plan_PHASE_3_HANDOFF.md`. Phase 4 (wired into `CategoryBlitzGame.tsx` + Majority
Rules sequencing) done 2026-10-30, uncommitted; handoff `docs/category-blitz-letter-die-plan_PHASE_4_HANDOFF.md`.
Phase 5 (guardrail contract test + edge-case wiring tests, no source change) done 2026-10-30, uncommitted; handoff
`docs/category-blitz-letter-die-plan_PHASE_5_HANDOFF.md`. Phase 6's code review ran 2026-10-30 (`/code-review`, 10
findings); the fixes are Phases 7–10 below, and Andrew's phone pass moved to Phase 11. Phase 7 (die lifecycle fixes:
session-scoped die key, no tumble over a last round, watchdog keeps the Majority Rules takeover) done 2026-10-30,
uncommitted; handoff `docs/category-blitz-letter-die-plan_PHASE_7_HANDOFF.md`. Phase 8 (the die's cascade rows stay one
unprojected element for the whole round; no remount of a focused row) done 2026-10-30, uncommitted; handoff
`docs/category-blitz-letter-die-plan_PHASE_8_HANDOFF.md`. Phase 9 (header raised above the die so Back stays reachable; dev panel controls + one demos record) done 2026-10-30, uncommitted; handoff `docs/category-blitz-letter-die-plan_PHASE_9_HANDOFF.md`. Phase 10 (die component cleanup: face transforms as Tailwind classes, unused `roundNumber` deleted, one `faceViews` per frame) done 2026-10-30, uncommitted; handoff `docs/category-blitz-letter-die-plan_PHASE_10_HANDOFF.md`. Phase 11's re-review ran 2026-10-30 (10 findings);
the fixes are Phases 11.1–11.4, and the phone pass moved to Phase 12. Phase 11.1 (die timing: a late letter never holds the board, the live schedule window via `scheduleWindowEndAt`, shared `roundFitsWindow` + 15 s drive slack) done 2026-10-30, uncommitted; handoff `docs/category-blitz-letter-die-plan_PHASE_11.1_HANDOFF.md`. Phase 11.2 (the die lives in a `data-category-blitz-stage` wrapper under the header; `raised` and the z-1100/1110 pair deleted; game-over fireworks kept outside the stage) done 2026-10-30, uncommitted; handoff `docs/category-blitz-letter-die-plan_PHASE_11.2_HANDOFF.md`. Phase 11.3 (die component fixes: landing never rewrites a visible letter, dead Reduce Motion buzz deleted, one `freshFillers` helper, memoised die + stable parent callbacks) done 2026-10-30, uncommitted; handoff `docs/category-blitz-letter-die-plan_PHASE_11.3_HANDOFF.md`. Phase 11.4 (cascade rows `inert` until their own fade-in completes, one fallback timer) done 2026-10-30, uncommitted; handoff `docs/category-blitz-letter-die-plan_PHASE_11.4_HANDOFF.md`. Phase 12's re-review ran 2026-10-30 (`/code-review` high, 7 findings); the fixes are Phases 12.1–12.3, and the re-review + phone pass moved to Phase 13; handoff `docs/category-blitz-letter-die-plan_PHASE_12_HANDOFF.md`. Phase 12.1 (the die's "another round follows" uses the earlier of the live window end and the session's frozen `scheduledEndAt`; one `openScheduleWindow` lookup shared by both engines and the sessions API; the cron's fit check is `roundFitsWindow` at the session's own round length) done 2026-10-30, uncommitted; handoff `docs/category-blitz-letter-die-plan_PHASE_12.1_HANDOFF.md`. Phase 12.2 (the sessions reply carries `serverNowMs`; the hook keeps a fastest-reading clock offset used only by the die's late-letter cutoff; overlapping `loadSession` replies are numbered and an older one is dropped whole, a resync's `forceReveal` carried to the winner) done 2026-10-30, uncommitted; handoff `docs/category-blitz-letter-die-plan_PHASE_12.2_HANDOFF.md`. Phase 12.3 (cascade readiness moved into a per-row `CascadeRow` with its own state + one per-row fallback timer, so a row finishing never re-renders the board; one `CB_ROW_CASCADE_REDUCED_DURATION_S` constant, also used by RoundStartReveal's reduced variant) done 2026-10-30, uncommitted; handoff `docs/category-blitz-letter-die-plan_PHASE_12.3_HANDOFF.md`. All of Phases 1–12.3 committed locally on `after-app-review` as `2899a9d6` 2026-10-30 (not pushed). Phase 13's re-review ran 2026-10-30 (`/code-review` high, 10 findings: 7 confirmed, 1 plausible, 1 rejected; 2 are decisions for Andrew); the fixes are Phases 13.1–13.3, and the re-review + phone pass moved to Phase 14; handoff `docs/category-blitz-letter-die-plan_PHASE_13_HANDOFF.md`. Andrew decided findings 1 and 3 on 2026-10-30 (finding 1 → (a), finding 3 → fix now): they are new Phases 13.4 and 13.5. Phase 13.1 (die clock: the late verdict is decided once with the offset latched at arrival; the sessions reply adds `serverReceivedAtMs` for an NTP-style reading) done 2026-10-30, committed locally on `after-app-review`; handoff `docs/category-blitz-letter-die-plan_PHASE_13.1_HANDOFF.md`. Phase 13.2 (only a good sessions reply moves `appliedLoadSeqRef`; the three end-of-session broadcasts call `supersedeInFlightLoads`; `loadCurrentRound` takes the reply's `loadSeq` and skips stale writes) done 2026-10-31, committed locally on `after-app-review`; handoff `docs/category-blitz-letter-die-plan_PHASE_13.2_HANDOFF.md`. Phase 13.3 (the sessions poll reads `category_blitz_schedules` once, via `driveVenueCategoryBlitzWithSchedules`; the cron times the next start at `session.testMode`; stale `compactChrome` comment reworded) done 2026-10-31, committed locally on `after-app-review`; handoff `docs/category-blitz-letter-die-plan_PHASE_13.3_HANDOFF.md`. Phase 13.4 (both engines fit a round against the earlier of the live window end and the session's frozen `scheduledEndAt`, via one `sessionWindowEndMs` in `lib/categoryBlitzShared.ts` also used by `anotherRoundFollows`) done 2026-10-31, committed locally on `after-app-review`; handoff `docs/category-blitz-letter-die-plan_PHASE_13.4_HANDOFF.md`. Phase 13.5 (one `roundAgeMs` on the server's clock in `lib/categoryBlitzLetterDie.ts`, used by the die's late-letter cutoff, `showReveal` and the die watchdog's `sawRoundStart`) done 2026-10-31, committed locally on `after-app-review`; handoff `docs/category-blitz-letter-die-plan_PHASE_13.5_HANDOFF.md`. Next: Phase 14 (re-review of 13.1–13.5 + Andrew's phone pass). Prototype:
https://claude.ai/artifact/Da1TFJzQfn5NBa3oVm7ryG (copy in `docs/prototypes/category-blitz-letter-die.html`);
handoff `docs/category-blitz-letter-die-plan_PHASE_1_HANDOFF.md`. Branch: `after-app-review` (main is frozen during App Store
review — never push `main`, never deploy, never change Production env for this work until Andrew confirms Apple approved).

## 1. What we're building (plain English)

Between rounds, a big 3D die covered in letters takes over the whole phone screen, bounces and tumbles, and
lands showing the round's letter. The letter holds big in the middle for a beat, then flies into the letter badge
in the corner of the answering screen (where it already sits today), and the 12 categories cascade in.

## 2. Andrew's decisions (2026-10-30) — don't re-ask

1. **Tumble early, land at start.** The die starts tumbling in the last ~5 s of the break (letter still secret —
   the server only sends it when the round starts) and lands the moment the round arrives. No answering time lost.
2. **3D cube with letters**, drawn in CSS 3D (framer-motion, already installed). No three.js, no video, no new package.
3. **Haptics only, no sound.** Bounces = light buzz, landing = strong buzz, through `triggerAnimation` →
   `playHaptic` (the existing one-call-site rule in CLAUDE.md).
4. **Majority Rules rounds:** the die plays first, THEN the existing Majority Rules announcement/flip, then the board.
5. **Phones only** — not the venue TV. **No feature flag** (it lives on the branch until release).

After the Phase 1 prototype (2026-10-30):

6. **Timings and sizes = the prototype defaults** (table in `…_PHASE_1_HANDOFF.md` §3): lead 5 s, die 168 px,
   bounce 0.55× die / 520 ms, spin 620 °/s, letter swap 110 ms, landing hop 760 ms at 1.4× bounce, 2 settle
   bounces, hold 700 ms, fly 450 ms.
7. **Keep the small "Rolling the letter" countdown under the die.**
8. **Filler letters swap only on faces turned away from the player.**
9. **Majority Rules: the die turns magenta/gold during the landing hop**, then the MR announcement.

After Phase 2 (2026-10-30):

10. **Late letter cap accepted:** the die tumbles at most 12 s (`DIE_MAX_TUMBLE_MS`); if the letter is later, the die
    steps aside and today's round-start reveal shows the letter.

Phase 4 judgment calls (2026-10-30, agent; Andrew may revisit — details in `…_PHASE_4_HANDOFF.md` §3):

11. **The letter flies straight into the answering screen's corner badge and the categories cascade in on the
    answering screen** (RoundStartReveal's row timing, shared constants). `RoundStartReveal` is unchanged and is only
    the fallback when the die is skipped (avoids flying the letter twice and ~1.4 s more before typing).
12. **The die also plays before a session's first round** (the lobby countdown is its tumble lead).
13. **The die tumbles only over the resting intermission**, never over a still-playing grading cascade.

## 3. How it fits today's code

- `components/category-blitz/RoundStartReveal.tsx` is today's round-start reveal: the letter lands, then a shared
  `layoutId` (`CB_LETTER_BADGE_LAYOUT_ID` in `lib/categoryBlitzMotion.ts`) FLIPs it into the answering screen's
  badge (`AnsweringScreen` in `CategoryBlitzGame.tsx`, `data-category-blitz-letter-badge`). The die REPLACES the
  letter-landing half of this; the FLIP and the category cascade are reused, not rebuilt.
- `CategoryBlitzGame.tsx` already knows `nextRoundStartsIn` (from `useCategoryBlitzSession`) and has a
  "about to start" check (`nextRoundStartsIn <= 1`, ~line 2476) and the `showReveal` window
  (`ROUND_START_REVEAL_MAX_MS`), which also skips the reveal on a mid-round reload.
- Majority Rules: `isReverseRound` (`lib/categoryBlitzModes.ts`); its flip animation is triggered off
  `showReveal` + `round.mode === "reverse"` (~lines 2501–2538).

**Cost:** zero. Entirely client-side animation on data the game already loads — no new request, poll, cron or
database change. No migration.

## 4. Do I need Claude's web interface?

**No.** Claude Code can build and preview the animation here. In Phase 1 it publishes the prototype as a private
claude.ai Artifact link you open on your iPhone to judge the feel before it touches the game. (If you'd rather
riff on looks yourself, you *can* paste the prototype into claude.ai chat and iterate there — optional, not needed.)

## 5. Phases

| Phase | What | Model / effort |
|---|---|---|
| 1 | Prototype | Opus 5.5, high |
| 2 | Timing logic (pure) + tests | Sonnet 5.5, medium |
| 3 | The die component | Opus 5.5, high |
| 4 | Wire into the game + Majority Rules | Opus 5.5, high |
| 5 | Polish, edge cases, contract tests | Sonnet 5.5, medium |
| 6 | Review (done 2026-10-30 → Phases 7–10) | Opus 5.5, high |
| 7 | Die lifecycle fixes (review findings 1, 3, 5) | Opus 5.5, high |
| 8 | Board cascade without a remount (finding 2) | Opus 5.5, high |
| 9 | Back stays reachable + dev panel fixes (findings 4, 7, 9) | Sonnet 5.5, medium |
| 10 | Die component cleanup (findings 6, 8, 10) | Sonnet 5.5, medium |
| 11 | Re-review of 7–10 (done 2026-10-30 → Phases 11.1–11.4) | Opus 5.5, high |
| 11.1 | Die timing: late letter + "does another round follow?" (re-review findings 1, 2, 3) | Opus 5.5, high |
| 11.2 | Die lives under the header, not over it (re-review findings 5, 6) | Opus 5.5, high |
| 11.3 | Die component fixes (re-review findings 4, 7, 8, 9) | Sonnet 5.5, medium |
| 11.4 | Hidden cascade rows can't be tapped (re-review finding 10) | Sonnet 5.5, medium |
| 12 | Re-review of 11.1–11.4 (done 2026-10-30 → Phases 12.1–12.3) | Opus 5.5, high |
| 12.1 | Client and engines agree on when a scheduled session ends (12-review findings 1, 4, 5; done 2026-10-30) | Opus 5.5, high |
| 12.2 | Die clock: phone clock skew + stale window end (12-review findings 2, 3; done 2026-10-30) | Opus 5.5, high |
| 12.3 | Cascade readiness cleanup (12-review findings 6, 7; done 2026-10-30) | Sonnet 5.5, medium |
| 13 | Re-review of 12.1–12.3 (done 2026-10-30 → Phases 13.1–13.5) | Opus 5.5, high |
| 13.1 | Die clock: latch the late verdict, NTP-style reading (13-review findings 2, 4; done 2026-10-30) | Opus 5.5, high |
| 13.2 | Sessions reply ordering, completed (13-review findings 5, 6; done 2026-10-31) | Opus 5.5, high |
| 13.3 | Small engine and comment cleanups (13-review findings 7, 8, 9; done 2026-10-31) | Sonnet 5.5, medium |
| 13.4 | Engine never starts a round past the session's frozen end (finding 1, Andrew chose (a); done 2026-10-31) | Opus 5.5, high |
| 13.5 | One server-clock "round age" for the reveal, the watchdog and the die (finding 3, Andrew: fix now; done 2026-10-31) | Opus 5.5, high |
| 14 | Re-review of 13.1–13.5 + Andrew's phone pass | Opus 5.5, high (review); Andrew (phone) |

### Phase 1 — Prototype (look & feel only)
- A standalone HTML/framer-motion-style prototype of the cube: full-screen dark/emerald backdrop matching Category
  Blitz, cube bouncing (squash on impact, shrinking bounces), random letters flickering on faces, a
  "waiting" spin that can last any length, then a landing on a chosen letter, a hold, and a shrink toward the
  top corner. Buttons to replay and to simulate "letter arrives late".
- Publish as a private Artifact; Andrew picks durations/feel. Record the chosen numbers in the handoff.
- **Out of scope:** any change to the game.

### Phase 2 — Timing logic (`lib/categoryBlitzLetterDie.ts`, pure, no React)
- One function that, given `nextRoundStartsIn`, whether the round/letter has arrived, the round id, round start
  time and "now", returns the stage: `idle | tumbling | landing | holding | flying | done`.
- Rules: tumble begins at ≤ 5 s (`DIE_TUMBLE_LEAD_S`); if the letter is late, keep tumbling (cap, then land
  anyway when it shows); if the page opens mid-round past the reveal window → `done` (no replay — same rule as
  `ROUND_START_REVEAL_MAX_MS`); tab hidden during the roll → skip to done on return; Reduce Motion → short fade
  of the letter, no tumbling.
- Unit tests for every rule. Faces' filler letters come only from `usableLetters` (never a letter the game can't pick).

### Phase 3 — The die component (`components/category-blitz/LetterDieRoll.tsx`)
- Full-screen fixed overlay, above the game chrome, respects safe areas (app's web view already starts below the
  status bar). CSS 3D cube via framer-motion (transform/opacity only, 60 fps on an iPhone SE / older Android).
- Landing face shows the real letter; the held letter carries `layoutId={CB_LETTER_BADGE_LAYOUT_ID}` so the
  existing FLIP flies it into the badge. Haptics via `triggerAnimation` (bounce = light, land = strong).
- Tailwind only; any new keyframes go in `tailwind.config.ts`; no text under 12 px. Add it to `DevAnimationPanel`
  so it can be replayed on demand.

### Phase 4 — Wire into the game
- In `CategoryBlitzGame.tsx`: show the overlay from the tumble stage through landing; `RoundStartReveal` keeps only
  the category cascade (its letter-land step is replaced by the die's arrival).
- Majority Rules: sequence die → existing Majority Rules announcement → board. Move its trigger off the
  current `showReveal` start so the two don't overlap.
- Don't disturb the intermission results screen until the tumble lead begins.

### Phase 5 — Polish & guardrails
- Edge cases from Phase 2 checked in the real component; continuous-mode venues and the global room.
- Contract test: one die component, haptics only through `triggerAnimation`, no sound files, no new request.
- `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not typecheck and build at once). `/verify`
  skill for a Playwright run of a round start.

### Phase 6 — Review (done 2026-10-30)
- Fresh-eyes `/code-review` of Phases 2–5 found 10 problems. They are not patched in place: each is fixed in Phases
  7–10 below (finding numbers = the review's order, most severe first). Andrew's phone pass moved to Phase 11 so he
  tests the fixed build.

### Phase 7 — Die lifecycle fixes (`CategoryBlitzGame.tsx`; findings 1, 3, 5)
All three are about when the die mounts, tumbles or hands over. One phase because they all touch the same ~80 lines
(`dieKey` / `dieCountdown` / watchdog / `modeFlipCue`, ~lines 2476–2550) and share one test file.

- **7.1 A skipped die must not carry over to the next session (finding 1).** Today `dieKey` is
  `after:<previous round id>`, so every session's lobby and first round get the same key, `after:none`. A
  `{ key: "after:none", flew: false }` left by a mid-round reload therefore suppresses the die for every later session
  in that tab. **Fix:** put the session id in the key: `after:<session.id>:<prevId ?? "none">` (break phases use
  `round?.id`, answering uses `roundLineage.prevId`, as today). The lobby and the first round of a session still share
  one key, so one `LetterDieRoll` instance still spans lobby → first round. Don't add a "clear `dieOutcome`" effect
  on top of this; a key that can't collide is enough, and it avoids clearing state from an effect.
- **7.2 No tumble over the last round's results (finding 3).** The die starts tumbling at `nextRoundStartsIn ≤ 5` in
  `results` even when no next round is coming. On a scheduled session's last round it then covers the final standings
  for up to 12 s (`DIE_MAX_TUMBLE_MS`). **Fix:** add one pure predicate to `lib/categoryBlitzShared.ts` (it already
  holds `nextRoundStartAtMs`, shared with the server), e.g.
  `anotherRoundFollows(session, latestRound): boolean`:
  - continuous session → `true` (an admin stop arrives as `continuous_session_ended` → `complete` → `dieKey` null →
    the die unmounts);
  - scheduled with `scheduledEndAt` → `nextRoundStartAtMs(latestRound, session.testMode) +
    roundDurationSeconds(session.testMode) * 1000 <= Date.parse(scheduledEndAt)`. This mirrors the engine's
    `canFitAnother` in `driveVenueCategoryBlitz` (`lib/categoryBlitz.ts` ~line 846). Add a comment on both sides
    pointing at each other. **Don't touch the engine**: it is out of scope;
  - scheduled with no `scheduledEndAt` (manual, admin-run) → `false`. We don't know if a round follows, and covering
    final standings is worse than skipping the tumble. The die still lands at round start without tumbling (the
    existing "no countdown seen" path).

  Then `dieCountdown = phase === "results" && anotherRoundFollows(session, round) ? nextRoundStartsIn : …`. The lobby
  is unchanged, because a lobby always leads to a round. Use `session.testMode` (server truth), not
  `isCategoryBlitzTestModeEnabled()`. Known limit: if the engine's drive runs late, the predicate can say "fits" and
  the session still ends. The die then tumbles until `complete` unmounts it, which is no worse than today.
- **7.3 A Majority Rules round must always get its announcement (finding 5).** `modeFlipCue` fires on
  `dieDoneRoundId === round.id || (dieSkipped && showReveal)`. When the watchdog skips the die (about 4.27 s), `showReveal`
  has already ended (3 s), so no reveal and no "Blend In!" takeover play. Players then miss that the scoring rules
  flipped. **Fix:** when the watchdog arms, it records the round's age (`Date.now() − Date.parse(round.startedAt)`). If
  it then fires with that age ≤ `ROUND_START_REVEAL_MAX_MS`, it also sets the cue round (`dieDoneRoundId`; rename it
  `modeCueRoundId`, since it now means "this tab saw the round start, takeovers may play"). That is the same rule as
  `showReveal`: a round this tab saw start gets the takeover, and a mid-round reload never does. The board appears at
  once, with the takeover over it. Don't route the watchdog through `RoundStartReveal`: that adds ~2 s more on a
  round that is already late.
- **Tests** (extend `tests/components.category-blitz-letter-die-wiring.test.ts`; the mock already supports
  `lobbyCountdown`):
  1. Reload mid-round (die skipped), then the session completes, then a new session's lobby: the die mounts and tumbles.
  2. Scheduled session whose last round leaves no room before `scheduledEndAt`: at ≤ 5 s in `results` there is no
     `[data-category-blitz-letter-die]`. Continuous: it is there. Manual (no end): it is not.
  3. Reverse round with the die's rAF stalled (don't advance fake rAF): the watchdog fires, the board shows, and
     `triggerAnimation("CATEGORY_BLITZ_MODE_FLIP", …)` is called once.
  4. Mid-round reload of a reverse round: there is still no takeover.

  Unit-test `anotherRoundFollows` with each branch plus the exact-boundary case (`==` end fits).
  Mutation-check: reverting each fix fails at least one test.
- **Out of scope:** the engine, the intermission's own "Next round in" copy on a final round (a separate UX question
  that could reuse the same predicate later; ask Andrew first), and the venue TV.

### Phase 8 — Board cascade without a remount (`AnsweringScreen`; finding 2)
- **Problem:** with `cascadeRows`, `morphActive` stays on for ≈ 1.23 s (was 570 ms). Rows render as
  `motion.div` + `layoutId` until it ends, then as plain `div`. That element-type swap remounts `AnswerRow`. A player who
  taps a row during the cascade gets the iOS keyboard (a viewport resize that re-projects all 12 layoutId rows: the
  app-feel Finding A jank), and then the focused input is destroyed at ≈ 1.23 s and the keyboard closes mid-word.
  `compactChrome` is also held off for the whole window. The comment that says "nothing is focused during the morph
  window" is now false.
- **Fix: the cascade path never swaps element types.** Out of the die, the rows have no layout partner (the die only
  provides the badge tile), so they don't need `layoutId` or projection at all.
  - When `cascadeRows` (read once at mount, like `morphActive`): every row renders as a `motion.div` **without**
    `layoutId`/`layout`, with the cascade's `initial` → `animate` (opacity + y; opacity only under Reduce Motion),
    **for the whole round**. A motion component without `layout`/`layoutId` has no projection node, so the keyboard
    resize costs nothing (Finding A stays fixed). The element type is the same from mount to unmount, so nothing
    remounts.
  - `morphActive` goes back to governing only what has a partner: the badge, and the rows in the
    `RoundStartReveal` path. Delete the `morphSettleMs` stretch and go back to `LAYOUT_MORPH_SETTLE_MS` (570 ms) in both
    paths, so `compactChrome` is held off for 570 ms at most, as before.
  - Update the comments at `morphActive`, `morphSettleMs` and `compactChrome` (~lines 1611–1645) to say exactly this.
  - Keep `cbRowCascadeAfterDieEndMs` only if something else still uses it. Otherwise delete it and its test.
- **Tests** (new cases in `tests/components.category-blitz-letter-die-wiring.test.ts`, or a focused AnsweringScreen
  test):
  1. With `cascadeRows`, focus row 1's input at ~300 ms, type, and advance 2 s. It must be the **same** DOM node,
     `document.activeElement`, with its value kept.
  2. With `cascadeRows`, no row element has a `layoutId` (assert through the motion mock, or that rows carry no
     `data-projection-id`).
  3. `compactChrome` engages on focus after 570 ms.
  4. The non-die path (`morphFromReveal` without `cascadeRows`) is unchanged: rows use layoutIds, then plain divs at
     570 ms.
- **Phone check for Phase 12:** tap a row while the categories are still sliding in. The keyboard must stay open and
  nothing may jump.

### Phase 9 — Back stays reachable + dev panel fixes (findings 4, 7, 9)
- **9.1 Back is never covered (finding 4).** The die is `fixed inset-0 z-[1100]` and catches taps in every stage except
  `flying`. Inside `CategoryBlitzFrame` it sits above `Header`, so the Back button can't be reached for 5–14 s. (Android's
  hardware Back is unaffected: it runs the exit through the shell.) **Fix (recommended):** while the die is mounted,
  lift the header above it. Give `Header` a `raised` prop → `relative z-[1110]` (its own `bg-slate-950` bar stays),
  passed as the same condition that mounts the die (`dieKey !== null && !dieSkipped`). Raising it while the die is
  idle is harmless, because the die renders nothing then. The die's backdrop still swallows every other tap, so
  players can't press hidden results-screen buttons. Keep exactly one Back, in the header: never add a second
  `ExitBackButton` inside the die (navigation rules; `tests/navigation-controls-contract.test.ts`). The effect is that the
  die covers everything *below* the header bar instead of the literal whole screen. Andrew judges that look in
  Phase 12 (superseded by Phase 11.2: the die now sits under the header, no raised bar). If he wants it truly full-screen, the alternative is a transparent raised header (Back button only) over
  the die.
  - Test: while the die is tumbling, the Back button is rendered, is not inside the die element, and calls `onBack`
    when clicked. Add a contract assertion that `Header` is raised whenever `<LetterDieRoll` is mounted.
- **9.2 Dev panel controls above the die (finding 7).** In `DevAnimationPanel`, Replay and Close are `z-[1001]`; the die
  inside the panel is `z-[1100]` in the same stacking context (the panel's `fixed z-[1000]`), so it covers them for
  the whole roll. **Fix:** give both buttons `z-[1110]` (one shared class constant for the demo controls).
- **9.3 One list of die demos (finding 9).** Replace the two hand-written three-key lists (show the die demo / hide the
  generic stage) with one record,
  `LETTER_DIE_DEMOS: Record<"letterDie" | "letterDieLate" | "letterDieMajority", { late: boolean; reverse: boolean }>`,
  plus `isLetterDieDemo(demo)`. The die branch reads its props from the record, and the generic branch is
  `!isLetterDieDemo(demo)`. A fourth demo is then one entry.
- Dev-only code: no player-facing change from 9.2/9.3. Check them in a dev server from a scratchpad clone (dev shares
  the production DB; never `pkill next-server`).

### Phase 10 — Die component cleanup (`LetterDieRoll.tsx`; findings 6, 8, 10)
- **10.1 Static transforms become Tailwind classes (finding 6).** The six face and six core transforms are constants
  (`DIE_SIZE_PX` = 168 is fixed), but they are written from ref callbacks with `el.style.transform`. **Fix:** two literal
  class arrays in the component, e.g. `[transform:rotateY(90deg)_translateZ(84px)]`, and core `…translateZ(78.5px)`,
  in `FACE_ORIENTATIONS` order (front, back, right, left, bottom, top). Tailwind only sees literal strings, so never
  build them with a template. Add a unit test that turns each class's `rotateX/rotateY(θ)` into a matrix and checks it
  numerically against `cssRotation(FACE_ORIENTATIONS[i])`, so the classes can't drift from the motion lib. The sign of
  rotateX is the trap: test it, don't assume it. The ref callbacks then only register refs.
  - The **per-frame** writes (cube rotation, bounce/squash, shading, shadow, glyph text at 60 fps) are genuinely
    dynamic, which is the same reason `components/venue-screen/*` has an exception. **Decision for Andrew (default
    below):** add one line to CLAUDE.md's Styling rule: "Exception — `components/category-blitz/LetterDieRoll.tsx`:
    per-frame animation values written through refs (`el.style.*`); static styling stays Tailwind." Default if Andrew
    doesn't object: add it in this phase, worded exactly like that.
  - Keep the `[transform-style:preserve-3d]` class: the Phase 5 Reduce Motion test looks for it.
- **10.2 Remove the unused `roundNumber` (finding 8).** The game can't pass it: rounds have no number (Phase 4 handoff
  §4), and adding one means a server change nobody asked for. Delete the prop, the "Round N" label and its tint
  branch, and the dev demo's `roundNumber={…}`. Leave the Phase 3 handoff's mention alone (it is history). Following
  "minimal and simple", no label shows. If Andrew later wants one, it is a new request.
- **10.3 Less work per frame (finding 10).** In `drawFrame`, compute `faceViews(m.q)` **once**, after `m.q` is final
  for the frame. Then run the letter swap (tumbling, when due) and the shading from that one array. Replace the
  per-face `freshFiller` calls in the swap with one batch: build the in-use set and the free pool once, then
  `pickFillerLetters(free, hiddenCount, Math.random, avoid)` and write them to the hidden faces. The outcome must stay
  the same: distinct letters, none already on the die, never the round's letter. `beginLanding` may keep `freshFiller`
  (it runs once).
  - Tests: the existing `tests/components.letter-die-roll.test.ts` must still pass. Add one case: during a tumble,
    after many swaps, no two faces show the same letter, and none shows the incoming letter once it is known.
- **Gates for Phases 7–10** (each phase): `npx tsc --noEmit`; `npx eslint <touched files>` (`npm run lint` also lists
  ~309 parsing errors from git-ignored `tmp/group-games-phase-4/`; ignore them); `npm run test` (expect only the 4
  known Bingo star-index freshness failures); `npm run build`. Never run typecheck and build at the same time. Each
  phase writes its own `…_PHASE_<N>_HANDOFF.md` and updates the status line.

### Phase 11 — Re-review (done 2026-10-30)
- Fresh-eyes `/code-review` of the Phase 7–10 diff found 10 more problems ("re-review findings" below, numbered in the
  review's order, most severe first). Same rule as Phase 6: no in-place patches. Each is fixed in Phases 11.1–11.4, and
  the phone pass moved to Phase 12.

### Phase 11.1 — Die timing: late letter + "does another round follow?" (re-review findings 1, 2, 3)
All three are about the die's clock disagreeing with the round's real clock. Files: `lib/categoryBlitzLetterDie.ts`,
`lib/categoryBlitzShared.ts`, `app/api/category-blitz/sessions/route.ts`, `lib/categoryBlitzRealtime.ts`,
`CategoryBlitzGame.tsx`, one pure extraction in `lib/categoryBlitz.ts`.

- **11.1a A letter that shows up late never holds the board (finding 1).** Today the 3 s mid-round cutoff in `dieStage`
  (`DIE_MID_ROUND_CUTOFF_MS`) applies only when no tumble was latched. Once the die has tumbled, a letter that arrives
  ~6 s into the round (realtime dropped, the poll delivered it) still gets landing + hold + fly, ~2.3 s more, on top of
  the 6 s already lost. **Fix:** one rule in the letter-arrived branch, tumble or not: **if the letter was first seen
  more than `DIE_MID_ROUND_CUTOFF_MS` after the round started (`letterArrivedAtMs − roundStartedAtMs`), the stage is
  `done`.** Measure with the ARRIVAL time, never `nowMs`. A die that lands on time is still holding or flying 2–3 s
  into the round, and a `nowMs` rule would cut it off mid-fly. On a mid-round reload, arrival is the first time this
  tab saw the letter, so this one rule also covers today's no-tumble case. Delete the old `tumbleStartedAtMs === null &&
  nowMs − …` clause unless an existing test shows a case only it handles; if one does, write down why in the handoff.
  - The result is the same as the parent watchdog's 3 s "saw the round start" rule. A skipped die then shows the plain
    board at once (`showReveal` has expired too). On a Majority Rules round, that also means no takeover, the same as a
    mid-round reload today (Phase 7.3 rule).
  - Clock skew: this compares the phone's clock to the server's `startedAt`, exactly like the existing cutoff,
    `showReveal` and the round timer. No new exposure. Don't add a clock-offset system in this phase.
  - Tests (`tests/lib.category-blitz-letter-die.test.ts`): tumble latched, letter at round start + 3.5 s → `done`;
    tumble latched, letter at round start + 0.2 s, `nowMs` at + 2.9 s (holding) → still `holding`/`flying`, not
    `done`. Wiring test: the finding's exact scenario (tumble at countdown 5, the round arrives 6 s late) leaves
    no `[data-category-blitz-letter-die]` and shows the board.
- **11.1b Read the LIVE schedule window, not the one frozen at session creation (finding 2).** `anotherRoundFollows`
  uses `session.scheduledEndAt`, which is fixed when the session is created. The engine reads the live open schedule.
  If a partner shortens or closes tonight's window mid-session, the engine starts no more rounds, but the client still
  says "another round follows" and tumbles over the final standings. **Fix (zero extra reads):**
  `GET /api/category-blitz/sessions` already lists the room's schedules (`listSchedules(roomId)`, next to
  `driveVenueCategoryBlitz`). From that same list, compute the open window's end exactly the way the engine does
  (`isWindowOpen` → `getCurrentOrNextScheduleWindow(...).windowEnd`). Return it as a top-level
  `scheduleWindowEndAt: string | null` beside `nextWindowAt` (null = no open window). Don't put it on the session row
  or add a column: it is derived, never stored.
  - `useCategoryBlitzSession` stores it from each sessions response (the same place `realtimeChannel` is stored) and
    exposes it. A `schedule_updated` broadcast already reloads the session, so a partner's edit reaches the die within
    a second. Otherwise the 15 s poll catches it.
  - `anotherRoundFollows(session, latestRound, scheduleWindowEndAt)`: continuous → `true` (unchanged). Scheduled →
    `false` when the window end is null **or missing** (an older server response; skipping a tumble is the safe side),
    else the fit test below. `session.scheduledEndAt` is no longer read here.
  - The continuous branch of the route doesn't need the field. Return `null` there.
- **11.1c Check the fit when the engine actually starts the round, not at the exact due time (finding 3).** The engine
  checks `canFitAnother` at drive time (`now`), and that is always at or after the due time, because only a page GET
  starts a round. The client checks at exactly `nextRoundStartAtMs`, so at the boundary the client predicts a round
  that the engine then refuses. **Fix:**
  - Extract the engine's arithmetic into one pure shared function in `lib/categoryBlitzShared.ts`:
    `roundFitsWindow(startAtMs, windowEndMs, testMode) = startAtMs + roundDurationSeconds(testMode) * 1000 <= windowEndMs`.
    The engine's `canFitAnother` becomes `roundFitsWindow(now.getTime(), occurrence.windowEnd.getTime(), existing.testMode)`:
    the same arithmetic, behavior unchanged (that is the only engine edit; drop the "keep the two in step" comments,
    because they now share code).
  - The client asks `roundFitsWindow(nextRoundStartAtMs(latest, testMode) + ROUND_START_DRIVE_SLACK_MS, windowEndMs, testMode)`.
    `ROUND_START_DRIVE_SLACK_MS` (new, in `lib/categoryBlitzShared.ts`) is how late a scheduled round can realistically
    start after its due time. Set it from the game page's real timing: read how the hook kicks the GET at the boundary,
    plus the 15 s fallback poll. Default `15_000`, with a comment that says where the number comes from.
  - Trade-off, accepted: in the last ~15 s band of a window, the die skips the tumble for a round that does follow.
    That round still gets its die, which lands at round start without the lead-in (the existing "no countdown seen"
    path), so no answering time is lost. The opposite error (tumbling over final standings) is what we are removing.
- **Tests:** unit-test `roundFitsWindow` (fits, exact `==` boundary fits, 1 ms over doesn't) and `anotherRoundFollows`
  (continuous; null window; missing window; fits with slack; fits only without slack → false). Route test: a schedule
  edited to end earlier changes `scheduleWindowEndAt` in the response; no open schedule → null; the route makes no new
  Supabase call (assert the mock call count). Wiring test: results phase with `scheduleWindowEndAt` too early → no die
  at ≤ 5 s. Engine: the existing `driveVenueCategoryBlitz` tests must pass unchanged. Mutation-check each fix.
- **Cost:** zero. The window end comes from schedules the route already reads; no new request, poll, write or migration.
- **Out of scope:** changing when the engine ends a session, and the intermission's "Next round in" copy on a final
  round (Phase 7 already parked this; ask Andrew first).

### Phase 11.2 — The die lives under the header, not over it (re-review findings 5, 6)
- **Problem:** the die is `fixed inset-0 z-[1100]` over the whole frame, so Phase 9.1 lifted `Header` to `z-[1110]` via
  a `raised` prop (true for every phase that has a die key, not just while it rolls), and `DevAnimationPanel`'s
  controls to `z-[1110]`. The game's own dev test-mode buttons (Test mode, Skip round: `fixed z-[999]`) were missed, so
  the die swallows their taps (finding 5). Every future overlay would have to know the 1100/1110 pair (finding 6).
- **Fix: put the die inside the content area, below the header.** The look matches Phase 9.1 (the header stays visible
  and the die covers everything below it), but no z-index special cases are left.
  - In `CategoryBlitzGame`, wrap all phase content (everything after the dev-only controls: loader, lobby, answering,
    results, complete…) in one `<div data-category-blitz-stage className="relative isolate flex min-h-0 flex-1 flex-col">`.
    Render `<LetterDieRoll>` as that wrapper's last child. `isolate` keeps the die's z-index local to the stage, so
    the header (a sibling above it) and the `fixed z-[999]` dev buttons (outside it) are never covered.
  - `LetterDieRoll`'s root becomes `absolute inset-0 z-10 overflow-hidden` (no `fixed`, no `z-[1100]`). Its parent
    supplies the box. In `DevAnimationPanel`, the die's container is already `fixed inset-0 z-[1000]` (positioned), so
    the die fills it. Set the demo controls one step above the die (`DEMO_CONTROL_Z = "z-20"`).
  - Delete `Header`'s `raised` prop, its doc comment and the `relative z-[1110]` branch.
  - The FLIP needs no change: the held tile and the answering screen's badge are both inside the stage, and
    `layoutId` measures viewport positions. Check that the die's `overflow-hidden` never clips the tile's path to the
    badge.
  - **Layout check (the main risk):** the wrapper must not change any phase screen. It keeps the `min-h-0 flex-1
    flex-col` chain, so scroll areas still fit. Take Playwright screenshots before and after of lobby, continuous wait,
    answering (keyboard closed), results, Majority Rules results and complete, at 390 × 844 and 320 × 568, and compare
    them. Do this from a scratchpad clone with mocked routes (dev shares the production DB; never `pkill next-server`).
    Also check `compactChrome` / the visual-viewport keyboard handling still targets the right elements.
- **Tests:** update `tests/category-blitz-letter-die-contract.test.ts`: replace the two `raised` assertions and the
  `z-[1110]` one with these: `LetterDieRoll`'s root is `absolute` (not `fixed`); `<LetterDieRoll` appears inside
  `data-category-blitz-stage`, after `<Header`; no `z-[1100]`/`z-[1110]` remains in `components/category-blitz/`. Update
  the wiring tests at ~lines 511–517: while the die tumbles, Back is outside the die and clickable, the die is inside
  `[data-category-blitz-stage]`, and in test mode the Skip round button is outside the stage.
- **Out of scope:** a truly full-screen die (over the header). If Andrew wants that in Phase 12, it is a new request.

### Phase 11.3 — Die component fixes (`LetterDieRoll.tsx`; re-review findings 4, 7, 8, 9)
- **11.3a No visible letter ever changes at landing (finding 4).** `beginLanding` puts the real letter on the most
  hidden face, then swaps any OTHER face showing that letter to a new filler. That face can be the visible front, so
  the player sees it pop, and it was the answer. **Fix:** the landing target is the face that **already shows** the
  real letter if there is one (letters on the die are always distinct, so there is at most one), otherwise the most
  hidden face (`mostHiddenFace`). Delete the swap loop. No face is ever rewritten during landing except a hidden one
  receiving the letter. If the target is already visible, the landing hop just turns that face to the front, which
  looks natural.
  - Test: force the real letter onto the front face at landing start (stub `Math.random` / seed the letters as the
    existing tests do). Through landing → hold, the front glyph's text never changes, the target is that face, and no
    two faces show the same letter.
- **11.3b Delete the dead Reduce Motion buzz (finding 7).** `playHaptic` already stands down under
  `prefers-reduced-motion`, the same query `useReducedMotion` reads, so the Reduce Motion `CATEGORY_BLITZ_DIE_LAND`
  trigger never buzzes. Delete `reducedLandRef` and that trigger. Delete `DIE_REDUCED_MIN_HOLD_MS` and the
  `Math.max(...)`, so the hold is `DIE_HOLD_MS`. Update the constants' comment and the test at
  `tests/lib.category-blitz-letter-die.test.ts:120`. The full-motion landing buzz is unchanged.
- **11.3c One filler-letter helper (finding 8).** Replace `freshFiller(avoid)` and the tumble's inline copy with one
  `freshFillers(count, avoid)`: build the in-use set **upper-cased** from `motionRef.current.letters`, filter
  `usableLetters` (upper-cased) against it, then call `pickFillerLetters(free, count, Math.random, avoid)`. The tumble
  swap calls it with `hiddenFaces.length`. After 11.3a, `beginLanding` needs no fillers, so this is the only copy.
- **11.3d Fewer re-renders while rolling (finding 9).** The parent re-renders about 4× a second, which re-reconciles
  the 30-element cube and re-attaches 12 inline ref callbacks each time.
  - Wrap the component in `memo`. It already reads its callbacks through `callbacks.current`, so the parent only needs
    to pass stable ones: wrap `handleDieStage` / `handleDieDone` in `useCallback`. Their dependencies (`dieKey`,
    `phase`, `round`, `markRevealDone`) change only at stage or phase changes. `roundStartedAtMs` is already a
    primitive, and `nextRoundStartsIn` changes once a second, which is fine.
  - Create the 6 glyph and 6 shade ref callbacks once (e.g. `useState(() => FACE_INDEXES.map(…))`), not inline. The
    glyph callback keeps writing `motionRef.current.letters[i]` on attach.
  - Test: render the game's die with a `React.Profiler` around it, tick the parent clock several times with unchanged
    die props, and the die's render count does not grow. The existing `tests/components.letter-die-roll.test.ts` must
    still pass.

### Phase 11.4 — Hidden cascade rows can't be tapped (`AnsweringScreen`; re-review finding 10)
- **Problem:** out of the die, each row mounts at opacity 0 and fades in after
  `CB_ROW_CASCADE_AFTER_DIE_DELAY_S + i × CB_ROW_CASCADE_STAGGER_S` (row 12 at ≈ 0.81 s, visible at ≈ 1.11 s). Until
  then it is fully interactive, so a tap on the empty lower half focuses a category the player never saw and opens the
  keyboard.
- **Fix:** each cascade row is `inert` (React 19 boolean prop: no taps, no focus, hidden from screen readers) until its
  own fade-in completes. Use the row `motion.div`'s `onAnimationComplete` to mark it ready, keeping one small piece of
  state for the ready rows in `AnsweringScreen`. Add **one** fallback timer at the cascade's end
  (`CB_ROW_CASCADE_AFTER_DIE_DELAY_S + 11 × stagger + duration`, plus 500 ms) that marks every row ready, so a missed
  callback (for example a tab hidden mid-cascade) can never leave a dead row. The same rule applies under Reduce
  Motion (opacity only, 0.2 s). The RoundStartReveal path and plain rows are unchanged.
- **Tests:** at ~100 ms, row 12's wrapper has `inert` and row 1's does too. After the fallback time, no row has
  `inert`. Update Phase 8's test 1 to focus row 1 **after** its fade completes (≈ 0.45 s); the rest of it (same DOM
  node, still focused, value kept after 2 s) must still pass. Non-die path: no `inert` anywhere.

**Gates for 11.1–11.4** (each sub-phase): same as Phases 7–10 above (`npx tsc --noEmit`; `npx eslint <touched files>`;
`npm run test`, where only the 4 known Bingo star-index freshness failures are expected; `npm run build`, never at the
same time as typecheck). Each sub-phase writes `…_PHASE_11.<N>_HANDOFF.md` and updates the status line.

### Phase 12 — Re-review (done 2026-10-30)
- Fresh-eyes `/code-review` (high) of the Phase 11.1–11.4 changes found 7 problems ("12-review findings" below, numbered
  in the review's order, most severe first). All 7 were checked against the code before being recorded. Same rule as
  Phases 6 and 11: no in-place patches. The fixes are Phases 12.1–12.3; the phone pass moved to Phase 13.
- Note: Phases 2–11.4 are all uncommitted, so "the 11.1–11.4 diff" is the working tree read with the 11.x handoffs as
  the map. Committing each future sub-phase on `after-app-review` (never `main`) would make Phase 13's diff exact; ask
  Andrew before the first commit.

### Phase 12.1 — Client and engines agree on when a scheduled session ends (12-review findings 1, 4, 5)
- **12.1a The frozen end still closes the session (finding 1).** 11.1b stopped `anotherRoundFollows` reading
  `session.scheduledEndAt`, but the engine still force-closes an auto session at that frozen time (`isStaleAutoSession`,
  `lib/categoryBlitz.ts` ~line 564, called from `driveVenueCategoryBlitz` ~line 782; the cron's step 2 too). Scenario: a
  session made for an 8–9 pm window (`scheduledEndAt` 9:00); the partner extends tonight to 10 pm; at 8:58 the client
  sees a 10:00 window, predicts another round and tumbles over the final standings; after 9:00 the engine closes the
  session. **Fix:** a scheduled session's real cutoff is the EARLIER of the live window end and `session.scheduledEndAt`
  (when set). Do it in `anotherRoundFollows` (the session is already on the client: zero cost); update its doc comment
  (it currently says `scheduledEndAt` is never read). Missing/null live window → still `false`. Don't change when the
  engine closes a session (out of scope; a partner extending tonight's window mid-session ending at the old time is an
  existing engine behaviour — mention it to Andrew in the handoff, don't fix it).
- **12.1b The cron engine has its own fit check (finding 4).** `runCategoryBlitzEngine` step 3 (~line 2012) still does
  `now + ROUND_DURATION_SECONDS * 1000 <= windowEnd`, ignoring `testMode`, with `windowEnd` = `nextOccurrence +
  windowMinutes` (~line 1984). **Fix:** call `roundFitsWindow(now.getTime(), windowEnd.getTime(), session.testMode)`.
  First prove (a unit test over a few schedules, incl. one crossing midnight) whether `nextOccurrence + windowMinutes`
  always equals `getCurrentOrNextScheduleWindow(openSchedule, now).windowEnd` for an open window. If yes, use the shared
  lookup (12.1c) there too; if not, leave the derivation, and write down the difference in the handoff — don't change
  cron behaviour for real (non-test) sessions without Andrew.
- **12.1c One open-window lookup (finding 5).** `openScheduleWindowEnd` (`lib/categoryBlitzSchedules.ts` ~line 276)
  copies `driveVenueCategoryBlitz`'s `schedules.find(isWindowOpen)` + `getCurrentOrNextScheduleWindow`. **Fix:** one
  helper returns the open schedule and its occurrence (e.g. `openScheduleWindow(schedules, now) → { schedule,
  occurrence } | null`); `driveVenueCategoryBlitz` and `openScheduleWindowEnd` (or the route directly) both use it.
  Engine behaviour unchanged.
- **Tests:** `anotherRoundFollows`: live window later than `scheduledEndAt` → judged against `scheduledEndAt`; earlier →
  live window; `scheduledEndAt` null → live window. Wiring test: the finding's scenario (window extended, frozen end
  before the next round's end) → no die at ≤ 5 s. Existing `driveVenueCategoryBlitz` / `runCategoryBlitzEngine` tests pass
  unchanged; add one cron test showing a test-mode session uses the test-mode round length. Mutation-check each fix.
- **Cost:** zero (no new read, request or write).

### Phase 12.2 — Die clock: phone clock skew + stale window end (12-review findings 2, 3)
- **12.2a Phone clock ahead of the server (finding 2).** 11.1a made the late-letter cutoff apply after a latched tumble
  too, measured as `letterArrivedAtMs − Date.parse(round.startedAt)` (phone clock vs server clock). Before 11.1a a latched
  tumble was exempt, so the plan's "no new exposure" note was wrong for that case: a phone whose clock runs > 3 s
  (`DIE_MID_ROUND_CUTOFF_MS`) ahead of the server now tumbles for 5 s and then the die vanishes on EVERY round, with no
  landing, no RoundStartReveal and no Majority Rules takeover (showReveal has expired too).
  - **Recommended fix (zero extra requests):** the sessions route already has `now`; return it as `serverNow`. The hook
    keeps a clock offset (`serverNow − local midpoint of the request`, smoothed or the latest from the fastest
    response) and the die's cutoff uses the corrected arrival time. Scope it to the die's lateness check only —
    don't retrofit the round timer or `showReveal` in this phase (note it as a follow-up for Andrew).
  - Alternative if that's too much: restore the latched-tumble exemption but cap it (e.g. a latched tumble may land
    when the letter arrives ≤ `DIE_TUMBLE_LEAD_S + DIE_MID_ROUND_CUTOFF_MS` after the tumble began). That still has skew,
    but in the safe direction. Pick one, record why in the handoff.
  - Tests: phone 4 s ahead, round on time → die lands; letter genuinely 6 s late (correct clock) → `done` (11.1a's
    scenario must still pass); phone 4 s behind + letter 6 s late → `done`.
- **12.2b A slower, older sessions response can restore an old window end (finding 3).** `loadSession` in
  `lib/categoryBlitzRealtime.ts` (~line 616) sets `scheduleWindowEndAt` from whichever response finishes last. A 15 s
  poll that read the schedules before a partner shortened the window can land after the `schedule_updated` reload and put
  the longer end back, so the die tumbles over the final standings for up to 15 s. **Fix:** a request sequence number
  (ref) per `loadSession` call; a response older than the newest one already applied doesn't write
  `scheduleWindowEndAt` (and, if it's simple, doesn't write the session either: `setSession` has the same pre-existing
  race — fix both or note it). Test: two overlapping loads resolving out of order → the newer one's window end wins.
- **Cost:** zero (`serverNow` rides on the existing response).

### Phase 12.3 — Cascade readiness cleanup (`AnsweringScreen`; 12-review findings 6, 7)
- **12.3a Fewer re-renders during the morph (finding 6).** `readyRows` lives in `AnsweringScreen`, so each row's
  `onAnimationComplete` re-renders the whole board (~12 renders in ~0.6 s, overlapping the badge's 570 ms layoutId FLIP),
  and the fallback timer always builds a new Set (one more render even when all rows are ready). **Fix:** move readiness
  into a small per-row wrapper component with its own `ready` state (cascade start time + index as props, plus the one
  fallback still owned by `AnsweringScreen` or replaced by a per-row timer — keep ONE fallback mechanism), or at minimum
  make the fallback `prev.size === count ? prev : …`. Test with a `React.Profiler` that `AnsweringScreen`'s render count
  during the cascade doesn't grow per row; all Phase 8 / 11.4 wiring tests still pass.
- **12.3b One constant for the Reduce Motion row fade (finding 7).** The bare `0.2` appears twice in
  `CategoryBlitzGame.tsx` (~lines 1641 and 2126). Add `CB_ROW_CASCADE_REDUCED_DURATION_S` next to
  `CB_ROW_CASCADE_DURATION_S` in `lib/categoryBlitzMotion.ts`, and use it in both places (and RoundStartReveal's reduced
  variant only if it is the same fade — check, don't assume).

**Gates for 12.1–12.3** (each sub-phase): `npx tsc --noEmit`; `npx eslint <touched files>`; `npm run test` (only the 4
known Bingo star-index freshness failures expected); `npm run build`, never at the same time as typecheck. Each
sub-phase writes `…_PHASE_12.<N>_HANDOFF.md` and updates the status line.

### Phase 13 — Re-review (done 2026-10-30)
- All letter-die work (Phases 1–12.3) was first committed locally on `after-app-review` as `2899a9d6` (parent
  `c3ecdb8a`; not pushed), so this review and every later one has an exact diff. **Commit each later sub-phase on
  `after-app-review` too** (Andrew asked for the local commit 2026-10-30; never `main`, never push).
- Fresh-eyes `/code-review` (high) of `c3ecdb8a..2899a9d6`, focused on 12.1–12.3, reported 10 findings ("13-review
  findings" below, in the review's order). Each was checked against the code: 7 confirmed, 1 plausible (5), 2 not taken:
  - **Finding 10 rejected:** "Return can't advance into a still-inert cascade row". Row i is ready at
    0.45 + 0.06·i s, so the next row is ready 60 ms after the one being typed in. Nobody can tap, type and press Return
    that fast.
  - **Findings 1 and 3 are for Andrew to decide, not new sub-phases.** Both come from engine and clock behaviour that the
    plan already put out of scope (12.1a, 12.2a); the letter die only makes them visible. See "Open for Andrew" below.
- Same rule as Phases 6, 11 and 12: no in-place patches. The fixes are Phases 13.1–13.3; the phone pass moved to
  Phase 14.

**Decided by Andrew 2026-10-30 (13-review findings 1 and 3):** finding 1 → option (a), built in Phase 13.4; finding 3 →
"fix it now", built in Phase 13.5. The original write-up follows.
- **Finding 1, engine (`lib/categoryBlitz.ts` ~838 drive, ~2005 cron):** the engine decides whether another round fits
  against tonight's *live* window end, but closes the session at the end time frozen on the session when it was made
  (`isStaleAutoSession`). If a partner extends tonight's window mid-game, the engine can start a round at 8:59 and
  force-score it at 9:00, about 2 minutes early. The die correctly does not tumble for it (12.1a uses the earlier of the
  two), so players just see a round start late and end early. This started before the letter die (the old code used the
  live window too). Options: (a) the engine's fit check also uses the earlier of the two times (no extra cost; an
  extended window then ends at the old time, as today, with no cut-short round); (b) editing a schedule also moves an
  open session's frozen end (an extension really extends tonight; one extra write per edit). Recommend (a) now, and (b)
  only if partners ask for mid-game extensions.
- **Finding 3, phone clock (`CategoryBlitzGame.tsx` ~2467 `showReveal`, ~2608 watchdog):** 12.2a corrected only the
  die's late-letter check for phone clock skew, as planned. The fallback round-start reveal, the die watchdog's "saw the
  start" check and so the Majority Rules banner still use the phone's own clock. On a phone more than 3 s fast, if the
  die is skipped (tab hidden), the reveal and the Majority Rules takeover don't play. This was already true before the
  letter die. Fix (if wanted): one "round age" helper with the offset, used by all three. Zero extra requests.

### Phase 13.1 — Die clock: lock the late verdict, measure the offset properly (13-review findings 2, 4)
- **13.1a Decide "late" once (finding 2).** `dieStage` (`lib/categoryBlitzLetterDie.ts` ~142) re-checks
  `letterArrivedAtMs + serverClockOffsetMs − roundStartedAtMs > DIE_MID_ROUND_CUTOFF_MS` on every frame with the
  *current* offset, and `LetterDieRoll`'s effect re-runs on an offset change. Scenario: the letter arrives 2.7 s in, the
  die starts landing, and a poll then brings a faster clock reading that moves the offset by +400 ms. 3.1 s > 3 s, so the
  die vanishes mid-bounce and the board falls back without a fly. **Fix:** in `LetterDieRoll`, latch the offset when the
  letter's arrival is latched (next to `latches.current.letterArrivedAtMs`, line ~390), and pass that latched value into
  `dieStage`. The offset can still change freely *before* the letter arrives. Test: the arrival is on time with offset
  0, then the offset prop becomes +400 ms during landing → the die still lands and flies.
- **13.1b NTP-style clock reading (finding 4).** The sessions route stamps `serverNowMs` at the very end, after the
  drive, schedule reads and the awaited presence upsert. `nextDieClockSample` treats that stamp as the round trip's
  midpoint, so the offset is biased by about half the server's processing time (e.g. +300 ms with 700 ms of work). That
  takes 0.3 s off the 3 s late-letter allowance. **Fix:** also return `serverReceivedAtMs` (the route's existing `now`,
  taken at entry). The client computes `offset = ((serverReceivedAtMs − sentAtMs) + (serverNowMs − receivedAtMs)) / 2` and
  `rtt = (receivedAtMs − sentAtMs) − (serverNowMs − serverReceivedAtMs)` (network time only, so the 2 s cap and "fastest
  reading wins" compare network time, not engine work). A reply without `serverReceivedAtMs` (an old server) falls back to
  today's formula. Tests: 700 ms of server work, clocks equal → offset 0; phone 4 s ahead → −4000; missing field → old
  formula.
- **Cost:** zero (one more number on the existing reply).
- **Done 2026-10-30** (commit on `after-app-review`; handoff `docs/category-blitz-letter-die-plan_PHASE_13.1_HANDOFF.md`).

### Phase 13.2 — Sessions reply ordering, completed (13-review findings 5, 6)
- **13.2a A failed reply never blocks an older good one (finding 6).** `loadSession` (`lib/categoryBlitzRealtime.ts`
  ~639 and the catch ~710) moves `appliedLoadSeqRef` forward *before* the `ok` check, so a fast failure on the newest
  request drops an older request's good reply that lands after it. The error banner stays up until the next 15 s poll.
  **Fix:** only an `ok` reply moves `appliedLoadSeqRef`. A failure shows its error only if no newer reply has been applied
  (`seq > appliedLoadSeqRef.current`), and never moves the seq. Test: seq 4 in flight, seq 5 fails fast, seq 4 succeeds →
  seq 4's session is shown and the error clears.
- **13.2b Broadcasts and the round fetch join the ordering (finding 5, plausible).** The guard orders replies only against
  each other. (i) A `session_ended` / `continuous_session_ended` / `session_abandoned` broadcast (~954–979) sets the
  phase without touching the seq, so a poll sent before it can land after and put the ended session (and its old window
  end) back for up to 15 s. **Fix:** those handlers bump `loadSeqRef` and set `appliedLoadSeqRef` to it, so any reply
  already in flight is dropped. (ii) The `await loadCurrentRound(...)` after an accepted reply can finish after a newer
  reply's own round fetch. **Fix:** pass the seq to `loadCurrentRound` and skip its state writes if a newer reply has been
  applied since. Tests: poll in flight, `session_ended` broadcast, stale poll lands → phase stays `complete`; two applied
  replies whose round fetches resolve out of order → the newer round wins.
- **Cost:** zero.
- **Done 2026-10-31** (commit on `after-app-review`; handoff `docs/category-blitz-letter-die-plan_PHASE_13.2_HANDOFF.md`).

### Phase 13.3 — Small engine and comment cleanups (13-review findings 7, 8, 9)
- **13.3a One schedules read per poll (finding 8).** The sessions route reads `listSchedules` in parallel with
  `driveVenueCategoryBlitz`, which reads it again (line ~788). That was already so before the letter die (for
  `nextWindowAt`), but now `scheduleWindowEndAt` can also come from a different read than the one the engine decided on.
  **Fix:** have `driveVenueCategoryBlitz` also return the schedules it read (or the open window). The route uses those
  for `nextWindowAt` and `scheduleWindowEndAt` and drops its own read. Keep the existing callers' return type working (a
  new function or an options flag; check every caller, don't assume). **Cost:** one fewer `category_blitz_schedules`
  read per scheduled-venue poll: about 4 reads a minute per open player tab, less of each.
- **13.3b Cron timing matches its own fit check (finding 7).** `runCategoryBlitzEngine` (~2005) checks the fit at the
  session's round length (12.1b) but times the next start with `nextRoundStartAtMs(latest, false)` (~2012). The comment
  says "exactly like driveVenueCategoryBlitz", but drive passes `existing.testMode`. **Fix:** pass `session.testMode`.
  This changes only test-mode sessions; real sessions have `testMode = false`, so nothing changes for them. Test: a
  test-mode cron session starts its next round at the test intermission.
- **13.3c Stale comment (finding 9).** The `compactChrome` comment (`CategoryBlitzGame.tsx` ~1692) says the die's rows
  are tappable while they cascade in. Since 11.4/12.3 each row is `inert` until its own fade-in finishes. Reword it.
- **Done 2026-10-31** (commit on `after-app-review`; handoff `docs/category-blitz-letter-die-plan_PHASE_13.3_HANDOFF.md`).

### Phase 13.4 — The engine never starts a round past the session's frozen end (13-review finding 1; Andrew: (a))
- **Problem:** `driveVenueCategoryBlitz` (`lib/categoryBlitz.ts` ~838) and `runCategoryBlitzEngine` (~2005) ask
  `roundFitsWindow(now, <live window end>, testMode)`, but the session closes at its own `scheduledEndAt`, frozen at
  creation (`isStaleAutoSession`, ~562). After a partner extends tonight's window mid-game, a round can start just before
  the frozen end and be force-scored at it, ~2 minutes early.
- **Fix (Andrew chose (a), 2026-10-30):** both engines check the fit against the EARLIER of the live window end and the
  session's `scheduledEndAt` (when it parses), exactly as the client's `anotherRoundFollows` already does
  (`lib/categoryBlitzShared.ts` ~186). Put the "earlier of the two" in ONE shared helper (e.g.
  `sessionWindowEndMs(liveEndMs, scheduledEndAt)` in `lib/categoryBlitzShared.ts`) used by both engines and
  `anotherRoundFollows`, so they can't drift again. An extended window still ends the game at the old time (unchanged
  behaviour); what changes is that no round starts that can't finish by then. Do NOT move `scheduledEndAt` on a schedule
  edit (that was option (b), not chosen).
- **Tests:** drive and cron, live window extended to 21:30, frozen end 21:00, now 20:59 → no new round, session closes at
  21:00 as today; frozen end later than live end (a shortened window) → live end wins (12.1 tests still pass); a session
  with no `scheduledEndAt` → live end only. Mutation-check.
- **Cost:** zero (both values are already in memory).
- **Done 2026-10-31** (commit on `after-app-review`; handoff `docs/category-blitz-letter-die-plan_PHASE_13.4_HANDOFF.md`).

### Phase 13.5 — One server-clock "round age" (13-review finding 3; Andrew: fix now)
- **Problem:** 12.2a corrected only the die's late-letter cutoff for phone clock skew. `showReveal`
  (`CategoryBlitzGame.tsx` ~2466, `revealElapsedMs = nowMs − startedAt`), the die watchdog's `sawRoundStart` (~2608) and
  so the Majority Rules takeover (`dieSkipped && showReveal`, ~2624) still use the phone's own clock. On a phone > 3 s
  fast whose die is skipped (tab hidden), the round-start reveal and the Majority Rules banner never play.
- **Fix:** one pure helper, e.g. `roundAgeMs(roundStartedAtMs, phoneNowMs, serverClockOffsetMs)` =
  `phoneNowMs + offset − roundStartedAtMs`, in `lib/categoryBlitzLetterDie.ts` (or `categoryBlitzShared.ts`), used by
  `showReveal`, the watchdog and the die's own cutoff in `dieStage` (so all three agree). The game reads
  `serverClockOffsetMs` from the session hook (already returned, 12.2a). Scope: these three only — the round timer and
  submission deadlines stay as they are (note it for Andrew if it looks worth doing later).
- **Tests:** phone 4 s fast, die skipped (hidden) → the reveal plays and, on a Majority Rules round, the banner plays;
  correct clock + round 6 s old → no reveal (today's behaviour); the 13.1a latch still holds. Mutation-check.
- **Cost:** zero.
- **Done 2026-10-31** (commit on `after-app-review`; handoff `docs/category-blitz-letter-die-plan_PHASE_13.5_HANDOFF.md`).
  The watchdog reads the offset through a ref when it arms, so a new clock reading never re-arms (postpones) it. The
  12.2 contract test that pinned "only the die reads the offset" now pins the 13.5 rule instead.

**Gates for 13.1–13.5** (each sub-phase): `npx tsc --noEmit`; `npx eslint <touched files>`; `npm run test` (only the 4
known Bingo star-index freshness failures expected); `npm run build`, never at the same time as typecheck. Mutation-check
each new test. Each sub-phase is committed locally on `after-app-review`, writes `…_PHASE_13.<N>_HANDOFF.md` and updates
the status line.

### Phase 14 — Re-review + phone pass
- Fresh-eyes `/code-review` of the 13.1–13.5 commits only (`git diff 2899a9d6..HEAD`). Any new finding becomes a new
  sub-phase.
- Then Andrew plays a few rounds on his iPhone (and an Android if available). The pass includes:
  - a Majority Rules round (every 5th);
  - a slow-network round: the die must never hold the board when the letter is several seconds late (11.1a);
  - the die lands normally on a phone whose clock is set a few seconds off (12.2a; Settings → General → Date & Time,
    automatic off — set it back afterwards);
  - the letter never flickers or changes as the die lands (11.3a);
  - tapping a row while the categories cascade in: rows already shown work, the empty space below doesn't (Phase 8,
    11.4, 12.3);
  - tapping Back during the tumble (Phase 9, 11.2);
  - the last round of a scheduled session, where the standings must stay visible, including after the partner
    shortens (11.1b) or extends (12.1a, 13.4: no round starts that would be cut short) tonight's window mid-game;
  - a phone clock a few seconds fast with the app switched away during the tumble: the round-start reveal (and, on a
    Majority Rules round, its banner) still plays when you come back (13.5);
  - judging the die under the header bar (11.2).
- Merge to `main` only after Apple approval.

## 6. Risks
- **Letter arrives late** (slow network / poll): handled by open-ended tumbling, but if it's frequently late the
  die may land a second or two into the round — still no worse than today's reveal.
- **Old phones:** 3D transforms + a full-screen overlay; Phase 3 must check frame rate on a low-end device.
- **Two layout animations at once** (die FLIP + Majority Rules flip): sequenced in Phase 4, never overlapping.

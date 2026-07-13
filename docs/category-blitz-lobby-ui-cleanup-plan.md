# Category Blitz: lobby countdown + pre-round UI cleanup

Tracks the fix for the double pre-round countdown, plus two follow-on UI
cleanups requested alongside it (mode-sign removal, filled-answer counter
removal), plus a root-cause fix for a minor countdown handoff blip found
during verification.

## Done

### Phase 1 — Compute a single unified target timestamp (DONE)
`components/category-blitz/CategoryBlitzGame.tsx`'s `LobbyScreen` now computes
`roundStartAtMs = nextWindowAtMs + lobbyDwellSeconds(testMode) * 1000`, a
single continuous target spanning both "wait for schedule window" and "lobby
dwell." `testMode` is threaded through as a new prop from the call site.
LOE: Small. Model: Sonnet.

### Phase 2 — Render one continuous timer (DONE)
`LobbyScreen` now derives `countdownSeconds` as `lobbyCountdown` (authoritative
once the DB session row exists) falling back to the client-computed
`roundStartAtMs`. Both the idle and lobby card renders read from this single
value with a unified "Game starts in" label — no reset at the idle→lobby
phase transition. `lib/venueScreen.ts`'s `nextStartsAt` now also includes the
lobby dwell offset so the venue home screen's preview matches.
LOE: Small–Medium. Model: Sonnet.

### Phase 3 — Verify in a real browser (DONE)
Seeded a throwaway schedule + user on the `sim-category-blitz` venue, drove
`/category-blitz/play` in Playwright through idle → lobby → round-1-start.
Confirmed: continuous countdown, no full reset, round 1 auto-starts, no
console errors. Found a minor ~2s upward jump at the exact idle→lobby handoff
(see Phase 7 below). LOE: Small. Model: Sonnet.

### Phase 4 — Retire the mode-sign puck; rely on header text + color only (DONE)
Removed `<ModeSign mode={activeMode} />` and its import from
`CategoryBlitzGame.tsx`, deleted `components/category-blitz/ModeSign.tsx`.
The plan's premise that `CategoryBlitzGame.tsx:28` was the only import site
was stale — `DevAnimationPanel.tsx` also had a "Mode sign (persistent)" dev
preview demo; removed that demo, its `ModeSignDemo` component, and its
`DemoKey`/`DEMO_LABELS` entries too, so no dangling import remained. Also
deleted the now-fully-dead `scripts/verify-mode-sign.mjs` (drove only that
demo) and trimmed the now-broken "Persistent ModeSign" screenshot section
from `scripts/verify-mode-flip-matrix.mjs`. Header rule text + per-mode color
theme remain the only mode signal; `CategoryBlitzModeFlipTakeover.tsx` left
untouched. `npx tsc --noEmit` and `npm run lint` clean.
LOE: Small. Model: Sonnet.

### Phase 5 — Remove the "X/12 filled" counter (DONE)
Deleted the `{totalFilled}/{categories.length} filled` text from the header.
`totalFilled` itself is untouched — still used by the post-submit summary
text and `SubmitLockAnimation`'s `answersCount` prop. `theme.progressFill`
(the header progress bar) is a separate, independent visual element and was
left in place.
LOE: Tiny. Model: Sonnet.

### Phase 6 — Browser verification for Phases 4 & 5 (DONE)
Seeded real standard-mode and reverse-mode rounds on `sim-category-blitz` and
screenshotted the live header via Playwright for both. Confirmed: no
mode-sign puck in either mode, header rule text ("Unique answers win — be
original." / "Match the crowd — popular answers win.") plus the green/pink
per-mode color theme clearly distinguish the modes, no "X/12 filled" text,
progress bar still renders. Cleaned up all seeded sessions/users after.
LOE: Tiny. Model: Sonnet.

### Phase 7 — Root-cause fix for the countdown handoff blip (DONE)
Changed `computeLobbyStartsAt`'s first parameter from `now: Date` to
`windowStart: Date` (`lib/categoryBlitz.ts`), so `startsAtMs =
windowStart.getTime() + lobbyDwellSeconds(testMode) * 1000`, still capped at
`windowEnd`. Updated both call sites — `driveVenueCategoryBlitz` (passes
`occurrence.windowStart`) and the cron path in `runCategoryBlitzEngine`
(passes its own in-scope `windowStart`) — to pass the window's actual open
instant instead of `now`. Server `starts_at` and client `roundStartAtMs` are
now pure functions of the same `windowStart`, so they can no longer drift
apart based on detection lag. `npx tsc --noEmit` clean.
LOE: Small. Model: Sonnet.

### Phase 8 — Verify the blip is gone (DONE)
Seeded a schedule opening ~15s out on `sim-category-blitz`, opened
`/category-blitz/play` in Playwright before the window opened, and sampled
the "Game starts in" countdown text every second across the idle→lobby
transition. Result: `01:00 → 0:59 → 0:58 → 00:56` — the idle phase's
client-estimated countdown ticks down by 1s at a time right up to the
handoff, then the authoritative DB value takes over at the very next tick
with only the expected ≤1s `Math.floor` rounding wobble, no upward jump.
Cron path (`runCategoryBlitzEngine`) spot-checked via `tsc --noEmit` — the
signature change type-checks cleanly at its call site, and no test suite
covers it. Cleaned up all seeded schedules/sessions/users after. Full test
suite (`npm run test`) and `npm run lint` also pass.
LOE: Small. Model: Sonnet.

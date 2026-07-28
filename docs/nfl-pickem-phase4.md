# Phase 4 — Back button returns to the venue home screen

Read `docs/nfl-pickem-improvements-plan.md` first.

Requirement #5: tapping the back chevron at the top of the NFL Pick 'Em page
currently drops the user into the game tutorial (the last slide) instead of
leaving the game. It must go to the **venue home screen**. Tutorial slides
should appear only when *entering* the game.

## Diagnose before you change anything

A hypothesis has already been formed from reading the code — confirm or refute
it before implementing, because the fix depends on which mechanism is at work.

**Hypothesis:** the `loadGames` effect in
`components/nfl-pickem/NFLPickEmGameList.tsx` (~lines 100–161) lists
`searchParams` in its dependency array *and* calls
`router.replace("/nfl-pickem?" + newParams)` inside itself. That is a
self-retriggering loop. When the user taps back, `GameAppBar`'s
`handleExit` runs `router.push("/venue/<id>")`, but a queued
`router.replace("/nfl-pickem?week=...")` then fires and navigates them back to
`/nfl-pickem`, which renders `GameLandingExperience` in its non-playing
state — the tutorial.

Supporting facts:
- `app/nfl-pickem/page.tsx` passes `showPlayingBackButton={false}`, so
  `GameLandingExperience` never injects its `backToVenue` handler into the
  child. `NFLPickEmGameList` renders a bare `<GameAppBar game="nfl-pickem" />`
  with no `onExit`, so the app bar uses its own `router.push` fallback and the
  venue return transition (`runVenueGameReturnTransition`) never runs.
- `getOnboardingInitialStep` in `GameLandingExperience.tsx` always returns 0.
  So a true remount would show slide *one*. If the user genuinely lands on the
  *last* slide, the component instance is being preserved across a same-route
  soft navigation with `isPlaying` reset — which the replace-loop explains.

Verify by instrumenting navigation (log every `framenavigated` / router call)
and observing the actual sequence after a back tap.

## Required changes

### Kill the navigation loop

In `NFLPickEmGameList.tsx`:

- Remove `searchParams` and `router` from the `loadGames` effect's dependency
  array — they are not real data dependencies, and including them makes the
  effect re-run on the URL change it itself caused.
- Do not write the URL from inside the data-loading effect. If the `?week=`
  param should stay in sync with the selection, do that in the **`onSelect`
  handler** (the user action) via a separate, non-reactive path — not as a
  side effect of fetching.
- Read `searchParams` once for the initial value; do not subscribe the fetch
  effect to it.

### Wire the back button properly

Prefer routing the exit through `GameLandingExperience`'s existing
`backToVenue` rather than relying on `GameAppBar`'s fallback — it calls
`endCurrentGameSession("abandoned")` and runs the venue return transition, so
analytics and the exit animation behave like every other game. Two options;
pick whichever fits the existing conventions better:

- Flip `showPlayingBackButton` to `true` in `app/nfl-pickem/page.tsx` so
  `GameLandingExperience` clones `onBack` into `NFLPickEmGameList`, and have
  `NFLPickEmGameList` accept an `onBack?: () => void` prop and pass it to
  `<GameAppBar onExit={onBack} />`. Check that this does not introduce a
  *second* visible back control — that prop's name suggests it may render one.
- Or leave the prop alone and pass an explicit exit handler down.

Whichever you choose, the result must be: **one** back control, which lands on
`/venue/<venueId>`.

### Tutorial only on entry

Confirm that after the fix, returning to the venue and re-entering
`/nfl-pickem` shows the tutorial from slide 1, and that tapping back from
gameplay never renders the tutorial at all. Do not disable the tutorial —
the user wants it on entry, just not on exit.

## Acceptance

- From gameplay, tapping the top-left chevron navigates to
  `/venue/<venueId>` and stays there — no bounce back to `/nfl-pickem`.
- The tutorial is never visible as a result of tapping back.
- Re-entering the game shows the tutorial starting at the first slide.
- Switching weeks in the dropdown still works and still updates `?week=`.
- No render loop: switching weeks issues one games request, not a repeating
  series. Verify in the network panel or via a request counter.
- `npm run build` and `npm test` pass.

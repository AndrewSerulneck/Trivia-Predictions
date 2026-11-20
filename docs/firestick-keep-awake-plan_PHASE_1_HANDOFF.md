# Fire Stick keep-awake — Phase 1 handoff

## For Andrew (plain English)
Expand mode on `/owner/display` now keeps the screen awake (it didn't before). I also added a hidden readout that
shows what the keep-awake code is doing; add `?awake=debug` to a link to see it. **Not live:** code is on branch
`fix/firestick-keep-awake`, uncommitted, no PR, no deploy. Tests, lint and typecheck pass. The real-browser check
(plan step 6) was **not** done. After it's merged and deployed, you run Phase 2 on the Fire Stick (steps below).
No cost impact: no new requests, crons or reads.

## For the next agent
1. **Next:** finish Phase 1 (browser check, commit, PR), then Phase 2 is Andrew's device test; Phase 3 (Opus 5.5 / high) fixes Silk from his results. Out of scope now: changing *how* the hook keeps the screen on.
2. **State:** branch `fix/firestick-keep-awake` cut from `main` (0d53d4ba). Nothing committed/pushed/deployed. Many unrelated untracked " 2" duplicate files exist in the tree; don't stage them. Stage only the files in item 4 plus `docs/firestick-keep-awake-plan*.md`. No data changes.
3. **Decisions:** plan D1–D5 stand (both entry paths; preview never holds a phone awake; "Never" screensaver step only if Phase 4 needs it).
4. **Files:**
   - `lib/useKeepScreenAwake.ts`: now `useKeepScreenAwake(enabled = true)`; module-level status store + `useKeepAwakeStatus()` (`useSyncExternalStore`); fields method, wakeLockSupported, wakeLockHeld, releaseCount, lastError, videoPlaying, visibility, sinceMs; event-driven only. Embedded-frame early return kept. `sinceMs` is measured at the last event, not live.
   - `components/venue-screen/KeepAwakeReadout.tsx` (new): bottom-left box, Tailwind, `text-caption`, shows status + `navigator.userAgent`.
   - `components/venue-screen/VenueScreenClient.tsx`: new `awakeDebug` prop renders the readout.
   - `app/venue/[venueId]/screen/page.tsx`: passes `awakeDebug` when `?awake=debug`.
   - `app/tv/[code]/route.ts`: forwards only `?awake=debug` (uses `new URL(request.url)`; existing test passes a plain `Request`, no `nextUrl`).
   - `app/owner/display/page.tsx`: `useKeepScreenAwake(displayExpanded)` in the parent page; reads `?awake=debug` in an effect; readout rendered inside the Expand overlay (`FullscreenExpander` `awakeDebug` prop).
   - `tests/venue-screen-intro-stinger-contract.test.ts`: two new tests in "keep the TV awake"; old assertions kept.
5. **Traps:** the iframe inside Expand never holds a lock (embedded); the parent does. `npm run lint` over the whole repo shows ~309 parse errors from `tmp/group-games-phase-4/**` (pre-existing); lint only the touched files. Full `npm run test` was green apart from the `/tv` test I fixed. Avoid BSD `sed` for edits with brackets/pipes.
6. **Run/verify:** `npx vitest run tests/venue-screen-intro-stinger-contract.test.ts tests/api.tv-display-code.test.ts`; `npx tsc --noEmit`; eslint on the touched files. **Unverified:** actual browser behaviour. Do plan step 6 from a scratchpad clone with mocked routes (never the shared dev server on :3000): readout shows `wake-lock` / held on `/venue/<id>/screen?awake=debug`; Expand shows it held on `/owner/display?awake=debug`, Close releases it, the small preview never takes it.
7. **Open questions:** none for Andrew yet.
8. **First steps:** run the browser check, commit, open PR (end the body with the Claude Code attribution line), then give Andrew the Phase 2 test table from the plan.

### Phase 2 steps for Andrew (once deployed)
Note the Fire Stick's current screensaver/sleep settings; don't change them. Don't touch the remote.
- **A:** Silk → `hightopchallenge.com/tv/<your code>?awake=debug`. Photo of readout at start and just before screensaver time; note if/when it sleeps (watch 30 min).
- **B:** `/owner/display?awake=debug` → Expand. Same.
- **C (only if A fails):** A with Silk's "Request desktop site".

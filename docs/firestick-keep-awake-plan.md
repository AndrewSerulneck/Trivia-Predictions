# Fire Stick keep-awake plan (Display URL in Silk)

**Status:** Phase 1 code done 2026-11-20 on branch `fix/firestick-keep-awake` (uncommitted, no browser check yet); handoff: `docs/firestick-keep-awake-plan_PHASE_1_HANDOFF.md`. Next: browser check + PR, then Phase 2 (Andrew's Fire Stick).

## Summary for Andrew

When partners show the Display URL in Silk on a Fire Stick, the TV goes to sleep. The display is supposed to stop
that already: `lib/useKeepScreenAwake.ts` (shipped 2026-11-13) asks the browser to keep the screen on, and if the
browser says no, it plays a tiny silent video. But nobody has tested it on a real Fire Stick yet (checklist §F in
`docs/tv-display-physical-device-checklist.md` is still unchecked). Looking at the code turned up two problems:

1. **Expand mode has no keep-awake at all (certain bug).** `/owner/display` → **Expand** shows the display inside an
   embedded frame. The keep-awake code purposely does nothing inside embedded frames (so the small dashboard preview
   doesn't keep a phone awake), and the page around the frame never runs it. So Expand on a Fire Stick always
   sleeps.
2. **The direct link may not work on Silk either (suspected).** If Silk *accepts* the "keep screen on" request but
   Fire OS ignores it, the silent-video backup never starts. A muted 1-pixel video may also not count as "playing
   media" for Fire OS.

The plan fixes (1) right away, adds a hidden on-screen readout so you can see on your Fire Stick what the code is
actually doing, and then fixes (2) based on what your test shows. Telling partners to set the Fire TV screensaver to
"Never" is the last resort, used only if a device test proves code can't do it (your answer, 2026-11-20).

**Cost:** none. Everything runs in the TV's browser. No new requests, crons or database reads. The only download
is the existing 1 KB video, which browsers cache permanently.

## Decisions (Andrew, 2026-11-20)

| # | Decision |
|---|---|
| D1 | Partners open the display **both** ways: the short link `/tv/<code>` typed into Silk, and `/owner/display` → **Expand**. Both must stay awake. |
| D2 | Exact symptom unknown (screensaver vs. full sleep, and after how long). Phase 2 measures it. |
| D3 | Andrew has a Fire Stick and will run the device tests (Phases 2 and 4). |
| D4 | Telling partners to set the Fire TV screensaver to "Never" goes in **only if needed**, meaning only if Phase 4 shows code alone can't keep the screen on. |
| D5 | The dashboard's small preview frame must still **never** keep a phone awake (existing rule, `docs/venue-display-hype-and-intro-stinger-plan.md` §8). Keep-awake in the dashboard runs only while Expand is open. |

## Model and effort per phase

| Phase | Who | Model / effort | Why |
|---|---|---|---|
| 1. Expand keep-awake + hidden readout | Agent | **Claude Sonnet 5.5 / medium** | Small, fully specified change to one hook and one page; contract tests pin it. |
| 2. Fire Stick test, round 1 | **Andrew** (on device) | None | Silk can't be emulated; only a real Fire Stick shows what Fire OS does. |
| 3. Fix for Silk based on Phase 2 | Agent | **Claude Opus 5.5 / high** | Shared hook on the live TV display; device-specific behavior that can't be tested locally, so mistakes are costly. |
| 4. Fire Stick test, round 2, then docs | Andrew, then agent | **Claude Haiku 5.5 / low** (docs) | Docs and checklist only. If the "Never" step from D4 is needed, use **Sonnet 5.5 / low**, since that edits pinned copy. |

## Background for agents

- Hook: `lib/useKeepScreenAwake.ts`. Order: Screen Wake Lock (`navigator.wakeLock.request("screen")`), taken again
  on `visibilitychange` and on `release`. If the API is missing or the request throws, it falls back to
  `KEEP_AWAKE_VIDEO_SRC` (`/brand/web/keep-awake-v1.mp4`, 995 bytes): muted, looping, 1×1 px, opacity 0.01. It returns
  early when `window.self !== window.top`.
- Called once, in `components/venue-screen/VenueScreenClient.tsx` (`useKeepScreenAwake();`, ~line 253). Rendered by
  `app/venue/[venueId]/screen/page.tsx`.
- `/tv/<code>` is `app/tv/[code]/route.ts`. It sends a 307 to `/venue/<id>/screen` and **drops the query string**.
- Expand: `FullscreenExpander` in `app/owner/display/page.tsx`. It renders `<iframe src={url} allow="autoplay;
  fullscreen">` inside a fixed overlay and calls `requestFullscreen()` on the wrapper. The parent already tracks
  `displayExpanded` (state set via `onExpandedChange`).
- Contract test: `tests/venue-screen-intro-stinger-contract.test.ts` → `describe("keep the TV awake")` pins
  `request("screen")`, `visibilitychange`, `video.muted = true`, `video.loop = true`, and the
  `window.self !== window.top` check. Update it rather than delete it.
- Rules: `docs/venue-display-hype-and-intro-stinger-plan.md` §8 (standing rules, including the keep-awake line at ~351)
  and `docs/live-trivia-pregame-and-display-cleanup-plan.md` (no player runtime or ads on display paths; set up by
  Display URL only).
- Styling: inline styles are allowed only in `components/venue-screen/*` (CLAUDE.md). The readout lives there.
- Branch from `main`: `fix/firestick-keep-awake`. Don't commit to `docs/7j-ship-status`.

## Phase 1: Expand keep-awake + hidden readout (Sonnet 5.5 / medium)

**Goal:** Expand mode keeps the screen on, and a hidden readout shows what the keep-awake code is doing on any
device. Out of scope: changing *how* the hook keeps the screen on (that's Phase 3).

1. **Hook gets an on/off switch and a status.** `useKeepScreenAwake(enabled = true)`. When `enabled` is false it does
   nothing and releases anything it holds. Keep the embedded-frame early return as it is.
   Add a small status the readout can show: `method` (`wake-lock` | `video` | `none`), `wakeLockSupported`,
   `wakeLockHeld`, `releaseCount`, `lastError` (message only), `videoPlaying`, `visibility`, `sinceMs`
   (time since the hook started). Use a tiny module-level store with subscribe, read with `useSyncExternalStore`.
   No polling. Update on events only (`release`, `playing`/`pause` on the video, `visibilitychange`).
2. **Expand runs it.** In `app/owner/display/page.tsx`, call `useKeepScreenAwake(displayExpanded)` in the top-level
   page (the parent document, not the iframe). This keeps D5: only while Expand is open.
3. **Hidden readout.** `components/venue-screen/KeepAwakeReadout.tsx`: a small fixed corner box (text ≥ 12 px, high
   contrast) listing the status fields plus `navigator.userAgent`. It shows only when the URL has `awake=debug`. On
   the display, `app/venue/[venueId]/screen/page.tsx` passes the flag through as a prop, like `intro`. On
   `/owner/display`, show it inside the Expand overlay when the dashboard URL has `?awake=debug`.
4. **Short link forwards only that flag.** In `app/tv/[code]/route.ts`, if the request has `awake=debug`, append
   `?awake=debug` to the redirect target. Forward nothing else.
5. **Tests.** Extend the keep-awake `describe` block: the owner page calls `useKeepScreenAwake(displayExpanded)`; the
   hook accepts `enabled`; the readout is gated on `awake=debug`; the `/tv` route forwards only `awake`. Keep every
   existing assertion. Run `npm run test`, `npm run lint`, `npx tsc --noEmit`.
6. **Browser check** from a scratchpad clone with mocked routes (CLAUDE.md, Manual Testing). In desktop Chrome, the
   readout on `/venue/<id>/screen?awake=debug` should say `wake-lock`, held. In the dashboard: Expand →
   readout appears and the lock is held; Close → it's released; the small preview never takes it.
7. Open a PR. Deploy follows Andrew's usual merge. Write the handoff note
   (`docs/firestick-keep-awake-plan_PHASE_1_HANDOFF.md`) that includes the exact test steps for Phase 2.

## Phase 2: Fire Stick test, round 1 (Andrew)

Before you start, write down your Fire Stick's current screensaver start time and sleep setting (on most Fire OS
versions: **Settings → Display & Sounds → Screensaver**). **Don't change them.** We're testing what partners have.

Run each test on the live site with nobody touching the remote. Photograph the readout at the start, and again
just before the time the screensaver would normally start.

| Test | Open in Silk | Expand / full screen | Record |
|---|---|---|---|
| A | `hightopchallenge.com/tv/<your code>?awake=debug` | Silk's own full screen, if you normally use it | Readout photos; does a screensaver appear, does it go black, and after how many minutes (watch 30 min) |
| B | Sign in at `/owner/display?awake=debug` → **Expand** | Expand | Same |
| C | Same as A, but Silk's menu → **Request desktop site** | As A | Same; only if A fails |

Send the photos and minutes back. The next agent records them in the Phase 2 handoff note.

## Phase 3: Fix for Silk (Opus 5.5 / high)

**Goal:** both A and B stay awake on the Fire Stick. Choose the fix from what Phase 2 showed:

| Phase 2 result | Fix |
|---|---|
| A and B stay awake | No code change. Go to Phase 4. |
| Readout says `wake-lock` held, but the TV still sleeps (Silk accepts the request, Fire OS ignores it) | On Fire TV / Silk (detect by user agent, `Silk` or `AFT*`, reading the UA in the hook only), run the video **as well as** the wake lock, not just as a fallback. |
| Readout says `video`, `videoPlaying: true`, but it still sleeps | Fire OS isn't counting the video as playback. Try, in this order, re-testing on the device after each one: (a) a slightly bigger, fully opaque video (e.g. 2×2 px in a corner, opacity 1 on black); (b) a new video file **with a silent audio track** played muted, plus `navigator.mediaSession.playbackState = "playing"`. New artwork means a new file name, e.g. `keep-awake-v2.mp4` (immutable cache rule). |
| `videoPlaying: false` | Autoplay blocked. Start the video from the first remote press (any `keydown`) as well as on load. For Expand, the Expand tap already counts. |
| Fails only in B | Check that the parent page's lock survives `requestFullscreen()` and the iframe. Take the lock again on `fullscreenchange`. |

Rules: no polling or timers that hit the network. Keep D5 (the preview never holds a phone awake). Keep the existing
contract assertions and add new ones for whatever you change. Keep the readout. It's free and useful for support.
Ship behind a normal PR, then ask Andrew to repeat Phase 2's tests. Write the Phase 3 handoff.

## Phase 4: Fire Stick test, round 2, then docs (Andrew, then Haiku 5.5 / low)

1. Andrew repeats tests A and B for 30 minutes each, plus one full evening on the display with the remote untouched.
2. **If it passes:** tick the Keep-awake lines in `docs/tv-display-physical-device-checklist.md` §F. Update the keep-awake
   line in `docs/venue-display-hype-and-intro-stinger-plan.md` §8 (Expand holds the screen in the parent page;
   the readout is behind `awake=debug`; any Fire TV rule from Phase 3).
3. **If it still sleeps (D4 triggers):** add one short line to the Fire Stick steps on `/owner/display` (e.g. "Set
   Fire TV Screensaver to Never."), checking the exact menu names on Andrew's device first. Update
   `tests/owner-display-page-contract.test.ts`. Use Sonnet 5.5 / low for this, since it's pinned copy.
4. Mark this plan **Done** in the status line.

## Risks

- Fire OS versions differ. One Fire Stick passing doesn't prove every model will. Note the model and Fire OS version
  from the readout's user agent in the handoff.
- A TV's own power saving (the TV, not the Fire Stick) or HDMI-CEC can still turn the screen off. Code can't
  control that. If Phase 2 shows the TV itself switching off, record it. It's a partner setup note, not a code fix.

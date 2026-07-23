# Venue Display — Expand UX + Pairing follow-ups

Follow-up work after `docs/venue-tv-display-content-fit-plan.md` (content-fit,
Phases 0–4, all DONE). This plan covers four owner-facing tweaks to the **Venue
Display** dashboard page (`app/owner/display/page.tsx`) and a clarification of
the TV pairing model.

## The pairing question — answered up front (no architecture change needed)

**Question:** does `hightopchallenge.com/tv` show one shared code to every venue,
which would break once many venues run different games at once?

**Answer: no — the system is already per-TV and per-venue.** The URL is shared
but the code behind it is not:

- `/tv` calls `POST /api/tv-pair` on every load → `mintPairingCode()`
  (`lib/tvPairing.ts:87`) **inserts a fresh random 6-char row** each time. Every
  TV that opens `/tv` gets its own distinct code.
- The owner claims *that specific code* in the dashboard → `claimPairingCode()`
  (`lib/tvPairing.ts:156`) binds **that one code to that one venue**, after
  server-side venue-ownership verification.
- The TV polls its own code (`app/tv/page.tsx:51`), sees the claim, and redirects
  itself to `/venue/{venueId}/screen` — a **venue-scoped** route driven entirely
  by that venue's own game state.
- The TV then caches its `venueId` in `localStorage` (`app/tv/page.tsx:14`) and
  auto-resumes to *its* screen on every power-cycle, no re-pairing.

So N venues each pair once to their own venue and thereafter live on their own
`/venue/{id}/screen`; the single `/tv` URL is a stateless bootstrapper, not the
display. This is actually **better** than per-venue TV URLs — the owner never has
to type a venue-specific URL into a TV remote (the genuinely hard part on a TV);
any TV hits one memorable URL and gets claimed to the right venue.

**The only real defect** is copy, not architecture: the dashboard says *"It'll
show a code"*, which reads as if there is one global code. (The `/tv` screen
itself already says *"This is this TV's own code"* — `TvPairingDisplay.tsx:178` —
so only the dashboard side misleads.) Fixed in Phase 4 below.

## Phases

### Phase 1 — Remove the "Open full screen" link
Delete the `<a href={displayUrl} target="_blank">Open full screen</a>` in the
Preview header (`app/owner/display/page.tsx:189-196`). Keep **Expand**. The
`displayUrl`, `handleCopy`, and the Manual-setup panel still expose the raw URL
for anyone who wants a real new tab, so nothing is lost.

**Watch for:** `displayUrl` is still used by Expand, Copy, and Manual setup — only
the one anchor goes, not the variable.

**Files:** `app/owner/display/page.tsx`.
**Model:** Haiku (or Sonnet) · **Effort:** Trivial — delete one element.

### Phase 2 — Expand should follow the phone's physical orientation
**Reported:** after tapping Expand, a **vertical** phone shows a **landscape**
view and a **horizontal** phone shows a **portrait** view — inverted from what's
wanted. Desired: vertical phone → portrait fill, horizontal phone → landscape
fill (the expanded view simply matches how the phone is held, always upright and
edge-to-edge).

**Root cause:** the current `FullscreenExpander`
(`app/owner/display/page.tsx:286-479`) was deliberately built to **force a
landscape view out of a portrait phone** — via `screen.orientation.lock("landscape")`
where supported, and on iOS Safari (no lock, no programmatic fullscreen on a
`<div>`) via the `rotateFallback` branch that CSS-rotates the iframe 90° and
swaps its width/height. That original goal is the *opposite* of the new
requirement, so both the orientation-lock and the 90° rotate fallback have to go.

**Fix:** make Expand a plain edge-to-edge overlay that lets the embedded venue
screen fit whatever orientation the phone is actually in:
- Drop `screen.orientation.lock(...)` entirely (no forced landscape).
- Drop the `rotateFallback` state, the `overlayBox` measurement, the rotated-iframe
  `style`, and the rotated Close-button positioning — all of it exists only to
  serve the forced-rotation behavior.
- Keep the real Fullscreen API request on the wrapper where it's granted (Android
  Chrome / desktop) — that already respects device orientation; just don't lock.
- The overlay stays `fixed inset-0`, the iframe stays `h-full w-full`. The
  embedded screen's own `ViewportFitCanvas` then measures a portrait window when
  the phone is vertical (letterboxed 16:9, i.e. portrait-shaped fit) and a
  landscape window when horizontal (full-bleed) — exactly the requested mapping,
  with zero rotation math.

This is a net **simplification** — a large chunk of the component is deleted, not
added.

**Watch for:**
- **iOS Safari is the real test surface.** The whole rotate fallback existed
  because iOS blocks `<div>` fullscreen; removing it means Expand on iOS becomes
  "a `fixed inset-0` overlay that fills the visual viewport," which is fine and is
  what's wanted — but must be confirmed on a real iPhone (portrait *and*
  landscape), not just a desktop devtools emulator, which does not reproduce iOS
  toolbar/viewport quirks.
- A vertical phone will now show the 16:9 screen letterboxed into a portrait box
  (smaller). That is the requested behavior (portrait when vertical); the user
  rotates the phone to landscape to see it big. Confirm that's understood — it is
  what the request literally asks for, but it does make Expand-while-vertical a
  smaller view than the old forced-landscape did.

**Files:** `app/owner/display/page.tsx` (the `FullscreenExpander` component, plus
the now-unused `WebkitFullscreen*` types / `isDevicePortrait` helper if nothing
else references them).
**Model:** Sonnet · **Effort:** Low-Medium — mostly deletion, but the fullscreen/
orientation API surface is fiddly and the acceptance check is a real-device pass.

### Phase 3 — Conspicuous auto-fading Close button (tap to reveal)
Make the Close control obvious on entry, fade it out after a few seconds so it
doesn't sit over the screen, and bring it back on tap — standard video-player
chrome.

**Fix (in the same expanded overlay):**
- Add a `controlsVisible` state, initialized `true` on expand.
- Start a ~3–4s timer that sets it `false`; clear/reset the timer on any pointer/
  touch/key interaction with the overlay (`onPointerDown` on the `fixed inset-0`
  wrapper).
- Make the Close button visually louder than today's small pill — larger tap
  target, higher-contrast fill, a clear "✕ Close / Exit full screen" label — and
  wrap it in an opacity/`pointer-events` transition driven by `controlsVisible`.
  (Tailwind `transition-opacity duration-300`, `opacity-0 pointer-events-none`
  when hidden.) Keep `min-h-11` for touch.
- Optional nicety: a brief "Tap to show controls" hint that fades with the first
  timeout.

**Watch for:**
- With real fullscreen (Android/desktop), interaction still needs to reach the
  overlay — the iframe swallows pointer events, so the reveal listener must sit on
  the overlay wrapper and the iframe may need `pointer-events-none` while
  controls are hidden, or a transparent tap-catcher layer above it. Decide based
  on whether the embedded screen needs its own interactions (it doesn't — it's a
  passive display), so `pointer-events-none` on the iframe is the simple answer.
- Don't let the fade timer fire while the user is mid-interaction; reset on each
  interaction, and consider keeping controls up while a pointer is down.

**Files:** `app/owner/display/page.tsx`.
**Model:** Sonnet · **Effort:** Low — self-contained overlay state + a transition.

> Phases 2 and 3 touch the same overlay and should ship together; do Phase 2's
> deletion first so Phase 3's controls are built on the simplified overlay.

### Phase 4 — Fix the pairing copy so it doesn't imply one global code, and set the re-pair expectation
Two related misconceptions to correct in the "Link a TV" helper text
(`app/owner/display/page.tsx:145-148`):

1. **Not one shared code** — already covered above.
2. **Pairing is per-browser/per-device, not per-venue-forever.** The linked state
   lives in that device's `localStorage` (`tp_tv_venue_id`), not on the server —
   there's no "this venue's paired devices" registry. So switching from a
   Firestick's browser to Apple TV's, or even just opening a different browser on
   the same TV, lands on a fresh unpaired `/tv` with no memory of the prior link.
   That's *expected*, not a bug, but nothing tells a first-time owner to expect
   it — so it should say so up front rather than surprise them later.

> On the TV's browser, go to **hightopchallenge.com/tv**. Each TV shows its **own
> one-time code** — enter *that TV's* code below to link it to
> {selectedVenue.name}. Each device or browser needs its own one-time link — if
> you switch devices (e.g. Fire Stick → Apple TV) or open a different browser,
> just repeat this step. Nothing is lost.

No functional/engine change — the pairing model already does the right thing;
this phase is entirely about setting correct expectations in copy. Optionally
also surface that a venue can link **multiple** TVs (each with its own code) if
that isn't already obvious to owners.

**Files:** `app/owner/display/page.tsx` (copy only).
**Model:** Haiku · **Effort:** Trivial.

## Suggested order
1. **Phase 1** (delete link) + **Phase 4** (copy) — trivial, ship immediately.
2. **Phase 2** (orientation) then **Phase 3** (close button) — same overlay, one
   real-device verification pass covers both.

## Model / effort summary

| Phase | Model | Effort |
| --- | --- | --- |
| 1 — Remove "Open full screen" | Haiku | Trivial |
| 2 — Expand follows device orientation | Sonnet | Low-Medium |
| 3 — Auto-fading conspicuous Close button | Sonnet | Low |
| 4 — Pairing copy clarification | Haiku | Trivial |

No Opus needed — none of this is the layout/animation/measurement work that
justified Opus in the content-fit plan. The only non-mechanical risk is Phase 2's
iOS Safari behavior, which is a verification concern (real iPhone), not an
algorithmic one.

## Acceptance (real-device, after Phases 2–3)
- iPhone held **vertical** → Expand shows a **portrait-fit** screen, upright.
- iPhone held **horizontal** → Expand shows a **full landscape** screen, upright.
- Close button is prominent on expand, fades after a few seconds, and reappears on
  tap.
- No "Open full screen" link in the Preview header; Expand remains.
- Dashboard "Link a TV" copy no longer implies a single shared code.

# Venue Activation Map + Radius Dial — Real-Device Checklist

Every automated pass to date (Phases 1-5) stubs the Google Maps key away
(`/api/admin/maps-key` returns `{ ok: false }` in every jsdom probe), so **the
whole premise of this plan — "the circle grows under your finger while you
drag the dial" — has never once been observed working, by anyone, in any
phase.** Headless tooling cannot judge a touch gesture or real Maps rendering
per `CLAUDE.md`. Sign-off is Andrew's, on a real iPhone (Safari), iPad
(Safari), and desktop Chrome.

## 0. First check, before anything else below

Phase 4's as-built notes flag this as the most likely outright failure, not a
polish item:

- [ ] **iPhone SE-class screen (or narrower), mobile step 2 ("About the
      venue"):** with a pin already set, is the radius dial visible on screen
      *at the same time* as the map, without scrolling? The stack is 320px
      map → pin card (label + coords + 48px GPS button + hint) → dial card
      (readout + 48px track + three 56px chips) — on a 667pt-tall viewport
      this is expected to overflow. If it does, the entire point of the plan
      is lost and this is a blocker, not a nice-to-have.
  - If it fails, try in this order (Phase 4's own suggested fix order): (a)
    shrink the map from `h-80` to `h-56`/`h-64` on small screens only — it's
    a Tailwind class on `VenueMapPicker`'s map `<div>`
    ([VenueMapPicker.tsx:319](components/admin/VenueMapPicker.tsx#L319)); (b)
    make the map sticky within the step-2 scroll container so it stays
    visible while the dial scrolls under it; (c) collapse the pin card
    between the map and dial into a single line. Don't reach for a redesign
    before trying (a).

## 1. Drag the pin (map)

- [ ] Drag the red marker with a finger on iPhone Safari — the pin moves
      smoothly, no stutter, no snap-back mid-drag
- [ ] Release the drag — the blue circle re-centers on the new pin position
- [ ] Same on iPad Safari
- [ ] Same on desktop Chrome with a mouse

## 2. Drag the radius dial

- [ ] Drag the dial thumb left/right with a finger on iPhone Safari — the
      numeric readout updates live, and **the map circle visibly grows/shrinks
      in real time while dragging**, not just after release
- [ ] The page does not scroll while dragging the dial track (this is the
      `touch-action: none` / `.tp-dial-track` contract in `app/globals.css` —
      if it scrolls instead of dragging, that rule is the first thing to
      check)
- [ ] While the dial is mid-drag, the circle's outline is visibly **thicker**
      than when idle (`radiusEditing` → `CIRCLE_STROKE_EDITING`, 4px vs 2px in
      [VenueMapPicker.tsx](components/admin/VenueMapPicker.tsx)) — confirms
      the "circle is the object being edited" feedback loop actually reads on
      a real screen, not just in code
- [ ] Tap each of the three preset chips (Standard/Large/Campus) — the dial
      thumb jumps to the right position and the circle resizes to match
- [ ] Same three checks on desktop Chrome (mouse drag instead of touch)

## 3. Zoom refit while dragging (the 15% threshold)

Phase 1 left the "refit zoom when radius changes >15% from the last fit" as
the one tunable knob, explicitly deferred to this checklist because it can
only be judged by feel, live, over a real map.

Code-review remediation Phase 3 (2026-08-06) fixed a real bug here: the
refit guard previously checked only `dragInProgressRef` (marker drags), not
`radiusEditing`, so the map could re-zoom **while the dial itself was being
dragged** — directly contradicting the "watch the circle grow under your
finger" goal. The guard now also skips while `radiusEditing` is true, and a
skipped-but-material change is deferred via `pendingFitOnReleaseRef` and
fires exactly once when the dial is released.

- [ ] **Drag the radius dial across a large range in one continuous
      motion — the map must not re-zoom until release.** This is the specific
      regression Phase 3 fixed; confirm no re-zoom happens mid-drag at all
      now, not even a single jump.
- [ ] Drag the dial from a small radius (e.g. 25 m) up to a large one (e.g.
      2000 m) in one continuous motion — does the map noticeably "jump" or
      re-zoom **while you're still dragging**? It shouldn't (refit is gated
      off during drag); it should refit once, smoothly, shortly after you
      release
- [ ] Does the circle ever overflow past the visible map edge before a refit
      catches up? If the threshold feels too sluggish (circle overflows
      often) or too twitchy (map re-zooms on every small nudge), the knob to
      tune is the `0.15` literal in `fitToCircle`'s caller in
      [VenueMapPicker.tsx](components/admin/VenueMapPicker.tsx) (search
      `changedMaterially`)
- [ ] Do several small nudges in a row (arrow keys or small drags), each
      under the 15% threshold, then release — confirm no refit ever fires for
      the sub-threshold nudges, and confirm a later large drag still refits
      correctly afterward (checks `lastFitRadiusRef`/`pendingFitOnReleaseRef`
      bookkeeping isn't left in a bad state by the earlier no-op nudges)

## 4. Container resize / zero-to-visible mount (Risk #1)

This was Phase 1's single most-flagged risk, and Phase 3 confirmed the map
now mounts inline (never inside a `display:none` sheet) for the first time in
this plan.

- [ ] Open the mobile Activate-a-Venue flow fresh, set an address so the pin
      appears — the map must render fully (not grey/blank) the first time it
      becomes visible
- [ ] Rotate the device (portrait → landscape → portrait) while the map is on
      screen — no grey/blank canvas after rotation
- [ ] On desktop, resize the browser window (or toggle a sidebar/panel that
      changes the form's width) while a venue with a pin is open in edit mode
      — the map should not go grey/blank

## 5. `recenter()` on first GPS fix

- [ ] On a **blank create form** (no pin yet — the dashed "map appears once
      there's a pin" placeholder is showing), tap "Use my current location" —
      the map should mount already centered on your real position, not on the
      default NYC center then jump
- [ ] On a form that already has a pin from address lookup, tap "Use my
      current location" — the map recenters and the pin moves to your GPS fix

## 6. GPS permission denied / failed

- [ ] Deny location permission when prompted — the amber "Location is blocked
      for this browser…" message appears and the pin does not move
- [ ] With location services off entirely (device-level), tap "Use my current
      location" — the appropriate fallback copy appears ("This device can't
      share its location…" or the timeout/failure message)

## 7. One full real-world activation, both surfaces

- [ ] Mobile: create a throwaway venue end-to-end on a real phone — address
      autocomplete → drag pin → drag dial to a deliberately odd radius (e.g.
      412 m, to confirm snap-to-25/50 feels right under a finger) → Activate
      venue → confirm the saved radius matches what the dial showed
- [ ] Desktop: same flow in desktop Chrome, using the "Advanced" disclosure
      at least once to confirm typed lat/long still updates the map and dial
- [ ] Delete both throwaway venues afterward

## 8. Regression sweep

- [ ] Edit an existing venue (has a stored radius that may not fall on the
      25/50 snap grid, e.g. an old 200 m or hand-typed value) — the dial
      should render at the on-grid snapped position without silently
      rewriting the stored value until the admin actually interacts with it
- [ ] Confirm the Place ID caption above the map still shows/hides correctly:
      present after an address-lookup pin, replaced by "Coordinates set
      manually" after a drag/GPS/manual edit

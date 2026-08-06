# Admin Mobile — Real-Device Checklist

Automated tooling (headless browsers, CI) cannot verify these — no browser
chrome, no real keyboard, no real safe-area insets. Sign-off is Andrew's,
on an actual iPhone and Android device, in Safari and Chrome respectively.

## Address autocomplete (Activate-a-Venue, step 1)
- [ ] iOS Safari: keyboard type is sensible for an address field (not numeric-only)
- [ ] Autocorrect/autocapitalize doesn't mangle a typed street address mid-entry
- [ ] The suggestion dropdown is fully visible above the keyboard, not clipped
      or covered by it
- [ ] Android Chrome: same three checks

## Safe-area insets
- [ ] Portrait: content clears the notch/Dynamic Island at the top and the
      home indicator at the bottom (sticky action bar in particular)
- [ ] Landscape: content clears the side notch cutout
- [ ] Bottom tab bar (mobile shell) never sits under the home indicator
- [ ] **Mobile shell header (code-review remediation Phase 2):** on a notched
      iPhone, the admin header title and the 44×44 "More" (⋯) button sit fully
      below the status bar and are both legible and tappable — not squeezed
      into a thin strip. The header was `h-14` + `pt-[env(safe-area-inset-top)]`,
      which under `border-box` let the inset eat the content box; it is now
      `min-h-14` so the header grows by the inset instead. Check portrait and
      landscape.

## `min-h-[100svh]` shell under the dynamic toolbar (Phase 2 regression risk)
- [ ] Load `/admin` on iOS Safari, scroll down until the URL bar/toolbar
      collapses, then scroll back up — no clipped content, no blackout,
      no jump
- [ ] Same check inside the mobile shell (bottom tab bar visible throughout)
- [ ] Same check on Android Chrome's dynamic toolbar

## Map pin adjustment (Activate-a-Venue, optional step)
- [ ] Map opens in the bottom sheet without layout jank
- [ ] Pin drag/tap-to-place works with a finger (not just mouse-precision)
- [ ] Confirming the adjusted pin updates the geofence center correctly

## Bottom sheets (Venues detail, Billing Grant/Discount/Custom-rate)
All three Billing modals (Grant, Discount, Custom-rate) now share
`components/admin/AdminModalSheet.tsx` (`docs/billing-dollar-rate-plan.md`
Phases 6A/6B) — before that, backdrop-tap dismiss and the body-scroll lock
did not exist anywhere in `components/admin/`, so the two items below were
structurally unpassable. They are now expected to pass; if either fails on
device, it's a regression in `AdminModalSheet`, not a pre-existing gap.
- [ ] Swipe-down or backdrop-tap dismisses the sheet
- [ ] Long sheet content scrolls inside the sheet, not the page behind it
- [ ] No body-scroll bleed — the page underneath doesn't scroll with the sheet open
- [ ] Opening a sheet, then rotating the device, doesn't break layout
- [ ] Escape (external keyboard / Android back gesture where applicable) closes the sheet

The promo-code panel (`BillingSection.tsx`, `promoPanelOpen`) is **inline**,
not a modal/sheet — it does not use `AdminModalSheet` and has no backdrop or
scroll-lock behavior to check. It was previously listed alongside these three
as if it shared their sheet behavior; it doesn't, so it's out of scope here.

## Desktop/Mobile mode switch
- [ ] Desktop → Mobile (sidebar footer button) lands on the chooser or mobile
      shell as expected
- [ ] Mobile → Desktop (via the "⋯" bottom sheet) returns to the full desktop
      console
- [ ] Preference persists across a reload (localStorage) in both directions
- [ ] A deep link (`/admin?section=venue-manage`) still bypasses the chooser
      correctly after switching modes at least once

## One full real-world activation
- [ ] Create a throwaway venue end-to-end on a real phone: address
      autocomplete → name/radius → Advanced (skip) → success screen
- [ ] TV display URL on the success screen actually loads the venue screen
- [ ] Delete the throwaway venue afterward (`DeleteVenueModal` flow) and
      confirm it's gone from the Venues list

## Remediation R2/R3 sign-off (added by Phase R5)

- [ ] **R3, iPhone Safari:** scroll Venues and Partner Billing to the bottom
      on the mobile shell. The 3-tab bar must remain visible and tappable the
      whole time, with the toolbar both expanded and collapsed. Rotate to
      landscape and repeat.
- [ ] **R3, iPhone Safari, desktop mode:** the `h-14` header must stay put
      while the content pane scrolls under it.
- [ ] **R3, Android Chrome:** same two checks above, plus the
      collapsing-URL-bar transition.
- [ ] **R3, regression sweep:** open Category Blitz and one other game route
      on the same build and confirm no black band — the historical failure
      (35115fc) was CSS leaking off this exact `min-h/h-[100svh]` pattern,
      and R3 restored `h-full` on the same surface.
- [ ] **R2, VoiceOver (iOS) / TalkBack (Android):** with the Partner Billing
      detail sheet closed, swipe through the whole screen. Grant / Extend /
      Discount / Custom rate / Revoke must not be announced or focusable.
      Open the sheet and confirm they are.
- [ ] **R1, on venue wifi:** type an address fast enough to fire overlapping
      lookups, then tap a prediction. The street line and the map pin must
      match the prediction that was tapped.
- [ ] **R4:** first paint of `/admin` on a cold cache over a phone
      connection. Eager client JS dropped 1197.0 KiB → 613.9 KiB — expect
      first paint to feel roughly half the weight it was pre-remediation. A
      brief "Loading…" flash on first tap into each nav group/tab is
      expected and correct (the code-split working), not a regression — it
      must be brief and must never be sticky.
- [ ] **R4:** click through desktop → every nav group, and mobile → all
      three tabs, on a real build; confirm each section renders content
      rather than sticking on "Loading…" or throwing into
      `SectionErrorBoundary`. Also pass once through `/admin/[section]/<slug>`
      (the legacy `AdminConsole` route) — it changed in R4 too and is easy to
      forget since `AdminShell` is what's normally used.

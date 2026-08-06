# Phase 4 — Activate-a-Venue flow

**The core deliverable.** A salesperson standing in a bar must be able to
activate a location on a phone, quickly, without knowing the admin's internal
structure.

## The problem being solved

Today this means: Venues → a ~240-line 2-column form with ~18 equally-weighted
fields (`VenuesSection.tsx:716-957`, including lat/long, county, region, brand
colors) → then separately Partner Billing → then Game Settings. No guidance, no
completion state.

## The flow

One guided route, single column throughout.

1. **Address first.** The existing address autocomplete
   (`VenuesSection.tsx:748`) fills street / city / state / zip / lat / long in a
   single action. Lead with it — this is the highest-leverage field and today it
   is buried at equal weight with everything else.
2. **Then the minimum** — venue name, geofence radius.
3. **Everything else collapsed under "Advanced"** — county, region, brand
   colors, display name, and the rest. Reachable, not in the way.
4. **No map picker on the critical path.** Offer it as an optional "adjust pin"
   step for when GPS puts the pin in the wrong place — which is the main thing
   that actually goes wrong in the field.
5. **Success screen** showing the new venue's TV display URL and a clear next
   step into granting billing access.

## Design judgment required

This is why this phase is Opus/high. Decide, and record the reasoning in the
run log:
- which fields are genuinely required to activate vs deferrable to later
- what the recovery path is when the address lookup is wrong or the venue has
  no clean street address
- what "activated" means as a completion state, and how the screen shows it
- whether billing grant belongs inline or as a handoff

## Constraints

- Reuse the existing venue create/update APIs and validation. This is a new
  presentation, not a new backend. Do not weaken server-side validation to make
  a shorter form work.
- Follow the mobile conventions Phase 3 established (see the run log).
- Tailwind only, strict TS, `@/` imports.

## Verify
`npm run build`, `npx tsc --noEmit`, `npm test`. Drive the flow end-to-end in a
browser at phone width against a throwaway venue, then delete it. Note in the
run log anything only a real device can confirm — that goes to Phase 6.

# Signup price copy + partner geofence — Phase 8 handoff (2026-11-03)

## For Andrew (plain English)

The re-review of Phases 1–7 is done. It found three small problems on the Venue Location page, and they are fixed:
a server error page now shows "Couldn't load / save your venue location" instead of a code error, and a failed
location load now has a **Try again** button.

It also found one **bigger, older problem that needs your decision** (it is not caused by this work, but this
work makes it worse): someone can claim one of your live venues that has no owner during signup, never pay, and
still use the Partner Dashboard for it. Today that already lets them change game settings, messages and prizes.
With Venue Location they could also move that venue's pin up to 1 km per save, which can stop real players
joining. Production right now: **7 of 12 live venues have no owner** and could be claimed this way.

**Nothing is live.** Phases 3, 5, 6, 7 and 8 are uncommitted on `after-app-review`. Nothing is pushed or deployed.
No database migration, environment variable, cron job or paid service is needed.

### Release note — what to check on your phone

Use checklist section **N** in `docs/partner-dashboard-app-redesign-device-checklist.md` (12 lines). Do it
standing inside a test venue you own, because a save changes the real venue. Tell the tester:
- which test venue has a radius over 200 m (1 venue does), and
- which test venue sits at 0,0 (3 do).

### What I need from you

1. **The unpaid-claim problem (Q1 below):** choose whether Venue Location should refuse to save until the venue
   is paid for, or whether to fix the claim flow for every dashboard page, or to accept it for now.
2. **Permission to commit** Phases 3, 5–8 on `after-app-review`. They are not pushed. `main` stays frozen until
   you confirm App Store approval.

---

## For the next agent

### 1. Next phase goal / scope
The plan has no Phase 9. What remains: Andrew's answer to Q1, a commit when he approves it, his phone pass
(checklist N), and a release to `main` only after he confirms App Store approval. Out of scope until he answers:
any billing gate on owner routes.

### 2. Starting state
- Branch `after-app-review`. Last commit `82b7fbe1` (Phases 1–2). Phases 3, 5, 6, 7 and 8 are **uncommitted**:
  `git status` shows the modified/untracked files listed in §4. Nothing is pushed or deployed. No data changed.
- Production was **read** once (no writes): 16 venues, 12 live (not hidden, not at 0,0), 7 live with no
  `venue_owner_venues` link, 1 owner link with no `billing_subscriptions` row on either owner or venue,
  `venues.radius` is a number on every row (no nulls).

### 3. Decisions already made
D1–D7 in the plan, unchanged. Phase 8 review triage (`/code-review high 82b7fbe1~1`, 9 findings):

| # | Finding | Decision |
|---|---------|----------|
| 1 | PATCH only checks the owner link, and an unpaid signup can claim a live unowned venue (`app/api/owner/signup/route.ts` ~line 500 inserts the link before Stripe) | **Not fixed. Needs Andrew (Q1).** The hole is older than this plan, and every `requireOwnerAuth` route has it (game settings, messages, rewards and more). A gate here would need a "paid or admin-activated" check. `findPendingSignupByOwnerId` does NOT catch it, because a claimed admin venue is "not self-serve". |
| 2 | The 1 km cap applies to each save, so repeated saves can walk the pin anywhere | **Accepted.** D6 says "per save" on purpose. Every save logs `[OwnerVenueLocation] updated venue=… moved_m=…`. Listed under Open question 2 in the plan. |
| 3 | Read, then unconditional update (TOCTOU); two tabs could each move 900 m | **Not fixed.** It gives nothing that #2 doesn't already allow, and a double-submit is already blocked by `saving`. |
| 4 | `res.json()` with no catch on the location GET and the PATCH | **Fixed.** |
| 5 | A failed location load has no retry | **Fixed:** Try again button, `locationReloadKey`. |
| 6 | For a 600 m venue, the dial can't be dragged to 200 | **Known limit** recorded in Phase 5. The 200 m chip works. |
| 7 | The null-radius fallback is dead code (`radius` is never null in production) | **Kept.** The plan chose it as a defence; it costs nothing. |
| 8 | A reload keeps a stale `selectedVenueId` | **Guard added** (one line). In practice it can't be reached: the list reloads only after a failed first load, when nothing is selected yet. So there is no test for it. |
| 9 | Four DB round trips per PATCH | **Not fixed.** Saves are rare, and `requireOwnerAuth` is shared. |

### 4. Files changed in Phase 8
- `app/owner/venue-location/page.tsx`:
  - `locationReloadKey` state, added to the location effect's deps. A **Try again** button shows when
    `!saved && error`.
  - Both `res.json()` calls now use `.catch(() => ({}))`.
  - `setSelectedVenueId` keeps `prev` only if it is still in the loaded list.
- `tests/owner-venue-location-page.render.test.ts`: `locationGetFails` / `patchFails` mock flags (they return a
  non-JSON 502/504), and a new describe "error recovery (Phase 8)" with 2 tests.
- `CLAUDE.md`: one bullet under Architecture, "Partner geofence".
- `docs/partner-dashboard-app-redesign-device-checklist.md` §N: the save-message line now has the Phase 7 copy.
- The plan's status line.

### 5. Facts and traps
- Owner auth means "has a link". It does not mean "has paid" (finding #1).
- `npm run build` can run while Andrew's `next dev` is up (Next 16 dev writes `.next/dev`). It completed fine.
- Known test noise: 4 MLB/NFL star-index freshness tripwires fail on a clean tree.

### 6. Verification
- `npx tsc --noEmit`: clean.
- eslint on the changed files: clean.
- `npm run test`: 6,124 pass, 4 fail (the tripwires above).
- `npm run build`: OK, and `/owner/venue-location` is built.
- Not done: a real-browser run (jsdom render tests cover the new paths) and the phone pass (Andrew).

### 7. Open questions for Andrew
- **Q1 — ANSWERED 2026-11-03: (c) accept the risk.** Andrew judged an unpaid claim very unlikely. Do not add a billing gate unless he reopens it. Original question: for an unpaid claim of a
  live venue, choose one:
  - (a) Venue Location PATCH refuses unless the venue has a `billing_subscriptions` row (via
    `lib/venueBilling.ts`) or was admin-linked. The one owner with no billing row today must be checked first.
  - (b) Fix the claim flow so the link is written only after payment. This covers every dashboard route.
  - (c) Accept the risk for now.
- Plan Open questions 1–3 (radius range, the 1 km cap, page placement) are still open and don't block.

### 8. Recommended first steps
Get Andrew's answer to Q1. If (a): Opus, medium effort. Add the check in the route after `forbidden()`, add
route tests, and don't touch `requireOwnerAuth`. If (b): it's its own plan under
`docs/partner-self-serve-signup-plan.md`. Then commit (with his OK). Don't push `main`, deploy or touch
Production env until he confirms App Store approval.

## Update (2026-11-03, after the note above)
- Andrew approved the commit. Phases 3, 5–8 are committed on `after-app-review` (commit "Partner Venue Location
  page (Phases 3, 5-8)"). Not pushed, and `main` is untouched.
- A real-browser check ran before the commit: a scratchpad clone with no `.env.local`, `next dev -p 3107`, and
  Playwright with every `/api/*` call mocked (0 unmocked calls). Verified: a non-JSON 502 on the location load
  shows "Couldn't load your venue location." plus Try again, and Try again recovers. A stored 600 m shows the "set by
  Hightop" note. Tapping the 200 m chip hides the note and sends PATCH `radius: 200`. The Saved copy shows.
- Still open: Andrew's phone pass (checklist N), and the release to `main` after App Store approval.

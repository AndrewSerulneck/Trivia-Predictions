# Phase 5 Handoff — the Partner Dashboard's first load is one round trip

Plan: `docs/partner-dashboard-merch-button-loader-speed-plan.md` · Phase 5 finished 2026-10-01.
Previous: `…_PHASE_4_HANDOFF.md` (the loader on every screen), `…_PHASE_3_HANDOFF.md` (the loader
itself), `…_PHASE_2_HANDOFF.md` (baseline numbers + logo files), `…_PHASE_1_HANDOFF.md` (header
store button, your Q1–Q3 answers).

## For Andrew (plain English)

- **What changed.** Opening the Partner Dashboard used to make the phone ask our server three
  separate questions, one after another: "which venues do I own?", then "what games does this venue
  have?" and "what rewards does this venue have?". Each of those three questions re-checked who you
  are first, which is two database lookups — so the same identity check ran three times. It now asks
  **one** question and gets everything back in one answer.
- **How much faster.** I measured it on the real build with real data from your live database. The
  one question takes **401 ms** where the old three took **614 ms** — about a third less, and that is
  on this computer where the network is instant. On a phone each removed question also removes a
  full network round trip (about 150 ms each on a typical 4G connection) and a possible server
  cold start, so the real-world saving is larger than 213 ms.
- **The honest caveat: this was not the big one.** The same measurement shows the request is not
  even *sent* until about **2.5 seconds** after you tap, because the phone has to download and run
  the page's JavaScript first. Phase 5 shortened a 0.6-second tail, not the 2.5-second head. The
  2.5 seconds is exactly what **Phase 6** is for (742 KB of JavaScript on the dashboard, including
  player-only code partners never use). If you want the single biggest remaining win on a new
  phone, that is it.
- **Nothing on screen changed**, on purpose. Same loader, same one-step reveal, same two sections,
  same Retry buttons. I checked the new answer is **byte-for-byte identical** to what the three old
  answers said, against your live venue (Pacific Street): same venue list, same games, same rewards.
- **Everything still works the old way where it should.** Switching venues, tapping **Retry** on a
  section, and the refresh after you save a game or a reward all still use the original three
  endpoints, untouched. Only the very first load changed. The other partner screens (Venue Display,
  Game Settings, Category Blitz) still use the old venues endpoint and were not touched.
- **Cost:** lower. Per dashboard open: **3 server invocations → 1**, and **4 fewer database
  queries** (the two duplicate identity checks, two lookups each). No new table, no cron, no env
  var, no `vercel.json` change, no extra data sent — the one answer is the same ~585 bytes the three
  were.
- **Is it live?** **No.** Phases 1–5 are all saved on this computer only — not committed, not
  pushed, not deployed. Still your call.
- **What I need from you:** nothing new. The two open items are unchanged from Phase 4: section
  **H** of `docs/partner-dashboard-app-redesign-device-checklist.md` (ten phone checks only you can
  do), and whether to commit / push / deploy.

---

## For the next agent (Phase 6 — fonts + player-only code off the partner pages; Opus 5.5, high)

### 1. Goal and scope

Plan §4 **Phase 6** exactly as written, both halves:

1. **Self-host the fonts** with `next/font/google` in `app/layout.tsx` (Bree Serif; Nunito
   400/600/700/800/900), exposed as CSS variables, and delete the `@import` at
   `app/globals.css:1`. That `@import` is finding **F3**: our CSS → `fonts.googleapis.com` CSS →
   `fonts.gstatic.com` font files, three chained steps on two extra third-party origins, on every
   first load app-wide.
2. **Keep player-only runtime off `/owner/*` and `/admin`** (finding **F5**): put
   `AnimationOverlay`, `GlobalTransitionOverlay`, `PopupAds`, `MobileAdhesionAd` and
   `AnalyticsRuntime` behind a client `PlayerRuntime` wrapper that `next/dynamic`-loads them only
   when the path is not an owner/admin path. `AuthSessionProvider` keeps wrapping all children
   unless a **measured** bundle check shows a clean way to skip the Supabase browser client on
   `/owner/*`; otherwise record it as a follow-up. **Do not** restructure the app into route groups
   in this phase.
3. Measure the dashboard's JavaScript before and after (the manifest method in plan §2, F5) and
   record it.

**Out of scope:** the re-measure / `/code-review` / `CLAUDE.md` + `SYSTEM_CONTEXT.md` update and the
device-checklist handover (all Phase 7); anything about the loader's motion; the optional
server-rendered dashboard shell (plan §4 Phase 5's last bullet — explicitly **not** part of Phase 5
and still not started; see §7.3 below).

### 2. Starting state

- Branch `main`, last commit **`e900ce7`**. **Phases 1, 2, 3, 4 and 5 are ALL uncommitted**; nothing
  pushed, nothing deployed. No database, Supabase, env var, cron or `vercel.json` change in any of
  the five phases. **No migration** was written in Phase 5 (the new route only reads), so the
  Supabase grants checklist and `tests/supabase-migration-grants-contract.test.ts` do not apply.
- Commit trailer if Andrew asks for a commit:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Phase 5's own files** in `git status` are exactly these six:
  - `?? app/api/owner/dashboard/route.ts` (new)
  - `?? lib/ownerVenueList.ts` (new)
  - `?? tests/api.owner.dashboard.test.ts` (new, 13 tests)
  - `?? tests/app.owner-dashboard-one-round-trip.test.ts` (new, 7 tests, jsdom)
  - `M  app/api/owner/venues/route.ts`, `M app/owner/dashboard/page.tsx`
  - `M  tests/owner-dashboard-contract.test.ts` (+9 tests), `M tests/app.owner-dashboard-merch.test.ts`
    (fetch stub), `M scripts/measure-owner-load.cjs` (one new reported metric)
  Everything else belongs to Phases 1–4 (see their handoffs).
- The `?? docs/partner-dashboard-merch-button-loader-speed-plan*.md` entries include this file.

### 3. Decisions made in Phase 5 (do not re-ask, do not quietly undo)

1. **An unowned `?venueId=` falls back to the caller's first venue; it is NOT a 403.** `venueId` on
   this route is a "which venue was I last looking at" hint, not an access grant, and the dashboard
   sends it from client state. `GET /api/owner/schedule` and `GET /api/owner/competitions` still
   403 an unowned venue, because there the venue IS the request. The fallback is gated on the one
   shared predicate `ownsVenue` from `lib/ownerSchedule.ts` — never a hand-rolled
   `auth.venueIds.includes(…)` (the contract test fails the build on that string in the route).
2. **The lists are `settle`d, never `Promise.all`-rejected.** Each of `schedules` / `competitions`
   carries its own `{ ok: true, items }` or `{ ok: false, error }`, so a broken schedules query
   still shows the rewards section — today's per-section behaviour, which a rejected `Promise.all`
   would destroy by failing the whole route.
3. **An account with no venue gets `venueId: null` and `schedules: null, competitions: null`** —
   null, not `{ ok: true, items: [] }`. Nothing was asked for, and "no games" and "we never looked"
   are different answers. (`requireOwnerAuth` normally 401s `no_venue` before this branch is
   reachable; it is defensive.)
4. **The venue query moved to `lib/ownerVenueList.ts` (`listOwnerVenues`) and BOTH routes call it.**
   The plan asked for the *competitions* query to be extracted — it already was
   (`listOwnerCompetitions` in `lib/ownerCompetitions.ts`, used by the old route since the Rewards
   work), so the duplication that actually existed was the venues query and its
   `display_name ?? name` fallback. The contract test now fails if either route contains
   `display_name` or `.from("venues")`.
5. **`GET /api/owner/venues` stays live and unchanged in behaviour.** `/owner/display`,
   `/owner/game-settings` and `/owner/category-blitz` still call it. It is not deprecated; it just
   is not on the dashboard's first-load path any more.
6. **`DashboardBody` is *seeded*, not hoisted.** It keeps owning its two fetches; the page passes an
   optional `initial` prop (`{ venueId, games, rewards, asOfMs }`) that seeds the two `useState`s
   and suppresses only the **first** run of each effect. Retry, the venue switch and the post-save
   refetch are untouched and still use the per-list endpoints. Hoisting both lists into the page was
   rejected as a much larger refactor for no measured gain.
7. **The seed is accepted only for the venue it was fetched for** —
   `initial && initial.venueId === venueId ? initial : null`. `DashboardBody` is `key`ed by venue, so
   a switch remounts it while `initial` still describes the venue the page opened on; without that
   guard venue 2 would render venue 1's games. **Do not remove this comparison.**
8. **The suppression is `if (prefetched && gamesAttempt === 0) return;`**, where `prefetched` is
   `useState(seeded !== null)` — pinned at mount in *state*, deliberately **not** a `useRef`,
   because `react-hooks` (React Compiler rules, errors here) forbids reading a ref during render and
   the value is needed by the `useState` initializers. Gating on `attempt === 0` rather than
   mutating a flag means Retry (attempt 1) and every later refetch work with no ordering subtleties.
9. **Both lists are seeded or neither is** (`if (venueId && data.schedules && data.competitions)`).
   A partial seed would leave one section stuck on "loading" forever, because its effect is
   suppressed and nothing is on the way.
10. **A non-`ok` payload (a 500) seeds nothing and shows "No venue found for this account."** —
    byte-for-byte the pre-Phase-5 behaviour when `/api/owner/venues` 500'd (`venues` undefined → `[]`).
11. **`asOfMs` is stamped by the page when the payload lands**, and passed down; `Date.now()` is
    never called in a `useState` initializer (impure during render — same reason
    `lib/useLoaderVisible.ts` stamps in an effect).
12. **`onReady` is unchanged and still the only thing that lifts the loader.** A seeded body
    satisfies `games.status !== "loading" && rewards.status !== "loading"` at mount, so `onReady()`
    fires from its existing effect on the first commit. The exact expression is still pinned by
    `tests/owner-loader-contract.test.ts` — that test needed **no** change.
13. **`scripts/measure-owner-load.cjs` gained one metric, not a rewrite:** `ownerApiCalls` +
    `ownerApi` (every `/api/owner/*` request the first paint makes). It is the direct measurement of
    this phase's claim, and Phase 7 should keep reporting it. Everything else in the script,
    including the Phase 2 columns, is untouched.

### 4. Files created / changed

**4.1 — `lib/ownerVenueList.ts` (new)**
`listOwnerVenues(venueIds: string[]): Promise<OwnerVenueListItem[]>` — `"server-only"`. Returns `[]`
for an empty input, **throws** on a null `supabaseAdmin` or a query error (callers 500). Does **no**
ownership check by design: `requireOwnerAuth`'s `auth.venueIds` is the boundary and the doc comment
says so.

**4.2 — `app/api/owner/dashboard/route.ts` (new, GET only)**
Order, and the order matters: `supabaseAdmin` guard → **one** `requireOwnerAuth` → `listOwnerVenues`
→ resolve `venueId` (`?venueId=` if `ownsVenue`, else `venues[0]?.id`) → the no-venue early return →
`Promise.all` of `settle(listOwnerSchedules(venueId))` and
`settle(listOwnerCompetitions(auth.ownerId, venueId))`.
Response: `{ ok: true, venues, venueId, schedules, competitions }`, where each list is
`{ ok: true, items } | { ok: false, error }`, or `null` when there is no venue.
`listOwnerSchedules(venueId)` is called with **no** `gameType`, which is the merged Category Blitz +
Live Trivia calendar — identical to `GET /api/owner/schedule` with no filter.

**4.3 — `app/api/owner/venues/route.ts`**
Same contract, same 401s; the inline `VenueRow` type and `.from("venues").select("id, name,
display_name")` query were replaced by `listOwnerVenues(auth.venueIds)` in a try/catch that 500s
with the message. The doc comment now records that the dashboard's first load no longer calls it.

**4.4 — `app/owner/dashboard/page.tsx`** (the only UI change in this phase)
- New module-level types/helper above `DashboardBodyProps`: `WireList<T>`, `DashboardPayload`,
  `InitialLists`, and `toSectionLoad(list, fallbackMessage)` (a missing or failed list becomes that
  section's `{ status: "error" }`, with the server's message or the page's own copy).
- `DashboardBody` gained `initial?: InitialLists | null` (defaulted `null`), the `seeded` derivation,
  seeded `games` / `gamesAsOfMs` / `rewards` initial state, `const [prefetched] = useState(seeded !== null)`,
  the two `if (prefetched && …Attempt === 0) return;` early returns, and `prefetched` added to both
  effects' dep arrays.
- `OwnerDashboardPage`: new `initialLists` state; the load effect now fetches
  `"/api/owner/dashboard"` with `{ cache: "no-store" }` (the old call had no cache option — the
  per-list `fetchList` always used `no-store`, so this makes the first load consistent with them),
  same 401 → `ownerAuthRecoveryPath(body.code)` handling, then sets venues, `selectedVenueId` and
  `initialLists`. `<DashboardBody>` gained `initial={initialLists}`.
- **Unchanged:** `fetchList`, both per-list URLs, `firstLoadPending` / `showLoader` / `revealed`, the
  `display:none` reveal div, `MerchStoreHost` and its placement, the venue switcher.

**4.5 — tests**
- **`tests/api.owner.dashboard.test.ts`** (new, 13). Mocks `requireOwnerAuth`, `listOwnerVenues`,
  `listOwnerSchedules`, `listOwnerCompetitions`; keeps the **real** `ownsVenue` semantics. Covers:
  one auth call; the listers' exact arguments; venue list read through the shared lister; an owned
  `venueId` honoured; an **unowned one never read** (asserts the listers were not called with it);
  whitespace `venueId`; each list failing independently; a non-`Error` rejection's fallback message;
  `no_session` and `no_venue` propagated with their codes; an empty-venue account (null lists, no
  list queries); a venue-list failure → 500 and no list queries.
- **`tests/app.owner-dashboard-one-round-trip.test.ts`** (new, 7, jsdom, renders the real page).
  P1 the first paint's fetch log is **exactly** `["/api/owner/dashboard"]` and both sections render
  ready (no skeletons); P1 a seeded schedule row really renders; P2 a failed list in the payload
  still shows the other section, and a failed list with no `error` falls back to the page's copy;
  P3 **Retry** calls `/api/owner/schedule?venueId=venue-1` and does **not** re-run the one-shot
  call; P4 a venue switch calls both per-list endpoints for `venue-2`; and the no-venue account.
- **`tests/owner-dashboard-contract.test.ts`** (+9, two new describes). Pins: the page fetches
  `/api/owner/dashboard` and the string `/api/owner/venues` appears nowhere in it; `initial={initialLists}`;
  the venue-match guard; both suppression lines; the per-list URLs still present in the body; the
  `onReady` expression; `requireOwnerAuth(` appears **once** in the route; neither route contains
  `display_name` or `.from("venues")` and both import `@/lib/ownerVenueList`; the route uses the
  shared listers and `ownsVenue(auth, requestedVenueId)` and contains no `venueIds.includes`;
  `Promise.all` + the `ListPayload` shape.
- **`tests/app.owner-dashboard-merch.test.ts`**: only `stubApi` changed — it now serves
  `/api/owner/dashboard` (and the `hold` gate moved onto it, which is what the F2 "while venues
  load" case needs). The per-list stubs stay for the venue-switch case. No assertion changed.

### 5. Facts and traps

- **The RTT saving is invisible on localhost.** Chrome's `Network.emulateNetworkConditions` does not
  throttle loopback, so the in-browser comparison in §6 measures **server work only**. Do not read
  "213 ms" as the phone-side saving — add ~2×RTT (two removed chained round trips) and any removed
  cold start on top.
- **Phase 2's "games list visible" column is NOT comparable after Phase 4.** It probes for the body
  text `"Offer Rewards"`. Before Phase 4 that section *header* rendered next to a skeleton as soon
  as the venues call returned (≈2,827 ms); since Phase 4 the whole page is behind
  `display:none` until both lists answer **and** the loader's 500 ms minimum-visible expires
  (≈3,236 ms). The ~400 ms gap is the loader hold plus the extra wait for real data, not a Phase 5
  regression — I proved it by instrumenting the request directly (§6). **Phase 7 should either
  re-baseline that column or report "time to both lists in hand" instead.**
- **The real remaining cost is upstream of every API change.** Instrumented, on Slow 4G + 4× CPU:
  the dashboard's first request is not **sent** until **+2,493 / +2,498 / +2,499 ms** (3 runs, very
  stable). The API then takes 340–700 ms and the reveal follows within 36–371 ms. Phase 6 is where
  that 2.5 s lives.
- **`npm run test` is the gate, not a named `test:*` script.** Five contract files now constrain
  this feature: `api.owner.dashboard`, `app.owner-dashboard-one-round-trip`,
  `owner-dashboard-contract`, `owner-loader-contract`, `hightop-loader-contract`.
- **`owner-dashboard-contract.test.ts` slices the page by string index** (`indexOf("const DashboardBody")`
  … `indexOf("type MerchStoreHostProps")`, and `indexOf("const OwnerDashboardPage")`). Renaming or
  reordering those three declarations silently empties a slice and the assertions stop meaning
  anything. If you move them, re-check that file.
- **`it("Join Merch: the store is hosted by the PAGE …")`** in the same file pins the literal JSX
  shape `</Suspense></div>) : null}<Suspense fallback={null}><MerchStoreHost`. Phase 4 already had
  to loosen it once; any further change to the reveal `div` touches it again.
- **The jsdom page tests need the one-router mock.** `next/navigation`'s `useRouter` must return the
  **same object** every render: the page's load effect depends on `[router]`, so a fresh object per
  render refetches forever. Both page tests do this; copy it for any new one.
- **`HightopLoader` renders its own `role="status"`**, so in a page test query the section skeletons
  by their `aria-label` (`"Loading live games"` / `"Loading rewards"`), never by role alone.
- **`"Live Trivia"` is an ambiguous text query on the dashboard** (it is both a schedule title and
  the game-type label on the row). Use a distinctive title in fixtures — the test uses
  `"Thursday Night Showdown"`.
- **Running a Playwright script from outside the repo needs
  `NODE_PATH=/Users/andrewserulneck/Documents/Trivia-Predictions/node_modules`** (carried over from
  Phase 4, hit again this phase).
- Don't run `npx tsc --noEmit` concurrently with `npm run build` (`.next/types` regenerates).
- `npm run lint` prints a harmless Babel "deoptimised styling of `lib/sportsBingo.ts`" note.
- The page count in `npm run build` went **179 → 180**: the new `ƒ /api/owner/dashboard`. If a later
  phase reports 179 again, a route was lost.
- **`CLAUDE.md` and `SYSTEM_CONTEXT.md` still have NOT been updated** — Phase 7's job, and it must
  now also record `GET /api/owner/dashboard`, `lib/ownerVenueList.ts` as the single venue-list
  query, and that `BouncingBallLoader` is gone (carried from Phase 4).

### 6. How to build, run and test — and what was verified

```
npx vitest run tests/api.owner.dashboard.test.ts                 # 13 passed
npx vitest run tests/app.owner-dashboard-one-round-trip.test.ts  #  7 passed
npx vitest run tests/owner-dashboard-contract.test.ts            # 28 passed
npx tsc --noEmit                                                 # clean
npm run lint                                                     # clean
npm run test                                                     # 280 files passed / 1 skipped;
                                                                 # 3,001 passed / 13 skipped / 0 failed
npm run build                                                    # ✓ Compiled successfully, 180 pages
```

**Verified against the real build and the LIVE Supabase project**, `npx next start -p 3100`, owner
cookie minted locally from `SESSION_SECRET` for owner `64f046ff-a44f-47b4-acc1-94ff30288920`
(venue `venue-pacific-street`):

| Check | Result |
|---|---|
| `GET /api/owner/dashboard`, no cookie | **401** `{"error":"Unauthorized","code":"no_session"}` |
| …with cookie | **200**, 585 B, `venueId: "venue-pacific-street"`, both lists `ok` |
| …`?venueId=00000000-0000-0000-0000-000000000000` (not owned) | **200**, answered with `venue-pacific-street` — the unowned id is never read |
| Payload parity vs the three routes it replaces | `venues`, `schedules.items`, `competitions.items` **byte-identical** (`JSON.stringify`) to `/api/owner/venues`, `/api/owner/schedule?venueId=…`, `/api/owner/competitions?venueId=…` |
| Owner API calls on the dashboard's first paint | **1** (`/api/owner/dashboard`); was 3. Total page requests 31, was 32 |

**Timing** (`node --env-file=.env.local scripts/measure-owner-load.cjs --runs 5`, Slow 4G 1.6 Mbps /
150 ms RTT + 4× CPU, 375×812 DPR 3, median of 5):

| Page | requests | transferred | logo | load event | LCP | games list visible | owner API calls |
|---|---|---|---|---|---|---|---|
| /owner/login | 43 | 484 KB | 76 KB | 2,597 ms | 1,664 ms | n/a | 0 |
| /owner/dashboard | 31 | 421 KB | 17 KB | 2,468 ms | 3,244 ms | 3,236 ms | **1** |

**The one-vs-three comparison** (in-browser `fetch` from an already-loaded dashboard, median of 7 —
server work only, see the loopback trap in §5):

| | median |
|---|---|
| NEW — 1 call, `/api/owner/dashboard` | **401 ms** |
| OLD — `venues` → (`schedule` ‖ `competitions`) | **614 ms** |

Same ordering from plain Node against the same server (n=9): **449 ms** vs **691 ms**.
Query/invocation count per dashboard open: **3 invocations → 1**, and the two duplicated
`requireOwnerAuth` calls (2 queries each) are gone — **4 fewer database queries**; every other query
is unchanged. API p50/p95 from Vercel observability: still **unavailable** (needs the paid
Observability Plus add-on — recorded in the Phase 2 handoff, unchanged).

**Unverified / risky:**
- **No real phone.** Device-checklist section **H** is still entirely open.
- **The competitions payload parity check ran against a venue with 0 competitions.** The venue list
  and the schedules list were compared on real non-empty data; competitions parity rests on the
  route calling the identical shared lister (`listOwnerCompetitions(auth.ownerId, venueId)`, pinned
  by a contract test) plus the unit tests, not on a live non-empty diff. If you want it closed,
  create a reward on `venue-pacific-street` and re-run the parity snippet in §6.
- **The venue switch and the post-save refetch were exercised in jsdom only**, not in a real browser
  against live data. They are unchanged code paths, but the *suppression* flag is new, so the
  regression they'd show is "a switch renders the wrong venue's rows".
- **A multi-venue owner was not tested live** — the one real owner available has a single venue, so
  the switcher path (and `venues[0]` ordering) is covered by tests only.
- **Nothing was measured for Phase 7's final comparison** beyond the table above; Phase 2's baseline
  is still the comparison point, with the "games list visible" caveat in §5.

### 7. Open questions / waiting on Andrew

1. **Device-checklist section H** (`docs/partner-dashboard-app-redesign-device-checklist.md`) — ten
   phone checks, only he can do them. Unchanged from Phase 4.
2. Whether to commit / push / deploy Phases 1–5 — still his call, nothing is live.
3. **The server-rendered dashboard shell is still only an option, not a decision.** Plan §4 Phase 5's
   last bullet says to consider it *only if Phase 7's numbers still show a slow first paint*. They
   will: the first request isn't sent until +2.5 s (§5). But the honest reading is that the fix for
   that is **Phase 6** (less JavaScript), and server-rendering a `"use client"` page is a large
   refactor. Recommend finishing Phase 6, re-measuring in Phase 7, and only then asking Andrew.
4. Carried over, still open: the `ChevronRight`-vs-logo top-left button (Phase 4 §For Andrew), and
   whether the big sign-in logo looks soft on a 3× phone (Phase 2).

### 8. Recommended first steps for Phase 6 (Opus 5.5, high)

1. **Measure first** (global cost rule + plan item 3). Record the dashboard's JS now:
   `node -e` over `.next/server/app/owner/dashboard/page_client-reference-manifest.js` the way plan
   §2 finding F5 did (~742 KB raw across 23 chunks at Phase 1 time — re-measure, Phases 2–5 moved
   it). Also re-run `scripts/measure-owner-load.cjs --runs 5` for a same-session before/after, and
   keep the new `ownerApiCalls` line.
2. **Do the fonts half first** — it is independent, app-wide, and the easier of the two to verify.
   `grep -rn "Bree\|Nunito" app components lib tailwind.config.ts` before touching anything. Note
   from Phase 4: the `[font-family:'Bree_Serif','Nunito',serif]` class the plan mentions no longer
   lives in `BouncingBallLoader` (deleted) — it is now in `components/ui/HightopLoader.tsx`'s
   `fullScreen` label. **Grep for the class, not the file.**
3. **Then the `PlayerRuntime` split.** `AnalyticsRuntime` and the two ad components are the ones with
   real bundle weight; `GlobalTransitionOverlay` is already proven to be player-only
   (`tests/owner-loader-contract.test.ts` pins that nothing under `app/owner/`, `components/owner/`
   or `app/admin` so much as mentions `tp:global-transition`). Keep `AuthSessionProvider` wrapping
   everything unless a measurement says otherwise.
4. **Ads must still render where they do today** — check `PopupAds` / `MobileAdhesionAd` page keys on
   the player routes, not just that the app builds.
5. Gates: `npm run test`, `npm run test:pwa-contract`, `npm run test:god-mode-join`,
   `npx tsc --noEmit`, `npm run lint`, `npm run build` (not concurrently with tsc), plus a real-browser
   visual pass of the player join flow, a venue home and one game for the font change.
6. Finish with `…_PHASE_6_HANDOFF.md` and update the plan's status line.

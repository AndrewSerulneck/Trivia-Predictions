# Join Flow Location Error Plan

## Background

While signing in as a God Mode account, the join page (`/`) briefly shows a raw
browser error: **"Timeout expired"**. Console context:

```
[AuthNavigationGuard] Redirecting to login: unverified session on venue path 'venue-pacific-street'
```

This is **not** part of the venue-presence graceful-cutoff work
(`docs/venue-presence-graceful-cutoff-plan.md`) — it lives entirely in
`components/join/JoinFlow.tsx`, a file that work never touched.

### Root cause

1. **`AuthNavigationGuard`** (`components/auth/AuthNavigationGuard.tsx:163`) is working
   as designed: it saw an unverified session on `/venue/venue-pacific-street` and
   redirected to `/?v=venue-pacific-street`, landing on the join page. Not a bug.

2. On the join page, `godMode` (`components/join/JoinFlow.tsx:664`) is:

   ```ts
   const godMode = (authState.phase === "authenticated" ? authState.godMode : false) || getGodMode();
   ```

   This is only `true` once the server has confirmed the account (`authState.godMode`)
   **or** a prior sign-in already wrote `tp:god-mode` to `localStorage`
   (`getGodMode()`). On a cold start — cleared storage, a new device/browser, or a
   redirect that lands without stored identity (`hasStoredJoinIdentity` false at
   `JoinFlow.tsx:765`) — neither is true yet, so the join flow doesn't know the
   account is god-mode and runs the **real** geofence check.

3. That real check (`JoinFlow.tsx:947-996`) calls `getCurrentLocation()` /
   `getBestCurrentLocation()` directly and, on failure, does:

   ```ts
   setErrorMessage(getErrorMessage(error, "Unable to verify location."));
   ```

   `getErrorMessage` (`JoinFlow.tsx:172-179`) falls back to the raw `error.message`.
   A `GeolocationPositionError` with `code === 3` (`TIMEOUT`) has the browser-native
   message **"Timeout expired"** — that's exactly what leaks through.

   Notably, a **sibling code path** in the same file, `getInitialLocation()` (used at
   `JoinFlow.tsx:792` and `:887`), already handles this correctly — it swallows the
   error and returns `{ coords: null, permissionDenied }`, which the caller turns into
   friendly copy ("Location check unavailable right now..."). The buggy path
   (`:947-996`) is the odd one out; it should be brought in line with that pattern.

### Two independent fixes

- **Fix 1 (UX):** stop showing raw browser/engine error text anywhere in
  `JoinFlow.tsx`. Low risk, mechanical, matches a pattern already used elsewhere in
  the same file.
- **Fix 2 (architecture):** close the cold-start gap so a god account's very first
  sign-in on a new device doesn't run the real geofence check at all. Higher risk —
  must not weaken the server-side geofence guarantee (`verifyJoinGeofence({ bypass:
  account.god_mode })` in `app/api/join/profile/route.ts:255` stays the real gate,
  exactly as in the venue-presence bypass work).

---

## Phase 1 — Friendly geolocation error mapping (Fix 1)

Add a shared `mapGeolocationErrorToMessage(error)` helper (mirrors the pattern
already used for `VenueAccessOverlay`/`lib/venuePresenceClient.ts` — never show raw
codes/messages to the user) covering:

- `GeolocationPositionError` code 1 (`PERMISSION_DENIED`) — already handled
  separately via `isLocationPermissionDenied()`; leave that branch as-is.
- code 2 (`POSITION_UNAVAILABLE`) → "We couldn't determine your location. Please
  try again."
- code 3 (`TIMEOUT`) → "Location took too long to respond. Please try again."
- Non-geolocation errors (network/parse failures from `listVenues()`/
  `getVenueById()`) → keep the existing generic fallbacks already passed as the
  second arg to `getErrorMessage` (e.g. `"Unable to verify location."`,
  `"Failed to refresh venue data. Please retry if needed."`) — those are fine, only
  the `error.message` passthrough is the problem.

Apply it at every `setErrorMessage(getErrorMessage(error, ...))` call site that
follows a `getCurrentLocation()`/`getBestCurrentLocation()` call (grep confirms
these at `JoinFlow.tsx:992`, `:1156`ish, `:1637`ish — exact line numbers shift as
edits land, so re-grep at implementation time). Leave call sites unrelated to
geolocation (Supabase/auth errors) untouched.

- **Model:** Sonnet 5
- **Effort:** Low. Single file, additive helper + swapping ~3 call sites to use it.
  No architectural decisions — the friendly-copy pattern already exists in the same
  file to copy from.

---

## Discrepancy found (2026-07-14) — current code vs. intended flow

The owner described the intended login flow and asked whether the code matches. It
**does not**, in two ways. A trace of `components/join/JoinFlow.tsx` found:

**Intended flow (owner's spec):**
1. `auth-method-selection` — "How do you want to continue?" (Face/Touch ID, or
   Username/PIN, or Create Account).
2. Username step → PIN step.
3. **Then and only then**, after successful auth, the venue list appears.
4. **If and only if the account is god-mode**, the list shows **ALL** venues
   (geofence does not hide any). Normal users see only in-range venues.

**What the code actually does:**
- Panel order (1→2→3) is correct, and god-mode is saved at PIN login
  (`JoinFlow.tsx:2086`, `saveGodMode(account.godMode)`), before the list shows.
- **BUT geolocation runs during the initial page load**, not after PIN — an effect
  calls `checkPermissionState()` → `getInitialLocation()` and geofence-filters the
  venue list up front (`JoinFlow.tsx:876-921`). If permission is in the "prompt"
  state, that effect can even preempt the "How do you want to continue?" screen with
  the location-permission panel.
- **The god-mode "see ALL venues" rule only holds for *returning* god accounts.**
  The list is filtered using the god-mode value known *at initial load*. On a fresh
  device `tp:god-mode` isn't set yet, so the load filters to nearby venues. The load
  effect depends on `godMode` (`JoinFlow.tsx:1029`) and re-runs when PIN login flips
  the flag, but by then `hasSuccessfulInitialRenderRef` is set and the re-run takes a
  different, tangled branch rather than cleanly rebuilding the list with all venues.

This is the **same cold-start gap** as the "Timeout expired" bug, surfacing a second
time — in the venue-list *contents*, not just an error string.

**Chosen fix (owner decision, 2026-07-14): "Build list only after auth."** Defer ALL
geolocation until after authentication succeeds; then build the venue list exactly
once, using the server-confirmed god-mode flag. No location work (or prompt) on the
first screen.

---

## Phase 2 — Design the "auth-first, then build list" restructure (Fix 2, architecture)

Pin down, in writing, the restructured control flow before touching code:

- **Move geolocation out of the initial-load effect** (`JoinFlow.tsx:768-1029`) for
  the interactive login path, so the first screen is always `auth-method-selection`
  with no location prompt and no up-front geofence scan.
- **Trigger venue-list construction after auth resolves** — at the points where
  god-mode becomes known: PIN login (`handleAccountSubmitPin`, `:2065`), passkey
  sign-in (`:2029`), and the account-first paths (`:2179/2194/2215/2220/2232`). At
  each, once `saveGodMode(account.godMode)` has run:
  - **god-mode true** → list = **all** venues (`listVenues()`), no geolocation call.
  - **god-mode false** → run geolocation once, geofence-filter to in-range venues
    (the existing nearby-filter logic), then show the list.
- **Server stays authoritative:** the join request still hits
  `app/api/join/profile/route.ts`, which independently fetches `account.god_mode` and
  passes `bypass: Boolean(account.god_mode)` into `verifyJoinGeofence`. This
  restructure only changes *when/what* the client UI builds, never what the server
  accepts. No unauthenticated god-mode pre-check is introduced, so there is **no
  username-enumeration risk** — god-mode is only ever read *after* the user proves
  who they are.
- **Decide the loading UX** for the post-auth location step (normal users): a
  "Finding venues near you…" state on the venue-list panel while the single
  geolocation call resolves, with the Phase 1 friendly-error copy on failure.

Output: the exact list of call sites to change and the new venue-list trigger,
written into this doc, before Phase 3. **(Completed — see "Phase 2 output" below.)**

- **Model:** Opus 4.8
- **Effort:** Medium. The security concern is now *removed* by construction
  (auth-first), so the weight is untangling the existing initial-load effect and
  defining a clean post-auth trigger — judgment about the state machine, not typing.

### Phase 2 output — exact restructure (traced 2026-07-14)

**Core idea:** every path that shows the venue list already ends in
`setActivePanel("venue-list")`. Instead of editing all of them, add **one
centralized effect** that owns venue-list construction, keyed on the panel becoming
`"venue-list"`. This is far less error-prone than threading a builder call through 6
call sites, and it makes the stored-identity and enrollment paths consistent for
free.

**1. New builder + trigger effect (add near the other effects).**

```
const venueListBuiltRef = useRef(false);

const buildVenueListAfterAuth = useCallback(async () => {
  // god-mode is already persisted by every auth-success path BEFORE this runs
  // (saveGodMode at :2029, :2086, :2175, and the create-account flow), so
  // getGodMode() is authoritative here — no pre-auth read, no enumeration risk.
  const isGod = getGodMode();
  const venues = await listVenues();
  if (isGod) {
    setVenueList(venues);                 // ALL venues, no geolocation at all
    setLocationVerified(true);
    setVerifiedLocation(null);
    setLocationNotice("God mode: showing all venues.");
    setLocationLoading(false);
    return;
  }
  setLocationLoading(true);
  setLocationNotice("Finding venues near you…");
  const { coords, permissionDenied } = await getInitialLocation();
  if (coords) {
    const nearby = venues
      .map((v) => ({ v, d: calculateDistanceMeters(coords, { latitude: v.latitude, longitude: v.longitude }) }))
      .filter(({ v, d }) => d <= getGeofenceThresholdMeters(v.radius, coords.accuracy))
      .sort((a, b) => a.d - b.d)
      .map(({ v }) => v);
    setVenueList(nearby);
    setVerifiedLocation(nearby.length > 0 ? coords : null);
    setLocationNotice(nearby.length > 0
      ? `Found ${nearby.length} nearby venue(s).`
      : "No venue is currently in range from your location.");
  } else {
    setVenueList([]);
    setVerifiedLocation(null);
    setLocationNotice(permissionDenied
      ? "Location permission is off. Turn it on to see nearby venues."
      : "Location check unavailable right now. Retry to see nearby venues.");
  }
  setLocationLoading(false);
}, []);

useEffect(() => {
  if (activePanel !== "venue-list") return;
  if (venueListBuiltRef.current) return;   // don't rebuild on re-render or back-nav
  venueListBuiltRef.current = true;
  void buildVenueListAfterAuth();
}, [activePanel, buildVenueListAfterAuth]);
```

**2. Reset the guard when leaving auth**, so the next login rebuilds fresh. Set
`venueListBuiltRef.current = false` in exactly two places:
- `handleSignOut` (`JoinFlow.tsx:2235`, which goes to `auth-method-selection` at :2242).
- `handleBackToAuthMethodSelection` (`JoinFlow.tsx:1937`).

Do **not** reset it in `handleBackToVenueList` (`:1482`) — going back to the list
from a venue-login sub-screen must reuse the built list, never re-prompt location.

**3. Strip geolocation from the initial-load effect** (`JoinFlow.tsx:768-1029`) for
the interactive login path:
- In the fresh no-identity branch (~`:840-923`), remove the `checkPermissionState()`
  / `getInitialLocation()` / nearby-filter block. It should only: `listVenues()` for
  the name cache, set `activePanel = "auth-method-selection"`, `setStatus("ready")`.
  No geolocation, no `location-permission` panel preemption.
- The stored-identity branches (`:839`, `:872`) that jump straight to `venue-list`
  keep doing so — the new effect (step 1) now builds their list, so remove their
  inline geolocation/filtering too and let the effect handle it uniformly.
- **Remove `godMode` from the effect's dependency array** (`:1029`) once geolocation
  no longer lives there — the load effect no longer needs to re-run on god-mode
  changes (the builder effect reads `getGodMode()` fresh at build time).

**4. Deep-link `?v=<venueParam>` path (`:776-836`) — keep, but out of scope for the
core change.** This is the QR-code-at-a-venue entry, which verifies distance to one
specific venue and is a different UX from the venue-list. Leave its current behavior
intact in Phase 3; just confirm no regression. (A follow-up could make it auth-first
too, but it's not part of the owner's described venue-list flow.)

**5. Auth-success call sites that now just need `setActivePanel("venue-list")`** (no
per-site builder call — the effect covers them): PIN login `:2102`, passkey-in-signin
`:2034`, Face/Touch ID `:2179`, enrollment set-up `:2194/:2215/:2220`, enrollment
skip `:2232`. Verify each still runs `saveGodMode(...)` before the transition (they
do today at `:2029/:2086/:2175` and the create flow).

**6. Loading UX:** the `venue-list` panel already renders `locationLoading` /
`locationNotice` ("Finding nearby venues…", the nearby-only empty state) at
`:2944-2990` — the builder reuses those, and Phase 1's `getLocationErrorMessage`
covers any geolocation failure surfaced there. No new UI needed.

**Net footprint:** one new callback + one new effect + one ref, minus the geolocation
block deleted from the load effect, plus two one-line ref resets. All within
`JoinFlow.tsx`.

---

## Phase 3 — Implement the auth-first restructure (Fix 2, implementation)

Implement the Phase 2 design in `JoinFlow.tsx`:

- Stop the initial-load effect from running geolocation / geofence-filtering for the
  interactive login path (leave the deep-link `?v=<venue>` and returning-session
  paths working — verify each still behaves).
- Add the single post-auth venue-list builder and call it from every auth-success
  site listed in Phase 2, branching on the now-known god-mode flag (all venues vs.
  one geolocation + nearby filter).
- Keep `saveGodMode(...)` where it already is so returning users still short-circuit.

**Must not weaken enforcement or regress the normal path:** the server geofence gate
is unchanged; a normal user still gets a real geolocation check and still only sees /
can enter in-range venues.

- **Model:** Opus 4.8
- **Effort:** Medium-High. Touches the client auth/geofence state machine in a file
  with many interacting `useEffect`s and panel-transition branches (`activePanel`,
  `locationVerified`, `hasSuccessfulInitialRenderRef`, the `godMode`-dependent load
  effect). Widest blast radius of the god-mode changes — same care level as Phase B
  of the venue-presence bypass work. Removing geolocation from initial load risks the
  deep-link/returning-session paths if not scoped tightly.

---

## Phase 4 — Verification

Browser pass with Playwright (same harness/pattern as the venue-presence
verification — mocked geolocation, fresh cookies/localStorage), given Phase 3's
blast radius. Cover all four populations:

- **Cold-start god account** (no `tp:god-mode`, no stored identity), fresh profile:
  first screen is "How do you want to continue?" with **no** location prompt; after
  username+PIN, the venue list shows **ALL** venues; no geolocation call was made.
- **Returning god account** (flag already set): same all-venues result, unaffected.
- **Normal user, in range:** after auth, a single geolocation check runs and the list
  shows the in-range venue(s); can enter.
- **Normal user, far / location fails:** after auth, shows the nearby-only empty state
  / Phase 1 friendly copy — never "Timeout expired", still cannot enter an
  out-of-range venue (server gate unchanged).

- **Model:** Opus 4.8 (test design + running the browser pass); Sonnet 5 fine for
  mechanically writing any additional unit tests once scenarios are decided.
- **Effort:** Medium.

---

## Phase 5 — Document the canonical flow (only after the code matches)

Once Phases 2–4 land and the code actually implements the auth-first flow, record it
as canonical so future coding agents and developers respect it:

- Add the flow (auth → then venue list; god-mode = all venues, normal = in-range
  only; geolocation runs only after auth) to **SYSTEM_CONTEXT.md** and **CLAUDE.md**.
  (There is no `AGENTS.md` in the repo; these two are the LLM-read docs.)
- **Do not** write this documentation before the code matches — documenting an
  intended-but-unimplemented flow is worse than no docs.

- **Model:** Sonnet 5
- **Effort:** Low.

**Status: DONE (2026-07-14).** Added "Join/Login Flow (Auth-First)" to `CLAUDE.md`
(after "Architecture & Database Patterns") and expanded the first bullet of
`SYSTEM_CONTEXT.md` §2 "Key User Flows" to state the auth-first order and the
god-mode/geolocation timing, cross-referencing this doc.

---

## Summary table

| Phase | Work | Model | Effort |
|---|---|---|---|
| 1 | Friendly geolocation error mapping (Fix 1) | Sonnet 5 | Low — **DONE** |
| 2 | Design the "auth-first, then build list" restructure | Opus 4.8 | Medium — **DONE** |
| 3 | Implement the auth-first restructure in `JoinFlow.tsx` | Opus 4.8 | Medium-High — **DONE** |
| 4 | Verification (browser regression pass, 4 populations) | Opus 4.8 / Sonnet 5 | Medium — **DONE** |
| 5 | Document the canonical flow in SYSTEM_CONTEXT.md / CLAUDE.md | Sonnet 5 | Low — **DONE** |

Recommendation: **Phase 1 already shipped** (pure UX, no security surface). The
"auth-first" restructure removes the earlier enumeration concern by construction —
god-mode is only read after the user authenticates — so Phases 2–5 are a clean,
connected unit. Still write Phase 2's exact call-site plan before Phase 3 touches the
tangled initial-load effect, and don't write Phase 5 docs until the code matches.

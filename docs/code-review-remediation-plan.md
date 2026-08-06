# Code Review Remediation Plan (working-tree review, 2026-08-06)

Five findings from `/code-review` on the uncommitted admin-mobile / venue-activation /
billing-dollar-rate work. Ordered by blast radius: the failing test first (it blocks every
later `npm run test` gate), then the two real user-facing bugs, then the two UX defects.

Model/effort is called out per phase. Run `npx tsc --noEmit` + `npm run test` at the end of
each phase; the phase is not done until both are clean.

---

## Phase 0 — Unblock the suite: fix the wrong regex in the new shell test
**Model: Claude Haiku 4.5 · Effort: low**

`tests/admin-mobile.shell-height-chain.test.ts:87` asserts the literal
`pb-[env(safe-area-inset-bottom)]`, but `AdminMobileShell`'s nav uses
`pb-[calc(env(safe-area-inset-bottom)+0.5rem)]`. The inset *is* preserved — the assertion is
what's wrong, and it is the suite's only failure (1 failed / 1445 passed).

- Loosen the nav assertion to match the inset inside an optional `calc(...)` wrapper — i.e.
  require `pb-[` … `env(safe-area-inset-bottom)` … `]`, not the bare form.
- Do **not** change the nav class to satisfy the test; the `+0.5rem` breathing room is
  intentional.
- Keep the header assertion as-is for now — Phase 2 will change that class, and Phase 2 owns
  updating it.

**Done when:** `npx vitest run` is 1446 passed / 0 failed.

---

## Phase 1 — Stop reporting every Stripe `prices.create` failure as an archived-price 409
**Model: Claude Opus 5 · Effort: medium**

`lib/billingCustomPrice.ts:220`. The catch re-resolves by lookup key; if the re-resolve finds
nothing it unconditionally returns the 409 "An archived Stripe price already holds the key
`custom_monthly_NNNN` — unarchive it". So a rate limit, a network blip, a restricted key, or a
bad product id all send the admin hunting for a price that does not exist, and the real Stripe
message is discarded.

- Gate the 409 on `stripeErrorCode(error) === "resource_already_exists"` (the helper already
  exists at line 138; the test fixture already sets that code).
- Everything else falls through to the existing 502 carrying the real error message.
- Leave the race path (`raced.ok && raced.priceId` → reuse) exactly as it is; it is correct and
  must stay ahead of the code check.

**Tests:** extend `tests/lib.billingCustomPrice.test.ts` — (a) `resource_already_exists` + empty
re-resolve still 409s with the archived-price copy; (b) a generic `rate_limit`/`api_error`
create failure now 502s and surfaces Stripe's own message; (c) the existing race case is
unchanged.

**Why Opus:** it is the one finding where the wrong fix silently changes billing error
semantics, and the ordering against the race branch has to be reasoned about, not pattern-matched.

---

## Phase 2 — Mobile admin header collapses under the notch
**Model: Claude Opus 5 · Effort: medium**

`components/admin/AdminMobileShell.tsx:86`. The header is `h-14` **plus**
`pt-[env(safe-area-inset-top)]`. Under `box-sizing: border-box` the top inset eats the content
box, so on a notched iPhone (~47px inset) the title and the 44×44 "More" button are squeezed
into roughly a 9px strip under the status bar. `.tp-admin-theme` zeroes padding on html/body/
`.tp-app-shell`, so nothing upstream supplies the inset — the header genuinely has to.

- Replace the fixed `h-14` with a height that *adds* the inset rather than absorbing it:
  either `min-h-14` (simplest; header grows by the inset) or
  `h-[calc(3.5rem+env(safe-area-inset-top))]`. Prefer `min-h-14` unless a definite height turns
  out to be load-bearing for the flex column — the header is `flex-none`, so it should not be.
- Verify the surrounding invariant still holds: the root stays `h-full`, `main` stays
  `min-h-0 flex-1 overflow-y-auto`, header and nav stay `flex-none`. This phase must not
  reintroduce the R3 bug where the nav is pushed below the clip boundary.
- Update the Phase 0 header assertion in `tests/admin-mobile.shell-height-chain.test.ts` to
  match whichever form is chosen, keeping the "inset still present on the pinned chrome" intent.
- **Also note (do not fix blind):** the desktop shell header, `components/admin/AdminShell.tsx:734`,
  has no safe-area padding at all. Desktop admin is an ordinary browser surface per CLAUDE.md,
  so this is likely a non-issue; state the conclusion in the run log rather than adding padding
  speculatively.

**Verification:** headless browsers cannot render a notch. Add a line to
`docs/admin-mobile-device-checklist.md` — "admin header title + More button fully tappable
below the status bar on a notched iPhone" — for Andrew to close on a real device.

**Why Opus:** touches the exact height chain that the R3 remediation and commit 35115fc both
regressed; the fix has to be reasoned against that chain, not just swapped in.

---

## Phase 3 — Radius dial re-zooms the map under the user's finger
**Model: Claude Sonnet 5 · Effort: low**

`components/admin/VenueMapPicker.tsx:229`. The refit effect's "not mid-drag" guard checks only
`dragInProgressRef` (marker drags), so `fitToCircle` fires on every >15% radius step *while the
dial is being dragged* — contradicting its own comment and defeating the "watch the circle grow
under your finger" goal.

- Add `radiusEditing` to the guard: skip the refit while the dial is held.
- Decide and document one behavior on release: either refit once when `radiusEditing` goes
  false and the radius has moved materially, or don't refit at all. Prefer **refit once on
  release** so a big radius change still ends framed.
- Keep `lastFitRadiusRef` bookkeeping consistent so a skipped-then-released drag doesn't
  double-fit or permanently suppress future fits.
- Add the effect's new dependency without disturbing the separate stroke-weight effect.

**Verification:** device checklist line in `docs/venue-activation-device-checklist.md` — "drag
the radius dial across a large range; the map must not re-zoom until release."

---

## Phase 4 — Stale prediction can overwrite a committed address
**Model: Claude Sonnet 5 · Effort: low**

`components/admin/useAddressLookup.ts:146`. `select()` bumps `requestIdRef` but never clears
`debounceRef`, so a 300ms predict scheduled by the keystroke that preceded the tap can still
fire after the address is chosen, reopen the dropdown over the committed value, and a stray tap
then silently rewrites street/city/state/zip **and moves the pin**. `reset()` already clears
the timer; `select()` should do the same.

- Clear `debounceRef` at the top of `select()`, alongside the `requestIdRef` bump.
- Check `loadPredictions`' own `requestIdRef` guard also covers an in-flight predict that
  already started before the tap — if it only guards `setLoading`, extend it so a stale
  response cannot call `setPredictions`/`setOpen(true)`.

**Tests:** a `useAddressLookup` unit test with fake timers — type, tap a prediction before the
debounce elapses, advance timers, assert the dropdown stays closed and the committed fields are
untouched.

---

## Phase 5 — Close-out
**Model: Claude Sonnet 5 · Effort: low**

- Full gate: `npx tsc --noEmit`, `npm run lint`, `npm run test`.
- Record each finding's resolution (and the AdminShell desktop-header conclusion from Phase 2)
  in `docs/admin-mobile-run-log.md` and `docs/billing-dollar-rate-run-log.md` as appropriate.
- List the two device-checklist items (Phases 2 and 3) that only Andrew can close, and say
  plainly that they are open.
- No commit unless Andrew asks.

---

### Phase dependencies
Phase 0 first (it gates the test signal for everything after). Phase 2 depends on Phase 0
because both edit the same test file. Phases 1, 3, and 4 are independent of each other and of
2, and can run in any order or in parallel.

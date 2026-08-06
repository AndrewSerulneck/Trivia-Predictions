# Phase 2 Handoff — Mobile admin header no longer collapses under the notch

**Status:** ✅ DONE (code); one device-checklist item is OPEN and only Andrew can close it
**Date:** 2026-08-06
**Model:** Claude Opus 5 · Effort: medium
**Plan:** `docs/code-review-remediation-plan.md` Phase 2

---

## The bug

`components/admin/AdminMobileShell.tsx` — the mobile shell `<header>` was:

```
flex h-14 flex-none items-center justify-between … pt-[env(safe-area-inset-top)]
```

A **definite** `h-14` (3.5rem = 56px) plus a top *padding* of the safe-area inset collapses
under `box-sizing: border-box`: the padding is drawn inside the 56px box rather than added to
it. On a notched iPhone (~47px inset) that leaves roughly a **9px** content strip under the
status bar, holding both the section title and the 44×44 "More" (⋯) button.

Nothing upstream supplies the inset instead — `.tp-admin-theme` in `app/globals.css` zeroes
padding on `html`, `body`, and `.tp-app-shell` — so the header genuinely has to carry it.

## The fix

One class, `h-14` → `min-h-14`, at
[AdminMobileShell.tsx:96](components/admin/AdminMobileShell.tsx#L96):

```
flex min-h-14 flex-none items-center justify-between … pt-[env(safe-area-inset-top)]
```

A *minimum* height keeps the 3.5rem chrome bar on non-notched devices (where the inset is 0)
while letting the box **grow** by the inset where there is one. A block comment above the
header records why, so a future reader doesn't "tidy" it back to `h-14`.

`min-h-14` was chosen over `h-[calc(3.5rem+env(safe-area-inset-top))]` per the plan's stated
preference: it is simpler, and a definite height was checked and found **not** load-bearing —
see below.

### Height chain re-verified (the R3 invariant)

The plan required proving this doesn't reintroduce R3 (nav pushed below the clip boundary).
It doesn't, and the reason is that the header is not the element that gives way:

| Element | Class | Role |
|---|---|---|
| root | `flex h-full flex-col overflow-hidden` | definite-height column (inherits AppShell's `fixed inset-0 h-screen overflow-hidden`) |
| `<header>` | `min-h-14 flex-none` | **changed**; `flex-none` = `flex: none`, so `flex-basis: auto` → it is sized by content and never shrunk or grown by the flex algorithm |
| `<main>` | `min-h-0 flex-1 overflow-y-auto` | unchanged; the one flexible item, absorbs the remainder and scrolls itself |
| `<nav>` | `grid flex-none … pb-[calc(env(safe-area-inset-bottom)+0.5rem)]` | unchanged, still pinned |

Because `flex-none` fixes the basis to `auto`, swapping a definite height for a minimum only
changes what "auto" resolves to — the header claims `56px + inset` instead of `56px`, and
`main`'s `flex-1` takes whatever is left. The nav is still `flex-none` and still last in the
definite-height column, so it cannot be pushed out. The test file's existing R3 assertions
(`main` `min-h-0 flex-1 overflow-y-auto`, `header`/`nav` `flex-none`, no `min-h-[100svh]`
root) all still pass unmodified.

## AdminShell (desktop) — stated conclusion, no change made

The plan asked for a conclusion rather than a speculative fix on
[AdminShell.tsx:734](components/admin/AdminShell.tsx#L734), whose header bar is `h-14` with no
safe-area padding at all.

**Conclusion: non-issue, deliberately left alone.** Two independent reasons:

1. Per CLAUDE.md, desktop admin is an ordinary website surface — it is explicitly *not* part of
   the PWA ("`/owner/*` and `/admin` stay an ordinary website… no install promotion on those
   surfaces"). In a browser tab the URL bar occupies the inset region, so
   `env(safe-area-inset-top)` resolves to 0 and any padding added would be dead code.
2. More importantly, it has **no** `pt-[env(...)]` today, so it does not have the bug being
   fixed here. The Phase 2 bug is specifically the *interaction* of a definite height with an
   inset padding. Adding an inset to the desktop header would introduce that interaction where
   none exists — the opposite of the fix.

If the desktop console is ever launched standalone (it is not, and CLAUDE.md says it should not
be), this becomes a real item; it is not one now.

## Tests

`tests/admin-mobile.shell-height-chain.test.ts`:

1. **Updated** the header safe-area assertion (the one Phase 0 deliberately left for this
   phase) to accept an optional `calc(...)` wrapper, mirroring the regex shape Phase 0 used for
   the nav:
   `/<header className="[^"]*pt-\[(?:calc\()?env\(safe-area-inset-top\)(?:\+[^)]*\))?\]/`
   The "inset still present on the pinned chrome" intent is preserved.
2. **Added** a new test, *"does not let the mobile header's top inset eat its own content
   box"* — extracts the header className and asserts it still carries
   `env(safe-area-inset-top)` **and** does not carry a bare `h-14`
   (`/(?<![\w-])h-14(?![\w-])/`, so it matches `h-14` but not `min-h-14`). This is the guard
   that actually pins Phase 2's fix; the updated assertion in (1) would pass either way.

The new guard was **verified to fail on the pre-fix class** — temporarily reverting
`min-h-14` → `h-14` produced exactly one failure with the intended message, and the file was
restored. It is a real regression guard, not a tautology.

## Gate

```
npx tsc --noEmit  → clean
npm run test      → 168 files passed | 1 skipped
                    1451 passed | 13 skipped | 0 failed
```

(1450 after Phase 1; +1 is the new guard.) No lint run — Phase 5 owns `npm run lint`.

## Files modified

- `components/admin/AdminMobileShell.tsx` — `h-14` → `min-h-14` + explanatory comment
- `tests/admin-mobile.shell-height-chain.test.ts` — loosened header assertion, added the
  content-box guard
- `docs/admin-mobile-device-checklist.md` — new item under **Safe-area insets**

No migrations. No route changes. Nothing committed (per plan: no commit unless Andrew asks).

---

## OPEN — device verification (Andrew only)

Headless browsers have no notch and report `env(safe-area-inset-top)` as 0, so this fix is
**structurally unverifiable by automation**. Added to `docs/admin-mobile-device-checklist.md`
under *Safe-area insets*:

> **Mobile shell header (code-review remediation Phase 2):** on a notched iPhone, the admin
> header title and the 44×44 "More" (⋯) button sit fully below the status bar and are both
> legible and tappable — not squeezed into a thin strip. Check portrait and landscape.

Phase 5 must list this as open alongside Phase 3's radius-dial item.

---

## Notes for the next phase

**Phase 3 (Sonnet, low) — radius dial re-zooms the map under the user's finger** is next in
plan order. It is fully independent of Phases 0–2; nothing here touches it.

- Phase 3 edits `components/admin/VenueMapPicker.tsx:229` (the refit effect's "not mid-drag"
  guard, which checks only `dragInProgressRef` and so refits while `radiusEditing` is true).
- The plan's stated preference is **refit once on release**, not "never refit" — and it asks
  you to keep `lastFitRadiusRef` bookkeeping consistent so a skipped-then-released drag neither
  double-fits nor permanently suppresses future fits. Reason about that ref explicitly; it is
  the part most likely to be got wrong.
- Add the effect's new dependency without disturbing the separate stroke-weight effect.
- Phase 3 owes a device-checklist line in **`docs/venue-activation-device-checklist.md`**
  (a *different* file from the one Phase 2 touched) — "drag the radius dial across a large
  range; the map must not re-zoom until release."

**Phase 4 (Sonnet, low)** — `components/admin/useAddressLookup.ts:146`, stale-prediction
overwrite. Independent of everything above.

**Phase 5 close-out** now owes, in addition to what Phase 1's handoff listed:

- Full gate: `npx tsc --noEmit`, `npm run lint`, `npm run test`.
- Run-log entries. **Phase 2's resolution belongs in `docs/admin-mobile-run-log.md`** (not the
  billing one), including the AdminShell desktop-header conclusion recorded above — the plan
  explicitly asks for that conclusion to land in the run log.
- The list of open device-checklist items: Phase 2's notched-header line (above) and Phase 3's
  radius-dial line. Both are Andrew-only; say plainly that they are open, not "verified."

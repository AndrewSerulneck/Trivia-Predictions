# Phase 4 — Standalone hardening

**Model:** opus / high.

This is the phase that decides whether the installed app feels solid or broken. In standalone
there is **no address bar, no back button, and no pull-to-refresh** — three escape hatches
players rely on without noticing. Everything below is about replacing them.

Use the standalone-detection helper Phase 3 exported (see run log). Do not re-implement
detection.

## Do

1. **Fix the back button's dead end.** `components/navigation/BackButton.tsx:95` calls
   `window.history.back()`. Mid-session that is fine; at the app's launch entry point there
   is no history to go back to, so the button does nothing and the player is stuck with no
   browser back to fall back on. Give it a route fallback: if there is no usable history
   entry (`window.history.length <= 1`, or a same-origin referrer check), navigate to a
   sensible parent route instead. Keep current browser behavior unchanged — this is a
   fallback, not a redesign of navigation.

2. **Add a reload escape hatch.** With no pull-to-refresh, a wedged page in standalone is
   unrecoverable short of force-quitting. There are already recovery components in the tree
   (`LoginStuckStateBreaker`, `ScrollRescueGuard`, `ScrollRecoverySentinel`) — read them
   first and prefer extending the established pattern over adding a fourth mechanism. The
   requirement: when running standalone, a player who is stuck has a discoverable way to
   reload. Keep it unobtrusive; it must not become visible chrome during normal play.

3. **Verify the cold-launch auth path.** An installed app launches with an **empty cookie
   jar**. Trace what actually happens: `start_url: "/"` → `proxy.ts`'s gate sees no
   `tp_user_id` / `tp_sess` → the join flow renders. Confirm this lands on
   `auth-method-selection` cleanly with no redirect loop and no flash of a gated route.
   - **Do not change `proxy.ts`'s default behavior.** If the trace reveals a genuine problem
     there, stop, write it in the run log, and leave it for a human decision.
   - The join flow's ordering rules are load-bearing and documented in CLAUDE.md: auth
     first, geolocation only *after* authentication, never before. Do not perturb that.
   - **You MUST run `npm run test:god-mode-join`** — it contains a static tripwire that fails
     if account-backed venue selection starts calling browser geolocation before server
     profile resolution.

4. **Handle safe areas in standalone.** With `apple-mobile-web-app-status-bar-style:
   black-translucent` (Phase 3) the app extends *under* the iOS status bar and home
   indicator. Audit the app shell and the Bingo landscape view for content hidden beneath
   either. Use `env(safe-area-inset-*)`; the app already sets `viewportFit: "cover"`, so the
   insets are available. Coordinate with Phase 1's safe-area work rather than duplicating it.

5. **Defensive Stripe return refetch.** `app/owner/billing/page.tsx:166` and
   `app/owner/billing/setup/page.tsx:74` navigate to `checkout.stripe.com`. Partners are not
   expected to install (master plan §2), so this is defence in depth, not a redesign: add a
   `visibilitychange`/focus-triggered refetch of subscription state so returning to the page
   reconciles against the webhook-updated truth rather than showing stale pre-checkout state.
   - Billing state is **webhook-driven**; the redirect was never the source of truth. Do not
     add logic that treats the redirect as authoritative.
   - Do not touch `vercel.json`, Stripe webhook handlers, or `lib/supabaseAdmin.ts`.
   - Note the repo invariant: a `billing_subscriptions` row means a partner who **paid**.

6. **Confirm geolocation still works in standalone.** `lib/geolocation.ts` — permission lives
   in the app's own jar and will be re-prompted on first launch. Verify no code assumes a
   previously-granted permission or a cached position, and that a fresh denial surfaces the
   normal error path rather than a dead end.

## Do not

- Do not add `middleware.ts` (hard build error — `proxy.ts` is the gate).
- Do not change `proxy.ts`, `lib/supabaseAdmin.ts`, `lib/serverSession.ts`, or `vercel.json`.
- Do not create a migration. This plan needs none.
- Do not add geolocation calls before authentication anywhere in the join flow.

## Verify

`npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`, and **`npm run
test:god-mode-join`** (required — this phase touches the auth/join path).

## Run-log entry must include

The back-button fallback route logic, where the reload hatch lives and how it is triggered,
the exact cold-launch trace result, and confirmation that `test:god-mode-join` passed.

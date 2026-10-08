# Square dev testing: test venue + environment guard — plan

Date: 2026-10-07. Owner: Andrew. Status: **Phase 1 done** (environment guard, committed locally on `main`,
not pushed/deployed) — handoff `docs/square-dev-test-venue-plan_PHASE_1_HANDOFF.md`. **Phase 2 done**
(hidden `venue-hightop-test` created 2026-10-07) — handoff `docs/square-dev-test-venue-plan_PHASE_2_HANDOFF.md`. **Phase 3 closed without a sandbox run** (2026-10-07): Square's sandbox consent page stayed blank ("first launch the seller test account from the Developer Console"); Andrew decided to test Square changes on the live site instead — handoff `docs/square-dev-test-venue-plan_PHASE_3_HANDOFF.md`. Plan complete.
Update this line with each phase's handoff (`docs/square-dev-test-venue-plan_PHASE_<N>_HANDOFF.md`).

## For Andrew (plain English)

Your dev server and the live site share **one database**, and a venue can hold **one** Square connection.
Pacific Street's connection is your real Square account. The dev server talks to Square's *test*
system (sandbox), so it sees that real connection as "needs reconnecting" — and if you ever finished a
reconnect from dev, it would **replace your real Square connection with a fake test one** and Square
would stop working at Pacific Street on the live site.

The fix:
1. **Guard (Phase 1):** each server refuses to change a Square connection made by the other one, and
   says why in one line instead of offering Reconnect/Disconnect.
2. **Test venue (Phase 2):** a hidden "Hightop Test Bar" on your partner account, used only for dev
   testing. Players never see it in the venue list.
3. **First sandbox run (Phase 3):** you connect the sandbox to the test venue on the dev server and
   try a gift-card prize and a menu-item prize end to end.

Phases run in this order on purpose: the guard goes in **before** anything else, so there is never a
moment when dev can damage the live connection.

### The message (exact copy, Phase 1)

Shown on the Point of Sale sheet in place of Reconnect/Disconnect when the venue's Square connection
belongs to the other server:

- **On the dev server** (connection is the real one):
  > **Connected on the live site.** Test Square on your test venue — reconnecting here would replace this venue's real Square connection.
- **On the live site** (connection is a sandbox test one):
  > **Test connection from the dev server.** It only works there and never touches real money.

And as the connect-result banner if someone reaches Connect anyway (`posResult=other_environment`):
> This venue's Square is managed from the other server, so nothing was changed. Use your test venue to test Square.

---

## Phase 1 — Environment guard (code)

**Model / effort:** Claude Opus 5.5, **high** effort (touches the OAuth/connection path that hands out
real gift cards; must not regress live Square).

**Goal:** no server can create, replace, retire, disconnect or re-locate a Square connection whose
`pos_connections.environment` differs from its own `SQUARE_ENVIRONMENT`. UI explains it in one line.

**Out of scope:** schema changes (the unique index stays one live row per venue+provider), Clover,
any change to gift-card/discount issuing, deploying (push/deploy is Andrew's call).

### Server-side (the authority)
1. New helper in `lib/pos/connections.ts`, e.g. `squareEnvironmentConflict(venueId)` → `{ ok, conflict:
   PosEnvironment | null }`: one read of the venue's live (non-revoked) Square row; `conflict` = that
   row's environment when it ≠ `squareAppConfig()?.environment`. **Fails closed** (`ok: false` → callers
   refuse). Reuse `readLiveConnections`; do not add a second query shape.
2. `app/api/owner/pos/square/connect/route.ts`: after the venue-access check, before minting OAuth
   state, conflict → `redirectToPosSheet(request, "other_environment")`. Log
   `[PosSquare] connect-other-environment`.
3. `app/api/owner/pos/square/callback/route.ts`: **re-check before any write** — before
   `markSquareLocationIneligible`, `discardSquareGrant`'s retire path and `saveSquareConnection`
   (a state minted earlier can outlive a change). On conflict: discard the fresh grant (as the
   not-eligible branch does) and redirect `other_environment`. Never call the R5 retire path for a
   row from the other environment.
4. `disconnect` and `locations` (POST) routes: conflict → `409 { ok: false, code: "other_environment" }`.
   Disconnect must not call Square's RevokeToken with the wrong environment's credentials.
5. Add `other_environment` to `PosConnectResult` (`lib/pos/squareRoutes.ts`) and its banner text to
   `POS_RESULT_MESSAGES` (`components/owner/pos/PosConnectionsSheet.tsx`).

### Status + UI
6. `PosConnectionStatus` (`lib/pos/types.ts`): add `otherEnvironment?: PosEnvironment` (set when the
   live Square row is from the other environment). `listPosConnectionStatuses` sets it; the state for
   that row becomes a new `"other_environment"` state **or** keeps `needs_attention` plus the flag —
   pick one and make the sheet render it without Reconnect/Disconnect.
7. Copy lives as exported constants next to the other Square text (`SQUARE_ATTENTION_TEXT` neighbours
   in `PosConnectionsSheet.tsx`): `SQUARE_OTHER_ENV_DEV_TEXT`, `SQUARE_OTHER_ENV_LIVE_TEXT` (exact text
   above). Badge: neutral "Live site" / "Test" — not the rose "needs attention" style.
8. `venuesNeedingPosAttention`: stop flagging other-environment rows (they are not something the
   partner can fix here). This removes the dashboard's "Square needs reconnecting" nudge on dev for
   Pacific Street and on live for the test venue. Keep flagging `status = 'error'`.
9. Guest side: confirm the wallet already falls back to the normal coupon for an other-environment row
   (`lib/pos/squareConnection.ts` refuses it — verify, add a test, don't rewrite).

### Tests (add to existing files where they fit)
- connect/callback/disconnect/locations refuse on conflict and write nothing (mock Supabase + fetch);
  callback conflict never reaches `saveSquareConnection` or the retire path.
- conflict read failure → refuse (fail closed).
- sheet renders each message and no Reconnect/Disconnect for an other-environment row; normal rows unchanged
  (`tests/components.square-gift-card-ui.test.ts`, `tests/components.pos-connections-sheet.test.ts`).
- `venuesNeedingPosAttention` ignores other-environment rows.

**Done when:** `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` pass (typecheck and
build not concurrently). On the dev server, Pacific Street shows the dev message, no Reconnect, no
dashboard nudge. Commit locally; Andrew decides on push/deploy (the live-site half only protects once deployed).

---

## Phase 2 — Create the hidden test venue (data)

**Model / effort:** Claude Sonnet 5.5, **medium** effort. Writes to the live database — ask Andrew
before the write, even though this plan describes it.

**Goal:** one hidden venue linked to Andrew's partner account, usable on the dev server.

1. **Ask Andrew first:** name (default "Hightop Test Bar", id `venue-hightop-test`), and address/coords
   (default: Pacific Street's coordinates, so the dashboard map and timezone behave). **Not** `(0,0)` —
   that marks a system room and is refused by many paths (`isPlaceholderVenueRow`).
2. Before writing, read and record: Pacific Street's `venue_owner_venues` row (owner id), its
   `timezone`/coords, and whether the dashboard or Rewards need a `billing_subscriptions` row to unlock
   features for a venue (check `requireOwnerAuth`, the dashboard and the Rewards wizard). If billing is
   required, **stop and ask Andrew** — do not insert a fake subscription.
3. Insert via a one-off script in the scratchpad (not committed) or `supabase db query --linked`:
   - `venues`: `hidden = true`, `self_serve_created_at` **NULL**, `checkout_started_at` NULL,
     `rehidden_at` NULL. Leaving the self-serve stamp empty keeps it out of the signup sweep and the
     lapsed-venue reconciler (both only touch self-serve-stamped venues); it shows as "admin-hidden" in
     the admin Hidden venues panel.
   - `venue_owner_venues`: link to Pacific Street's owner id.
   - Write an undo note in the handoff: the two exact `delete` statements.
4. Verify: dashboard venue switcher lists both venues (dev and live); `listVenues()` does not return
   the test venue; Pacific Street unchanged.

**Done when:** the venue exists, is hidden, is linked, and the undo statements are in the handoff.

---

## Phase 3 — First sandbox run + docs

**Model / effort:** Claude Sonnet 5.5, **low–medium** effort. Andrew does the browser steps.

1. Andrew, each test session: Square Developer Console → the app → **Sandbox** test account → **Open in
   Square Dashboard** (otherwise Square's sandbox consent page is a **blank white screen**). Same browser:
   `npm run dev` → `http://localhost:3000/owner/login` → switch to the test venue → menu → Point of Sale →
   Connect → Allow. Sandbox redirect URL `http://localhost:3000/api/owner/pos/square/callback` is already
   registered (Phase 3 handoff §8).
2. Test prizes on the test venue: create a reward with a gift-card prize and a $-off menu prize; seed a
   win for Andrew's God Mode player (ask before seeding; delete afterwards); open the venue directly by
   URL (hidden venues aren't in the join list; God Mode bypasses the geofence); open the gift card and
   the green-box discount; check the sandbox Square dashboard shows the card / discount.
3. Confirm the live site shows the test venue's row with the live-site message and **no** nudge
   (only after Phase 1 is deployed).
4. Docs: add a short "Testing Square on the dev server" section to `docs/square-go-live-runbook.md`
   (the steps above) and one line to the POS section of `CLAUDE.md`:
   *Test Square from the dev server only on the hidden test venue; the guard refuses cross-environment
   changes — see `docs/square-dev-test-venue-plan.md`.*

---

## Facts and traps (for every phase)

- Dev and production share Supabase project `pkmxupsayzshvpirkaav`. Every dev write is a production write.
- `pos_connections_one_live_per_venue_provider` = one non-revoked row per (venue, provider), any environment.
- On 2026-10-07 Pacific Street had one **active production** row ("Hightop Challenge") plus three revoked
  sandbox rows. Do not touch the active row.
- The callback's R5 path retires a venue's old connection on a refused reconnect — the reason the guard
  must run before any callback write.
- Dev needs `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED` on and `SQUARE_ENVIRONMENT=sandbox` with sandbox
  credentials. `.env.local` is append-only: read names only with `cut -d= -f1 .env.local | sort`
  (may be denied — then ask Andrew), never print values, never `vercel env pull`.
- A Square GAN (gift card number) is never logged or stored — unchanged here.
- No new tables, so no grant migration is needed.

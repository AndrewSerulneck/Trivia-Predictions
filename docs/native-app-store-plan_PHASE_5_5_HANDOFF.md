# Native App Store Plan — Phase 5.5 Handoff (partner-written messages)

**Date:** 2026-10-23. **Phase:** 5.5 of `docs/native-app-store-plan.md` (Opus 5.5, high). Follows
`…_PHASE_5_4_HANDOFF.md`. **State: BUILT and verified locally (tests, SQL proof, build, browser with mocked routes).
NOT committed, NOT pushed, migration NOT applied, flag OFF.** Website + database only — no app rebuild.

---

## Summary for Andrew (plain English)

**What changed.**
- A new Partner Dashboard menu row, **Message Your Players** (right after Results). A partner types a short note
  (up to 150 characters, e.g. "Half-price wings during trivia tonight!"), taps Send, confirms once ("It can't be taken
  back"), and it goes as a phone notification to that bar's players who have the app with **News from your bars** on —
  the same switch and the same players as the automatic "new game / new prize" notifications from 5.4. The notification
  shows the bar's name as its title and the message as its text.
- **Limits (yours):** 2 messages per bar per day, counted on the bar's own clock. Separate from the 5 automatic ones.
- **Words filter:** no web links or email addresses, and no slurs, sexual words or strong swearing (it also catches
  "sh1t"-style spellings). Ordinary bar words like "Sex on the Beach" or "kill it at trivia" are fine. The partner sees
  the reason while typing.
- **Report:** tapping the notification opens that bar's Venue Home with the message on top, a **Close** button, a small
  **Report this message** link (asks "Report it?" once) and a line saying how to turn these off. No popup ad covers it.
- **Kill switches:** if 3 different players report one message, that bar's messages pause automatically. In the admin
  panel (Venues → **Partner messages**) you see the last 50 messages with how many phones and reports each had, a
  **Pause venue** button on each, and **Un-pause** for paused bars. To switch the whole feature off for everyone, turn
  the setting `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED` off in Vercel and redeploy.
- A message with nobody to send to (no player of that bar has the app with the switch on) isn't sent and doesn't use
  up one of the 2.

**Is it live?** No. Three steps need your OK, in this order:
1. Apply the database change to production (`supabase db push`; new tables + functions only, touches no existing data).
2. Commit and push the code (safe before step 3: with the setting off, nothing shows anywhere).
3. Add `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED=true` to Vercel Production and Redeploy — that is what makes the menu row
   appear for partners.

**Cost.** At most 2 sends per bar per day: one small database call plus one free Google push per phone. Opening the
compose box is 3 small reads; a player opening or reporting a message is one call. No new scheduled job.

**What needs you.** The three OKs above, then the phone check in section **N** of `docs/native-app-device-checklist.md`
(items 62–69).

---

## For the next agent

You have none of this conversation. Read `CLAUDE.md` (the "Phone push" bullet, which now includes 5.5), plan Phase 5
(5.3–5.5), the 5.4 handoff and this file.

### 1. What is next
- Phase 5.5 is code-complete. Remaining: Andrew's go-ahead for (a) `supabase db push` of `20261023145024`, (b) commit +
  push, (c) the Vercel flag + Redeploy; then his device pass (checklist N). Do NOT do any of (a)–(c) without his explicit
  OK in your session.
- Nothing else in Phase 5 is open except 5.2's iPhone section K test (Andrew) and his sections L–N.
- Out of scope: the app shell (nothing native changed); 5.4's cap; scheduled/delayed messages; images or links in
  messages; per-player rate limits on reports (one report per player per message is enforced by the primary key).

### 2. Starting state
- Branch `main`, last commit `bb5af57` (5.4). All 5.5 work is uncommitted (list in §4).
- Still uncommitted and NOT this phase's (leave alone): `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, `docs/reel-video-assets-plan.md`,
  `tests/fixtures/squares/nfl-live-capture-1392309.json`, Andrew's moved `design-system/project/public/info/*.png`
  (+ `New Folder With Items/`), local tool config (`.codex/`, `.mcp.json`, `.vscode/mcp.json`, `.firebaserc`,
  `firebase.json`), and the iCloud duplicate `native/ios/App/App/config 2.xml`.
- Production database: unchanged by this phase. The repo's `.next` currently holds a local build made WITH the flag on
  (for the browser check); harmless (Vercel builds its own), but rebuild before measuring anything locally.

### 3. Decisions made (Andrew's, plus defaults I chose — flag the defaults to him if he asks)
- Andrew (plan Phase 5): **2 per bar per day**, ≈150 characters, only to that bar's players with "News from your bars"
  on, compose box on the website Partner Dashboard only, words filter + report + admin kill switch.
- Defaults I chose (documented in code; easy to change, each is one constant or one line):
  - **150 characters max**, counted as Postgres counts (an emoji = 1).
  - **Filter** = no links/emails (a link in a push can't be vetted) + a short word list (slurs, sexual, strong
    swearing), whole words after undoing look-alikes, plus a few run-together checks. Deliberately NOT the username
    list (that blocks "kill", "sex", political names — wrong for bar promos).
  - **3 distinct reports on one message pause the bar** (`PARTNER_MESSAGE_REPORTS_TO_PAUSE`); only an admin un-pauses.
  - **Kill switch = two levels:** the flag (global, needs a redeploy; also the launch switch) and an instant per-bar
    pause in the admin panel. No instant global switch in the database (would need a settings table; ask Andrew if he
    wants one).
  - A message with no audience is not recorded and doesn't count against the cap (same as 5.4).
  - Players never learn that their report paused anything; the report answer is just "Thanks".
  - Send is confirmed in place (not a URL step). Closing with an unsent draft asks "Discard this message?"
    (`useDiscardGuard`).

### 4. Files (all new unless marked)
- `supabase/migrations/20261023145024_push_venue_messages.sql` — tables `push_venue_messages`,
  `push_venue_message_reports` (user FK CASCADE, so account deletion removes a player's reports),
  `push_venue_message_pauses` (row = paused; reason `reports`|`admin`); RPCs `claim_venue_message_push` (per-bar advisory
  lock `push_venue_messages:<venue>`; outcomes `claimed`|`paused`|`capped`|`unknown_venue`|`no_audience`),
  `is_venue_message_reader`, `read_venue_message`, `report_venue_message` (same lock; pauses at the threshold). All
  service_role only, RLS forced. The audience query is a copy of 5.4's — keep them in step.
- `lib/partnerMessageRules.ts` — pure: flag reader `isPartnerMessagesEnabled()`, caps/threshold/length constants,
  `checkPartnerMessage`, `normalizePartnerMessage`, `partnerMessageLength`, `PARTNER_MESSAGE_PARAM` +
  `partnerMessageIdFromSearch`, all on-screen words `PARTNER_MESSAGE_COPY`.
- `lib/push/venueMessages.ts` — server: `getVenueMessageStatus`, `sendVenueMessage` (filter → RPC → push after the reply
  via 5.4's `announceAfterResponse`), `readVenueMessage`, `reportVenueMessage`, `listVenueMessagesForAdmin`,
  `setVenueMessagesPaused`, `localDateIn`, `venueMessagePath`.
- `app/api/owner/messages/route.ts` — GET status / POST send (flag 404 → owner auth → venue ownership → work).
- `app/api/push/messages/[messageId]/route.ts` — GET read / POST report (signed session; 503 without `SESSION_SECRET`).
- `components/owner/messages/PartnerMessagesSheet.tsx` — compose box (dark `OwnerSheet`, `?sheet=messages`).
- `components/push/PartnerMessageSheet.tsx` — player popup on Venue Home (useSearchParams, own `<Suspense>`).
- `components/admin/sections/PartnerMessagesPanel.tsx` — admin list + pause/un-pause.
- Changed: `components/owner/menu/ownerMenuItems.ts` (row + `visibleOwnerMenuItems(pos, messages)`),
  `lib/ownerSheetParams.ts` (`messages` id), `app/owner/dashboard/page.tsx` (`MessagesSheetHost`, flag-gated),
  `components/venue/VenueHubClient.tsx` (mounts the player sheet), `components/ui/PopupAds.tsx` (holds while
  `?message=`), `app/api/admin/route.ts` (resource `partner-messages` GET + POST pause/unpause),
  `components/admin/sections/VenuesSection.tsx` (mounts the panel).
- Tests: `tests/partner-messages.test.ts` (new, 18), `tests/owner-menu-contract.test.ts` (new row/order),
  `tests/native-back-review-fixes.test.ts` (player popup pinned), `scripts/test-push-sql.cjs` (5.5 block + grants).
- Docs: `CLAUDE.md` push bullet, plan status line + 5.5 marker, device checklist section N, this file.

### 5. Facts and traps
- `tests/partner-messages.test.ts` greps `app/ lib/ components/` for the RPC names: only `lib/push/venueMessages.ts`
  may mention them — even a comment elsewhere fails it.
- A push's tap path carries `?message=`; `safePushPath` allows queries. If the player is already on Venue Home,
  `router.push` changes only the query — that is why the player sheet uses `useSearchParams` (not a mount effect).
- Closing the player sheet removes `?message=` with `history.replaceState` (Next keeps `useSearchParams` in sync).
- iCloud duplicates (`.next/types/* 2.ts`, `* 3.ts`) break `tsc`; delete them: `find .next/types -name "* [0-9].ts" -delete`.
- Playwright: reuse `node_modules` from scratchpad `…/f1b501a3-…/scratchpad` (playwright 1.61 = cached chromium-1228).
  Test player `bktrehearsal1` (`72144672-7506-428c-9347-421c1c3c5411`) at `venue-hightop-test`; cookies from
  `node --env-file=.env.local scripts/print-test-auth-cookies.cjs <userId> venue-hightop-test --format playwright`.
- Partner routes share the production database from a dev server: never POST a real send from local dev.

### 6. Build, run, verify (2026-10-23)
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` → 446 files / **5,526 passed, 13 skipped, 0 failed**;
  `npm run test:push-sql` passes (new: same audience as 5.4, its own cap, next-day reset, no-audience/unknown, length
  limits, reader rule incl. same-account, one report per player, 3rd report pauses, paused bar refused, un-pause,
  grants); `npm run test:account-deletion-sql` passes; `npm run test:pwa-contract` passes; `npm run build` OK.
- Browser (production build with the flag on, `next start -p 3100`, 390×844, all `/api/owner/*` and
  `/api/push/messages/*` mocked): menu row present; sheet opens at `?sheet=messages`; link and swear-word errors show
  live; counter `41/150` with an emoji; Send → confirm → POST body `{venueId, text}` → "Sent to 3 phones.", "1 message
  left today.", Sent list; Escape with a draft asks "Discard this message?". Player: `/venue/venue-hightop-test?message=…`
  shows "Message from Hightop Test"; Report → Report it? → one POST → "Thanks…"; Close removes `?message=`; an unknown
  id shows nothing and drops the param. No page errors.
- **Not verified:** the real RPCs against production (migration not applied); a real push of this kind to a phone;
  the admin panel in a browser (typechecked and lint-clean only).

### 7. Open questions for Andrew
- OK to apply migration `20261023145024`, commit + push, and turn on `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED`?
- Optional: are 3 reports the right pause threshold? Want an instant global off switch (in the database) as well as
  the flag?

### 8. Recommended first steps
1. `git status`; confirm the files in §4 are still uncommitted and nothing else of 5.5 is missing.
2. With Andrew's OK: `supabase db push` (check it lists only `20261023145024`), then verify with a probe:
   `claim_venue_message_push('no-such-venue', null, 'probe', 2, 60)` → `unknown_venue`, writes nothing.
3. Commit the §4 files only (not the unrelated ones in §2), push; then `vercel env add NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED
   production` (value `true`) and Redeploy.
4. After the first real message, check Vercel logs for `[Push] venue-message` and Andrew's checklist N.

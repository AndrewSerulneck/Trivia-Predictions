# Native app store plan — Phase 10.2 handoff (2026-10-26)

## For Andrew (plain English)

**What changed:**
1. The 10.1 database change is now **applied** to production (you approved it). I confirmed both new database
   functions answer, and the full test suite still passes.
2. **10.2 (partner-message fixes) is built:**
   - If a message was sent but the "messages left today" read failed afterwards, the partner used to see "Try again"
     (and could double-send). Now they always see "Sent to N phones".
   - The word filter no longer blocks harmless phrases like "Bring your mother for brunch". It still catches
     "fuckyeah", "f u c k", "f.u.c.k" and "MOTHERFUCKER".
   - With no venue chosen, the Message Your Players sheet says "Choose a venue to message its players." instead of
     spinning forever.
   - The admin "Partner messages" panel (and its two admin requests) now switch off with
     `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED`, so there is no wasted request while the feature is off.

**Is it live?** No. Nothing is committed, pushed or deployed. Partner messages stay behind the flag (off).

**What needs you:**
1. Confirm `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED` in Vercel (Production/Preview) before the first deploy that
   includes partner messages; keep it off until you want the feature.
2. 10.3 opens with a decision for you: show the "Get the app" banner/line on the apex player pages too, or `play.`
   only (recommended: also on the apex while the domain split is off). See §7.

**Known limit (accepted in the plan):** two-letter splits like "fu ck" get through the word filter. Reports and the
auto-pause are the backstop.

---

## For the next agent (Phase 10.3)

### 1. Next phase goal and scope
Phase 10.3 in `docs/native-app-store-plan.md` ("10.3 — Get the app links …", Sonnet 5.5, high; website only): F7, F8,
F9, F10. Start by asking Andrew the apex-vs-`play.` question (§7). Out of scope: 10.4, anything in 10.1/10.2,
Phase 7's flag.

### 2. Starting state
- Branch `main`, last commit `7aacf153`. **All 10.1 and 10.2 work is uncommitted**, on top of a large amount of other
  uncommitted work (5.5, Phase 7, …). Preserve everything; never `git checkout -- <file>`.
- Migration `20261026173304_partner_message_report_rules.sql` **applied to production 2026-10-26** via
  `supabase db push` after a dry run showing only that file. Tables touched had 0 rows. Verified afterwards with the
  service role: `venue_message_report_counts(uuid[])` and `unpause_venue_messages(text)` both answer without error.
  No data changed; no undo log needed (no rows). `20261023145024` (5.5) was already applied.
- 10.2 needed no migration.

### 3. Decisions already made
- 10.2 follows the plan text exactly: the reply after a recorded send is always `200 ok:true`, `status` may be null;
  the filter matches per word and per run of single-letter words, never across real words; `noVenue` copy is
  derived during render; admin gating uses the flag's single reader `isPartnerMessagesEnabled()`.
- Admin gating: `GET ?resource=partner-messages` and `POST resource:"partner-messages"` answer
  `404 { ok:false, error:"Not found." }` while the flag is off (same shape as the owner routes).

### 4. Files changed / created (10.2)
- `lib/partnerMessageRules.ts` — `checkPartnerMessage`: `BLOCKED_INSIDE` now checked per word, plus per run of
  consecutive one-letter words (loop with a trailing `""` sentinel to flush the last run). New
  `PARTNER_MESSAGE_COPY.noVenue`.
- `app/api/owner/messages/route.ts` — POST: status read in its own `try`; failure logs
  `[OwnerMessages] status-after-send-failed` and sends `status: null`.
- `components/owner/messages/PartnerMessagesSheet.tsx` — `reloadKey` state (effect dependency); a success without
  `status` shows "Sent" and bumps it; `!venueId` renders the `noVenue` line, loader/error/data are gated on `venueId`.
- `components/admin/sections/VenuesSection.tsx` — panel only when `isPartnerMessagesEnabled()`.
- `app/api/admin/route.ts` — 404 gate on the GET and POST `partner-messages` branches.
- Tests: `tests/partner-messages.test.ts` (+2: filter cases, admin gating), new `tests/api.owner.messages-send.test.ts`
  (send ok + status throws → 200/null/log/one send), new `tests/components.owner-messages-sheet.test.ts` (no-venue
  line is the only `role="status"`, no fetch; send without status → "Sent" + a third fetch of the status).
- Docs: plan status line (line 34) and `CLAUDE.md` partner-messages bullet now say 10.1 is applied.

### 5. Facts and traps
- `HightopLoader` renders `role="status"` — a test for "no loader" must count statuses, not look for a spinner role.
- `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED` is inlined at build time: the admin panel check is a client-side read of the
  same inlined value, so env then redeploy.
- `supabase db push` prints "Skipping migration Warnings…" (a stray file in `supabase/migrations/`, not ours; left alone).
- `npm run lint` reports errors only under git-ignored `tmp/group-games-phase-4/`; lint changed files directly.
- Don't run `tsc` concurrently with `next build`.

### 6. Build / test — verified 2026-10-26 (sequential)
`npx tsc --noEmit` clean; `eslint` on every changed file clean; `npm run test` → 452 files passed, 1 skipped, 0 failed
(after the migration was applied and after 10.2); `npm run build` succeeded. **Unverified:** the sheet and admin panel
in a real browser; the migration's behaviour with real data (0 rows exist).

### 7. Open questions for Andrew
- 10.3 decision: also show the app banner and sign-in "Get the app" line on the apex's player pages while the domain
  split is off? (recommended yes; if no, keep `play.` only but source it from `playHost()`).
- Vercel value of `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED` before the first deploy containing 5.5.

### 8. Recommended first steps for 10.3
Read the 10.3 section of the plan, then `lib/appStorePromotion.ts`, `components/native/AppStorePromotion.tsx`,
`lib/appDownloadLink.ts`, `app/app/route.ts`, `lib/domainSplit.ts`. Ask the §7 question first. Model/effort per plan:
Sonnet 5.5, high. Gates: the four standard ones plus `npm run test:god-mode-join` and `npm run test:pwa-contract`;
check `/info` stays static (○) in the build output.

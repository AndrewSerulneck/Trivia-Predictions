# Phase 4 handoff: short display link + Display page rewrite

## For Andrew

- **Database: live.** Every venue now has a permanent 4-character display code (`supabase db push` ran 2026-11-14 with
  your go-ahead), and new venues get one automatically. Brunswick Grove is `H91A`; all 16 are in
  `docs/live-trivia-pregame-and-display-cleanup-plan_PHASE_4_BACKFILL_LOG_2026-11-14_applied.json`.
- **Code: not committed, not pushed, not live.** Once deployed:
  - `hightopchallenge.com/tv/H91A` opens that venue's display. Lowercase works too. An unknown code goes to `/info`.
  - Bare `hightopchallenge.com/tv` goes to `/info` (the Link a TV pairing screen is gone).
  - The Display page shows one card: **Display URL** (`hightopchallenge.com/tv/H91A`) with a **Copy** button, your
    Step 1 and Step 2 lines, and a collapsible **Amazon Fire Stick** section with three steps. Preview and Expand are
    unchanged. The Link a TV card and the Manual setup accordion are gone.
  - The "venue added" email's **Set up your TVs** button now opens the Display page. Two email lines that talked about
    pairing or linking a TV now say "Display URL" (in `lib/email/partnerEmailCopy.ts`; edit freely).
- **Needs you:**
  1. **Fire Stick check:** in Silk, open the address bar, scan the QR code beside the keyboard with your phone and
     **paste** `hightopchallenge.com/tv/H91A`. Does the paste arrive, and does the screen fill the TV? If paste
     doesn't work, step 2's "paste the display URL, or" gets removed. This can only be tested after the code deploys.
  2. Read the new wording on the Display page and in the two emails.
  3. Commit when you're happy (I only committed Phase 3, as you asked).

## For the next agent (Phase 5: remove Link a TV) — Sonnet 5.5, medium effort

### 1. Goal and scope
Plan §4 Phase 5: delete the pairing pages, APIs, lib and tests; clean the mentions; after the code deploy is live,
a new migration drops `tv_pairing_codes`. Out of scope: anything in the display components, the display code itself
(Phase 4, done), the release (Phase 6).

### 2. Starting state
- Branch `feature/live-trivia-pregame-display`. HEAD `1d31346f` (Phase 3). Phase 2 is `625219bc`. **Phase 4 is
  uncommitted** working-tree changes (list in §4). Nothing pushed to GitHub or deployed. PR #16 (Phase 1) is still open.
- **Production database changed:** migration `20261114190044_venue_display_code.sql` is applied. Logs:
  `…_PHASE_4_BACKFILL_LOG_2026-11-14.json` (before, 16 venues, no column) and `…_2026-11-14_applied.json` (after,
  16 unique codes). Undo SQL is in the migration header (drop trigger, two functions, column). Nothing else reads the
  column yet in production, so the undo is safe until Phase 6 deploys.
- Untracked `* 2.ts/.m4a/.mp4/README 2.md` duplicates, `supabase/migrations/Warnings` and two older
  `docs/*_BACKFILL_LOG_*.json` files are not ours; leave them alone.

### 3. Decisions (don't re-ask)
D1–D14 in plan §1. Made this phase:
- **Andrew approved the `db push`** (2026-11-14). It ran; see §2.
- The code is filled by a `BEFORE INSERT OR UPDATE OF display_code` trigger whenever it is NULL, so new venues need
  no app change, a code can't be cleared, and the backfill was `update … set display_code = null`. The column is
  `NOT NULL`, unique, format-checked. Both functions are `SECURITY INVOKER`; the generator's EXECUTE is revoked from
  public/anon/authenticated (verified in production: anon RPC → 42501).
- Bare `/tv` is a **route handler** (`app/tv/route.ts`, 307), not a page: a `redirect()` in a page streamed back a
  200 with a meta refresh. `app/tv/page.tsx` is deleted.
- `/tv/<code>` answers 307 with `Cache-Control: private, no-store`; no rate limit (the display is already public).
- The email button goes to the **Display page** (`marketingUrl("/owner/display")`), not to a venue's short link
  (the email may be for a partner with several venues, and the page also has the Fire Stick steps).
- `GET /api/owner/venues?with=displayCode` adds the codes in the same query; without the parameter it is unchanged,
  so the dashboard's first load is untouched.
- The Display page wraps the URL before `/tv/` on narrow phones instead of truncating it (the code was being cut off at 289 px).

### 4. Files
- New: `supabase/migrations/20261114190044_venue_display_code.sql`; `lib/displayCode.ts` (alphabet,
  `normalizeDisplayCode`, `parseDisplayCode`, `displayCodePath`, `displayShortUrl`, `displayShortUrlLabel`);
  `app/tv/[code]/route.ts`; `app/tv/route.ts`; `scripts/display-code-backfill-log.mjs` (read-only; `preview` | `applied`);
  the two backfill logs; tests `tests/display-code-contract.test.ts` (lib, migration, Display page copy, bare /tv,
  email), `tests/api.tv-display-code.test.ts` (route), `tests/lib.ownerVenueList.test.ts`.
- Changed: `app/owner/display/page.tsx` (new card; pairing state, `useSearchParams` and `normalizePairingCode` gone);
  `lib/ownerVenueList.ts` (`withDisplayCode` option; falls back to no codes on Postgres 42703 so a deploy before the
  migration shows the long URL instead of "No venue found"); `app/api/owner/venues/route.ts`;
  `lib/email/sendVenueAddedEmail.ts`, `lib/email/partnerEmailCopy.ts`, `scripts/preview-partner-emails.cjs`,
  `tests/lib.email.venueAddedEmail.test.ts`; `lib/nativeLinkOut.ts` (the in-app notice for `/tv` now says "open their
  Display URL"); comments in `proxy.ts` and `lib/domainSplit.ts`; `tests/venue-screen-intro-stinger-contract.test.ts`
  (bare /tv is a redirect, so only the display holds the screen awake).
- Deleted: `app/tv/page.tsx`.

### 5. Facts and traps
- Phase 5 says to move the alphabet/normalize out of `lib/tvPairingShared.ts` into `lib/displayCode.ts`. **Already
  done differently:** `lib/displayCode.ts` has its own copy and nothing new imports `lib/tvPairingShared.ts`. After
  Phase 5's deletions, `lib/tvPairingShared.ts` has no importers left except `lib/tvPairing.ts`; delete both.
- With `app/tv/page.tsx` gone, `components/venue-screen/TvPairingDisplay.tsx` is now unused. The pairing APIs
  (`app/api/tv-pair/*`, `app/api/owner/tv-pair/claim`) are still there but nothing calls them.
- `lib/nativeLinkOut.ts` keeps `"/tv"` as a web-only path (so `/tv/<code>` never opens in the app) and its `openPath`
  is still `/tv` (now → /info). Keep `/tv` web-only.
- A stale `.next/types/app/tv/page.ts` (and `.next/dev/types/validator.ts`, owned by Andrew's running dev server) make
  `npx tsc --noEmit` in the main checkout fail with "Cannot find module app/tv/page.js". Not a real error: Andrew's
  dev server regenerates its own copy; typecheck in a clean clone (`rm -rf .next && npx next typegen && npx tsc --noEmit`)
  passes. Don't delete files under `.next/dev` while his server runs.
- Turbopack refuses a symlinked `node_modules` in a scratchpad clone ("points out of the filesystem root"): use
  `npx next dev --webpack -p <port>`.
- In a clone with no env, `gameUrl()` resolves to the **production** apex, so the Display page's preview iframe
  loads the real live screen. Mock `**/venue/*/screen**` if that matters.
- `supabase db push` prints "Skipping migration Warnings…" (a stray file named `supabase/migrations/Warnings`, not ours).
- The `venues` table has no other UPDATE triggers (only an AFTER INSERT inventory trigger), so the backfill touched
  only `display_code`.

### 6. Build / test / verify
- `npm run test`: 540 files, 7,099 tests ✔. `npx tsc --noEmit` ✔ in a clean clone (see §5). `npx eslint` on every changed file ✔.
- SQL: the migration ran twice against in-memory PGlite (`@electric-sql/pglite`) with 300 venues: 300 unique
  well-formed codes, rerun safe, insert filled, NULL refilled, lowercase/bad characters/duplicates rejected,
  generator EXECUTE only for postgres + service_role. Then applied to production (16/16 unique); `display_code = 'H91A'`
  → `brunswick-grove`; anon RPC to the generator denied.
- Browser (scratchpad clone, dummy Supabase env, `next dev --webpack -p 3191`, mocked `/api/owner/venues`; server
  stopped after; `:3000` untouched): Display page at 390, 350 and 289 px. No horizontal overflow, no console errors,
  URL wraps before `/tv/` at 289. `curl`: `/tv` → 307 `/info`; `/tv/help` → 307 `/info`.
- **Not verified:** `/tv/<code>` → display against the real database through HTTP (needs a deploy, or a dev server
  with real env, which would share production); the Fire Stick paste (Andrew); `npm run build`
  (Phase 6); the email's rendered look (`npm run email:preview` not run).
- Cost: one indexed `venues` read per `/tv/<code>` visit (a TV opens it once per power-on); the Display page's venue read gains
  one column. No polls, crons or new requests.

### 7. Open questions for Andrew
- Fire Stick: does paste through the keyboard QR work in Silk, and does the screen fill the TV? (Plan §4 Phase 4 step 6.)
- Wording sign-off: Display page card and the two email lines.

### 8. First steps for Phase 5
1. Ask Andrew to commit Phase 4 (or commit it if he says so). Read plan §4 Phase 5.
2. Delete the files in Phase 5 step 1 plus `components/venue-screen/TvPairingDisplay.tsx`; then
   `grep -rn "tv_pairing\|tvPairing\|tv-pair\|Link a TV\|TvPairing"` and clean what's left (§5 above).
3. The `drop table tv_pairing_codes` migration waits until the code deploy is live (Phase 6), then `db push` with Andrew's go-ahead.

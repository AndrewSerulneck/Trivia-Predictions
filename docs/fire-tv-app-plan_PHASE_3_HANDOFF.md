# Fire TV app — Phase 3 handoff (connect backend, /tv-app, Try demo, phone Connect page)

## For Andrew (plain English)

- **What changed:** the website now has everything the Fire TV app needs to connect a TV:
  - A **Connect** screen at hightopchallenge.com/tv-app. It offers Option 1 (scan the QR with your phone) **or**
    Option 2 (type your 4-character display code), plus **Try demo**.
  - A phone page where you tap **Connect**.
  - A demo of the Live Trivia screens that needs no venue.
- **Your round-2 answers** are in the plan as D21–D25. At launch the TV shows Live Trivia and Pick 'Em only (reserved
  phase R2 holds Category Blitz, Squares and Bracket), the store art uses Option 2 everywhere, the coin logo stays,
  and slides last 15 s.
- **Live?** Not yet. It's pull request **#36** (https://github.com/AndrewSerulneck/Trivia-Predictions/pull/36), not
  merged.
- **What I need from you:**
  1. **Say yes to `supabase db push`.** It adds one small table that holds TV connect codes for 10 minutes.
  2. Then say **merge it**.
  3. Then try it on a laptop (plan → "Andrew's steps → Phase 3").
  4. **One question:** should Category Blitz, Squares and Bracket also stay off the TV for venues using the Display URL
     in Silk today, or only in the new TV app? My recommendation: every display, because one behaviour is simpler and
     cheaper. That needs an answer before Phase 9, not now.
- **Cost:** about 200 tiny requests per TV, once, when you connect it. No new scheduled jobs. The TV pages are static
  files.

---

## For the next agent

**Status (2026-11-22):** Phase 3 code is done, committed and pushed. PR #36 is open. **Not done yet:**
`supabase db push` (waits on Andrew's yes), merge, deploy, and the live smoke test (Andrew scans a QR on a laptop
running `/tv-app`). Whoever picks this up finishes those steps first, then updates this note and the plan's Status
line before starting Phase 4.

### 1. Next phase goal and scope

- **Finish Phase 3 first:**
  1. Ask Andrew, then run `supabase db push`. The only new migration is `20261122114719_tv_device_pairings.sql`.
     Check `supabase migration list` first: the speed-trivia backlog plan has unapplied migrations (7d/7f/7g, per
     memory). If `db push` would also apply those, **stop and ask Andrew**. They belong to another plan.
  2. Merge PR #36 and wait for the Vercel deploy.
  3. Smoke test: Andrew opens `hightopchallenge.com/tv-app` on a laptop, scans the QR with his signed-in phone and
     taps Connect. The laptop should switch to his display within about 3 s.
- **Phase 4 (Fire OS app, `native-tv/`)**, Opus 5.5 / high per the plan table.
  - **In scope:** the Kotlin WebView shell that loads `https://hightopchallenge.com/tv-app`.
  - **Out of scope:** release signing, store assets, Vega, and the sports screens.

### 2. Starting state

- Branch `feat/fire-tv-connect`, cut from `main` at `102643f4`. Commit `30036288` holds all the Phase 3 code. This note
  and the Status line are in a follow-up commit on the same branch.
- Pushed. PR #36 is open against `main`. Nothing is merged or deployed.
- **Data:** nothing read from or written to Supabase. The migration is **not applied**.
- Keep-awake branch `fix/firestick-keep-awake` was already merged (PR #34). No uncommitted work was left behind.
- Dozens of untracked iCloud duplicates (`"foo 2.ts"`) remain in the tree. They aren't ours: never stage them, and
  never `git add -A`.

### 3. Decisions already made (don't re-ask)

- **D1–D25** are in the plan, and Andrew's round-2 reply is quoted verbatim in the Phase 1 handoff. Key points for
  later phases:
  - **D21:** launch content is Live Trivia + Pick 'Em; Category Blitz, Squares and Bracket are reserved (R2).
  - **D22:** store art Option 2 (`icon2`, `fire2`, `ban2`); keep the coin logo.
  - **D23:** 15 s per slide; the demo also uses 15 s.
  - **D24:** Andrew's stick is Fire OS (he believes so); Vega is still planned.
- **Choices made in Phase 3** (Andrew can overrule):
  - The status and display-code answers carry the **venue id only**, not the venue name. So the TV shows just
    "Connected." before the display loads (mockup A3 showed the name too).
  - `/tv-app` is classified **neutral**: it's served on whatever host receives it and never bounced across hosts,
    because the remembered venue lives in that origin's localStorage.
  - The display URL is built with `gameHref` (relative while the domain split is off), not `gameUrl`, so localhost and
    preview builds stay on their own host.
  - There is **no rate limit on the status poll**: a 32-byte secret can't be guessed, and a limiter would add a DB
    write to every poll. The create, display-code and connect routes are limited (buckets in `lib/rateLimit.ts`:
    `tvPairCreate` 60/h per IP, `tvDisplayCode` 30/h per IP, `tvConnectOwner` 30/h per owner).
  - The QR points at the **apex** `/owner/display/connect`. The phone app only claims `play.` links, so a phone camera
    always opens the browser.

### 4. Files and how they fit

- `supabase/migrations/20261122114719_tv_device_pairings.sql`: the table, with check constraints, a unique
  `pair_code`, a unique `poll_secret_hash` and an index on `expires_at`. RLS is forced and only `service_role` has
  access.
- `lib/tvConnectShared.ts` (pure):
  - code normalizing (O→0, I/L→1): `normalizeTvCode`, `parseTypedDisplayCode`, `parsePairCode`
  - `tvConnectUrl` (the QR target)
  - constants: TTL 10 min, poll 3 s, header `x-tv-pair-secret`, storage key `tp_tv_venue_id`
  - result types and `TV_CONNECT_COPY`
- `lib/tvConnect.ts` (server-only), each step a single statement:
  - `createTvPairing` (deletes expired rows first, then retries up to 3 times on a code collision)
  - `readTvPairingStatus` (connected is read once: the row is deleted)
  - `claimTvPairing` (ownership check, then a conditional update on unclaimed and unexpired)
- `lib/displayCodeLookup.ts` (server-only): `findVenueIdByDisplayCode`, now the one display-code lookup.
  `app/tv/[code]/route.ts` uses it too.
- Routes:
  - `app/api/tv-app/pairings/route.ts` (POST)
  - `app/api/tv-app/pairings/status/route.ts` (GET)
  - `app/api/tv-app/display-code/route.ts` (POST)
  - `app/api/owner/tv-app/connect/route.ts` (POST)
- `lib/tvApp.ts`: the only reader of `HightopChallengeTV/` and `window.HightopTV`. It exports `isTvAppUserAgent`,
  `tvAppVersion`, `isTvApp`, `readRememberedTvVenueId`, `rememberTvVenueId` and `forgetTvVenueId`.
  - The remembered-venue helpers try the bridge first, then localStorage.
  - **Phase 4 bridge contract:** an Android `addJavascriptInterface` named `HightopTV` with `getVenueId(): String?`,
    `setVenueId(String)` and `clearVenueId()`. All three are optional.
- `components/venue-screen/TvConnectScreen.tsx`: the Connect screen.
  - Authored at 1920×1080 and scaled to the viewport.
  - Polls every 3 s only while visible and unexpired.
  - An expired or failed code renews only on keydown, pointerdown or window focus.
  - D-pad: Up from the code goes to Try demo; Down or Left comes back.
  - The code input is an invisible `opacity-0` `<input>` over four boxes.
- `components/venue-screen/TvDemo.tsx` + `lib/tvAppDemo.ts`:
  - Steps: idle → pre-game → question → reveal → round break → final, 15 s each.
  - Remote: Right/OK next, Left back, Escape/Back exits (`router.back()`).
  - Rendered by `VenueScreenClient` with the new **`poll={false}`** prop: no fetch, and the client follows each new
    `initialState`.
- Pages: `app/tv-app/layout.tsx` (noindex), `app/tv-app/page.tsx`, `app/tv-app/demo/page.tsx` and
  `app/owner/display/connect/page.tsx`.
- Edge and global changes so `/tv-app` behaves like a display:
  - `proxy.ts` makes it public.
  - `lib/domainSplit.ts` makes it neutral.
  - `lib/playerRuntimePaths.ts` adds it to `isVenueDisplayPath`.
  - `components/auth/AuthNavigationGuard.tsx` and `LoginStuckStateBreaker.tsx` skip display paths.
  - `lib/appStorePromotion.ts` adds `tv-app` to the no-banner pattern.
  - `components/ui/AppShell.tsx` adds it to the fullscreen paths.
- Sign-in return path: `safeOwnerReturnPath` and `ownerLoginWithReturn` in `lib/ownerAuthCodes.ts`;
  `app/owner/login/page.tsx` honours `?next=`.
- Rules updated:
  - the Standing rule in `docs/live-trivia-pregame-and-display-cleanup-plan.md`
  - the `CLAUDE.md` feature row
  - `SYSTEM_CONTEXT.md` §0
  - the comment in `app/owner/display/page.tsx`
- Tests:
  - `tests/lib.tvConnect.test.ts` (lifecycle, against an in-memory table stand-in)
  - `tests/lib.tvConnectShared.test.ts`
  - `tests/api.tv-app.test.ts`
  - `tests/tv-app-contract.test.ts` (the tripwire)
  - new cases in `tests/app.owner-login-navigation.test.ts`
  - updated `tests/owner-loader-contract.test.ts`

### 5. Facts and traps found

- **`lib/tvPairingShared.ts` doesn't exist** (the plan mentioned it). It was removed with the old pairing.
  Normalizing now lives in `lib/tvConnectShared.ts`.
- **The player auth guard hijacked display-like pages.** `AuthNavigationGuard` redirects any path without a venue id
  to `/venue/<id>` when a player is signed in. A signed-in laptop opening `/tv-app` was bounced. Both guards now skip
  `isVenueDisplayPath`. Any new TV page must be under `/tv-app` or added there.
- **Global form CSS wins over Tailwind on TV pages:**
  - inputs get `border … !important` and a focus ring, so the code input hides with `opacity-0`
  - buttons get `border-radius: 12px` at higher specificity than `.rounded-full`, so the pill radius is inline
  - Never mix `border` and `borderColor` inline: React warns on rerender.
- **ESLint with zsh:** `$FILES` doesn't word-split in zsh; use `${=FILES}`. A path with `[code]` needs a glob such as
  `'app/tv/*/route.ts'`. Running `npm run lint` on the whole repo shows about 480 errors from `tmp/` and the iCloud
  " 2" duplicates; none come from this branch.
- **Scratchpad browser check recipe** (memory `feedback_dev_server_lock_no_pkill`):
  - rsync with **anchored** excludes. `--exclude native` also dropped `components/native`; use `--exclude /native`.
  - `cp -Rc node_modules` (Turbopack rejects a symlinked `node_modules`).
  - Start with `npx next dev --webpack -p 3117`.
  - Stop only your own PIDs.
- The `/venue/<id>/screen` page 404s for an unknown venue. A TV whose remembered venue was deleted stays on that 404
  until Menu → Change venue (Phase 4) or `/tv-app?change=1`.
- Try demo's idle screen still says "Hightop" alone (today's `TvIdleAttract`). Phase 11 step 6 fixes the full name
  (D10).

### 6. Build, run, test; what was verified

- Commands:
  - `npx tsc --noEmit`: clean.
  - `npm run test`: 599 files passed, 1 skipped.
  - ESLint on every changed file: clean.
  - `npm run build`: OK. `/tv-app` and `/tv-app/demo` are static (○).
- Browser check: scratchpad clone, no env, mocked APIs, `:3117`, Playwright from the repo's `node_modules`. Script:
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/167cc499-fa92-4404-8a59-ca8c74a07ac5/scratchpad/check/tvapp.mjs`.
  It passed 27/27, covering:
  - first focus on the code boxes; the QR is rendered
  - QR path → display, with the secret in the header only; the venue is remembered; reopening skips Connect
  - `?change=1` forgets the venue
  - D-pad focus; an unknown code shows "Code not found."; typing `kom2` sends `K0M2`
  - expiry: no silent renewal, polling stops, a key press makes a new code
  - no polling while hidden
  - the demo makes no `/api` request, and Escape exits it
  - a signed-in player isn't redirected away from `/tv-app`
  - the phone page: signed out → login with `next`, one venue → "Connected.", two venues, expired code, missing code
- Screenshots are in the scratchpad's `shots/` folder (they may be cleared by a reboot).
- **Not verified:**
  - the real database: the migration is unapplied, and the lifecycle was tested against an in-memory stand-in
  - the real phone-camera flow on iPhone Safari
  - Fire TV WebView behaviour: D-pad, the on-screen keyboard over an `opacity-0` input, and `history.length` for the
    demo's exit. **Phase 5 checks those on the device.** If the Fire TV keyboard doesn't open for an `opacity-0`
    input, switch to an off-screen but visible input.

### 7. Open questions for Andrew

- **Yes to `supabase db push`**, then merge (blocking Phase 3 close-out).
- **D21 scope:** should Category Blitz, Squares and Bracket be off for every display (Silk Display URL too) or only in
  the TV app? Recommendation: every display. Needed before Phase 9.
- Which test venue's display code goes in Amazon's reviewer notes (Phase 6; Try demo covers review without one).

### 8. Recommended first steps

1. Read this note and the plan's D21–D25.
2. Finish Phase 3 (§1): ask for and run `db push`, merge #36, then run the smoke test with Andrew.
3. Then Phase 4 in a new session, **Opus 5.5 / high**, on a new branch from `main`:
   - Load `https://hightopchallenge.com/tv-app`.
   - Append ` HightopChallengeTV/<versionName>` to the user-agent.
   - Expose the `HightopTV` bridge (§4).
   - Menu → Change venue loads `/tv-app?change=1` after calling `clearVenueId`.
   - Back on `/tv-app/demo` = WebView `goBack()`.
4. This phase ran on **Opus 5.5 / high**, as the plan names.

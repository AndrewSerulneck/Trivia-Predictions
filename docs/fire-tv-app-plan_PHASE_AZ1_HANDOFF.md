# Fire TV app — Phase AZ1 handoff (Amazon rejection fix: the Connect QR offers sign-in only)

Done 2026-11-27 by Claude (Opus 5.5 / high, as the plan names). Plan: `docs/fire-tv-app-plan.md` (D40, "Phase AZ1").

## For Andrew

- **What changed:** when a phone scans the QR on the TV app's Connect screen, the pages it reaches now offer only
  sign-in, "Forgot your password?" and Connect. Gone from those pages: "Create an account", the "Manage your
  subscription and billing" line, the "Back to Home Page" button, the Connect page's Back button to the dashboard, and
  the automatic jump to signup for an account with no venue (it now says "No venue found for this account.").
- **Unchanged:** the normal partner sign-in page (`hightopchallenge.com/owner/login` reached any other way) still has
  "Create an account" and its Home button. Partners who scan while already signed in see the same Connect page as
  before, minus the Back arrow. The TV app itself is unchanged: **no new app file and no store release.**
- **Listing text** in `docs/fire-tv-store/listing.md` is updated (feature bullet, last paragraph of the long
  description, reviewer notes), ready for you to paste in AZ2.
- **Live:** shipped to production in one PR (CLAUDE.md exception: Amazon's reviewer scans against the live site).
  See §9 below for the production check.
- **Your turn: AZ2.** Follow "Andrew's steps → AZ2" in `docs/fire-tv-app-plan.md`.
- **One wording point to decide before you paste (open question 1):** the new long description says "no account can be
  created in the app or through its QR codes". The TV's other QR, "Get the app", opens the free player app, where a
  guest *can* make a free player account. The reply to Amazon says the same thing ("No account can be created … through
  any QR code it shows"). If you'd like it exact, change "no account" to "no partner account" in both places. It's your
  call; I left the approved text as written.

## For the next agent

### 1. Next phase, scope

**AZ2 is Andrew's** (Amazon console resubmission + reply email). No agent work is planned until Amazon answers.
If Amazon rejects again, read its email, then: if it objects to the "Get the app" QR, D40's fallback is to hide that QR
inside the TV app only (user agent `HightopChallengeTV/`, read only via `lib/tvApp.ts`). If the console insists on a new
app file, `npm run fire-tv:release` builds and uploads one (it stops if a release is in review). CR1.7 (Fire TV shell
1.0.1) still waits for approval. Out of scope for everyone: Amazon IAP (D40: no).

### 2. Starting state

- Branch `fix/amazon-connect-signin-only` (from `fix/cr2-connect-privacy`, then `git merge origin/main` at
  `4483a238`). Code commit `73015daa`; docs commit after it (this handoff, plan status, listing). Pushed once, one PR,
  CI green, merged (PR number: see `gh pr list --state merged --head fix/amazon-connect-signin-only`; record it in the
  next PR that touches this plan, per CLAUDE.md no docs-only PRs).
- The branch also carried the older unpushed docs commit `65263347` (CR1.2.1 deploy record) — now merged.
- No migration, no data change, no env var, no store release.

### 3. Decisions (don't re-ask)

- **D40** (Andrew 2026-11-27): consumption-only TV app, no IAP. Text of AZ1 steps, listing text and reviewer notes
  were approved by Andrew in the plan.
- **"TV mode"** = the sign-in page's `?next=` returns to `/owner/display/connect` (`isTvConnectReturn`). No new query
  parameter.
- `?next=` is read **on the server** (async `page.tsx` → client form), so TV mode is right in the first paint: the
  signup link never flashes. Cost: `/owner/login` and `/owner/forgot-password` are now dynamic (rendered per request)
  instead of static. These are low-traffic pages; the extra function invocations are negligible.
- **Reset email does not carry `next`** (plan step 4, accepted outcome). The email's link is fixed by
  `app/api/owner/auth/forgot-password/route.ts` (`redirectTo = marketingUrl("/owner/reset-password")`); adding a query
  string there would have to match Supabase's redirect allow-list, which I can't see, and a mismatch would break
  password reset for every partner. After a reset the partner is signed in and lands on `/owner/dashboard` (or
  `/owner/login` with no owner row) — a separate visit from an email, not from the app.
- The Connect page no longer uses `ownerAuthRecoveryPath` (it would send `no_venue` to signup). Other owner pages still
  do; that's unchanged and correct for them.

### 4. Files

- `lib/tvConnectShared.ts` — `isTvConnectReturn(next: unknown): boolean` (pathname of `safeOwnerReturnPath(next)` is
  exactly `TV_CONNECT_PATH`). Now imports `safeOwnerReturnPath` from `lib/ownerAuthCodes.ts` (no cycle).
- `lib/ownerAuthCodes.ts` — `OWNER_FORGOT_PASSWORD_PATH`, `ownerForgotPasswordWithReturn(returnPath)`.
- `app/owner/login/page.tsx` — now a server component: reads `searchParams.next`, renders
  `OwnerLoginForm returnPath={safeOwnerReturnPath(next)}`.
- `app/owner/login/OwnerLoginForm.tsx` — the old client page (git-moved). TV mode: no subtitle, no `backTo`, no
  "Create an account"; "Forgot your password?" always carries a safe `next`. Submit still reads `next` from
  `window.location` (unchanged).
- `app/owner/forgot-password/page.tsx` + `OwnerForgotPasswordForm.tsx` — same split; "Back to sign in" →
  `ownerLoginWithReturn(returnPath)` when there is one.
- `app/owner/display/connect/page.tsx` — `unauthorizedReason(res)` (module level): `no_venue` → shows "No venue found
  for this account." (GET and the Connect POST), anything else → sign-in with `next`. `OwnerShell … hideMenu`, no
  `backTo`.
- `components/owner/OwnerShell.tsx` — new `hideMenu` prop (dark variant, no `backTo`): passes a spacer as the app bar's
  leading slot, so neither the logo menu nor its drawer (dashboard, billing, legal links) renders.
- `tests/tv-connect-signin-only-contract.test.ts` — new (7 cases). Updated: `tests/app.owner-login-navigation.test.ts`
  (renders `OwnerLoginForm`), `tests/native-app-contract.test.ts` and `tests/owner-loader-contract.test.ts` (read
  `OwnerLoginForm.tsx`; the Home-button regex now allows `backTo={tvMode ? undefined : { home: true … }}`).
- `docs/fire-tv-store/listing.md` — the three text changes from plan step 9, verbatim.
- `docs/fire-tv-app-plan_PHASE_CR1.4_HANDOFF.md` §9 — recorded the CR1.4 post-deploy check that was owed to "the next
  PR that touches this plan" (result from the CR1.4 agent's chat report, kept in memory: passed).

### 5. Facts and traps found (plan steps 5–6: every redirect read)

- `proxy.ts`: `/owner/*` passes straight through (owner auth is per API, cookie `tp_owner_sess`). No redirect to
  signup, billing or checkout.
- `/api/owner/venues` and `/api/owner/tv-app/connect`: the only 401s come from `requireOwnerAuth`
  (`no_session` / `no_venue`); no billing or lapse checks; neither route redirects. Connect's other failures
  (`expired`, `not_your_venue`, `invalid`, `rate_limited`, `unavailable`) show a one-line message.
- `/api/owner/auth/login`: never redirects. An owner with no surviving venue is refused with "Invalid email or
  password." (and its orphan rows are cleaned up — pre-existing). An **unpaid pending signup** (owner + unpaid venue row,
  `lib/pendingSignup.ts`) signs in normally and returns to Connect, which lists that venue; no payment prompt appears on
  this path (open question 2).
- `/owner/reset-password` "Link Expired" links to `/owner/forgot-password` (no `next`); only reachable from an email.
- **Test trap:** mocking `useRouter` to return a new object per call makes the Connect page's `[router]` effect loop
  forever (the test hangs at 5 s). Return one shared router object.
- **Test trap:** `ExitBackButton` renders a `<button>` (navigation via `useExitNavigation`), not a link: assert on
  `router.push`/`replace`, not `href`.

### 6. Build, run, test — what was verified

- Test written first: on the old code 4 of 7 cases failed (signup link `/owner/register` on TV-mode login;
  forgot-password back dropped `next`; `no_venue` → `router.replace("/owner/register")`; Back + menu on Connect).
  After the fix 7/7 pass.
- `npm run test`: 620 files, 8084 passed, 13 skipped. `npm run lint`: clean. `npx tsc --noEmit`: clean.
- Browser check, scratchpad clone (no `.env.local`, `npx next dev -p 3117`, Playwright, 390×844 phone, `/api/owner/*`
  mocked): 17/17 passed. Signed out → `/owner/login?next=…` with only email, password, eye toggle, Sign In and
  Forgot; Forgot keeps `next`, Back returns to the same TV-mode sign-in; `no_venue` → "No venue found for this
  account." with no controls; signed in → venue name + Connect only → "Connected." (POST `{pairCode, venueId}`);
  plain `/owner/login` still has "Create an account" and "Back to Home Page". Script:
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/2ed29a75-7cc1-4557-9b92-12429268a539/scratchpad/check/azcheck.mjs`
  (`node azcheck.mjs <base> <outDir> [live]`; `live` runs only the read-only signed-out check).
- Not verified: a real reviewer's phone; the reset email end to end (unchanged code).

### 7. Open questions for Andrew

1. Listing and reply wording "no account can be created … through its QR codes": the "Get the app" QR leads to the
   free player app, where guests make free player accounts. Change to "no partner account"? (Andrew's call; text left
   as approved.)
2. An unpaid, unfinished partner signup can sign in from the Connect QR and connect a TV to its unpaid venue. Nothing
   on that path asks for payment, so it doesn't affect Amazon. Fine as is? (Not changed.)

### 8. Recommended first steps (after Amazon answers)

- Approved → Phase 13 / CR1.7 per the run order in the plan's status line. Rejected → read the email, then see §1.

### 9. PR and deploy

Pushed once; one PR from `fix/amazon-connect-signin-only`; CI watched once; merged under the auto-merge rule.
The production check (Playwright, phone viewport, read-only, signed out:
`https://hightopchallenge.com/owner/display/connect?c=ABCDEF`) is reported to Andrew in chat and recorded here by the
next PR that touches this plan.

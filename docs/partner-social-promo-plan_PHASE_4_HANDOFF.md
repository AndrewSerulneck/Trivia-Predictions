# Share to social: Phase 4 handoff (Meta setup)

**For Andrew:** the code side of Meta setup is done: two "Meta calls us" addresses (when a partner removes our app,
and when someone asks Facebook to delete their data), a new privacy-policy section about Instagram/Facebook, a matching
paragraph on the Delete Your Account page, and a step-by-step checklist for you: `docs/partner-social-promo-meta-setup-runbook.md`.
Nothing is live, committed or deployed. **What needs you:** (1) Meta Business verification and creating the new Meta
app (runbook §1–2), which you can start now; (2) the app secret goes in as `META_PARTNER_APP_SECRET` (append to
`.env.local`, `vercel env add`), and Meta can only test the callbacks after a deploy, which waits for the App Store
review (branch rule); (3) the privacy text describes "disconnect in the Partner Dashboard", which Phase 5 builds, so
deploy the policy together with or after Phase 5 (or tell me to soften the wording). No cost: no cron, no database, no
paid API.

## For the next agent

### 1. Next phase
Phase 5 (Instagram Post now; Opus 5.5 xhigh): `social_connections` / `social_posts` migration with grants, `lib/social/crypto.ts`
(`SOCIAL_TOKEN_KEY`), OAuth connect, publish + polling, `lib/social/flags.ts`. **Do not start until Andrew has the Meta app
created** (runbook §2); before approval it works only for app testers. Out of scope: Facebook (Phase 6), scheduling/cron (7).
Also open before any deploy: `/code-review high` on Phases 1–4, Andrew trying Reels on a phone, music picks (Phase 2
handoff §7).

### 2. Starting state
Branch `after-app-review`, last commit `5fd76ed9`; **Phases 0–4 uncommitted**. No migration, env change, cron or deploy.
Main frozen for the App Store review: never push main, `supabase db push`, or change Production env without Andrew.

### 3. Decisions
D1–D26 stand. New, my call: **no feature flag on the callbacks** (Meta must reach them during review, and they only verify
+ disconnect); the **deletion status URL is the existing `/delete-account` page** (`?code=…#partner-social`) rather than
a new page, so no proxy/domain-split/`LEGAL_PAGE_PATHS` changes; the **confirmation code is derived** (HMAC of the Meta
user id), nothing stored. `LEGAL_LAST_UPDATED` bumped to "November 3, 2026".

**Andrew's answers (2026-11-04):** deploy the policy text together with Phase 5, and **never merge anything to `main`**
(App Store review): deploy only as a Preview of `after-app-review`. The runbook was then rewritten as a short
"before Phase 5" checklist (Steps 1–6); the permission justifications and screencast scripts were removed from it, so
**the App Review phase must write them fresh** (permission list is at the bottom of the runbook; scripts: connect →
post now → live result → schedule/cancel → disconnect, for Instagram and for Facebook).

### 4. Files
- `lib/social/metaSignedRequest.ts`: pure `verifyMetaSignedRequest(signed, secret)` (HMAC-SHA256 over the payload string
  as received, constant-time, requires `algorithm` HMAC-SHA256 and a numeric `user_id`) and `metaDeletionConfirmationCode`.
- `lib/social/metaConfig.ts` (server-only): the **only** reader of `META_PARTNER_APP_SECRET`; `metaDeletionStatusUrl`
  uses `NEXT_PUBLIC_APP_URL`.
- `lib/social/metaCallbacks.ts`: `handleMetaCallback(request, kind)`: 503 if no secret, 400 if not a form, 401 if bad
  signature, else calls **`removeMetaUserConnections(metaUserId)`, currently a no-op returning 0: Phase 5 must fill it in**
  (delete the token, mark connection removed, cancel scheduled posts, delete kept media). Logs kind only, never ids.
- `app/api/social/meta/deauthorize/route.ts` → `{ok:true}`; `app/api/social/meta/data-deletion/route.ts` → `{url, confirmation_code}`.
- `app/privacy/page.tsx` (new partner section; Meta added to "Who we share it with"), `app/delete-account/page.tsx`
  (`<div id="partner-social">` section), `lib/legalInfo.ts` (date).
- `tests/lib.social-meta-callbacks.test.ts` (9 tests). `docs/partner-social-promo-meta-setup-runbook.md`.

### 5. Facts and traps
- Meta posts `signed_request` as **form-encoded**, not JSON. `/api/*` is already public in `proxy.ts`.
- Meta's permission/menu names change; the runbook says to re-check them, and I did not browse Meta's docs this phase
  (plan §11 "verify every endpoint and scope at build time" is still open for Phase 5).
- The OAuth redirect URIs in the runbook (`/api/social/meta/instagram/callback`, `/facebook/callback`) are **proposals**
  for Phases 5–6; Meta needs them entered exactly.
- `.env.local` was not touched; the secret does not exist yet, so the routes answer 503 everywhere today.

### 6. Verified / not
Verified: `npx tsc --noEmit` clean; eslint clean on touched files; `npm run test`: 481 files pass, only the 4 stale
sports-bingo snapshot tests fail (pre-existing). Callback behaviour is proven by unit tests with a locally signed
request. **Not verified:** a real Meta-signed request (needs the real app + deploy), `npm run build` this phase.

### 7. Open questions for Andrew
1. Deploy the policy text with Phase 5 (recommended) or now with softer wording?
2. Terms of Use (`/terms`) not changed; add a partner "posting on your behalf" clause? (Legal call.)
3. Which square logo for the 1024×1024 Meta app icon?

### 8. First steps for Phase 5
Read plan §4.6, runbook §0, this note §4. Confirm with Andrew that the Meta app exists and get the App ID. Check Meta's
current Instagram Login docs. Then migration (`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`), `lib/social/crypto.ts`
(copy `lib/pos/crypto.ts`), and wire `removeMetaUserConnections`.

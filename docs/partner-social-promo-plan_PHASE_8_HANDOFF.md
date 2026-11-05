# Share to social — Phase 8 handoff (Seal the hidden Post now routes)

**For Andrew (plain English):** The "Post now" box (posting straight to Instagram or Facebook) is already hidden
from partners, but the server code behind it still worked whenever the publishing switch was on, and that
switch **is on for Preview sites today**. So anyone with a direct link could connect an Instagram account to
a feature nobody can see. That code is now switched off in the code itself (it answers "not found"), even with
the Preview switch on. Nothing changes for partners: Share, Download and Copy caption work as before. Meta's two
required callbacks (deauthorize and data deletion) still work. Not committed and not deployed (branch
`after-app-review`). Nothing needed from you. **One heads-up:** to record the Meta App Review screencast on a
Preview, Post now has to be turned back on first (checklist below). Ask for it when you're ready to record.

---

## For the next agent

### 1. Next phase
Phase 9 or Phase 10 (either order), then 11 (after both), 12 and 13 any time. See `docs/partner-social-promo-plan.md`
§5.3–§5.7 and the model table in §5.1 (Phase 9: Opus 5.5 xhigh; Phase 10: Opus 5.5 high). Out of scope everywhere:
re-attaching the Post now box (needs Andrew), migrations, `supabase db push`, env changes, crons.

### 2. Starting state
- Branch `after-app-review`, last commit `1e803523 docs: game themes plan`. Phase 8 is **uncommitted** and sits on
  top of the uncommitted Phase 5–6 + game-themes work (see `git status`). Nothing pushed or deployed. No data changes.
- `vercel env ls` (2026-11-04): `NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED` is set for **Preview only** (not Production,
  not Development). Whether `.env.local` has it is unknown: reading names there was denied by the permission
  hook, so it was left alone.

### 3. Decisions
- **Seal, not re-attach.** Plan §10 asked Andrew. He didn't pick one (he said he didn't understand the
  question), so the plan's default, seal, was used. Re-attaching for the screencast is still his call (§5.2
  "Alternative").
- The switch is a **code constant**, not a second env var, so turning Post now back on is one reviewed change
  together with the UI.

### 4. Files changed
- `lib/social/flags.ts`: added `SOCIAL_POST_NOW_ON_SHEET = false` and `isSocialPostNowLive()`
  (= `isSocialPublishEnabled() && SOCIAL_POST_NOW_ON_SHEET`). Still the only reader of the env var.
- `lib/social/ownerSocialGuard.ts` (`guardOwnerSocialVenue`, used by all 8 JSON routes),
  `app/api/owner/social/meta/connect/route.ts`, `app/api/owner/social/meta/callback/route.ts`: now gate on
  `isSocialPostNowLive()`. No other code calls `isSocialPublishEnabled()`.
- `tests/social-publish-contract.test.ts`: the "no Post now box" test is replaced by
  `SOCIAL_POST_NOW_ON_SHEET === true` ⇔ `ShareToSocialSheet.tsx` renders `<SocialPostNowPanel`. Also checks that
  only `flags.ts` calls `isSocialPublishEnabled(`, that the route gate test looks for `isSocialPostNowLive()`, and a
  new test that `app/api/social/meta/*` and `lib/social/metaCallbacks.ts` never use either gate.
- `tests/lib.social-publish.test.ts`: `vi.mock("@/lib/social/flags")` with a hoisted `postNowSwitch.onSheet`
  (reset to `true` in `beforeEach`), so the route behaviour tests still run as they will once Post now is back.
  The "flag off" test is now `it.each` over (a) env off, (b) env on but box off the sheet. All 10 routes return 404.

### 5. Traps
- The contract test's `code()` comment stripper uses `/\/\*[\s\S]*?\*\//`. Writing `/api/owner/social/**` in a `//`
  comment opens a fake block comment that runs to the next `*/`. In `flags.ts` that swallowed the
  `process.env…` line and failed the one-reader test. Keep `flags.ts` comments as `//` lines with no `*/`.
- Tests that exercise social routes must mock `isSocialPostNowLive` (as `lib.social-publish.test.ts` does); stubbing
  the env var alone now gets a 404.

### 6. Verify
- `npx vitest run tests/social-publish-contract.test.ts tests/lib.social-publish.test.ts tests/lib.social-meta-callbacks.test.ts`
  → 56/56 pass.
- `npm run test` → 6313 pass, 4 fail. All 4 are the MLB/NFL star-index snapshot staleness tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`). They fail on the date and are unrelated to this phase.
- `npx tsc --noEmit` clean. `npx eslint lib/social app/api/owner/social` + the two tests clean.
- Not done: a scratchpad-clone run with a live server. The route-level test covers the same 404s in-process.

### 7. Open for Andrew
- When he wants to record the Meta App Review screencast, Post now must come back (checklist below), at least on
  a Preview.

### 8. Checklist: when Post now comes back (not now)
1. `lib/social/flags.ts`: `SOCIAL_POST_NOW_ON_SHEET = true`.
2. **Superseded by Phase 16: skip this step.** The panel reads `?socialResult=` itself with `useSearchParams()`. (Old text: restore
   `const socialResult = searchParams.get("socialVenue") === venueId ? searchParams.get("socialResult") : null`
   and pass it to `ShareToSocialSheet` → `SocialPostNowPanel`'s `socialResult` prop.)
3. `components/owner/social/ShareToSocialSheet.tsx`: render `<SocialPostNowPanel {...postNowProps({ … })} />` when the flag is on (Phase 19: only through `components/owner/social/postNowProps.ts`; the exact snippet is in the comment at the top of the sheet, and a contract test rejects any other form). Check `next build` for the Suspense boundary.
4. `tests/social-publish-contract.test.ts` then requires both 1 and 3. Phases 9–11 must be done first (plan §5).

### 9. First steps for Phase 9
Read plan §5.3, then `lib/social/socialPosts.ts` and the Phase 6 tests in `tests/lib.social-publish.test.ts`.
Model: Opus 5.5, effort xhigh.

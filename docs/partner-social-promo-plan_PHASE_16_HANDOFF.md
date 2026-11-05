# Share to social — Phase 16 handoff (Post now panel: ready to come back)

**For Andrew (plain English):** Still nothing visible to partners. The hidden "Post now" box is now ready to be
switched back on with one change. It shows its own "connected / try again" message after Facebook sends the partner
back, it has its own Caption box (pre-filled, editable, Posts and Reels only; this is decision D38, default yes), and
if the phone is offline when picking an account or disconnecting, the partner now sees an error instead of nothing.
Not committed, not deployed, no database or setting change, no cost change. Nothing needed from you. Phase 17
(only a saved Instagram handle goes on the picture) and 18 (clean-ups) remain.

---

## For the next agent

1. **Next phase:** 17 (`docs/partner-social-promo-plan.md` §5.11; Sonnet 5.5, medium), then 18 (§5.12; Opus 5.5, medium).
   Out of scope: turning Post now on, migrations, `db push`, env, crons, `vercel.json`.
2. **State:** branch `after-app-review`, last commit `1e803523`. Phase 16 is uncommitted on top of the other
   uncommitted social/game-themes work. `SOCIAL_POST_NOW_ON_SHEET` is still `false`; all `/api/owner/social/**` 404.
3. **Decisions:** D38 built as default (Caption box inside the panel only; sheet stays caption-free, D34). Not yet
   answered by Andrew.
4. **Files:** `components/owner/social/SocialPostNowPanel.tsx` (props: `captionInput` replaces `caption`; `connectResult`
   removed; uses `useSearchParams`, `promoCaption`, `socialCaptionProblem`), `lib/promo/promoCopy.ts`
   (`captionLabel`), `components/owner/social/ShareToSocialSheet.tsx` (header comment holds the exact mount snippet),
   `tests/components.social-post-now-panel.test.ts` (new), `tests/social-publish-contract.test.ts` (new test),
   plan §5.10 "As built", Phase 8 handoff §8 step 2 marked superseded.
5. **Traps:** the real `<SocialPostNowPanel` must not appear in the sheet while the flag is false (contract test), so
   the mount is a comment. Template id sent to the API is `template.game`. Stories send `caption: ""`.
   Edit-kept logic compares against the current suggestion, so changing game/prizes resets the caption.
6. **Verified:** `npx vitest run tests/components.social-post-now-panel.test.ts tests/social-publish-contract.test.ts`
   → 20 pass; `npx tsc --noEmit` clean; eslint on changed files clean; `npm run test` → 6395 pass, 4 fail (the known
   MLB/NFL star-index date tripwires). **Not run:** `next build` and a browser check (panel isn't mounted).
7. **Open for Andrew:** D38 confirmation; when Post now comes back, run `next build` (Suspense for `useSearchParams`).
8. **First steps for Phase 17:** read §5.11, change `const handle = handleOn ? savedHandle : null` in
   `ShareToSocialSheet.tsx` (~:176–190), add the tests listed there, check at 350 px.

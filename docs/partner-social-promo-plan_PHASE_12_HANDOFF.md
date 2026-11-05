# Share to social — Phase 12 handoff (details load error, helper names)

**For Andrew (plain English):** If the Share to social sheet can't load the bar's address and Instagram handle, it
now says "Couldn't load your address and Instagram handle." with a **Try again** button, instead of silently leaving
those ticks out. The picture still works without them. I also gave the browser-side "load/save share details"
helpers their own file and clearer names, so they can't be mixed up with the server function of the same name.
Not committed or deployed (branch `after-app-review`); no database, env or cost change (a retry is one GET per tap).
Nothing needs you. I did not look at the sheet in a browser at 350 px; the tests cover behaviour, not layout.

**What changed**
- New `lib/venueShareDetailsClient.ts`: `fetchVenueShareDetails`, `patchVenueShareDetails`, `cachedVenueShareDetails`
  (the cache and in-flight map moved here from `components/owner/share/ShareDetailsPanel.tsx`; a failed GET is
  never cached). Old names `getVenueShareDetails` / `saveVenueShareDetails` are gone (no wrappers). The server
  `getVenueShareDetails` in `lib/venueShareDetailsStore.ts` is untouched.
- `ShareDetailsPanel.tsx` and `components/owner/social/ShareToSocialSheet.tsx` use the new module. The sheet has
  `detailsLoad` + `detailsAttempt` state; the effect re-runs on Try again. Button is `min-h-11`, text `text-footnote`/`text-sm`.
- `lib/promo/promoCopy.ts`: `SHARE_SOCIAL_COPY.detailsLoadFailed`, `detailsRetry`.
- Tests: new failure/retry test in `tests/components.share-to-social-sheet.test.ts`; new contract line in
  `tests/social-publish-contract.test.ts` (no file under `components/` imports `@/lib/venueShareDetailsStore`).

**Verified:** the three touched test files pass (31); `npx tsc --noEmit` clean; eslint on touched files clean;
`npm run test` 6368 pass, 4 fail (the same MLB/NFL star-index date tripwires as Phases 8–11, unrelated).
**Not done:** 350 px visual check; `npm run build`.

**Next:** Phase 13 (game-themes rule wording in `CLAUDE.md` row "Game themes", plan §5.7), Haiku 5.5 / low, doc-only.
Note `CLAUDE.md` already has uncommitted edits; change only that table cell.

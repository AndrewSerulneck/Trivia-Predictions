# Pick 'Em plan — Phase 7.5 handoff (2026-11-01)

## For Andrew (plain English)
Three small fixes, code only (no database change, nothing deployed, nothing committed):
1. When a player has used up their picks for a prize, the message on a blocked game now names the prize that covers THAT game (before, it could quote another prize).
2. The prize sweep's "what was graded in the last 5 minutes" check now reads in order and in pages, so a very busy minute can't hide a venue.
3. The tiebreaker card's green "Saved!" flash now uses the theme colours (matters only when the light theme is turned on).
Also: you applied 7.1c, so the plan now says so. Left: 7.6 re-review, then your phone pass.

## For the next agent (7.6: Opus 5.5 · xhigh — re-review of 7.1–7.5)
- Branch `after-app-review`, uncommitted work from Phases 1–7.5 (main frozen during App Store review: no push to main, no `supabase db push`, no Production env changes). All migrations incl. `20261101153306` (7.1c) are applied.
- Scope of 7.6: review everything from 7.1–7.5; don't patch in place — findings go in a new plan section, fixes as new sub-phases. F7 (TBA kickoffs) stays a recommendation only (§8 Q5).
- Changes in 7.5:
  - F5: `lib/pickem.ts` + `PickEmGameList.tsx` `Game.pickLimitMessage`; set in `lib/pickemGamePrizes.ts` beside `pickLimitReached`, inside the loop over only the games THAT prize covers (`??=` so the first covering prize with a used-up limit wins on a game covered by two). The list reads `game.pickLimitMessage ?? "You've used all your prize picks."` (the old `prizes.find(...)` is gone).
  - F6: `lib/pickemPrizeAwards.ts` recent-grading read: `order resolved_at desc, id asc` + `.range` paging, up to `PICKS_PAGE_CAP` (20) pages of 1000 per venue chunk. Cost: still one request in the normal case.
  - F10: `PickEmPrizeTiebreakerCard.tsx` flash is `bg-ht-success-fg text-ht-pickem-on-fill` (existing tokens with dark and light values; no new token).
- Verified: `npx tsc --noEmit` clean; eslint on touched files clean; 42 pickem/prize test files pass (658 tests). No new test was added for F5/F6 — 7.6 may want one (a two-prize games-list case; a >1000-row recent read).
- Unverified: visual check of the Saved flash and of the blocked-game message on a phone.

# Phase 13 handoff — Game-themes rule wording (code review #10)

**For Andrew:** The project rule in `CLAUDE.md` (Feature rules, "Game themes" row) said every game needs one entry in
`GAME_TILE_THEMES` and one in `PROMO_THEMES`. That was wrong: `PROMO_THEMES` covers only the six games that have a
Share to social design (Live Trivia, Category Blitz, Pick 'Em, NFL Pick 'Em, Squares, Bracket). Speed Trivia, Bingo
and Fantasy have Venue Home tiles but no share design. The rule now says so. Doc-only; nothing is live or deployed.

**Changed:** `CLAUDE.md` line 126 (the "Game themes" row) now reads: every Venue Home game = one `GAME_TILE_THEMES`
entry; every Share to social game (`PromoGameId`) = one `PROMO_THEMES` entry; the rest of the rule is unchanged.
`docs/game-themes-plan.md` "Standing rules" was checked and already matches (it says "a new schedulable or prize
game"), so it was not edited. No promo themes were added for games without a template.

**Verified:** by reading. `PromoGameId` in `lib/promo/promoTemplates.ts:13` has the six games above; `PROMO_THEMES` in
`lib/promo/promoThemes.ts:14` is `Record<PromoGameId, PromoTheme>`. No code or test changed, so no test run was needed.

**Branch / commit:** `after-app-review`, uncommitted (same as Phases 8–12). No migration, no env var, no deploy.

**Next:** Phases 8–13 are done. Phase 7 (post later + weekly) is **on hold** (plan D32 and D35) until Andrew wants automatic
posting. It is not required. If he asks for it: first bring the Post now box back on the sheet as one option (D32), then
build Phase 7 (Opus 5.5, xhigh; cron and cost rules in the plan). Nothing else in the plan is left.

# Native app plan — Phase 9e handoff (venue Instagram handle + what a share shows) — 2026-10-22

## For Andrew (plain English)
- **What changed:** partners can now choose what a player's share picture shows about their bar: the **name**, the **address**
  and the **Instagram handle**, each on or off. If the handle is on, "@thepourhouse" is printed under the bar's name on the
  picture, it goes into the caption players copy (so an Instagram/Facebook/X post mentions the bar), and the share sheet says
  "Tag @thepourhouse in your post".
- **One setting per venue** (your answer). It applies to every game and every prize at that venue, including games and prizes
  we add later; a test fails if a new share path skips it.
- **Where partners set it:** an "On shared pictures" box on the Schedule sheet's review screen, on the Prize wizard's Confirm
  screen, and on the Game Settings page. You can also see and change it on the admin venue edit form. Changing it in any one
  place changes it everywhere.
- **Default:** name + address on, no handle, so nothing changes until a partner enters a handle or switches something off.
- **Live?** Database change APPLIED to production 2026-10-22 (Andrew's go-ahead; four columns, every venue kept the
  defaults). 9e code committed and pushed 2026-10-22 (Vercel deploy follows the push; not separately checked).
- **Needs you:** nothing for 9e itself (both asks — apply the database change, then commit + push — were done 2026-10-22).
  Its phone checks are in Phase 9f's device checklist.

## For the next agent

### 1. Next phase and scope
**Phase 9g** (Sonnet 5.5, medium): `/app` asks "Get the app?" on a phone (plan "Phase 9g"). Then **9f** (Opus review + Andrew's
phone pass), which includes 9e's checks: a venue with a handle and each show/hide choice, on each device. Out of scope here:
anything per-Prize or per-game (Andrew chose per venue), verifying a handle belongs to the partner (accepted as unverifiable).

### 2. Starting state
- Branch `main`; last commit `678e680` (9c + 9d), pushed. 9e is uncommitted (files in §4).
- Other people's uncommitted work is still in the tree (`.codex/`, `.firebaserc`, `.mcp.json`, `firebase.json`, POS docs,
  `lib/pos/providers.ts`, the POS hunk of `CLAUDE.md`, deleted `design-system/project/public/info/*.png`, the squares fixture,
  `docs/reel-video-assets-plan.md`). Stage only 9e files; for `CLAUDE.md` stage only the 9e hunk (`git diff -U3 CLAUDE.md`, keep
  the hunk that adds "What a share shows (Phase 9e" plus the "Next: 9g" line, `git apply --cached --recount`). `docs/native-app-store-plan.md`
  changes are all 9e.
- Migration `supabase/migrations/20261023011500_venue_share_details.sql` — **applied 2026-10-22** (`supabase db push`; checked
  afterwards: 16 venue rows, all `share_show_*` true, no handle). Before that, `supabase db push --dry-run`
  shows it as the only pending migration. (The CLI also prints "Skipping migration Warnings…": that's an old committed
  file `supabase/migrations/Warnings`, harmless; leave it.)
- No data changed, no backups needed.

### 3. Decisions (don't re-ask)
- Per venue (Andrew, 2026-10-22: "Let's go with Per-venue. If new games or prizes are added, they should have the same info as the others.").
- Mine: the panel **saves on its own** (its own Save button), not with the game/prize, because it's a venue setting. It sits
  inside the Schedule Review and the Prize Confirm as a summary row with "Change", not as an extra wizard step (no extra tap
  for partners who don't care). Also on Game Settings (menu hint now "Scoring & shared pictures", page subtitle "How games are
  scored and shared at your venue").
- Mine: handle shown under the name in the accent colour; caption order = headline, @handle, "Play on Hightop Challenge: <link>";
  nudge "Tag @handle in your post", else "Tag <name> in your post", else none. Name off also drops the subtitle's bar name.
- Handle stored as typed (case kept), without "@". Blank = cleared.

### 4. Files
New:
- `supabase/migrations/20261023011500_venue_share_details.sql` — `instagram_handle text null` + CHECK `^[A-Za-z0-9._]{1,30}$`,
  `share_show_name/_address/_instagram boolean not null default true`. No grant needed (columns on an existing table; `venues`
  has table-level grants).
- `lib/venueShareDetails.ts` (pure) — `VenueShareDetails`, `DEFAULT_VENUE_SHARE_DETAILS`, `parseInstagramHandle`,
  `shareDetailsSummary`, `SHARE_DETAILS_COPY` (all partner-facing words).
- `lib/venueShareDetailsStore.ts` (server-only) — `getVenueShareDetails`, `parseVenueShareDetailsInput` (every flag must be a
  real boolean), `setVenueShareDetails`, and the two routes' shared bodies `venueShareDetailsGetResponse/PatchResponse`
  (generic error text; DB detail only in `console.error` `[VenueShareDetails]`).
- `app/api/owner/venues/share-details/route.ts` — GET `?venueId=` / PATCH `{venueId, instagramHandle, showName, showAddress,
  showInstagram}`; `requireOwnerAuth` + `auth.venueIds.includes(venueId)` before anything.
- `app/api/admin/venues/share-details/route.ts` — same, `requireAdminAuth`, any venue.
- `components/owner/share/ShareDetailsPanel.tsx` — props `venueId`, `host: "owner"|"admin"`, `tone: "dark"|"light"`. Module cache
  per venue (one GET per venue per page visit; survives SlideSteps remounts), refreshed by a save.
- `tests/venue-share-details.test.ts` (handle table, all 8 combinations × game + prize × every design/size, every registry game,
  storage v2, contracts: only `StoryShareLauncher` calls `applyShareVenue`, only it hosts `StoryCaptureModal`, no screen sets
  `venueInstagram`, the panel's four hosts, admin wizard host has no `confirmExtra`), `tests/api.owner.venue-share-details.test.ts`.
Changed:
- `lib/socialShare/shareVenue.ts` — `ShareVenue` gains `instagram` + `show`; storage key `htc_share_venue_v2`; **`applyShareVenue`
  is THE one place the choice is applied** (replaces `withShareVenue`, which was in `useShareVenue.ts`).
- `components/social-share/StoryShareLauncher.tsx` — calls `applyShareVenue`. `useShareVenue.ts` — `withShareVenue` removed.
- `lib/socialShare/contracts.ts` — `StorySharePayload.venueInstagram`.
- `lib/socialShare/copyPresets.ts` — `shareInstagramMention`, `shareWinText(headline, instagram)`, `shareTagNudge(name, instagram)`.
- `lib/socialShare/storyPayloads.ts` — passes the handle into `shareWinText`. `StoryCaptureModal.tsx` — passes it to the nudge.
- `lib/socialShare/shareDesigns.ts` — `venuePanel` prints the handle line (one change covers all four designs).
- `lib/venues.ts` — `VENUE_SELECT_TIERS` (share columns → parsed address → legacy) via `selectVenueTiers`; a "column does not
  exist" error steps down a tier. `types/index.ts` — `Venue` gains the four optional fields.
- `components/rewards/CreateRewardWizard.tsx` — opt-in prop `confirmExtra` (rendered above the Create button). Admin host doesn't pass it.
- `components/owner/rewards/RewardsFlow.tsx`, `components/owner/schedule/ScheduleGameFlow.tsx`, `app/owner/game-settings/page.tsx`,
  `components/admin/sections/VenuesSection.tsx`, `components/owner/menu/ownerMenuItems.ts` (hint) — host the panel.
- `scripts/render-share-cards.cjs` — cases `handle-all`, `handle-only`, `nothing-shown`.
- Tests adjusted: `tests/components.owner-schedule-flow.test.ts` (ignores the panel's GET when counting schedule calls),
  `tests/share-designs.test.ts` (handle cases in `everySpec`).
- `docs/native-app-store-plan.md` (status, 9e status, §6 item 7 answered), `CLAUDE.md` (9e bullet).

### 5. Facts and traps
- Deploy order: **db push before the code deploy** is cleanest. The player read is skew-safe (steps down a tier), but the
  partner/admin panel's route selects the new columns and returns "Couldn't load this setting." until they exist.
- `withOwnerVenue` (`lib/ownerHistoryRoute.ts`) is read-only and its errors say "game results" — that's why the new route does its
  own `requireOwnerAuth` + venue check (same pattern as `/api/owner/game-settings`).
- Before the venue is known (deep link, fetch pending/failed), `applyShareVenue(payload, null)` keeps the screen's own name and
  never a handle = the defaults. Once the venue loads the sheet re-renders with the real choice.
- The join list's sessionStorage cache (`tp_venues_cache_v1`, 5-min TTL) may hold rows without the new fields for ≤5 minutes;
  `toShareVenue` treats missing fields as the defaults.
- Caption presets with `[Venue Name]` fall back to "Hightop" when the name is hidden (existing behaviour for no venue).
- Headless/vitest: the new test file needs `// @vitest-environment jsdom` (localStorage); the default env is node.

### 6. Build / test / verified
- `npx tsc --noEmit` clean; `npm run lint` clean; `npx vitest run` 437 files / 5,388 pass / 13 skipped; `npm run build` OK
  (both routes listed); `npm run share-card:render -- --sheet` all QRs decode, and I looked at the handle cases (Story + Post,
  card/spotlight/night): handle line under the name, panel fits, "handle only" and "nothing shown" lay out cleanly.
- `supabase db push --dry-run` → only `20261023011500_venue_share_details.sql`.
- **Not verified:** the panel in a real browser (Partner Dashboard needs an owner session against the shared production DB, and
  the columns don't exist until the migration is applied); a real phone; what each app keeps from the caption. All in 9f.
- `/verify` for the 9c/9d commit: not run in a browser (needs per-game signed-in win data on the shared production DB); 9d's sheet
  had been checked in a Playwright harness and on both simulators (9d handoff §6).

### 7. Open questions for Andrew
Both answered 2026-10-22: migration applied, then 9e committed + pushed. None open.

### 8. First steps for 9g
Read plan "Phase 9g" and `lib/appDownloadLink.ts` (`decideAppLinkDestination`) + `app/app/route.ts`. Add the "ask" outcome; the store
URLs are still empty constants, so the page only appears once Phase 6/7 fill them. Sonnet 5.5, medium.

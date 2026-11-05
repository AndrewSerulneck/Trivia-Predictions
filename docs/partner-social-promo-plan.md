# Share to social — partner posts and Reels that advertise games and prizes

**Status (2026-11-04):** **Phases 1–5 built** (Post + Story pictures, Reels with sound, the Share to social
sheet, the dashboard entry, the "Share to social →" link after a new game or prize, Meta's deauthorize /
data-deletion callbacks + privacy text, and **Instagram "Post now"** behind `NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED`;
uncommitted, not deployed, migration `20261104193338_social_publishing.sql` **applied 2026-11-04** with Andrew's OK).
Phase 5 needs Andrew before it can be tried: the Facebook Login for Business configuration + redirect URIs
(runbook §"Phase 5 setup"), applying the migration, and the flag on a Preview. Handoff:
`docs/partner-social-promo-plan_PHASE_5_HANDOFF.md` (earlier: `…_PHASE_4_HANDOFF.md` … `…_PHASE_0_HANDOFF.md`).
**2026-11-04 (D32–D33):** the Instagram "Post now" box was taken off the sheet (code kept, switched off) and the
"On shared pictures" panel became per-post "On the picture" ticks.
**2026-11-04 (D35): Phase 6 built, kept hidden** — Facebook Page "Post now" (Posts + Reels) on the server and in the
hidden Post now box (`SocialPostNowPanel.tsx`, not rendered on the sheet). Uncommitted, not deployed, no migration.
Handoff: `docs/partner-social-promo-plan_PHASE_6_HANDOFF.md`. **Phase 7 on hold** until Andrew wants automatic posting.
**2026-11-04: Phases 8–13 planned** from the `/code-review` of the uncommitted Phase 5–6 + themes work (§5.2–§5.7).
**Phase 8 done (2026-11-04, sealed):** every `/api/owner/social/**` route answers 404 until `SOCIAL_POST_NOW_ON_SHEET`
(`lib/social/flags.ts`) is turned on together with the Post now box. Uncommitted. Handoff:
`docs/partner-social-promo-plan_PHASE_8_HANDOFF.md`. 8–11 must be done before Post now is turned on for partners.
**Phase 9 done (2026-11-04):** publishing can't write over a post it no longer owns (fenced claims, renewed leases,
`maxDuration = 90` on the three claiming routes, 150 s lease), and a Meta call whose answer was lost never reads as
"failed" (`isUnsure`, new `unconfirmed` code, Facebook Reel finish sent at most once). Uncommitted, no migration.
Handoff: `docs/partner-social-promo-plan_PHASE_9_HANDOFF.md`.
**Phase 10 done (2026-11-04):** the connect callback names a provider the partner switched off
(`instagram_declined` / `facebook_declined`) instead of "link Instagram to a Page", marks that venue's earlier
active row from the same Facebook user "Reconnect", and saves both rows in one all-or-nothing upsert. Uncommitted,
no migration. Handoff: `docs/partner-social-promo-plan_PHASE_10_HANDOFF.md`.
**Phase 11 done (2026-11-04):** one connection store for both providers (`loadConnection` / `connectionToken` /
`chooseConnection` / `disconnectConnection`, one `SocialConnection` type, one per-provider `PROVIDERS` spec) and one
shared first step for a poll (`advanceCommon`). Refactor only; the one intended change is that a stored Instagram
choice now needs Meta's numeric id, like Facebook's. Uncommitted, no migration. Handoff:
`docs/partner-social-promo-plan_PHASE_11_HANDOFF.md`. **Phase 12 done (2026-11-04):** the share sheet says when the address/handle can't load and offers Try again; the
client helpers moved to `lib/venueShareDetailsClient.ts` (`fetchVenueShareDetails` / `patchVenueShareDetails`).
Uncommitted, no migration. Handoff: `docs/partner-social-promo-plan_PHASE_12_HANDOFF.md`. **Phase 13 done (2026-11-04):** the "Game themes" rule in `CLAUDE.md` now matches the code (Venue Home tiles for every game; share designs only for `PromoGameId`). Doc-only. Handoff: `docs/partner-social-promo-plan_PHASE_13_HANDOFF.md`.
**2026-11-04: Phases 14–18 planned** from the second `/code-review` (§5.8–§5.12; the findings table above §5.8):
14 Instagram `media_publish` at most once, 15 connect callback (no Page / stale rows), 16 Post now panel ready to
come back, 17 share sheet shows only a saved handle, 18 clean-ups. Finding #2 is not a bug (D36). **14–16 block
turning Post now on**; 17 is the only one partners would see. None needs a migration or env change.
**Phase 14 done (2026-11-04):** Instagram `media_publish` now goes out at most once per post (a mark set just before
the call; a marked post is never published again and ends "Not confirmed" if Meta never confirms it), and the same
race on the Facebook Reel finish is closed. Uncommitted, no migration. Handoff:
`docs/partner-social-promo-plan_PHASE_14_HANDOFF.md`.
**Phase 16 done (2026-11-04):** the Post now panel is ready to come back with one switch. It reads its own connect result, owns its Caption box (D38, default yes), and `choose()` / `disconnect()` show an error instead of failing silently. Handoff: `docs/partner-social-promo-plan_PHASE_16_HANDOFF.md`. Next: 17.
**Phase 17 done (2026-11-04):** only a saved Instagram handle goes on the picture or Reel; the starting ticks are pinned (D36). Handoff: `docs/partner-social-promo-plan_PHASE_17_HANDOFF.md`. 
**Phase 18 done (2026-11-04):** clean-ups, no behaviour change: one `social_posts` read per Post now, the four choose/disconnect routes are one line each over `lib/social/socialProviderRoutes.ts`, and provider names come from `SOCIAL_POST_COPY.providers`. Phases 14–18 are all done. Handoff: `docs/partner-social-promo-plan_PHASE_18_HANDOFF.md`. Next: `/code-review high` of the whole uncommitted social work, then Andrew decides on committing.
**2026-11-05: Phases 19–21 planned** from the third `/code-review` (Phases 14–16 + 18; §5.13–§5.15, findings table
above §5.13): 19 nothing that may be live is hidden or posted twice, 20 the right message, 21 clean-ups. **19 blocks
turning Post now on**; 20 should be done before it too (partner-facing wording); 21 any time. Finding #7 (a
dedicated `publish_sent_at` column) needs a migration and is open question D39 (§10), not a phase.
**Phase 19 done (2026-11-05):** Disconnect and Meta's deauthorize end a post that may be live as "Not confirmed"
instead of cancelling it; a publish that fails after the claim answers `unsure` and the panel polls the post instead of
saying "try again"; the sheet's Post now mount goes through the tested `postNowProps`. Uncommitted, no migration.
Handoff: `docs/partner-social-promo-plan_PHASE_19_HANDOFF.md`.
**Phase 20 done (2026-11-05):** a decline plus "nothing linked" now names the decline (two new results), Instagram's hashtag / @
limits no longer block Facebook, and the connect notice leaves the URL once read. Uncommitted, no migration.
Handoff: `docs/partner-social-promo-plan_PHASE_20_HANDOFF.md`.
**Phase 21 done (2026-11-05):** clean-ups, no behaviour change: choose answers `{ ok: true }` without an extra read, one
shared `META_ID`, the panel's recent list uses `SOCIAL_RECENT_POSTS`, the dead venue check is gone, and the status GET
counts today's posts alongside the connection reads. Uncommitted, no migration. Third-review phases 19–21 all done.
Handoff: `docs/partner-social-promo-plan_PHASE_21_HANDOFF.md`.

**Phase 15 done (2026-11-04):** Instagram connected with no Facebook Page to post to now reads `facebook_no_page`
("Instagram is connected. We didn't find a Facebook Page you can post to…") instead of "Connected.", and a provider
granted but with nothing linked now also marks that venue's old active row from the same Facebook user "Reconnect"
(`markGoneReconnectNeeded`, reason `no account at reconnect`). Uncommitted, no migration. Handoff:
`docs/partner-social-promo-plan_PHASE_15_HANDOFF.md`.
**2026-11-04:** the designs are redone in per-game themes (Andrew: make them fun and relevant to each game) —
`docs/game-themes-plan.md`: Phases 1–3 built (Venue Home buttons, Post + Story pictures, per-game Reel motion).
Decisions D1–D38 (§2). Branch: `after-app-review`. Notes asking for a design for every new game/prize are
already in `CLAUDE.md` (Feature rules), `AGENTS.md` (Adding a new Reward definition, step 5), `lib/ownerSchedule.ts`,
`lib/rewardDefinitions.ts` and `types/index.ts` (`RewardPrizeKind`).

## 1. Summary for Andrew

Partners get a **"Share to social"** tool on the Partner Dashboard. They pick a game, and get a ready-made design
**we** made (post, Story or Reel). If the game has a prize, the prize is shown on the same post ("Live Trivia ·
Thursdays 8 PM · Win a $50 gift card"), and the partner can untick it. For a Reel they also pick a soundtrack, and our sound effects (applause,
crowd cheering) come built into the design. Then they check the suggested caption and choose one of:

- **Share / Download.** Works on day one for every account. On a phone, Share opens Instagram with the file attached.
- **Post now** to their Instagram and Facebook Page. Needs Meta to approve our app (§7).
- **Post later, automatically.** For example, "the day before the game", or every week before a weekly game (§4.6).

Right after a partner **schedules a game** or **creates a prize**, the last screen offers **Share to social** with that
game or prize already filled in.

Reels are made in the partner's browser, so our servers do no video work. Music and sound effects come from **free
libraries** (§6). The risk with free music is that Instagram sometimes wrongly claims a track and mutes the Reel.
§6 explains how we keep that rare.

## 2. Decisions already made

| # | Decision (Andrew, 2026-11-03) |
|---|---|
| D1 | Build a Partner Dashboard tool that makes posts, Stories and Reels advertising (1) games and (2) prizes. |
| D2 | Post directly to **Instagram and Facebook Pages**. |
| D3 | Reels can have sound. **Pre-selected soundtracks** that partners choose from, **plus sound effects** (crowd cheering, referee whistle, etc.). |
| D4 | **Hightop designs the content.** Partners choose; they don't design from scratch. |
| D5 | At the end of **scheduling a new game** and **creating a new prize**, offer Share to social for it. Not after edits (recommended; Andrew didn't object). |
| D6 | Posts and Reels are made in the browser (canvas + WebCodecs). No server-side video, because that would be a recurring cost. |
| D7 | **Free libraries** for music and sound effects (§6). |
| D8 | ~~One per game + one per prize type~~ → **superseded by D13.** |
| D9 | On-screen name: **"Share to social"**. |
| D10 | **Scheduled posting: yes**, if it can be seamless and easy (§4.6). |
| D11 | Available to **every partner** for now (no plan gating). |
| D12 | Whenever a new game becomes schedulable or a new prize challenge can be offered, a design must be made for it too. Notes are in place now. A coverage contract test (§9) enforces it from Phase 1. |
| D13 | **One design per game/challenge:** Live Trivia, Category Blitz, Pick 'Em, NFL Pick 'Em, Super Bowl Squares, March Madness Bracket. There are **no separate prize designs.** If a prize is attached to that game, the partner can **show the prize on the same post/Reel** (e.g. "Live Trivia · Thursdays 8 PM · Win a $50 gift card"). The prize is optional and shown by default when one exists (§4.1). |
| D14 | Category Blitz gets a design. |
| D15 | The 15-minute cron for Post later is approved for Phase 7 (`vercel.json`). |
| D16 | Phase 0 spike approved (2026-11-03). |
| D17 | The Reel ends on a held **end card** showing the game and the prize (with when, venue and QR). It doubles as the cover and the Post/Story picture (§4.1). |
| D19 | **No QR code** on promos: viewers are already on their phones. Use the "Play on Hightop Challenge" pill. |
| D20 | **Phase 0 passed; Andrew approved the Reel** (Mac Chrome + iPhone Claude app; Instagram played the sound on both). Browser rendering (D6) is a go. |
| D21 | **No whistle.** The Reel opens with applause (the applause file from 0.95 s, 3 s, gain 0.75). The music plays at full level throughout, with no dip under the prize cheer, and fades only at the very end. Test page version 5. |
| D22 | Phase 1 sheet is **one screen** (no steps) because each game has one design; it uses the dashboard's loaded lists, so it adds no server reads. Claude's call while building (2026-11-03), within "minimal and simple"; Andrew can ask for steps instead. |
| D26 | **Phase 3 prompt = the confirmation toast's action** ("Share to social →") instead of a final sheet screen; focus is a prop from dashboard state, not URL params. Claude's call (2026-11-03); Andrew can ask for a real final screen. |
| D27 | **Partner social tools use their own, new Meta app** ("Hightop Challenge for Venues"), separate from the player app (App ID in `capacitor.config.json`, Story sharing). Andrew's decision, 2026-11-04 (offered the choice to reuse). Separate review, permissions, secret and env var (`META_PARTNER_APP_SECRET`); never reuse the player app's ID or secret in partner code. |
| D28 | **Partners log in with Facebook Login for Business, User access token configuration** (Andrew, 2026-11-04; Meta no longer offers Instagram Login to new apps). We keep only the linked Page's token (does not expire), encrypted; the user token is dropped, except for at most an hour while a partner with several Instagram accounts picks one. Meta's default system-user preset is never used. |
| D29 | **One login asks for Instagram and the Page together** (Andrew, 2026-11-04): `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, so Phase 6 needs no reconnect. |
| D30 | `SOCIAL_TOKEN_KEY` was generated by Claude and added to `.env.local` and Vercel **Preview** only, never printed (Andrew, 2026-11-04). Production waits for the App Store review. |
| D31 | **The Phase 5 migration was applied 2026-11-04** with Andrew's explicit go-ahead during the App Store review (additive only: two new tables + a private bucket). |
| D32 | **The Instagram "Post now" box is off the Share to social sheet** (Andrew, 2026-11-04: on a phone, Share already opens Instagram, and the box cluttered the sheet). Its code (`InstagramPostPanel.tsx`, `lib/social/*`, the routes, the applied migration) stays, switched off. Phases 6–7 are **on hold**: if automatic posting ("the day before", "every week") is wanted later, the connection comes back as one small option on the sheet, not a box. |
| D33 | **"On the picture" ticks replace the "On shared pictures" panel in this sheet** (Andrew, 2026-11-04). One list under Game: the game's prizes, the bar name and the Instagram handle, each ticked on or off **for this post only**. They never change the venue's "On shared pictures" setting (that one is for players' share pictures; it stays in Schedule, Prizes and Game Settings). Defaults: name on; handle on when one is saved. With no handle saved, ticking "Instagram handle" shows a box + **Save**, which saves only the handle (the players' on/off choices are sent back unchanged). The address isn't offered (promos never showed it). |
| D34 | **More picture options, no caption** (Andrew, 2026-11-04). Each tick is labelled (Prize / Bar name / Address / Instagram handle, with the value under it). **Address** is offered (unticked by default) when the venue has one; it is read-only, from the venue's street/city, sent with the share-details GET (`details.address`, formatted by `formatVenueAddressLine` in `lib/venueShareDetails.ts`). Every picture and Reel has a small, faint **"Follow @thehightopchallenge"** in the bottom-right of the safe zone (`PROMO_FOLLOW_LINE`, `promoEndCard.ts`; the stack reserves 64 px for it), so the bar stays the star. **The Caption box and Copy caption are gone**: partners write their own caption in Instagram after Share / Download; nothing is copied to the clipboard. `lib/promo/promoCaptions.ts` stays (unused by the sheet). |
| D35 | **Phase 6 is built but kept hidden** (Andrew, 2026-11-04, asked where the Facebook option goes): the Facebook Page connection and posting are added to the hidden Post now box next to Instagram; the Share to social sheet stays as it is (D32). One login connects both (D29). Facebook takes **Post and Reel only**, no Story. Status read is one `GET /api/owner/social/status` for both. |
| D36 | **The share sheet's ticks don't start from the venue's players' "On shared pictures" setting** (second review #2). That is D33 as decided: the ticks are this post only, and start as name on, handle on when saved. Phase 17 only pins it with a comment and a test. Claude's call (2026-11-04), from D33. |
| D37 | **A login where one provider needs a choice still reads `choose_account`**, even when the other was declined or has no account (second review #4, second half). The redirect carries one result, picking is the next step, and the status row under the picker shows the other provider as Not connected. Claude's call (2026-11-04). |
| D38 | **When Post now comes back, its Caption box lives inside the Post now panel** (Post and Reel only), pre-filled from `promoCaption` (`lib/promo/promoCaptions.ts`). The sheet itself stays caption-free (D34). Claude's recommendation (2026-11-04); **Andrew can change it** (§10). |
| D18 | Crowd sound = Andrew's two Pixabay files layered (stadium crowd + applause/cheer), as in the test page (`data/promo-sounds/originals/SOURCES.md`). |
| D23 | **Music at launch = the approved "Game-night beat"** (the Phase 0 test tune, made in code) plus "No music". Code-made sounds get the licence `hightop-original` (nothing anyone else can claim, so no Content ID test). The §6 starter set of library tracks waits for Andrew to pick them by ear; each one is a file + one registry entry. Claude's call while building Phase 2 (2026-11-03). |
| D24 | **One sound design for every game** (`reelSfxCues` in `lib/promo/promoReel.ts`), not per-design `sfxCues`/`defaultMusicId` fields. A design gets its own only if Andrew wants one. Claude's call (2026-11-03). |
| D25 | **The Reel's held end card is still and exact.** The title and prize card glide into their end-card places, the other rows fade in, the moving glow and light bars settle, and from 0.6 s after the end card starts every frame is the Post/Story picture itself. The brand line sits at the top during the beats (it overlapped the title otherwise). Claude's call (2026-11-03), from D17. |

## 3. What already exists (reuse, don't rebuild)

- `lib/socialShare/shareDesigns.ts`: designs as `StoryRenderSpec` at 1080×1920 (`story`) and 1080×1350 (`post`),
  with Instagram safe zones and `STORY_TEXT_FLOOR_PX` already applied. `lib/socialShare/storyCanvas.ts` is the one
  renderer. `lib/socialShare/shareVenue.ts` `applyShareVenue` adds the venue's name, address and @handle.
- `lib/venueShareDetails.ts` + `ShareDetailsPanel`: the venue's Instagram handle and on/off choices.
- `lib/socialShare/copyPresets.ts` (copy) and `sharePipeline.ts` (Web Share → download fallback).
- `lib/pos/crypto.ts`: the pattern for encrypting OAuth tokens (AES-256-GCM, AAD-bound). Copy the pattern, not the key.
- **Games.** Schedulable today: `SUPPORTED_OWNER_SCHEDULE_GAME_TYPES` in `lib/ownerSchedule.ts` =
  `category_blitz`, `live_trivia`. Pick 'Em / NFL Pick 'Em aren't "scheduled". They run on the football calendar
  (`docs/pickem-college-football-and-prize-plan.md`).
- **Prizes.** Definitions (what you do to win) are `REWARD_DEFINITIONS` in `lib/rewardDefinitions.ts`:
  `live_trivia_challenge`, `nfl_pickem_challenge`, Pick 'Em (`PICKEM_PRIZE_DEFINITION_ID`), Squares, Bracket.
  Prize **kinds** (what you win) are in `types/index.ts`: `RewardPrizeKind` = `menu_item | gift_card`, and
  `RewardMenuItem` = `whole_order | appetizer | entree | dessert | wine_bottle | other`.
- Schedule flow: `components/owner/schedule/ScheduleGameFlow.tsx` (`save()`, ~line 198). `POST /api/owner/schedule`
  returns `{ ok, schedule }`.
- Prize flow: `components/owner/rewards/RewardsFlow.tsx` hosts `components/rewards/CreateRewardWizard.tsx`
  (`onCreated`, ~line 216). `POST /api/owner/rewards` returns `{ ok, reward }`.
- Owner sheets: `?sheet=&step=` via `lib/ownerSheetParams.ts` (`OWNER_SHEET_IDS`), `components/owner/sheet/*`.

## 4. Design

### 4.1 Launch designs: one per game, with an optional prize panel (D13)

| Design | The game part says | The game data comes from | The prizes that can be shown come from |
|---|---|---|---|
| Live Trivia | "Live Trivia · Thursday 8 PM" or "Every Thursday 8 PM" | `OwnerSchedule` (`live_trivia`) | `live_trivia_challenge` prizes (if pinned to a game slot, only that game's) |
| Category Blitz | "Category Blitz · …" (scheduled time, or "Play any time" if continuous) | `OwnerSchedule` (`category_blitz`) | None today. The panel shows automatically if a Category Blitz challenge is ever added |
| Pick 'Em | "Pick 'Em · Make your picks every week" | Pick 'Em availability (see §11) | Pick 'Em prizes (`PICKEM_PRIZE_DEFINITION_ID`) |
| NFL Pick 'Em | "NFL Pick 'Em · …" | Same | `nfl_pickem_challenge` prizes |
| Super Bowl Squares | "Super Bowl Squares · Claim your square" | Squares season (`docs/squares-and-brackets-plan.md`) | Squares prizes |
| March Madness Bracket | "Fill out your bracket" | Bracket season | Bracket prizes |

**The prize panel** is one shared building block that every design places in its own spot:

- It shows the **prize** and **how to win**, e.g. "**Win a $50 gift card** · Most points wins". The prize line uses
  the same face text as the player's gift card (`lib/prizeCardFace.ts`). The how-to-win line uses the definition's
  copy (`lib/rewardDefinitions.ts` / `lib/rewardDescription.ts`). We never write separate wording, so a new prize
  kind or menu item needs no design work here.
- **One to three prizes.** If the game has several active prizes (e.g. weekly 1st / 2nd / 3rd), the panel lists up
  to 3 and adds "+ more prizes" beyond that.
- **No prize:** the panel is left out and the design re-flows. On a Reel the "prize reveal" beat is skipped and the
  Reel is 10 s instead of 15 s.
- The partner sees a **"Show prize"** checklist of that game's active prizes, all ticked by default. They can untick any.

Each design comes in all three formats: Post (1080×1350 JPEG), Story (1080×1920 JPEG) and Reel (1080×1920 MP4).
**Reel beats:** game title + **applause** (no whistle, D21) → when/where → *prize reveal* + cheer/"ka-ching" (only with a prize) →
**end card**.

**End card (Andrew, 2026-11-03, D17, D19):** the Reel's last ~3 s hold one still frame that carries everything:
game name, when, the prize panel (prize + how to win), venue name + @handle, and a "Play on Hightop Challenge" pill
(`SHARE_PLAY_LINE`). **No QR code:** viewers are already on their phones and can't scan it.
**Nothing fades out at the end.** The end card is also:
- the Reel's **cover**: send Instagram's `thumb_offset` = the end card's time in ms when publishing,
- the **Post and Story** picture (same layout at 1080×1350 / 1080×1920).

So one layout per design serves all three formats. **Approved reference: the Phase 0 test page, version 4**
(https://claude.ai/artifact/Mex9BDgSGEaircnafoqCmz; `docs/partner-social-promo-plan_PHASE_0_HANDOFF.md`). Layout
in 1080×1920 with a prize: brand 300, title ~540 (two lines), when 700, prize card ~771–1109, venue 1180 + handle
1238, call-to-action pill 1350. Without a prize: when 760 (larger), venue 960/1018, pill 1140. All inside the
Story safe zone (250–1580). The same design rule applies to the player share pictures only if Andrew asks; they
keep their QR today.

### 4.2 Registries (one entry per thing)

- **`lib/promo/promoTemplates.ts`**: per design: `id`, `game` (the `PromoGame` it advertises), where its prize panel
  sits in each format, a spec builder (reusing `StoryRenderSpec` blocks), a Reel **timeline**
  (keyframes per block), **`sfxCues`** (`{ soundId, atMs, gain }`, e.g. applause at 0 ms, cheer at the prize reveal),
  `defaultMusicId`, `captionPresetIds`.
- **`lib/promo/promoSounds.ts`**: per sound: `id`, `kind: "music" | "sfx"`, display `name`, `mood`, `file`
  (`/promo/sounds/<id>-v1.m4a`, immutable cache, so new audio = new file name), `durationMs`, and a **required
  `license` record** (`source`, `licence` = one of the allowed licences in §6, `sourceUrl`, `downloadedOn`,
  `contentIdChecked` date). Music is trimmed to 15 s with the fade baked in. Sound effects are short clips.
- **`lib/promo/promoCaptions.ts`**: caption presets with slots `{game}`, `{when}`, `{prize}`, `{howToWin}`, `{venue}`,
  `{handle}`, plus hashtags. Never "Reward" on screen.
- **`lib/promo/promoSubjects.ts`** (as built): `promoOptions` + `scheduleWhen`. Pure, over the dashboard's
  already-loaded schedules and prizes.
- **`lib/promo/promoPrizes.ts`** (as built): `prizesForGame(campaigns, game, scheduleId)` (pure; matched by the
  definition's `gameType`, and the game slot when a prize is pinned) and `promoPrizeOf`.
- **`lib/promo/promoEndCard.ts`** (as built): the end-card spec, with the prize panel inside it (1 prize big,
  2–3 listed, "+ N more prizes"). `buildPromoEndCardLayout` also returns each row (`brand`, `title`, `when`,
  `prize`, `venue`, `cta`) so the Reel can move them.
- **As built in Phase 2:** `lib/promo/promoSounds.ts` (registry, D23), `lib/promo/promoSynth.ts` (code-made sounds),
  `lib/promo/promoReel.ts` (pure timeline + sound cues, D24), `lib/promo/promoReelRender.ts` (browser: frames, mix,
  preview, MP4), `lib/promo/promoReelSupport.ts` (the cheap "can this browser make video" check). Sound files are
  trimmed when converted (`scripts/convert-promo-sound.py`), not at mix time.

### 4.3 Rendering (browser)

- **Image:** `storyCanvas` → **JPEG** (Instagram's API takes JPEG only for images).
- **Reel video:** frames drawn from the timeline on an `OffscreenCanvas` → `VideoEncoder` (`avc1`, 30 fps) → MP4 via
  **Mediabunny** (MPL-2.0; pin an exact version at least 2 weeks old).
- **Reel audio (music + sound effects mixed):** Web Audio `OfflineAudioContext` lays the chosen music and the
  design's `sfxCues` on one 15 s track (sound effects slightly ducked over music) → PCM → `AudioEncoder` (AAC,
  `mp4a.40.2`) → into the same MP4.
  **Fallback** if a browser lacks AAC `AudioEncoder` (Phase 0 checks iOS Safari): a dev-machine script
  `npm run promo:sounds` pre-mixes every design × music track with ffmpeg into `/promo/mixes/…-v1.m4a`. The browser
  then copies those AAC packets in with no encoding. About 10 designs × 6 tracks × ~250 KB ≈ 15 MB of static files.
- No `VideoEncoder` → hide Reel and offer Post / Story. Never produce WebM.
- The preview plays live on a canvas with Web Audio. Rendering happens only on Create, with a progress bar.

### 4.4 The Share to social sheet (`?sheet=social`)

**As built in Phase 1 (D22): ONE screen, not steps.** With one design per game there is nothing to choose
between, so the sheet shows, top to bottom: Game (list), **On the picture** (labelled ticks for the game's prizes, the bar
name, the address and the Instagram handle, this post only, D33/D34), Size (Post / Story), Preview (live),
Share / Download (no caption box, D34). (The "On shared pictures" panel and the Instagram box were removed, D32–D33.) It reads **no data of its own**: the dashboard's
already-loaded games and prizes, and ShareDetailsPanel's cached GET. **Phase 2 (as built):** "Reel" in Size (only
when the browser can encode H.264), a Music picker, the Story picture as the still preview with "Play preview"
(live canvas + sound), then "Make Reel" with a progress bar, then Share / Download of the MP4. Files: `components/owner/social/ShareToSocialSheet.tsx`, `ShareToSocialEntry.tsx`,
`lib/promo/*`. The original step-by-step design is kept below for reference.

Original steps: **What** (which game; for a scheduled game, which date or series; skipped when it comes pre-filled) →
**Prize** (the "Show prize" checklist; skipped when the game has no active prizes) → **Format** (Post / Story /
Reel) → **Look** (the design, with a live preview) → **Sound** (Reels: pick a track or "No music"; the design's sound effects stay;
tap to preview) → **Caption** (preset, editable) → **Share** (§4.6: Share / Download + Copy caption / Post now /
Post later).

- `OwnerSheet` + `SlideSteps` + `WizardFooter`. Steps move with `nav.goToStep`, **never `router.push`**. One `ExitBackButton`.
- Pre-fill: `?sheet=social&scheduleId=<id>`, `&rewardId=<id>` (→ that prize's game, prize ticked) or `&game=<id>`. Add `social` to `OWNER_SHEET_IDS`.
- Dashboard entry: a "Share to social" button (placement per the design system: one accent, minimal).
- `ht-light-surface`, Tailwind tokens, no text under 12px, website only (`/owner` never opens in the native app).
- There's one design per subject at launch, so **Look** shows a single design. Keep the step anyway (it previews
  the chosen format) so a second design can be added later without redesigning the flow.

### 4.5 "Share to social" at the end of creating (D5)

- `ScheduleGameFlow.save()`: for a **new** game, show a final screen before closing: "Live Trivia scheduled ·
  Thu 8 PM" with **Share to social** (→ `?sheet=social&scheduleId=…`) and **Done**. Any prizes already attached to
  that game are pre-ticked.
- `RewardsFlow` `onCreated`: same, with `rewardId`. The sheet opens on **that prize's game**, with the prize ticked.
  If the prize is pinned to a scheduled game, that game is pre-filled too. The result is the combined post (game +
  prize) by default. The end screen belongs to the **owner host**, not to `CreateRewardWizard`, so admin is
  untouched and the wizard isn't forked.
- **Order doesn't matter:** game first then prize, or prize first then game. Both end screens produce the combined
  post, because the prize list is read fresh each time the sheet opens.
- A game type with no design (none at launch, but possible later) shows plain **Done** only.
- Switching sheets reuses the existing "close without asking → open the other sheet" pattern (`onRequestSchedule`).

### 4.6 Posting: now, later, and every week (D2, D10)

Seamless means: one tap after connecting once, a sensible default time already picked, and the partner is told
when something goes wrong.

- **Connect once:** a "Connect Instagram" and "Connect Facebook Page" row in the Share step (and in Account).
  After connecting, the Share step shows **Post now** and **Post later** with the connected account names.
- **Post later default:** for a dated game, "**The day before, 5 PM**" (venue timezone), editable. For a prize,
  "**Tomorrow, 11 AM**". A **weekly** Live Trivia game also offers "**Every week, the day before**". It reuses the
  same file, because the design reads "Every Thursday 8 PM".
- **Calendar:** scheduled posts appear in a "Scheduled posts" list in the sheet, where the partner can cancel any.
  Cancelling the game cancels its scheduled posts (hook in the schedule DELETE route).
- **Failure:** a failed post is marked on the dashboard and the partner gets one email (existing email lib).
  "Reconnect Instagram" if a token expired.
- **Two connections, one Meta app:**

> **Decided in Phase 5 (D28, D29), supersedes the Instagram column below:** new Meta apps can't use Instagram
> Login, so partners log in through **Facebook Login for Business** with a **User access token** configuration
> (`config_id`, never Meta's system-user preset). Permissions: `instagram_basic`, `instagram_content_publish`,
> `pages_show_list`, `pages_read_engagement` (+ `pages_manage_posts` for Phase 6). Calls go to
> `graph.facebook.com` with the linked **Page token**. **Confirmed in Meta's docs (2026-11-04): the Instagram
> professional account must be linked to a Facebook Page**; the sheet says so. Instagram tokens therefore don't
> expire, and the "refresh tokens older than 7 days" step below is not needed.
>
> **As built (Phase 5):** routes are `GET /api/owner/social/meta/connect` → Meta → `GET /api/owner/social/meta/callback`;
> `GET`/`DELETE /api/owner/social/instagram` (status + recent posts / disconnect); `POST …/instagram/choose`;
> `POST /api/owner/social/posts` (row + signed upload URL) → browser `PUT`s the file to the private bucket →
> `POST /api/owner/social/posts/[id]/publish` → (Reels) `GET /api/owner/social/posts/[id]` every **10 s for at most
> 5 minutes** (Meta asks for no more than once a minute for 5 minutes; 10 s is a compromise, ≤30 checks). At most
> **10 Post now posts per venue per 24 h** (Instagram allows 50). Details: the Phase 5 handoff.

| | Instagram | Facebook Page |
|---|---|---|
| Login | Instagram API **with Instagram Login** (no Page needed) | Facebook Login for Business |
| Permissions | `instagram_business_basic`, `instagram_business_content_publish` | `pages_show_list`, `pages_manage_posts`, `pages_read_engagement` |
| Account must be | Instagram **Business or Creator** (not personal; the sheet explains how to switch, it's free) | A Page the partner admins |
| Token life | 60 days, refreshable once ≥24 h old | Page token from a long-lived user token does not expire |
| Image | `POST /{ig-user}/media` `image_url` → `media_publish` | `POST /{page}/photos` `url` |
| Reel | `media_type=REELS`, `video_url` → wait for `status_code=FINISHED` → `media_publish` | `/{page}/video_reels` (start → upload → finish) |
| Story | `media_type=STORIES` | Later, optional |

Verify every endpoint and scope against Meta's current docs at build time.

- **Tables** (new migration; grant `service_role` only, since the browser never reads tokens):
  - `social_connections`: `venue_id`, `provider ('instagram'|'facebook')`, `external_account_id`, `display_name`,
    `access_token_enc`, `token_expires_at`, `status ('active'|'reconnect_needed')`. Unique (venue, provider).
  - `social_posts`: `venue_id`, `subject_type ('schedule'|'reward'|'pickem')`, `subject_id`, `template_id`,
    `music_id`, `format`, `caption`, `provider`, `media_path`,
    `status ('scheduled'|'uploading'|'processing'|'published'|'failed'|'cancelled')`, `scheduled_for`,
    `repeat ('none'|'weekly')`, `container_id`, `external_post_id`, `permalink`, `error`, `created_by`, timestamps.
    Index on `(status, scheduled_for)`. No player data, ever.
- **`lib/social/crypto.ts`**: its own key `SOCIAL_TOKEN_KEY`, same envelope + AAD binding as `lib/pos/crypto.ts`.
  It's the only reader of that key.
- **Media:** the browser uploads the file to a **private** Supabase Storage bucket `social-media` with a signed
  upload URL (this avoids Vercel's 4.5 MB body limit). Meta gets a 1-hour signed read URL. One-off posts: the file
  is deleted once the post is published or fails. Weekly posts: it's kept until the series ends or is cancelled.
- **Post now:** `POST /api/owner/social/publish`. Images publish in that call. Reels: the open sheet polls
  `GET /api/owner/social/publish/[id]` every 5 s for at most 3 minutes, one Graph call per poll. If the tab
  closes, the cron (below) finishes it.
- **Post later:** a cron, `/api/cron/social-posts`, **every 15 minutes**. One indexed read of due rows (limit 25);
  publish images; create Reel containers and publish them on a later run once Meta reports `FINISHED`; roll weekly
  rows forward 7 days. **Needs Andrew's go-ahead to add to `vercel.json`** (CLAUDE.md), and a plan that allows
  15-minute crons.
- **Token refresh with no extra cron:** the same cron (and the sheet on open) refreshes Instagram tokens older
  than 7 days, which also keeps tokens alive for scheduled weekly posts.
- **Meta also requires:** deauthorize + data-deletion callbacks (`/api/social/meta/*`), and a privacy-policy section.
- Routes use `requireOwnerAuth` + `ownsVenue`. Flag `NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED` (off = no Post buttons,
  routes 404), single reader `lib/social/flags.ts`. Share / Download aren't flagged.

## 5. Phases

| Phase | Scope | Needs Meta? |
|---|---|---|
| **0. Spike** (1–2 days) | Throwaway page: an animated 15 s 1080×1920 Reel with music + 2 sound effects mixed → MP4. Test on Chrome (Mac), Safari (Mac), iOS Safari and Android Chrome. Does AAC `AudioEncoder` exist on each (decides the §4.3 fallback)? Share to Instagram from a phone and confirm it plays with sound. Go/no-go for D6. | No |
| **1. Posts + Stories** | `lib/promo/*` registries + subject builders + prize panel, the 6 game designs (§4.1) as Post/Story, the Share to social sheet, Share / Download / Copy caption, dashboard entry, coverage contract test (§9). | No |
| **2. Reels with sound** | Timelines, sound library (music + sound effects, §6), picker + preview, mixing, MP4 render with progress. | No |
| **3. End-of-flow prompt** | Schedule + Prize flows (§4.5). | No |
| **4. Meta setup** (start during Phase 1; mostly Andrew) | Business Verification, a new Meta app, both logins, privacy policy + callbacks, screencasts, submit App Review. Expect days to weeks and maybe a rejection round. | Yes |
| **5. Instagram: Post now** | Connect/disconnect, tables, crypto, storage hand-off, publish + polling, history. Behind the flag. Before approval it works only for app testers (Hightop's own account). | Yes |
| **6. Facebook Page: Post now** | Page picker, photos + Reels. | Yes |
| **7. Post later + weekly** | §4.6 defaults, Scheduled posts list, cron, failure email, cancel-with-game. | Yes |
| **8. Seal the hidden Post now routes** | Code review #6 (§5.2). The Post now routes answer only while the box is on the sheet. | No |
| **9. Publishing: no false "failed", no stale writes** | Code review #2, #3 + the same bug on Instagram's `media_publish` (§5.3). | No (tests mock Graph) |
| **10. Connect callback: right reason, one save** | Code review #1, #4 (§5.4). | No (tests mock Graph) |
| **11. One connection store, one post step** | Code review #7, #8 (§5.5). Refactor only, no behaviour change. | No |
| **12. Share sheet: details load error, helper names** | Code review #5, #9 (§5.6). | No |
| **13. Game-themes rule wording** | Code review #10 (§5.7). | No |
| **14. Instagram: `media_publish` at most once** | Second review #1 (§5.8). | No (tests mock Graph) |
| **15. Connect callback: no Page to post to, stale rows** | Second review #4, #5 (§5.9). | No (tests mock Graph) |
| **16. Post now panel: ready to come back** | Second review #7, #8 (§5.10). Own connect result + caption, error notices. | No |
| **17. Share sheet: only a saved handle on the picture** | Second review #3; #2 pinned as decided (§5.11). | No |
| **18. Clean-ups** | Second review #6, #9, #10 (§5.12). Refactor only. | No |
| **19. Nothing live is hidden or posted twice** | Third review #1, #2, #3 (§5.13). | No (tests mock Graph) |
| **20. The right message** | Third review #4, #5, #6 (§5.14). | No |
| **21. Clean-ups** | Third review #8, #9, #10 (§5.15). Refactor only. | No |

### 5.1 Model and effort per phase (Andrew asked, 2026-11-03)

Use **Opus 5.5** (`claude-opus-5-5`) where a mistake would leak a token, break auth, lose data or ship a broken
renderer to every partner. Use **Sonnet 5.5** (`claude-sonnet-5-5`) for contained UI and docs work. Effort is the
Claude Code effort level (`low` · `medium` · `high` · `xhigh` · `max`).

| Phase | Model | Effort | Why |
|---|---|---|---|
| 0. Spike | Opus 5.5 | high | Done. New tech (WebCodecs/Mediabunny), cross-device unknowns. |
| 1. Posts + Stories + sheet | Opus 5.5 | high | New registries, a server route reading several tables, a new owner sheet that must follow the navigation and wording rules, and a canvas renderer every later phase builds on. |
| 2. Reels with sound | Opus 5.5 | high | Video/audio encoding, timing, memory on phones; port of the approved spike. |
| 3. End-of-flow prompt | Sonnet 5.5 | medium | Two small screens in existing flows; the rules are already written down. |
| 4. Meta setup (docs, screencast script, privacy text, callbacks) | Sonnet 5.5 | medium | Mostly checklists and copy. The two callback routes are small, but they must verify Meta's signed request, so review them at high. |
| 5. Instagram Post now | Opus 5.5 | xhigh | OAuth, token encryption, a new migration with grants, storage hand-off, publishing to partners' real accounts. |
| 6. Facebook Page Post now | Opus 5.5 | high | Done 2026-11-04 (kept hidden, D35). Same patterns as Phase 5, on a different API. |
| 7. Post later + weekly | Opus 5.5 | xhigh | A cron, retries, cancel-with-game, failure emails, and cost limits. Mistakes post at the wrong time or many times. |
| 8. Seal the hidden Post now routes | Opus 5.5 | medium | Small (one switch, three gates, one contract test), but it is the gate in front of every owner social route; medium rather than high because no token, crypto or data path changes. |
| 9. Publishing state machine fixes | Opus 5.5 | xhigh | Done 2026-11-04. The one module that posts to partners' real accounts. A mistake posts twice or reports a live post as failed. |
| 10. Connect callback fixes | Opus 5.5 | high | Done 2026-11-04. OAuth callback, encrypted token writes, partner-facing outcome copy. |
| 11. Connection store + post step refactor | Opus 5.5 | high | Done 2026-11-04. Shared engine: token reads/writes and both state machines. Must not change behaviour. |
| 12. Share sheet fixes | Sonnet 5.5 | medium | Done 2026-11-04. Well-specified UI state + a rename; no server change. |
| 13. Game-themes rule wording | Haiku 5.5 | low | Done 2026-11-04. Two lines of docs. |
| 14. Instagram `media_publish` at most once | Opus 5.5 | xhigh | Done 2026-11-04. The one module that posts to partners' real accounts; a mistake posts twice or calls a live post failed. Same tier as Phase 9. |
| 15. Connect callback: no Page, stale rows | Opus 5.5 | high | Done 2026-11-04. OAuth callback and connection-status writes, plus partner-facing result copy. Same tier as Phase 10. |
| 16. Post now panel ready to come back | Sonnet 5.5 | medium | Done 2026-11-04. Contained UI in a component nobody sees today, plus a contract-test line; no server or token change. |
| 17. Share sheet saved-handle fix | Sonnet 5.5 | medium | One line of UI state, plus tests; the sheet partners see. |
| 18. Clean-ups (one read, one choose route, one name) | Opus 5.5 | medium | Done 2026-11-04. Small, but it touches the publishing module and the sealed route files. Medium, not high, because behaviour must not change and the tests pin it (as Phase 8). |
| 19. Nothing live is hidden or posted twice | Opus 5.5 | xhigh | Done 2026-11-05. The publishing module, Disconnect and Meta's deauthorize path: a mistake posts twice to a partner's real account or hides a live post. Same tier as 9 and 14. |
| 20. The right message | Sonnet 5.5 | medium | Done 2026-11-05. Partner-facing copy, one pure rules function, a provider argument on the caption check and panel state. Well specified, tests pin it; no token or publish path changes. |
| 21. Clean-ups (choose read, shared constants, dead checks) | Opus 5.5 | medium | Done 2026-11-05. Small, but in the publishing module and the sealed routes, like 18. Behaviour must not change and the tests pin it. |
| Any phase's final code review | Opus 5.5 | high | `/code-review high` before Andrew is asked to deploy. |

Each phase ends with `docs/partner-social-promo-plan_PHASE_<N>_HANDOFF.md`.

**Order:** 8 first (it takes the live surface away, so 9–11 can't hit a partner while they're being built). 9 and 10
in either order. 11 only after 9 and 10, so their new tests protect the refactor. 12 and 13 are independent and can
run any time. None of 8–13 needs a migration, a `supabase db push`, a new env var, a cron or a `vercel.json`
change. All of it goes on `after-app-review` (branch rule, CLAUDE.md). **Phases 8–11 block turning Post now on
for partners**; 12 is visible on the sheet today; 13 is docs. **Phases 14–18** (second review, 2026-11-04): order
and blockers are at the top of §5.8 ("Second `/code-review`"). 14, 15 and 16 block turning Post now on.

### 5.2 Phase 8 — Seal the hidden Post now routes (code review #6)

**Problem.** D32/D35 took the Post now box (`components/owner/social/SocialPostNowPanel.tsx`) off the sheet, and the
D33 follow-up removed the dashboard's `?socialResult=` / `?socialVenue=` read
(`app/owner/dashboard/page.tsx`, `useSearchParams` in `DashboardBody`). But every `/api/owner/social/**` route still
answers whenever `NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED` is on. With the flag on, a partner (or anyone with the URL)
can go through `GET /api/owner/social/meta/connect` and land on `/owner/dashboard?sheet=social&socialResult=…`,
where nothing reads the result. Tokens get stored for a feature nobody can see.

**Fix (recommended: seal).**

1. In `lib/social/flags.ts` (still the only reader of the env var) add a code switch and one helper:
   `export const SOCIAL_POST_NOW_ON_SHEET = false;` and
   `export const isSocialPostNowLive = (): boolean => isSocialPublishEnabled() && SOCIAL_POST_NOW_ON_SHEET;`.
   A code constant, not a second env var, so turning Post now back on is one reviewed change made together with
   re-attaching the UI (below).
2. Use `isSocialPostNowLive()` in place of `isSocialPublishEnabled()` in `guardOwnerSocialVenue`
   (`lib/social/ownerSocialGuard.ts`) and in the two redirect routes
   (`app/api/owner/social/meta/connect/route.ts`, `app/api/owner/social/meta/callback/route.ts`). Off = 404, as
   today. Grep `isSocialPublishEnabled` across `app/` and `components/` and switch every Post now caller.
3. **Do not gate** Meta's deauthorize / data-deletion callbacks (`/api/social/meta/*`, `lib/social/metaCallbacks.ts`).
   They must keep working for anyone who connected earlier (Meta requires them).
4. Contract test in `tests/social-publish-contract.test.ts`: `SOCIAL_POST_NOW_ON_SHEET` is `true` **if and only if**
   `ShareToSocialSheet.tsx` renders `<SocialPostNowPanel`. Today that's false/false. Replace the existing
   "never renders `SocialPostNowPanel`" assertion (line ≈76) with this one.
5. Before starting, run `vercel env ls` and record in the handoff which environments set
   `NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED` (names only; never `vercel env pull`).

**When Post now comes back (not this phase; write it into the Phase 8 handoff as a checklist):** set the constant to
`true`; restore in `DashboardBody` `const socialResult = searchParams.get("socialVenue") === venueId ?
searchParams.get("socialResult") : null` and pass it to `ShareToSocialSheet` → `SocialPostNowPanel`'s
`socialResult` prop; render the panel under the flag; the contract test then requires both.

**Alternative (only if Andrew asks for it):** re-attach the box now, shown only when the flag is on, so testers can
record the Meta App Review screencast on a Preview (§7). It reverses D32 for any environment with the flag on, so
it's Andrew's call. Recorded in §10.

**Verify:** `npm run test`, `npx tsc --noEmit`, `npm run lint`. With the flag on in a scratchpad clone, the connect
route and every JSON social route return 404; `/api/social/meta/deauthorize` still answers.

### 5.3 Phase 9 — Publishing: no false "failed", no stale writes (code review #2, #3)

All in `lib/social/socialPosts.ts`, `lib/social/socialPublishRules.ts`, `lib/social/socialTypes.ts`,
`lib/promo/promoCopy.ts` and the three routes that claim posts: `app/api/owner/social/posts/[id]/publish/route.ts`,
`app/api/owner/social/posts/[id]/route.ts` (poll), `app/api/owner/social/status/route.ts` (Recent posts).

**Problem A: a request can outlive its lease (#3).** `SOCIAL_PUBLISH_LEASE_MS` is 90 s. The default Vercel function
limit is now 300 s, and a Facebook Reel publish is a signed URL plus start + upload + finish at up to 20 s each
(`TIMEOUT_MS` in `lib/social/metaGraph.ts`) plus DB round-trips. A Recent-posts read can then take over the
"publishing" row while the first request is still running. `finish()` (line ≈121) writes with no status or claim
condition, and `moveIf(row.id, "publishing", { container_id })` falls back to `{ ...row, container_id }` when it
loses, so the first request keeps uploading and publishing on a row it no longer owns. Last write wins.

**Fix A.**

1. `export const maxDuration = 90;` on the three routes above. Raise `SOCIAL_PUBLISH_LEASE_MS` to `150_000`. Vercel
   stops a function at `maxDuration`, so no request can outlive a lease. Export the route limit as
   `SOCIAL_ROUTE_MAX_DURATION_S = 90` in `socialPublishRules.ts`. Next.js needs a literal in each route, so a
   contract test reads the three route files and checks each says `maxDuration = 90` and that
   `SOCIAL_PUBLISH_LEASE_MS >= SOCIAL_ROUTE_MAX_DURATION_S * 1000 + 60_000`. Cost: none. `maxDuration` is a cap,
   and Active CPU pricing doesn't bill the time spent waiting on Meta.
2. **Fence every write made under a claim.** The claim's `claimed_at` is the fencing token. `finish()` and every
   mid-claim `moveIf` add `.eq("status", "publishing").eq("claimed_at", row.claimed_at)`. Every current caller of
   `finish`/`fail` already holds a claim (check this while editing). If the guarded update matches no row, the claim
   was lost: log `[SocialPost] lost-claim { postId }`, **don't delete the file** (the new owner may still need
   it), re-read and return the row. A lost mid-claim `moveIf` (saving `container_id`) stops the request before its
   next Graph call. Remove the `?? { ...row, container_id }` fallbacks.
3. **Renew the lease just before each call Meta can't undo:** Instagram `media_publish`, Facebook photo publish and
   Facebook Reel `finish`. Renewing is one guarded update that sets `claimed_at = now` where it still equals ours.
   If it fails, stop. That's ≤2 extra DB writes per post.

**Problem B: Meta may have published, but we say failed (#2, and the same on Instagram).**

- Facebook Reel: `uploadFacebookReel` or `finishFacebookReel` times out, or its response is lost, after the video
  id was saved. `fail()` marks the post failed and deletes the file, but Meta may still publish the Reel. The
  partner posts again and the Page gets a duplicate.
- **Instagram, found while checking #2:** `publishClaimed` calls `fail()` on a `network` error from
  `publishInstagramContainer`, although the container id is saved and `media_publish` may have gone through.
  Same duplicate risk.

**Fix B.**

1. A `network` error, or an HTTP ≥ 500 with no Graph error code, on a call made **after the id is saved** is "not
   sure", never "failed". Move the row back to `processing` (`claimed_at = null`, fenced as above), keep the file,
   and let the poll decide. Helper: `isUnsure(error: GraphError): boolean` in `socialPublishRules.ts`, unit-tested.
   - Instagram: the next poll's `fetchContainerStatus` returns `PUBLISHED` → `already_published` (already handled)
     or `FINISHED` → publish (safe, it didn't go out).
   - Facebook Reel: extend `fetchFacebookReelStatus` / `FacebookReelStatus` with the upload and publishing phase
     values, and `facebookReelStep` with two resume steps. `resume_upload`: uploading phase not complete. Upload
     again with a **fresh** 1-hour signed URL. `resume_finish`: uploading complete, publishing phase `not_started`.
     Call finish again. Run a resume only when the row's `updated_at` is ≥ 2 min old (add `updated_at` to
     `COLUMNS`; the resume updates it), so there's at most one resume per 2 minutes inside the 1-hour
     `SOCIAL_FACEBOOK_REEL_TTL_MS`: normally 0–1 extra Graph calls, ≤30 at worst.
   - **Verify in Meta's Reels publishing docs, or with Hightop's test Page, before relying on the resume steps:**
     (a) the field names and values of `status.uploading_phase` / `publishing_phase`; (b) a second
     `upload_phase=finish` on the same video id never publishes twice; (c) a second `rupload` with `file_url` to the
     same video id is accepted. If (b) or (c) can't be confirmed, ship without that resume step: the row waits in
     `processing` until the TTL, then fails as `unconfirmed` (below).
2. Calls made **before** any id exists stay as they are: `createInstagramContainer` and `startFacebookReel` errors
   fail the post. An orphan container or unpublished video can't go live.
3. **New error code `unconfirmed`** (`SocialPostErrorCode` and `SOCIAL_POST_COPY.errors`): "We couldn't confirm this
   posted. Check your Page before posting again." Use it for: a Facebook photo whose single publish call hit a
   network error (still never retried, §9 Phase 6 rule); a stale "publishing" post with no id that's taken over
   (`advanceFacebookPost`, now "failed"); and a Facebook Reel that reaches its TTL with the result unknown.
   `social_posts.error` is plain text with no check constraint (migration `20261104193338`), so **no migration**.
   On Instagram, give a stale no-container post the same code only if `createContainerFor` had already started.
   Otherwise its retry-from-the-file path stays.

**Tests** (`tests/lib.social-publish.test.ts`, mocked Graph and DB, as the Phase 5/6 tests are): a takeover while the
first request is mid-upload, where the first request's `finish` matches nothing, keeps the file and makes no more
Graph calls; a lost `container_id` save stops before the upload; the upload times out → `processing`, then
`resume_upload` once ≥ 2 min later; finish's response is lost → `processing`, then status reports published →
`published` with no second finish; Instagram `media_publish` network error → `processing`, then
`PUBLISHED` → `published`, with `media_publish` called once in total; a Facebook photo network error →
`failed` / `unconfirmed`, never retried; the lease-vs-`maxDuration` contract.

**Standing rule to add to §9 when done:** "Every write made under a claim is fenced on `claimed_at`. A Graph call
that may have gone through (`isUnsure`) after an id is saved never fails a post. The poll decides.
`SOCIAL_PUBLISH_LEASE_MS` stays above the claiming routes' `maxDuration` (contract test)." (Added, §9.)

**As built (Phase 9, 2026-11-04). Where it differs from the text above, and why:**

- **No second upload and no second finish, ever.** Meta's Reels guide (re-read 2026-11-04) confirms the status
  fields and values, check (a). It says nothing on (b) a repeated `finish` or (c) a repeated `file_url` upload to the
  same video id. So `resume_upload` isn't built, and `resume_finish` became **`send_finish`**: the *first* finish,
  sent by the poll only when finish never went out (the upload's answer was lost) and Meta shows the whole file. The
  "finish sent" mark is `external_post_id = <video id>`, written in the same fenced write that renews the lease
  just before the call (no migration; it's the value a published Reel gets anyway). That makes finish at-most-once
  without relying on (b), and no `updated_at` 2-minute gate is needed.
- **A Facebook Reel with a video id is failed only by Meta's own answer.** When Meta can't be asked (connection not
  active, another Page, token unreadable, status read refused or unanswered), the Reel waits; reconnecting to the
  same Page lets the next check answer. A refused token on the status read still flags the connection. Past the
  hour (`SOCIAL_FACEBOOK_REEL_TTL_MS`) Meta is still asked once: published → published, Meta's error → failed,
  otherwise `unconfirmed` if finish was sent, `expired` if it never was (then it can't be on the Page).
- **`unconfirmed` is for Facebook photos only** among the stale no-id posts. A Reel with no saved video id was never
  uploaded or finished (the id save is fenced and comes first), so it stays a plain `failed`.
- **Instagram: a stale no-container post keeps its retry-from-the-file path.** `media_publish` needs the saved
  container id and that save is now fenced with no fallback, so a post with no container id was never published.
  The "only if `createContainerFor` had already started" case can't happen.
- **`isUnsure` is a little wider than "network or 5xx with no code":** it also counts a 2xx we couldn't use and
  Graph codes 1 / 2 ("unknown", "temporarily unavailable"). That's the safe direction: a real refusal called
  "unsure" only waits for the poll. The Graph client now reports a 2xx whose body was cut off (or timed out mid-body)
  as `network`. Before, it crashed the request with a TypeError.
- **Recent posts moves its (at most two) open posts side by side**, so the status route stays well inside 90 s
  (each step is ≤3 Graph calls of ≤20 s).
- The hidden Post now panel's Recent posts says **"Not confirmed"** (not "Didn't post") for an `unconfirmed` post.

### 5.4 Phase 10 — Connect callback: the right reason, one save (code review #1, #4)

`app/api/owner/social/meta/callback/route.ts`, `lib/social/socialConnections.ts`, `lib/social/socialTypes.ts`
(`SocialConnectResult`), `lib/promo/promoCopy.ts` (`SOCIAL_POST_COPY.results`).

**Problem #1.** Line ≈140 answers `facebook_only` whenever no Instagram account was saved in this login. That also
happens when the partner switched the Instagram permissions off in Meta's dialog (`instagramGranted` false →
`accounts = []`). The sheet then tells them to "switch to a professional account and link it to the Page", which
they may have done already. The symmetric case (Instagram saved, Page permission off) answers plain `connected`.

**Fix #1.** Work out one outcome per provider: `saved | choose | not_granted | none_linked`. Then map:

| Instagram | Facebook | Result |
|---|---|---|
| not_granted | not_granted | `missing_permissions` (as now) |
| none_linked / not_granted | none_linked / not_granted, at least one none_linked | `no_instagram` (as now); **Phase 20:** only none_linked + none_linked. Instagram not_granted + Page none_linked → `instagram_declined_no_page`; the mirror → `facebook_declined_no_instagram` |
| either `choose` | | `choose_account` (as now) |
| saved | saved | `connected` |
| **not_granted** | saved | **`instagram_declined`** (new) |
| none_linked | saved | `facebook_only` (as now, now correct) |
| saved | **not_granted** | **`facebook_declined`** (new) |
| saved | none_linked | `connected` (no Page to post to; the sheet's status row shows Facebook as not connected). **Phase 15 changed this row to `facebook_no_page`** (§5.9, done). |

New copy. `instagram_declined`: "Your Facebook Page is connected. Instagram wasn't switched on, so to post there,
connect again and leave Instagram on." `facebook_declined`: "Instagram is connected. Posting to your Facebook Page
wasn't switched on, so to post there, connect again and leave it on."

**Earlier connection.** When a provider is `not_granted` in this login and the venue already has an **active** row
for it with the same `meta_user_id`, the declined permission has probably been taken off that token too. Mark the
row `reconnect_needed` (`markSocialReconnectNeeded`, reason `declined at reconnect`) so the status row says
"Reconnect", not "Connected". **Verify with a Meta test user first** that declining at re-login removes the
permission from the existing Page token. If it doesn't, leave the row alone. Today a post would fail with a
`permission` error and mark the row anyway, so this only makes the status show up sooner.

**Problem #4.** The Instagram and Facebook saves (lines ≈130–133) are separate upserts. If the Facebook save throws
after Instagram's went through, the partner reads "Couldn't connect" while Instagram is in fact connected, and it
may have replaced an earlier Instagram row.

**Fix #4.** Make the save all-or-nothing. Pure row builders in `socialConnections.ts`
(`connectionRow(provider, base, account)` and `pendingChoiceRow(provider, base, pending, choices)`) do all the
encryption first, so an encryption failure throws before anything is written. Then one
`saveSocialConnections(rows)` sends them in **one** `upsert(rows, { onConflict: "venue_id,provider" })`.
PostgREST runs one request as one statement in one transaction, so both rows land or neither does. `done("error")`
then means nothing changed. The `reconnect_needed` mark above runs after the upsert and is best effort. Phase 11
reuses the builders.

**Tests** (`tests/lib.social-publish.test.ts`, the callback block at ≈ lines 430–460 and 710–760): every row of the
table above; the Instagram permission declined while the Page is granted → `instagram_declined` (not
`facebook_only`); declining with an earlier active Instagram row from the same Meta user → that row becomes
`reconnect_needed`; a failing upsert → `error`, with exactly one upsert call carrying both rows; an encryption
throw → no DB write at all.

**As built (Phase 10, 2026-11-04).**
- The table lives in `lib/social/socialPublishRules.ts`: `socialConnectOutcome(granted, found)` →
  `saved | choose | not_granted | none_linked`, and `socialConnectResult(instagram, facebook)`. The route only maps
  its counts through them. Precedence: both `not_granted` → `missing_permissions`; either `choose` →
  `choose_account`; neither `saved` → `no_instagram`; then the declined / `facebook_only` / `connected` rows.
  A `choose` with the other provider declined still reads `choose_account` (as the table says).
- Row builders in `lib/social/socialConnections.ts`: `connectionRow(provider, base, account)` and
  `pendingChoiceRow(provider, base, pending, choices)`, with `ConnectedAccount` (`pageId`, `accountId`,
  `displayName`, `pageToken`) made by `instagramConnectedAccount` / `facebookConnectedAccount`, and
  `instagramChoicesOf` / `facebookChoicesOf`. Every row has the same keys (`SocialConnectionRow`), so
  `saveSocialConnections(rows)` sends them in one `upsert(rows, { onConflict: "venue_id,provider" })`. The four
  old savers (`saveInstagramConnection`, `savePendingInstagramChoice`, `saveFacebookConnection`,
  `savePendingFacebookChoice`) are now one-line wrappers over the builders; the choose routes still use them.
  (Phase 11 removed the wrappers; see §5.5 "As built".)
- **Earlier connection, not verified with a Meta test user** (there is no test user or Meta access here). It was
  built on this reasoning: `granted` comes from `GET /me/permissions`, which is the app's grant for that Facebook
  user, not one token's scope, and a Page token made from that user only has the permissions the user has
  granted the app. So a permission the same user declines now is gone for the old Page token too.
  `markDeclinedReconnectNeeded(venueId, metaUserId, providers)` is one filtered update (venue + same
  `meta_user_id` + `status = active` + provider in the declined list). It runs after the upsert, and also on
  `missing_permissions` and `no_instagram`, since those logins finished too. It never runs on `error`. Best effort:
  a failure is logged (`[SocialMeta] declined-mark-failed`) and the result stands. **Check once on Hightop's own
  account when Post now comes back** (connect, then reconnect with Instagram off, then try a post on the old
  row). If the old token still posts, delete the `markDeclined()` calls in the route.

### 5.5 Phase 11 — One connection store, one post step (code review #7, #8)

**Refactor only. No behaviour change: every existing test passes untouched, apart from import names.** Run it
after Phases 9 and 10 so their tests protect it.

**#7, `lib/social/socialConnections.ts`.** `loadFacebookConnection`, `facebookPageToken`,
`saveFacebookConnection`, `savePendingFacebookChoice` and `chooseFacebookPage` copy their Instagram twins line for
line. They already differ: Instagram's `parseChoices` accepts any non-empty id, `parsePageChoices` requires digits.

- One spec per provider: `PROVIDERS: Record<SocialProvider, { label, idOfChoice, parseChoice, fetchChoices,
  toChoice }>`. `fetchChoices` is `fetchInstagramAccounts` or `publishablePagesOf(fetchMetaPages)`.
- Generic `loadConnection(venueId, provider)`, `connectionToken(connection)`, `savePendingChoice(provider, …)`
  and `chooseConnection(provider, venueId, ownerId, id)`, built on Phase 10's row builders. The TTL delete,
  fail-closed token read and upsert columns then live in one place each.
- One `SocialConnection` type (`provider`, `accountId` = Instagram id / Page id, `displayName`, `choices`, …).
  Keep `connectionView` / `facebookConnectionView` and the wire types in `socialTypes.ts` unchanged, so the sheet,
  the routes' JSON and the panel don't change. Keep the old exported names as one-line wrappers only if that
  makes the diff much smaller, and say so in the handoff.
- One choice-id rule for both providers: Meta's numeric id, `/^\d{1,40}$/`. Pending choices expire after an hour
  (`SOCIAL_PENDING_CHOICE_TTL_MS`), so tightening Instagram's check strands nothing for long.
- The AAD slots stay exactly as they are (`social:<provider>:<venue>:page_token` / `user_token`). Changing them
  would make every stored token unreadable. Add a test that pins both strings for both providers.
- Log tags: one `[SocialConnections]` prefix plus `provider`. Today Facebook paths log as `[SocialInstagram]`.

**#8, `lib/social/socialPosts.ts`.** `advanceFacebookPost` repeats the first half of `advanceInstagramPost`
(upload-abandon, lease, TTL, connection-mismatch claim-and-fail).

- Extract `advanceCommon(row, connection, nowMs, spec)`. It returns a final/unchanged row, or `continue`.
  **Updated after Phase 9:** only the first three steps are truly shared: upload-abandon → not open → lease still
  held. After them the providers differ on purpose. Instagram: TTL → `expired`, then connection mismatch →
  `reconnect`, then the container. Facebook: no id → `unconfirmed` (photo) / `failed` (Reel), then "only Meta's
  answer fails a Reel" (a mismatch waits; past the TTL Meta is still asked once, then `unconfirmed`/`expired`). Keep
  those orders exactly. Moving Facebook's no-id check after the TTL would turn an old photo's `unconfirmed` into
  `expired`.
- Each provider keeps only its own remainder: Instagram's container status and publish, Facebook's Reel status and
  `send_finish`.
- Add a table-driven test that runs the same prelude cases (abandoned upload, lease held, TTL, wrong account,
  disconnected) through **both** providers. The expected result is **per provider** where Phase 9 made them differ
  (TTL, wrong account, disconnected), and the same for abandoned upload and lease held.

**As built (Phase 11, 2026-11-04).**
- `lib/social/socialConnections.ts`: one `SocialConnection<P>` (`provider`, `accountId` = external_account_id = the
  Instagram id or the Page id, `displayName` = the @username without the @ or the Page name, `choices`). Facebook's
  `pageId` used to come from `page_id`; every Facebook row has `page_id = external_account_id` (both set from the Page
  id since Phase 6), so `accountId` is the same value. `PROVIDERS: { [P in SocialProvider]: ProviderSpec<P> }` holds
  only what differs: `label` (error messages), `parseChoice`, `fetchChoices` (Instagram: `fetchInstagramAccounts`;
  Facebook: `publishablePagesOf(fetchMetaPages)`, both mapped to `ConnectedAccount`). `idOfChoice` became one
  `choiceId(choice)` (an Instagram choice has `instagramId`, a Page choice `pageId`), and `toChoice` stays as the
  callback's `instagramChoicesOf` / `facebookChoicesOf`, which take Meta's raw shapes.
- Generic API: `loadConnection(venueId, provider, nowMs?)`, `connectionToken(connection)`,
  `chooseConnection(provider, venueId, ownerId, id)`, `disconnectConnection(venueId, provider)`. **No wrappers
  kept** — every old provider-named function is gone (`load/save/savePending…/choose…/…PageToken/disconnect…` for
  both). `savePendingChoice` wasn't added: nothing in production saves a single pending row (the callback batches
  `pendingChoiceRow`s), so tests build rows with `connectionRow` / `pendingChoiceRow` + `saveSocialConnections`, as
  the callback does. `connectionView` / `facebookConnectionView` and every wire type are unchanged.
- One choice-id rule, `META_ID = /^\d{1,40}$/`, for both providers (was: Instagram any non-empty string). One log
  prefix `[SocialConnections]` + `provider` (`choose-fetch-failed`, `media-delete-failed`, `revoke-failed`). AAD
  slots unchanged and pinned by a test.
- `lib/social/socialPosts.ts`: `advanceCommon(row, nowMs)` → a row, or `"continue"`. It takes no connection or spec
  because the three shared steps (upload-abandon → not open → lease held) don't use one. Each provider's own order
  after it is untouched. `createInstagramPost` / `createFacebookPost` became one `createSocialPost(input)` (the
  provider and account id come from `input.connection`); the posts route makes one `loadConnection` call.
  `publishInstagramPost` / `publishFacebookPost` are unchanged.
- Tests: the old tests changed only at call sites (function names and argument shape for the setup helpers), not in
  any expected value. New: AAD pins, the numeric-id rule on both providers, Instagram choose through the generic
  path, the `[SocialConnections]` log tag, and a 5-case × 2-provider prelude table.

### 5.6 Phase 12 — Share sheet: details load error, helper names (code review #5, #9)

**#5.** `components/owner/social/ShareToSocialSheet.tsx` (effect at ≈ line 246) swallows a failed share-details
load (`() => undefined`). `details` stays null, so the Address tick, the Instagram handle tick and the handle input
just aren't there, with no message and no retry until the sheet is reopened.

**Fix.**

- State `detailsLoad: "loading" | "ready" | "error"` plus a `detailsAttempt` counter in the effect's deps.
- On error, show one line where the ticks would be: `SHARE_SOCIAL_COPY.detailsLoadFailed` = "Couldn't load your
  address and Instagram handle." and a **Try again** text button (`min-h-11`, theme tokens, nothing under 12 px)
  that bumps `detailsAttempt`. The prize ticks, Bar name, Preview, Share and Download keep working, so the picture
  just goes out without handle or address.
- A failed request isn't cached (`inFlight` is cleared in `finally`, `cache` is set only on success), so a retry
  really refetches. Cost: one GET per tap, nothing automatic.
- While `loading`, keep today's behaviour (the ticks appear once loaded). No new spinner.

**#9.** The client helper `getVenueShareDetails` (`components/owner/share/ShareDetailsPanel.tsx:50`) has the same
name as the server function in `lib/venueShareDetailsStore.ts:46`, with a different shape and a different runtime.

**Fix.** Move the client cache and both helpers out of the component file into `lib/venueShareDetailsClient.ts`,
renamed `fetchVenueShareDetails` and `patchVenueShareDetails`. The verbs say "over HTTP". Update the two callers:
`ShareDetailsPanel.tsx` and `ShareToSocialSheet.tsx` (imports at line 5, call sites ≈ lines 249 and 414). The
server name stays. Add one line to `tests/social-publish-contract.test.ts` or `tests/share-details-panel.test.ts`:
no file under `components/` imports `@/lib/venueShareDetailsStore`.

**Tests:** `tests/components.share-to-social-sheet.test.ts`: a failed load shows the message and Try again, Try
again refetches, and the ticks appear on success. Run `npm run test`, `npx tsc --noEmit`, `npm run lint`. Check the
sheet at 350 px.

### 5.7 Phase 13 — Game-themes rule wording (code review #10)

**Done 2026-11-04.** Handoff: `docs/partner-social-promo-plan_PHASE_13_HANDOFF.md`.

`CLAUDE.md` (Feature rules row "Game themes", line ≈126) says "Every game = one `GAME_TILE_THEMES` entry and one
`PROMO_THEMES` entry". But `PROMO_THEMES` is a `Record<PromoGameId, …>` with 6 games (`live_trivia`,
`category_blitz`, `pickem`, `nfl_pickem`, `squares`, `bracket`), and Speed Trivia, Bingo and Fantasy have tile
themes but no Share to social design. Reword the cell to: "Every Venue Home game = one `GAME_TILE_THEMES` entry;
every Share to social game (`PromoGameId`) = one `PROMO_THEMES` entry; a theme styles the name, never rewords it;
vector art only, no logos." Check that `docs/game-themes-plan.md` Standing rules (≈ lines 97–101) still match. They
already say "a new schedulable or prize game". Don't add promo themes for games that have no template. Short
handoff note (doc-only phase).

### Second `/code-review` (2026-11-04): findings → Phases 14–18

Ten findings on the uncommitted Phase 6–13 work. Each was checked against the code before it was planned.

| # | Finding | Verdict | Phase |
|---|---|---|---|
| 1 | Instagram `media_publish` with no clear answer → `processing`; a lagging `FINISHED` makes the poll publish again | **Real.** Phase 9 assumed the container reads `PUBLISHED` as soon as a publish goes through. Nothing guarantees that, and even if Meta refuses the second publish, we'd mark a live post `failed`. | 14 |
| 2 | The venue's saved "On shared pictures" choices (`showName` / `showInstagram`) don't set the sheet's starting ticks | **Not a bug: decided in D33.** That setting is for players' share pictures, and the ticks are "this post only". No change; pinned in Phase 17 so it isn't raised again (D36). | 17 (pin only) |
| 3 | A handle typed but not saved goes onto the picture, and each keystroke redraws the picture and throws away a finished Reel | **Real.** `handle = handleOn ? (savedHandle ?? typedHandle) : null` (`ShareToSocialSheet.tsx:186`). | 17 |
| 4 | Instagram saved + Facebook granted with no Page to post to reads "Connected."; `choose` hides a declined provider | **Half real.** The first part is the Phase 10 table row "saved / none_linked → connected", which gives the partner no reason. The second is kept on purpose (D37). | 15 |
| 5 | A provider granted but now `none_linked` leaves the venue's old active row "Connected" | **Real.** `markDeclined` only covers `not_granted` (`meta/callback/route.ts:122`). | 15 |
| 6 | `publishSocialPost` reads the post, then the provider function reads it again | **Real.** One extra `social_posts` read per Post now. | 18 |
| 7 | Turning Post now back on would ship without the connect-result message or a caption | **Real.** The Phase 8 restore checklist covers `socialResult`, but D34 removed the caption box, and the panel still needs `caption`. | 16 |
| 8 | `choose()` / `disconnect()` in the Post now panel have no `catch` | **Real.** An offline tap does nothing, shows nothing, and leaves an unhandled rejection. | 16 |
| 9 | `facebook/choose` copies `instagram/choose` line for line (and the two `GET`/`DELETE` routes too) | **Real.** Clean-up. | 18 |
| 10 | `posts/route.ts:51` works out the provider's name inline again | **Real.** Clean-up. | 18 |

**Order:** 14 and 15 in either order. 16 after 15, since the panel shows 15's new result copy. 17 any time, and
it's the only one a partner could see today (the sheet itself). 18 last, because it touches the same module as 14
and the same routes as 16. **14, 15 and 16 block turning Post now on for partners**, as 8–11 did. None of 14–18
needs a migration, `supabase db push`, an env var, a cron or a `vercel.json` change. All on `after-app-review`.

### 5.8 Phase 14 — Instagram: `media_publish` at most once (review #1)

`lib/social/socialPosts.ts` (`publishClaimed` :324, `advanceInstagramPost` :396), `lib/social/socialPublishRules.ts`
(`containerStep` :121), `tests/lib.social-publish.test.ts`.

**Problem.** `publishClaimed` sends `media_publish`. If the answer is lost (`isUnsure`: timeout, cut-off 2xx, 5xx
with no code, Graph code 1/2), `unsure()` moves the post to `processing`. Ten seconds later the poll reads the
container. If it still says `FINISHED` (Meta's read can lag the publish), `containerStep` → `publish`, and
`publishClaimed` calls `media_publish` a second time. That posts twice, or, if Meta refuses the second call, marks a
live post `failed`.

**Fix: the same at-most-once mark the Facebook Reel finish uses (Phase 9).**

1. **Mark before the call.** In `publishClaimed`, the lease-renewing write becomes
   `renew(row, { external_post_id: containerId })`: one fenced write, no extra DB cost. `publishSent(row)` =
   `row.provider === "instagram" && row.external_post_id !== null && row.external_post_id === row.container_id`.
   No migration: Instagram's `external_post_id` is otherwise empty until `finish` writes the media id.
2. **Clear it only on a clear "no".** `not_ready` (Meta said the container isn't ready, so nothing went out) →
   `toProcessing(live, { external_post_id: null })`, so the next `FINISHED` publishes normally. A refusal still
   goes to `fail()`, which is final.
3. **The poll never publishes a marked post.** `containerStep(statusCode, { publishSent })`:
   - `PUBLISHED` → `already_published` (as now). `finish` writes `external_post_id: null` there (it held the
     container id, not a media id), and `permalink` stays null as today.
   - `FINISHED` + `publishSent` → `wait` until `SOCIAL_INSTAGRAM_CONFIRM_MS` (new, `10 * 60_000`) has passed since
     the post's `updated_at`. After that → `unconfirmed`. Add `updated_at` to `COLUMNS`. The `unsure` →
     `processing` write sets it, and a `wait` writes nothing, so it stays the time the publish was sent.
   - `FINISHED` without the mark → `publish` (as now: a post whose `media_publish` was never sent).
   - `ERROR` / `EXPIRED` → as now.
4. **A stale "publishing" with the mark** (its request died after the mark, maybe mid-call): treat it as
   `processing` + `publishSent`. Release it (`releaseStale`) and let rule 3 decide. It's never republished.
5. **Copy:** `unconfirmed` reads "…Check your Page before posting again.", which is wrong for Instagram. Make it
   ``unconfirmed: (provider) => `We couldn't confirm this posted. Check ${provider} before posting again.` ``.
   The panel's `errorText(post)` fills it in from `COPY.providers[post.provider]`. Recent posts already says
   "Not confirmed" for it.

**Why 10 minutes:** the sheet polls every 10 s for 5 min (`SOCIAL_POLL_*`), and Recent posts moves open posts on
open. Ten minutes gives Meta's read time to catch up, and after that the partner gets a clear "check Instagram"
instead of a post stuck at "Posting…" until the 24 h container expiry. If `media_publish` never really reached Meta,
the post ends `unconfirmed`, not retried. That's the safe direction, the same as the Facebook photo rule.

**Cost:** no new Graph calls (one fewer in the bad case). A waiting post makes the existing one status read per
poll. At most 60 polls in 10 min, and only while the sheet is open.

**Tests** (`tests/lib.social-publish.test.ts`, "Phase 14", mocked Graph/DB):
- `media_publish` network error → `processing` with the mark; next poll `FINISHED` → no second `media_publish`.
- `FINISHED` again after `SOCIAL_INSTAGRAM_CONFIRM_MS` → `failed` / `unconfirmed`, with `media_publish` called
  once in total.
- `PUBLISHED` → `published`, with `external_post_id` cleared.
- `not_ready` → the mark is cleared, and the next `FINISHED` publishes once.
- A stale `publishing` with the mark → released, never republished.
- The Phase 9 test "media_publish network error → processing → PUBLISHED → published" still passes.
- `containerStep` unit cases for `{ publishSent }`.

**Verify when Post now comes back** (Hightop's own account, not blocking): after a publish, how soon does the
container's `status_code` read `PUBLISHED`? Record the answer here. Only lower the 10 minutes if it's always
immediate.

**Standing rule to add to §9 when done:** "(Phase 14) `media_publish` is sent at most once per post: the
lease-renewing write before it sets `external_post_id = container_id`, and a marked post is never published again.
`FINISHED` on a marked post waits `SOCIAL_INSTAGRAM_CONFIRM_MS`, then `unconfirmed`."

**As built (Phase 14, 2026-11-04). Where it differs from the text above, and why:**

- **The mark is checked on the claimed row, not only on the row the poll read** (`publishClaimed` returns a marked
  post to `processing` without calling Meta). Found while building: two polls can both read the post unmarked with
  `FINISHED`; the first claims, sends `media_publish`, loses the answer and hands the post back to `processing`; the
  second's claim (conditional on `status = 'processing'` only) then succeeds on a row that is now marked. Rule 3 alone
  would have published it again. Test: "a poll that read the post unmarked never publishes it…".
- **The same race on the Facebook Reel finish, fixed the same way** (`sendReelFinish` returns a post whose
  `external_post_id` is already set to `processing` without a second finish). It broke the Phase 9 rule "finish is
  sent at most once" whenever the upload's answer had been lost and two polls ran together. One line plus a test
  ("the same race on a Facebook Reel's first finish…").
- **A marked post is never given a "didn't post" reason without Meta's answer.** Rules 1–5 covered `FINISHED`. Three
  other endings now also say `unconfirmed` for a marked post: the 24 h container TTL (was `expired`), a connection
  that's gone or now another account (was `reconnect`), and a refused status read (was the refusal's reason; a refused
  token still flags the connection). This closes the Phase 9 handoff's residual risk ("an unsure `media_publish`…
  ends as `expired`… or `reconnect`… although it may be live"). Unmarked posts are unchanged.
- **`finish()` clears the mark on every final state, not only `PUBLISHED`** (`external_post_id` = the media id or
  null on Instagram). A failed or unconfirmed Instagram post never keeps a container id in `external_post_id`.
- **`updated_at` stays the send time:** `moveIf` lets a patch keep `updated_at`, and the non-final writes to a
  marked post (`releaseStale`, the guard above) keep it (`keepSentAt`). One exception: in the race above, the
  second poll's claim moves it on by that poll's status read (seconds; the window starts that much later, the safe
  direction).
- Copy: `SOCIAL_POST_COPY.errors.unconfirmed` is now `(name) => "We couldn't confirm this posted. Check ${name}
  before posting again."`; the hidden panel's `errorText` fills in `COPY.providers[post.provider]`.

### 5.9 Phase 15 — Connect callback: no Page to post to, stale rows (review #4, #5)

`lib/social/socialPublishRules.ts` (`socialConnectResult`), `lib/social/socialTypes.ts` (`SocialConnectResult`),
`lib/promo/promoCopy.ts` (`SOCIAL_POST_COPY.results`), `app/api/owner/social/meta/callback/route.ts` (:120–170),
`lib/social/socialConnections.ts` (`markDeclinedReconnectNeeded` :322), `tests/lib.social-publish.test.ts`.

**#4, fix.** Add the result **`facebook_no_page`** for Instagram `saved` + Facebook `none_linked`. Copy: "Instagram
is connected. We didn't find a Facebook Page you can post to. To post there, you need permission to create posts
on the Page. Then connect again." The §5.4 table row "saved | none_linked → `connected`" becomes
`facebook_no_page`, and every other row is unchanged. `satisfies` on `SOCIAL_POST_COPY.results` forces the copy.

**#4, kept (D37).** `choose` + the other provider declined or `none_linked` still reads `choose_account`. The
redirect carries one result, and picking an account is what the partner has to do now. The status row sits right
under the picker and shows the other provider as "Not connected" with Connect. Add a one-line comment above
`socialConnectResult` that says so, so a review doesn't raise it again.

**#5, fix.** Mark the old row on `none_linked` too, not only on `not_granted`.

- Rename `markDeclinedReconnectNeeded` → `markGoneReconnectNeeded(venueId, metaUserId, gone: { provider, reason }[])`.
  `gone` holds each provider whose outcome is `not_granted` (`declined at reconnect`) or `none_linked`
  (`no account at reconnect`). It's still one filtered update per reason group: venue + same `meta_user_id` +
  `status = active` + provider. At most 2 small updates per login; today it's 1.
- **Same Meta user only** (as now). A different Facebook user with no Instagram says nothing about another user's
  working token.
- It runs where `markDeclined` runs now: after the upsert, on `missing_permissions` and on `no_instagram`, and
  never on `error`. `saved` and `choose` need nothing: the upsert on `(venue_id, provider)` already replaces the
  old row.
- **Trap:** `fetchMetaPages` asks for `limit=100` and doesn't follow paging. A partner with over 100 Pages could
  read `none_linked` by mistake and get a wrong "Reconnect" on an old row. That's acceptable (Reconnect fixes it, and
  no Hightop partner has 100 Pages). Write it in the code comment, and don't add paging.

**Tests:** the §5.4 table again, with the new row; `none_linked` + an active row from the same Meta user →
`reconnect_needed` (`no account at reconnect`); from another Meta user → untouched; `saved` → no mark call; a
failing mark → logged, result unchanged.

**Standing rule (update the Phase 10 line in §9 when done):** add "a provider that is `not_granted` or
`none_linked` in a login marks that venue's active row from the same Meta user `reconnect_needed`".

**As built (Phase 15, 2026-11-04).** As written above, plus:
- The outcome → reason mapping is pure and tested on its own: `socialGoneConnections(outcomes)` and
  `SOCIAL_GONE_REASONS` in `lib/social/socialPublishRules.ts` (`SocialGoneConnection` type there too). The route's
  `markGone({ instagram, facebook })` passes it to `markGoneReconnectNeeded` and skips the DB entirely when nothing
  is gone (so a both-`saved` login sends no update, where Phase 10 sent an empty-list call that returned early).
- Log tags renamed with the function: `[SocialMeta] gone-marked-reconnect` / `gone-mark-failed` (were
  `declined-marked-reconnect` / `declined-mark-failed`). The "check once on Hightop's own account" note in §5.4
  now covers `none_linked` too: if an old token still posts after a reconnect that found nothing, remove the
  `markGone()` calls.
- The old test "one account: connects with the Page token" now expects `facebook_no_page` (its Pages are
  `ANALYZE`-only, so Facebook was always `none_linked`).

### 5.10 Phase 16 — Post now panel: ready to come back (review #7, #8)

`components/owner/social/SocialPostNowPanel.tsx`, `components/owner/social/ShareToSocialSheet.tsx` (the commented
mount point), `lib/promo/promoCopy.ts`, `tests/social-publish-contract.test.ts`,
`tests/components.share-to-social-sheet.test.ts`, the Phase 8 handoff checklist.

**#7. Make re-attaching truly one switch.** Nothing outside the panel should have to remember its wiring.

1. **The panel reads its own connect result.** `useSearchParams()` inside `SocialPostNowPanel`: shown only when
   `socialVenue === venueId`, as the dashboard used to do. Remove the `connectResult` prop. `DashboardBody` already
   sits inside the dashboard's Suspense boundary, so no new boundary is needed (check `next build`). Delete
   checklist step 2 from `docs/partner-social-promo-plan_PHASE_8_HANDOFF.md` §8, or mark it superseded.
2. **The panel owns its caption.** D34 took the Caption box off the sheet, because partners write their own after
   Share. Post now sends the post straight to Meta, so the partner needs somewhere to write one. **Recommended
   (D38, Andrew can change it):** a Caption box *inside* the Post now panel, for Post and Reel only (Stories have
   none). It starts with `promoCaption(...)` from `lib/promo/promoCaptions.ts` (kept for this) and is checked by
   `socialCaptionProblem`. Remove the `caption` prop. The sheet passes what it already has (template, `when`,
   venue name, shown prizes) for the default. With Post now off, the sheet stays caption-free (D34 holds).
3. **Contract test:** when `SOCIAL_POST_NOW_ON_SHEET` is true, the sheet must render `<SocialPostNowPanel`. It
   already checks that. Add: the panel file contains `useSearchParams` and `socialCaptionProblem`, and has no
   `connectResult` / `caption` props, so the wiring can't be dropped again.

**#8. `choose()` / `disconnect()` errors.** Add `catch { setNotice(COPY.results.error) }` to both, as
`send()` already does (:255), and keep the `finally { setBusy(false) }`. On a failed disconnect, also keep
`confirmDisconnect` open so the partner can try again.

**Tests:** panel unit tests (mock `fetch` rejecting) for choose and disconnect → the notice shows, and nothing is
unhandled; the caption default and edit; the connect result shows only for its venue. The panel isn't rendered
today, so test it directly, not through the sheet.

**As built (Phase 16, 2026-11-04).** As written above, plus:
- The panel takes `captionInput: PromoCaptionInput | null` (not a string) and builds the suggestion itself with
  `promoCaption`. A partner's edit is kept only while the suggestion it came from is unchanged (new game or prize tick
  restarts it). Stories: no box, and the post is sent with an empty caption. A caption `socialCaptionProblem` rejects
  shows its message and disables Post.
- `COPY.captionLabel` ("Caption") added to `SOCIAL_POST_COPY`.
- A failed `disconnect` (offline or server error) keeps the confirm open; `choose` shows `COPY.results.error`.
- The sheet's mount snippet is a comment in `ShareToSocialSheet.tsx` (a real `<SocialPostNowPanel` would trip the
  contract test while the flag is off). Template id is `template.game`.
- Tests: `tests/components.social-post-now-panel.test.ts` (6) and a contract test line.
- Not run: `next build` (the panel is not rendered anywhere, so the Suspense check applies only once it is mounted).

### 5.11 Phase 17 — Share sheet: only a saved handle goes on the picture (review #3; #2 pinned)

`components/owner/social/ShareToSocialSheet.tsx` (:176–190), `tests/components.share-to-social-sheet.test.ts`.

**#3, fix.** `const handle = handleOn ? savedHandle : null;`. The typed draft never reaches the picture, the Reel
or `renderKey` / `reelKey`. Once **Save** succeeds, `savedHandle` is set and the picture redraws once. So no
redraw while typing, a finished Reel isn't thrown away, and nothing unsaved is ever shared. That matches D33
("ticking shows a box + Save"). While the box is open and nothing is saved yet, the handle line is just missing
from the preview. No hint copy is needed (the Save button is right there).

**#2, no change (D36).** The ticks start as name **on**, handle **on when saved**, address off, whatever the
venue's players' "On shared pictures" setting says (D33). Add a comment at the tick state and a test that pins
it: a venue with `showName: false, showInstagram: false` still starts with Bar name and Instagram handle ticked.

**As built (Phase 17, 2026-11-04).** `handle = handleOn ? savedHandle : null`; comment at the tick state; sheet tests: unsaved handle never reaches `renderPromoPicture`, Save redraws exactly once, and a venue with `showName/showInstagram: false` still starts with both ticked. The "finished Reel kept while typing" case holds by construction (`reelKey` no longer contains the draft) and has no separate test.

**Tests:** typing a valid handle doesn't change the rendered input (spy on `renderPromoPicture`) and doesn't clear
a finished Reel. After Save, the picture shows the saved handle. Plus the #2 pin above. Run `npm run test`,
`npx tsc --noEmit`, `npm run lint`, and check at 350 px.

### 5.12 Phase 18 — Clean-ups: one read per publish, one choose route, one name (review #6, #9, #10)

Refactor only. No behaviour change, and every existing test passes unchanged except where noted.

- **#6.** `publishInstagramPost` / `publishFacebookPost` take the loaded `row` instead of `postId`, and stop calling
  `loadPost`. `publishSocialPost` loads once, checks `row.venue_id`, and passes it on. The provider checks
  (`existing.provider !== …`) stay as guards. That saves one `social_posts` read per Post now. Update the tests
  that call the provider functions directly.
- **#9.** One shared handler per verb, keeping the URLs, so the panel, the Phase 8 sealing test and Meta's App
  Review screencast script don't change: `lib/social/socialProviderRoutes.ts` (server-only) exports
  `chooseRoute(provider)` and `disconnectRoute(provider)`. The four route files become two lines each:
  `export const POST = chooseRoute("facebook")`. The per-provider bits (body key `instagramId` / `pageId`, the
  wording, the view: `connectionView` / `facebookConnectionView`, the log tag) live in one small spec
  `PROVIDER_ROUTE_SPECS`, worded from `SOCIAL_POST_COPY.providers`. Keep `maxDuration` and the guard in each
  file if the contract test reads them there (check `tests/social-publish-contract.test.ts` first). Don't add a
  dynamic `[provider]` segment: it would change the sealed route list.
- **#10.** `posts/route.ts:51` uses `SOCIAL_POST_COPY.providers[provider]`. Grep for other
  `=== "facebook" ? "Facebook" : "Instagram"` and replace those too.

**Tests:** `npm run test`, `npx tsc --noEmit`, `npm run lint`. Add a contract line: no file under
`app/api/owner/social/` contains a hard-coded `"Facebook" : "Instagram"` ternary.

**As built (Phase 18, 2026-11-04).** As written, plus: `publishInstagramPost` / `publishFacebookPost` are no longer
exported (only `publishSocialPost` calls them); the tests that called them directly now call `publishSocialPost`,
which loads the same connection. The four route files are `export const POST = chooseRoute("…")` /
`export const DELETE = disconnectRoute("…")`; no `maxDuration` was in them, so nothing moved. Every wording, status
code and log tag is unchanged (the per-provider bits — `bodyKey`, `item`, `pick`, `connectAgain`, `logTag`, `view` —
live in `PROVIDER_ROUTE_SPECS`). The sealing test now also accepts that one-line form and checks each shared handler
opens with `guardOwnerSocialVenue`; a new contract line bans the `"Facebook" : "Instagram"` ternary under
`app/api/owner/social/`. The player share sheet's `status.target === "instagram" ? …` (`components/social-share/
ShareActionsSheet.tsx`) is a different feature and was left alone.

### Third `/code-review` (2026-11-05): findings → Phases 19–21

`/code-review high` of Phases 14–16 and the Phase 18 refactor (uncommitted). Ten findings. #1–#3 were checked
against the code by hand (all real); #4–#10 were not double-checked by the review and must be confirmed by the
phase that takes them before changing anything.

| # | Finding | Verdict | Phase |
|---|---|---|---|
| 1 | The "one switch" mount snippet in the comment at `components/owner/social/ShareToSocialSheet.tsx:40` passes `format={format}` (the sheet's `PromoFormat`, which is `"story"` when `size === "reel"`, line 199) and an unconditional `musicId`; its `captionInput` uses `pictureVenueName` | **Real** (checked). Whoever turns Post now on copies it: a Reel MP4 is sent as a Story picture, and unticking "Bar name" drops the venue from the caption. | 19 |
| 2 | `cancelOpenPosts` (Disconnect and Meta's deauthorize/data-deletion) marks every open post `cancelled`, including an Instagram post whose `media_publish` was sent and a Facebook Reel whose finish was sent | **Real** (checked, `lib/social/socialConnections.ts:347`). Breaks the Phase 14 rule: a post that may be live ends with no "Not confirmed". A request mid-call is fenced out and its live post is recorded as cancelled. | 19 |
| 3 | An exception after the irreversible Graph call (e.g. `finish()`'s DB write) becomes 500 "Couldn't send the post", and the panel says "Couldn't post. Try again." | **Real** (checked, `app/api/owner/social/posts/[id]/publish/route.ts:44`). "Try again" makes a new row and a second live post. The row itself recovers (the poll resolves it), but the partner is told the opposite. | 19 |
| 4 | `socialConnectResult` returns `no_instagram` for Instagram `not_granted` + Facebook `none_linked` (and the mirror case), against its own doc comment | To confirm (`lib/social/socialPublishRules.ts:245`). The partner is told to switch to a professional account when they switched Instagram off. | 20 |
| 5 | `socialCaptionProblem` (Instagram's hashtag / @ limits and wording) also blocks the Facebook button and the server's create step for `provider: "facebook"` | To confirm (`SocialPostNowPanel.tsx:131`, `app/api/owner/social/posts/route.ts:44`). | 20 |
| 6 | The connect-result notice is read once from `?socialResult=`, the URL keeps it, so it shows again on every remount; a failed choose/disconnect notice stays after Cancel | To confirm (`SocialPostNowPanel.tsx:126,137`). | 20 |
| 7 | Phase 14's "sent" mark overloads `external_post_id` (two encodings) and `updated_at` (send time, kept only via `keepSentAt`) | **Design debt, not a bug today.** A dedicated `publish_sent_at` column is sturdier but needs a migration: open question D39 (§10). No phase. | — |
| 8 | After a choose, the route does one more `loadConnection` to build a view the panel ignores (it reloads the status GET anyway) | To confirm (`lib/social/socialProviderRoutes.ts:81`). One wasted read per pick. | 21 |
| 9 | The route re-writes the Meta id pattern (`socialConnections.ts` has `META_ID`, unexported); the panel's `remember()` hard-codes `.slice(0, 5)` instead of `SOCIAL_RECENT_POSTS` | To confirm. | 21 |
| 10 | `row.venue_id !== input.venueId` in `publishSocialPost` can't be true (`loadPost` filters by venue) | **Real** (added in Phase 18). The provider checks in the two provider steps stay as guards (§5.12). | 21 |

**Order:** 19 first. 20 after 19 (both touch `SocialPostNowPanel.tsx`). 21 last (same module and routes as 19). None
needs a migration, `supabase db push`, an env var, a cron or a `vercel.json` change. All on `after-app-review`.

### 5.13 Phase 19 — Nothing that may be live is hidden or posted twice (third review #1, #2, #3)

- **#1 (the snippet).** Fix the comment so it matches the panel's old mount (removed `InstagramPostPanel`):
  `format={isReel ? "reel" : format}`, `musicId={isReel ? musicId : null}`, and `captionInput.venueName: venueName`
  (the caption always names the bar; the "Bar name" tick is for the picture only). Better than a comment: export a
  tiny pure helper next to the sheet, e.g. `postNowProps({ isReel, format, musicId, venueName, … })`, unit-test it
  (Reel → `"reel"` + music, Post → `"post"` + no music, caption keeps the venue name with "Bar name" unticked), and
  make the comment say "render `<SocialPostNowPanel {...postNowProps(…)} />`". The panel stays unrendered.
- **#2 (Disconnect).** One predicate, used by Disconnect and the deauthorize path (`removeConnections` →
  `cancelOpenPosts`): a post **may be live** when `status === "publishing"` (a request holds it, maybe mid-call),
  or Instagram `publishSent` (`external_post_id === container_id`), or Facebook `finishSent`
  (`external_post_id !== null`, not final). Those end as `status: "failed", error: "unconfirmed"` (Recent posts
  says "Not confirmed" and the partner is told to check Instagram/Facebook); every other open post is `cancelled`
  as today. Both still lose the file and caption (privacy text). Do it as two fenced updates (or one read + two
  updates) on the same `connection_id` set; don't loop per post. Move `publishSent` / `finishSent` into one shared
  place both modules import (e.g. `lib/social/socialPublishRules.ts` over a minimal row shape) rather than copying
  them. A `publishing` row whose request then finishes is already fenced out; check it writes nothing over
  `unconfirmed` (existing `lostClaim` path) and add a test.
- **#3 (error after Meta took it).** The publish route's `catch` must not say "try again" when the post may have
  gone out. Answer 500 with `code: "unsure"` and the `postId`; the panel then treats it like `processing`: it polls
  that post (the poll resolves it: Instagram reads the container, a Facebook photo ends `unconfirmed`), keeps
  that provider's Post button disabled until the poll is final, and shows `COPY.processing(name)`, never
  `errors.failed`. Errors thrown **before** the claim (load, connection, upload check) still read "try again":
  have the provider step tell them apart (e.g. a typed `PublishThrewAfterClaim` error, or return
  `{ ok: true, post }` with the row as last read from the DB) and test both.

**Tests:** extend `tests/lib.social-publish.test.ts` — Disconnect after an unsure `media_publish` → `failed /
unconfirmed`, file gone; Disconnect of an unsent `uploading` post → `cancelled`; deauthorize (data deletion) the same;
a `publishing` post's late "published" write is fenced out; publish whose final DB write throws → route 500
`unsure`, and the next poll resolves it with `media_publish` sent once. Panel test: `unsure` → polling state, button
disabled, no "Try again". `npm run test`, `npx tsc --noEmit`, `npm run lint`.

**As built (Phase 19, 2026-11-05).** As written above, plus:
- **#1.** `components/owner/social/postNowProps.ts` (pure): `postNowProps(sheet: PostNowSheetState)`. The input names
  the sheet's format `pictureFormat` so the trap is visible at the call site, and takes `venueName` only (no picture
  name). The sheet's comment is now the one-line `<SocialPostNowPanel {...postNowProps({ … })} />`. Contract test: any
  `<SocialPostNowPanel` in the sheet must be exactly that form, and the comment must keep the snippet.
- **#2.** `publishSent`, `finishSent`, `socialPostMayBeLive` and the `SocialPostMarks` row shape are in
  `lib/social/socialPublishRules.ts`; `socialPosts.ts` imports them (its copies are gone; `finishSent` now also checks
  `provider === "facebook"`, and it is only called on Facebook rows). `cancelOpenPosts` became `endOpenPosts`
  (`socialConnections.ts`): one read of the open posts, then at most two updates by id. The cancel is fenced on
  `status in (scheduled, uploading, processing) and external_post_id is null`, so a post claimed or marked after the
  read is left to the request that holds it. The unconfirmed update is fenced on still-open, and also clears
  `claimed_at` and `external_post_id`. Files are deleted only for posts this actually ended. A failed read now
  throws (before, it was ignored and the cancel ran anyway): Disconnect says "Couldn't disconnect… try again", and
  the deauthorize callback answers 500, so Meta retries. Log: `[SocialConnections] ended-unconfirmed { count }`.
  Kept as specified: every `publishing` post counts as may-be-live, even an Instagram or Facebook Reel post that
  hasn't been marked yet (its next fenced write would fail, so it can't go live). That gives an over-cautious "Not
  confirmed", the safe direction, and it doesn't depend on every future Meta call having a mark.
- **#3.** `publishFromClaim` (`socialPosts.ts`) runs the claim and the provider's steps in one `try`. A throw
  answers `{ ok: false, code: "unsure", postId }` and logs `[SocialPost] publish-unsure`. **The claim is inside on
  purpose:** if the claim's answer is lost it may still have landed, and Recent posts would later take over the
  stale lease and publish it. The route answers 500 `SocialPublishUnsureResponse` (`lib/social/socialTypes.ts`).
  **Beyond the spec, found while building:** the panel also polls when the publish answer is lost on the phone's side
  (the fetch throws, or a body with no `error` comes back, e.g. Vercel's 504 at `maxDuration`). That's the same
  double-post risk, and more likely on bar Wi-Fi (`publishUnclear`). **"Still processing" (5 minutes with no answer)
  now keeps the Post button off for the same media**; before, it turned it back on. The panel counts an unsure post
  against today's limit, as the server does.
- Test fakes (`tests/lib.social-publish.test.ts`): `maybeSingle` now passes the error through (it used to swallow
  it, so no earlier test could fail a fenced write); added `.is()`, `dbHooks.onUpdate` (fail or race one update) and
  async `metaRoute` answers.

### 5.14 Phase 20 — The right message (third review #4, #5, #6)

Confirm each finding against the code first.

- **#4.** `socialConnectResult`: when neither provider is `saved`/`choose` and one was `not_granted`, name the
  decline. Add one result, e.g. `instagram_declined_no_page` / `facebook_declined_no_instagram`, or one shared
  `declined_nothing_connected` ("Nothing was connected. You switched off Instagram/Facebook…"), worded in
  `SOCIAL_POST_COPY.results` (which `satisfies Record<SocialConnectResult, string>`, so the compiler forces the
  copy). Keep `no_instagram` for `none_linked` + `none_linked`, and `missing_permissions` for both declined. Update
  the table in §5.4 and the doc comment; table-test every pair of outcomes (16 cases).
- **#5.** `socialCaptionProblem(caption, provider)`: the length limit (`SOCIAL_CAPTION_MAX_CHARS`) for both, since it is
  one box; hashtag and @ limits for Instagram only, with "Instagram allows…" wording. The panel works it out per
  provider (the Instagram button can be blocked while Facebook's isn't) and says which button the problem is for;
  the create route passes `provider`. Stories have no caption, as now.
- **#6.** After reading `?socialResult=` / `?socialVenue=`, drop those two params from the URL while keeping
  `sheet=social` (`window.history.replaceState`, which Next's `useSearchParams` follows; check the navigation plan's
  Standing rules in `docs/navigation-unification-plan.md` first: never `router.push` a sheet step). Cancel on the
  Disconnect confirm clears the notice.

**Tests:** rules table test (#4); caption tests per provider, route 400 for Instagram only (#5); panel tests: the
notice doesn't come back on remount, Cancel clears it (#6). `npm run test`, `npx tsc --noEmit`, `npm run lint`.
Wording is partner-facing: Prize/Reward and "fewest words" rules apply.

**As built (Phase 20, 2026-11-05).** All three findings confirmed in code, then fixed as written, with two results for #4
(each names the provider that was switched off) instead of one shared one.
- **#4.** `socialConnectResult` returns `instagram_declined_no_page` / `facebook_declined_no_instagram`; copy in
  `SOCIAL_POST_COPY.results`. `no_instagram` is now only none_linked + none_linked. The callback needed no change
  (`markGone` already keys off the outcomes). The 16-pair table test is updated.
- **#5.** `socialCaptionProblem(caption, provider)`: length for both, hashtag / @ for Instagram only. The panel builds
  `captionProblems` per provider (button and `postNow` guard use their own) and lists each distinct message once; the
  Instagram ones start "Instagram allows…". The create route passes `provider`.
- **#6.** `SocialPostNowPanel` strips `socialResult` / `socialVenue` with `history.replaceState(history.state, …)` in an
  effect (keeps `sheet=social` and the depth counter), and Cancel on the Disconnect confirm clears the notice.

### 5.15 Phase 21 — Clean-ups (third review #8, #9, #10)

Refactor only; the one change partners could notice is none.

- **#8.** `chooseRoute` answers `{ ok: true }` without the extra `loadConnection` (the panel already reloads the status
  GET). Drop `view` from `PROVIDER_ROUTE_SPECS` if nothing else uses it; check tests that read `body.connection`
  first. Optionally start `postsLeftToday` in `status/route.ts` together with the two connection reads (one fewer
  round trip; same reads).
- **#9.** Export `META_ID` (or move it to `socialPublishRules.ts`) and use it in `socialProviderRoutes.ts`; the panel's
  `remember()` uses `SOCIAL_RECENT_POSTS`.
- **#10.** Drop `row.venue_id !== input.venueId` from `publishSocialPost` (`loadPost` already scopes by venue; say so
  in the comment). Keep the provider guards in the two provider steps.

**Tests:** existing tests pass unchanged except any that read `body.connection` from choose. `npm run test`,
`npx tsc --noEmit`, `npm run lint`.

**As built (Phase 21, 2026-11-05).** #8 and #9 confirmed in code (#10 was already confirmed); all three done as written.
- **#8.** `chooseRoute` answers `{ ok: true }`; `view` is gone from `PROVIDER_ROUTE_SPECS` (nothing else used it), so the
  spec type lost its generic. No test read `body.connection` from choose. The panel's choose reads `readJson<object>`.
  The optional status change is done too: `postsLeftToday` runs alongside the two connection reads (same four reads).
- **#9.** `META_ID` moved to `lib/social/socialPublishRules.ts` (exported); `socialConnections.ts` and
  `socialProviderRoutes.ts` import it. The panel's `remember()` slices to `SOCIAL_RECENT_POSTS`.
- **#10.** `publishSocialPost` checks `!row` only; its comment says `loadPost` filters by `venue_id`. Provider guards in
  the two provider steps kept.

## 6. Music and sound effects from free libraries (D7)

**Allowed licences** (`license.licence` must be one of these; the contract test checks it):

- **CC0 / public domain** (e.g. Freesound filtered to CC0). Preferred: no conditions at all.
- **Pixabay Content License** (Pixabay music and sound effects): commercial use, no credit needed. It forbids
  redistributing the file *on its own*, and baking it into a video is fine. Our `/promo/sounds` preview files are a
  grey area. Keep them short (≤15 s) and only reachable from the tool, not listed for download.
- **Mixkit Free License** (music + sound effects): commercial use in videos, including social posts. Same
  "not standalone" condition.

**Not allowed:** anything needing credit (CC-BY; a credit line in every partner caption isn't workable), "personal
use only", NC/ND licences, or tracks with a vocal of a recognisable song.

**Keeping muted Reels rare.** Free music is sometimes registered with Content ID by someone else, and Instagram then
mutes or blocks the Reel:

1. Prefer tracks whose library page says "not registered with Content ID" or is CC0. Instrumental only.
2. Before a track goes in the registry, post a test Reel with it on Hightop's own Instagram, wait 48 h, and record
   `contentIdChecked` (date). The contract test requires the field.
3. Sound effects (cheering, whistles, buzzers, crowd "ooh") almost never get claimed. "No music" (sound effects
   only) is always offered.
4. If a partner reports a muted Reel, remove that track from the registry (new posts stop using it). It's one entry.

**Starter set (Phase 2):** 6 music tracks (upbeat game-night ×2, sports-anthem ×2, chill bar ×1, trivia/quiz-show
×1). About 10 sound effects: crowd cheer (big + small), applause, stadium horn, buzzer, correct-answer ding,
drumroll, applause, cash-register "ka-ching" (prizes), crowd "ooh". Andrew approves the final picks by ear.

## 7. Meta App Review checklist (Phase 4)

- [ ] Hightop's Meta Business account verified (legal name, address, documents).
- [ ] **A new Meta app for partners (D27, decided)** (keep the player app's App ID in `capacitor.config.json` separate, so a review
      problem can't touch player Stories sharing).
- [ ] Use cases: Instagram API with **Unified login** (Instagram Login is unavailable for new apps, see §6 note); Page management (Facebook Login for Business).
- [ ] Redirect URIs on the production domain, privacy policy URL, terms URL, data-deletion URL, app icon.
- [ ] A screencast for each permission (connect → create → post now → post later → result on Instagram/Facebook).
- [ ] A reviewer test login (test partner) + Hightop's own Instagram Business account and Facebook Page.

## 8. Cost estimate

Assumes 100 venues, each making 8 promos a month (half of them Reels) and keeping 2 weekly scheduled posts running,
and plausible growth to 1,000 venues.

| Item | Monthly @100 venues | @1,000 venues |
|---|---|---|
| Rendering (partner's browser) | $0 | $0 |
| Sound files (≈250 KB each, immutable, from `/public`) | negligible | negligible |
| Storage held (weekly-post files kept; ≈10 MB per Reel) | ≈2 GB | ≈20 GB |
| Storage egress (Meta fetches each post once; weekly ones every week) | ≈13 GB | ≈130 GB |
| Vercel functions (publish + ≤30 polls per Reel; as built, Phase 5) | ≈27k | ≈270k |
| Cron, every 15 min, one indexed read (limit 25) | 2,880 | 2,880 |
| Graph API | free | free |

All of this fits inside current Supabase/Vercel plans at 100 venues. At 1,000 venues, weekly Reels are the biggest
item (≈90 GB/mo of the egress). If that matters, the cheaper option is to re-post weekly as images, or as a Story.
After launch: compare actual invocations and egress with this table.

## 9. Proposed standing rules (move to a "Standing rules" section once built)

- **Coverage (D12):** every `SUPPORTED_OWNER_SCHEDULE_GAME_TYPES` entry and every `REWARD_DEFINITIONS` entry's game
  has a design in `lib/promo/promoTemplates.ts`. Pinned by `tests/promo-coverage-contract.test.ts`. Prizes are
  shown by the shared prize panel through `lib/prizeCardFace.ts`, so a new prize kind or menu item needs no design.
- **Game + prize together (D13):** a design never hard-codes a prize. Prizes come only through the prize panel,
  from `prizesForGame`.
- A new design = one entry in `lib/promo/promoTemplates.ts` plus its game theme in `lib/promo/promoThemes.ts`
  (`docs/game-themes-plan.md` Standing rules), including its Reel motion (`reel` in the theme). A new sound = one entry in `lib/promo/promoSounds.ts`
  with an allowed licence and a `contentIdChecked` date. New artwork or audio = a new file name.
- Social tokens are stored only encrypted via `lib/social/crypto.ts`; no route returns or logs one.
- Rendered media lives in the private `social-media` bucket only while a post needs it.
- Promos never contain player names, ids or photos. Only the venue, the game, the prize and our artwork.
- `CreateRewardWizard` is not forked; the end-of-flow screen lives in the owner host.
- **(Phase 5)** `lib/social/crypto.ts` is the only reader of `SOCIAL_TOKEN_KEY`; `lib/social/socialConnections.ts` is the
  only code that reads or writes `social_connections.access_token_enc`; `lib/social/metaConfig.ts` the only reader of
  `META_PARTNER_APP_SECRET`; `lib/social/flags.ts` the only reader of `NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED`. Every
  `/api/owner/social/**` route uses `guardOwnerSocialVenue` (or the flag + `requireOwnerAuth` for the two redirect
  routes). No log line passes a token or a signed URL. Pinned by `tests/social-publish-contract.test.ts`.
- **(Phase 5)** A post moves only by a conditional update on its current status (`lib/social/socialPosts.ts`), so a
  post creates at most one container and calls `media_publish` at most once. Never publish outside that module.
- **(Phase 5)** Login is Facebook Login for Business with a **User access token** configuration; never request
  `ads_*`, `business_management` or messaging permissions, and never store a system-user token.
- **(Phase 6)** A Facebook Page connection is its own `social_connections` row (`provider='facebook'`, `page_id` =
  `external_account_id` = the Page id), its token in its own AAD slot (`social:facebook:<venue>:page_token`). A Facebook
  **photo** is published by one call and is never retried after a request dies mid-publish (it is failed instead, so it
  can't post twice); a **Reel** is one video object whose id is saved before the upload, so it can't post twice either.
  The Reel upload sends the Page token only in the `Authorization` header, never a URL. Pinned by
  `tests/lib.social-publish.test.ts` ("Phase 6") and `tests/social-publish-contract.test.ts`. (Phase 9: such a
  photo is failed as `unconfirmed`, and a Reel's finish is sent at most once, marked by `external_post_id`.)
- **(Phase 9)** Every write made under a claim is fenced on `claimed_at` (`updateClaimed` in
  `lib/social/socialPosts.ts`; `moveIf` is the module's only `.update(`). A lost claim stops: no more Graph calls,
  the file is kept. The lease is renewed just before each call Meta can't undo (`media_publish`, the Facebook photo,
  the Reel finish). A call that may have gone through (`isUnsure`) after an id is saved never fails a post: the poll
  asks Meta. A Facebook Reel with a video id is failed only by Meta's own answer. Neither the Reel upload nor its
  finish is ever sent twice. `SOCIAL_PUBLISH_LEASE_MS` stays ≥ the claiming routes' `maxDuration` + 60 s, and each
  claiming route exports `maxDuration = 90`. Pinned by `tests/lib.social-publish.test.ts` ("Phase 9") and
  `tests/social-publish-contract.test.ts`.
- **(Phase 10)** The connect callback builds (and encrypts) every row before writing, then saves them in **one**
  upsert (`saveSocialConnections`), so "Couldn't connect" means nothing changed. Its result comes only from
  `socialConnectResult` (plan §5.4 table): a provider whose permissions were switched off is named
  (`instagram_declined` / `facebook_declined`), never read as "no account linked"; Instagram saved with no Page to
  post to is `facebook_no_page` (Phase 15). Every `SocialConnectResult` has copy in `SOCIAL_POST_COPY.results`
  (enforced by `satisfies`). (Phase 15) A provider that is `not_granted` or `none_linked` in a login marks that
  venue's active row from the same Meta user `reconnect_needed` (`markGoneReconnectNeeded`, after the save, best
  effort, never on an error); a row from another Meta user is never touched. Pinned by
  `tests/lib.social-publish.test.ts` ("callback result table", "ONE upsert", "encryption failure", "Phase 15").
- **(Phase 11)** One connection store: everything provider-specific about a connection lives in `PROVIDERS` in
  `lib/social/socialConnections.ts`; a third provider is one entry there, not a copied set of functions. The token
  AAD slots stay `social:<provider>:<venue>:page_token` / `user_token` (changing them strands every stored token).
  A pending choice id is Meta's numeric id on every provider. The first poll steps both providers share live only in
  `advanceCommon` (`lib/social/socialPosts.ts`); what follows stays per provider on purpose (Phase 9). Pinned by
  `tests/lib.social-publish.test.ts` ("Phase 11").
- **(Phase 14)** `media_publish` is sent at most once per post: the lease-renewing write before it sets
  `external_post_id = container_id` (`publishSent`), and a marked post is never published again, even by a request
  that claimed it after reading an older row (the check is on the claimed row). Only Meta's clear "not ready" clears
  the mark. `FINISHED` on a marked post waits `SOCIAL_INSTAGRAM_CONFIRM_MS` from `updated_at`, then `unconfirmed`;
  any other ending without Meta's answer (TTL, connection gone, status read refused) is `unconfirmed` too. The
  Facebook Reel finish has the same claimed-row check. Pinned by `tests/lib.social-publish.test.ts` ("Phase 14").
- **(Phase 19)** The "sent to Meta" marks are read only through `publishSent` / `finishSent` /
  `socialPostMayBeLive` (`lib/social/socialPublishRules.ts`). Posts are ended without Meta's answer (Disconnect,
  deauthorize, data deletion) only by `endOpenPosts`: a post that may be live ends `failed / unconfirmed`, any other
  open post `cancelled`. The cancel is fenced, so a post claimed or marked since the read is never cancelled, and
  there's never one write per post. A throw once a publish has tried its claim answers `unsure` (route 500,
  `code: "unsure"` + `postId`), never "try again". The panel then polls that post and keeps its Post button off until
  Meta answers, and does the same when the publish answer is lost. The sheet mounts the panel only as
  `<SocialPostNowPanel {...postNowProps(…)} />`. Pinned by `tests/lib.social-publish.test.ts` ("Phase 19"),
  `tests/components.social-post-now-panel.test.ts`, `tests/components.post-now-props.test.ts` and
  `tests/social-publish-contract.test.ts`.
- **(Phase 20)** Partner-facing connect results come from `socialConnectResult`; a switched-off provider is always
  named. `socialCaptionProblem` always takes the provider: Instagram's hashtag / @ limits never apply to Facebook.
  The `socialResult` / `socialVenue` params are removed from the URL by the panel once read (`replaceState`, never
  `router.push`).

## 10. Open questions for Andrew

- **D39 (third review #7, 2026-11-05):** add a `publish_sent_at` column to `social_posts` so "already sent to Meta" is
  its own field instead of two reused ones? Sturdier, but it is a migration (`supabase db push` waits for App
  Store approval and your OK). Claude's recommendation: not now; do it with Phase 7 (Post later + weekly), which
  adds new writes to these rows. Today's tests pin the current marks.

All earlier questions are answered (D13–D16). Phase 0 results will need Andrew's phone (§5, Phase 0).

- **D38 (Phase 16):** when Post now comes back, OK to put a Caption box (pre-filled, editable) inside the Post now
  panel only? The default is yes. Phase 16 can be built either way, since nothing is shown until Post now is on.
- **Phase 8 (§5.2):** sealed (2026-11-04; the default, since Andrew didn't pick). Open: when Andrew wants to record
  the Meta App Review screencast, Post now has to come back on a Preview first (checklist in the Phase 8 handoff).

## 11. Facts to verify when building

- Meta's current Reel spec (codec, length, size) and the Stories publishing rules.
- Safari/iOS `VideoEncoder` (`avc1`, 1080×1920) and `AudioEncoder` (`mp4a.40.2`) support (Phase 0).
- Mediabunny's API for adding encoded audio/video and for copying AAC packets.
- Where Pick 'Em / NFL Pick 'Em "this week" data comes from for the game designs.
- Pixabay / Mixkit licence wording at download time (record it in each sound's `license`).
- Vercel plan cron frequency limit.

# Share to social — partner posts and Reels that advertise games and prizes

**Status (2026-11-04):** **Phases 1–5 built** (Post + Story pictures, Reels with sound, the Share to social
sheet, the dashboard entry, the "Share to social →" link after a new game or prize, Meta's deauthorize /
data-deletion callbacks + privacy text, and **Instagram "Post now"** behind `NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED`;
uncommitted, not deployed, migration `20261104193338_social_publishing.sql` **applied 2026-11-04** with Andrew's OK).
Phase 5 needs Andrew before it can be tried: the Facebook Login for Business configuration + redirect URIs
(runbook §"Phase 5 setup"), applying the migration, and the flag on a Preview. Handoff:
`docs/partner-social-promo-plan_PHASE_5_HANDOFF.md` (earlier: `…_PHASE_4_HANDOFF.md` … `…_PHASE_0_HANDOFF.md`).
Next: Phase 6 (Facebook Page Post now) once Phase 5 is tried on Hightop's own Instagram.
Decisions D1–D31 (§2). Branch: `after-app-review`. Notes asking for a design for every new game/prize are
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
between, so the sheet shows, top to bottom: Game (list), Show the prize (checklist, only when the game has
prizes), Size (Post / Story), Preview (live), Caption (editable), Share / Download / Copy caption, then the
venue's "On shared pictures" panel (name / handle). It reads **no data of its own**: the dashboard's
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
| 6. Facebook Page Post now | Opus 5.5 | high | Same patterns as Phase 5, on a different API. |
| 7. Post later + weekly | Opus 5.5 | xhigh | A cron, retries, cancel-with-game, failure emails, and cost limits. Mistakes post at the wrong time or many times. |
| Any phase's final code review | Opus 5.5 | high | `/code-review high` before Andrew is asked to deploy. |

Each phase ends with `docs/partner-social-promo-plan_PHASE_<N>_HANDOFF.md`.

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
- A new design = one entry in `lib/promo/promoTemplates.ts`. A new sound = one entry in `lib/promo/promoSounds.ts`
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

## 10. Open questions for Andrew

All earlier questions are answered (D13–D16). Nothing is open right now. Phase 0 results will need Andrew's phone
(§5, Phase 0).

## 11. Facts to verify when building

- Meta's current Reel spec (codec, length, size) and the Stories publishing rules.
- Safari/iOS `VideoEncoder` (`avc1`, 1080×1920) and `AudioEncoder` (`mp4a.40.2`) support (Phase 0).
- Mediabunny's API for adding encoded audio/video and for copying AAC packets.
- Where Pick 'Em / NFL Pick 'Em "this week" data comes from for the game designs.
- Pixabay / Mixkit licence wording at download time (record it in each sound's `license`).
- Vercel plan cron frequency limit.

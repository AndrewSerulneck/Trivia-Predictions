# Group Games terminology — reviewed Phase 1 inventory

Reviewed **2026-10-24**, branch `main`, HEAD `bb5af579a2bf4a049f3dcca9cc8c5c6c4ea5112a`.
This freezes copy decisions for Phases 2–3; no application copy has changed in Phase 1.

## Terminology contract

**Group Games** is the umbrella for shared-room, simultaneous play: currently **Live Trivia** and
**Category Blitz**. It does not add multiplayer behavior, add sports games to the schedule picker,
or change continuous Category Blitz. Use title case for headings and feature names; ordinary prose
uses “group games.” Keep Live Trivia / Live Trivia Showdown and Category Blitz as individual names.

Dashboard lists become **Active Group Games** and **Active Prizes**. “Active” retains the exact
existing data selection: `splitSchedules(...).upcoming`, `splitCompetitions(...).active`, and three
rows before See all. The schedule sheet, including history/detail, is **Group Games**. Creation,
empty and accessible add labels use **Schedule a group game**; loading uses **Loading group games**.
Keep **Edit game**, **Schedule another game**, **Offer a prize**, **Create Prize**, **Offer another
prize**, **Loading prizes**, and other helpful action/status language.

Keep Live / LIVE / Live now / Go live when they describe timing, connection, sports or production
state. Keep identifiers, routes, channel names, CSS tokens, API/RPC/schema/analytics/preference
keys, user-authored titles, trivia JSON, stored notifications and sent emails. New templates change;
historical records do not. Keep `?sheet=schedule`, `?sheet=prizes` and permanent `?sheet=rewards`
alias. No schema, data, filtering, delivery or behavior change is needed.

## Required implementation decisions

Line numbers below describe the audited working tree and may move. The appendix records every
primary source-search match, including exclusions and comments.

| Phase | Path / location | Old wording | Decision and reason |
| --- | --- | --- | --- |
| 2 | `components/owner/dashboard/LiveGamesSection.tsx:47–55` | Live Games; Schedule a live game (add + empty); Loading live games | Active Group Games; Schedule a group game; Loading group games. Section title also supplies its region accessible name; addLabel supplies the + accessible name. |
| 2 | `components/owner/dashboard/RewardsSection.tsx:37` | Offer Prizes | Active Prizes. Keep the action/empty/add/loading copy. |
| 2 | `components/owner/dashboard/DashboardSectionCard.tsx:40` | `ht-h2 min-w-0 flex-1 truncate` | Remove truncation / allow wrapping using existing typography so the longer heading remains readable at 350/390 px. Keep the + button `shrink-0`, region semantics and click behavior. This is the shared heading, not a per-game special case. |
| 2 | `components/owner/schedule/ScheduleGameFlow.tsx:357–360` | Live Games; Schedule a live game | Group Games for all/history/detail; Schedule a group game for creation. Edit game remains. |
| 2 | `tests/owner-dashboard-contract.test.ts:73` | Schedule a live game assertion | Update to Schedule a group game. The manual assertion at line 157 belongs with Phase 3 manual copy. |
| 2 | `tests/app.owner-dashboard-one-round-trip.test.ts:108–109,152` | Live Games / Offer Prizes regions; Loading live games | Active Group Games / Active Prizes; Loading group games. Preserve request/seed/refetch assertions. |
| 2 | `tests/app.owner-dashboard-merch.test.ts:108` | Offer Prizes heading | Active Prizes (test readiness locator). |
| 2 | `tests/components.owner-sheet.test.ts:18,45,298` and `tests/__snapshots__/components.owner-sheet.test.ts.snap` (3 snapshots) | Schedule a live game sample title | Use Schedule a group game in fixture and assertions; regenerate only affected three snapshots. They are synthetic chrome fixtures, not historical release evidence. |
| 3 | `components/venue/VenueGamesPanel.tsx:220` | Live game in progress! (Category Blitz) | Group game in progress! Keep the separate LIVE timing badge and game names. |
| 3 | `lib/pushCategories.ts:72` | `PUSH_COPY.labels.games`: Live games starting | Group games starting. **The actual property is `labels.games`, not `settingsLabels.games` stated in the original plan.** Keep key `games` and preference/delivery logic. |
| 3 | `lib/partnerManual.ts:36–37,51` | Schedule Live Games; Schedule Live games like…; In addition to our live games… | Schedule Group Games; Schedule group games like…; In addition to our group games…. Keep shared-room definition and existing unrelated prose. |
| 3 | `lib/partnerManual.ts:77` | Tap Offer Prizes on your dashboard | Tap Active Prizes on your dashboard. Keep section heading Offer Prizes (line 76): teaches an action. |
| 3 | `lib/email/partnerEmailCopy.ts:61,74,177` | Schedule Live Games; When you schedule Live Games…; Schedule live games | Schedule Group Games in both tours; When you schedule group games…. Keep Offer Prizes teaching heading at line 65, game names, subscription is live, and all URLs. No new dashboard-locator wording required. |
| 3 | `app/info/page.tsx:170` | Schedule live community games (like pub trivia) | Schedule group games (like pub trivia). Newly found alternate wording; preserve the rest of this already-dirty page. |
| 3 | `CLAUDE.md:9,342`; `SYSTEM_CONTEXT.md:15,361` | self-serve live-game scheduling; gates on a live game; Schedule live games / future live games; Live-game scheduling | Use group-game scheduling / group game / Schedule group games / future group games / Group-game scheduling. Add glossary to Mental Model & Terminology and system context: umbrella, exact dashboard headings, game names retained, internals stable. Do not use this task to repair unrelated stale architecture statements. |
| 3 | `docs/partner-dashboard-app-redesign-device-checklist.md:24,29–30,88,139,171,174` | Tap Offer Prizes; Schedule a live game; Live Games and Offer Prizes; menu/sheet says Offer Prizes | Exact dashboard headings and Schedule a group game. Correct inaccurate menu/sheet instruction to open the dashboard's Active Prizes card; actual prize sheet title is Prizes / Offer a prize. Email Offer Prizes is a valid teaching action; retain that distinction in the checklist. |
| 3 | `docs/native-app-device-checklist.md:175` | Live games starting | Group games starting. This file already has unrelated dirty work; do not replace wholesale. Do not fix its unrelated switch-count statement in this rename. |
| 3 | `docs/join-merch-store-device-checklist.md:99` | Schedule a live game | Schedule a group game; preserve the existing look-only store check. |

## Comment-only follow-through

Update descriptions of the current umbrella/card/flow in the same phase as the related file,
without renaming code symbols or historical plan links:

- Phase 2: `ScheduleGameFlow.tsx:40`, `ScheduleStepScreens.tsx:31`,
  `ScheduleGameRow.tsx:7`, `lib/ownerScheduleDisplay.ts:4`,
  `tests/components.owner-schedule-flow.test.ts:16` → Group Games / Active Group Games as appropriate.
- Phase 3: `lib/ownerSchedule.ts:37,228`, `lib/ownerScheduleForm.ts:11`,
  `lib/ownerCompetitionTemplates.ts:9`, `lib/rewardDefinitions.ts:6,9,130,140`,
  `lib/rewards.ts:927`, `lib/hooks/useScheduleUpdatedBroadcast.ts:7` → group game(s), Group Games,
  or group-game schedule/channel *description*. Preserve actual channel strings and function names.
- Phase 3: `lib/push/gameReminders.ts:12`, `components/push/PushNotificationSettings.tsx:18`
  → Group games starting (comment mirrors label).
- Phase 3: `lib/ownerRewardFlow.ts:4` and `lib/ownerSheetParams.ts:25` → Prizes sheet;
  Active Prizes is the dashboard card, not the sheet. The latter file is already dirty.

## Explicit exclusions and inspected adjacent surfaces

| Surface / path | Existing wording / structure | Disposition and reason |
| --- | --- | --- |
| `components/admin/adminSectionMeta.ts`; `SchedulesSection.tsx`, `CategoryBlitzSection.tsx`, `ChallengesSection.tsx`, `GameSettingsSection.tsx` | Prizes & Events → Live Trivia Schedules / Category Blitz / Squares / Brackets; game-specific forms; Live session / No live session right now; Spread live / Standard live | Keep. No umbrella Live Games navigation exists. Admin mobile allowlist is **venue-manage and partner-billing only**; do not add Group Games navigation, change IDs/slugs/allowlist or import components into metadata. |
| `app/owner/dashboard/page.tsx`, `components/owner/menu/ownerMenuItems.ts` | Sections mount LiveGamesSection / RewardsSection; drawer has no Live Games or Offer Prizes row | No rendered copy change needed here. Preserve uncommitted partner-message feature and menu flags. |
| `components/owner/schedule/ScheduleStepScreens.tsx`, `ScheduleGameRow.tsx`, `lib/ownerScheduleForm.ts`, `lib/ownerScheduleDisplay.ts` | Game-specific picker names; What game? / When?; Edit game; Cancel this game? … if it's live; history and dynamic schedule titles | Keep rendered strings; timing state and user content, not umbrella labels. Comments handled above. |
| `components/owner/rewards/RewardsFlow.tsx` | Prizes / Offer a prize; Schedule Live Trivia link | Keep. Dashboard card changes to Active Prizes; sheet need not. |
| `app/trivia/live/page.tsx:1252,534` | Live game detected. You can join now.; live game state poll comment | Keep: detects an actually running Live Trivia session, not a game family. |
| `components/venue/VenueGamesPanel.tsx:185`, `GameIdentityPanel.tsx:545`, `GameChrome.tsx` | LIVE / Live / live dot | Keep timing badges. `VenueHubClient.tsx:1399`, `CategoryBlitzOnboardingOverlay.tsx:39`, skip-round route comment describe immediate gameplay, not umbrella; keep. |
| `lib/venueGameCards.ts`, player landing/tutorial/onboarding, `lib/socialShare/*`, `components/social-share/*` | Individual game labels/headlines, game IDs/frame paths | Keep. No obsolete umbrella match found in share copy/registry or player tutorial copy. |
| `components/venue-screen/*`, `lib/venueScreen.ts:86,97` | Live / Go live / already-live game takeover; live game wins over idle seasonal view | Keep running-session/connectivity state and priorities. No umbrella TV text found. |
| `lib/pushCategories.ts` welcomeBenefits.games, askBody, settingsOff; `lib/push/gameReminders.ts`, `lib/push/venueNews.ts` | Live Trivia about to start; Live Trivia starts soon; game-name schedule announcements | Keep truthful game-specific delivery promise. Changing a label must not promise Category Blitz reminders the server does not send. No email/push/message send for testing. |
| `app/info/page.tsx:201` | automated group games and offer prizes | Already correct prose; keep lower case. Other Live Trivia / live sports / live stats text and alt labels stay. |
| `app/support`, `app/rules`, `app/terms`, `app/privacy`, metadata, `app/coming-soon/page.tsx` | Game-specific Live Trivia, live stats, legal language | Keep; no obsolete umbrella found in legal/support copy. No policy edits. |
| `components/fantasy/PointsLedger.tsx:60`, `FantasyHome.tsx:1725,2579`; `lib/pickem.ts:215`; sports Bingo modules | No Live Games; Live Game; tracked live game; live game provider/odds/stat comments | Keep actual sporting events and state. |
| `lib/liveShowdownAdmin.ts:1024,1228,1356,1520` | live game engine / occurrence served | Keep engine/actual-session explanation; not product umbrella. |
| `lib/nflPickEm.ts:2277` | Group games by balldontlie's own week number | Keep verb “Group,” unrelated to feature name. |
| `tests/squares-engine.test.ts:263`, `tests/lib.sportsBingoOdds.mlb-player-props.test.ts:30,83` | live capture / live game odds fixtures | Keep sporting-event evidence and capture script name. |
| `tests/components.partner-manual-prizes.test.ts:9,11` | Offer Prizes teaching heading | Keep; heading remains and ordering assertion remains valid. |
| `docs/prize-gift-card-redesign-device-checklist.md:57` | manual section after Offer Prizes | Keep; action heading retained. |
| `docs/tv-display-physical-device-checklist.md:19,52` | live game phases / live game ends | Keep running-session lifecycle. |
| Both `design-system/*/project/README.md` copies and preview/CSS/UI kits | Join → Venue Hub → Game Landing → Live Game; live gameplay / live game surfaces | Keep stage/layout meaning: full gameplay versus landing, not the shared-room family. No umbrella heading found. Archived uploads/exports stay historical, including embedded HTML strings. |
| Historical plans, handoffs, release records, historical screenshots | Live Games / Offer Prizes describing former UI | Preserve. This plan/inventory deliberately quotes old copy; no blanket repository ban. |
| `data/live-trivia`, `data/trivia`, other canonical game data | Trivia content, sports questions, pool IDs | Excluded from rewrites; no data search/import needed. |

## Images, email previews and native submission audit

- Inspected references in `app/info/page.tsx` and all **eight** current `public/info/*.png`
  images visually (contact sheet `/tmp/group-games-assets.png`), plus the email's
  `public/brand/email/prize-card-v2.png`. Images show individual game screens / game-specific
  Live Trivia Showdown / sports LIVE status / gift card; **no obsolete umbrella wording** found.
  No asset regeneration, new cached filename or bandwidth change is needed.
- Welcome preview references only logo `htc-logo-v1-384.png`, prize card, and Instagram/Facebook
  icons; added-venue preview has no images. Logo/icons are branding, not umbrella screenshots.
  `npm run email:preview` succeeded; parsed generated HTML and verified headings and image alt/src
  locally with JSDOM. Welcome has Schedule Live Games, Offer Prizes, and schedule Live Games in
  its social paragraph; added-venue has Schedule live games. Change only classified copy.
- A local Chromium screenshot attempt failed before opening a page: macOS sandbox
  `bootstrap_check_in … MachPortRendezvousServer … Permission denied (1100)`. No email visual
  layout pass is claimed. Phase 3 should preview the revised HTML; Phase 4 retains responsive review.
- Read `docs/native-app-store-submission-pack.md` (including listing, review and screenshot sections):
  no old umbrella phrase. Lowercase live trivia in promo/keywords names the individual game; keep.
  Screenshots are **instructions to capture**, not supplied final store images. No external App Store /
  Play console was read or changed. No native binary change required. Recheck subsequently supplied
  store screenshots if they include renamed UI; do not publish listings under this task.
- Moved/untracked `design-system/project/public/info/New Folder With Items/` and its ZIP are source
  material, not `app/info`'s served paths. Preserve existing moves/deletions; do not extract/commit the
  ZIP or rewrite historical design screenshots for this rename.

## Baseline and production impact

### Phase 4 review follow-up — 2026-10-24

All reviewed wording remains consistent; final expanded old-word search still has **32 lines**,
all already classified exclusions. Actual Live Trivia, Category Blitz, Live now and sports/state
wording remain; identifiers/routes/filters and push delivery are unchanged. Admin metadata is
unchanged/component-free, and browser checks confirm both old owner-page redirects and the
permanent rewards alias. No shipped asset needed replacement.

Real Chromium review now covers **350/390/1280 px**, 60 distinct views across dashboard states,
schedule flow, admin, player/settings, manual and email previews. The longer Category Blitz status
introduced a text/art intersection at 350 and 1280 px; `pr-[5.5rem]` on that paragraph reserves
the existing artwork width. Glyph bounds now show zero intersections at all three widths.
No new typography/color token, gameplay logic or request was introduced.

Final scoped candidate passes **5,505 tests / 13 environment skips**, typecheck/lint and a
**218-page build**. Root gates had one unchanged randomized Bingo-test failure; its immediate
rerun and both candidate full runs pass. Email browser widths are unchanged from exact old-copy
baselines: welcome 370 px at 350; added-venue 560 px at 350/390. These existing layout limits and
unverified physical-device/email-client rendering are explicit exceptions, not rename fixes.
All application-screen documents fit their viewport; no captured page errors or external browser
requests. No production mutation, sending, paid generation, commit, push or deployment occurred.

Durable candidate patches, a 34-file hash manifest, exact validation and all baseline exceptions:
[release record](group-games-terminology-release-record-2026-10-24.md). Next-agent state and
publication boundaries: [Phase 4 handoff](group-games-terminology-plan_PHASE_4_HANDOFF.md).
Incremental operations/cost remain zero at current and 10× volume; no live usage comparison is
available before a separately requested release.

### Phase 3 implementation follow-up — 2026-10-24

All Phase 3 CHANGE rows and comment follow-through are implemented locally, including the
Phase 2 leftover comment in `tests/components.owner-schedule-flow.test.ts`. No new admin/TV/share
umbrella wording was found; their exclusions above still apply. Both email tour headings now use
the exact title case **Schedule Group Games**. `CLAUDE.md` and `SYSTEM_CONTEXT.md` contain the
glossary; `AGENTS.md` points to the current plan/handoff. The three maintained device checklists
use the new labels. Historical plans, handoffs, source-search ledger and artwork remain intact.

The expanded old-word search in the ledger above (omit its `group...` alternative) now returns
**32 lines**, all covered by the explicit exclusions: sports events/provider/capture evidence;
running gameplay/session/TV state; `liveShowdownAdmin` occurrence/engine comments; valid
offer-prizes prose and the retained Manual/email teaching heading (plus its two test references).
There is no obsolete umbrella UI label remaining in the searched source. Do not turn this into
a blanket ban on “live game” or “Offer Prizes.” Local search evidence is
`tmp/group-games-phase-3/remaining-matches.txt` (ignored; conclusions are recorded here).

Verification: **13 suites / 255 tests pass**, no failures/skips, 3.42 s. `npm run email:preview`
passes; JSDOM checks both generated HTML/text for Schedule Group Games, retained Live Trivia
and Category Blitz, no old umbrella wording/unfilled placeholders, dashboard links, and resolvable
local images with alt text. Welcome is 19,649 HTML bytes / 3,757 text bytes; added venue is
4,640 HTML bytes / 1,099 text bytes. No images were changed or sent. These are structural/content
previews, not a browser/email-client layout pass. Full gates and responsive rendering remain
Phase 4. Detailed state, scope and commands: [Phase 3 handoff](group-games-terminology-plan_PHASE_3_HANDOFF.md).

Focused command in the Phase 1 handoff passed **13 files / 255 tests / zero skips / zero failures**.
It includes the plan's 12 suites plus OwnerSheet's fixture/snapshot suite. Existing JSDOM
`Not implemented: Window's scrollTo() method` warnings did not fail tests. Email preview succeeded.
No full test/typecheck/lint/build was needed for this documentation-only phase; final gates remain
Phase 4. No production reads/writes, migration, backup, undo log, commit, push or deploy occurred.
Incremental operations at current and 10× traffic: **0 reads, writes, provider calls, jobs, retries or
fan-out per run/day/month**; only small text payload differences in later phases. No recurring cost.

## Primary source-search ledger

This is an exhaustive disposition of the **77** matching non-JSON/non-snapshot source lines in
`app`, `components`, `lib`, `tests`, using the expanded search below. The three snapshot matches
are classified above. Native source had zero matches. Line snippets are limited to 180 characters;
use the file/line and decision tables for full copy. `CHANGE` means later work, not a Phase 1 edit.

```sh
rg -n -i 'live[[:space:]‐‑–-]+(community[[:space:]]+)?games?|offer[[:space:]]+prizes|group[[:space:]‐‑–-]+games?' app components lib tests --glob '!*.json' --glob '!*.snap'
```

| Path:line | Disposition | Matched line (abbreviated) |
| --- | --- | --- |
| `app/api/category-blitz/sessions/[id]/skip-round/route.ts:10` | KEEP — exclusion above | * caller's identity. This lets a solo tester call it from the live gameplay |
| `app/info/page.tsx:170` | CHANGE | { icon: "📅", title: "Schedule around your business", body: "Schedule live community games (like pub trivia) whenever you need a boost. Target slow periods and turn them into your b |
| `app/info/page.tsx:201` | KEEP — correct prose | "Not at all. The platform is designed to be simple for both venue operators and guests. Once you subscribe, you're up and running instantly. You can schedule automated group games  |
| `app/trivia/live/page.tsx:1252` | KEEP — exclusion above | <p className="mt-2 text-sm font-semibold text-emerald-200">Live game detected. You can join now.</p> |
| `app/trivia/live/page.tsx:534` | KEEP — exclusion above | // When a game is active, poll every 1 second for live game state. |
| `components/fantasy/FantasyHome.tsx:1725` | KEEP — exclusion above | // Only process rows for the tracked live game or the user's roster players. |
| `components/fantasy/FantasyHome.tsx:2579` | KEEP — exclusion above | <p className="text-caption font-black uppercase tracking-[0.16em] text-[#fde68a]">Live Game</p> |
| `components/fantasy/PointsLedger.tsx:60` | KEEP — exclusion above | <p className="mt-3 text-xs text-ht-fg-muted">{isLive ? "Waiting for scoring activity..." : "No Live Games"}</p> |
| `components/owner/dashboard/LiveGamesSection.tsx:47` | CHANGE | title="Live Games" |
| `components/owner/dashboard/LiveGamesSection.tsx:48` | CHANGE | addLabel={ready && upcoming.length > 0 ? "Schedule a live game" : undefined} |
| `components/owner/dashboard/LiveGamesSection.tsx:51` | CHANGE | {load.status === "loading" ? <SectionSkeleton label="Loading live games" /> : null} |
| `components/owner/dashboard/LiveGamesSection.tsx:55` | CHANGE | title="Schedule a live game" |
| `components/owner/dashboard/RewardsSection.tsx:37` | CHANGE | title="Offer Prizes" |
| `components/owner/schedule/ScheduleGameFlow.tsx:357` | CHANGE | ? "Live Games" |
| `components/owner/schedule/ScheduleGameFlow.tsx:360` | CHANGE | : "Schedule a live game"; |
| `components/owner/schedule/ScheduleGameFlow.tsx:40` | CHANGE | // The Schedule Live Games sheet (docs/partner-dashboard-app-redesign-plan.md §4e): |
| `components/owner/schedule/ScheduleGameRow.tsx:7` | CHANGE | // Shared by the dashboard's Live Games card and the schedule sheet's upcoming / |
| `components/owner/schedule/ScheduleStepScreens.tsx:31` | CHANGE | // The screens inside the Schedule Live Games sheet (docs/partner-dashboard-app-redesign-plan.md §4e). |
| `components/push/PushNotificationSettings.tsx:18` | CHANGE | // switches (live games starting, prizes, results, news from your bars), or a Turn on button. App only, and only in a build |
| `components/venue-screen/TvGoLiveTakeover.tsx:10` | KEEP — exclusion above | * live game. Renders over the game content and removes itself. |
| `components/venue-screen/TvGoLiveTakeover.tsx:25` | KEEP — exclusion above | * into an already-live game never mounts it), and unmounts it itself via |
| `components/venue/CategoryBlitzOnboardingOverlay.tsx:39` | KEEP — exclusion above | * always the live game/waiting screen, never onboarding slides. |
| `components/venue/VenueGamesPanel.tsx:220` | CHANGE | Live game in progress! |
| `components/venue/VenueHubClient.tsx:1399` | KEEP — exclusion above | // hours (lib/gameOnboarding.ts), then land directly on the live game. |
| `lib/email/partnerEmailCopy.ts:177` | CHANGE | title: "Schedule live games", |
| `lib/email/partnerEmailCopy.ts:61` | CHANGE | title: "Schedule Live Games", |
| `lib/email/partnerEmailCopy.ts:65` | KEEP — teaching action | title: "Offer Prizes", |
| `lib/email/partnerEmailCopy.ts:74` | CHANGE | body: "When you schedule Live Games or offer Prizes, you're prompted to generate social media content to advertise the promotions you're offering. Share it on your social channels  |
| `lib/hooks/useScheduleUpdatedBroadcast.ts:7` | CHANGE | * Subscribes to a venue's live-game channel and calls \`onUpdate\` the instant |
| `lib/liveShowdownAdmin.ts:1024` | KEEP — exclusion above | // so edits land on the rows the live game engine actually serves — the engine reads |
| `lib/liveShowdownAdmin.ts:1228` | KEEP — exclusion above | // Operate on the occurrence the live game serves, not on NULL templates it ignores. |
| `lib/liveShowdownAdmin.ts:1356` | KEEP — exclusion above | // Operate on the occurrence the live game serves, not on NULL templates it ignores. |
| `lib/liveShowdownAdmin.ts:1520` | KEEP — exclusion above | // Replace the round in the occurrence the live game serves (NULL template only when |
| `lib/nflPickEm.ts:2277` | KEEP — exclusion above | // Group games by balldontlie's own week number. Do NOT recompute it via |
| `lib/ownerCompetitionTemplates.ts:9` | CHANGE | // The async games a competition can run over. Live games (Category Blitz / Live |
| `lib/ownerRewardFlow.ts:4` | CHANGE | // The Offer Prizes sheet's screens and request bodies (docs/partner-dashboard-app-redesign-plan.md |
| `lib/ownerSchedule.ts:228` | CHANGE | * live-game schedule in one place. Pass a specific gameType to scope to one |
| `lib/ownerSchedule.ts:37` | CHANGE | // today. As of Phase 4b BOTH live games are supported — Category Blitz and Live |
| `lib/ownerScheduleDisplay.ts:4` | CHANGE | // Display helpers for owner schedules, shared by the dashboard's Live Games |
| `lib/ownerScheduleForm.ts:11` | CHANGE | // The Schedule Live Games flow's logic (docs/partner-dashboard-app-redesign-plan.md §4e), |
| `lib/ownerSheetParams.ts:25` | CHANGE | // "prizes" = Offer Prizes, the sheet once called "rewards" (docs/rewards-to-prizes-rename-plan.md Phase 3). |
| `lib/partnerManual.ts:36` | CHANGE | heading: "Schedule Live Games", |
| `lib/partnerManual.ts:37` | CHANGE | body: "Schedule Live games like Live Trivia and Category Blitz using the Partner Dashboard. These are games that the whole room plays together at the same time. They are designed t |
| `lib/partnerManual.ts:51` | CHANGE | body: "In addition to our live games, we also offer the following: ", |
| `lib/partnerManual.ts:76` | KEEP — teaching action / correct prose | heading: "Offer Prizes", |
| `lib/partnerManual.ts:77` | CHANGE | body: "Incentivize guests to visit by offering prizes for playing games and winning points. Using our platform, partners can offer coupons or discounts to guests who perform well i |
| `lib/partnerManual.ts:99` | KEEP — teaching action / correct prose | body: "A Hightop Challenge subscription includes the ability to display group games like Live Trivia and Category Blitz on your TV screens so people who aren't playing on their pho |
| `lib/pickem.ts:215` | KEEP — exclusion above | // Live game clock fields (NBA) |
| `lib/push/gameReminders.ts:12` | CHANGE | // Who hears it: phones whose last-used venue is the game's venue, with "Live games starting" on, seen in |
| `lib/pushCategories.ts:72` | CHANGE | games: "Live games starting", |
| `lib/rewardDefinitions.ts:130` | CHANGE | * The scheduled live game a venue must already run for this reward to be |
| `lib/rewardDefinitions.ts:140` | CHANGE | * live game that produces a per-occurrence winner (see |
| `lib/rewardDefinitions.ts:6` | CHANGE | // live game (if any) gates its creation. |
| `lib/rewardDefinitions.ts:9` | CHANGE | // only if it gates on a live game that isn't already handled). See |
| `lib/rewards.ts:927` | CHANGE | * live game. Blocks (empty allowedCadences + scheduled=false) when the game isn't |
| `lib/sportsBingo.ts:10778` | KEEP — exclusion above | * miss only once the game is over (a walk of a live game has not seen the rest of it yet), and |
| `lib/sportsBingo.ts:1198` | KEEP — exclusion above | // Season status needs a much longer horizon than the live game catalog (games can appear |
| `lib/sportsBingoMlbStars.ts:66` | KEEP — exclusion above | * The books post ~28 prop types on a live game, but the other 20 are combos and derivatives Prop |
| `lib/sportsBingoOdds.ts:1047` | KEEP — exclusion above | // two phases. A live game returns 700-1,600 prop rows across six sportsbooks, so this is a |
| `lib/sportsBingoOdds.ts:1062` | KEEP — exclusion above | * \`hits_runs_rbis\`, \`singles\`, \`first_home_run\`, ~28 prop types on a live game) — those are dropped |
| `lib/venueScreen.ts:86` | KEEP — exclusion above | // Super Bowl Squares (Phase 5): replaces the idle attract screen only — a live game still wins. |
| `lib/venueScreen.ts:97` | KEEP — exclusion above | // March Madness (Phase 9b): replaces the idle attract screen only — a live game still wins. |
| `tests/app.owner-dashboard-merch.test.ts:108` | CHANGE | await screen.findByRole("heading", { name: "Offer Prizes" }); |
| `tests/app.owner-dashboard-one-round-trip.test.ts:108` | CHANGE | expect(screen.getByRole("region", { name: "Live Games" })).toBeTruthy(); |
| `tests/app.owner-dashboard-one-round-trip.test.ts:109` | CHANGE | expect(screen.getByRole("region", { name: "Offer Prizes" })).toBeTruthy(); |
| `tests/app.owner-dashboard-one-round-trip.test.ts:152` | CHANGE | expect(screen.queryByRole("status", { name: "Loading live games" })).toBeNull(); |
| `tests/components.owner-schedule-flow.test.ts:16` | CHANGE | // docs/partner-dashboard-app-redesign-plan.md Phase 4: the Schedule Live Games |
| `tests/components.owner-sheet.test.ts:18` | CHANGE | ({ open: true, onRequestClose: () => {}, title: "Schedule a live game", ...overrides }) as SheetProps; |
| `tests/components.owner-sheet.test.ts:298` | CHANGE | expect(screen.getByRole("heading", { name: "Schedule a live game" }).className).toContain("!text-slate-900"); |
| `tests/components.owner-sheet.test.ts:45` | CHANGE | expect(screen.getByRole("dialog", { name: "Schedule a live game" })).toBe(panel); |
| `tests/components.partner-manual-prizes.test.ts:11` | KEEP — exclusion above | expect(headings.indexOf("Where Guests Find Their Prizes")).toBe(headings.indexOf("Offer Prizes") + 1); |
| `tests/components.partner-manual-prizes.test.ts:9` | KEEP — exclusion above | it("has the section, placed after Offer Prizes, with the live sample card figure", () => { |
| `tests/lib.sportsBingoOdds.mlb-player-props.test.ts:30` | KEEP — exclusion above | /** A row in the shape \`/mlb/v1/odds/player_props\` really returns — captured from a live game. */ |
| `tests/lib.sportsBingoOdds.mlb-player-props.test.ts:83` | KEEP — exclusion above | // All of these are posted on a live game (measured 2026-08-17) and all are combos or |
| `tests/owner-dashboard-contract.test.ts:157` | CHANGE | expect(manual).toContain("Tap Offer Prizes on your dashboard"); |
| `tests/owner-dashboard-contract.test.ts:73` | CHANGE | expect(live).toContain("Schedule a live game"); |
| `tests/squares-engine.test.ts:263` | KEEP — exclusion above | // Phase 0's live capture (scripts/capture-nfl-live-game.cjs) — present once a game has been |

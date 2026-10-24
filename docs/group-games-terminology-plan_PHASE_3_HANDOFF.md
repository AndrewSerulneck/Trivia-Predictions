# Group Games terminology — Phase 3 handoff

## For Andrew

The remaining player, notification-settings, Partner Manual, email and marketing wording now
uses Group Games in local code. The manual points to Active Prizes. Living project rules and
three phone checklists use the new terminology. All 255 focused tests pass; both email HTML/text
previews generate and pass structural/content checks. Nothing was committed, pushed or deployed.
Phase 4 still needs full regression gates and rendered responsive review. No answer is needed
from you to begin that review.

## To the next agent

### 1. Next phase: goal and scope

Execute **Phase 4** of `docs/group-games-terminology-plan.md` when requested. Recommendation:
**GPT-6.1 Sol (`gpt-6.1-sol`), High effort**. Review all three implementation phases together,
run final tests/typecheck/lint/build once, perform local/stubbed responsive checks at
350/390/1280 px, confirm semantic exclusions and deep-link compatibility, and prepare a scoped
release candidate. Read `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `AGENTS.md`, the plan and
`docs/group-games-terminology-inventory.md` first.

Publication is separate: this Phase 3 request authorizes no push, merge, deploy or external store
listing update. No database operations, paid AI generation, real scheduling/prize creation,
message/email/push sending, native binary changes, historical content rewrites or behavioral
changes belong to this rename. Local dev shares production data: use fixtures/stubs for review.

### 2. Starting branch, publication and data state

Recorded **2026-10-24, America/New_York**. Branch **main**, HEAD
**`bb5af579a2bf4a049f3dcca9cc8c5c6c4ea5112a`**, unchanged throughout Phase 3.
No staging, commit, push, merge, deployment or remote deployment inspection occurred. Phases
1–3 remain local/uncommitted; the plan, inventory and handoffs are untracked. No production
reads/writes, migration, backup or data undo log was needed or performed. No secrets were read;
no dependencies/assets were installed/generated. The email preview generator reads sample data
only and sends nothing. Rollback is code-only, preserving unrelated local edits.

Phase 3 entry snapshots for the 22 initially edited paths are saved locally in ignored
`tmp/group-games-phase-3/before.json`; the corresponding entry-relative diff is
`tmp/group-games-phase-3/scoped-entry.diff`. The snapshot includes pre-existing changes to
`CLAUDE.md`, `app/info/page.tsx`, `lib/ownerSheetParams.ts`,
`docs/native-app-device-checklist.md`, and the Phase 2 change in
`tests/owner-dashboard-contract.test.ts`. Do not restore those files from HEAD wholesale.
AGENTS.md and SYSTEM_CONTEXT.md were clean at Phase 3 entry; their current diffs belong to
Phase 3. The snapshot predates the plan/inventory/AGENTS additions made later in this phase;
the file descriptions below cover those changes. These ignored helpers are optional review
conveniences; this handoff and the inventory contain the durable conclusions.

The complete dirty/untracked entry status is included at the end of this note. Preserve all
pre-existing work, particularly partner messaging, POS plans, native/store work, info-page
changes, moved design assets and `data/live-trivia/categories/sports.v1.json`. Never stage,
commit or deploy this root wholesale. No staging or release permission was requested.

### 3. Decisions already made — do not re-ask

- Group Games means shared-room simultaneous games: Live Trivia and Category Blitz. Keep
  both game names, including Live Trivia Showdown; do not invent Group Trivia.
- Dashboard headings are exactly Active Group Games / Active Prizes. Keep the existing
  upcoming-schedules / active-prizes filters and three-row limits. No in-progress-only filter.
- Schedule list/history/detail says Group Games; creation says Schedule a group game.
  Keep Edit game, Schedule another game, Offer a prize and Create Prize actions.
- Prizes is the list sheet; Offer a prize is its creation title. The dashboard card is Active
  Prizes. The manual's Offer Prizes heading and email's Offer Prizes tour title teach actions
  and remain valid; the manual's locator now says Tap Active Prizes on your dashboard.
- Push label is `PUSH_COPY.labels.games` = Group games starting. Category key `games`, stored
  preferences, audiences, caps, hooks, schedules and delivery stay unchanged. Welcome/permission
  copy still promises the specific Live Trivia reminders the sender actually supports; never
  broaden the delivery promise to Category Blitz because the umbrella label changed.
- Keep internal `LiveGamesSection`, `liveShowdown*`, schema/RPC/channel/analytics names and routes.
  Keep `/owner/schedule`, `?sheet=schedule`, `?sheet=prizes`, permanent `?sheet=rewards` alias.
- Admin already has meaningful Live Trivia Schedules / Category Blitz under Prizes & Events;
  no new group or metadata imports. TV, share, legal/support, game tutorials and current store
  submission copy had no obsolete umbrella label. Timing/sports status words stay.
- No shipped image contained the old umbrella text in Phase 1's audit. No asset replacement
  required. Historical documents, sent/stored content, trivia JSON and user-authored names stay.
- No new test solely mirroring string literals and no blanket terminology scan were added.
  Existing dashboard/manual assertion was updated. Existing focused tests are the regression gate.

### 4. Phase 3 changes and their relationships

Rendered/template copy:

- `components/venue/VenueGamesPanel.tsx`: Category Blitz card says Group game in progress!;
  adjacent LIVE badge and gameplay behavior unchanged.
- `lib/pushCategories.ts`: `PUSH_COPY.labels.games` only, consumed by the existing settings
  component; all other copy/preferences/delivery unchanged.
- `lib/partnerManual.ts`: Schedule Group Games heading, two group-games prose references,
  and exact Tap Active Prizes on your dashboard locator. Retain Offer Prizes teaching heading.
- `lib/email/partnerEmailCopy.ts`: both welcome/added-venue tour titles Schedule Group Games;
  welcome social paragraph says schedule group games. Email builders, HTML structure, links,
  placeholders, subjects and imagery unchanged.
- `app/info/page.tsx`: ONLY Schedule live community games (like pub trivia) → Schedule group
  games (like pub trivia), in the Schedule around your business benefit. Preserve all other
  pre-existing diff in this file.

Comment-only alignment, no symbols/logic/string keys changed:

- `lib/ownerSchedule.ts`: supported game types and merged schedule description.
- `lib/ownerScheduleForm.ts`: Group Games flow description.
- `lib/ownerCompetitionTemplates.ts`: Group games vs async competition explanation.
- `lib/rewardDefinitions.ts`: four comments describing scheduled group-game gates/winners.
- `lib/rewards.ts`: `resolveRewardCreationContext` comment only.
- `lib/hooks/useScheduleUpdatedBroadcast.ts`: group-game channel description; actual channel stable.
- `lib/push/gameReminders.ts`, `components/push/PushNotificationSettings.tsx`: comments mirror label.
- `lib/ownerRewardFlow.ts`, `lib/ownerSheetParams.ts`: Prizes sheet comment; preserve existing
  uncommitted `messages` ID/comment in ownerSheetParams.
- `tests/components.owner-schedule-flow.test.ts`: leftover Phase 2 flow-description comment.

Tests/docs:

- `tests/owner-dashboard-contract.test.ts`: manual-navigation assertion now expects Tap Active
  Prizes on your dashboard. Preserve earlier Phase 2 Schedule a group game assertion.
- `CLAUDE.md`: glossary under Mental Model & Terminology; strategic scheduling/gate descriptions.
  Existing unrelated partner-message content preserved.
- `SYSTEM_CONTEXT.md`: glossary in §0; strategic/architecture umbrella wording updated. Unrelated
  stale architecture statements (including admin-only scheduling) intentionally not repaired.
- `AGENTS.md`: local Phase 3 status and handoff pointer, with glossary boundary reminder.
- `docs/partner-dashboard-app-redesign-device-checklist.md`: new schedule/dashboard/manual labels;
  fixes inaccurate Offer Prizes menu instructions to the Active Prizes dashboard card; distinguishes
  the valid email teaching action. Other stale reward/navigation instructions are outside scope.
- `docs/native-app-device-checklist.md`: notification label only. Existing unrelated dirty work
  preserved; old switch-count statement intentionally not fixed under this rename.
- `docs/join-merch-store-device-checklist.md`: Schedule a group game label only.
- `docs/group-games-terminology-inventory.md`: dated Phase 3 follow-up documenting completion,
  remaining 32 excluded matches, verification and email sizes; original audit ledger preserved.
- `docs/group-games-terminology-plan.md`: Phase 3 completion, validation limits and handoff link.
- This handoff is `docs/group-games-terminology-plan_PHASE_3_HANDOFF.md`.

### 5. Facts, traps and remaining exclusions

The expanded old-word search returns **32 matching source lines**, all valid exclusions, saved
in ignored `tmp/group-games-phase-3/remaining-matches.txt`. They are covered in the inventory:
actual sports/provider/capture evidence; active gameplay/TV/engine occurrence descriptions;
retained offer-prizes teaching/action prose and its Manual tests. No obsolete umbrella UI match
remains. Native source has none. Do not ban all occurrences of Live Game / Offer Prizes.

Phase 1 and Phase 2 Chromium launches failed before navigation on macOS sandbox
`bootstrap_check_in … MachPortRendezvousServer … Permission denied (1100)`.
Phase 3 did not repeat that known-failing launch, seek escalation, or claim screenshots. No
automatic-approval rejection occurred. Responsive rendering and actual email-client layout are
still **unverified**. Phase 4 needs a browser-capable environment or approved local launch, with
safe fixtures; do not mark source inspection/JSDOM as a visual pass.

`git diff --check` reports **app/info/page.tsx:743 trailing whitespace**. Confirmed the exact
whitespace line already exists in the Phase 3 entry snapshot; left untouched. Added lines in
Phase 3's entry-relative diff have no trailing whitespace. Do not silently claim root diff-check
is clean. The root contains substantial unrelated work, so review by hunk when preparing release.

No asset regeneration, requests, timers, subscriptions, preference migrations or hooks were
added. Cost impact at current and 10× traffic is **0 additional DB reads/writes, provider calls,
jobs, retries or fan-out per load/run/day/month**. A few text bytes change; no image bandwidth
change. Request-count/seed tests pass. No release occurred, so no live usage comparison is available.

### 6. Exact verification commands and results

Working directory: `/Users/andrewserulneck/Documents/Trivia-Predictions`.
Use installed Node/npm dependencies; do not read `.env.local` or run migrations/imports.

```sh
npx --no-install vitest run tests/owner-dashboard-contract.test.ts tests/app.owner-dashboard-one-round-trip.test.ts tests/app.owner-dashboard-merch.test.ts tests/components.owner-schedule-flow.test.ts tests/lib.owner-schedule-form.test.ts tests/lib.owner-schedule-display.test.ts tests/api.owner.schedule.test.ts tests/components.partner-manual-prizes.test.ts tests/lib.email.welcomeEmail.test.ts tests/lib.email.venueAddedEmail.test.ts tests/push-notifications-contract.test.ts tests/lib.push.test.ts tests/components.owner-sheet.test.ts
npm run email:preview
```

**13 suites / 255 tests passed, 0 failures/skips, duration 3.42 s.** Existing JSDOM
`Not implemented: Window's scrollTo() method` warnings are non-failing. Covers schedule behavior,
request/seed/retry/refetch contracts, merch/sheets, manual, email escaping and push behavior.

Preview outputs (ignored, generated with sample data only):

- `tmp/email-previews/welcome.html` — **19,649 bytes**;
  `tmp/email-previews/welcome.txt` — **3,757 bytes**.
- `tmp/email-previews/venue-added.html` — **4,640 bytes**;
  `tmp/email-previews/venue-added.txt` — **1,099 bytes**.

Local JSDOM inspection passes on both HTML/text outputs: Schedule Group Games present, no
live-game umbrella wording, Live Trivia / Category Blitz retained, no unfilled placeholders,
dashboard links retained, all four welcome images have alt text and resolve locally; added-venue
has no images. Welcome headings preserve Offer Prizes and Where guests find their prizes.
Added-venue tour is not h2/h3 markup; inspect text content rather than only heading selectors.
To repeat the structural preview check without network or sending:

```sh
node <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
for (const name of ['welcome', 'venue-added']) {
  const html = fs.readFileSync(`tmp/email-previews/${name}.html`, 'utf8');
  const text = fs.readFileSync(`tmp/email-previews/${name}.txt`, 'utf8');
  const doc = new JSDOM(html).window.document;
  for (const part of [doc.body.textContent, text]) {
    assert(part.includes('Schedule Group Games'));
    assert(!/live[ -]+games?/i.test(part));
    assert(part.includes('Live Trivia') && part.includes('Category Blitz'));
    assert(!/\{[A-Za-z]+\}/.test(part));
  }
  assert([...doc.querySelectorAll('a[href]')].some(a => a.href.endsWith('/owner/dashboard')));
  for (const img of doc.images) {
    assert(img.alt);
    assert(fs.existsSync(path.resolve('tmp/email-previews', img.getAttribute('src'))));
  }
  console.log(`${name}: passed`);
}
JS
rg -n -i 'live[[:space:]‐‑–-]+(community[[:space:]]+)?games?|offer[[:space:]]+prizes' app components lib tests native --glob '!*.json' --glob '!*.snap'
```

Full `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` remain for Phase 4;
not run or claimed here. Build font fetches may require network; use `npx next typegen` if generated
types are missing. No SQL tests needed for this wording change. No paid/live/message tests.

### 7. Open questions and permissions

No developer answer required for Phase 4 review. Browser-rendered 350/390/1280 px checks,
physical-device observation and email-client layout are not proven by this phase. Publication
requires its own authorization; do not infer it from a request to execute implementation/review.

### 8. Recommended first steps

1. Confirm branch/SHA/status and isolate the combined terminology diff from unrelated work.
   Use Phase 2 handoff for its exact application/test paths and the inventory for every exclusion.
2. Review strings/comments for preserved identifiers/routes/statuses and unchanged filtering;
   confirm admin metadata still has no component imports and deep-link aliases still work.
3. Run the four final gates, recording unrelated baseline failures separately. Root whitespace
   finding above is pre-existing; do not expand scope just to make root status look clean.
4. Perform local/stubbed rendered responsive and email review in a working browser. Do not create
   games/prizes or send notifications against production. Record any remaining environment limit.
5. Write `docs/group-games-terminology-plan_PHASE_4_HANDOFF.md`, update plan/context status, and
   report ready/not deployed unless separately authorized publication has been fully verified.

### Appendix — complete entry dirty/untracked status

Captured before Phase 3 edits, from `git status --short`. Everything here predates this phase.

```text
 M CLAUDE.md
 M app/api/admin/route.ts
 M app/info/page.tsx
 M app/owner/dashboard/page.tsx
 M components/admin/sections/VenuesSection.tsx
 M components/owner/dashboard/DashboardSectionCard.tsx
 M components/owner/dashboard/LiveGamesSection.tsx
 M components/owner/dashboard/RewardsSection.tsx
 M components/owner/menu/ownerMenuItems.ts
 M components/owner/schedule/ScheduleGameFlow.tsx
 M components/owner/schedule/ScheduleGameRow.tsx
 M components/owner/schedule/ScheduleStepScreens.tsx
 M components/ui/PopupAds.tsx
 M components/venue/VenueHubClient.tsx
 M data/live-trivia/categories/sports.v1.json
 D design-system/project/public/info/bingo-horizontal.png
 D design-system/project/public/info/bingo-vertical.png
 D design-system/project/public/info/fantasy.png
 D design-system/project/public/info/live-trivia-leaderboard.png
 D design-system/project/public/info/live-trivia-question.png
 D design-system/project/public/info/pick-em.png
 D design-system/project/public/info/speed-trivia.png
 M docs/native-app-device-checklist.md
 M docs/native-app-store-plan.md
 M docs/pos-rewards-integration-plan.md
 M docs/rewards-trust-and-pos-roadmap.md
 M lib/ownerScheduleDisplay.ts
 M lib/ownerSheetParams.ts
 M lib/pos/providers.ts
 M scripts/test-push-sql.cjs
 M tests/__snapshots__/components.owner-sheet.test.ts.snap
 M tests/app.owner-dashboard-merch.test.ts
 M tests/app.owner-dashboard-one-round-trip.test.ts
 M tests/components.owner-sheet.test.ts
 M tests/info-partner-login-contract.test.ts
 M tests/native-back-review-fixes.test.ts
 M tests/owner-dashboard-contract.test.ts
 M tests/owner-menu-contract.test.ts
?? .codex/
?? .firebaserc
?? .mcp.json
?? .vscode/mcp.json
?? app/api/owner/messages/
?? app/api/push/messages/
?? components/admin/sections/PartnerMessagesPanel.tsx
?? components/owner/messages/
?? components/push/PartnerMessageSheet.tsx
?? "design-system/project/public/info/New Folder With Items/"
?? docs/group-games-terminology-inventory.md
?? docs/group-games-terminology-plan.md
?? docs/group-games-terminology-plan_PHASE_0_HANDOFF.md
?? docs/group-games-terminology-plan_PHASE_1_HANDOFF.md
?? docs/group-games-terminology-plan_PHASE_2_HANDOFF.md
?? docs/native-app-store-plan_PHASE_5_5_HANDOFF.md
?? docs/native-app-store-plan_PHASE_6_HANDOFF.md
?? docs/native-app-store-submission-pack.md
?? docs/reel-video-assets-plan.md
?? firebase.json
?? lib/partnerMessageRules.ts
?? lib/push/venueMessages.ts
?? "native/ios/App/App/config 2.xml"
?? scripts/make-app-review-account.cjs
?? supabase/migrations/20261023145024_push_venue_messages.sql
?? tests/fixtures/squares/nfl-live-capture-1392309.json
?? tests/partner-messages.test.ts
```

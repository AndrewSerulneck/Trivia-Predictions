# Group Games terminology — Phase 1 handoff

## For Andrew

Phase 1 is complete: the terminology inventory now lists exactly what changes and what stays,
including accessibility labels, partner instructions, email/push wording, marketing and assets.
The baseline passes all 255 focused tests. No application wording or behavior changed, and nothing
was committed, pushed or deployed. Next is Phase 2: the Partner Dashboard and scheduling labels.
No answer is needed from you. Phases 2–4 remain; publication is separate.

## To the next agent

### 1. Next goal and exclusions

Execute **Phase 2 only** of `docs/group-games-terminology-plan.md` when asked. Recommendation:
**GPT-6.1 Sol (`gpt-6.1-sol`), Low reasoning effort**. First read repository rules (`AGENTS.md`,
`CLAUDE.md`, `SYSTEM_CONTEXT.md`), the plan and the new reviewed inventory:
`docs/group-games-terminology-inventory.md`.

Implement dashboard headings **Active Group Games** / **Active Prizes**, schedule sheet
**Group Games**, creation/add/empty **Schedule a group game**, and accessible loading
**Loading group games**. Update affected existing tests/fixtures and allow the longer dashboard
heading to wrap. Keep existing schedule/prize selection, three-row limit, click targets, + buttons,
request patterns, seed/retry behavior, routing/history and saved links. Phase 3 owns the wider
player/push/manual/email/marketing/living-doc changes; Phase 4 owns final review/release preparation.
Do not deploy Phase 2 alone. No database/production-data operation, sending, paid API call, native
binary, membership expansion or new navigation is part of any terminology phase.

### 2. Starting state, changes and publication

Recorded **2026-10-24**, branch **`main`**, HEAD
**`bb5af579a2bf4a049f3dcca9cc8c5c6c4ea5112a`**. HEAD did not change in Phase 1. There is no
Phase 1 commit. No push, merge, deployment, remote/deployment-state verification, production
read/write, migration, backup or data undo log occurred. All new plan documentation remains local
and untracked; no staging was performed. Existing uncommitted application work was preserved.

Phase 1 changed only:

- `docs/group-games-terminology-plan.md`: status/authorization scope, reviewed-inventory link,
  corrected actual push property name (`PUSH_COPY.labels.games`).
- `docs/group-games-terminology-inventory.md`: new frozen decisions, exact paths/lines, exclusions,
  asset/email/native audit, baseline evidence and an exhaustive 77-line source-search ledger.
- `docs/group-games-terminology-plan_PHASE_1_HANDOFF.md`: this handoff.

Generated **ignored local sample previews** with `npm run email:preview`:
`tmp/email-previews/welcome.html`, `welcome.txt`, `venue-added.html`, `venue-added.txt`.
These contain sample Pacific Street / Andrew data, not live data. Do not commit generated previews.
An inspection-only image contact sheet is `/tmp/group-games-assets.png`; its sources remain in
`public/info/` and `public/brand/email/prize-card-v2.png`. Temporary authoring helpers are
`/tmp/write-group-games-inventory.py` and `/tmp/write-group-games-handoff.py`; neither is an app
script or needed to build. No repo code or test file was edited in Phase 1.

The initial dirty/untracked snapshot below excludes only the new Phase 1 inventory/handoff.
The plan and Phase 0 handoff were already untracked at entry. Preserve all of this unrelated work;
never stage/deploy the entire root tree for the rename:

```text
 M CLAUDE.md
 M app/api/admin/route.ts
 M app/info/page.tsx
 M app/owner/dashboard/page.tsx
 M components/admin/sections/VenuesSection.tsx
 M components/owner/menu/ownerMenuItems.ts
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
 M lib/ownerSheetParams.ts
 M lib/pos/providers.ts
 M scripts/test-push-sql.cjs
 M tests/info-partner-login-contract.test.ts
 M tests/native-back-review-fixes.test.ts
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
?? docs/group-games-terminology-plan.md
?? docs/group-games-terminology-plan_PHASE_0_HANDOFF.md
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

### 3. Decisions already made

Andrew requested **Active Prizes**, **Active Group Games**, system-wide **Group Games**, and
model/effort recommendations. This turn authorizes executing Phase 1 and writing detailed handoffs;
it does not authorize implementation of later phases or publishing.

The plan's interpretation is now frozen in the inventory (implementation decisions, not additional
answers claimed from Andrew):

- Group Games is the shared-room/simultaneous umbrella, currently Live Trivia and Category Blitz.
  Keep individual game names; never invent Group Trivia.
- Active Group Games retains `splitSchedules(...).upcoming`, not an in-progress-only filter.
  Active Prizes retains `splitCompetitions(...).active`.
- Offer a prize / Create Prize are actions. The manual/email heading **Offer Prizes stays** because
  it teaches an action. A literal instruction to tap the dashboard card changes to Active Prizes.
- Schedule all/history/detail title becomes Group Games; edit stays Edit game. Prize sheet's
  **actual** current titles are **Prizes** and **Offer a prize** (`RewardsFlow.tsx:258`); it does not
  become Active Prizes. Dashboard and sheet titles have different roles.
- Keep `LiveGamesSection`, `liveShowdown*`, `live_trivia`, channel/schema/API/analytics/CSS names,
  push category `games`, URL `schedule` / `prizes`, and permanent `rewards` compatibility alias.
- Timing/live-sports/connectivity/production-state wording stays. Existing user-authored titles,
  stored messages/notifications, sent emails, historical plans/handoffs/screenshots and trivia JSON
  stay unchanged. Update new templates and living checklists only.
- No new Group Games admin group or player navigation. Admin desktop has Prizes & Events with
  meaningful game-specific sections; mobile allowlist has only venue-manage / partner-billing.

No open product conflict was found and no developer question is pending.

### 4. Files/functions and how they fit

Phase 2:

- `components/owner/dashboard/LiveGamesSection.tsx`: `LiveGamesSection`, `DASHBOARD_LIST_LIMIT = 3`;
  `splitSchedules(...).upcoming`; title also gives the section region its accessible name.
- `components/owner/dashboard/RewardsSection.tsx`: `RewardsSection`,
  `splitCompetitions(...).active`; change only dashboard heading.
- `components/owner/dashboard/DashboardSectionCard.tsx:40`: shared `<h2>` currently uses
  **`truncate`**. Allow wrapping and keep the + button `shrink-0`; use existing tokens/typography.
- `components/owner/schedule/ScheduleGameFlow.tsx:357–360`: title expression; comments in
  `ScheduleStepScreens.tsx`, `ScheduleGameRow.tsx`, `lib/ownerScheduleDisplay.ts` also name old concept.
- `tests/owner-dashboard-contract.test.ts:73`, `tests/app.owner-dashboard-one-round-trip.test.ts`,
  `tests/app.owner-dashboard-merch.test.ts`: copy/accessibility/readiness assertions.
- `tests/components.owner-sheet.test.ts:18,45,298` + three snapshots in
  `tests/__snapshots__/components.owner-sheet.test.ts.snap`: synthetic Schedule a live game sample
  title; change to Schedule a group game. This suite was missing from the original plan commands
  and was added to the baseline. Preserve all structural snapshot markup.

Phase 3 highlights (use full inventory, not only this shortlist):

- `lib/partnerManual.ts`: three umbrella phrases and Tap Active Prizes instruction; its teaching
  Offer Prizes heading stays. Update corresponding assertion in owner-dashboard-contract test
  with manual change, not prematurely in Phase 2.
- `lib/email/partnerEmailCopy.ts`: both welcome/added-venue schedule headings and welcome social
  paragraph. Builders `welcomeEmail.ts` / `venueAddedEmail.ts` lay out this shared source.
- `lib/pushCategories.ts:72`: **`PUSH_COPY.labels.games`**, not `settingsLabels.games`.
- `components/venue/VenueGamesPanel.tsx:220`: Category Blitz → Group game in progress!
- `app/info/page.tsx:170`: alternate “Schedule live community games” → “Schedule group games”.
  Line 201 already has correct lowercase group games. This file has unrelated edits: preserve them.
- `CLAUDE.md`, `SYSTEM_CONTEXT.md`: add glossary and update current umbrella prose only.
- Living checklists: partner dashboard, native app, join merch. Keep manual Offer Prizes section
  references and TV's running-game checks. Checklist menu/sheet instructions are partly stale:
  use the actual Active Prizes dashboard card instead of inventing an Offer Prizes menu item.

### 5. Findings and traps

- Expanded source search found **77 lines** (app/components/lib/tests excluding JSON/snapshots),
  plus **3 snapshot matches**; these include kept sport/status/comments and correct prose.
  Inventory appendix assigns each source hit CHANGE or KEEP. Native source search had no matches.
  Broader scans checked alternate “live community games”, hyphenation, Live/LIVE labels, ARIA,
  marketing/legal/support/share/TV, current checklists and both design-system copies.
- Do not globally replace live. `app/trivia/live/page.tsx:1252` “Live game detected. You can join
  now.” describes a running individual Live Trivia session and stays; Fantasy No Live Games / Live
  Game describe sports and stay; `lib/nflPickEm.ts` “Group games by … week number” is a verb.
- Push welcome/permission copy promises **Live Trivia** reminders specifically. Keep it: renaming
  a category label must not add a Category Blitz delivery promise or change audience/timing/caps.
- No obsolete umbrella phrase appeared in the eight served `public/info/*.png` game screenshots,
  the email gift-card picture, or submission-pack copy. No asset regeneration is needed.
  Untracked moved design screenshots/ZIP are not the served `public/info` paths; preserve them.
- Native submission pack describes screenshots to take; no final store screenshot set was supplied
  there. External console/listing text was not inspected or changed. Recheck future supplied
  screenshots when relevant; do not publish store changes automatically.
- Local dev shares production data. Never schedule a real game, create a prize, send an email/push/
  partner message or run imports/migrations as a wording test. No `.env.local` values were read.
- Chromium local email screenshot failed before page navigation due to macOS sandbox
  `bootstrap_check_in … MachPortRendezvousServer … Permission denied (1100)`. No escalation or
  automatic-review rejection occurred; generated HTML was inspected with JSDOM instead. Visual
  email/layout verification remains in Phases 3–4. Don't claim screenshots passed.
- `python` is absent; use `python3` if needed. Installed Vitest, tsx, sharp, JSDOM and Playwright
  modules are available. No packages were installed, no network or paid provider used.

### 6. Exact commands, results and remaining verification

From `/Users/andrewserulneck/Documents/Trivia-Predictions`, with installed dependencies:

```sh
npx --no-install vitest run tests/owner-dashboard-contract.test.ts tests/app.owner-dashboard-one-round-trip.test.ts tests/app.owner-dashboard-merch.test.ts tests/components.owner-schedule-flow.test.ts tests/lib.owner-schedule-form.test.ts tests/lib.owner-schedule-display.test.ts tests/api.owner.schedule.test.ts tests/components.partner-manual-prizes.test.ts tests/lib.email.welcomeEmail.test.ts tests/lib.email.venueAddedEmail.test.ts tests/push-notifications-contract.test.ts tests/lib.push.test.ts tests/components.owner-sheet.test.ts
npm run email:preview
```

**Baseline: 13 suites / 255 tests passed, 0 skipped/failed**, duration 3.36 s. JSDOM reports existing
`Not implemented: Window's scrollTo() method` warnings; exit 0, no unhandled failure. Email preview
exit 0, both HTML/text pairs generated. JSDOM inspection confirmed the welcome's three old umbrella
phrases and added-venue's schedule heading, plus local preview image paths/alt text. No sending.

Search commands (read-only; no match gives exit 1):

```sh
rg -n -i 'live[[:space:]‐‑–-]+(community[[:space:]]+)?games?|offer[[:space:]]+prizes|group[[:space:]‐‑–-]+games?' app components lib tests native --glob '!*.json' --glob '!*.snap'
rg -n -i 'live[ -]+games?|offer prizes|group[ -]+games?' CLAUDE.md SYSTEM_CONTEXT.md AGENTS.md
rg -n -i 'live[ -]+games?|offer prizes|group[ -]+games?' docs/*checklist.md docs/native-app-store-submission-pack.md
```

Final full tests/typecheck/lint/build and responsive 350/390/1280 px review are **not run in Phase
1**, because there is no implementation change. Run applicable focused tests after Phase 2, and
final gates once after Phase 3 in Phase 4. Build/typecheck must not run concurrently; a fresh
checkout may need `npx next typegen`. No new test that merely mirrors copy is necessary.

Phase 1 Markdown whitespace was checked with `git diff --no-index --check /dev/null <file>` for
each of the three phase-owned documentation files (silent output means no whitespace errors;
these untracked files require explicit paths). No production runtime requests changed. Estimated
incremental reads/writes/provider calls/jobs/retries/fan-out remain **0 per load, run, day and month**
at current and 10× volume. No new asset bytes. Later release verification should confirm unchanged
request counts; actual released performance cannot yet be measured.

### 7. Open questions / waiting on developer

None blocking Phase 2. Publication has not been requested. Optional later visual checks must be
reported honestly if the environment cannot run a browser. Do not turn “Active” into new behavior
or add group members without a separate product scope decision.

### 8. Recommended first steps

1. Confirm branch/HEAD/status and preserve the unrelated dirty snapshot above.
2. Read inventory's Phase 2 rows; edit the two cards and schedule title expression, then shared
   heading wrapping. Keep prize actions and title distinctions intact.
3. Update current assertions and three OwnerSheet fixture snapshots; run focused baseline command
   (or affected subset) and inspect phone widths using stubs, without live writes.
4. Leave Phase 3's manual/push/email/player copy for that phase. Write
   `docs/group-games-terminology-plan_PHASE_2_HANDOFF.md` before marking Phase 2 finished and link
   it in the plan status. Recommended next model/effort: GPT-6.1 Sol / Low.

# Group Games terminology and Partner Dashboard labels

> **Status (2026-10-24): Phases 1–4 complete/live.** Andrew explicitly requested publication with the `/info` copy and three trivia questions. Application `e095b546b264fb02350666b430337b3a4df0a767`, READY `dpl_963x3ij1uoLwvUYdT9zETpcrjAkF`, both domains/exact source verified. Final combined gates: 5,504 tests / 13 environment skips, typecheck/lint/217-page build and 350/390/1280 px browser checks. [Publication, question data and undo record](copy-and-trivia-publication-2026-10-24.md); [Phase 4 handoff](group-games-terminology-plan_PHASE_4_HANDOFF.md); [original candidate evidence](group-games-terminology-release-record-2026-10-24.md).
> **Owner:** Andrew. Publication authorization is resolved; all wording shipped together. No next implementation phase. Preserve unrelated dirty work. The pre-existing full-bank trivia sync failure is documented separately from the successful three-row data publication.


## Developer summary

Rename the shared-room game concept from **Live Games** to **Group Games** across partner, admin and player experiences. The Partner Dashboard headings become **Active Group Games** and **Active Prizes**. Keep **Live Trivia** as the name of that individual game, and keep **Category Blitz** unchanged.

This is a terminology change. Scheduling, which games appear, prize eligibility, notifications and game behavior stay the same. No database migration or app-store binary update is expected. Ship the wording together after review so the surfaces agree.

## 1. Requirements and implementation assumptions

### Andrew's explicit requests

- Partner Dashboard: “Offer Prizes” → **“Active Prizes.”**
- Partner Dashboard: “Live Games” → **“Active Group Games.”**
- Rename the umbrella concept throughout admin, partner and player surfaces to **“Group Games.”**
- Give every phase a GPT-6.1 model and reasoning effort recommendation.

### Recommended interpretation for implementation

- **Group Games** means venue games people play together at the same time, currently Live Trivia and Category Blitz. It is not a new multiplayer mode or a claim that every sports feature is a Group Game.
- **Active Group Games** and **Active Prizes** name dashboard lists. Use **Group Games** for the schedule sheet that also contains history. Use verbs for actions: **Schedule a group game**, **Offer a prize**, **Create Prize**. Do not replace every occurrence of the verb “offer” with “active.”
- Keep existing list selection: `splitSchedules(...).upcoming` for games and `splitCompetitions(...).active` for prizes. “Active” must not silently change eligibility, timing, history or query logic. Note the dashboard currently lists upcoming schedules; the heading is Andrew's chosen wording, not a request for an in-progress-only view.
- Keep **Live Trivia**, **Live Trivia Showdown**, game-specific routes and IDs. Do not invent “Group Trivia.”
- Keep status wording such as **Live now**, **LIVE**, **Go live**, and actual live sporting events. In player copy, “Live game in progress!” referring to Category Blitz can become **“Group game in progress!”**; a generic state indicator can stay **“In progress.”**
- Keep code/file identifiers (`LiveGamesSection`, `liveShowdown*`, `live_trivia`), schema/RPC names, API keys and routes, analytics event IDs, push preference keys (`games`) and CSS tokens. Internal names can be explained by a glossary. No broad technical rename is needed to change the product concept.
- Keep `/owner/schedule`, `?sheet=schedule`, `?sheet=prizes`, and the permanent `?sheet=rewards` compatibility alias. No URL migration is needed.
- Preserve historical plans, handoffs, sent emails, notification history and user-authored game/prize names. Update living documentation and new message templates. Do not rewrite production records.
- Admin already uses game-specific labels such as **Live Trivia Schedules** and **Category Blitz**, under **Prizes & Events**. Preserve these meaningful names; inspect admin copy without adding a new navigation group merely to insert the phrase Group Games.
- Preserve gameplay/prize wording in canonical trivia JSON. Questions about live sports are unrelated to this feature rename.

These are implementation recommendations, not additional answers supplied by Andrew. Revisit only if implementation reveals a concrete conflict with his requirements.

## 2. Starting inventory (2026-10-24)

Search of `app`, `components`, and `lib` for `live games`, `live game`, `offer prizes`, and `group games` returned 59 lines, including comments and unrelated sports terminology. This is an initial inventory, not a count of required edits. Phase 1 must classify matches and search alternate casing, hyphenation, accessibility text and assets.

| Surface | Known paths and findings |
| --- | --- |
| Dashboard lists | `components/owner/dashboard/LiveGamesSection.tsx`: heading, add label, loading accessibility label and empty state; `components/owner/dashboard/RewardsSection.tsx`: heading. |
| Scheduling flow | `components/owner/schedule/ScheduleGameFlow.tsx`: all/history/detail title “Live Games” and creation title “Schedule a live game”; inspect `ScheduleStepScreens.tsx`, `ScheduleGameRow.tsx`, confirmations, errors and share prompts. |
| Dashboard host/navigation | `app/owner/dashboard/page.tsx`, `components/owner/menu/ownerMenuItems.ts`, `lib/ownerSheetParams.ts`; avoid changing dirty message-feature work. |
| Admin | `components/admin/adminSectionMeta.ts`, `components/admin/sections/SchedulesSection.tsx`, `CategoryBlitzSection.tsx`, `ChallengesSection.tsx`, `GameSettingsSection.tsx`, relevant venue/scheduling forms; inspect rendered copy and narrow screen navigation. |
| Players | `components/venue/VenueGamesPanel.tsx`: Category Blitz “Live game in progress!”; inspect `VenueHubClient.tsx`, onboarding, game landing screens, push settings and TV displays. |
| Notifications | `lib/pushCategories.ts`: `PUSH_COPY.labels.games` currently “Live games starting”; recommend “Group games starting.” Inspect `lib/push/gameReminders.ts`, `lib/push/venueNews.ts`, and welcome/permission copy without expanding what the system promises to send. |
| Partner support | `lib/partnerManual.ts`: “Schedule Live Games,” “live games,” and “Tap Offer Prizes on your dashboard”; new reference must say “Tap Active Prizes on your dashboard.” A section teaching how to offer prizes may still be headed “Offer Prizes.” |
| Email | `lib/email/partnerEmailCopy.ts`: both welcome and added-venue tours use Schedule Live Games. Use “Schedule Group Games.” “Offer Prizes” may remain as a teaching action, but literal references to a dashboard heading must match Active Prizes. |
| Marketing/share/legal | `app/info/page.tsx` already has “automated group games”; inspect other marketing/support/legal copy, metadata, `lib/socialShare`, and native submission copy for umbrella wording. Preserve game names. |
| Exclusions | `components/fantasy/PointsLedger.tsx` “No Live Games” describes sports activity; `lib/sportsBingo*` live-game/provider comments concern actual sporting events. Preserve those meanings. |
| Living docs | `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `AGENTS.md`, current device checklists and maintained partner design guidance. Keep dated implementation/release evidence intact. |

Reviewed Phase 1 decisions, exhaustive source-match dispositions, asset/support audit and baseline: [terminology inventory](group-games-terminology-inventory.md). This supersedes the initial inventory where more precise.

## 3. Phases and model choices

Use **GPT-6.1 Sol (`gpt-6.1-sol`)** throughout. Effort below is a task-specific recommendation, not an OpenAI requirement. Low is enough for bounded label edits; medium for classification and multi-surface copy; high for the final semantic/regression review. There is no identified reason to pay for xhigh/max on this rename.

Official model/effort references checked 2026-10-24: [model catalog](https://developers.openai.com/api/docs/models), [reasoning guidance](https://developers.openai.com/api/docs/guides/reasoning). OpenAI lists GPT-6.1 Sol as balancing intelligence and cost. Client-specific labels may differ; select the corresponding effort in the available client.

| Phase | Scope | Model | Effort |
| --- | --- | --- | --- |
| 1 | Complete terminology inventory and copy decisions | GPT-6.1 Sol | Medium |
| 2 | Partner Dashboard and scheduling labels | GPT-6.1 Sol | Low |
| 3 | Admin, players, notifications, partner material and living docs | GPT-6.1 Sol | Medium |
| 4 | Review, responsive checks and release preparation | GPT-6.1 Sol | High |

### Phase 1 — Freeze the terminology inventory

**Complete (2026-10-24).** [Reviewed inventory](group-games-terminology-inventory.md); [handoff](group-games-terminology-plan_PHASE_1_HANDOFF.md). No application edit.

1. Read repository rules and Phase 0 handoff; record branch/SHA and dirty files before editing.
2. Search case-insensitively for umbrella wording, singular/plural, Live/Live Games labels, loading/ARIA labels, and dashboard instructions. Inspect screenshot/image text, email previews and relevant native submission materials.
3. Add a reviewed inventory to this plan (or an adjacent inventory file): path, old wording, replacement or explicit exclusion, and reason. Do not use blind global replacement.
4. Document the Group Games definition and exceptions from §1. Confirm actual admin/player structures before proposing any navigation change.
5. Record baseline focused test results, if needed to distinguish existing failures from rename regressions.

**Exit:** Inventory covers admin, partner, players, email/push, marketing and current support assets; every remaining umbrella phrase has a disposition. No data/schema/behavior change planned. Write `group-games-terminology-plan_PHASE_1_HANDOFF.md` and update status.

### Phase 2 — Update the Partner Dashboard and schedule flow

**Implementation complete (2026-10-24).** [Handoff](group-games-terminology-plan_PHASE_2_HANDOFF.md). All 255 focused tests pass; heading wrapping reviewed in source, rendered 350/390/1280 px checks remain unverified because Chromium cannot launch in the sandbox. Not deployed.

1. Change the two requested dashboard headings exactly to **Active Prizes** and **Active Group Games**.
2. Update schedule sheet/list title to **Group Games**, creation/empty/add copy to **Schedule a group game**, loading label to **Loading group games**. Review edit/history/detail/confirmation/error text for consistency.
3. Keep action verbs and existing schedule/prize filtering. Preserve click targets, sheet state, saved links, one-round-trip dashboard loading, retry behavior and buttons.
4. Update existing copy assertions in dashboard/schedule tests. Avoid new tests that just mirror string literals.
5. Inspect narrow phone layouts: Active Group Games is substantially longer. Allow wrapping without truncation, clipped add buttons or changed card behavior; use existing typography/tokens.

**Exit:** Requested headings and related partner flow are consistent, focused tests pass, list contents/requests are unchanged. Write Phase 2 handoff and update status. Do not deploy an isolated partial rename.

### Phase 3 — Complete the system-wide wording

**Implementation complete (2026-10-24).** [Handoff](group-games-terminology-plan_PHASE_3_HANDOFF.md).
Player/push/manual/email/marketing and living-document changes are local; admin, TV and share
copy retain the inventory's valid game-name/status exclusions. All 255 focused tests pass.
Both local email previews pass HTML/text/content/link/image checks; browser-rendered layout is
still unverified for Phase 4. No assets, delivery behavior, data or internal identifiers changed.

1. Work through the Phase 1 inventory for admin, player pages, push settings/welcome, TV, marketing/support and share text. Change umbrella wording while preserving game names and timing statuses.
2. Update the Partner Manual and both email templates. Instructions pointing at dashboard cards must use the exact new card headings; action-oriented prose can still say offer prizes.
3. Preview email HTML locally; do not send emails, pushes or partner messages as a test. Keep push audience, preferences, schedules and category IDs unchanged.
4. Update relevant living docs and device checklists, including a glossary in `CLAUDE.md` and `SYSTEM_CONTEXT.md`: Group Games is the umbrella; Live Trivia is a game; `live*` internals remain stable.
5. Replace any actively shipped asset containing obsolete umbrella wording only if the audit finds one. Follow immutable asset filename rules; do not overwrite cached artwork. Archive historical evidence unchanged.
6. Update relevant existing tests. Add a narrowly scoped terminology guard only if useful: distinguish obsolete umbrella UI text from valid Live Trivia/status/sports wording, and do not scan trivia question content or historical docs with a blanket ban.

**Exit:** Every in-scope surface uses the new concept; remaining old-word matches are documented exclusions. Email previews and affected tests pass. Write Phase 3 handoff and update status.

### Phase 4 — Review, verify and prepare one release


**Complete/live (2026-10-24).** [Publication record](copy-and-trivia-publication-2026-10-24.md). The local review evidence below is the pre-publication snapshot. [Final handoff](group-games-terminology-plan_PHASE_4_HANDOFF.md);
[exact validation/release record](group-games-terminology-release-record-2026-10-24.md).
All final isolated-candidate gates pass (5,505 tests / 13 skips, typecheck/lint/217-page build).
60 browser views cover 350/390/1280 px, including all dashboard states, schedule views, legacy
routes/rewards alias, admin, players, settings and both email previews. Category Blitz's longer
status gets existing-artwork-width spacing; measured glyph/icon overlap is now zero. Existing
email narrow-width overflow and the root's unchanged randomized Bingo-test failure are recorded,
not broadened into repairs. Two durable patches plus a 34-file hash manifest reconstruct the
candidate without unrelated dirty work. Nothing is committed, pushed or deployed. Physical
devices/email clients remain unverified; these are not a new implementation phase.

1. Review the final scoped diff for accidental game renames, filtering changes, identifier/route changes, unrelated dirty-file inclusion and broken links. Keep admin metadata component-free to preserve its lazy-loading boundary.
2. Run the verification commands in §4; fix failures caused by this plan. Record unrelated baseline failures with evidence rather than silently broadening scope.
3. Check phone widths 350/390 px and desktop 1280 px: dashboard headings, loading/empty/error/list states, add controls, schedule all/history/detail, admin mobile/desktop, player game labels, notification settings and email previews. Use local/stubbed fixtures; local dev shares production data, so do not schedule real games or award prizes for this check.
4. Record exclusions from a final semantic search. Confirm **Live Trivia**, actual live sports, and **Live now** still appear where appropriate. Confirm deep links and rewards alias still work.
5. Produce a release-ready scoped change and exact validation record. Publication is a separate action: this planning request does not authorize push, merge or deploy. If later authorized, release all wording together from an isolated scoped commit/checkout; record exact commit, deployment ID, domains and observed live copy, then update the handoff/status.
6. Reversal: revert only the rename's scoped commit(s), preserving unrelated work; no database rollback. Do not mark live until deployment is verified.

**Exit:** Review and local checks complete; publication state explicit. Write `group-games-terminology-plan_PHASE_4_HANDOFF.md` before marking this phase complete, including release facts or clearly stating ready/not deployed.

## 4. Verification commands

Re-run the inventory against current files at implementation time:

```sh
rg -n -i 'live[ -]+games?|offer prizes|group[ -]+games?' app components lib tests native --glob '!*.json'
rg -n -i 'live[ -]+games?|offer prizes|group[ -]+games?' CLAUDE.md SYSTEM_CONTEXT.md AGENTS.md
```

Focused tests (extend only for surfaces actually changed):

```sh
npx vitest run tests/owner-dashboard-contract.test.ts tests/app.owner-dashboard-one-round-trip.test.ts tests/app.owner-dashboard-merch.test.ts tests/components.owner-schedule-flow.test.ts tests/lib.owner-schedule-form.test.ts tests/lib.owner-schedule-display.test.ts tests/api.owner.schedule.test.ts tests/components.partner-manual-prizes.test.ts tests/lib.email.welcomeEmail.test.ts tests/lib.email.venueAddedEmail.test.ts tests/push-notifications-contract.test.ts tests/lib.push.test.ts
npm run email:preview
```

Final gates, once after all edits:

```sh
npm run test
npx tsc --noEmit
npm run lint
npm run build
```

Use installed dependencies; on a fresh checkout `npx next typegen` may be needed for generated Next.js types. Build font fetches may require network access. Never print/read `.env.local`; do not run DB imports/migrations or paid generation as part of this rename. No new SQL test suite is needed for wording-only work. Record failures and environment limits accurately.

## 5. Cost and data impact

Expected incremental production operations per page load, user, game, run, day and month: **0 database reads, 0 writes, 0 provider requests, 0 new jobs, 0 retry/fan-out operations** at both current and higher traffic. Existing traffic patterns remain unchanged. Text payloads change by a few bytes; no material bandwidth increase is expected. If an asset must be regenerated, measure its before/after bytes and use existing optimization/immutable filename rules. No runtime AI feature is added.

No production reads were performed for planning, and no historical data rewrite is proposed. No backup or undo log is needed for data because no data mutation is planned. Code rollback uses scoped commits. After an authorized release, confirm request counts remain the same; investigate material differences before attributing them to this wording change.

## 6. Handoff rule

Every phase, including a partially completed one, ends with `docs/group-games-terminology-plan_PHASE_<N>_HANDOFF.md`. Update this plan's status to link the latest. Start with a plain-English developer summary and cover next scope/exclusions, branch/SHA/commit/push/deployment/data state, decisions, changed files/functions, traps/permissions, exact commands/results, open questions and recommended first steps/model/effort.

## 7. Open questions

No developer answer is required to prepare or begin the wording implementation under the assumptions in §1. If Andrew intends new game membership, new scheduling behavior or a different meaning of Active, that is a product behavior change and needs a separate scope decision. External App Store/Play listing changes are relevant only if their published text contains the old umbrella term; do not publish listing changes automatically.

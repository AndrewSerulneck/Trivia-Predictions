# Group Games terminology — Phase 0 planning handoff

## For Andrew

The plan is written. It covers Active Prizes and Active Group Games on the Partner Dashboard, followed by the Group Games concept across the rest of the product. No application wording has been changed by this planning task and nothing was deployed. Four implementation/review phases remain. No answer is needed from you to understand the proposed scope; pushing or deploying is outside this planning request.

## To the next agent

### 1. Next goal and exclusions

Execute Phase 1 of `docs/group-games-terminology-plan.md`: complete/classify the terminology inventory before implementation. Use GPT-6.1 Sol (`gpt-6.1-sol`), Medium reasoning effort. Read all of that plan plus `AGENTS.md`, `CLAUDE.md` and `SYSTEM_CONTEXT.md` first. Scope is visible umbrella terminology and the two dashboard headings. Exclude behavior/filtering, game names, IDs, schema, routes, stored records, trivia content and actual live sports/status uses.

### 2. Starting state

Inspected 2026-10-24, branch `main`, HEAD `bb5af579a2bf4a049f3dcca9cc8c5c6c4ea5112a`. This turn created only the plan and this handoff; both are uncommitted/unpushed. No commit, push, migration, deployment, production-data read or data mutation occurred in this planning task. Remote/deployment state was not checked. No backup or data undo log exists because no data operation occurred.

The workspace is extensively dirty. Run `git status --short` and inspect current diffs before editing. Pre-existing work includes partner messages/push code, admin routes, owner dashboard/menu, CLAUDE.md, POS provider work, native submission docs, deleted/moved design-system images and untracked Firebase/native configuration. Preserve it all; do not stage the whole tree or deploy the root wholesale.

Earlier tasks in this conversation changed `app/info/page.tsx`, `tests/info-partner-login-contract.test.ts`, and `data/live-trivia/categories/sports.v1.json` (three football questions), locally without deployment/import. These are separate from this plan. Also preserve the pre-existing /info features/pricing copy edits.

### 3. Decisions and assumptions

Andrew explicitly requested Active Prizes, Active Group Games, and system-wide Group Games terminology, with GPT-6.1 recommendations per phase. He requested a plan in this turn, not implementation or publishing.

The plan recommends keeping individual game names Live Trivia and Category Blitz, list filtering, all routes/IDs and internal code names. Group Games describes shared-room play. Active Group Games retains the existing upcoming schedule list; it does not mean only games currently running. Offer a prize/Create Prize remain actions. Literal instructions to tap the dashboard card become Tap Active Prizes. Schedule sheet/history title becomes Group Games. These are clearly labeled recommendations in the plan rather than additional confirmed answers from Andrew.

The plan recommends GPT-6.1 Sol Medium for inventory, Low for partner labels, Medium for remaining surfaces, High for final review. Official model catalog and reasoning pages were fetched via OpenAI Docs; citations are included in the plan. Effort allocation is our judgment, not an official requirement. No subagents were used or required.

### 4. Files and architecture facts

Created:
- `docs/group-games-terminology-plan.md`: requirements/assumptions, starting inventory, four phases with model/effort, checks, cost/data impact and handoff rule.
- `docs/group-games-terminology-plan_PHASE_0_HANDOFF.md`: this handoff.

Known implementation paths:
- `components/owner/dashboard/LiveGamesSection.tsx`: heading, loading label, add and empty copy; uses `splitSchedules(...).upcoming` and a three-row display limit.
- `components/owner/dashboard/RewardsSection.tsx`: Offer Prizes heading; uses `splitCompetitions(...).active`.
- `components/owner/schedule/ScheduleGameFlow.tsx`: all/history/detail title Live Games; create title Schedule a live game.
- `components/admin/adminSectionMeta.ts`: game-specific Live Trivia Schedules/Category Blitz navigation, grouped under Prizes & Events. This module must remain component-free for lazy loading.
- `components/venue/VenueGamesPanel.tsx`: Category Blitz has Live game in progress!; individual game/status labels also contain valid Live words.
- `lib/pushCategories.ts`: `PUSH_COPY.settingsLabels.games` says Live games starting; change copy, not the key or delivery logic.
- `lib/partnerManual.ts`, `lib/email/partnerEmailCopy.ts`: partner education and dashboard references.
- `lib/ownerSheetParams.ts`: keep schedule/prizes sheet IDs and permanent rewards alias.

### 5. Traps and permissions

Initial source search returned 59 lines including comments and exclusions, not 59 required edits. Admin does not currently expose a single Live Games nav group; do not force one into existence. Fantasy's No Live Games refers to live sports. Live Trivia is a protected product name. Preserve Live now/LIVE status semantics. Do not globally replace live.

New dashboard heading is longer: check wrapping/controls at 350 and 390 px. Avoid adding runtime copy fetching or touching dashboard loading behavior. Local development shares production DB: tests/previews must not schedule games, send messages or award prizes. No permission was requested or granted for production writes or publication.

### 6. Verification and environment

Planning used read-only repository searches, `git status --short`, `git branch --show-current`, `git rev-parse HEAD` and official OpenAI documentation. No application tests/build were run for this documentation-only task. Validate plan-file whitespace with:

```sh
git diff --no-index --check /dev/null docs/group-games-terminology-plan.md
git diff --no-index --check /dev/null docs/group-games-terminology-plan_PHASE_0_HANDOFF.md
```

These commands return 1 when files differ even without whitespace errors; inspect output. Implementation test commands and email preview instructions are in plan §4. Use `npm run dev` for local UI review. Never read/print `.env.local`. No requirement to invoke new paid APIs or SQL tooling.

Known unrelated earlier validation result: `npm run live-trivia:check` failed on existing History duplicate slug `sun-tzu-art-of-war`; the three new Sports entries passed isolated import check with no DB writes. This has no bearing on Group Games wording and should not expand this task.

### 7. Open questions

None blocking the terminology inventory. Actual new grouping behavior or in-progress-only filtering would require clarification; neither is proposed. External app-store text may need later inspection if it contains umbrella wording. Publication authorization is not supplied by this plan request.

### 8. First steps

Confirm the working tree and current HEAD; read the plan; classify source/asset matches into required edits and exclusions. Add the final inventory to the plan or an adjacent file. Finish Phase 1 with a detailed `docs/group-games-terminology-plan_PHASE_1_HANDOFF.md` and update the status link before reporting completion. Continue with the model/effort named for each later phase when authorized to implement.

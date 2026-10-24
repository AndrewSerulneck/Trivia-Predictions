# Group Games terminology — Phase 4 handoff

## For Andrew

Phase 4 is complete locally. The final isolated candidate passes 5,505 tests (13 environment
skips), typecheck, lint and a production build. Browser review covered 350/390/1280 px and found
one rename-related overlap in Category Blitz; a small spacing adjustment fixes it. Existing
mobile email overflow and an unrelated randomized Bingo-test failure are documented with
baseline evidence. Nothing is committed, pushed or deployed. No answer is needed to finish this
review. The next action, if you request it, is a separate scoped publication of all the wording.

## To the next agent

### 1. Next goal, scope and exclusions

All four phases of `docs/group-games-terminology-plan.md` are complete. **There is no Phase 5
in this plan.** A future explicit publication request should prepare a clean checkout/commit,
release all the terminology together, then verify and record live copy. Use the tested patches
and manifest below, preserving the dirty root. Recommended model/effort, continuing the plan's
final-review choice: **GPT-6.1 Sol (`gpt-6.1-sol`), High**.

Read `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `AGENTS.md`, the plan,
`docs/group-games-terminology-inventory.md`, and
`docs/group-games-terminology-release-record-2026-10-24.md`. Do not start a behavioral redesign,
email-layout project, historical content rewrite, migration, native binary or store-listing update.
Do not send messages/emails/pushes, run paid generation, create real schedules/prizes or repair
Bingo as a side effect. Local dev shares production services; safe review must use fixtures.

### 2. Starting state, publication and data

Recorded **2026-10-24, America/New_York**. Root branch **main**, HEAD unchanged:
**`bb5af579a2bf4a049f3dcca9cc8c5c6c4ea5112a`**. Phases 1–4 remain local/uncommitted.
No staging, commit, push, merge, deployment or external release inspection occurred. Deployment
ID/live source/domain verification: **not performed**; do not describe this rename as live.

No database mutation, import, migration, backup or data undo log was performed. No paid AI,
email, push or partner-message sending occurred. The normal root production build auto-loads
`.env.local`; the agent did not inspect or print its secret values. The release build/review used
a separate source checkout with no `.env*` and a cleared inherited environment. No service
credentials were copied. No data rollback is necessary; undo only the scoped code changes.

The root has extensive unrelated dirty/untracked work. Preserve partner messaging (including
migration `20261023145024_push_venue_messages.sql`, flags, routes, UI and tests), native/store
plans/config, POS plans/provider changes, info-page edits, moved design assets and
`data/live-trivia/categories/sports.v1.json`. Do not restore mixed files from HEAD wholesale.
Complete Phase 4 entry status/diff are ignored local evidence:
`tmp/group-games-phase-4/entry-status.txt` and `tmp/group-games-phase-4/entry.diff`.
Phase 3's entry snapshot is `tmp/group-games-phase-3/before.json`. Neither ignored helper is
required to reconstruct the candidate now that durable patches exist.

### 3. Decisions already made — do not re-ask

- Group Games means simultaneous shared-room Live Trivia and Category Blitz. Keep game names,
  including Live Trivia Showdown; no Group Trivia, new game membership or multiplayer behavior.
- Dashboard: exactly **Active Group Games / Active Prizes**. Keep
  `splitSchedules(...).upcoming`, `splitCompetitions(...).active` and the three-row limits.
- Schedule list/history/detail: **Group Games**. Creation/add/empty: **Schedule a group game**.
  Keep **Edit game**, **Schedule another game**, **Offer a prize** and **Create Prize**.
- Prize list sheet stays **Prizes**; creation stays **Offer a prize**. Manual/email **Offer Prizes**
  remains teaching/action language; manual locator is **Tap Active Prizes on your dashboard**.
- Push label is **Group games starting**. Preference key `games`, stored settings, audiences,
  caps, hooks and delivery are unchanged. Welcome/permission promises still name the supported
  Live Trivia reminders; do not imply new Category Blitz reminder delivery.
- Preserve internal `LiveGamesSection`, `liveShowdown*`, schema/RPC/channel/analytics names,
  `/owner/schedule`, `?sheet=schedule`, `?sheet=prizes` and permanent `?sheet=rewards` alias.
- Admin keeps Live Trivia Schedules / Category Blitz and its existing mobile allowlist and
  component-free metadata. Sports/status LIVE / Live now and actual gameplay lifecycle language stay.
- Preserve historical docs, sent/stored content, user-authored names and trivia JSON. The asset
  audit required no image replacement. No new asset or recurring service cost was introduced.
- Phase 4 execution did not authorize publication. The review is finished; do not ask for a
  blanket approval or deploy automatically when merely reading this handoff.

### 4. Changed files, functions and candidate artifacts

**Phase 4's only application addition** is in `components/venue/VenueGamesPanel.tsx`: the active
Category Blitz status paragraph gets `pr-[5.5rem]`, matching the existing artwork width. At
350 and 1280 px the longer wording previously put two character rectangles under the icon;
after the fix all three widths have zero status-character intersections. At 1280 the paragraph
wraps from 24 to 48 px; at 350/390 it stays 48 px. No font, color, state or request change.
The existing title/art placement is unchanged.

The combined **28-file application candidate** covers:

- `components/owner/dashboard/{DashboardSectionCard,LiveGamesSection,RewardsSection}.tsx`:
  headings/copy and removed h2 `truncate`; existing filters/actions/requests stay.
- `components/owner/schedule/{ScheduleGameFlow,ScheduleGameRow,ScheduleStepScreens}.tsx`:
  flow titles and comments; no navigation/save change.
- `components/venue/VenueGamesPanel.tsx`, `components/push/PushNotificationSettings.tsx`:
  Category Blitz copy/spacing and notification comment.
- `lib/{ownerScheduleDisplay,ownerSchedule,ownerScheduleForm,ownerCompetitionTemplates,
  rewardDefinitions,rewards,ownerRewardFlow,ownerSheetParams}.ts`,
  `lib/hooks/useScheduleUpdatedBroadcast.ts`, `lib/push/gameReminders.ts`: comment alignment;
  candidate runtime syntax is identical to base.
- `lib/pushCategories.ts`: the single games switch label.
- `lib/partnerManual.ts`: schedule prose and Active Prizes locator.
- `lib/email/partnerEmailCopy.ts`: both tour titles and welcome social prose.
- `app/info/page.tsx`: only the benefit sentence Schedule group games (like pub trivia).
- Existing tests `tests/{owner-dashboard-contract,app.owner-dashboard-one-round-trip,
  app.owner-dashboard-merch,components.owner-sheet,components.owner-schedule-flow}.test.ts`
  and `tests/__snapshots__/components.owner-sheet.test.ts.snap`: copy assertions/comments;
  snapshots have exactly the three synthetic-title substitutions from Phase 2.

**Six maintained documentation files**: `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md`,
`docs/native-app-device-checklist.md`, `docs/partner-dashboard-app-redesign-device-checklist.md`,
`docs/join-merch-store-device-checklist.md`. Phase 4 updates the first three's status/pointers;
other copy was implemented earlier. Unrelated message/native hunks are excluded from the bundle.

**Durable release artifacts created in Phase 4:**

- `docs/group-games-terminology-release.patch`: 28 application/test files, **31,401 bytes**,
  SHA-256 **`22f7a396e39f91361f16c124403c04e2632e73a2f20b20df8d964499cdeb6694`**.
- `docs/group-games-terminology-living-docs.patch`: six maintained docs, **22,883 bytes**,
  SHA-256 **`42112eeb46f6331778df7043d860a941b22a6c0c4eabaf39ce842e61a9185bca`**.
- `docs/group-games-terminology-release-manifest.json`: exact base, patch hashes and all 34
  file hashes; the authority for which hunks belong in the candidate.
- `docs/group-games-terminology-release-record-2026-10-24.md`: gates, exceptions, browser
  matrix, cost state and clean-checkout application instructions.
- This `docs/group-games-terminology-plan_PHASE_4_HANDOFF.md`; plan/inventory status updated.

The patches intentionally exclude the plan/inventory/handoffs/release record/manifest themselves
(to avoid recursive patch/hash dependencies). Add those documentation artifacts deliberately to
a future scoped commit. Do not regenerate an unrestricted diff from the dirty root. Both patches
were actually applied to a second pristine archive of the base; **all 34 resulting file hashes
matched the manifest**. Original candidate source is in ignored
`tmp/group-games-phase-4/release/`; application proof is in `tmp/group-games-phase-4/apply-check/`.

### 5. Facts, traps and permissions

- Sandbox Chromium launch still fails with MachPortRendezvousServer permission denied (1100).
  The automatic review **approved** escalation for a local launch; it then worked. No rejection
  or unresolved permission request occurred. The localhost server needed approved binding too.
- Run Next directly for the fixture server: `npm run dev -- --webpack` conflicts with the
  package's existing `--turbopack`. The working command is in §6. Do not change package scripts.
- The fake Firebase token must be at least 20 characters or settings show the Turn on state,
  not switches. Fixture correction only; no real native/API operation was attempted.
- Preview images use `../../public/brand/email/`; when serving HTML through a local route,
  intercept `/public/brand/email/*` to local assets. Four welcome images decoded successfully.
- **Existing email overflow:** welcome document is 370 px at a 350 px viewport; added-venue is
  560 px at 350 and 390 px. Exact original-copy previews produce the same dimensions. Neither
  builder changed. This was recorded rather than widening the terminology task. Real email-client
  layout and physical-device checks are unverified; do not call the emails fully responsive.
- Root `git diff --check` reports pre-existing `app/info/page.tsx:743` trailing whitespace.
  That dirty pricing-list line is absent from the release patch; do not silently clean it up.
- The root full suite had one randomized NFL Bingo failure (star share 0.2916666666666667 vs
  required >0.3). The test and both related selection modules are unchanged from HEAD; its
  immediate rerun and both full candidate runs pass. No Bingo repair or test weakening occurred.
- Final old-word search returns **32 source lines**, all the inventory's valid sports/provider,
  running-session/TV/engine or Offer Prizes teaching/action exclusions. Native has no old
  umbrella copy. Live Trivia, Category Blitz, LIVE and Live now remain as intended.
- No asset generation, new SQL, timers, providers or extra requests were added. Expected
  incremental DB/provider/job/retry/fan-out per load/run/day/month at current and 10× volume:
  **zero**. No release means no live post-release cost comparison is available.

### 6. Build, run and verification evidence

Dependencies are installed in root; Node **v24.19.0**. Candidate `node_modules` is a symlink to
root's. Use a normal installed environment or `npm ci` in a separate clean checkout; do not copy
`.env.local`. Build needs Google Fonts network access. Do not run typecheck concurrently with
build, which regenerates `.next/types`. Exact offline gate commands:

```sh
npm run test
npx --no-install tsc --noEmit
npm run lint
npm run build
npm run email:preview
```

Root results: **5,524 pass / 1 fail / 13 skip** in **28.38 s**; Bingo suite rerun **12/12** in
**3.39 s**; typecheck/lint/build pass (**218** static pages). Final isolated candidate after the
spacing fix: **5,505 pass / 13 skip / zero failures**, **445 passing suites / 1 skipped**,
**27.32 s**, clean typecheck/lint and a **218-page production build**. Root/candidate totals
differ because unrelated unpublished code/tests are deliberately absent from the candidate.

The credential-free sandbox build initially failed DNS fetching Bree Serif/Nunito. An approved
network build passed using:

```sh
cd /Users/andrewserulneck/Documents/Trivia-Predictions/tmp/group-games-phase-4/release
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" NEXT_TELEMETRY_DISABLED=1 npm run build
```

Responsive fixture server (stopped after review; use only an isolated checkout):

```sh
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT=true node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3114
```

Local runner, if still present: `node tmp/group-games-phase-4/review.cjs`; continuation flags
`--resume`, `--resume --player-only`. It requires that safe server, fake native capability,
intercepted `/api/*`, blocked external origins, sample email previews and reconstructed old-copy
email baselines. The runner is ignored one-off evidence; the durable release record contains the
20-scenario matrix, dimensions and conclusions for someone without these local files.

**60 distinct screenshots**, at **350/390/1280 × 900**, cover dashboard list/empty/error/loading,
schedule all/history/detail/create, both old page redirects, rewards alias, manual, admin desktop
and mobile, player active Category Blitz, push settings, and two views of each email. No app
horizontal overflow, heading/add overlap or captured page errors. All API requests were answered
locally (including fake push-device POSTs); no external browser requests. Existing seed/request
count and retry/refetch tests remain intact. Native/physical devices and real email clients were
not tested. The 13 comment-only candidate application files print identical TypeScript syntax
with comments removed; admin metadata is byte-identical and has no imports.

Local logs/PNGs are in `tmp/group-games-phase-4/`; exact filenames are enumerated in the durable
release record. No SQL tests were needed. No paid/live/provider/message tests were run.

### 7. Open questions and anything waiting on Andrew

No unresolved product answer or permission blocks the completed local rename. Publication is
separate and has not been requested under this task. Existing narrow-email layout limits are a
possible future task; no repair is authorized or required for this wording plan. Physical-device
and actual email-client observations remain unverified operational checks.

### 8. Recommended next steps

1. On an explicit publication request, inspect current branch/base and preserve the dirty root.
   Start a separate clean checkout at the manifest's base; use `git apply --check` then apply the
   two durable patches. Follow the release record's commands, compare all candidate file hashes,
   and include plan/inventory/Phase 0–4 handoffs/release artifacts as scoped documentation.
2. If the intended base advanced, reconcile only these scoped changes and rerun affected gates;
   otherwise the exact final gates and responsive evidence are already recorded.
3. Commit/release the complete terminology together only within the requested publication scope.
   Record exact commit SHA, deployment ID, domains and rendered live labels/aliases. Update this
   handoff, release record and the three context files with observed facts; never claim live from
   a push alone. Compare request behavior with the one-round-trip baseline after release.
4. Roll back only scoped commit(s) if necessary. There is no database rollback. Do not revive
   historical repair, paid generation, partner messaging cutover or native/store work.

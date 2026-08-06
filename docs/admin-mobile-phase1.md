# Phase 1 — Fix the two "broken" sections

## The actual bug

Username Moderation and LLM Cost are **not broken**. Both components exist and
are complete (`components/admin/sections/UsernameModerationSection.tsx`, 172
lines; `components/admin/sections/LlmCostSection.tsx`, 277 lines) and both APIs
are live (`/api/admin?...` and `app/api/admin/llm-cost/route.ts`).

The "This section is being upgraded… Current status: Ready" message is
`LegacyPanel` — the `default:` arm of `renderContent()` in
`components/admin/AdminShell.tsx`. **Both sections are just missing a `case`
arm.** They already render fine via the older `AdminConsole` at
`/admin/username-moderation` and `/admin/llm-cost`.

## A. Wire them up

Add `case "username-moderation":` and `case "llm-cost":` arms plus the two
imports to `AdminShell.renderContent()`. Confirm both render with real data.

## B. Make LLM Cost honest about coverage

Investigated ground truth — do not re-derive, and do not "fix" this by
inventing data:

- `lib/llmCostTracker.ts` writes to `llm_usage_log` (migration
  `20260708140000_llm_usage_logs.sql`); `getCostSummary()` aggregates by
  feature and model. This all works.
- **Actually tracked:** `username_moderation` (Haiku, `lib/usernameModerator.ts:241`)
  and `live_trivia_rewrite` (Gemini, `lib/liveTriviaExport.ts:166`).
- **Category Blitz LLM grading does not exist.** `scoreRound` in
  `lib/categoryBlitz.ts` has no LLM call; a repo-wide search for `@anthropic-ai`
  / `api.anthropic.com` hits exactly one file (`lib/usernameModerator.ts`).
  Category Blitz answers are scored deterministically.
- Therefore `category_blitz_grading` and `category_blitz_moderation` in the
  `LlmUsageFeature` union are **written by nothing**.

Make the page state plainly which features are instrumented. It must NOT imply
it covers Category Blitz grading, and must not render an untracked feature as a
confident $0.00. Either remove the two never-written enum members or leave them
with an explanatory comment — your call, but say which in the run log.

Do NOT build Category Blitz LLM grading. That is a feature, not a bug fix, and
it is out of scope.

## Verify
`npm run build`, `npx tsc --noEmit`, `npm test`. Both sections reachable from
the desktop sidebar and rendering live data.

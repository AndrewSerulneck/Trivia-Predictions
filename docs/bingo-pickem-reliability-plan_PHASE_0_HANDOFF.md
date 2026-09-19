# Phase 0 handoff — Bingo and Pick ’Em reliability

Date: 2026-09-12.
Plan: [bingo-pickem-reliability-plan.md](bingo-pickem-reliability-plan.md).

The phased plan is written. It covers all four requested improvements, assigns a Codex model and effort to each phase, and requires detailed handoffs and final updates to the three project instruction/context files. No gameplay code, database rows, or live configuration changed. The next work is to recover and audit the actual Brunswick Grove Bingo boards; Andrew does not need to answer a product question to begin that investigation.

## To the next agent — goal and scope

Run Phase 1 with **GPT-6 Astra (`gpt-6-astra`), Extra High (`xhigh`)**. Read the plan and canonical rules first. Reconstruct every square on the September 9, 2026 Brunswick Grove NE @ SEA test boards and inventory all generated resolver families for NBA, WNBA, MLB, and NFL. Produce evidence and replay fixtures before changing grading.

Out of scope for Phase 1: production mutations, redeployment, board regeneration as a replacement for incident records, broad architecture rewrites, unrelated billing/auth fixes. UI implementation belongs to Phases 2–3; it may proceed independently if live incident access is unavailable. No subagents were used or are required.

## Starting state and data

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`.
- Branch at start: `main`.
- Last commit: `783ebd2`, subject `Prop Bingo NFL Phase 2: game-day re-verification, blockers cleared`. Resolve full SHA with `git rev-parse HEAD` at next start.
- Working tree was clean at investigation start. This phase creates the plan and this handoff and adds planned-work references to `CLAUDE.md`, `AGENTS.md`, and `SYSTEM_CONTEXT.md`. These five documentation files are the intended uncommitted changes. No commit or push was performed.
- Remote branch alignment and current production deployment were not checked. No feature flag values were read or changed.
- No production queries, provider sports requests, data exports, backups, repair scripts, or data mutations were performed. There is therefore no undo log or production snapshot yet. Phase 1 must capture evidence; Phase 6 must prepare backups before any authorized repair.
- Live venue ID, affected user/card/square IDs, actual outcomes, and deployed behavior remain unknown.

## Decisions already made

Andrew requested a phased plan for these four outcomes:

1. Only Bingo leagues with available games appear; they automatically return when games return. NBA/WNBA were examples, not permanent exclusions.
2. Remove football from regular Pick ’Em's horizontal sports selector because a separate NFL game exists.
3. Fix NFL week-dropdown branding and misplaced popup using the site's established pattern.
4. Audit the September 9 Seahawks/Patriots Prop Bingo test at Brunswick Grove; make every generated square gradable and interesting.

The plan treats availability as the existing game chooser's boardable, unlocked games on the user's current local date. The 36-hour upstream lookahead stays. Season calendars, static fail-open lists, and old NFL coming-soon gates must not override actual availability after Phase 2; the user explicitly wants that function alone. Scope that change to Bingo and preserve history/settlement. Keep regular Pick ’Em's shared NFL settlement machinery; filter discovery instead of indiscriminately deleting registry data.

Use the shared dropdown; preserve week semantics. Correctness precedes variety, and available odds do not prove available grading stats. Missing data remains distinct from zero. Unsupported new square families are removed while legacy stored resolvers remain interpretable. Preparation does not authorize production mutation; present a concrete dry-run before any repair authorization still required.

## Files and architecture map

Created:

- `docs/bingo-pickem-reliability-plan.md`: decisions, evidence, Phases 0–7, exact model IDs/efforts, acceptance criteria, test commands, data-repair workflow, handoff contract.
- `docs/bingo-pickem-reliability-plan_PHASE_0_HANDOFF.md`: this standalone next-agent record.

Updated:

- `CLAUDE.md`, `AGENTS.md`, `SYSTEM_CONTEXT.md`: short links labeled planned/not implemented. Do not confuse these pointers with as-built behavior. Phase 7 replaces them with verified final contracts.

Key implementation paths inspected:

- `app/api/bingo/leagues/route.ts`: builds the static league list from `SPORTS_BINGO_LEAGUES`; applies `isSeasonGatingEnabled`, `isNflGameplayEnabled`, and `resolveLeagueSeasonStatus`.
- `components/bingo/SportsBingoSelectSport.tsx`: disabled out-of-season entries plus static enabled fallback on failure; shared by standalone flow and sheet callback.
- `lib/sportsBingoLeagues.ts`: client-safe display catalog for NBA, WNBA, NFL, MLB. It is not a live eligibility source.
- `components/bingo/SportsBingoSelectGame.tsx`: requests `/api/bingo/games` with `includeLocked=false` and timezone offset.
- `app/api/bingo/games/route.ts`, `app/api/bingo/cards/route.ts`: call `resolveLeagueBlockReason`; enumerate other callers before editing.
- `lib/leagueSeasonStatus.ts`: 14-day games signal with calendar fallback; independent NFL activation flag. Read dependency consumers before removing Bingo-only gating.
- `lib/sportsBingo.ts`: `listSportsBingoGames` around line 8258 filters candidate count ≥24, local date, and kickoff; `refreshSportsBingoProgress` around line 11190 processes active cards. Its loop around line 11433 skips settled hit/miss squares and only considers certain voids for regrading. `evaluateResolver` and NFL normalization/play helpers are audit targets.
- `components/pickem/PickEmGameList.tsx`: actual horizontal menu around line 985, with explicit NFL special handling. `components/pickem/PickEmSportSelect.tsx` is a second selection surface.
- `app/api/pickem/sports/route.ts` → `lib/pickem.ts:listPickEmSports`; NFL also participates in shared settlement. Preserve that code's dedicated NFL consumers.
- `components/nfl-pickem/WeekSelector.tsx`: native select, literal gold colors; `NFLPickEmGameList.tsx` hosts it.
- `components/ui/Dropdown.tsx`: relative container, absolute `top-full` popup, shared brand tokens, outside-pointer/Escape close. It does not currently implement full native-equivalent arrow-key/focus behavior; verify and improve centrally if needed rather than declaring it fully accessible from its comment.

## Evidence and traps

- `docs/prop-bingo-nfl-activation-plan.md` game-day re-verification (2026-09-09, around line 333) records opener provider game ID **1392216**. Verify stored IDs and teams; this is a lead, not a completed production lookup.
- The test is Wednesday September 9 in New Jersey. The recorded scheduled 20:20 EDT kickoff is **2026-09-10T00:20:00Z**. Search by actual game/start date, not just UTC September 9 or card creation day.
- Activation plan Phase 5 live observation has no completed write-up. `SYSTEM_CONTEXT.md` says NFL flag-gated off, yet the user played NFL: check real deployment evidence rather than treating historical prose as configuration truth.
- `docs/prop-bingo-nfl-week1-audit.md` states historical player-prop odds are unavailable and historical samples omit those slots. A historical score/play or prop-free win-rate pass is not validation of the user's actual prop squares.
- Existing artifacts: `docs/phase0-artifacts/nfl-week1-board-audit-2026-09-09.json`, `nfl-week1-board-audit-2026-09-05.json`, `nfl-historical-board-audit-2025-weeks-1-10-18.json`, `nfl-backtest-2025-full-season-2026-09-05.json`. These are prior sample/backtest artifacts, not confirmed incident board exports.
- Some older audit roster claims were explicitly corrected by the September 9 re-verification. Never infer current player teams from memory or the older audit's names.
- NFL has no implemented BallDontLie webhook route; updates depend on the one-minute Bingo progress cron. Audit endpoint completeness, stale caches, actual cron logs, and card finalization independently.
- `scripts/validate-nfl-bingo-grading.cjs` checks score/play reconstruction, TD scorer parsing, and selected rates. It does not establish complete resolver coverage. Its fetch helper may return partial accumulated rows on errors or page limits; the new incident audit must label truncation/incompleteness, not treat it as a valid empty feed.
- `listSportsBingoGames` builds from candidate catalogs, not a cheap schedule-only probe. Phase 2 must avoid redundant provider/catalog work and share the exact eligibility predicate with Phase 4 capability changes.
- Many tracked filenames have ` 2.ts`/` 2.md` suffixes. Do not rename/delete unrelated duplicates. A guessed `lib/leagueAvailability.ts` does not exist; search actual imports instead.
- Earlier plans mention stale star-index freshness and billing date-sensitive failures. No tests were run this phase; those historical failures are not verified current failures.
- Environment rules: `.env.local` values must never be inspected/printed; names-only inspection is allowed. Existing package scripts use `node --env-file=.env.local` to consume credentials without printing them. Inspect script side effects before running. No environment values were loaded in this phase.
- Do not alter `lib/supabaseAdmin.ts`, existing migrations, or `vercel.json` without applicable authorization. `supabase db push` targets linked production project `pkmxupsayzshvpirkaav` and requires explicit authorization. No such authorization was requested or granted here.
- `CLAUDE.md` requires physical-device verification for Bingo/PWA chrome and says Andrew closes that checklist; headless browser evidence has narrower scope. Complete available automated work before identifying remaining device checks.

## Setup, commands, and verification

Environment: existing Node/npm project, Next.js 16, React 19, TypeScript, Vitest, Playwright available in `package.json`. Read current versions/scripts there; no dependency installation was needed for planning.

At next start:

```sh
git status --short
git branch --show-current
git rev-parse HEAD
npm run test:bingo-nfl
npm run test:bingo-mlb
```

For focused UI/API baseline and final required checks use the exact commands in the plan. Typical final checks:

```sh
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Live diagnostic example (inspect its limitations above first):

```sh
npm run bingo:validate:nfl -- --seasons 2026 --weeks 1
npm run dev
```

Authenticated browser routes require valid cookies (and a signed `tp_sess` if enforced), not localStorage alone. Use the project's auth flow/helpers, not an auth-gate modification.

This phase verified source behavior by reading the named files and prior audit records. Official model/effort guidance was checked at `https://learn.chatgpt.com/docs/models` and `https://developers.openai.com/api/docs/models/gpt-6-astra` on 2026-09-12. The plan references those recommendations; it does not assert availability in every account.

Planning verification is documentation diff/format and link review only. No build, lint, tests, live selector check, provider fetch, or incident replay was run. A runnable original-board replay does not exist yet and must be delivered in Phase 1 with exact commands recorded in its handoff.

## Open questions and next steps

No unresolved product preference blocks starting Phase 1. Evidence dependencies are venue/card IDs, historical feed/log availability, production deployment identity, and credentials/tools that can read the required data without exposing secrets. Search existing project tooling before asking Andrew for anything.

1. Re-read current rules/status; preserve these documentation changes.
2. Identify a safe read-only production access route and recover all incident boards, recording exact IDs and protected snapshot paths.
3. Reproduce observed square discrepancies using original resolvers and independently confirmed outcomes; distinguish grading errors from display/latency problems.
4. Build the capability matrix for all four leagues and sanitized offline replay fixtures.
5. Leave `docs/bingo-pickem-reliability-plan_PHASE_1_HANDOFF.md` before declaring Phase 1 complete (or stopped part-way), and update the plan's phase/top statuses to link it.

If production access is absent, report the exact missing evidence and continue the local inventory and independent selector work when authorized. Do not invent audit results or leave required work marked complete.

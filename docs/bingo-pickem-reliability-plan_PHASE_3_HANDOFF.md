# Bingo and Pick ’Em reliability plan — Phase 3 handoff

## Developer summary

Phase 3 is implemented and locally verified. Regular Pick ’Em no longer shows or serves NFL; old `/pickem/nfl` and `?sport=nfl` links go to the dedicated NFL game while retaining the existing cookie/local-storage venue session. The dedicated NFL week control now uses the shared styled dropdown, preserving week IDs, order, labels, current marker, locked-week access, and URL initialization. This is **not live**: nothing was committed, pushed, deployed, or changed in production. Phase 4 is next and focuses only on Bingo grading/capability work. A real desktop/mobile/PWA visual check remains outstanding.

## Next agent: Phase 4 scope and boundary

Execute **Phase 4 — Fix grading and admit only supported squares**, recommended model **GPT-6 Astra (`gpt-6-astra`), Extra High**. Read Phase 4 in `docs/bingo-pickem-reliability-plan.md`, the Brunswick audit, capability matrix, and this handoff before editing.

Repair only evidenced Bingo grading/live-refresh defects D1–D7 and make square admission depend on capability evidence. Out of scope: Pick ’Em selectors, dedicated NFL settlement/scoring/rewards, Bingo calibration (Phase 5), historical production repair (Phase 6), deployment (Phase 7), auth, and billing. Preserve Phase 2 availability and Phase 3 regular-vs-dedicated NFL routing.

## Starting repository, deployment, and data state

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`; branch: `main`; HEAD: `783ebd2f07bffef05e086ef0687ec53f99377dbc` (`Prop Bingo NFL Phase 2: game-day re-verification, blockers cleared`).
- The tree is intentionally dirty. Phase 0–3 changes are uncommitted; remote alignment was not checked. Preserve unrelated existing modifications and untracked incident artifacts.
- Phase 3 modified `app/api/pickem/games/route.ts`, `app/api/pickem/sports/route.ts`, `app/pickem/page.tsx`, `app/pickem/[sportSlug]/page.tsx`, `components/pickem/PickEmGameList.tsx`, `components/nfl-pickem/WeekSelector.tsx`, `components/ui/Dropdown.tsx`, `lib/pickem.ts`, this plan, `AGENTS.md`, `CLAUDE.md`, and `SYSTEM_CONTEXT.md`.
- Phase 3 added untracked `tests/lib.pickem-regular-sports.test.ts`, `tests/api.pickem-regular-discovery.test.ts`, `tests/components.nfl-pickem-week-selector.test.ts`, and this handoff.
- Earlier untracked artifacts that must remain: the Brunswick audit/matrix, `docs/phase1-artifacts/`, Phase 0–2 handoffs, Bingo incident fixtures/tests, `lib/sportsBingoAvailability.ts`, and audit/replay scripts. Protected private evidence remains ignored under `tmp/bingo-incident-private/`; never commit player/consequence records.
- No package/lockfile, migration, environment file, provider record, database row, flag, or private snapshot changed. `.env.local` was not read. No production endpoint was invoked.
- No commit, push, deploy, live smoke check, or alias movement occurred. Last known production observation remains Phase 1’s September 12 record: Vercel `dpl_4HKutJZ6hgaa7TCpcvQNh4PdC8kv`, created `2026-09-09T17:55:25.369Z`, built from `d282bd35decbadbbf6d5924477361f6b82fe4e01`; it does not contain Phase 2 or 3 work.

## Decisions and as-built Phase 3 behavior

1. `PICKEM_SPORTS` and `listPickEmSports()` retain NFL for legacy picks/history, provider mappings, settlement, and related shared code. New `listRegularPickEmSports()` is a discovery-only filter used by `GET /api/pickem/sports`.
2. `GET /api/pickem/games?sportSlug=nfl` returns HTTP 400 before querying/settling. This prevents stale regular state reviving NFL’s retired daily path and does not affect `/api/nfl-pickem/*`.
3. `/pickem?sport=nfl` and `/pickem/nfl` redirect to `/nfl-pickem`; a supplied `week` query passes through. Venue context is intentionally not encoded in URLs because it remains in the established cookie/local-storage session. Existing regular historical NFL rows remain typed/displayable in `PickEmGameList`.
4. Regular `PickEmGameList` accepts only a clickable returned initial/fallback sport and no longer has NFL week state, NFL exceptions, or an NFL option. `PickEmSportSelect.tsx` and `VenueHubClient` both consume the same filtered sports endpoint.
5. `WeekSelector` maps existing week data to `DropdownOption<string>` labels exactly as before: `week.label` fallback, `formatCalendarDate` start/end, and `(Now)`. IDs/order/callback stay unchanged; `NFLPickEmGameList` retains URL initialization and locked-week viewing.
6. `Dropdown` is anchored via its existing relative wrapper and has `top-full`, trigger width, `max-h-64 overflow-y-auto`, and `z-[1400]`. The page/ancestor layout was inspected: immediate page scrolling supports the control, though an authenticated rendered-browser check was unavailable.
7. Shared `Dropdown` now supports Arrow Up/Down opening/navigation, Home/End, native-button Enter/Space selection, Escape/outside dismissal, `aria-expanded`, listbox/option selected state, and Escape focus return. This also improves the leaderboard consumer using the same primitive.

## Files and relationships

- `lib/pickem.ts`: `listRegularPickEmSports()` filters NFL only at discovery.
- `app/api/pickem/sports/route.ts` uses that filter; `app/api/pickem/games/route.ts` rejects stale NFL requests.
- `app/pickem/page.tsx` and `app/pickem/[sportSlug]/page.tsx` route legacy regular NFL URLs to dedicated NFL, preserving a `week` deep link.
- `components/pickem/PickEmGameList.tsx` removes obsolete NFL daily UI and safely selects only clickable fetched sports; history still permits NFL rows.
- `components/nfl-pickem/WeekSelector.tsx` uses `components/ui/Dropdown.tsx`; the primitive contains all keyboard/focus behavior.
- New tests cover the registry filter, public route rejection, and selector label/order/current/selection/keyboard behavior.

## Verification record

On 2026-09-13, with installed dependencies and no external credentials, these passed:

```bash
cd /Users/andrewserulneck/Documents/Trivia-Predictions
npx tsc --noEmit
npx eslint app/api/pickem/games/route.ts app/api/pickem/sports/route.ts app/pickem/page.tsx 'app/pickem/[sportSlug]/page.tsx' components/pickem/PickEmGameList.tsx components/nfl-pickem/WeekSelector.tsx components/ui/Dropdown.tsx lib/pickem.ts tests/lib.pickem-regular-sports.test.ts tests/api.pickem-regular-discovery.test.ts tests/components.nfl-pickem-week-selector.test.ts
npx vitest run tests/lib.pickem-regular-sports.test.ts tests/api.pickem-regular-discovery.test.ts tests/components.nfl-pickem-week-selector.test.ts tests/components.nfl-pickem-spreads-banner.test.ts tests/lib.nfl-pickem.test.ts tests/api.nfl-pickem-games-route.test.ts tests/lib.pickem-nfl-scoring-mode.test.ts tests/nfl-pickem-exit-navigation-contract.test.ts --silent=passed-only --reporter=dot
git diff --check
```

TypeScript and targeted ESLint passed with no output. The focused suite passed **8 files / 71 tests** and includes regular filtering/API behavior, dropdown semantic/keyboard behavior, NFL week calculations and game route behavior, NFL scoring settlement, spread banner, and exit navigation. `git diff --check` also passed after the final documentation edits.

Not run: full lint/test/build, provider checks, production/deployment checks, authenticated desktop/narrow browser checks, and iOS/Android installed-PWA popup placement. Do not treat jsdom as visual certification.

## Facts and traps

- Do not delete NFL from `PickEmSportSlug`, `PICKEM_SPORTS`, BallDontLie mappings, old picks/history, or settlement. Dedicated NFL and old rows need the shared definitions.
- The dropdown prop is `ariaLabel`, not `aria-label`; passing the latter to this React component silently loses the trigger name.
- `Dropdown` uses React’s keyboard-event type for JSX and `globalThis.KeyboardEvent` for document listeners. Preserve this distinction for `tsc`.
- Do not reintroduce regular NFL week UI. Dedicated `/nfl-pickem` uses `/api/nfl-pickem/weeks` and `/api/nfl-pickem/games`.

## Recommended Phase 4 first steps

1. Read all three instruction files, Phase 4 plan section, Brunswick audit, capability matrix, and this handoff. Run `git status --short` first.
2. Run incident/capability focused tests before code changes, then work defect-by-defect. Do not weaken expected-failure assertions until each repair is verified.
3. Centralize supported-square admission and require provider-field, identifier, timing, retry/void, and regression-fixture evidence for every admitted family.
4. Before reporting Phase 4 complete or stopping, write `docs/bingo-pickem-reliability-plan_PHASE_4_HANDOFF.md`, update status pointers, and do not deploy/repair production without separate authorization.

# Squares + Brackets — Phase 6.5 handoff (quarter rule vs live captures) — IN PROGRESS

**Date:** 2026-10-19 (interim; updated as captures land). **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 6,
sub-phase 6.5). **Next:** finish 6.5 (below), then 6.6, Opus 5.5 · high.

## For Andrew (plain English)
- **What this phase does:** checks that the rule deciding "this quarter is over" works on a real NFL broadcast feed,
  not just on our test data. It does that by recording two real games minute by minute and replaying them.
- **Status:** the two recorders from Phase 2 were no longer running when 6.5 started (4:24 PM ET Oct 19; no recording
  existed), so they were restarted. They are waiting for kickoff: **WSH @ SF tonight 8:15 PM ET** and **NE @ CHI Thu
  Oct 22 8:15 PM ET**.
- **Needs you:** keep the Mac **on, plugged in and with the lid open** until about midnight tonight and again Thursday
  night. (`caffeinate` stops idle sleep, but closing the lid still sleeps the Mac and stops the recording.)
- **Live?** Nothing changes on the site. The recorders only read the sports feed (~250 requests per game).

## For the next agent

### 1. Goal / scope
Prove `quartersFinishedFromStatus` / `squaresMomentEvidence` / `planMomentStep` (`lib/squares.ts`) against a real
live game: `npx vitest run tests/squares-engine.test.ts` ("live capture replay" picks up every
`tests/fixtures/squares/nfl-live-capture-<id>.json` automatically). If the live `status` strings differ from what the
regex expects, adjust `quartersFinishedFromStatus` and add the real strings as test cases; record them in plan §8.
Out of scope: 6.6–6.9.

### 2. Starting state
Branch `main` at `c43fa66` (6.4) when 6.5 started; nothing pushed. Uncommitted and NOT ours: `docs/pos-rewards-integration-plan.md`,
`docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, the POS hunk of `CLAUDE.md`.

Recorders (started 2026-10-19 16:24 ET, detached with `nohup caffeinate -i`):
- `1392308` WSH @ SF, PID 10301, log `~/Library/Caches/hightop-squares-capture/capture-1392308.log`
- `1392309` NE @ CHI, PID 10302, log `~/Library/Caches/hightop-squares-capture/capture-1392309.log`
Check with `ps -p 10301,10302`. Each writes its fixture after every poll, so a killed run still leaves data; it starts
10 min before kickoff and stops after 10 final polls (or 7 h).

### 3–8
To be completed when the captures land. If both recorders died, re-run
`node --env-file=.env.local scripts/capture-nfl-live-game.cjs <id>` on a later prime-time game (find ids via
`GET /nfl/v1/games?dates[]=YYYY-MM-DD`).

# Native app plan — Phase 9f.6 handoff (Pick 'Em shared points) — 2026-10-23

## For Andrew (plain English)
- **What changed:** when a player shares "today's wins" from Pick 'Em, the points now add up each won pick's own value instead of assuming 10 per pick. Today every pick is worth 10, so the number on screen is the same as before. It only matters once a pick is worth something other than 10.
- **Live?** No. Nothing is committed, pushed or deployed. You asked for 9f.1–9f.6 in one deploy.
- **Cost:** none. No new reads or writes.
- **Needs you:** nothing for this phase. Your phone check is part of section J of `docs/native-app-device-checklist.md` after the deploy.

## For the next agent

### 1. Next phase and scope
Phase 9f.6 is done. Next, per the plan: ONE deploy of 9f.1–9f.6 (the 9f.2 part also needs an app rebuild), then Andrew installs the build on his iPhone (section 9 of `docs/native-app-store-plan_PHASE_9F_3_HANDOFF.md`), then Phase 9g. Out of scope: review finding 17 (relative `./` imports in `lib/socialShare/`, not scheduled).

### 2. Starting state
- Branch `main`, last commit `20a97e2`. **Nothing from 9f–9f.6 is committed, pushed or deployed.** No migration, no data touched.
- Uncommitted by 9f.6: `components/pickem/PickEmGameList.tsx`, `tests/pickem-today-win-points.test.ts` (new), the plan's status line, this file.
- Other people's uncommitted files exist (see the 9f.4 handoff §2). `CLAUDE.md` holds someone else's POS hunk: never stage it. Stage share hunks only.

### 3. Decisions already made
- Andrew: ship 9f.1–9f.6 in one deploy, then install on his iPhone.
- The 9f.6 spec (`docs/native-app-store-plan.md`, "##### 9f.6") was followed as written: sum each won game's `userPickRewardPoints` with the same `|| 10` fallback as the history total.

### 4. Files
- `components/pickem/PickEmGameList.tsx`: new exported pure helper `todayWinPointsOf(games)` (placed under the `PickEmGame` type). `todayWinPoints` in the component is now `useMemo(() => todayWinPointsOf(games), [games])`. The old `won count × 10` is gone. `ShareWinButton` (`gameType="pickem"`) still gets the number only when it is > 0.
- `tests/pickem-today-win-points.test.ts`: 4 cases: a won game worth 20 → 20 (the R13 case); mixed values sum and skip lost/pending; missing value → 10; nothing won → 0.

### 5. Facts and traps
- The helper is exported from a `.tsx` component file on purpose: the same pattern as `getSpreadsBannerState` in `NFLPickEmGameList.tsx`, so it can be tested without rendering.
- The `PickEmGame` type is not exported; the test derives it with `Parameters<typeof todayWinPointsOf>[0][number]`.
- `userPickRewardPoints` is set from `reward_points` in `lib/pickem.ts` (~line 1982), defaulting to `PICKEM_REWARD_POINTS` (10). Today's value is always 10, so there is no visible change yet.

### 6. Build / test / verified
Run sequentially, all passing:
- `npx tsc --noEmit`: clean (exit 0).
- `npm run lint`: clean (exit 0).
- `npm run test`: **442 files passed, 1 skipped; 5,431 tests passed, 13 skipped, 0 failed** (includes the new 4).
- `npm run build`: exit 0.
- Targeted: `tests/pickem-today-win-points.test.ts` and `tests/share-win-button.test.ts` → 16/16.
- **Not verified** in a browser or on a phone. The share button rendering with a non-10 value is covered only by the helper's unit tests.

### 7. Open questions
- Andrew: OK to commit and push 9f.1–9f.6 together, then run the deploy and the iPhone install?

### 8. Recommended first steps for the next step
1. Commit 9f.1–9f.6 (stage share hunks only; never `CLAUDE.md`), push, deploy the website (`vercel:deploy prod` after Andrew's OK).
2. Rebuild the iPhone app for 9f.2 (`native/`, see `docs/native-app-store-plan_PHASE_2A_HANDOFF.md` for iOS build steps).
3. Phase 9g per the plan.

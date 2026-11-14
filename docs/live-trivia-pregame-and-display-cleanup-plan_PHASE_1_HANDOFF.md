# Phase 1 handoff — no ads on the display

## For Andrew
The Carrabba's pop-up can no longer appear on the TV display, the Display page preview, or `/tv`. Code is written and tested but **not committed or deployed** — it needs a commit/PR and deploy to fix the live bug. I did not do the browser check with a mocked ad (see "Unverified"). Your answers to the section 6 questions change Phase 2–3 (below).

## Changes
- `lib/playerRuntimePaths.ts`: new `isVenueDisplayPath` (`/venue/<id>/screen[/…]`, `/tv`, `/tv/…`); `isPlayerRuntimePath` returns false for them (still fails open on null).
- `components/ui/PopupAds.tsx`: `resolvePageKey` returns null on display paths (every effect bails on a null key).
- `components/ui/MobileAdhesionAd.tsx`: `isAdExcludedRoute` includes display paths (kept on one line so `tests/category-blitz-mobile-shell-contract.test.ts` regex still matches).
- Tests: `tests/player-runtime-contract.test.ts` (removed `/tv` from player list, added display paths), new `tests/venue-display-no-ads-contract.test.ts`.
- Ad row `374a6bcb-…` untouched.

## Verified
`npm run test` all green after the fix (the one failure was the category-blitz shell regex, fixed); `npx tsc --noEmit` and eslint on changed files clean.

## Unverified
Scratchpad-clone browser check (mock `/api/ads/slot`, confirm no pop-up and no request) not run. Do it in Phase 6 or before deploy.

## For the next agent (Phase 2, Opus 5.5 / high)
- Branch `main`, last commit `88c3be1b`; Phase 1 files above are uncommitted. Untracked `tests/* 2.ts` duplicates are not ours.
- **Andrew's answers, Phase 2–3 must follow:**
  1. **No Category Blitz "Next up" card at all** (scheduled and on-demand), not just on Live Trivia days. Drop D7's "Live Trivia today" computation; `idle.liveTriviaToday` is not needed. Category Blitz appears on the display only when a round is actually in play (peek only; never start one).
  2. **Idle screen when no Live Trivia content:** gently animated (not static) with a QR to download the app (`APP_DOWNLOAD_URL`, `lib/appDownloadLink.ts`). Replaces the Next-up carousel's Category Blitz card; likely a `TvIdleAttract` / `IdleVenueScreen` change (Phase 3 UI). Confirm with Andrew how this interacts with the existing carousel's other cards.
  3. Category Blitz started in the 15 min pre-game → display shows pre-game, phone game unaffected (D8).
  4. Pre-game shows small "Round 1: <category>" only when known.
  5. No short domain.
- Rest of Phase 2 as in the plan (mode `live-trivia-pregame`, `LIVE_TRIVIA_PREGAME_LEAD_MS`, poll pace, takeover must fire at pre-game → live, not idle → pre-game).
- Commands: `npm run test`, `npx tsc --noEmit`, `npm run lint`. Never use :3000 or `pkill next`.

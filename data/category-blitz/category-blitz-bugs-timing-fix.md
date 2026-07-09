Solo play hits a spectator/grace-period race in lib/categoryBlitz.ts:779-824: if you join right as the round starts, registerSessionPresence may mark your first_seen_at a moment after round.started_at. If that gap exceeds the 8s SPECTATOR_GRACE_SECONDS, submitAnswer() throws "You're spectating this round" and none of your answers are ever persisted to category_blitz_submissions.

That single failure cascades:

"No answer" on every field — CategoryBlitzGame.tsx:463-467 shows that fallback whenever buildResults() finds zero submission rows for you. Not a display bug — it's accurately reporting you have no saved answers.
No grading cascade / no reveal animation — CategoryBlitzGame.tsx:967-997: when your gradingAnswers array is empty, an effect immediately auto-skips "reveal" → "results", meaning GradingCascade and RevealSequence never mount. They're wired correctly, just never reached for you.
Empty leaderboard — mergeCumulativeSessionTotals() (lib/categoryBlitz.ts:863-884) early-returns when no round submissions exist, so your points never get written into cumulative_totals at all.
Separately, a by-design gate compounds this for solo testing: insufficientPlayers = participantCount < 3 (lib/categoryBlitz.ts:944) zeroes every point and stamps "insufficient_players" even when submissions do save. So even after fixing the spectator race, a lone player will never see non-zero scores or a populated leaderboard by current design — that's intentional (per docs/category-blitz-scoring-and-bugfix-plan.md), but it means you may never be able to fully verify grading/leaderboard solo without a scoring-gate override for testing.

Both plan docs claim "ALL PHASES DONE," but their Phase 5 verification only used seeded 3-4 player sessions — solo play was never exercised against this pipeline.

Fix plan
Phase 1 — Fix the spectator/grace race (small, surgical)
Widen or eliminate the race between round-start and presence registration so a player who is present when the round begins never gets bucketed as a late joiner. Likely a timing/ordering fix in registerSessionPresence vs. round creation.
→ Sonnet, medium effort. This is a well-scoped, localized logic fix once the race is understood — no architecture changes needed.

Phase 2 — Add a test-only override for the <3-player gate (small)
Add an env flag or dev-mode toggle (e.g. CATEGORY_BLITZ_ALLOW_SOLO_SCORING) so you can verify grading/leaderboard end-to-end while testing alone, without changing production scoring rules.
→ Sonnet, low-medium effort.

Phase 3 — Verify end-to-end with the /verify skill (this repo has one built for exactly this)
Seed a throwaway solo session, play a round, and confirm: submissions persist → GradingCascade renders → RevealSequence plays → intermission → LiveLeaderboard shows your score.
→ Sonnet, medium effort (Playwright-driven, methodical, not high-reasoning work).

Phase 4 — Re-verify multi-player path wasn't broken
Since Phase 1 touches shared timing logic, re-run a 3+ player seeded scenario to confirm grading/points/leaderboard still work as the docs claimed.
→ Sonnet, low effort (regression check, not new design).

On model choice
You don't need to switch to Codex or Deepseek — this wasn't a "Claude is struggling" problem, it was that the bug hadn't been root-caused yet. Now that the causal chain is identified with exact file:line references, this is mechanical, well-scoped fix work, which Sonnet handles well. I'd only reach for Opus if Phase 1's timing fix turns out to require restructuring how presence/round-start ordering works across categoryBlitzRealtime.ts — worth flagging if that surfaces once you're in the code.
# POS Rewards Integration — Phase 2g Handoff (production setup)

**Plan:** `docs/pos-rewards-integration-plan.md` §2g · **Date:** 2026-10-06 · **By:** Claude Sonnet 5.5
**State:** Agent half of 2g is done (runbook written). The Andrew half, the review gate and the deploy are **not** done. Nothing pushed or deployed; production flag off.

## For Andrew (plain English)
- 2e + 2f are committed (`c138376`). The "Works with your Square register!" line on `/info` is in that commit; it goes live on the next deploy (the Square feature itself stays off).
- I wrote `docs/square-go-live-runbook.md`: the exact Square-console and Vercel steps, the smoke test, how to switch it off, where the logs are.
- **Two things need you:**
  1. **There is no privacy-policy page in the app.** The plan asked me to check the policy mentions POS connections; there is nothing to check. Decide whether you want one before partners connect Square.
  2. **A trap I found:** production has no `NEXT_PUBLIC_APP_URL`, so the Square webhook would answer "not configured" forever unless you also add `SQUARE_WEBHOOK_NOTIFICATION_URL` (value in the runbook).
- Still to do, in order: run your one code review (+ `/security-review`) and fix findings → Square console + Vercel env steps (runbook §1–2, you paste secrets) → you approve a production deploy → smoke test (runbook §3). Also ask Square the two cost/review questions (runbook §0.3).
- Nothing you do here costs money by itself; no Square calls are made until a partner connects.

## For the next agent
1. **Next:** finish 2g, then 2h (real-money pilot; ask Andrew plan §6 item 14 first). Out of scope: Clover (paused), Toast.
2. **Starting state:** branch `main`, HEAD `c138376` (2e+2f), nothing pushed, `clover-spike/` untracked (never `git add -A`). Uncommitted: this handoff, the runbook, the plan status line. Production env verified 2026-10-06 via `vercel env ls production`: **no** `POS_*`/`SQUARE_*`, no `NEXT_PUBLIC_APP_URL`; has `NEXT_PUBLIC_SITE_URL`. No migration, no data changes.
3. **Decisions:** Andrew committed 2e+2f together, kept the `/info` line live, and chose to run **one** code review after 2g rather than one after 2f and another after 2g. So `/code-review high` + `/security-review` on the Square diff since `27f5eea` are **still outstanding** and must pass before the flag is flipped.
4. **Files:** new `docs/square-go-live-runbook.md`, this handoff. Edited plan status line only. No code changed in 2g.
5. **Facts/traps:** webhook returns **503** (not 401) until `SQUARE_WEBHOOK_SIGNATURE_KEY` and a notification URL exist; the plan's "bad signature → 401" smoke test only passes after those are set. Notification URL must equal the Square subscription URL exactly. No pilot gate exists (2c removed it), so the flag exposes Square to all partners. The OAuth redirect URL is not sent by the code; it comes from the Developer Console setting. `POS_TOKEN_KEY` accepts base64 (44 chars) or hex (64). No privacy-policy page found in `app/`, `components/`, `lib/`, `public/`.
6. **Verified:** only the docs above and env-var names/absence. Not run: typecheck/tests (no code changed), the deploy, any Square call.
7. **Open questions:** privacy policy yes/no and wording; pilot merchant (§6 item 14); Square's answers on eGift fees/review.
8. **First steps:** run `/code-review high` and `/security-review` (Opus 5.5 per plan), fix findings, then walk Andrew through runbook §1–3. Record the deploy and smoke-test results in the plan and write the 2h handoff when starting 2h.

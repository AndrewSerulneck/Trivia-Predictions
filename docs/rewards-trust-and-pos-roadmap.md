# Rewards: Clear Descriptions, Fraud-Proof Redemption, POS — Roadmap

**Written:** 2026-10-03. **Status:** nothing started. This page is the map; each plan has its own
status line and per-phase handoff notes.

## The three plans, in order

| # | Plan | What it fixes | Depends on | Size |
|---|---|---|---|---|
| A | `docs/reward-descriptions-plan.md` | Reward cards say when, how often, what to do, and what you win | nothing | 4 phases, ~1 week |
| B | `docs/reward-live-redemption-plan.md` | A moving, tap-reactive coupon so a screenshot looks obviously fake; fixes two redemption security bugs | nothing (A first; both edit the coupon) | 3 phases, a few days |
| C | `docs/pos-rewards-integration-plan.md` | Rewards come off the bill inside Square, then Clover (Toast deferred until we have proof from these two) | B Phase 1 | 4 active phases; Toast later |

A and B touch different files and could run at the same time, but run them **one after the other**
so each `/code-review` sees one change. Start Plan C **Phase 0 (business setup) today** — creating
the Square and Clover developer accounts is free and instant, and Clover's app approval is the
slowest remaining step.

**Decisions so far (all 2026-10-03):** Plan A copy approved as written; the prize wallet coupon says what the guest won it for. Plan B is motion-only — no PIN, staff scan or rotating code. Square before Clover. Toast deferred — build Square
and Clover first, apply to Toast later with real results (2026-10-03, Plan C §1a).

## Phase-by-phase, with model and effort

| Step | Who | Model / effort |
|---|---|---|
| A0 copy sign-off | Andrew — **done 2026-10-03** | — |
| A1 description composer + tests | agent | Opus 5.5 · high |
| A2 serve descriptions from the API | agent | Opus 5.5 · high |
| A3 show them (cards, modal, wizard preview, partner list) | agent | Sonnet 5.5 · high |
| A4 code review + phone check | agent + Andrew | Opus 5.5 · medium |
| B1 fix redemption bugs (session check, once-only) — **done 2026-10-05** (uncommitted; migration **applied to production 2026-10-05** together with the POS foundation one; `docs/reward-live-redemption-plan_PHASE_1_HANDOFF.md`) | agent | Opus 5.5 · high |
| B2 live coupon (shimmer, ticking clock, tap sparkle) — **done 2026-10-05** (uncommitted; `docs/reward-live-redemption-plan_PHASE_2_HANDOFF.md`) | agent | Sonnet 5.5 · high |
| B3 code + security review, phone check — **review done 2026-10-05; phone check passed (Andrew, 2026-10-05)**. Left: delete the test coupon, commit + deploy (`docs/reward-live-redemption-plan_PHASE_3_HANDOFF.md`) | agent + Andrew | Opus 5.5 · medium |
| C0 business setup (Square dev account now, Clover later; who funds prizes) | Andrew — **start now** | — |
| C1 POS foundation — **done 2026-10-04** (uncommitted; `docs/pos-rewards-integration-plan_PHASE_1_HANDOFF.md`) | agent | Opus 5.5 · high |
| C2 Square gift cards — **built 2026-10-05** (uncommitted, flag off; sandbox end-to-end pending Andrew's Square app keys; `docs/pos-rewards-integration-plan_PHASE_2_HANDOFF.md`) | agent | Opus 5.5 · high |
| C3 Clover discounts on open checks | agent | Opus 5.5 · high |
| C4 Toast — **deferred**; re-plan after Square/Clover are live and Toast accepts us | — | — |
| C5 partner reporting + review | agent | Sonnet 5.5 · medium, then Opus 5.5 · medium |

## How to run each phase
Start a fresh Claude Code session, pick the model with `/model` and effort as listed, and say:
"Do Phase N of `docs/<plan>.md`. Read the plan and the previous phase's handoff first." Each phase
ends with a handoff note and stops; nothing is pushed, deployed, or migrated on production without
your OK.

## Production facts at planning time (2026-10-03, read-only query)
5 reward campaigns (1 Live Trivia game-winner, 1 NFL game-winner, 3 legacy admin), 6 prize
redemptions ever, 11 visible venues. Low volume: cost risk in all three plans is small; each plan
still records a baseline and an after-measurement.

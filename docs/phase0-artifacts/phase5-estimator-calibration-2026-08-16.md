# Phase 5b — estimator calibration curve (2026-08-16)

Evidence that the correlated estimator in `lib/sportsBingoCorrelation.ts` is better calibrated than
the independent coin-flip estimator it replaced, and that the error it removes is **not** a constant
bias the target knob could have absorbed.

## Method

`npm run bingo:simulate -- --backtest --seasons 2025 --weeks 6,9,14 --boards 4` at three different
values of `BINGO_BOARD_TARGET_WIN_RATE`. Each run generates 172 boards for 43 completed 2025 NFL
games with the shipped generator and settles every square with the shipped Phase 4 graders. The
`legacyIndep` column is the pre-Phase-5 independent-coin-flip estimate **of the very same boards**,
computed by the harness purely as a diagnostic.

Sampling error on 172 boards at a 25% rate is about 3.3 points, so single-run deltas under ~3 points
are noise; the pattern across the three targets is the signal.

## Result

| Target | Realized | Correlated predicted | error | Legacy independent predicted | error |
| --- | --- | --- | --- | --- | --- |
| 0.15 | 0.128 | 0.162 | **+0.034** | 0.212 | **+0.084** |
| 0.25 | 0.267 | 0.255 | **−0.012** | 0.263 | −0.004 |
| 0.40 | 0.401 | 0.395 | **−0.006** | 0.347 | **−0.054** |

Mean absolute error: **correlated 0.017, legacy 0.047** — roughly 2.7x better.

The important part is the **sign**. The legacy estimator over-predicts easy boards (+0.084 at a 0.15
target) and under-predicts hard ones (−0.054 at 0.40). That is a slope error, not an offset: no
choice of `BINGO_BOARD_TARGET_WIN_RATE` corrects it, which is exactly what the plan's Phase 5
warned about — *"Two separate problems. Only fixing the first is the trap."*

## Repeat measurements at the shipped target (0.25)

Four independent backtest runs, 215 boards each (`--boards 5`), over the same 43 games:

| Run | Realized | Correlated predicted |
| --- | --- | --- |
| 1 | 0.242 | 0.253 |
| 2 | 0.267 | 0.255 |
| 3 | 0.279 | 0.252 |
| 4 | 0.298 | 0.257 |

Mean realized **0.272**, inside the plan's 20–30% band. The estimator sits ~1.5 points below
realized on average, which is inside the sampling error but leans consistently one way — worth
re-checking against a full season before anyone tightens the constants in
`lib/sportsBingoCorrelation.ts`.

## Per-league forward check (`npm run bingo:simulate`)

Predicted win rate for boards generated against the live slate on 2026-08-16:

| League | Boards | Correlated mean | In 20–30% band |
| --- | --- | --- | --- |
| WNBA | 15 | 0.266 | 100% |
| MLB | 60 | 0.328 | 32% |
| NBA | 0 | — | out of season |
| NFL | 0 | — | out of season (Week 1 is 2026-09-10) |

**MLB is the one league that does not reach the band.** Diagnosis and options are in the Phase 5
handoff notes in `docs/prop-bingo-nfl-plan.md`.

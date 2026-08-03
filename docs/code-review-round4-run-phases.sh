#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# CODE REVIEW ROUND 4 — unattended overnight run of docs/code-review-round4-plan.md
#
# Unlike the billing/discounts/NFL runs, this plan has no separate
# docs/<slug>-phaseN.md files — all eight phases (0-8) live as sections inside
# the one master doc. Each step below points the agent at that doc and names
# the exact "## Phase N — ..." heading to implement, plus the phase table at
# the top for the dependency/severity context.
#
# Ordering below already satisfies both stated chains without any extra
# handling: 1 -> 4 (both edit lib/pickem.ts's settlement sweep) and 2 -> 3
# (server/client halves of the same degradation surface) both fall out of
# running 1,2,3,4,5,6,7 in numeric order. 5, 6, 7 are independent and just
# ride along in the same sequence for simplicity.
#
# Nothing in this plan requires live Stripe (Phases 6 and 7 are mocked-SDK
# only, matching round 2/3's precedent) and nothing requires the join/auth
# shell, so — unlike docs/billing-run-phases.sh — there is no companion
# "-verify.sh" held out for daytime supervision. Phase 8's browser pass uses
# the `verify` skill against a throwaway venue (Playwright + seeded test data,
# no real payments), which is safe to run unattended.
#
# Run: bash docs/code-review-round4-run-phases.sh
# ==============================================================================

export CLAUDE_CODE_RETRY_WATCHDOG=1
MAX_RETRIES=5

PLAN_DOC="docs/code-review-round4-plan.md"

if [[ ! -f "$PLAN_DOC" ]]; then
  echo "❌ $PLAN_DOC not found." >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# HARNESS (unchanged from docs/run_phases.sh / docs/billing-run-phases.sh)
# ------------------------------------------------------------------------------

run_claude_step() {
  local model=$1
  local effort=$2
  local prompt=$3
  local session_id=""
  local attempt=0
  local output
  local status

  echo "--------------------------------------------------" >&2
  echo "🚀 Running Step ($model/$effort): $prompt" >&2
  echo "--------------------------------------------------" >&2

  while true; do
    attempt=$((attempt + 1))
    status=0
    if [[ -z "$session_id" ]]; then
      output=$(claude --model "$model" --effort "$effort" -p "$prompt" --output-format json) || status=$?
    else
      output=$(claude --resume "$session_id" -p "$prompt" --output-format json) || status=$?
    fi

    if [[ $status -eq 0 ]]; then
      break
    fi

    session_id=$(echo "$output" | jq -r '.session_id // empty' 2>/dev/null || true)

    if [[ $attempt -ge $MAX_RETRIES ]]; then
      echo "❌ Step failed after $MAX_RETRIES attempts. Halting to avoid a silent infinite loop." >&2
      echo "$output" >&2
      exit 1
    fi

    echo "" >&2
    echo "⚠️ Step failed (attempt $attempt/$MAX_RETRIES) — treating as rate limit/session pause." >&2
    echo "⏰ Sleeping for 20 minutes before resuming the same session..." >&2
    echo "--------------------------------------------------" >&2
    sleep 1200
  done

  echo "✅ Step Complete!" >&2
  echo "$output" | jq -r '.result // empty'
}

run_local_verification() {
  echo "--------------------------------------------------"
  echo "⚙️ Running Local Verification (0 Tokens)..."
  echo "--------------------------------------------------"
  if npm run build && npm test; then
    echo "✅ Local build & tests passed!"
    return 0
  else
    echo "❌ Local verification failed!"
    return 1
  fi
}

verify_or_fix() {
  if ! run_local_verification; then
    echo "⚠️ Build failed! Sending errors to Claude to fix before proceeding..."
    run_claude_step "sonnet" "high" "The build or test suite just failed. Run 'npm run build' and 'npm test' to inspect the exact errors, then fix them concisely."
    if ! run_local_verification; then
      echo "❌ Verification failed twice. Halting script to preserve tokens."
      exit 1
    fi
  fi
}

# next-env.d.ts is auto-generated; never commit dev-server churn on it.
reset_next_env_dts() {
  if ! git diff --quiet -- next-env.d.ts 2>/dev/null; then
    echo "↩️  Reverting incidental next-env.d.ts churn from a dev server run..."
    git checkout -- next-env.d.ts
  fi
}

SENSITIVE_PATH_PATTERN='proxy\.ts|lib/supabaseAdmin\.ts|lib/serverSession\.ts|supabase/migrations/|vercel\.json|lib/domainSplit\.ts|stripe'
LARGE_DIFF_LINE_THRESHOLD=150

pick_review_model() {
  local diff_files
  diff_files=$(git diff --name-only -- . \
    ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)pnpm-lock.yaml' \
    ':(exclude)dist' ':(exclude)build' ':(exclude).next' ':(exclude)next-env.d.ts')

  if [[ -z "$diff_files" ]]; then
    echo "sonnet"
    return
  fi
  if echo "$diff_files" | grep -qE "$SENSITIVE_PATH_PATTERN"; then
    echo "opus"
    return
  fi
  local changed_lines
  changed_lines=$(git diff --numstat -- . \
    ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)pnpm-lock.yaml' \
    ':(exclude)dist' ':(exclude)build' ':(exclude).next' ':(exclude)next-env.d.ts' \
    | awk '{ add+=$1; del+=$2 } END { print add+del }')
  changed_lines=${changed_lines:-0}
  if [[ "$changed_lines" -gt "$LARGE_DIFF_LINE_THRESHOLD" ]]; then
    echo "opus"
  else
    echo "sonnet"
  fi
}

# ------------------------------------------------------------------------------
# RUN LOG — shared memory across the 9 independent `claude -p` invocations
# below (each is its own process with no memory of the others).
# ------------------------------------------------------------------------------
RUN_LOG="docs/code-review-round4-run-log.md"
cat > "$RUN_LOG" << 'EOF'
# Code Review Round 4 Run Log

Shared memory between the independently-run phases in
docs/code-review-round4-run-phases.sh. Each phase reads this file first; a
note here about an earlier phase supersedes anything that contradicts it in
that phase's own section of docs/code-review-round4-plan.md.
EOF

# Usage: phase_prompt <phase_number> <phase_heading> [extra instructions]
# <phase_heading> is the exact "## Phase N — ..." text in the plan doc, so
# the agent doesn't have to guess which section is meant.
phase_prompt() {
  local phase_num=$1
  local phase_heading=$2
  local extra=${3:-}
  printf 'First read %s — it may be empty (nothing to report yet) or contain discoveries or corrections from earlier phases. If anything there conflicts with %s, follow the run log and note why. Then read %s in full for the phase table and dependency/severity notes at the top, and implement ONLY the section headed "%s" (do not start other phases). %s Before finishing, append a section headed "## Phase %s" to %s (under 150 words) covering: any deviation from the phase doc and why, any discovery later phases must know, and anything later phases can now skip. Be concise.' \
    "$RUN_LOG" "$PLAN_DOC" "$PLAN_DOC" "$phase_heading" "${extra}" "$phase_num" "$RUN_LOG"
}

# ==============================================================================
# PHASES — run in numeric order, which already satisfies both stated chains
# (1->4 via lib/pickem.ts; 2->3 via the games-route/client degradation pair).
# ==============================================================================

echo "===================================================="
echo "CODE REVIEW ROUND 4 — $PLAN_DOC"
echo "===================================================="

run_claude_step "haiku" "low" \
  "$(phase_prompt 0 'Phase 0 — Baseline')"
reset_next_env_dts
verify_or_fix
reset_next_env_dts

run_claude_step "opus" "high" \
  "$(phase_prompt 1 "Phase 1 — Spread grading must apply the line once, not twice" \
    "This is the highest-severity finding in the round — it mis-grades real spread picks. Do not skip the already-settled-picks audit in work item 4; if the count there is nonzero, STOP and note it in the run log instead of re-grading anything, since claimed points/reward accrual may be involved.")"
reset_next_env_dts
verify_or_fix
reset_next_env_dts

run_claude_step "opus" "medium" \
  "$(phase_prompt 2 "Phase 2 — A venue-settings read failure must not 500 the games list" \
    "Do not fall back to a guessed scoring mode (\"standard\" or \"spread\") on a read failure — both are wrong in different ways per the phase doc. Follow its recommendation to report the mode as unresolved and degrade the UI, sharing Phase 3's surface.")"
reset_next_env_dts
verify_or_fix
reset_next_env_dts

run_claude_step "sonnet" "medium" \
  "$(phase_prompt 3 "Phase 3 — The client must surface \`spreadsUnavailable\`" \
    "This project has no DOM-rendering test harness (environment: node in vitest.config.ts, no jsdom, no .test.tsx files) — extract the banner condition to a plain exported function and unit-test that, per round 3 Phase 7's precedent, rather than adding jsdom.")"
reset_next_env_dts
verify_or_fix
reset_next_env_dts

run_claude_step "sonnet" "medium" \
  "$(phase_prompt 4 "Phase 4 — Settlement's scoring-mode skip must not be silent" \
    "The policy here (keep pending, do not void, do not fall back to standard) was already decided by round 3 Phase 4 for the sibling missing-line branch — apply it, do not re-litigate it.")"
reset_next_env_dts
verify_or_fix
reset_next_env_dts

run_claude_step "sonnet" "medium" \
  "$(phase_prompt 5 "Phase 5 — The line refresh must not clobber a concurrent lock")"
reset_next_env_dts
verify_or_fix
reset_next_env_dts

run_claude_step "opus" "medium" \
  "$(phase_prompt 6 "Phase 6 — A discount create/update must not blank the mirror on an unresolvable coupon" \
    "Distinguish \"no coupon reference in the payload\" from \"resolution failed\" before touching resolveDiscountCoupon's callers — only the second case should suppress the write. Do not touch the deleted-branch logic from round 3 Phase 5.")"
reset_next_env_dts
verify_or_fix
reset_next_env_dts

run_claude_step "sonnet" "medium" \
  "$(phase_prompt 7 "Phase 7 — \`grant-manual\` must validate before it mutates Stripe" \
    "Only reorder validation above the two Stripe mutations (force-cancel, coupon detach) — do not change what the existing 409 guards or the detach's skip conditions do.")"
reset_next_env_dts
verify_or_fix
reset_next_env_dts

run_claude_step "sonnet" "high" \
  "$(phase_prompt 8 "Phase 8 — Verification + close-out" \
    "No live Stripe pass is needed or expected here (Phases 6-7 are mocked-SDK only). Use the verify skill for the Phases 1-4 browser pass against a throwaway venue with seeded test data — no real payments are involved, so this is safe to run unattended. Remember .env.local's STRIPE_SECRET_KEY is LIVE if any Stripe key is touched at all, which should not be necessary.")"
reset_next_env_dts
verify_or_fix
reset_next_env_dts

# ==============================================================================
# FINAL CODE REVIEW & INSTRUCTION EXECUTION over the accumulated diff
# ==============================================================================
REVIEW_MODEL=$(pick_review_model)

echo "--------------------------------------------------"
echo "🔍 Running Final Code Review ($REVIEW_MODEL for Analysis)..."
echo "--------------------------------------------------"

REVIEW_PROMPT=$(cat << EOF
For context, $RUN_LOG records deviations and discoveries each phase noted as it ran — read it first.

Analyze the accumulated uncommitted changes in git diff (ignoring lockfiles, build directories, and next-env.d.ts).
Perform a strict code review focusing on:
1. Security vulnerabilities or missing input sanitization.
2. Edge cases and logical bugs.
3. Violations of performance best practices or architectural mismatches.

If NO critical issues exist, reply EXACTLY with: "NO_ISSUES_FOUND".
Otherwise, output a numbered, actionable checklist of necessary fixes. Do NOT attempt to fix them yet—just list the instructions clearly.
EOF
)

REVIEW_FINDINGS=$(run_claude_step "sonnet" "high" "$REVIEW_PROMPT")

if [[ "$REVIEW_FINDINGS" == "NO_ISSUES_FOUND" ]]; then
  echo "✅ No issues found in review. Skipping fix pass."
else
  echo "🛠️ Executing Review Instructions (Opus for Complex Fixes)..."
  FIX_PROMPT=$(cat << EOF
The following code review findings were produced against the current git diff.
Execute the listed fixes concisely, modifying files as needed.

$REVIEW_FINDINGS
EOF
)
  run_claude_step "opus" "high" "$FIX_PROMPT" > /dev/null
fi

reset_next_env_dts
verify_or_fix
reset_next_env_dts

echo "===================================================="
echo "🎉 CODE REVIEW ROUND 4 COMPLETE."
echo "Nothing was committed automatically. Review the working tree in the"
echo "morning and split the diff into commits yourself."
echo "See $RUN_LOG for the phase-by-phase notes."
echo "===================================================="

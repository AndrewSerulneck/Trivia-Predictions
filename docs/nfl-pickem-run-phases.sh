#!/usr/bin/env bash
set -euo pipefail

export CLAUDE_CODE_RETRY_WATCHDOG=1

MAX_RETRIES=5

# Helper function to run a Claude command until it succeeds.
# Captures the session id on first attempt and resumes into the SAME
# session on retry, so a rate-limited step continues instead of
# restarting from scratch (saves tokens, preserves partial progress).
# Prints the step's final text reply to stdout so callers can capture it.
# Usage: run_claude_step <model> <effort> <prompt>
# effort is one of: low, medium, high, xhigh, max
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

  # Emit the assistant's final text reply on stdout so callers can capture
  # it (e.g. `result=$(run_claude_step ...)`) and hand it to the next step.
  echo "$output" | jq -r '.result // empty'
}

# Zero-Token local validation
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

# Picks Sonnet vs Opus for the review pass based on the size/sensitivity of
# the accumulated diff, rather than always using one model. Escalates to
# Opus if the diff is large OR touches a boundary that's expensive to get
# wrong (auth gate, admin DB client, migrations, billing config).
SENSITIVE_PATH_PATTERN='proxy\.ts|lib/supabaseAdmin\.ts|lib/serverSession\.ts|supabase/migrations/|vercel\.json|lib/domainSplit\.ts|stripe'
LARGE_DIFF_LINE_THRESHOLD=150

pick_review_model() {
  local diff_files
  diff_files=$(git diff --name-only -- . \
    ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)pnpm-lock.yaml' \
    ':(exclude)dist' ':(exclude)build' ':(exclude).next')

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
    ':(exclude)dist' ':(exclude)build' ':(exclude).next' \
    | awk '{ add+=$1; del+=$2 } END { print add+del }')
  changed_lines=${changed_lines:-0}

  if [[ "$changed_lines" -gt "$LARGE_DIFF_LINE_THRESHOLD" ]]; then
    echo "opus"
  else
    echo "sonnet"
  fi
}

# Helper to run verification and trigger a self-fix if broken
verify_or_fix() {
  if ! run_local_verification; then
    echo "⚠️ Build failed! Sending errors to Claude to fix before proceeding..."
    run_claude_step "sonnet" "high" "The build or test suite just failed. Run 'npm run build' and 'npm test' to inspect the exact errors, then fix them concisely."
    
    # Second check to ensure fix worked
    if ! run_local_verification; then
      echo "❌ Verification failed twice. Halting script to preserve tokens."
      exit 1
    fi
  fi
}

# ==============================================================================
# EXECUTION PHASES — NFL Pick 'Em improvements
# Master plan: docs/nfl-pickem-improvements-plan.md
# ==============================================================================

# Shared memory between independently-run phases. Reset at the start of every
# full run (a re-run of the whole script starts fresh; it is not meant to
# accumulate across separate invocations of the plan). Each phase reads this
# file first and may deviate from its own phase doc if something noted here
# supersedes it, then appends its own findings before finishing. This is
# deliberately NOT full conversation history (that would reintroduce context
# drift / cache-expiry cost across 7 independent sessions) — it's a bounded,
# on-disk handoff of only what later phases actually need to know.
RUN_LOG="docs/nfl-pickem-run-log.md"
cat > "$RUN_LOG" << 'EOF'
# NFL Pick 'Em Run Log

Shared memory between the independently-run phases in docs/run_phases.sh.
Each phase reads this file first; a note here about an earlier phase
supersedes anything that contradicts it in that later phase's own doc.
EOF

# Builds a phase prompt that wires in the run-log read/write protocol so it
# doesn't have to be repeated by hand in every call below.
# Usage: phase_prompt <phase_number> <phase_doc> [extra instructions...]
phase_prompt() {
  local phase_num=$1
  local phase_doc=$2
  local extra=${3:-}
  printf 'First read %s — it may be empty (nothing to report yet) or contain discoveries or corrections from earlier phases. If anything there conflicts with %s, follow the run log and note why. Read %s and implement it.%s Before finishing, append a section headed "## Phase %s" to %s (under 150 words) covering: any deviation from the phase doc and why, any discovery later phases must know, and anything later phases can now skip. Follow docs/nfl-pickem-improvements-plan.md for global constraints. Be concise.' \
    "$RUN_LOG" "$phase_doc" "$phase_doc" "${extra:+ $extra}" "$phase_num" "$RUN_LOG"
}

# Phase 0 — expand the dev test-data seed so later phases are verifiable
run_claude_step "sonnet" "medium" "$(phase_prompt 0 docs/nfl-pickem-phase0.md)"
verify_or_fix

# Phase 1 — instant optimistic pick feedback
run_claude_step "sonnet" "high" "$(phase_prompt 1 docs/nfl-pickem-phase1.md)"
verify_or_fix

# Phase 2 — per-game locking; remove the countdown
run_claude_step "sonnet" "medium" "$(phase_prompt 2 docs/nfl-pickem-phase2.md)"
verify_or_fix

# Phase 3 — week dropdown (past + current only)
run_claude_step "sonnet" "high" "$(phase_prompt 3 docs/nfl-pickem-phase3.md)"
verify_or_fix

# Phase 4 — back button returns to venue home (requires diagnosis)
run_claude_step "opus" "high" "$(phase_prompt 4 docs/nfl-pickem-phase4.md "It requires diagnosing a navigation race before changing code — confirm or refute the stated hypothesis first, then fix.")"
verify_or_fix

# Phase 5 — leaderboard API (pick-privacy rules are security-sensitive)
run_claude_step "opus" "high" "$(phase_prompt 5 docs/nfl-pickem-phase5.md "The pick-privacy rule must be enforced server-side by omitting fields, not client-side.")"
verify_or_fix

# Phase 6 — leaderboard UI
run_claude_step "sonnet" "high" "$(phase_prompt 6 docs/nfl-pickem-phase6.md "Build against the API contract established in docs/nfl-pickem-phase5.md.")"
verify_or_fix

# ==============================================================================
# FINAL CODE REVIEW & INSTRUCTION EXECUTION
# ==============================================================================
REVIEW_MODEL=$(pick_review_model)

echo "--------------------------------------------------"
echo "🔍 Running Final Code Review ($REVIEW_MODEL for Analysis)..."
echo "--------------------------------------------------"

REVIEW_PROMPT=$(cat << EOF
For context, $RUN_LOG records deviations and discoveries each phase noted as it ran — read it first.

Analyze the accumulated uncommitted changes in git diff (ignoring lockfiles and build directories).
Perform a strict code review focusing on:
1. Security vulnerabilities or missing input sanitization.
2. Edge cases and logical bugs.
3. Violations of performance best practices or architectural mismatches.

If NO critical issues exist, reply EXACTLY with: "NO_ISSUES_FOUND".
Otherwise, output a numbered, actionable checklist of necessary fixes. Do NOT attempt to fix them yet—just list the instructions clearly.
EOF
)

# 1. Cheap/Fast analysis pass using Sonnet (capture its reply — separate
#    `claude -p` invocations do NOT share context, so the next step needs
#    this text handed to it explicitly).
REVIEW_FINDINGS=$(run_claude_step "sonnet" "high" "$REVIEW_PROMPT")

if [[ "$REVIEW_FINDINGS" == "NO_ISSUES_FOUND" ]]; then
  echo "--------------------------------------------------"
  echo "✅ No issues found in review. Skipping fix pass."
  echo "--------------------------------------------------"
else
  echo "--------------------------------------------------"
  echo "🛠️ Executing Review Instructions (Opus for Complex Fixes)..."
  echo "--------------------------------------------------"

  # 2. High-reasoning execution pass using Opus, given the findings directly.
  FIX_PROMPT=$(cat << EOF
The following code review findings were produced against the current git diff.
Execute the listed fixes concisely, modifying files as needed.

$REVIEW_FINDINGS
EOF
)
  run_claude_step "opus" "high" "$FIX_PROMPT" > /dev/null
fi

# 3. Verify that Opus's fixes didn't break tests/builds
verify_or_fix
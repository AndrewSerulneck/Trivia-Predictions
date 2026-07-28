#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# REUSABLE MULTI-PHASE PLAN RUNNER
#
# Executes a numbered set of phase docs, each as an independent, unattended
# `claude -p` invocation, with automatic retry-on-failure, build/test
# verification after every phase, cross-phase memory via an on-disk run log,
# and a final strict code review pass.
#
# To use for a NEW plan:
#   1. Write docs/<slug>-plan.md (global constraints / decisions all phases
#      must follow) and docs/<slug>-phase0.md, docs/<slug>-phase1.md, ...
#      (one focused instruction doc per phase, numbered from 0).
#   2. Set PLAN_SLUG below to <slug>.
#   3. Fill in PHASES: one line per phase — just the phase number, model,
#      and effort. The phase doc path is derived automatically as
#      docs/<slug>-phase<N>.md, so there's nothing else to type.
#   4. Run: bash docs/run_phases.sh
#
# A worked example of a filled-in copy (not a template — an actual run) is
# docs/nfl-pickem-run-phases.sh.
# ==============================================================================

# ==============================================================================
# CONFIGURE YOUR PLAN HERE
# ==============================================================================

# Short kebab-case identifier for this plan. Used to name the run log
# (docs/<PLAN_SLUG>-run-log.md) and to derive each phase's doc path
# (docs/<PLAN_SLUG>-phase<N>.md) — so different plans never collide and
# phase docs never need to be typed out below.
PLAN_SLUG="nfl-pickem-reward"

# The master plan doc every phase should follow for shared/global
# constraints (product decisions, coding conventions, "do not touch" list,
# etc). Leave as "" if this plan doesn't have one.
PLAN_DOC="/Users/andrewserulneck/Documents/Trivia-Predictions/docs/nfl-pickem-reward-plan.md"

# One entry per phase, in execution order. Just fill in the phase number,
# model, and effort:
#   "phase_number|model|effort|extra instructions (optional)"
#   phase_number: matches docs/<PLAN_SLUG>-phase<N>.md
#   model:  sonnet | opus | haiku
#   effort: low | medium | high | xhigh | max
#   extra:  optional freeform text appended to the prompt for this phase only
#           (e.g. "This requires diagnosing X before changing code.") — the
#           trailing "|" can just be left off if unused.
#
# Example (this is what the NFL Pick 'Em run actually used — see
# docs/nfl-pickem-run-phases.sh for the full worked copy):
#   PHASES=(
#     "0|sonnet|medium"
#     "1|sonnet|high"
#     "4|opus|high|Diagnose the navigation race first."
#   )
PHASES=(
  "0|sonnet|medium"
  "1|opus|high"
  "2|sonnet|high"
  "3|opus|high"
  "4|opus|high"
  "5|sonnet|high"
  "6|opus|high"
  "7|opus|high"
  "8|sonnet|high"
  "9|opus|high"
)

# Max retries per step before halting (treats failures as rate-limit/session
# pauses and resumes the same session rather than restarting from scratch).
MAX_RETRIES=5

# ==============================================================================
# HARNESS — should not need to change per plan
# ==============================================================================

export CLAUDE_CODE_RETRY_WATCHDOG=1

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
# wrong (auth gate, admin DB client, migrations, billing config). This
# pattern list is specific to this repo (Trivia-Predictions), not per-plan —
# it applies regardless of which plan is running.
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
# RUN LOG — cross-phase memory
# ==============================================================================
# Shared memory between independently-run phases. Reset at the start of every
# full run (a re-run of the whole script starts fresh; it is not meant to
# accumulate across separate invocations of the plan). Each phase reads this
# file first and may deviate from its own phase doc if something noted here
# supersedes it, then appends its own findings before finishing. This is
# deliberately NOT full conversation history (that would reintroduce context
# drift / cache-expiry cost across independent sessions) — it's a bounded,
# on-disk handoff of only what later phases actually need to know.
RUN_LOG="docs/${PLAN_SLUG}-run-log.md"
cat > "$RUN_LOG" << EOF
# ${PLAN_SLUG} Run Log

Shared memory between the independently-run phases in docs/run_phases.sh.
Each phase reads this file first; a note here about an earlier phase
supersedes anything that contradicts it in that later phase's own doc.
EOF

# Builds a phase prompt that wires in the run-log read/write protocol so it
# doesn't have to be repeated by hand in every phase entry.
# Usage: phase_prompt <phase_number> <phase_doc> [extra instructions]
phase_prompt() {
  local phase_num=$1
  local phase_doc=$2
  local extra=${3:-}
  local constraints=""
  if [[ -n "$PLAN_DOC" ]]; then
    constraints=" Follow $PLAN_DOC for global constraints."
  fi
  printf 'First read %s — it may be empty (nothing to report yet) or contain discoveries or corrections from earlier phases. If anything there conflicts with %s, follow the run log and note why. Read %s and implement it.%s Before finishing, append a section headed "## Phase %s" to %s (under 150 words) covering: any deviation from the phase doc and why, any discovery later phases must know, and anything later phases can now skip.%s Be concise.' \
    "$RUN_LOG" "$phase_doc" "$phase_doc" "${extra:+ $extra}" "$phase_num" "$RUN_LOG" "$constraints"
}

# ==============================================================================
# EXECUTION PHASES — runs whatever is configured in PHASES above
# ==============================================================================

for entry in "${PHASES[@]}"; do
  IFS='|' read -r phase_num model effort extra <<< "$entry"
  phase_doc="docs/${PLAN_SLUG}-phase${phase_num}.md"

  if [[ ! -f "$phase_doc" ]]; then
    echo "❌ $phase_doc not found (PLAN_SLUG=\"$PLAN_SLUG\", phase $phase_num). Check PLAN_SLUG and the phase number, or write the missing doc." >&2
    exit 1
  fi

  echo "===================================================="
  echo "PHASE $phase_num — $phase_doc"
  echo "===================================================="

  run_claude_step "$model" "$effort" "$(phase_prompt "$phase_num" "$phase_doc" "$extra")"
  verify_or_fix
done

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

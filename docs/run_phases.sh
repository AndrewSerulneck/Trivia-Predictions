#!/usr/bin/env bash
set -euo pipefail

export CLAUDE_CODE_RETRY_WATCHDOG=1

# Helper function to run a Claude command until it succeeds
run_claude_step() {
  local model=$1
  local prompt=$2

  echo "--------------------------------------------------"
  echo "🚀 Running Step ($model): $prompt"
  echo "--------------------------------------------------"

  until claude --model "$model" -p "$prompt"; do
    echo ""
    echo "⚠️ Rate limit or session pause encountered!"
    echo "⏰ Sleeping for 20 minutes before retrying..."
    echo "--------------------------------------------------"
    sleep 1200
  done

  echo "✅ Step Complete!"
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

# Helper to run verification and trigger a self-fix if broken
verify_or_fix() {
  if ! run_local_verification; then
    echo "⚠️ Build failed! Sending errors to Claude to fix before proceeding..."
    run_claude_step "sonnet" "The build or test suite just failed. Run 'npm run build' and 'npm test' to inspect the exact errors, then fix them concisely."
    
    # Second check to ensure fix worked
    if ! run_local_verification; then
      echo "❌ Verification failed twice. Halting script to preserve tokens."
      exit 1
    fi
  fi
}

# ==============================================================================
# EXECUTION PHASES
# ==============================================================================
# Phase 1
run_claude_step "opus" "Read docs/phase1.md and implement the changes concisely."
verify_or_fix

# Phase 2
run_claude_step "sonnet" "Read docs/phase2.md and implement the changes concisely."
verify_or_fix

# ==============================================================================
# FINAL CODE REVIEW & INSTRUCTION EXECUTION
# ==============================================================================
echo "--------------------------------------------------"
echo "🔍 Running Final Code Review (Sonnet for Analysis)..."
echo "--------------------------------------------------"

REVIEW_PROMPT=$(cat << 'EOF'
Analyze the accumulated uncommitted changes in git diff (ignoring lockfiles and build directories). 
Perform a strict code review focusing on:
1. Security vulnerabilities or missing input sanitization.
2. Edge cases and logical bugs.
3. Violations of performance best practices or architectural mismatches.

If NO critical issues exist, reply EXACTLY with: "NO_ISSUES_FOUND".
Otherwise, output a numbered, actionable checklist of necessary fixes. Do NOT attempt to fix them yet—just list the instructions clearly.
EOF
)

# 1. Cheap/Fast analysis pass using Sonnet
run_claude_step "sonnet" "$REVIEW_PROMPT"

echo "--------------------------------------------------"
echo "🛠️ Executing Review Instructions (Opus for Complex Fixes)..."
echo "--------------------------------------------------"

# 2. High-reasoning execution pass using Opus
run_claude_step "opus" "Review the output from the previous analysis step. If it says 'NO_ISSUES_FOUND', exit immediately without making changes. Otherwise, execute the listed review instructions concisely, modifying files as needed."

# 3. Verify that Opus's fixes didn't break tests/builds
verify_or_fix
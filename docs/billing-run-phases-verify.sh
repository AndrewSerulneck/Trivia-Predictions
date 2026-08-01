#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# BILLING VERIFY — the two phases held back from docs/billing-run-phases.sh
# because they touch REAL STRIPE TEST-MODE CALLS: creating test subscriptions,
# forcing them into past_due/discounted states, and driving a real browser
# against them. Run this yourself, at your desk, watching — not overnight.
#
# Prerequisite: docs/billing-run-phases.sh has already finished (both plans'
# build phases are done). This script does NOT rebuild anything; it only
# proves the already-built code works against real (test-mode) Stripe.
#
# Run: bash docs/billing-run-phases-verify.sh
# ==============================================================================

export CLAUDE_CODE_RETRY_WATCHDOG=1
MAX_RETRIES=5
RUN_LOG="docs/billing-run-log.md"

# ------------------------------------------------------------------------------
# HARNESS (same as docs/billing-run-phases.sh)
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
      echo "❌ Step failed after $MAX_RETRIES attempts. Halting." >&2
      echo "$output" >&2
      exit 1
    fi

    echo "" >&2
    echo "⚠️ Step failed (attempt $attempt/$MAX_RETRIES) — retrying in 20 min..." >&2
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

reset_next_env_dts() {
  if ! git diff --quiet -- next-env.d.ts 2>/dev/null; then
    echo "↩️  Reverting incidental next-env.d.ts churn from a dev server run..."
    git checkout -- next-env.d.ts
  fi
}

# ------------------------------------------------------------------------------
# RUN LOG — append to the SAME log the overnight build phases wrote to, so
# these verification phases can see what was actually built. Do NOT truncate
# it (unlike the main build script, which starts a fresh log every run) —
# that history is exactly what these phases need to read first.
# ------------------------------------------------------------------------------
if [[ ! -f "$RUN_LOG" ]]; then
  echo "⚠️  $RUN_LOG doesn't exist — docs/billing-run-phases.sh may not have run yet." >&2
  echo "This script only verifies already-built code; run the build script first." >&2
  exit 1
fi
cat >> "$RUN_LOG" << 'EOF'

## --- Verification session started ---
Resuming from docs/billing-run-phases-verify.sh, run manually while Andrew
watches. Both build runs (GUARD, DISCOUNT) above this line are assumed done.
EOF

phase_prompt() {
  local tag=$1
  local phase_num=$2
  local phase_doc=$3
  local extra=${4:-}
  printf 'First read %s in full — it records what the earlier (unattended, overnight) build phases actually did and any deviations from their phase docs; trust it over assumptions about what should exist. Read %s and carry out its verification exactly.%s Before finishing, append a section headed "## %s Phase %s (verification)" to %s (under 200 words) with the concrete pass/fail result for each numbered check in the phase doc — not just "verified successfully". Be concise but do not skip reporting a failure if one occurs.' \
    "$RUN_LOG" "$phase_doc" "${extra:+ $extra}" "$tag" "$phase_num" "$RUN_LOG"
}

SAFETY_NOTE="SAFETY: .env.local's STRIPE_SECRET_KEY is a LIVE key. Never let it be used for this phase. Override STRIPE_SECRET_KEY and STRIPE_PRICE_ID in the process environment with the Stripe CLI's TEST-mode key (grep -m1 '^test_mode_api_key' ~/.config/stripe/config.toml) before starting any dev server or making any Stripe call. If that key is missing, stop and ask rather than falling back to the live key. Clean up every seeded Supabase row and Stripe test object when done."

echo "===================================================="
echo "⚠️  About to make REAL calls to Stripe TEST MODE."
echo "This will seed throwaway Supabase rows, create/cancel test-mode Stripe"
echo "subscriptions and coupons, and drive a real headless browser. Everything"
echo "is cleaned up at the end of each phase. Watch the output as it runs."
echo "===================================================="
read -p "Press Enter to begin, or Ctrl+C to stop here... " _

echo "----------------------------------------------------"
echo "GUARD PHASE 8 (live verification) — docs/billing-guard-phase8.md"
echo "----------------------------------------------------"
run_claude_step "opus" "medium" "$(phase_prompt "GUARD" "8" "docs/billing-guard-phase8.md" "$SAFETY_NOTE")"
reset_next_env_dts
verify_or_fix
reset_next_env_dts

echo "----------------------------------------------------"
echo "DISCOUNT PHASE 10 (live verification) — docs/billing-discount-phase10.md"
echo "----------------------------------------------------"
run_claude_step "opus" "medium" "$(phase_prompt "DISCOUNT" "10" "docs/billing-discount-phase10.md" "$SAFETY_NOTE")"
reset_next_env_dts
verify_or_fix
reset_next_env_dts

echo "===================================================="
echo "🎉 VERIFICATION COMPLETE."
echo "Read $RUN_LOG's two new '(verification)' sections for the actual"
echo "pass/fail results before considering either plan truly done."
echo "===================================================="

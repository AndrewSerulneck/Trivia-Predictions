#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# BILLING RUN — chains two plans back to back:
#   1. docs/billing-guard-hardening-plan.md   (bug fix: past_due bypasses
#      every live-subscription guard, risking a second Stripe subscription)
#   2. docs/billing-discounts-plan.md         (new feature: discounts/free
#      months/promo codes/negotiated rates — deliberately depends on #1)
#
# Filled-in copy of docs/run_phases.sh (the reusable template — left
# untouched, per its own documented convention: see docs/nfl-pickem-run-phases.sh
# for the established precedent of one filled-in copy per plan).
#
# Run: bash docs/billing-run-phases.sh
# ==============================================================================

export CLAUDE_CODE_RETRY_WATCHDOG=1
MAX_RETRIES=5

# ------------------------------------------------------------------------------
# HARNESS (unchanged from docs/run_phases.sh)
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

# next-env.d.ts is auto-generated and NEVER meant to be hand-edited or
# committed with dev-server output — `npm run dev` (which `npm run build`
# invokes transitively via some toolchains, and which agents may run while
# diagnosing something) rewrites its import path to `.next/dev/types/routes.d.ts`,
# which doesn't exist on a clean CI/Vercel checkout. Reset it after every
# phase and before every review pass so this never pollutes a diff or a commit.
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
# RUN LOG — one continuous file across BOTH plans. The discounts plan
# explicitly depends on the guard-hardening plan's Phases 1-4 (the shared
# classifyBillingRow predicate), so later (discount) phases must be able to
# see notes left by earlier (guard) phases. Tagged per-plan in the headers
# below so entries from the two plans don't collide on phase numbers (both
# have their own "Phase 1", "Phase 2", ...).
# ------------------------------------------------------------------------------
RUN_LOG="docs/billing-run-log.md"
cat > "$RUN_LOG" << 'EOF'
# Billing Run Log

Shared memory between the independently-run phases in docs/billing-run-phases.sh,
across BOTH chained plans (billing-guard-hardening-plan.md, then
billing-discounts-plan.md). Each phase reads this file first; a note here
about an earlier phase supersedes anything that contradicts it in that later
phase's own doc. Headers are tagged GUARD/DISCOUNT + phase number since both
plans number their own phases independently.
EOF

# Usage: phase_prompt <tag> <phase_number> <phase_doc> [extra instructions]
phase_prompt() {
  local tag=$1
  local phase_num=$2
  local phase_doc=$3
  local extra=${4:-}
  printf 'First read %s — it may be empty (nothing to report yet) or contain discoveries or corrections from earlier phases (from THIS plan or the earlier-run companion plan). If anything there conflicts with %s, follow the run log and note why. Read %s and implement it.%s Before finishing, append a section headed "## %s Phase %s" to %s (under 150 words) covering: any deviation from the phase doc and why, any discovery later phases (in either plan) must know, and anything later phases can now skip. Be concise.' \
    "$RUN_LOG" "$phase_doc" "$phase_doc" "${extra:+ $extra}" "$tag" "$phase_num" "$RUN_LOG"
}

# Runs one plan's full phase list + its own local verification + its own
# final code review pass. Nothing is committed automatically anywhere in this
# script (per this repo's rule: never commit without being asked) — the two
# review passes below will therefore each see the OTHER plan's diff too, once
# it's the discounts plan's turn (since nothing was committed after guard-
# hardening finished). That's fine — redundant, not harmful — but if you want
# a clean separated diff/review per plan, commit the guard-hardening changes
# yourself between the two runs before this script reaches Phase 3 below.
#
# Usage: run_one_plan <tag> <plan_doc> <phase-entry> [<phase-entry> ...]
#   each phase-entry: "phase_number|model|effort|phase_doc_path[|extra]"
run_one_plan() {
  local tag=$1
  local plan_doc=$2
  shift 2
  local entries=("$@")

  echo "===================================================="
  echo "PLAN: $tag  ($plan_doc)"
  echo "===================================================="

  for entry in "${entries[@]}"; do
    IFS='|' read -r phase_num model effort phase_doc extra <<< "$entry"

    if [[ ! -f "$phase_doc" ]]; then
      echo "❌ $phase_doc not found (tag=$tag, phase $phase_num)." >&2
      exit 1
    fi

    echo "----------------------------------------------------"
    echo "$tag PHASE $phase_num — $phase_doc"
    echo "----------------------------------------------------"

    run_claude_step "$model" "$effort" "$(phase_prompt "$tag" "$phase_num" "$phase_doc" "$extra")"
    reset_next_env_dts
    verify_or_fix
    reset_next_env_dts
  done

  # Final review pass for this plan's accumulated diff so far.
  local review_model
  review_model=$(pick_review_model)

  echo "--------------------------------------------------"
  echo "🔍 Running Final Code Review for $tag ($review_model for Analysis)..."
  echo "--------------------------------------------------"

  local review_prompt
  review_prompt=$(cat << EOF
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

  local review_findings
  review_findings=$(run_claude_step "sonnet" "high" "$review_prompt")

  if [[ "$review_findings" == "NO_ISSUES_FOUND" ]]; then
    echo "✅ No issues found in $tag review. Skipping fix pass."
  else
    echo "🛠️ Executing $tag Review Instructions (Opus for Complex Fixes)..."
    local fix_prompt
    fix_prompt=$(cat << EOF
The following code review findings were produced against the current git diff.
Execute the listed fixes concisely, modifying files as needed.

$review_findings
EOF
)
    run_claude_step "opus" "high" "$fix_prompt" > /dev/null
  fi

  reset_next_env_dts
  verify_or_fix
  reset_next_env_dts

  echo "===================================================="
  echo "✅ $tag PLAN COMPLETE."
  echo "===================================================="
}

# ==============================================================================
# RUN 1 — Guard hardening (bug fix). Phase 0 (revert next-env.d.ts) is handled
# automatically by reset_next_env_dts() throughout, not as an LLM phase.
#
# Phase 8 (live Stripe test-mode verification) is DELIBERATELY EXCLUDED from
# this unattended run — see docs/billing-run-phases-verify.sh, which runs it
# (and the discounts plan's equivalent, Phase 10) tomorrow while Andrew is at
# his desk watching. Everything else here is safe to run unattended: no phase
# below touches Stripe, real or test-mode.
# ==============================================================================
run_one_plan "GUARD" "docs/billing-guard-hardening-plan.md" \
  "1|sonnet|low|docs/billing-guard-phase1.md" \
  "2|opus|medium|docs/billing-guard-phase2.md" \
  "3|opus|medium|docs/billing-guard-phase3.md" \
  "4|sonnet|medium|docs/billing-guard-phase4.md" \
  "6|sonnet|low|docs/billing-guard-phase6.md" \
  "5|sonnet|medium|docs/billing-guard-phase5.md" \
  "7|sonnet|medium|docs/billing-guard-phase7.md"

# ==============================================================================
# RUN 2 — Discounts (new feature). Includes Phase 7 (promo codes) and Phase 8
# (permanent custom price) per Andrew's request — both are otherwise
# independent of the core discount slice (Phases 1-6, 9), so if either ever
# needs to be dropped again, just delete its line below.
#
# Phase 10 (live Stripe test-mode verification) is DELIBERATELY EXCLUDED —
# see docs/billing-run-phases-verify.sh, run tomorrow while watching. Phase 9
# (tests) stays here: it's mocked-Stripe unit/route tests, not real Stripe
# calls, so it's safe unattended.
# ==============================================================================
run_one_plan "DISCOUNT" "docs/billing-discounts-plan.md" \
  "1|sonnet|medium|docs/billing-discount-phase1.md" \
  "2|opus|medium|docs/billing-discount-phase2.md" \
  "3|sonnet|medium|docs/billing-discount-phase3.md" \
  "4|sonnet|medium|docs/billing-discount-phase4.md" \
  "6|opus|medium|docs/billing-discount-phase6.md" \
  "5|sonnet|medium|docs/billing-discount-phase5.md" \
  "7|sonnet|medium|docs/billing-discount-phase7.md" \
  "8|opus|medium|docs/billing-discount-phase8.md" \
  "9|sonnet|medium|docs/billing-discount-phase9.md"

echo "===================================================="
echo "🎉 BUILD PHASES COMPLETE for both plans."
echo "Nothing was committed automatically. Review the working tree and split"
echo "the diff into commits yourself (guard-hardening vs. discounts, at minimum)."
echo ""
echo "⏭️  STILL TO DO, TOMORROW, WHILE YOU WATCH:"
echo "    bash docs/billing-run-phases-verify.sh"
echo "    (runs the two phases that touch real Stripe test-mode calls —"
echo "    deliberately held out of this unattended run)"
echo "===================================================="

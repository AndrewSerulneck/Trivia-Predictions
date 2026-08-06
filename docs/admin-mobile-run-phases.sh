#!/usr/bin/env bash
set -euo pipefail

# Keep the Mac awake for the whole run. Re-execs itself under caffeinate once
# (guarded by CAFFEINATED so the re-exec doesn't recurse). -i prevents idle
# sleep, -m keeps the disk awake, -s prevents system sleep. Because caffeinate
# runs the script as its child, the assertion lives exactly as long as the run
# and is released when it ends, fails, or is Ctrl-C'd.
if [[ -z "${CAFFEINATED:-}" ]] && command -v caffeinate >/dev/null 2>&1; then
  export CAFFEINATED=1
  exec caffeinate -ims "$0" "$@"
fi

# ==============================================================================
# REUSABLE MULTI-PHASE PLAN RUNNER
#
# Executes a numbered set of phase docs, each as an independent, unattended
# `claude -p` invocation, with automatic retry-on-failure, build/test
# verification after every phase, and cross-phase memory via an on-disk run log.
#
# After the last phase it closes out the session in three steps:
#   1. A strict code review of the whole accumulated diff.
#   2. If anything was found:
#      a. A phased REMEDIATION PLAN is written to
#         docs/<slug>-remediation-plan.md, with a model and effort level per
#         phase. The plan is a kept artifact — it records what was wrong and
#         what was decided, including findings judged false positives.
#      b. That plan is then EXECUTED, one R-phase at a time, with the
#         zero-token build/test gate re-run after each one. The run does not
#         end with known-broken code, and the fixes land before verification.
#   3. Local build/test verification, then the repo's /verify skill for a
#      real-browser pass — run against the FIXED tree, not the broken one.
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
PLAN_SLUG="admin-mobile"

# The master plan doc every phase should follow for shared/global
# constraints (product decisions, coding conventions, "do not touch" list,
# etc). Leave as "" if this plan doesn't have one.
PLAN_DOC="/Users/andrewserulneck/Documents/Trivia-Predictions/docs/admin-mobile-plan.md"

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
  "1|sonnet|low"
  "2|sonnet|medium|The 100svh change touches the same CSS pattern as the commit 35115fc blackout regression. Read that history before editing and keep the change scoped to the admin shell."
  "3|sonnet|high"
  "4|opus|high|This is the core deliverable and needs real design judgment about what a salesperson does in the field when the address lookup or GPS pin is wrong."
  "5|sonnet|high|Billing is a layout change only. Preserve the manual-vs-Stripe-vs-force-cancel guards and every confirmation step exactly."
  "6|sonnet|medium|Headless browsers cannot verify this surface. Do not report visual/keyboard/safe-area items as verified from a headless run."
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

# 1. Analysis pass (capture its reply — separate `claude -p` invocations do
#    NOT share context, so the next step needs this text handed to it
#    explicitly). Model is chosen by pick_review_model based on how large and
#    how sensitive the accumulated diff is.
REVIEW_FINDINGS=$(run_claude_step "$REVIEW_MODEL" "high" "$REVIEW_PROMPT")

REMEDIATION_PLAN_DOC="docs/${PLAN_SLUG}-remediation-plan.md"

if [[ "$REVIEW_FINDINGS" == "NO_ISSUES_FOUND" ]]; then
  echo "--------------------------------------------------"
  echo "✅ No issues found in review. Skipping remediation."
  echo "--------------------------------------------------"
else
  # ============================================================================
  # 2a. REMEDIATION PLAN
  # ============================================================================
  # The findings are first turned into a written, phased plan on disk — same
  # shape as the plan this script just executed, with a model and effort level
  # per phase. The plan is an artifact you keep: it records what was wrong and
  # what was decided, including any finding judged a false positive. Step 2b
  # then actually executes it, so the run does not end with known-broken code.
  echo "--------------------------------------------------"
  echo "📝 Writing Remediation Plan → $REMEDIATION_PLAN_DOC"
  echo "--------------------------------------------------"

  PLAN_PROMPT=$(cat << EOF
A strict code review of the current git diff produced the findings below.

Write a phased remediation plan to $REMEDIATION_PLAN_DOC that addresses ALL of them.

Requirements for the plan:
- Group the findings into coherent phases ordered so earlier phases do not
  invalidate later ones. Prefer few, substantial phases over many trivial ones.
- Number the phases R0, R1, R2, ... and give each a "### Phase R<N>" heading.
- Give every phase an explicit Claude model (sonnet or opus) and effort level
  (low, medium, high). Justify each choice in one line: opus/high for
  architectural, security, or judgment-heavy work; sonnet for mechanical or
  pattern-following work.
- For each phase state: the findings it closes, the files involved, and how to
  verify it.
- Call out explicitly any finding you judge to be a false positive or not worth
  fixing, and say why, rather than silently padding the plan with it. A phase
  may legitimately be "no code change needed" if that is the honest answer.
- Follow the same conventions as the plan that was just executed. Read
  $RUN_LOG first for what the phases actually discovered as they ran.
- Note anything only a human on a real device can verify, and route it to a
  checklist rather than pretending an agent can close it.

Write ONLY the plan document in this step. Do NOT fix anything yet — the fixes
are executed as a separate step immediately after.

FINDINGS:
$REVIEW_FINDINGS
EOF
)
  run_claude_step "opus" "high" "$PLAN_PROMPT" > /dev/null

  # ============================================================================
  # 2b. EXECUTE THE REMEDIATION PLAN
  # ============================================================================
  # Work the plan phase by phase, in order, re-running the zero-token gate
  # after each one so a broken fix is caught next to the change that caused it
  # rather than at the end of the whole batch.
  echo "--------------------------------------------------"
  echo "🛠️  Executing Remediation Plan..."
  echo "--------------------------------------------------"

  # Pull the R-phase numbers straight out of the plan the previous step wrote,
  # so the number of fix phases is whatever the plan actually called for.
  REMEDIATION_PHASES=()
  if [[ -f "$REMEDIATION_PLAN_DOC" ]]; then
    while IFS= read -r rnum; do
      [[ -n "$rnum" ]] && REMEDIATION_PHASES+=("$rnum")
    done < <(grep -oE '^#{2,4}[[:space:]]+Phase[[:space:]]+R[0-9]+' "$REMEDIATION_PLAN_DOC" \
             | grep -oE 'R[0-9]+' | sed 's/^R//' | awk '!seen[$0]++')
  fi

  if [[ ${#REMEDIATION_PHASES[@]} -eq 0 ]]; then
    # No parseable R-phases (unexpected plan format). Fall back to executing
    # the plan in a single pass rather than silently skipping the fixes.
    echo "⚠️  No 'Phase R<N>' headings found in $REMEDIATION_PLAN_DOC."
    echo "    Falling back to a single-pass execution of the whole plan."
    FALLBACK_PROMPT=$(cat << EOF
Read $REMEDIATION_PLAN_DOC and implement ALL of it, in the order it specifies.

Then append a section headed "## Remediation" to $RUN_LOG (under 200 words)
covering what you changed, anything you deliberately did not change and why,
and anything left for a human to verify.

If the plan says a finding needs no code change, do not invent one. Be concise.
EOF
)
    run_claude_step "opus" "high" "$FALLBACK_PROMPT" > /dev/null
    verify_or_fix
  else
    echo "    Plan defines ${#REMEDIATION_PHASES[@]} remediation phase(s): ${REMEDIATION_PHASES[*]}"
    for rnum in "${REMEDIATION_PHASES[@]}"; do
      echo "===================================================="
      echo "REMEDIATION PHASE R$rnum — $REMEDIATION_PLAN_DOC"
      echo "===================================================="

      R_PROMPT=$(cat << EOF
Read $RUN_LOG first — it records what earlier phases discovered, and a note
there supersedes anything that contradicts it elsewhere.

Then read $REMEDIATION_PLAN_DOC and implement ONLY its Phase R$rnum. Leave the
other remediation phases alone; they are handled by their own steps.

Use the Claude model and effort level that Phase R$rnum specifies for itself if
they differ from this session — note the mismatch in the run log rather than
silently proceeding at the wrong altitude on judgment-heavy work.

Before finishing, append a section headed "## Remediation Phase R$rnum" to
$RUN_LOG (under 150 words) covering: what you changed, any deviation from the
plan and why, and anything a later phase or a human must still do.

If Phase R$rnum concludes no code change is needed, say so and change nothing.
Be concise.
EOF
)
      # Opus for the fix passes: these are corrections to code that already
      # passed one review, so the cheap failure mode is a plausible-looking
      # patch that misses the actual defect.
      run_claude_step "opus" "high" "$R_PROMPT" > /dev/null
      verify_or_fix
    done
  fi

  echo "--------------------------------------------------"
  echo "✅ Remediation plan executed. Plan kept at $REMEDIATION_PLAN_DOC."
  echo "--------------------------------------------------"
fi

# ==============================================================================
# 3. FINAL VERIFICATION
# ==============================================================================
# Zero-token gate first, then the /verify skill for a real-browser pass.
verify_or_fix

echo "--------------------------------------------------"
echo "🔬 Running the /verify skill (real-browser verification)..."
echo "--------------------------------------------------"

# NOTE: the /verify skill covers VENUE-SCOPED GAME PAGES (Category Blitz,
# Trivia, Pickem, Bingo, Fantasy, Predictions) — seeding throwaway data,
# getting past the cookie auth gate in proxy.ts, and driving the UI with
# Playwright. If a plan touches none of those routes, the skill correctly
# reports there is nothing in its scope to verify; that is a valid outcome,
# not a failure.
VERIFY_PROMPT=$(cat << EOF
Read $RUN_LOG for what changed during this run, then run the /verify skill against the affected surfaces.

Verify the real user-facing behavior the changes in the current git diff were supposed to produce — not just that the app builds.

Report honestly and specifically:
- what you verified, and the evidence for it
- what FAILED, with the actual output
- what you could NOT verify and why

Do not report success on the strength of a build passing. If the changed surfaces fall outside the scope of that skill (it covers venue-scoped game pages), say so plainly instead of forcing an unrelated check. Headless browsers cannot verify browser chrome, safe-area insets, or keyboard behavior — never report those as verified from a headless run.
EOF
)
run_claude_step "sonnet" "high" "$VERIFY_PROMPT"

echo "=================================================="
echo "🏁 Run complete."
echo "   Run log:          $RUN_LOG"
if [[ "$REVIEW_FINDINGS" != "NO_ISSUES_FOUND" ]]; then
  echo "   Remediation plan: $REMEDIATION_PLAN_DOC (executed)"
fi
echo "=================================================="

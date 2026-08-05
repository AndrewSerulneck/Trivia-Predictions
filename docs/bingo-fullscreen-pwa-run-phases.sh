#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# BINGO LANDSCAPE FULLSCREEN + PWA — UNATTENDED PHASE RUNNER
#
# Derived from docs/run_phases.sh, with four additions requested for this run:
#
#   1. CAFFEINATED   — re-execs itself under `caffeinate` so the laptop will not
#                      sleep until the whole run finishes.
#   2. RESUMABLE     — every step is checkpointed to disk. If the run dies (rate
#                      limit exhaustion, crash, closed lid, Ctrl-C), just run the
#                      script again: completed steps are skipped and the step
#                      that was interrupted resumes into its OWN saved Claude
#                      session, not a fresh one.
#   3. FINAL REVIEW  — a strict code review pinned to opus/high (not the
#                      diff-size heuristic in the template), then verification,
#                      then a fix pass over the findings, then re-verification.
#   4. PATIENT RETRY — rate limits are detected and waited out for many hours
#                      rather than halting after a handful of tries.
#
# USAGE
#   bash docs/bingo-fullscreen-pwa-run-phases.sh
#
#   Resume after any interruption ...... just run it again, same command.
#   Start completely over .............. bash docs/bingo-fullscreen-pwa-run-phases.sh --fresh
#   Skip the sleep-blocker ............. NO_CAFFEINATE=1 bash docs/...-run-phases.sh
#
# Transcript is tee'd to docs/bingo-fullscreen-pwa-run-console.log.
# ==============================================================================

PLAN_SLUG="bingo-fullscreen-pwa"
REPO_ROOT="/Users/andrewserulneck/Documents/Trivia-Predictions"
PLAN_DOC="$REPO_ROOT/docs/${PLAN_SLUG}-plan.md"

# phase_number|model|effort|optional extra instructions
PHASES=(
  "0|opus|high|This is a measurement and analysis phase. Do not modify any product code."
  "1|opus|high|Phase 0's findings doc dictates your priority order. Start with its top recommendation."
  "2|sonnet|high"
  "3|sonnet|high"
  "4|opus|high|This phase touches the auth/join path. Running npm run test:god-mode-join is mandatory."
  "5|sonnet|high|Everything here ships behind a flag that stays OFF. Do not enable it."
  "6|opus|high"
)

# Final review is pinned, per request — not chosen by diff size.
REVIEW_MODEL="opus"
REVIEW_EFFORT="high"

# Retry policy. A "rate limit" style failure is retried this many times with a
# long sleep between attempts; anything else is treated as a hard error sooner.
MAX_RATE_LIMIT_RETRIES=24     # 24 x 20min ~= 8 hours of patience
MAX_HARD_RETRIES=3
RETRY_SLEEP_SECONDS=1200      # 20 minutes

# ==============================================================================
# CAFFEINATE — keep the machine awake for the whole run
# ==============================================================================
# Re-exec under caffeinate unless already wrapped or explicitly disabled.
#   -d prevent display sleep   -i prevent idle sleep
#   -m prevent disk sleep      -s prevent system sleep on AC
if [[ -z "${TP_RUN_CAFFEINATED:-}" && -z "${NO_CAFFEINATE:-}" ]] && command -v caffeinate >/dev/null 2>&1; then
  echo "☕ Re-executing under caffeinate — this Mac will not sleep until the run finishes."
  exec caffeinate -dims env TP_RUN_CAFFEINATED=1 bash "$0" "$@"
fi

cd "$REPO_ROOT"

# ==============================================================================
# STATE — checkpointing so an interrupted run resumes instead of restarting
# ==============================================================================
STATE_DIR="docs/.${PLAN_SLUG}-run-state"
RUN_LOG="docs/${PLAN_SLUG}-run-log.md"
CONSOLE_LOG="docs/${PLAN_SLUG}-run-console.log"
FINDINGS_FILE="$STATE_DIR/review-findings.txt"

if [[ "${1:-}" == "--fresh" ]]; then
  echo "🧹 --fresh: clearing checkpoints and the run log."
  rm -rf "$STATE_DIR" "$RUN_LOG"
fi

mkdir -p "$STATE_DIR"

# Mirror everything to a console log, appending across resumes.
exec > >(tee -a "$CONSOLE_LOG") 2>&1

echo "===================================================="
echo "RUN START  $(date '+%Y-%m-%d %H:%M:%S')"
echo "Plan: $PLAN_SLUG   State: $STATE_DIR"
echo "===================================================="

step_is_done()  { [[ -f "$STATE_DIR/$1.done" ]]; }
mark_step_done(){ date '+%Y-%m-%d %H:%M:%S' > "$STATE_DIR/$1.done"; }

# The run log is cross-phase memory. Create it once; NEVER truncate it on a
# resume, or a resumed run would lose every earlier phase's handoff notes.
if [[ ! -f "$RUN_LOG" ]]; then
  cat > "$RUN_LOG" << EOF
# ${PLAN_SLUG} Run Log

Shared memory between the independently-run phases in
docs/${PLAN_SLUG}-run-phases.sh. Each phase reads this file first; a note here
about an earlier phase supersedes anything that contradicts it in that later
phase's own doc.
EOF
fi

# ==============================================================================
# CLAUDE STEP RUNNER
# ==============================================================================
export CLAUDE_CODE_RETRY_WATCHDOG=1

# Heuristic: does this failure look like a usage/rate limit rather than a bug?
looks_like_rate_limit() {
  echo "$1" | grep -qiE 'rate.?limit|usage limit|quota|429|too many requests|overloaded|capacity|try again later|resets? at'
}

# run_claude_step <step_id> <model> <effort> <prompt>
#
# Persists the Claude session id to disk keyed by step_id, so a retry — even
# after the whole script is restarted hours later — resumes THAT step's session
# rather than starting cold. Emits the assistant's final text on stdout.
run_claude_step() {
  local step_id=$1 model=$2 effort=$3 prompt=$4
  local session_file="$STATE_DIR/$step_id.session"
  local session_id="" attempt=0 rate_limit_hits=0 hard_failures=0
  local output status parsed

  # Note: written as `if` blocks, not `[[ ... ]] && ...`. Under `set -e` a
  # bare `A && B` statement whose test fails exits the whole script.
  if [[ -f "$session_file" ]]; then
    session_id=$(<"$session_file")
  fi

  echo "--------------------------------------------------" >&2
  echo "🚀 Step: $step_id  ($model/$effort)" >&2
  if [[ -n "$session_id" ]]; then
    echo "   ↩️  resuming saved session $session_id" >&2
  fi
  echo "--------------------------------------------------" >&2

  while true; do
    attempt=$((attempt + 1))
    status=0

    if [[ -z "$session_id" ]]; then
      output=$(claude --model "$model" --effort "$effort" -p "$prompt" --output-format json) || status=$?
    else
      output=$(claude --resume "$session_id" -p "$prompt" --output-format json) || status=$?
    fi

    # Capture/refresh the session id on EVERY attempt (success or failure) so an
    # interrupted step can always be resumed later.
    parsed=$(echo "$output" | jq -r '.session_id // empty' 2>/dev/null || true)
    if [[ -n "$parsed" ]]; then
      session_id="$parsed"
      echo "$session_id" > "$session_file"
    fi

    if [[ $status -eq 0 ]]; then
      break
    fi

    if looks_like_rate_limit "$output"; then
      rate_limit_hits=$((rate_limit_hits + 1))
      if [[ $rate_limit_hits -ge $MAX_RATE_LIMIT_RETRIES ]]; then
        echo "❌ Still rate limited after $rate_limit_hits waits. Halting." >&2
        echo "   Re-run the script later; it will resume at step '$step_id'." >&2
        exit 1
      fi
      echo "⏳ Rate limited (wait $rate_limit_hits/$MAX_RATE_LIMIT_RETRIES). Sleeping $((RETRY_SLEEP_SECONDS / 60))m, then resuming the same session..." >&2
    else
      hard_failures=$((hard_failures + 1))
      if [[ $hard_failures -ge $MAX_HARD_RETRIES ]]; then
        echo "❌ Step '$step_id' failed $hard_failures times with a non-rate-limit error. Halting." >&2
        echo "$output" >&2
        echo "   Fix the cause, then re-run the script; it resumes at step '$step_id'." >&2
        exit 1
      fi
      echo "⚠️  Step failed (hard error $hard_failures/$MAX_HARD_RETRIES). Sleeping $((RETRY_SLEEP_SECONDS / 60))m before retrying the same session..." >&2
    fi

    sleep "$RETRY_SLEEP_SECONDS"
  done

  echo "✅ Step complete: $step_id" >&2
  echo "$output" | jq -r '.result // empty'
}

# ==============================================================================
# LOCAL VERIFICATION (zero tokens)
# ==============================================================================
run_local_verification() {
  echo "--------------------------------------------------"
  echo "⚙️  Local verification (build / typecheck / lint / tests)..."
  echo "--------------------------------------------------"
  if npm run build && npx tsc --noEmit && npm run lint && npm test; then
    echo "✅ Local verification passed."
    return 0
  fi
  echo "❌ Local verification failed."
  return 1
}

# verify_or_fix <label>
verify_or_fix() {
  local label=$1
  if run_local_verification; then
    return 0
  fi

  echo "⚠️  Handing the failure to Claude to fix before proceeding..."
  run_claude_step "fix-$label" "sonnet" "high" \
    "The build, typecheck, lint, or test suite is failing. Run 'npm run build', 'npx tsc --noEmit', 'npm run lint' and 'npm test' to see the exact errors, then fix them concisely. Do not disable or delete tests to make them pass, and do not weaken types to silence tsc." > /dev/null

  if ! run_local_verification; then
    echo "❌ Verification failed twice at '$label'. Halting to avoid burning tokens on a broken tree."
    echo "   After fixing by hand, re-run the script; completed steps are skipped."
    exit 1
  fi
}

# ==============================================================================
# PHASE PROMPT
# ==============================================================================
phase_prompt() {
  local phase_num=$1 phase_doc=$2 extra=${3:-}
  printf 'First read %s — it may be nearly empty (nothing reported yet) or contain discoveries and corrections from earlier phases. If anything there conflicts with %s, follow the run log and note why. Then read %s and implement it. Follow %s for global constraints, product decisions and hard boundaries; it is binding and its settled decisions must not be re-litigated.%s Before finishing, append a section headed "## Phase %s" to %s (under 200 words) covering: any deviation from the phase doc and why, any discovery later phases must know, anything later phases can now skip, and anything that must go on the physical-device checklist in Phase 6. Be concise.' \
    "$RUN_LOG" "$phase_doc" "$phase_doc" "$PLAN_DOC" "${extra:+ $extra}" "$phase_num" "$RUN_LOG"
}

# ==============================================================================
# EXECUTE PHASES
# ==============================================================================
for entry in "${PHASES[@]}"; do
  IFS='|' read -r phase_num model effort extra <<< "$entry"
  phase_doc="docs/${PLAN_SLUG}-phase${phase_num}.md"
  step_id="phase$phase_num"

  if step_is_done "$step_id"; then
    echo "⏭️  PHASE $phase_num already complete ($(<"$STATE_DIR/$step_id.done")) — skipping."
    continue
  fi

  if [[ ! -f "$phase_doc" ]]; then
    echo "❌ $phase_doc not found. Check PLAN_SLUG and the phase number." >&2
    exit 1
  fi

  echo "===================================================="
  echo "PHASE $phase_num — $phase_doc"
  echo "===================================================="

  run_claude_step "$step_id" "$model" "$effort" "$(phase_prompt "$phase_num" "$phase_doc" "$extra")" > /dev/null
  verify_or_fix "$step_id"
  mark_step_done "$step_id"
done

# ==============================================================================
# FINAL CODE REVIEW  (opus / high, pinned)
# ==============================================================================
if step_is_done "review"; then
  echo "⏭️  Code review already complete — skipping."
else
  echo "===================================================="
  echo "🔍 FINAL CODE REVIEW ($REVIEW_MODEL/$REVIEW_EFFORT)"
  echo "===================================================="

  # Written to a file rather than $(cat << EOF): macOS ships bash 3.2, whose
  # parser mishandles an apostrophe inside a heredoc nested in a command
  # substitution.
  cat > "$STATE_DIR/review-prompt.txt" << EOF
Read $RUN_LOG first — it records the deviations and discoveries each phase noted as it ran.
Read $PLAN_DOC for the settled product decisions and hard boundaries this work had to respect.

Review the accumulated uncommitted changes in git diff (ignore lockfiles, .next, and build output).
This is a strict review. Focus on:
1. Correctness and edge cases — especially event-listener lifecycles, cleanup on unmount, and orientation/fullscreen state transitions.
2. Security — the cold-launch auth path, the proxy.ts cookie gate, and anything touching session or geolocation handling.
3. Violations of the project's hard boundaries: a middleware.ts must not exist; proxy.ts, lib/supabaseAdmin.ts, vercel.json and existing migrations must be unmodified; no service worker; no 'any'; no relative imports; manifest start_url must be '/'.
4. Regressions to portrait Bingo or to the other game routes — a landscape-scoped CSS change leaking out of its media query has broken five game routes in this repo before.
5. Flag inertness: with NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED unset, nothing new may render or register listeners.
6. Any claim in the run log that a visual or standalone-mode behavior was "verified" — that is not possible headlessly and should be flagged as an overclaim.

If there are NO issues worth fixing, reply with EXACTLY: NO_ISSUES_FOUND
Otherwise reply with a numbered, actionable checklist of the fixes needed, most severe first. Do NOT fix anything yet.
EOF
  REVIEW_PROMPT=$(<"$STATE_DIR/review-prompt.txt")

  run_claude_step "review" "$REVIEW_MODEL" "$REVIEW_EFFORT" "$REVIEW_PROMPT" > "$FINDINGS_FILE"
  mark_step_done "review"
fi

# ==============================================================================
# FIX THE REVIEW FINDINGS, THEN VERIFY
# ==============================================================================
# No verification pass between the review and the fixes: every phase above runs
# verify_or_fix before it checkpoints, so the tree is already green here. The
# gate that matters is the one AFTER the fixes.
if step_is_done "review-fix"; then
  echo "⏭️  Review fixes already applied — skipping."
elif [[ ! -s "$FINDINGS_FILE" ]]; then
  echo "⚠️  No findings file content — treating as nothing to fix."
  mark_step_done "review-fix"
elif grep -q "NO_ISSUES_FOUND" "$FINDINGS_FILE"; then
  echo "===================================================="
  echo "✅ Review found no issues. Skipping the fix pass."
  echo "===================================================="
  mark_step_done "review-fix"
else
  echo "===================================================="
  echo "🛠️  APPLYING REVIEW FIXES (opus/high)"
  echo "===================================================="

  REVIEW_FINDINGS=$(<"$FINDINGS_FILE")

  cat > "$STATE_DIR/fix-prompt.txt" << EOF
A strict code review was just run against the current uncommitted git diff. Its findings are below.

Apply the fixes. Work through them in order, most severe first. Follow $PLAN_DOC for the settled decisions and hard boundaries — do not "fix" a finding by violating one of them, and do not re-litigate a settled product decision.

If you judge a finding to be wrong or not worth acting on, say so explicitly and briefly explain why rather than silently skipping it. Append a short "## Review fixes" section to $RUN_LOG listing what you changed and what you deliberately did not.

FINDINGS:
$REVIEW_FINDINGS
EOF
  FIX_PROMPT=$(<"$STATE_DIR/fix-prompt.txt")

  run_claude_step "review-fix" "opus" "high" "$FIX_PROMPT" > /dev/null
  mark_step_done "review-fix"
fi

# Final gate after the fix pass.
if ! step_is_done "final-verify"; then
  verify_or_fix "final-verify"
  mark_step_done "final-verify"
fi

# ==============================================================================
# DONE
# ==============================================================================
echo "===================================================="
echo "🎉 RUN COMPLETE  $(date '+%Y-%m-%d %H:%M:%S')"
echo "===================================================="
echo
echo "Read these, in this order:"
echo "  1. $RUN_LOG"
echo "       — what each phase did, deviated on, and discovered."
echo "  2. $FINDINGS_FILE"
echo "       — the code review findings, and see the run log for which were fixed."
echo "  3. docs/${PLAN_SLUG}-device-checklist.md"
echo "       — REQUIRED. Everything visual and every standalone/PWA behavior is"
echo "         UNVERIFIED until you run this on real phones. No automated step in"
echo "         this run could check them; a headless browser has no address bar."
echo
echo "Nothing was committed. Review the diff with: git status && git diff"
echo "Console transcript: $CONSOLE_LOG"

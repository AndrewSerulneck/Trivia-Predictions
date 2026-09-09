#!/usr/bin/env bash
# PreToolUse(Bash) guard for .env.local — see CLAUDE.md "Secrets and env files".
#
# POLICY: .env.local is APPEND-ONLY and its VALUES are never read.
# Claude may add a line with `>>`. Everything that could remove, overwrite,
# rewrite or reveal existing content is denied here rather than left to good
# intentions, because a single stray `>` destroys every API key in the file.
#
# Exit 0 always; the decision is carried in the JSON on stdout.

set -uo pipefail
cmd="$(jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"
[ -z "$cmd" ] && exit 0

deny() {
  jq -n --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# Only inspect commands that mention the file at all.
printf '%s' "$cmd" | grep -q '\.env\.local' || {
  # `vercel env pull` writes .env.local even without naming it.
  if printf '%s' "$cmd" | grep -Eq '\bvercel\b[[:space:]]+env[[:space:]]+pull\b'; then
    deny "BLOCKED: \`vercel env pull\` OVERWRITES .env.local wholesale, destroying every local-only key. .env.local is append-only. Use \`vercel env ls\` to see names, then append the one key you need with >>."
  fi
  exit 0
}

# 1. Truncating redirect: a single `>` (not `>>`) pointed at .env.local.
if printf '%s' "$cmd" | grep -Eq '(^|[^>])>[[:space:]]*['"'"'"]?\.?/?\.env\.local'; then
  deny "BLOCKED: \`>\` TRUNCATES .env.local and would destroy every key in it. .env.local is append-only — use \`>>\`."
fi

# 2. Removal / replacement / in-place rewriting.
if printf '%s' "$cmd" | grep -Eq '\b(rm|unlink|shred|truncate)\b[^|;&]*\.env\.local'; then
  deny "BLOCKED: deleting .env.local is never permitted. It is append-only."
fi
if printf '%s' "$cmd" | grep -Eq '\b(mv|cp|ln|install|rsync)\b[^|;&]*[[:space:]]['"'"'"]?\.?/?\.env\.local['"'"'"]?[[:space:]]*($|[|;&])'; then
  deny "BLOCKED: overwriting .env.local by copy/move would destroy its existing keys. It is append-only."
fi
if printf '%s' "$cmd" | grep -Eq '\bsed\b[^|;&]*-[a-zA-Z]*i[a-zA-Z]*([[:space:]]|=)[^|;&]*\.env\.local'; then
  deny "BLOCKED: \`sed -i\` rewrites .env.local in place and can drop lines. It is append-only."
fi
if printf '%s' "$cmd" | grep -Eq '\btee\b[^|;&]*\.env\.local' && ! printf '%s' "$cmd" | grep -Eq '\btee\b[[:space:]]+(-[a-zA-Z]*a[a-zA-Z]*[[:space:]]|--append[[:space:]])'; then
  deny "BLOCKED: \`tee\` without -a TRUNCATES .env.local. It is append-only — use \`tee -a\` or \`>>\`."
fi

# 3. Value disclosure. Reading NAMES is fine; printing values is not.
#    `cut -d= -f1` and `grep -o '^[A-Z_]*='` are the sanctioned name-only reads.
if printf '%s' "$cmd" | grep -Eq '\b(cat|less|more|head|tail|bat|od|xxd|strings|nl)\b[^|;&]*\.env\.local'; then
  deny "BLOCKED: this would print .env.local VALUES (API keys) into the transcript. To see which keys exist, read NAMES only: \`cut -d= -f1 .env.local | sort\`."
fi

exit 0

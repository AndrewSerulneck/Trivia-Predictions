#!/usr/bin/env bash
# Renew the writer's ChatGPT login. Run this on your Mac when GitHub emails you that "Write questions" failed with
# "ChatGPT login needs renewing". It signs in a fresh, separate Codex login (never your laptop's own) and saves it
# straight into the private repo's secret. Nothing is printed or kept on disk afterwards.
#
#   bash renew-login.sh            (uses AndrewSerulneck/hightop-question-writer)
#   bash renew-login.sh OWNER/REPO
set -euo pipefail
REPO="${1:-AndrewSerulneck/hightop-question-writer}"
command -v codex >/dev/null || { echo "Install Codex first: npm i -g @openai/codex"; exit 1; }
command -v gh >/dev/null || { echo "Install the GitHub CLI first: brew install gh"; exit 1; }
LOGIN_DIR="$(mktemp -d)"
trap 'rm -rf "$LOGIN_DIR"' EXIT
chmod 700 "$LOGIN_DIR"
echo "A link and a code will appear. Open the link, sign in to ChatGPT, and type the code."
CODEX_HOME="$LOGIN_DIR" codex login --device-auth
[ -s "$LOGIN_DIR/auth.json" ] || { echo "Sign-in didn't finish. Run this again."; exit 1; }
gh secret set CODEX_AUTH_JSON --repo "$REPO" < "$LOGIN_DIR/auth.json"
echo "Saved. The next run will use it."

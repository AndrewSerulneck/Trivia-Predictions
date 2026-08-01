#!/bin/bash
# Temp helper for billing DISCOUNT Phase 10 verification.
# Extracts the Stripe CLI's TEST-mode key and exports it, then runs "$@".
# NEVER falls back to .env.local's STRIPE_SECRET_KEY (that one is LIVE).
set -euo pipefail

CFG="$HOME/.config/stripe/config.toml"
if [ ! -f "$CFG" ]; then
  echo "FATAL: $CFG not found — stopping rather than using the live key." >&2
  exit 2
fi

KEY=$(awk -F= '/^[[:space:]]*test_mode_api_key/ { v=$2; gsub(/[[:space:]"'"'"']/, "", v); print v; exit }' "$CFG")

case "$KEY" in
  sk_test_*|rk_test_*) ;;
  *) echo "FATAL: no test-mode key found in $CFG — stopping." >&2; exit 2 ;;
esac

export STRIPE_SECRET_KEY="$KEY"
export STRIPE_TEST_KEY="$KEY"
exec "$@"

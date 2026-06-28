#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source .env if present
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
  echo "  Loaded .env"
fi

cd "$REPO_ROOT"

# Ensure dist is built
if [ ! -f packages/chimera-cli/dist/index.js ]; then
  echo "  Building packages..."
  pnpm build
fi

echo ""
echo "  Running Chimera E2E smoke tests..."
echo ""

node scripts/smoke-test.js "$@"

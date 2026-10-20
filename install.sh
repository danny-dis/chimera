#!/bin/bash
set -e

REPO="https://github.com/danny-dis/chimera.git"
INSTALL_DIR="${CHIMERA_INSTALL_DIR:-$HOME/.chimera}"

# Match package.json, including the minimum Node 22 minor version.
if ! command -v node >/dev/null 2>&1 || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22 || (a===22 && b>=13) ? 0 : 1)'; then
  printf '%s\n' 'Error: Node.js 22.13 or newer is required. Install from https://nodejs.org.' >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1 || [ "$(pnpm --version)" != '11.0.8' ]; then
  printf '%s\n' 'Install pnpm 11.0.8 first: npm install --global pnpm@11.0.8' >&2
  exit 1
fi

if [ -d "$INSTALL_DIR/repo/.git" ]; then
  if [ -n "$(git -C "$INSTALL_DIR/repo" status --porcelain)" ]; then
    printf '%s\n' 'Error: preserve local installation changes before updating.' >&2
    exit 1
  fi
  echo "Updating chimera..."
  cd "$INSTALL_DIR/repo"
  git pull --ff-only
  pnpm install --frozen-lockfile
  pnpm build
  pnpm --dir packages/chimera-cli link --global
  echo "Updated to latest version."
else
  echo "Installing chimera to $INSTALL_DIR..."
  mkdir -p "$INSTALL_DIR"
  git clone --depth 50 "$REPO" "$INSTALL_DIR/repo"
  cd "$INSTALL_DIR/repo"
  pnpm install --frozen-lockfile
  pnpm build
  pnpm --dir packages/chimera-cli link --global
  echo ""
  echo "Done! Run 'chimera' to get started."
fi

echo ""
echo "  chimera          — Launch TUI dashboard"
echo "  chimera --repl   — Launch REPL mode"
echo "  chimera ask      — Ask a question"
echo "  chimera code     — Generate code"
echo "  chimera plan     — Plan a task"
echo "  Run this installer again to update the source checkout."

#!/bin/bash
set -e

REPO="https://github.com/danny-dis/chimera.git"
INSTALL_DIR="${CHIMERA_INSTALL_DIR:-$HOME/.chimera}"

# Check Node.js >= 20
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required (>= 20). Install from https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js >= 20 required (found v$(node -v | sed 's/v//'))"
  exit 1
fi

# Check pnpm
if ! command -v pnpm &>/dev/null; then
  echo "Installing pnpm..."
  npm install -g pnpm
fi

if [ -d "$INSTALL_DIR/repo/.git" ]; then
  echo "Updating chimera..."
  cd "$INSTALL_DIR/repo"
  git pull --ff-only
  pnpm install
  pnpm build
  echo "Updated to latest version."
else
  echo "Installing chimera to $INSTALL_DIR..."
  mkdir -p "$INSTALL_DIR"
  git clone --depth 50 "$REPO" "$INSTALL_DIR/repo"
  cd "$INSTALL_DIR/repo"
  pnpm install
  pnpm build
  npm link
  echo ""
  echo "Done! Run 'chimera' to get started."
fi

echo ""
echo "  chimera          — Launch TUI dashboard"
echo "  chimera --repl   — Launch REPL mode"
echo "  chimera ask      — Ask a question"
echo "  chimera code     — Generate code"
echo "  chimera plan     — Plan a task"
echo "  chimera update   — Update to latest version"

#!/bin/bash
set -euo pipefail

VERSION="${1:?Usage: sync-versions.sh <version>}"

# Validate semver
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Invalid semver version: $VERSION"
  exit 1
fi

# Update root package.json
if [ -f package.json ]; then
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$VERSION';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "  Updated package.json -> $VERSION"
fi

# Update all workspace packages
for pkg_file in packages/chimera-*/package.json; do
  if [ -f "$pkg_file" ]; then
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('$pkg_file', 'utf8'));
      pkg.version = '$VERSION';
      fs.writeFileSync('$pkg_file', JSON.stringify(pkg, null, 2) + '\n');
    "
    echo "  Updated $pkg_file -> $VERSION"
  fi
done

echo ""
echo "All packages set to $VERSION"

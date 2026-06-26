#!/usr/bin/env bash
# 3-way (or sequential 3-way) merge of BASE + multiple contributors using git merge-file.
# Usage: merge-file.sh <source> <base> <contrib1> <contrib2> ...
#   The source is the file to be modified (becomes the merge result).
#   The base is the common ancestor (e.g. .BASE).
#   Each contrib is a contributor's full version of the file (e.g. .A, .B, .C, .D).
set -e
src="$1"
base="$2"
shift 2

# Save the original (pre-merge) source in memory only — we will overwrite src.
cp "$src" "$src.work"

# Sequential 3-way merge
for contrib in "$@"; do
  echo "  merging $contrib into $src"
  if ! git merge-file -L "current" -L "base" -L "$contrib" "$src.work" "$base" "$contrib" >/dev/null 2>&1; then
    echo "  CONFLICTS after merging $contrib — see $src.work for markers"
    exit 1
  fi
done

# Check for remaining conflict markers
if grep -q '<<<<<<<' "$src.work"; then
  echo "  CONFLICTS remain in $src.work"
  exit 1
fi

mv "$src.work" "$src"
echo "  $src merged cleanly"

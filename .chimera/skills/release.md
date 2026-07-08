---
name: release
description: >
  Create a release by comparing a development branch to the default branch,
  generating changelog entries from commits, bumping the version, and creating
  a PR. Use when: "make a release", "cut a release", "ship it",
  "release to main", or a version bump is requested.
modes: ['code', 'plan']
---

<!--
Ported from Archon's `release` skill (MIT, coleam00/Archon:
https://github.com/coleam00/Archon). Logic preserved and generalized:
- Archon-specific constants were parameterized: set DEV_BRANCH and MAIN_BRANCH
  to your repo's workflow (Archon used `dev` -> `main`).
- Archon-specific release plumbing (Homebrew tap sync, `update-homebrew` CI job,
  `coleam00/Archon` repo strings, binary pre-flight `bun build --compile` smoke
  test, `/test-release` sub-skills) is NEUTRALIZED below into a "Repo-specific
  hooks" section — enable the parts your project actually has; they were not
  applicable to a clean port.
-->

# Release Skill

Creates a release by comparing a development branch to the default branch, generating changelog entries from commits, bumping the version, and creating a PR.

> Set these for your repo (Archon used `dev`/`main`):
> `DEV_BRANCH=dev`  `MAIN_BRANCH=main`

## Process

### Step 1: Validate State

```bash
git checkout "$DEV_BRANCH"
git pull origin "$DEV_BRANCH"
git status --porcelain  # must be empty
git fetch origin "$MAIN_BRANCH"
```

If not on the dev branch or working tree is dirty, abort with a clear message.

### Step 2: Detect Stack and Current Version

Detect the project's package manager and version file:

1. **Check for `pyproject.toml`** — Python project, version in `version = "x.y.z"`
2. **Check for `package.json`** — Node/Bun project, version in `"version": "x.y.z"`
3. **Check for `Cargo.toml`** — Rust project, version in `version = "x.y.z"`
4. **Check for `go.mod`** — Go project (version from git tags only, no file to bump)

If none found, abort: "Could not detect project stack — no version file found."

Read the current version from the detected file.

### Step 3: Determine Version Bump

**Bump rules based on argument:**
- No argument or `patch` (default): `0.1.0 -> 0.1.1`
- `minor`: `0.1.3 -> 0.2.0`
- `major`: `0.3.5 -> 1.0.0`

### Step 4: Collect Commits

```bash
# Get all commits on the dev branch that aren't on main
git log "$MAIN_BRANCH".."$DEV_BRANCH" --oneline --no-merges
```

If no new commits, abort: "Nothing to release — dev is up to date with main."

### Step 5: Draft Changelog Entries

Read the commit messages and the actual diffs (`git diff "$MAIN_BRANCH".."$DEV_BRANCH"`) to understand what changed.

**Categorize into Keep a Changelog sections:**
- **Added** — new features, new files, new capabilities
- **Changed** — modifications to existing behavior
- **Fixed** — bug fixes
- **Removed** — deleted features or code

**Writing rules:**
- Write entries as a human would — clear, concise, user-facing language
- Do NOT just copy commit messages verbatim — rewrite them into proper changelog entries
- Group related commits into single entries where it makes sense
- Include PR numbers in parentheses when available: `(#12)`
- Each entry should start with a noun or gerund describing WHAT changed
- Skip internal-only changes (CI tweaks, typo fixes) unless they affect behavior
- One blank line between sections

### Step 6: Update Files

1. **Version file** — update version to new value:
   - `package.json`: update `"version": "x.y.z"`
   - `pyproject.toml`: update `version = "x.y.z"`
   - `Cargo.toml`: update `version = "x.y.z"`

2. **Workspace version sync** (monorepo only):
   - If `scripts/sync-versions.sh` exists, run `bash scripts/sync-versions.sh` to sync all `packages/*/package.json` versions to match the root version.

3. **Lockfile refresh** (stack-dependent):
   - `package.json` + `bun.lock`: run `bun install`
   - `package.json` + `package-lock.json`: run `npm install --package-lock-only`
   - `pyproject.toml` + `uv.lock`: run `uv lock --quiet`
   - `Cargo.toml`: run `cargo update --workspace`

4. **`CHANGELOG.md`** — prepend new version section:

```markdown
## [x.y.z] - YYYY-MM-DD

One-line summary of the release.

### Added

- Entry one (#PR)
- Entry two (#PR)

### Changed

- Entry one (#PR)

### Fixed

- Entry one (#PR)
```

Move any content under `[Unreleased]` into the new version section. Leave `[Unreleased]` header with nothing under it.

### Step 7: Present for Review

Show the user:
1. The detected stack and version file
2. The version bump (old -> new)
3. The full changelog section that will be added
4. The list of commits being included

Ask: "Does this look good? I'll commit and create the PR."

### Step 8: Commit and PR

Only after user approval:

```bash
# Stage version file, workspace packages, lockfile, and changelog
git add <version-file> packages/*/package.json <lockfile> CHANGELOG.md
git commit -m "Release x.y.z"

# Push dev
git push origin "$DEV_BRANCH"

# Create PR: dev -> main
gh pr create --base "$MAIN_BRANCH" --head "$DEV_BRANCH" \
  --title "Release x.y.z" \
  --body "$(cat <<'EOF'
## Release x.y.z

{changelog section content}

---

Merging this PR releases x.y.z to main.
EOF
)"
```

Return the PR URL to the user.

### Step 9: Tag, Release, and Sync After Merge

After the PR is merged (either by the user or via `gh pr merge`):

```bash
# Fetch the merge commit on main
git fetch origin "$MAIN_BRANCH"

# Tag the merge commit
git tag vx.y.z origin/"$MAIN_BRANCH"
git push origin vx.y.z

# Create a GitHub Release from the tag (uses changelog content as release notes)
gh release create vx.y.z --title "vx.y.z" --notes "{changelog section content without the ## header}"

# Sync dev with main so both branches are identical
git checkout "$DEV_BRANCH"
git pull origin "$MAIN_BRANCH"
git push origin "$DEV_BRANCH"
```

> **Do NOT** use `git pull origin "$MAIN_BRANCH" --ff-only` or `git reset --hard origin/"$MAIN_BRANCH"` for this sync. Fast-forward is impossible across a squash merge — main's squash commit has a different SHA than the dev release commit, so dev is never fast-forwardable to main. And resetting dev to main rewrites dev's history, which severs every open PR's merge-base. The plain `git pull origin "$MAIN_BRANCH"` above creates a regular merge commit on dev. The merge bubble in dev's `git log` is the right cost for preserving open-PR sanity.

The GitHub Release is distinct from the git tag — without it, the release won't appear on the repository's Releases page. Always create it.

If the user merges the PR themselves and comes back, still offer to tag, release, and sync.

### Step 10: Repo-specific hooks (ARCHON-SPECIFIC — enable only if your project has them)

The original Archon skill additionally performed, after the tag was pushed:

- **Compiled-binary pre-flight smoke test** (before any version bump): `bun build --compile --minify --target=bun --outfile="$TMP_BINARY" packages/cli/src/cli.ts`, then assert `"$TMP_BINARY" --help` exits 0 and emits no `TypeError|ReferenceError|SyntaxError`. Skip entirely unless your project ships a compiled-binary CLI.
- **Homebrew formula atomic update**: fetch `checksums.txt` from the GitHub release, extract per-platform SHA256 values, regenerate `homebrew/<tool>.rb` with version AND SHAs together (never one without the other), commit to main, then sync to a `<you>/homebrew-<tool>` tap repo. Skip unless you publish a Homebrew formula.
- **End-to-end install verification**: run your project's own `/test-release` (or equivalent `install.sh` + checksum) skill to confirm the published binary installs and runs. Skip if you have no such verification harness.

Each of these is optional and was neutralized in this port because it depends on Archon's specific release infrastructure (`coleam00/Archon` repo, `update-homebrew` CI job, prebuilt binary pipeline). Wire them back in only for the repo that actually has them.

## Recovery: deterministic release CI failure

If a release workflow fails twice in a row after the tag is pushed, do NOT re-run it a third time hoping it succeeds — a reproducible failure is a code bug.

**Immediate mitigation (restore the install path):**
Delete the GitHub Release so `releases/latest` falls back to the previous version. Keep the git tag — tag immutability matters and there are no shipped artifacts pointing at it.

```bash
gh release delete "vx.y.z" --yes
# Do NOT delete the tag:
#   git push --delete origin vx.y.z   ← do not run
```

Then file a hotfix issue for whatever broke, cut `x.y.z+1` with the fix, and re-run this skill.

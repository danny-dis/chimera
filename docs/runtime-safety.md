# Chimera runtime safety MVP

Chimera's runtime safety layer is intentionally deterministic and enforced outside model prompts.

## Permission profiles

| Profile | Behavior in this MVP |
| --- | --- |
| `read-only` | Allows read-only commands such as tests, linters, and git checks; blocks write-like and destructive commands. |
| `ask-before-write` | Blocks write-like commands because this MVP is non-interactive and cannot safely prompt mid-command. |
| `workspace-write` | Allows non-destructive write-like commands but still blocks destructive commands. |
| `trusted-project` | Same command policy as workspace-write for now; reserved for broader trusted automation later. |
| `danger-full-access` | Allows all commands and should only be used in an isolated environment. |

## Check mode

`chimera check` discovers likely verification commands from repository manifests and runs them through the policy layer.

Discovery currently supports:

- `package.json` scripts in preferred order: `lint`, `typecheck`, `test`, `build`;
- `Cargo.toml` via `cargo test`;
- `go.mod` via `go test ./...`;
- Python manifests via `pytest`;
- `git diff --check` for patch whitespace/conflict issues.

Examples:

```bash
node ./bin/chimera.js check
node ./bin/chimera.js check "npm run lint,node --test"
node ./bin/chimera.js check --permission workspace-write "npm install"
```

The last command is permitted by policy only outside read-only/ask-before-write profiles. Destructive commands remain blocked unless `danger-full-access` is selected.


## Patch mode

`chimera patch <diff-file>` validates a unified diff without mutating the workspace. It checks that patch paths are workspace-relative and then runs `git apply --check`.

To apply a patch, the user must explicitly pass `--apply` and select a profile that permits write-like commands:

```bash
node ./bin/chimera.js patch .chimera/sessions/<id>/proposal.diff
node ./bin/chimera.js patch --apply --permission workspace-write .chimera/sessions/<id>/proposal.diff
```

Patch mode intentionally applies through `git apply` rather than direct model-driven file writes. This keeps proposed changes reviewable, reversible through Git, and blocked by the same deterministic policy layer used by check mode.

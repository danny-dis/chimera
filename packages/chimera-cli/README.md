# Chimera CLI

Chimera is an experimental terminal coding agent. It supports multiple API
providers and local models, but needs a working provider configuration to run a
task. It is not certified for unattended use.

## Set up from source

Use Node.js 22.13 or newer and pnpm 11 (pinned to 11.0.8). Follow the
[repository setup steps](../../README.md#set-up-from-source) to install and build.
To work on a different repository, change to that project's directory and invoke
the built CLI by its absolute path:

```bash
cd /path/to/your-project
node "/absolute/path/to/chimera/packages/chimera-cli/dist/index.js" setup
node "/absolute/path/to/chimera/packages/chimera-cli/dist/index.js" code "fix the failing tests" --verify "pnpm test"
```

The current directory is the target workspace. On Windows, use a quoted path such
as `"C:/path/to/chimera/packages/chimera-cli/dist/index.js"`.

Public v0.6.0 downloads have not been published. Use the source-checkout workflow
above. Public npm installation has not been verified.

The wizard writes `.chimera/config.yaml` in the current directory and saves
supplied API keys to `.env`. It sends small completion requests to test configured
API-provider connections, which may incur charges. It skips the Ollama connection
test; start the local server and make the selected model available yourself.
Automatic local-provider detection has not been verified for first-time setup.

The CLI loads project configuration from `.chimera/config.yaml` relative to its
working directory. It does not load `~/.chimera/config.yaml`. The schema requires
`providers` entries with `name`, `provider`, `model`, and `role` fields. Roles are
`writer`, `reviewer`, and `challenger`; entries can also specify `api_key` and
`base_url`. For the full schema, see [config-loader.ts](src/config-loader.ts).
Keep `.env` and credentials out of version control.

## Commands and presets

The examples below run from the source checkout using the root `chimera` script.

| Command | Purpose |
|---|---|
| `pnpm chimera` | Open the terminal UI |
| `pnpm chimera ask "explain this repository"` | Ask a question with read-only tools |
| `pnpm chimera plan "add input validation"` | Plan a change with read-only tools |
| `pnpm chimera code "fix the failing tests"` | Make a coding change |
| `pnpm chimera debug "find the parser bug"` | Investigate and fix a bug |
| `pnpm chimera review "review the current diff"` | Review with read-only tools |

`code` defaults to `--preset solo`. It accepts `solo`, `duo`, `trio`, `fusion`,
`hive`, `swarm`, or `auto`; choose `--preset auto` explicitly for adaptive strategy
selection. A preset name does not certify that strategy's reliability. See the
[release-readiness record](../../DOCS/RELEASE_READINESS.md) for historical results
and unresolved limitations.

## Run and verify

```bash
pnpm chimera code "fix the off-by-one in src/parser.ts" --verify "npm test"
pnpm chimera code "fix src/parser.ts" --verify "node verify.cjs" --verify-input verify.cjs
```

Choose a verification command that applies to your project. `--verify` is
repeatable, as is `--verify-input` on `code`, `debug`, `oal`, and `parallel`.
The verifier file must already exist as a regular, non-symlinked file inside the
workspace. Its contents are pinned before generation, including repair and
checkpoint resume. Workflow coding steps accept the same paths in
`inputs.verificationInputs`. Only declared files are protected; this detects
changes at verification boundaries, not transient writes restored between them.

Inspect the worktree diff and run the relevant tests and build checks yourself.
The command's completion status alone is not proof that a task is correct.

## Permissions and learning

`ask`, `plan`, and `review` use read-only tool permissions. Write-capable modes
permit edits, with file-write approval prompts in interactive runs. Non-interactive
runs can edit without those prompts. The default edit profile denies
model-requested shell tools.

`--yolo` explicitly auto-approves tools in write-capable modes. It is off by default
and does not override read-only modes. Use it only in a workspace you trust.

Configured spending limits are stop thresholds. They are not hard ceilings on
in-flight provider charges.

The global `--no-learn` flag disables automatic learning, including background
memory extraction. Existing memory access and session persistence remain
available. It does not disable provider calls or make the run private or offline.

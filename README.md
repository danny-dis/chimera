# Chimera

Chimera is an experimental terminal coding agent. It can inspect a repository,
edit files, and run caller-supplied checks using one model or several configured
model roles. It supports multiple API providers and local models; it does not
require a particular vendor or an external orchestration service.

Chimera is not certified for unattended use. Review its changes and verification
results before relying on them. Public v0.6.0 downloads have not been published.
Use the source-checkout workflow below.

## Set up from source

You need Node.js 22.13 or newer and pnpm 11. The repository pins pnpm 11.0.8.

```bash
git clone https://github.com/danny-dis/chimera.git
cd chimera
npm install --global pnpm@11.0.8
pnpm install --frozen-lockfile
pnpm build
```

### Use Chimera in another project

Change to the project you want to work on, then run the built CLI by its absolute
path. The current directory is the workspace for configuration, file tools, and
verification commands.

```bash
cd /path/to/your-project
node "/absolute/path/to/chimera/packages/chimera-cli/dist/index.js" setup
node "/absolute/path/to/chimera/packages/chimera-cli/dist/index.js" code "fix the failing tests" --verify "pnpm test"
```

On Windows, use a quoted path such as
`"C:/path/to/chimera/packages/chimera-cli/dist/index.js"`.
The examples below use `pnpm chimera` inside the Chimera checkout. In your own
project, use the absolute Node entrypoint above.

`setup` writes `.chimera/config.yaml` and saves supplied API keys to `.env`. It also sends small
completion requests to test API-provider connections; those requests may incur
charges. The wizard skips connection tests for Ollama, so configure and start the
local server yourself. Automatic local-provider detection has not been verified
for first-time setup. Keep `.env` and credentials out of version control.

## Run a task and check the result

```bash
pnpm chimera code "fix the failing tests" --verify "pnpm test"
```

`code` defaults to the `solo` preset. Select `--preset auto` explicitly to request
adaptive strategy selection. Other presets and command options are described in
the [CLI guide](packages/chimera-cli/README.md).

Use `--verify` for a check you choose. Repeat it to run more than one command.
If you have an existing verifier file, declare it with `--verify-input`:

```bash
pnpm chimera code "fix src/parser.ts" --verify "node verify.cjs" --verify-input verify.cjs
```

`verify.cjs` must already exist inside the workspace. Declared verification inputs
are checked for changes across generation, repair, and checkpoint resume. Only
listed files are protected, and the checks do not detect transient writes that
are restored between verification boundaries. Inspect the diff and run the
relevant tests yourself; a completion status is not proof that the change is
correct.

## Permissions and local data

- `ask`, `plan`, and `review` use read-only tool permissions. Write-capable modes
  permit edits; interactive runs request approval for file writes. Non-interactive
  runs can edit files without those prompts, while model-requested shell tools
  are denied by the default edit profile.
- `--yolo` enables tool auto-approval in write-capable modes. It is off by default
  and does not make read-only modes writable. Use it only in a workspace you trust.
- `--no-learn` disables automatic learning. Existing memory access and session
  persistence remain available; this flag is not an offline or privacy mode.

## Status and documentation

The [release-readiness record](DOCS/RELEASE_READINESS.md) contains historical test
results and unresolved limitations, including Windows process lifecycle,
mode/preset acceptance, and restart reliability. Those results do not certify the
current checkout or sustained unattended operation. Public npm installation and
clean-consumer release readiness still require verification.

The [documentation index](DOCS/README.md) separates usage guidance, design goals,
and historical evidence. Start there for architecture and development plans.

## Development

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm dev
```

Run the checks relevant to your change and report failures or checks you skipped.

## License

MIT

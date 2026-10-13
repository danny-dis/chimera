# Chimera CLI

Chimera is a terminal coding agent. The CLI requires a configured provider;
provider availability and task results depend on your local configuration.

## Requirements

- Node.js 22.13 or newer.
- A provider configured for your environment. API providers require valid
  credentials; local provider detection has not been certified as a zero-config
  first-run path.

## Install and configure

After the CLI and its runtime packages are published together:

```bash
npm install -g @chimera/cli
chimera setup
```

For a source checkout, see the repository README for the Node/pnpm setup and
build steps, then run `pnpm chimera setup`.

## Run and verify

```bash
chimera code "fix the off-by-one in src/parser.ts" --verify "npm test"
```

Inspect the worktree diff and run the relevant tests and build checks yourself;
the command's completion status alone is not proof that a task is correct.

Project configuration can live at `.chimera/config.yaml`; user configuration
can live at `~/.chimera/config.yaml`. Keep credentials in environment variables
or another local secret store rather than committing them.

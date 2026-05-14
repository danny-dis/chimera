# Chimera

Chimera is a terminal-native, provider-neutral AI coding-agent platform. It starts as a safe local coding CLI and is designed to evolve into a multi-agent system where writer, reviewer, and challenger agents coordinate on complex software tasks.

## Current MVP status

This repository now contains the first runnable Chimera MVP scaffold:

- a `chimera` CLI entrypoint;
- read-only `ask`, `plan`, `review`, `check`, and `status` modes plus a guarded `code` mode for provider-backed patch proposal artifacts;
- `--agents solo|duo|trio|auto` orchestration with writer, reviewer, and challenger roles;
- repository scanning for files, languages, docs, tests, package manifests, and instruction files;
- append-only session event logs under `.chimera/sessions/`;
- deterministic JSON or Markdown output;
- optional OpenAI-compatible provider calls via `CHIMERA_API_KEY`, `CHIMERA_MODEL`, and `CHIMERA_BASE_URL`;
- role-specific provider overrides through `CHIMERA_WRITER_MODEL`, `CHIMERA_REVIEWER_MODEL`, `CHIMERA_CHALLENGER_MODEL`, matching `*_API_KEY` / `*_BASE_URL` variables, or locally authenticated CLI commands via `CHIMERA_WRITER_COMMAND`, `CHIMERA_REVIEWER_COMMAND`, and `CHIMERA_CHALLENGER_COMMAND`;
- Node test coverage for the CLI and repo scanner.

The architecture blueprint remains the long-term product plan:

- [Chimera Terminal Coding Agent Blueprint](docs/chimera-agent-blueprint.md)
- [Side-by-side Claude Code / Codex workflow research](docs/research/side-by-side-agent-workflows.md)

## Quick start

```bash
npm test
npm run lint
node ./bin/chimera.js status
node ./bin/chimera.js plan "add provider-backed code mode"
node ./bin/chimera.js code --agents duo "add provider-backed code mode"
node ./bin/chimera.js plan --agents trio "redesign auth rollback"
node ./bin/chimera.js check
node ./bin/chimera.js review --json
CHIMERA_API_KEY=... CHIMERA_MODEL=... node ./bin/chimera.js ask "summarize this repo"
```

## MVP command surface

```text
chimera ask <question>   # Build a local evidence pack for repo Q&A
chimera plan <goal>      # Produce a repo-aware implementation plan
chimera code <goal>      # Save a provider-backed patch proposal when configured
chimera review [target]  # Review git status/diff evidence and suggest checks
chimera check [commands] # Discover and run safe project checks
chimera status           # Show repository profile and instruction sources

Options:
  --agents solo|duo|trio|auto  # Select writer-only, writer+reviewer, writer+reviewer+challenger, or heuristic routing
  --permission read-only|ask-before-write|workspace-write|trusted-project|danger-full-access
```

## Multi-agent model configuration

```bash
CHIMERA_API_KEY=... \
CHIMERA_MODEL=gpt-default \
CHIMERA_WRITER_MODEL=gpt-writer \
CHIMERA_REVIEWER_MODEL=claude-reviewer-via-compatible-gateway \
CHIMERA_REVIEWER_BASE_URL=https://anthropic-compatible.example/v1 \
CHIMERA_CHALLENGER_MODEL=gemini-challenger-via-compatible-gateway \
CHIMERA_CHALLENGER_BASE_URL=https://google-compatible.example/v1 \
node ./bin/chimera.js plan --agents trio "add passwordless auth"
```

Or wire locally authenticated terminal agents as role commands:

```bash
CHIMERA_WRITER_COMMAND="codex exec --full-auto" \
CHIMERA_REVIEWER_COMMAND="claude -p" \
node ./bin/chimera.js code --agents duo "fix the failing tests"
```

The current implementation intentionally avoids unsafe autonomous edits. `check` mode runs only commands allowed by the selected permission profile and records check results in the session log. `code` mode can save a provider-generated patch proposal, but automatic application is blocked until the patch engine, permission prompts, and test-command discovery are implemented.

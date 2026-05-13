# Chimera

Chimera is a terminal-native, provider-neutral AI coding-agent platform. It starts as a safe local coding CLI and is designed to evolve into a multi-agent system where writer, reviewer, and challenger agents coordinate on complex software tasks.

## Current MVP status

This repository now contains the first runnable Chimera MVP scaffold:

- a `chimera` CLI entrypoint;
- read-only `ask`, `plan`, `review`, and `status` modes plus a guarded `code` mode for provider-backed patch proposal artifacts;
- repository scanning for files, languages, docs, tests, package manifests, and instruction files;
- append-only session event logs under `.chimera/sessions/`;
- deterministic JSON or Markdown output;
- optional OpenAI-compatible provider calls via `CHIMERA_API_KEY`, `CHIMERA_MODEL`, and `CHIMERA_BASE_URL`;
- Node test coverage for the CLI and repo scanner.

The architecture blueprint remains the long-term product plan:

- [Chimera Terminal Coding Agent Blueprint](docs/chimera-agent-blueprint.md)

## Quick start

```bash
npm test
npm run lint
node ./bin/chimera.js status
node ./bin/chimera.js plan "add provider-backed code mode"
node ./bin/chimera.js code "add provider-backed code mode"
node ./bin/chimera.js review --json
CHIMERA_API_KEY=... CHIMERA_MODEL=... node ./bin/chimera.js ask "summarize this repo"
```

## MVP command surface

```text
chimera ask <question>   # Build a local evidence pack for repo Q&A
chimera plan <goal>      # Produce a repo-aware implementation plan
chimera code <goal>      # Save a provider-backed patch proposal when configured
chimera review [target]  # Review git status/diff evidence and suggest checks
chimera status           # Show repository profile and instruction sources
```

The current implementation intentionally avoids unsafe autonomous edits. `code` mode can save a provider-generated patch proposal, but automatic application is blocked until the patch engine, permission prompts, and test-command discovery are implemented.

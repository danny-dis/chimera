# Chimera

Terminal-native parallel multi-agent coding platform.

Chimera presents as a single unified agent to the user, but deploys 2-3 agents on different providers working in parallel — a cheap model for bulk work, a frontier model for verification, and an optional challenger for complex tasks.

## Features

- **Parallel Multi-Agent Execution** — User sees one agent, one response. Behind the scenes, multiple agents work in parallel and in series
- **Provider Pairing** — Cheap model + frontier model on different providers, configurable by the user
- **Cost-Aware Routing** — Configurable cost caps (per-task, per-session, per-day), automatic model selection based on task complexity
- **Serial Quality Gate** — Draft → verify → challenge → synthesize. Each stage uses a different model/provider
- **Agent Relay Racing** — Monitors context fill, triggers graceful handoff before degradation hits
- **Worktree Isolation** — Branch-level isolation for parallel agent execution with automatic cleanup
- **Declarative Workflows** — DAG-based workflow engine with 7 node variants (command, prompt, bash, loop, approval, cancel, script)
- **VS Code Integration** — Chat panel, config panel, and status bar for seamless IDE experience
- **JSON-RPC Daemon** — Background service for VS Code communication and task execution
- **LSP Code Intelligence** — Go-to-definition, find references, hover, and document symbols
- **Structured Logging** — Pino-based logger with event tracking and log levels
- **Session Persistence** — Conversation recovery and session management
- **Config TUI** — Interactive setup for provider pairing, cost caps, role assignment

## Architecture

```
packages/
├── chimera-cli/        # CLI entry point and router
├── chimera-context/    # Context engine, handoff protocol, relay racing
├── chimera-core/       # Agent mesh, session orchestrator, task router
├── chimera-daemon/     # JSON-RPC daemon for VS Code integration
├── chimera-eval/       # Evaluation harness
├── chimera-isolation/  # Worktree isolation and branch management
├── chimera-learning/   # Learning and adaptation system
├── chimera-lsp/        # LSP integration for code intelligence
├── chimera-paths/      # Path utilities and pino logger
├── chimera-providers/  # Provider integrations, cost tracking, rate limiting
├── chimera-session/    # Session management and persistence
├── chimera-tools/      # Tool execution, sandboxing, permissions
├── chimera-tui/        # Terminal UI components
├── chimera-vscode/     # VS Code extension and WebView panels
└── chimera-workflows/  # Declarative workflow engine and DAG schema
```

## Getting Started

```bash
# One-line install
curl -fsSL https://raw.githubusercontent.com/danny-dis/chimera/main/install.sh | bash

# Or via npm
npx @chimera/cli

# Or via bun
bunx @chimera/cli
```

### Manual Install

```bash
git clone https://github.com/danny-dis/chimera.git
cd chimera
pnpm install
pnpm build
pnpm chimera
```

### VS Code Extension

1. Install the extension from the marketplace
2. Open a workspace with a `.chimera/config.yaml` file
3. Use the Chimera panel to interact with agents
4. Commands: `Chimera: Open Chat`, `Chimera: Open Config`, `Chimera: Execute Task`

## Configuration

Chimera uses a `config.yaml` file for provider configuration:

```yaml
providers:
  cheap:
    provider: deepseek
    model: deepseek-coder
  frontier:
    provider: anthropic
    model: claude-opus-4
  challenger:
    provider: openai
    model: gpt-4o

cost_caps:
  per_task: 0.50
  per_session: 5.00
  per_day: 20.00
```

## How It Works

1. **Task Decomposition** — Orchestrator breaks user request into subtasks
2. **Parallel Execution** — Subagents run simultaneously on different providers
3. **Serial Quality Gate** — Results go through draft → verify → challenge → synthesize
4. **Response Synthesis** — Single unified response presented to user

## Development

```bash
# Run tests
pnpm test

# Run linter
pnpm lint

# Type check
pnpm typecheck

# Dev mode
pnpm dev
```

## Tech Stack

- TypeScript
- Node.js
- pnpm workspaces
- Turborepo
- Vitest

## License

MIT

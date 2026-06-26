# Chimera

Terminal-native parallel multi-agent coding platform.

Chimera presents as a single unified agent to the user, but deploys 2-3 agents on different providers working in parallel — a cheap model for bulk work, a frontier model for verification, and an optional challenger for complex tasks.

## Features

- **Parallel Multi-Agent Execution** — User sees one agent, one response. Behind the scenes, multiple agents work in parallel and in series
- **Provider Pairing** — Cheap model + frontier model on different providers, configurable by the user
- **Cost-Aware Routing** — Configurable cost caps (per-task, per-session, per-day), automatic model selection based on task complexity
- **Serial Quality Gate** — Draft → verify → challenge → synthesize. Each stage uses a different model/provider
- **Agent Relay Racing** — Monitors context fill, triggers graceful handoff before degradation hits
- **Config TUI** — Interactive setup for provider pairing, cost caps, role assignment

## Architecture

```
packages/
├── chimera-cli/        # CLI entry point and router
├── chimera-core/       # Agent mesh, session orchestrator, task router
├── chimera-context/    # Context engine, handoff protocol, relay racing
├── chimera-providers/  # Provider integrations, cost tracking, rate limiting
├── chimera-tools/      # Tool execution, sandboxing, permissions
├── chimera-eval/       # Evaluation harness
└── chimera-tui/        # Terminal UI
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run chimera
pnpm chimera
```

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

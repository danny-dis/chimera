# Chimera — Project Instructions

This file provides project-specific context for AI coding agents working in the Chimera monorepo.

---

## Quick Reference

- **Primary directives**: See `AGENTS.md` (the source of truth for all agent behavior)
- **Runtime rules**: See `.chimera/rules.md` (session-specific constraints and provider config)
- **Architecture**: See `chimera-agent-blueprint.md` (full design document)
- **Progress**: See `AGENTS_CHECKLIST.md` (feature completion tracker)

## Repository Structure

```
chimera/
  packages/
    chimera-cli/          CLI entry point + router
    chimera-core/         Agent mesh, session orchestrator, task router
    chimera-context/      Context engine, handoff, relay racing
    chimera-providers/    Provider integrations, cost tracking
    chimera-tools/        Tool execution, sandboxing, permissions
    chimera-session/      Session management + persistence
    chimera-tui/          Terminal UI (Ink/React)
    chimera-eval/         Evaluation harness
    chimera-isolation/    Worktree isolation + branch management
    chimera-learning/     Learning and adaptation
    chimera-lsp/          LSP integration
    chimera-paths/        Path utilities + pino logger
    chimera-daemon/       JSON-RPC daemon for VS Code
    chimera-vscode/       VS Code extension
    chimera-workflows/    Declarative workflow engine + DAG schema
  .chimera/               Runtime config, sessions, rules
  .gitnexus/              Code intelligence index
  .claude/                Agent skills (GitNexus)
  research/               Reference codebases and analysis
```

## Build & Test Commands

```bash
# Install
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Typecheck
pnpm typecheck

# Run specific package tests
pnpm --filter chimera-core test

# Smoke tests
node scripts/smoke-test.js
```

## GitNexus Code Intelligence

This project is indexed by GitNexus. Use the MCP tools for:

- **Impact analysis** before editing any symbol
- **Change detection** before committing
- **Execution flow** exploration for unfamiliar code
- **Symbol context** for callers, callees, and participation in flows

See `AGENTS.md` section "GitNexus — Code Intelligence" for the full tool reference.

## Key Architectural Patterns

1. **Event-driven**: All state changes emit immutable events
2. **Serial quality gate**: Draft → Verify → Challenge → Synthesize
3. **Agent relay racing**: Context monitoring → Handoff → Fresh agent
4. **Provider pairing**: Cheap model + Frontier model on different providers
5. **Cost-aware routing**: Task complexity → model selection → budget enforcement

## Contributing

- Write tests for deterministic code
- Run the narrowest useful checks after edits
- Follow existing code patterns (Zod schemas, TypeScript strict mode, Biome formatting)
- Check `AGENTS_CHECKLIST.md` for current priorities

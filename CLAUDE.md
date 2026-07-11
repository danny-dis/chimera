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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **chimera** (7727 symbols, 17997 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/chimera/context` | Codebase overview, check index freshness |
| `gitnexus://repo/chimera/clusters` | All functional areas |
| `gitnexus://repo/chimera/processes` | All execution flows |
| `gitnexus://repo/chimera/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

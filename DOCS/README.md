# Chimera Documentation

Chimera is an independent, terminal-native coding agent: one coherent agent experience backed internally by a dynamic portfolio of models, providers, specialist workers, tools, and verification.

## Source of truth

| Document | Purpose |
|---|---|
| `README.md` | Product overview, install, quick start |
| `DOCS/PRODUCT.md` | Product contract, principles, UX and non-goals |
| `DOCS/ARCHITECTURE.md` | Target architecture and subsystem boundaries |
| `DOCS/TRIO_AND_COST.md` | Trio Mode, adaptive execution and cost-per-success optimization |
| `DOCS/ROADMAP.md` | Implementation phases and acceptance gates |
| `DOCS/MIGRATION.md` | Migration from the current repository to the target architecture |
| `plans/CHIMERA_NEXT_GENERATION_CODING_AGENT.md` | Main implementation blueprint for coding agents |
| `plans/TRIO_COST_SUCCESS_IMPLEMENTATION.md` | Detailed Trio/cost-per-success implementation plan |

## Source-of-truth rules

1. Prefer these canonical documents over historical plans.
2. Documentation must describe implemented behavior accurately; planned behavior must be explicitly marked planned.
3. Product docs must not imply a dependency on ATHENA, DMR-X, Ghost Factory, Sovereign Mind/SMS, or another external project.
4. MCP and A2A are interoperability adapters, not Chimera's internal architecture.
5. Examples must use provider-neutral names unless a provider is specifically being documented.
6. Do not keep duplicate implementation roadmaps in tool-generated plan directories.
7. Historical research may be retained as reference, but it is not implementation authority.
8. When architecture changes, update the canonical docs and implementation blueprint in the same change.
9. Every major new execution strategy must document its quality, cost, latency and verification behavior.

## Documentation hierarchy

```text
README.md
   |
   +-- DOCS/PRODUCT.md
   +-- DOCS/ARCHITECTURE.md
   +-- DOCS/TRIO_AND_COST.md
   +-- DOCS/ROADMAP.md
   +-- DOCS/MIGRATION.md
   +-- plans/CHIMERA_NEXT_GENERATION_CODING_AGENT.md
   `-- plans/TRIO_COST_SUCCESS_IMPLEMENTATION.md
```

## What Chimera is not

Chimera is not a generic agent runtime, personal assistant, or sovereign orchestrator. It is a coding agent that may expose APIs and adapters so other systems can use it.

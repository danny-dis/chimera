# Chimera documentation

For installation and a first task, start with the [repository README](../README.md).
The [CLI guide](../packages/chimera-cli/README.md) covers configuration, presets,
verification inputs, and permission limits.

Chimera is experimental and is not certified for unattended use. Public v0.6.0
downloads have not been published.

## Status and test evidence

- [Release readiness](RELEASE_READINESS.md): acceptance requirements, historical
  results, and unresolved release blockers.
- [Daily-driver status](DAILY_DRIVER_STATUS.md): earlier hardening checkpoints and
  remaining work.
- [Daily-driver handover](DAILY_DRIVER_HANDOVER.md): detailed run evidence and
  preserved work in progress.

These records apply to the revisions and environments they name. Historical
passes do not certify the current checkout, every mode/preset combination,
Windows process cleanup, crash recovery, or sustained unattended operation.
Read the failures and limitations alongside the passing checks.

## Design and implementation plans

These documents describe intended behavior and implementation direction. They
are not release acceptance reports. For example, design documents describe
`auto` as the desired default, while the current `code` command defaults to `solo`.
Use the CLI source and usage guide for current command behavior.

| Document | Subject |
|---|---|
| [Product contract](PRODUCT.md) | Product goals, UX principles, and non-goals |
| [Architecture](ARCHITECTURE.md) | Target subsystem boundaries |
| [Deliberation modes](DELIBERATION_MODES.md) | Strategy design goals |
| [Trio and cost](TRIO_AND_COST.md) | Role selection, budgets, and cost goals |
| [Roadmap](ROADMAP.md) | Implementation phases and acceptance requirements |
| [Migration](MIGRATION.md) | Migration toward the target architecture |
| [Coding-agent blueprint](../plans/CHIMERA_NEXT_GENERATION_CODING_AGENT.md) | Implementation plan |
| [Trio/cost implementation plan](../plans/TRIO_COST_SUCCESS_IMPLEMENTATION.md) | Detailed strategy and cost work |

## Maintaining the docs

Describe implemented behavior separately from planned work. Check commands and
configuration examples against the CLI source before changing them. Keep test
results tied to their revision and environment, and preserve failed runs.

Chimera supports multiple providers without requiring a particular external
orchestration project. MCP and A2A are interoperability adapters. Provider-specific
examples belong in provider-specific guidance. Keep one implementation roadmap
rather than copying plans into generated directories.

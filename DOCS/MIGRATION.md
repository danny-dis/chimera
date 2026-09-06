# Migration Strategy

Chimera should evolve from the current repository incrementally. Do not replace the working system with a speculative rewrite.

## Current foundations to preserve

The repository already contains substantial work around AgentMesh, task routing, SessionOrchestrator, solo/Duo/Trio/fusion execution, context relay and compaction, provider adapters, cost tracking, worktree isolation, tools and permissions, LSP, sessions, workflows, evaluation, TUI, VS Code and memory.

These are implementation assets, not proof that every current abstraction is correct.

## Migration order

1. **Characterize** existing behavior with tests and smoke runs.
2. **Define contracts** for stable domain objects.
3. **Extract services** from SessionOrchestrator behind those contracts.
4. **Normalize providers/models** behind provider-neutral interfaces.
5. **Promote Agent Registry** and lifecycle to a first-class subsystem.
6. **Unify strategies** under the adaptive Strategy Engine, retaining existing solo/Duo/Trio/fusion implementations as compatible executors while migrating.
7. **Strengthen repository intelligence and context packing.**
8. **Make checkpoints, verification and evidence durable.**
9. **Move UX to the one-agent abstraction.**
10. **Expose APIs and interoperability adapters.**
11. **Delete obsolete implementations only after replacement coverage is proven.**

## Compatibility policy

Existing commands, config fields and provider integrations should remain compatible where practical. Breaking changes require migration notes and tests.

## Documentation migration

Historical implementation plans should not remain competing sources of truth. New work belongs in the canonical docs and implementation blueprint. Old documents that are still useful should explicitly identify themselves as historical/reference material and link to the canonical documents.

## Cleanup policy

Generated merge snapshots, conflict copies, `.bak` files and temporary outputs do not belong in the product source tree unless they are deliberate fixtures. Cleanup should happen through normal Git commits and must not remove required test fixtures or user-facing examples.

## Definition of done for migration

- standalone install works;
- core coding loop is preserved;
- provider/model selection is replaceable;
- solo and multi-model strategies are unified behind one controller;
- Trio is a first-class adaptive strategy;
- verification produces evidence;
- sessions recover from checkpoints;
- dangerous tool operations remain policy-controlled;
- external integrations are optional;
- canonical documentation matches the implementation.

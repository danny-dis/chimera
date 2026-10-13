# Chimera Implementation Roadmap

This is the canonical implementation roadmap. Detailed tasks live in `plans/CHIMERA_NEXT_GENERATION_CODING_AGENT.md`.

## Phase 0 — Stabilize

- establish clean build/test/typecheck/lint baseline;
- add characterization tests for existing behavior;
- remove unresolved merge artifacts and generated debris;
- consolidate historical plans;
- establish CI and compatibility matrix.

**Gate:** clean checkout builds and existing coding-agent happy path remains functional.

## Phase 1 — Domain contracts

Introduce stable serializable contracts for Session, Run, Mission, Task, Agent, Model, Tool, Artifact, Evidence and Checkpoint.

**Gate:** orchestration no longer requires provider-specific implementation types.

## Phase 2 — Orchestrator decomposition

Extract state, planning, strategy, model selection, agent registry, context, tools, budgets, policy, checkpoints, verification, events, recovery and artifacts behind interfaces.

**Gate:** SessionOrchestrator is a thin facade and services are independently testable.

## Phase 3 — Agent registry

Implement agent registration, capabilities, health, lifecycle, concurrency and the user-facing Agents view/command.

**Gate:** built-in workers use the registry and can be inspected.

## Phase 4 — Model/provider fabric

Unify provider adapters, model metadata, health, pricing, limits, streaming, tool calls, cancellation and selection.

**Gate:** one run can safely mix multiple providers/models.

## Phase 5 — Role composition

Define planner, explorer, implementer, debugger, tester, reviewer, security reviewer and synthesizer roles. Allow `auto` to collapse roles when appropriate.

**Gate:** one-model UX remains first-class while multi-model execution is transparent.

## Phase 6 — Adaptive strategies

Support solo, sequential, parallel, Duo, Trio, map/reduce, debate, supervisor, repair loops and escalation.

**Gate:** `auto` selects the smallest strategy likely to satisfy the task's quality and verification requirements.

## Phase 7 — Repository/context intelligence

Strengthen LSP, symbols, dependencies, semantic search, impact analysis, test discovery and context packing.

**Gate:** models receive focused context rather than repository dumps.

## Phase 8 — Relay and durable checkpoints

Implement structured handoffs, context compaction, crash recovery, cancellation and resumability.

**Gate:** a long run can resume from a valid checkpoint without replaying completed work.

## Phase 9 — Coding/tool loop

Harden the Understand → Plan → Explore → Implement → Run → Observe → Debug → Test → Review → Repair → Verify → Deliver loop.

**Gate:** tool calls are permissioned, observable, cancellable and auditable.

## Phase 10 — Security/isolation

Capability permissions, command policy, secret isolation, worktrees and pluggable sandboxes.

**Gate:** dangerous actions require explicit policy/approval and parallel mutation is conflict-safe.

## Phase 11 — Verification/evidence

Produce deterministic verification evidence and provenance for every deliverable.

**Gate:** Chimera never claims verification it did not perform.

## Phase 12 — Cost/quality optimization

Optimize cost per successful verified outcome. Add strategy/model benchmarks, early stopping, adaptive escalation and task-class performance profiles.

**Gate:** routing decisions are measurable and explainable.

## Phase 13 — UX/API

Polish terminal UX first, then TUI/IDE/headless/API surfaces. Expose deeper internals progressively rather than forcing orchestration management on normal users.

**Gate:** a new user can complete a coding task without learning the internal architecture.

## Phase 14 — Interoperability

Add MCP and A2A adapters plus stable APIs/SDKs without making either protocol a core architectural dependency.

**Gate:** external systems can invoke Chimera while Chimera remains standalone.

## Phase 15 — Evaluation and release

Benchmark task classes, strategies, models and providers. Test failure recovery, security, regressions, cost and latency. Maintain release compatibility.

**Gate:** release criteria are evidence-based and reproducible.

## Continuous rules

- preserve working behavior during migration;
- prefer incremental extraction over blind rewrites;
- keep provider neutrality in core contracts;
- keep deterministic safety/verification above model preferences;
- measure before optimizing;
- document implemented behavior separately from proposals;
- keep historical research out of the source-of-truth path.

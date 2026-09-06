# Deliberation Modes Implementation Plan

## Objective

Implement a single adaptive strategy engine that can execute and compose Chimera's deliberation modes while preserving the product contract: one independent terminal-native coding agent.

## Core architecture

```text
Mission
  ↓
Strategy Selector
  ↓
Strategy Graph
  ├─ Solo
  ├─ Duo
  ├─ Trio
  ├─ Fusion
  ├─ Pipeline
  ├─ Parallel/Race
  ├─ Debate
  ├─ Supervisor/Hierarchical
  ├─ Map/Reduce
  ├─ Repair
  └─ Escalation policy
  ↓
Execution Runtime
  ↓
Evidence + Verification
  ↓
Result / Deliverable
```

All modes use the same task, agent, model, tool, sandbox, context, event, budget, and verification primitives.

## Workstreams

### 1. Strategy contracts

Define stable interfaces for:

- `Strategy`
- `StrategyContext`
- `StrategyDecision`
- `ExecutionGraph`
- `StrategyResult`
- `Evidence`
- `VerificationResult`
- `StrategyPolicy`

The contracts must support cancellation, retries, checkpoints, budgets, deadlines, partial results, and resumability.

### 2. Strategy registry

Create a registry capable of discovering built-in and future strategies without hard-coding strategy logic into the session orchestrator.

Each strategy declares:

- capabilities and prerequisites
- expected parallelism/cardinality
- latency profile
- cost profile
- risk profile
- composability constraints
- verification requirements

### 3. Adaptive strategy selector

Implement `strategy: auto` as a policy decision rather than a static complexity lookup.

Inputs should include task classification, repository intelligence, affected surface, risk, ambiguity, provider health, model capabilities, budget, latency target, historical evaluation, and live evidence.

The selector should return an explainable decision such as:

```text
strategy = trio
reason = high complexity + independent review useful
budget = $0.30
escalation = fusion_if_conflict
```

### 4. Solo and Duo

Promote the simplest execution paths to first-class strategies.

Acceptance:

- Solo has minimal overhead.
- Duo supports explicit complementary roles.
- Both can enter Repair or Escalation without losing context.

### 5. Trio

Implement Trio as a first-class complementary deliberation topology.

Acceptance:

- role-aware workers
- isolated mutation state
- shared read/context plane
- independent reasoning where useful
- deterministic verification
- early stopping
- configurable Cheap/Balanced/Pro profiles
- cost-per-success telemetry

### 6. Fusion

Implement Fusion as synthesis, not winner selection.

The Fusion engine should construct a structured candidate set and conflict/evidence graph. It should identify:

- overlapping edits
- semantic conflicts
- complementary changes
- incompatible assumptions
- test evidence
- repository conventions
- security/performance concerns

It then produces a synthesized patch/result and sends it through normal verification.

Acceptance:

- Handles cleanly compatible candidates without unnecessary rewriting.
- Detects textual and semantic conflicts.
- Preserves useful evidence and provenance.
- Can reject all candidates when evidence is insufficient.
- Never bypasses verification gates.
- Respects budget and escalation policy.

### 7. Parallel / Race

Support independent candidate generation with bounded concurrency and evidence-based selection.

The race winner must be the first **verified acceptable** candidate, not merely the first response.

### 8. Pipeline

Represent sequential stages as an execution graph with explicit input/output contracts and verification gates.

### 9. Debate

Provide bounded challenge rounds with a final decision artifact. Prevent unbounded deliberation.

### 10. Supervisor / Hierarchical

Allow decomposition and delegation for large tasks while keeping deterministic dependency scheduling outside the model where possible.

### 11. Map / Reduce

Add deterministic partitioning, independent work units, result collection, conflict detection, and reduction/fusion.

### 12. Repair

Make repair a reusable strategy that can attach to any other strategy after failed verification.

It should consume failure evidence directly and preserve the previous attempt's useful context.

### 13. Escalation

Implement escalation as a policy layer that can change:

- model tier
- number of agents
- specialist coverage
- verification depth
- execution resources
- approval requirements

Escalation must have explicit budget/deadline limits.

## Strategy composition

The engine must support nested or sequential composition without creating a separate architecture for every combination.

Example execution graphs:

```text
Trio
  ↓ conflict
Fusion
  ↓ failed tests
Repair
  ↓ persistent uncertainty
Escalation
```

and:

```text
Map
  ↓
Reduce/Fusion
  ↓
Verify
```

## Cost and quality policy

Every strategy execution emits:

- inference cost
- tool/execution cost where available
- latency
- agent count
- model/provider usage
- retries
- verification outcome
- regressions
- escalation count
- final success

Evaluation should optimize cost per successful verified outcome by task class. A more expensive deliberation mode is acceptable when its incremental success value justifies the cost.

## Observability

Emit strategy lifecycle events such as:

```text
strategy.selected
strategy.started
strategy.worker.started
strategy.worker.completed
strategy.conflict.detected
strategy.fusion.started
strategy.fusion.completed
strategy.escalated
strategy.repair.started
strategy.verification.completed
strategy.completed
```

Events must be correlated to mission, task, agent, model, tool, sandbox, and artifact IDs.

## Testing and evaluation

Build a deliberation benchmark covering:

- simple bug fixes
- multi-file refactors
- ambiguous requirements
- conflicting implementations
- dependency migrations
- failing-test repair
- security-sensitive changes
- large repository-wide transformations

Compare strategies on verified success, regression rate, cost, latency, retry count, escalation rate, and human acceptance where available.

Required safety checks:

- no mutation outside authorized workspaces
- no strategy can bypass policy/approval gates
- cancellation propagates to workers
- failed workers do not silently become successful results
- unverifiable synthesis cannot be delivered as verified

## Documentation and cleanup

Update the canonical architecture, product, roadmap, Trio/cost-per-success documentation, and implementation blueprint to reference this strategy engine. Retire duplicated historical strategy descriptions only after their useful implementation details have been migrated.

## Definition of done

- Every listed mode has a common strategy contract.
- `auto` can select and compose modes.
- Trio and Fusion are first-class and distinct.
- Repair and Escalation work across modes.
- All final outputs pass common evidence/verification gates.
- Strategy choices and outcomes are observable.
- Evaluation measures cost per successful verified outcome.
- Default UX remains one coherent coding agent.

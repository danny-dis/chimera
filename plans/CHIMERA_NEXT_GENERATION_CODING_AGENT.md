# Chimera Next-Generation Coding Agent

## Status
Proposed implementation blueprint. This document is intentionally implementation-oriented: coding agents should use it as the source of truth for the rebuild while preserving working functionality unless a change is explicitly required.

## Product definition

Chimera is an **independent, terminal-native coding agent** comparable to Claude Code and Codex. It presents one coherent coding agent to the user while internally being able to mix and match models, providers, specialist agents, deterministic tools, and verification workers.

Chimera MUST NOT depend on ATHENA, DMR-X, Ghost Factory, Sovereign Mind/SMS, or any other Danny-dis project. Those systems may integrate with Chimera through documented adapters, APIs, MCP, A2A, or provider interfaces, but Chimera must build, test, install, and operate standalone.

The core differentiator is **one coding agent, many brains**:

- one conversation/session from the user's perspective;
- dynamic model/provider selection per role, task, or phase;
- parallel and serial execution where useful;
- independent verification and repair loops;
- context-aware handoff/relay between models;
- cost/latency/reliability-aware execution;
- strong repository understanding;
- durable sessions and recoverable runs;
- safe, observable, testable execution.

## Current baseline and known issues

The existing repository already contains useful foundations including AgentMesh, TaskRouter, SessionOrchestrator, Context/Relay Racing, provider integrations, cost tracking, workflows, worktree isolation, LSP integration, daemon/JSON-RPC, evaluation, TUI, VS Code integration, memory, and security/audit work.

The repository also contains accumulated implementation-plan and merge artifacts. In particular, `.merge-patches/` contains conflict/patch snapshots and working files, while several historical plans and agent briefs overlap. Cleanup and consolidation are part of this effort; do not preserve stale artifacts merely because they exist.

The existing SessionOrchestrator is too central and should be decomposed behind stable interfaces. Do not perform a blind rewrite: first characterize current behavior with characterization tests, then incrementally extract subsystems.

## Non-goals

- Do not turn Chimera into ATHENA.
- Do not make Chimera a generic personal-assistant platform.
- Do not require DMR-X for model routing.
- Do not require a proprietary provider.
- Do not make MCP or A2A the internal architecture; they are interoperability adapters.
- Do not expose the full multi-agent machinery to ordinary users by default.
- Do not sacrifice single-agent UX for orchestration novelty.

---

# 1. Target architecture

```text
User / CLI / TUI / IDE / API
          |
          v
   Chimera Coding Agent
          |
   Session / Mission API
          |
   Execution Controller
          |
   +------+------+----------------+
   |             |                |
   v             v                v
Context      Strategy         Repository
Engine       Engine           Intelligence
   |             |                |
   +------+------+----------------+
          |
          v
    Execution Graph
          |
   +------+------+-------------------------+
   |             |                         |
 Planner     Implementer                Tools
   |             |                         |
 Model A      Model B              Shell/Git/LSP/MCP
   |             |                         |
   +-------------+-------------------------+
          |
          v
   Test / Review / Security
          |
          v
   Repair / Re-run / Verify
          |
          v
   Evidence + Patch + Summary
```

## Architectural layers

### A. Product layer
- CLI
- TUI
- interactive session
- non-interactive/headless mode
- IDE/VS Code integration
- JSON-RPC/API

### B. Coding-agent layer
- intent understanding
- repository exploration
- planning
- implementation
- debugging
- test execution
- review
- repair
- final response

### C. Orchestration layer
- task graph
- execution strategies
- model-role assignment
- parallelism
- handoff/relay
- cancellation
- retry/recovery
- budgets/deadlines

### D. Intelligence layer
- repository index
- LSP
- symbol graph
- dependency graph
- semantic search
- context packing
- memory

### E. Provider/model layer
- provider adapters
- model catalog
- capability metadata
- health
- pricing
- limits
- latency
- context window
- streaming
- tool-calling support

### F. Execution/security layer
- tool runner
- permission engine
- sandbox
- worktree isolation
- environment management
- secrets
- audit

### G. Verification layer
- tests
- lint
- typecheck
- build
- security checks
- independent model review
- evidence/provenance

---

# 2. Phase 0 — Repository stabilization and characterization

Before major architecture changes, establish a reliable baseline.

### Tasks

1. Run the full test suite, typecheck, lint, build and package checks.
2. Record current behavior of the CLI, TUI, provider selection, tool loop, worktrees, workflows, sessions, relay racing, memory, and VS Code/daemon paths.
3. Add characterization tests around SessionOrchestrator public behavior.
4. Identify duplicate/obsolete plans and agent briefs.
5. Remove or archive stale `.merge-patches/` conflict artifacts and generated working files from source control where they are not intentionally part of the product.
6. Consolidate implementation plans into this roadmap plus small feature-specific execution specs.
7. Establish CI gates: typecheck, unit tests, integration tests, package build, smoke test.
8. Establish a compatibility matrix for Node, pnpm, supported OSes and provider adapters.

### Acceptance criteria

- Clean checkout builds from scratch.
- Full CI is green.
- Existing CLI happy path remains functional.
- No unresolved merge markers/conflict artifacts in product source.
- Every subsequent phase can be reverted independently.

---

# 3. Phase 1 — Stable domain model

Introduce explicit types/interfaces so the runtime stops being encoded inside one large orchestrator.

## Core entities

### Session
User-facing continuous coding interaction.

### Run
One execution attempt inside a session.

### Task
A bounded unit of coding work.

### Mission
A durable higher-level objective containing tasks, constraints, budget and evidence.

### Agent
A named execution persona with capabilities and configuration.

### Model
A model endpoint with capabilities, provider and operational metadata.

### Tool
A deterministic or external operation available to an agent.

### Artifact
Files, patches, logs, test reports, plans, screenshots, generated outputs.

### Evidence
Structured proof supporting a result: tests, compiler output, review findings, commands, provenance.

### Checkpoint
Recoverable state allowing continuation or handoff.

Define stable interfaces under a dedicated domain package rather than allowing packages to import implementation details from SessionOrchestrator.

### Acceptance criteria
- Domain types are serializable.
- IDs are stable and unique.
- State transitions are explicit.
- Public API does not expose provider-specific implementation objects.
- Existing flows can be represented without loss of information.

---

# 4. Phase 2 — Decompose SessionOrchestrator

Turn the current monolithic orchestration behavior into composable services.

Extract:

- SessionStateStore
- RunController
- TaskPlanner
- ExecutionStrategyEngine
- ModelSelector
- AgentRegistry
- ContextController
- ToolController
- BudgetController
- PolicyController
- CheckpointManager
- VerificationController
- EventBus
- RecoveryManager
- ArtifactManager

SessionOrchestrator becomes a thin facade coordinating these interfaces.

### Rule
No new feature should add another large block of logic to SessionOrchestrator unless it is genuinely facade-level behavior.

### Acceptance criteria
- Existing functionality passes characterization tests.
- Individual services can be unit tested without constructing the whole application.
- Dependency injection makes provider/model/tool implementations replaceable.

---

# 5. Phase 3 — Agent Registry and lifecycle

Create a first-class registry so Chimera knows what agents exist.

## Agent record

```ts
AgentDefinition {
  id
  name
  version
  description
  capabilities[]
  tools[]
  modelPreferences
  runtimeRequirements
  permissions
  status
  health
  metadata
}
```

## Lifecycle

```text
registered -> starting -> ready -> running -> paused
                         |          |
                         v          v
                       failed <- recovering
                         |
                       stopped
```

Support:

- registration
- discovery
- health
- versioning
- enable/disable
- capability filtering
- concurrency limits
- graceful shutdown

The user should have an `Agents` view/command showing ready, running, paused, failed and unavailable agents.

### Acceptance criteria

- Built-in coding agents are registered through the same mechanism as future external agents.
- Agent selection can be capability-based.
- No provider-specific assumptions exist in the registry.

---

# 6. Phase 4 — Model and provider fabric

Chimera must support model mixing as a first-class feature.

## Provider adapter contract

Each adapter should expose:

- models
- streaming
- tool calls
- structured output
- context limits
- capabilities
- pricing metadata when available
- rate/usage metadata when available
- health
- cancellation
- retries

## Model catalog

Track:

- provider
- model ID
- context window
- modalities
- tool support
- reasoning support
- structured output support
- latency estimates
- cost estimates
- reliability history
- availability

## Model selection

Create a provider-neutral `ModelSelector` that can optimize for:

- capability fit
- quality
- cost
- latency
- availability
- context size
- tool support
- user preference
- task complexity
- role

DMR-X may implement a provider adapter, but Chimera must work without it.

### Acceptance criteria

A single session can use multiple providers/models in one run, including different models for planning, implementation, testing and review.

---

# 7. Phase 5 — Role-based model composition

Introduce model roles without forcing users to manually orchestrate them.

Built-in roles:

- planner
- explorer
- implementer
- debugger
- tester
- reviewer
- security-reviewer
- synthesizer

A role is a preference, not a hard dependency. The strategy engine can collapse roles onto one model for cheap/simple tasks.

Example:

```yaml
models:
  planner: anthropic/claude
  implementer: deepseek/coder
  reviewer: openai/gpt
  tester: google/gemini
```

Also support:

```yaml
strategy: auto
```

where Chimera chooses dynamically.

### Acceptance criteria

- One-model execution remains first-class.
- Multi-model execution is transparent to the coding-agent UX.
- Users can override any role.
- Per-task and per-session budget constraints are enforced.

---

# 8. Phase 6 — Execution Strategy Engine

Generalize the existing fusion/parallel concepts into reusable strategies.

Implement:

### Sequential
A -> B -> C

### Parallel race
A || B || C -> evaluator

### Map/reduce
Many workers -> reducer

### Pipeline
Planner -> coder -> tester -> reviewer

### Debate
Independent solutions/reviews -> adjudicator

### Supervisor
Supervisor dynamically delegates and monitors workers.

### Repair loop
Implementation -> test -> failure -> targeted repair -> retest.

### Adaptive
Strategy changes based on observed results, cost, context and failures.

The default should be `auto`.

### Important constraint
Do not parallelize blindly. Repository mutation must be isolated by worktree or another explicit conflict-safe mechanism.

---

# 9. Phase 7 — Context and repository intelligence

Make Chimera excellent at understanding real repositories.

## Repository intelligence

Build/strengthen:

- file tree discovery
- language detection
- package/build system detection
- git status/history
- symbol index
- LSP integration
- references/definitions
- dependency graph
- test discovery
- affected-file analysis
- semantic search
- change impact analysis

## Context pack

Every model call should receive a purpose-built context pack containing only relevant material:

- user request
- task state
- relevant files/symbols
- prior actions
- test failures
- constraints
- model-role instructions
- handoff state

Avoid dumping the repository into context.

## Context budget

Track context consumption and proactively compact/handoff before degradation.

---

# 10. Phase 8 — Relay, handoff and checkpointing

Turn the existing relay-racing idea into a robust subsystem.

A handoff must carry a structured checkpoint:

```text
objective
current_plan
completed_work
files_changed
commands_run
test_results
known_failures
open_questions
constraints
next_actions
relevant_context
```

Support:

- model-to-model handoff
- agent-to-agent handoff
- context compaction
- checkpoint persistence
- resume after crash
- graceful cancellation
- session recovery

The user must still experience one continuous coding agent.

---

# 11. Phase 9 — Coding loop and tool execution

Implement a robust coding loop:

```text
UNDERSTAND
  -> PLAN
  -> EXPLORE
  -> IMPLEMENT
  -> RUN
  -> OBSERVE
  -> DEBUG
  -> TEST
  -> REVIEW
  -> REPAIR
  -> VERIFY
  -> DELIVER
```

Tools should be typed and observable:

- read file
- write file
- patch file
- search
- shell
- git
- LSP
- test
- build
- MCP
- browser/external tools where configured

Tool calls require:

- permission decision
- timeout
- cancellation
- result capture
- structured errors
- audit event

---

# 12. Phase 10 — Security and capability permissions

Introduce a capability-based permission model.

Examples:

```text
filesystem.read
filesystem.write
shell.execute
git.read
git.write
network.http
repository.read
repository.write
mcp.invoke
```

Permissions should be evaluated per mission/session/agent/tool.

Add:

- safe defaults
- explicit escalation
- command allow/deny policies
- network restrictions
- secret isolation
- audit logging
- approval gates

Dangerous actions must be clearly surfaced to the user.

---

# 13. Phase 11 — Sandboxing and isolation

Keep worktree isolation for repository changes and add a general execution abstraction.

```text
ExecutionSandbox
  |- host-process
  |- container
  |- microvm (future)
  `- vm (future)
```

Capabilities:

- CPU limit
- memory limit
- disk limit
- network policy
- process limit
- timeout
- environment variables
- mounted paths
- snapshot/checkpoint hooks

Do not require containers for the initial local happy path; make the abstraction pluggable.

---

# 14. Phase 12 — Verification and evidence

Verification becomes part of the product, not an afterthought.

Build a verification pipeline:

```text
Patch
  -> typecheck
  -> lint
  -> unit tests
  -> integration tests
  -> build
  -> security checks
  -> independent model review
  -> final verification
```

Create an `EvidenceBundle` containing:

- commands
- exit codes
- test counts
- changed files
- review findings
- fixes performed
- final status
- timestamps
- model/provider provenance

Never claim a change works if required verification was not actually run.

---

# 15. Phase 13 — Durable execution and recovery

Sessions and long tasks must survive process failure.

Implement:

- append-only event log
- durable state snapshots
- checkpoints
- idempotent task execution
- leases/heartbeats
- retry policy
- exponential backoff
- cancellation
- recovery after restart
- stale-run detection

A crashed Chimera process should resume from the latest valid checkpoint rather than restart the entire task.

---

# 16. Phase 14 — Cost, latency and quality optimization

Create a unified execution scorecard.

Track:

- input/output tokens
- estimated/actual cost
- queue time
- model latency
- tool latency
- total wall time
- retries
- success rate
- verification success
- model contribution

The strategy engine should learn operationally from these measurements but must remain deterministic enough to explain routing decisions.

Example decision:

```text
Task: rename API fields
Complexity: low
Budget: $0.20
Strategy: single-agent
Model: cheap/capable
Reason: sufficient capability, lowest expected cost
```

For complex work:

```text
Task: refactor auth subsystem
Complexity: high
Strategy: plan -> parallel implementation -> independent review -> repair
Models: mixed
Reason: high impact + multiple independent verification signals
```

---

# 17. Phase 15 — UX overhaul

Chimera must feel as simple as Claude Code/Codex while exposing deeper controls to advanced users.

## CLI

Core:

```bash
chimera
chimera "implement OAuth"
chimera --resume <session>
chimera --model <model>
chimera --strategy auto
chimera --budget 2.00
chimera --review
chimera --headless
```

## TUI

Primary areas:

1. Chat
2. Agents
3. Runs
4. Workflow
5. Files/Git
6. Models
7. Costs
8. Verification
9. Permissions
10. Observatory

### Agents page

Show:

- name
- state
- current task
- model
- provider
- capabilities
- latency
- token/cost usage
- health

### Run view

Show one user-facing run with expandable internal execution:

```text
Chimera
  Plan       Claude        done
  Implement  DeepSeek      done
  Tests      Qwen          done
  Review     GPT           done
  Repair     DeepSeek      done
  Verify     Claude        done
```

Default view stays concise.

---

# 18. Phase 16 — MCP and A2A interoperability

Treat MCP and A2A as adapters around Chimera's internal capability model.

## MCP

Support configured MCP servers for tools/resources/prompts.

Map MCP tools into Chimera capabilities with:

- schema validation
- permissions
- timeout
- audit
- result normalization

## A2A

Allow external agents to participate as workers/reviewers when explicitly configured.

Map external agents into the same Agent interface and lifecycle where practical.

Chimera must not require either protocol to function.

---

# 19. Phase 17 — API, daemon and SDK

Make the coding agent consumable by external applications without coupling the core to them.

Expose stable APIs for:

- create/resume session
- submit task
- stream events
- inspect run
- list agents
- list models
- approve/deny action
- cancel run
- fetch artifacts
- fetch evidence
- configure execution

The daemon/JSON-RPC interface should use the same internal service contracts as the CLI rather than maintaining a second orchestration implementation.

Add a small TypeScript SDK after the API stabilizes.

---

# 20. Phase 18 — Evaluation and benchmark suite

Create repeatable coding-agent evaluations.

Categories:

- repository understanding
- bug fixing
- feature implementation
- refactoring
- test generation
- debugging
- dependency upgrades
- security fixes
- multi-file changes
- long-context tasks
- interrupted/resumed tasks
- multi-model strategy tasks

Metrics:

- task success
- tests passed
- regression rate
- cost
- latency
- number of tool calls
- number of retries
- review catch rate
- false-positive review rate
- recovery success

Compare:

- single strong model
- single cheap model
- fixed multi-model pipeline
- Chimera auto strategy

The point is to prove that model mixing improves quality/cost/latency rather than merely increasing complexity.

---

# 21. Phase 19 — Independence and integration contracts

Create explicit adapter packages/interfaces for external systems.

Possible adapters:

- DMR-X provider/router adapter
- ATHENA client
- Ghost Factory client
- external MCP
- external A2A
- OpenAI-compatible endpoints
- local model runners

The core dependency graph must remain one-way:

```text
Chimera Core
  -> interfaces
  -> adapters
```

Never:

```text
Chimera Core -> ATHENA/DMR-X/Ghost Factory/SMS
```

Integration tests should run against mocks and local fixtures by default.

---

# 22. Phase 20 — Documentation and product cleanup

Replace scattered/stale architecture docs with:

- README.md — product pitch, install, first run, core concepts
- ARCHITECTURE.md — authoritative architecture
- CONTRIBUTING.md — development workflow
- docs/model-routing.md
- docs/multi-agent.md
- docs/context.md
- docs/security.md
- docs/sandboxing.md
- docs/mcp.md
- docs/a2a.md
- docs/api.md
- docs/evaluation.md
- docs/configuration.md
- plans/CHIMERA_NEXT_GENERATION_CODING_AGENT.md — this implementation plan

Mark historical documents explicitly or remove them when their content has been absorbed.

The README should communicate the differentiator immediately:

> **Chimera is a coding agent that can use one model or many models behind one unified coding experience.**

---

# 23. Recommended package architecture

Evolve the current workspace toward:

```text
packages/
  chimera-cli
  chimera-tui
  chimera-agent
  chimera-core
  chimera-domain
  chimera-session
  chimera-orchestrator
  chimera-strategy
  chimera-context
  chimera-repository
  chimera-lsp
  chimera-tools
  chimera-security
  chimera-sandbox
  chimera-providers
  chimera-agents
  chimera-verification
  chimera-artifacts
  chimera-memory
  chimera-events
  chimera-eval
  chimera-daemon
  chimera-vscode
  chimera-mcp
  chimera-a2a
  chimera-sdk
```

Do not split packages merely for aesthetics. Extract only when a boundary improves testability, dependency direction, ownership or reuse.

---

# 24. Dependency rules

1. Domain packages contain no provider-specific code.
2. UI packages call application services, not provider implementations.
3. Provider adapters implement stable interfaces.
4. Strategy engine decides *how* to execute, not *which vendor* is mandatory.
5. Repository intelligence does not depend on a model vendor.
6. Verification consumes artifacts and produces evidence.
7. Security/policy can veto execution but cannot silently mutate requested actions.
8. External integrations are adapters.
9. No circular package dependencies.
10. No feature should require ATHENA, DMR-X, Ghost Factory or SMS.

---

# 25. Delivery order

Implement in vertical slices rather than creating dozens of empty packages.

### Slice A — Reliable single-agent coding
- stabilize current loop
- domain model
- provider abstraction
- repository intelligence
- permissions
- tests

### Slice B — Multi-model coding
- model catalog
- roles
- strategy engine
- parallel execution
- synthesis
- cost/latency controls

### Slice C — Reliable autonomous coding
- verification
- repair loops
- evidence
- checkpoints
- recovery
- context relay

### Slice D — Production-grade execution
- sandboxing
- capabilities
- durable event log
- observability
- API/SDK

### Slice E — Ecosystem interoperability
- MCP
- A2A
- DMR-X adapter
- external agent adapters
- IDE integrations

### Slice F — Product polish
- UX overhaul
- documentation consolidation
- benchmark suite
- performance tuning
- release packaging

---

# 26. Definition of done

Chimera is considered successfully transformed when all of the following are true:

### User experience
- A user can install Chimera independently and start coding without configuring the Danny-dis ecosystem.
- The default interaction feels like a modern terminal coding agent.
- The user sees one coherent agent even when multiple models are executing.

### Model mixing
- Multiple providers can participate in one task.
- Different roles can use different models.
- Chimera can dynamically choose one or multiple models.
- Users can override routing.
- Budget and latency constraints are enforced.

### Coding quality
- Repository understanding is symbol/context aware.
- Changes are isolated safely.
- Tests/build/lint/typecheck can be executed automatically.
- Failed verification triggers targeted repair where appropriate.
- Final responses report evidence rather than unsupported claims.

### Reliability
- Sessions persist.
- Runs can be cancelled and resumed.
- Context can be handed off between models.
- Process crashes do not destroy durable mission state.

### Security
- Tool capabilities are permissioned.
- Dangerous operations have explicit approval paths.
- Sandboxing is pluggable.
- Tool/model activity is auditable.

### Independence
- No dependency on ATHENA, DMR-X, Ghost Factory or SMS.
- All external integrations are optional adapters.
- Core tests run without external accounts.

### Engineering quality
- CI is green.
- No unresolved merge artifacts remain.
- Architecture has clear dependency direction.
- Evaluation suite demonstrates measurable benefits of model mixing.

---

# 27. Agent execution instructions

Coding agents implementing this plan MUST:

1. Inspect the current implementation before replacing anything.
2. Preserve working behavior with characterization tests.
3. Work in small, reviewable commits.
4. Keep each PR/commit focused on one architectural slice.
5. Add tests with every behavior change.
6. Avoid speculative abstractions without a concrete consumer.
7. Prefer interfaces and dependency injection over global state.
8. Never hard-code a dependency on one model provider.
9. Never make DMR-X/ATHENA/Ghost Factory/SMS a required import.
10. Keep the CLI happy path simple.
11. Make advanced multi-model behavior observable and explainable.
12. Run typecheck, lint, unit, integration and relevant smoke tests before marking a slice complete.
13. Update documentation when public behavior or architecture changes.
14. Delete stale/conflicting implementation artifacts once their functionality has been safely incorporated.
15. Do not merge a feature that is only partially wired or hidden behind dead configuration.

## Final product principle

**Chimera should feel like one exceptionally capable coding agent while behaving like a coordinated team of models and tools when that produces a better result.**

That is the product. Everything else is implementation detail.
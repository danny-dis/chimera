# Chimera Target Architecture

## System shape

```text
                 User / CLI / TUI / IDE / API
                              |
                              v
                       Chimera Coding Agent
                              |
                       Session / Run API
                              |
                     Execution Controller
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
        Repository        Context         Strategy
       Intelligence       Engine           Engine
              |               |               |
              +---------------+---------------+
                              |
                       Execution Graph
                              |
             +----------------+----------------+
             |                |                |
          Planner        Implementer      Verification
             |                |                |
          Model A          Model B       tests/reviewer
             |                |                |
             +----------------+----------------+
                              |
                         Repair / Retry
                              |
                    Evidence + Patch + Result
```

## Architectural rule

Chimera has an agent-centric architecture, not a provider-centric architecture. Models are interchangeable execution resources selected by policy.

## Layers

### Product
CLI, TUI, IDE integrations, headless API, session UX.

### Coding agent
Understand, explore, plan, implement, debug, test, review, repair, verify, deliver.

### Execution controller
Owns runs, task graph execution, cancellation, deadlines, retries, checkpoints and strategy transitions.

### Strategy engine
Chooses solo, pipeline, parallel, Duo, Trio, debate, supervisor, repair or escalation based on task characteristics and live evidence.

### Repository intelligence
File tree, languages, packages, build/test systems, Git state/history, symbols, LSP, references, dependencies, semantic search and change impact.

### Context engine
Produces purpose-built context packs, tracks context budgets, compacts state and creates structured handoffs.

### Model/provider fabric
Provider adapters expose a common contract. A model catalog records capability, context, tool support, latency, pricing, reliability and availability. The selector is provider-neutral.

### Agent registry
Agents are named capabilities/configurations with lifecycle and health. Built-in and future external agents use the same abstraction.

### Tools/security
Typed tools, capability permissions, command policy, secret isolation, sandboxing, worktrees and audit events.

### Verification
Deterministic evidence is preferred: compiler, lint, tests, builds, security checks and repository state. Model review supplements evidence; it does not replace it.

### Persistence
Sessions, runs, events, checkpoints, artifacts and evidence must be recoverable.

## Domain model

```text
Session
  -> Run
      -> Mission/Task graph
          -> Agent execution
              -> Model calls + Tool calls
                  -> Artifacts + Evidence
```

A **Session** is the user's continuous interaction. A **Run** is one execution attempt. A **Mission** is a durable objective. A **Task** is bounded work. An **Agent** is an execution role. A **Model** is an inference resource. An **Artifact** is produced state. **Evidence** proves what happened. A **Checkpoint** enables recovery or handoff.

## Agent lifecycle

```text
registered -> starting -> ready -> running -> paused
                         |          |
                         v          v
                       failed <- recovering
                         |
                       stopped
```

The user-facing Agents view should make this state visible without forcing users to manage agents manually.

## Model selection

Selection considers:

- capability fit;
- task complexity and risk;
- role;
- expected quality;
- price;
- latency;
- provider health and limits;
- context window;
- tool support;
- user constraints;
- historical success.

Optimize **cost per successful verified outcome**, not cost per request.

## Isolation

Repository mutation must be conflict-safe. Parallel workers use isolated worktrees or another equivalent mechanism. General execution uses a pluggable sandbox abstraction supporting host process first and container/microVM/VM backends where required.

## Interoperability

MCP is an adapter for tools/resources. A2A is an adapter for external agent interoperability. Neither defines Chimera's internal orchestration model.

## External integrations

ATHENA, Ghost Factory, DMR-X, Sovereign Mind/SMS and other systems may call Chimera. They must remain outside Chimera's core dependency graph.

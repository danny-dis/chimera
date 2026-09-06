# Chimera

> **One coding agent. Many brains.**

**Chimera is an independent, terminal-native coding agent that can dynamically combine models, providers, specialist workers, tools, and verification to get coding tasks done.**

You talk to one agent. Chimera decides when one model is enough and when multiple models working together will produce a better verified result.

## Why Chimera

Most coding agents make you choose a model and live with its strengths and weaknesses. Chimera treats models as a portfolio of capabilities.

A simple edit can stay on one inexpensive model. A difficult refactor can use a planner, independent implementer and reviewer. A high-risk task can escalate further. The goal is not to run more agents; it is to produce a **better verified result for the lowest sensible cost and latency**.

## What it does

- **Single-agent UX** — one conversation, one coherent result.
- **Dynamic model mixing** — different models/providers can handle different roles in one run.
- **Adaptive execution** — solo, sequential, parallel, Duo, Trio, debate and repair strategies.
- **Trio Mode** — complementary planner/worker/reviewer execution with cheap, balanced and pro profiles.
- **Cost-per-success optimization** — choose the smallest strategy likely to succeed, then escalate only when evidence requires it.
- **Repository intelligence** — Git, symbols, dependencies, LSP, tests, semantic search and impact analysis.
- **Context engineering** — focused context packs, compaction and structured handoffs instead of repository dumps.
- **Verification** — tests, lint, typecheck, builds, security checks and independent review with evidence.
- **Safe execution** — capability permissions, command policy, worktree isolation, sandboxing and audit events.
- **Durable sessions** — checkpoints, recovery, cancellation and resumable long runs.
- **Terminal first** — CLI/TUI first, with IDE and API integrations available around the same core.

## Independence

Chimera is standalone. It does **not** require ATHENA, DMR-X, Ghost Factory, Sovereign Mind/SMS, or another external system.

Those systems may integrate with Chimera through documented APIs, SDKs, CLI usage, MCP, A2A or provider adapters. The dependency direction is always outward from the integration into Chimera, never the reverse.

## Quick start

```bash
# Install
git clone https://github.com/danny-dis/chimera.git
cd chimera
pnpm install
pnpm build

# Run
pnpm chimera "fix the failing tests"
```

If the published package is available in your environment, the package-manager entry point can also be used.

## How Chimera works

```text
User request
     |
     v
Chimera Coding Agent
     |
     +--> understand repository/context
     |
     +--> choose strategy + model portfolio
     |
     +--> implement with tools
     |
     +--> test / review / verify
     |
     +--> repair or escalate if evidence requires it
     |
     v
Patch + evidence + concise result
```

The normal user does not need to know which internal workers ran. Advanced users can inspect strategy, agents, models, cost, latency and evidence.

## Adaptive strategies

`auto` is the default. Chimera chooses execution depth from task complexity, risk, budget, provider health, model capability and observed evidence.

| Task shape | Typical strategy |
|---|---|
| Tiny edit | Solo |
| Normal feature | Solo or pipeline |
| Medium/high complexity | Duo or Trio |
| High-risk refactor | Trio + stronger verification |
| Unresolved failure | Repair loop / escalation |
| Critical work | Larger coordinated run + explicit approval where configured |

### Trio

Trio is a first-class strategy, not three identical prompts:

```text
Planner
   |
   +---- Worker A
   |
   +---- Worker B (independent)
             |
          Reviewer
             |
       tests + evidence
             |
        repair/verify
```

See `DOCS/TRIO_AND_COST.md` for the cost, diversity, early-stopping and escalation model.

## Configuration

Provider and role configuration is provider-neutral. A conceptual setup looks like:

```yaml
strategy: auto

models:
  planner: provider/strong-reasoning
  implementer: provider/cost-efficient-code
  reviewer: provider/strong-review

budgets:
  per_task: 0.50
  per_session: 5.00
```

The implementation should treat these as preferences and constraints, not hard-coded vendor dependencies.

## Architecture

The repository is organized around these responsibilities:

```text
Product: CLI / TUI / IDE / API
        |
Coding agent: understand -> plan -> implement -> verify
        |
Execution controller + adaptive strategy engine
        |
Repository intelligence + context engine
        |
Agent registry + model/provider fabric
        |
Tools + permissions + isolation
        |
Evidence + persistence + recovery
```

See `DOCS/ARCHITECTURE.md` for subsystem boundaries and `DOCS/ROADMAP.md` for the implementation sequence.

## Repository structure

The main packages include:

- `chimera-cli` — terminal entry points and commands
- `chimera-core` — coding-agent domain and orchestration
- `chimera-context` — context, compaction and handoff
- `chimera-providers` — provider/model adapters and routing metadata
- `chimera-tools` — coding tools, permissions and sandbox interfaces
- `chimera-isolation` — worktree and execution isolation
- `chimera-session` — persistence and checkpoints
- `chimera-eval` — evaluation and benchmarking
- `chimera-lsp` — language-server integration
- `chimera-tui` — terminal UI
- `chimera-vscode` — VS Code integration
- `chimera-workflows` — declarative workflows
- `chimera-learning` — measured adaptation and skill learning

## Development

```bash
pnpm install
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm dev
```

Do not claim a change is complete without running the relevant verification.

## Documentation

Start at [`DOCS/README.md`](DOCS/README.md). The implementation blueprint is [`plans/CHIMERA_NEXT_GENERATION_CODING_AGENT.md`](plans/CHIMERA_NEXT_GENERATION_CODING_AGENT.md).

## License

MIT

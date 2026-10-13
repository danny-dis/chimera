# Chimera Deliberation Modes

Chimera presents one coding-agent experience while dynamically choosing how much internal deliberation is useful for the task. Deliberation modes are execution strategies, not separate products or user-facing agents.

## Design goals

- Use the smallest strategy that can reliably produce a verified result.
- Increase independent reasoning when uncertainty, complexity, risk, or failure evidence warrants it.
- Keep mutations isolated until a strategy has enough evidence to integrate them.
- Prefer deterministic evidence—tests, builds, type checks, lint, static analysis, repository constraints, and observed tool results—over model voting alone.
- Optimize **cost per successful verified outcome**, not raw token or inference cost.
- Make every mode observable, resumable, budget-aware, and composable.

## Mode catalogue

### 1. Solo

One agent owns the task from understanding through verification.

**Best for:** straightforward edits, small bugs, documentation, routine refactors.

**Flow:** understand → plan → implement → verify → deliver.

**Escalate when:** the agent encounters uncertainty, repeated failures, conflicting repository evidence, or a risk policy threshold.

### 2. Duo

Two complementary roles cooperate, commonly implementer + reviewer or planner + implementer.

**Best for:** moderate changes where a second perspective materially reduces risk.

The reviewer should inspect the actual diff and evidence rather than merely produce another opinion.

### 3. Trio

Three complementary roles deliberate around a shared task while keeping mutation responsibility controlled.

Common configurations:

- planner + implementer + reviewer
- independent worker A + independent worker B + judge/synthesizer
- implementer + test specialist + reviewer

**Best for:** complex implementation, ambiguous approaches, substantial refactors, or tasks where a second implementation is worth comparing.

Trio is not three identical prompts. Role diversity, isolated workspaces, deterministic verification, early stopping, and evidence-driven escalation are required design principles.

### 4. Fusion

Fusion synthesizes multiple candidate solutions, patches, analyses, or critiques into one implementation instead of simply selecting a winner.

**Best for:** conflicting implementations, large architectural changes, difficult debugging, or situations where useful ideas are distributed across candidates.

Fusion should reason over:

- semantic and textual patch conflicts
- repository conventions and dependency constraints
- test/build/type-check evidence
- security and performance implications
- worker confidence and historical evaluation signals
- implementation complexity and maintainability
- cost already spent and remaining budget

Fusion produces a candidate result that must pass the normal verification gates.

**Important distinction:** Trio is a deliberation topology; Fusion is a synthesis operation. Trio can feed Fusion, and Fusion can appear after Solo/Duo/Trio/parallel execution when their outputs conflict or contain complementary value.

### 5. Pipeline

Specialists execute sequential stages with explicit handoffs.

Example: scout → planner → implementer → tester → reviewer → fixer → verifier.

**Best for:** predictable multi-stage engineering workflows and tasks requiring strict gates.

### 6. Parallel / Race

Independent agents work concurrently. Results are compared using evidence and task-specific quality gates.

**Best for:** independent solution exploration, expensive-to-fail tasks, or latency-sensitive work where parallelism is worth the extra compute.

The first result is not automatically the winner; verification and quality gates decide whether a candidate is acceptable.

### 7. Debate

Agents explicitly challenge competing approaches before implementation or integration.

**Best for:** architectural choices, ambiguous designs, trade-off-heavy changes, and high-uncertainty decisions.

Debate should terminate in an actionable decision, not an endless conversation.

### 8. Supervisor / Hierarchical

A coordinator decomposes work, assigns specialists, monitors progress, resolves dependencies, and performs final synthesis/verification.

**Best for:** large tasks with multiple domains, repositories, or independently verifiable work units.

The supervisor coordinates; it should not become an unnecessary LLM bottleneck when deterministic scheduling and dependency logic can resolve the problem.

### 9. Map / Reduce

A task is divided into independently executable units (map), then results are synthesized and verified (reduce).

**Best for:** repetitive repository-wide changes, migrations, test generation, file/package-level transformations, and other decomposable work.

### 10. Repair

The system enters a focused diagnosis → patch → test → observe loop after an implementation or verification failure.

**Best for:** failing tests, compiler/type errors, lint failures, integration failures, regressions, and runtime/tool errors.

Repair should preserve useful context and evidence rather than restarting from scratch.

### 11. Escalation

Escalation is a policy that increases reasoning strength only when evidence demands it.

A typical progression is:

`Solo cheap → Duo/Trio → Fusion → stronger model/specialist → human approval`

Escalation can change model quality, deliberation cardinality, specialist coverage, sandbox resources, or verification strictness.

## Modes are composable

Modes are not mutually exclusive. Chimera should compose them through a common strategy graph.

Examples:

- `Solo → Repair`
- `Duo → Repair`
- `Trio → Fusion → Verify`
- `Parallel → Fusion → Repair`
- `Map → Reduce → Verify`
- `Debate → Trio → Fusion`
- `Pipeline → Repair → Escalation`
- `Supervisor → Map/Reduce → Fusion`

The adaptive strategy engine decides when composition is justified.

## Adaptive selection

`strategy: auto` should consider at least:

- task complexity and decomposition
- repository size and affected surface area
- ambiguity and uncertainty
- change risk and security sensitivity
- available model/provider capabilities
- latency requirements
- provider health and rate limits
- budget and remaining budget
- historical success by task class
- current evidence from tools and tests
- prior failures and retry count

A useful default policy is:

| Task condition | Preferred starting mode |
|---|---|
| Simple / low risk | Solo |
| Moderate / review-worthy | Duo |
| Complex / uncertain | Trio |
| Independent alternatives useful | Parallel / Race |
| Conflicting or complementary candidates | Fusion |
| Many predictable stages | Pipeline |
| Architecture / high ambiguity | Debate |
| Large decomposable surface | Map / Reduce |
| Multi-domain orchestration | Supervisor |
| Failed verification | Repair |
| Persistent uncertainty / high risk | Escalation |

These are starting policies, not hard-coded permanent rules. Evaluation data should continuously tune the decision policy.

## Common strategy contract

Every deliberation mode should conform to a common execution contract conceptually equivalent to:

```text
Strategy
├── can_handle(context) -> decision
├── plan(context) -> execution_graph
├── execute(graph, runtime) -> result
├── verify(result, evidence) -> verification
└── summarize(result) -> deliverable
```

The implementation should expose structured strategy decisions, execution events, evidence, costs, latency, failures, and final verification state.

## Verification is mode-independent

No deliberation mode is successful merely because models agree.

The final result should carry:

- changed artifacts
- tests/build/type-check/lint results
- tool observations
- review findings
- unresolved conflicts
- provenance of generated changes
- confidence
- verification status
- cost and latency

The same verification gates should apply regardless of whether the result came from Solo, Trio, Fusion, or a larger strategy.

## User experience

The default interface remains one coding agent. Users should not need to understand the internal topology to get good results.

Advanced users may select or constrain a mode, for example:

```text
chimera --strategy auto
chimera --strategy solo
chimera --strategy trio
chimera --strategy fusion
chimera --strategy parallel
```

Configuration should also allow constraints such as maximum agents, maximum budget, preferred models, approval requirements, and verification level.

The CLI/TUI should show concise progress such as:

`Trio → candidate review → Fusion → tests → verified`

rather than exposing an unnecessarily noisy multi-agent transcript.

## Non-goals

- Turning Chimera into a generic agent runtime.
- Making every task multi-agent.
- Treating majority vote as correctness.
- Making Fusion a generic "combine these answers" prompt.
- Coupling the strategy engine to ATHENA, DMR-X, Ghost Factory, or SMS.
- Requiring MCP or A2A for internal deliberation.

Chimera remains an independent coding agent. These modes are internal execution strategies that make that one agent more capable, reliable, and cost-efficient.

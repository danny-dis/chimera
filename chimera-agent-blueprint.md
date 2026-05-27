# Chimera Terminal Coding Agent Blueprint

Status: rewritten — parallel multi-agent architecture from day one
Last reviewed: 2026-05-18
Audience: contributors building a production-grade terminal-native AI coding agent

Chimera is a terminal-native, provider-neutral **parallel multi-agent** coding platform. It presents as a single unified agent to the user, but behind the scenes deploys 2–3 agents on different providers working in parallel and in series — a cheap model for bulk work, a frontier model for verification and productionization, and an optional challenger for complex tasks. The orchestrator decomposes tasks, spawns parallel subagents, collects results, runs them through a serial quality gate, and synthesizes a single response. All of this is invisible to the user.

This document is intentionally implementation-oriented. It defines what to build, what to cut from the MVP, how the pieces fit, which OSS patterns Chimera should adopt or avoid, and the research backing every architectural decision.

---

## 1. Product Vision

### Problem

Developers increasingly expect agents to read a repository, plan work, edit multiple files, run commands, test changes, and recover from failures. Existing tools force a false choice: use a cheap model and get unreliable output, or use a frontier model and pay premium prices. Multi-agent tools that exist expose fleet-management complexity to the user. Single-agent tools suffer from context degradation on long tasks.

Chimera solves this by providing a local-first terminal agent that:

- presents as **one agent** to the user but runs **2–3 agents behind the scenes** on different providers;
- decomposes tasks and **spawns parallel subagents** for both planning and execution;
- pairs a **cheap model** (DeepSeek, Qwen, Kimi, Gemini Flash) for bulk work with a **frontier model** (Claude, GPT-4o, Opus) for verification and productionization;
- runs a **serial quality gate** (draft → verify → challenge → synthesize) before presenting any output;
- **monitors context fill** and performs **agent relay racing** — swapping agents before context degradation hits, with structured handover documents;
- enforces **configurable cost constraints** (per-task, per-session, per-day caps) with hard stops;
- executes shell commands with explicit safety policies;
- resumes long-running sessions;
- supports autonomous loops with human approval checkpoints.

### Target users

| User | Needs | Chimera value |
| --- | --- | --- |
| Solo developer | Fast terminal-native coding help at lower cost | Frontier quality at cheap-model pricing, one CLI for everything |
| Senior engineer | Safer large refactors with verification | Parallel subagents + serial quality gate + rollback |
| Cost-conscious teams | Predictable spend without sacrificing quality | Configurable cost caps, per-provider budget tracking, automatic routing |
| OSS maintainer | Contributor-like agent workflow | AGENTS.md-aware sessions, PR summaries, benchmark traces |
| Platform team | Governed automation with audit trails | Permission profiles, sandboxing, per-agent isolation, telemetry controls |
| AI engineer | Extensible multi-agent runtime | Model registry, tool registry, evaluation harness, MCP support, hook system |

### Competitive landscape

- **Claude Code**: strong terminal-agent UX, plan mode, subagents, 25-event hooks, MCP, permission modes, compaction. Agent Teams (experimental) enables multi-agent but Anthropic-only.
- **OpenAI Codex CLI**: terminal and cloud workflows, OS-level sandboxing (Seatbelt/Landlock), AGENTS.md conventions, PR-oriented flow, SQLite-backed persistent threads. No subagents.
- **Cursor Agent**: IDE-native agent with Merkle tree sync, AST chunking, parallel agents via git worktrees (up to 8), `/multitask` for automatic task decomposition, `/best-of-n` for parallel model comparison. No cost-aware routing.
- **Aider**: Git-first terminal pair programmer, repo map with PageRank, three-tier model system (main/weak/editor), Architect/Editor split proven SOTA. Single process, no parallel execution.
- **OpenHands**: event-driven architecture, runtime isolation, parallel agents for massive refactors, LiteLLM integration (75+ providers), sandboxed Docker execution. Human-reviewed merges, no cost routing.
- **SWE-agent**: benchmark-driven agent-computer interface, constrained tools, linter-gate on every edit, reproducible trajectories. Single-agent, Python-only.
- **Continue**: shared config across IDE/CLI, TUI + headless modes, CI checks, ClawRouter integration for cost optimization, background agents. No autonomous local tool execution.
- **Cline / Roo Code**: Plan/Act workflows, modes, MCP, browser use, shell execution, checkpoints. Roo Code shut down May 2026. Both single-agent, IDE-only.
- **OpenCode**: terminal-native OSS agent, LSP integration (25+ servers), provider flexibility (75+ via models.dev), auto-compaction, scriptable workflows, polished TUI. No parallel orchestration or cost routing.
- **Goose**: autonomous execution, MCP extension ecosystem (41+), provider flexibility, production-proven at Block. Single-agent, no cost routing.
- **Pi**: primitives-first philosophy, provider neutrality (15+), tree-structured sessions, four integration modes, skills system. Explicitly skips subagents and plan mode.
- **Emerging**: Emdash (parallel multi-provider UI manager), Superset (100s of parallel agents), Composio AO (agent-agnostic orchestrator), orc (terminal orchestrator WIP). All expose dashboards, no single-agent UX, no quality gates.

### Key differentiators

1. **Parallel multi-agent execution with single-agent UX**: user sees one agent, one response. Behind the scenes, 2–3 agents on different providers work in parallel and in series. The complexity is hidden.
2. **Provider pairing by design**: cheap model + frontier model on different providers, configurable by the user. Task-based role assignment — the router picks which model handles which subtask.
3. **Cost-aware routing with hard constraints**: configurable cost caps (per-task, per-session, per-day), automatic model selection based on task complexity + remaining budget, real-time cost dashboards.
4. **Serial quality gate**: draft → verify → challenge → synthesize. Each stage uses a different model/provider. Parallel independent generation + voting (not multi-round debate). Debate only for tie-breaking.
5. **Agent relay racing**: monitors context fill, triggers graceful handoff before degradation hits, generates structured handover document, spawns fresh agent with clean context. No competitor does this as a first-class feature.
6. **Config TUI**: interactive setup for provider pairing, cost caps, role assignment, constraint configuration. No competitor has a terminal-native configuration wizard.

### Why terminal-native agents matter

The terminal is where real build, test, lint, git, package-manager, container, and deployment workflows already exist. A terminal agent can operate in any editor, inside SSH, on remote machines, in CI, and in containers. The CLI also provides a stable automation surface for headless workflows, GitHub Actions, cron jobs, and future cloud runners.

### Why multi-agent from day one

Research validates that diverse model teams outperform homogeneous ones by 9–11 percentage points (RECONCILE, ACL 2024). Parallel independent generation + voting is more cost-effective than multi-round debate (Debate-or-Vote, 2025). Execution-grounded verification is the single biggest performance driver (AgentForge, +28 pts on SWE-bench Lite). Role-specific model allocation works (Agyn, 72.4% on SWE-bench 500). The moat is orchestration methodology, not model capability — as models commoditize, the winner orchestrates them best.

---

## 2. Competitive Research

Research date: 2026-05-18. Prefer official documentation and repositories when making implementation decisions. Third-party articles can inspire hypotheses, but they should not be treated as authoritative implementation references.

### Decision matrix

| Tool | Architecture | Strengths to adopt | Weaknesses to avoid | Official references |
| --- | --- | --- | --- | --- |
| Claude Code | Local terminal agent, hooks, subagents, MCP, compaction | 25-event hook system, `opusplan` pattern, subagent isolation, deferred tool loading, Agent Teams with worktrees | single-provider lock-in, no cost tracking, context degradation at 147K, approval fatigue (93% blind approved) | https://docs.claude.com/en/docs/claude-code/overview, https://code.claude.com/docs/en/hooks |
| OpenAI Codex CLI | Rust workspace, TUI, OS sandbox, persistent threads | OS-level sandboxing (Seatbelt/Landlock), SQLite-backed threads, V4A diff format, dual MCP role, config profiles | no subagent system, single-model per session, weaker hooks, AGENTS.md token overhead (+20% cost) | https://github.com/openai/codex |
| Cursor Agent | IDE-native, Merkle tree sync, parallel worktrees | Merkle tree sync, AST chunking, `/multitask` decomposition, `/best-of-n`, per-agent model selection, cloud agents | no cost-aware routing ($2,000 surprise bills), IDE lock-in, disk space explosion with worktrees, exposes complexity | https://cursor.com/blog/cursor-3 |
| Aider | Python terminal, repo map, 3-tier models, architect/editor | PageRank repo map, three-tier model system, Architect/Editor split (SOTA results), Git-native audit trail, LiteLLM (200+ models) | no parallel execution, no cross-model verification, no CI/CD integration, no cost caps | https://aider.chat/ |
| OpenHands | Event-stream, Docker sandbox, LiteLLM, parallel agents | Event-stream architecture, sandboxed execution, parallel agents for refactors, Refactor SDK dependency analysis, SOTA on SWE-bench | human-reviewed merges, no cost routing, no cross-model verification, heavy setup | https://github.com/All-Hands-AI/OpenHands |
| SWE-agent | ACI, constrained tools, benchmark harness | ACI design philosophy, linter-gate on every edit, context curation, reproducible trajectories | single-agent, Python-only, no provider flexibility, no cost optimization | https://github.com/SWE-agent/SWE-agent |
| Continue | Shared config, TUI + headless, CI checks, ClawRouter | Shared config across surfaces, headless mode for CI/CD, source-controlled checks, ClawRouter (78–96% cost savings), event-triggered agents | no autonomous local tool execution, weak multi-file editing, steeper learning curve | https://github.com/continuedev/continue |
| OpenCode | Terminal-native, LSP, 75+ providers, auto-compaction, TUI | Provider agnosticism at scale, LSP integration (25+ servers), multi-agent configuration, auto-compaction, scriptable workflows, polished TUI | no parallel orchestration, no cost-aware routing, no cross-model verification, no sandbox | https://github.com/anomalyco/opencode |
| Goose | Autonomous execution, MCP ecosystem, provider flexibility | True autonomous execution, MCP extension ecosystem (41+), recipes system, production-proven at Block | quality depends on model choice, no multi-agent, no cost routing, learning curve for recipes | https://github.com/block/goose |
| Pi | Primitives-first, 15+ providers, tree sessions, skills | Provider neutrality, tree-structured sessions, four integration modes, skills system, message queuing, auto-compaction | explicitly skips subagents, no cost management, steeper learning curve | https://github.com/earendil-works/pi |
| Emdash | Electron app, parallel multi-provider, git worktrees | 24 providers, git worktree isolation, pre-created reserve pool | UI manager only, no quality gates, no cost routing, exposes complexity | https://github.com/generalaction/emdash |
| Composio AO | Agent-agnostic orchestrator, runtime-agnostic | Parallel coding agents, CI fixes, merge conflicts, code reviews | dashboard UX (not single-agent), no quality gates, no cost routing | https://github.com/ComposioHQ/agent-orchestrator |
| orc (WIP) | Terminal orchestrator, multi-provider, parallel | Multi-provider routing, parallel execution, cost-aware, REPL | very early (7 stars), WIP | https://github.com/safethecode/orc |

### Research validation

| Finding | Source | Implication for Chimera |
| --- | --- | --- |
| Diverse model teams outperform homogeneous by 9–11% | RECONCILE (ACL 2024) | Different-provider design is validated for quality, not just cost |
| Voting > debate for reasoning tasks | Debate-or-Vote (2025) | Parallel independent generation + voting is more cost-effective; debate only for ties |
| Handoff errors: 36.8% Signal Corruption, 29.1% Data Gap | AgentAsk (2025) | Handoff validation at every stage prevents 75% of cascading errors |
| Execution-grounded verification = +28 pts on SWE-bench Lite | AgentForge (2026) | Every code change must be tested before acceptance |
| Role-specific model allocation = 72.4% on SWE-bench 500 | Agyn (2026) | Task-based role assignment is the right approach |
| Cost-effective routing using code health metrics | Triage paper (arXiv:2604.07494) | Mathematical framework for routing exists — implement it |
| Context degradation starts at 40–60% of advertised window | Chroma Context Rot, Qwen2.5 study | Agent relay racing must trigger at 60–70% fill |
| Summarization loses 63% of information across sessions | Factory.ai benchmark | Verbatim compaction + handover documents > summarization |
| Error cascades amplify through hub nodes (10.3x) | From Spark to Fire (2026) | Genealogy-graph provenance tracking required |
| Multi-agent systems use ~4x tokens vs chat | Anthropic production data | Cost-aware routing is mandatory, not optional |

### Foundation recommendation

For the first production-grade Chimera release, build a **new TypeScript core** instead of hard-forking a full existing agent product. Reuse ideas, protocols, and selected libraries from the ecosystem, but keep Chimera's orchestration, policy engine, context engine, and event schema under our control.

Decision:

- **Primary implementation**: TypeScript monorepo for CLI, runtime, provider adapters, context, tools, TUI, and eval harness.
- **Reuse by reference**: adopt Aider's repo-map/Git ergonomics, OpenCode's LSP/terminal patterns, Continue's TUI/headless split, OpenHands' event-stream/runtime separation, SWE-agent's constrained agent-computer interface, Claude Code's 25-event hooks, Codex CLI's OS-level sandboxing, Pi's tree sessions, Sourcegraph Amp's handoff-over-compaction pattern.
- **Potential code-level starting points**: evaluate Pi and OpenCode if their licenses, module boundaries, and governance match the desired contributor model; otherwise use them as architecture references.
- **Avoid**: starting from an IDE-only extension, a benchmark-first research harness, or a dashboard UX. Chimera's core must remain terminal-native, provider-neutral, and single-agent-presenting.

Why this wins: it minimizes inherited product constraints while preserving the best proven patterns from existing OSS agents. It also prevents early architectural lock-in before Chimera's multi-agent protocol, permission engine, context pipeline, and relay racing system are stable.

### Lessons to adopt

- **From Claude Code**: 25-event hook system (blocking/modifying/injecting), `opusplan` cost-optimization pattern, subagent depth=1 constraint, deferred tool loading, Agent Teams with worktree isolation.
- **From Codex CLI**: OS-level sandboxing (Seatbelt/Landlock), SQLite-backed persistent threads, V4A diff format, dual MCP role (client + server), config profiles.
- **From Cursor**: Merkle tree sync, AST-based context chunking, `/multitask` task decomposition, per-agent model selection, subagent context isolation.
- **From Aider**: PageRank-based repo map, three-tier model system, Architect/Editor split, Git-native audit trail, LiteLLM abstraction (200+ models).
- **From OpenHands**: event-stream architecture, sandboxed execution per agent, git branch-per-agent workflow, Refactor SDK dependency analysis.
- **From SWE-agent**: ACI design philosophy, linter-gate on every edit, context curation, reproducible trajectories.
- **From Continue**: shared config across surfaces, headless mode for CI/CD, source-controlled checks, ClawRouter cost optimization, event-triggered agents.
- **From OpenCode**: LSP integration (25+ servers), provider agnosticism at scale, auto-compaction, scriptable workflows, polished TUI.
- **From Pi**: tree-structured sessions, primitives-first philosophy, four integration modes, skills system.
- **From Sourcegraph Amp**: handoff-over-compaction — spawn fresh agent with structured task summary instead of lossy compression.

### Lessons to avoid

- Do not expose agent management complexity to the user by default.
- Do not let the model decide its own security boundary.
- Do not rely only on vector search; combine lexical, structural, LSP, git, and model summaries.
- Do not hide patches from users.
- Do not store secrets, prompts, or telemetry without clear local policy.
- Do not bind the runtime to one UI surface.
- Do not ship autonomy before deterministic rollback and budget controls exist.
- Do not create a three-agent committee for trivial tasks — scale agents, not rounds.
- Do not use naive text-based context — AST-aware extraction and sharing is mandatory.
- Do not copy Cursor's worktree disk overhead — use efficient isolation mechanisms.
- Do not allow unlimited spending — cost caps are mandatory, not optional.

---

## 3. Technical Architecture

### High-level architecture

```text
+----------------------------------------------------------+
|                    Chimera CLI / TUI                      |
|  prompt, mode, diff, logs, cost display, agent status     |
+--------------------------+-------------------------------+
                           |
                           v
+--------------------------+-------------------------------+
|                  Session Orchestrator                     |
|  state machine, event log, mode policy, budget, lifecycle |
+--+-----------+-----------+-----------+-----------+-------+
   |           |           |           |           |
   v           v           v           v           v
+------+  +----+-----+ +---+------+ +---+------+ +--------+
| Task |  |  Agent   | | Response | |  Cost    | | Event  |
|Router|  |  Mesh    | |Synthesizer| | Tracker  | | Stream |
|      |  |Coordina- | |           | |          | |        |
|      |  |   tor    | |           | |          | |        |
+--+---+  +----+-----+ +-----+----+ +----+-----+ +---+----+
   |           |             |          |           |
   v           v             v          v           v
+--+-----------+-------------+----------+-----------+------+
|                    Provider Pool                          |
|  LiteLLM abstraction, fallback chains, rate limit aware   |
|  [Cheap Tier]  [Mid Tier]  [Frontier Tier]  [Reasoning]   |
+--------------------------+-------------------------------+
                           |
                           v
+--------------------------+-------------------------------+
|                    Tool Registry                          |
|  fs, shell, git, edit, tests, search, LSP, MCP, browser   |
+--------------------------+-------------------------------+
                           |
                           v
+--------------------------+-------------------------------+
|              Sandbox / Persistence                        |
|  PTY, Docker, worktrees, event log, patches, metrics      |
+-----------------------------------------------------------+
```

### Component boundaries

| Component | Responsibility | Must not do |
| --- | --- | --- |
| CLI/TUI | render user interaction, collect approvals, stream events, display cost/agent status | own agent state or provider-specific logic |
| Session Orchestrator | state machine, event log, mode policy, retries, budget, agent lifecycle | call tools without policy checks |
| Task Router | complexity analysis, cost-aware routing, provider selection, dependency-graph scheduling, task decomposition | execute tools or call models directly |
| Agent Mesh Coordinator | parallel subagent lifecycle, serial quality gate, handoff validation, inter-agent message routing | mutate files outside tool layer |
| Response Synthesizer | merge all agent outputs into unified user-facing response, resolve conflicts, produce final output | call tools or make independent decisions |
| Cost Tracker | real-time per-provider spend, budget enforcement, cost projection, warning alerts | modify agent behavior directly (signals only) |
| Event Stream | immutable, replayable action log, provenance tracking, session persistence | store unredacted secrets or prompts |
| Provider Pool | LiteLLM abstraction, fallback chains, rate limit awareness, model registry | bypass cost tracker or policy engine |
| Context Engine | repo index, retrieval, instruction hierarchy, relay racing, handover documents | trust unverified generated summaries as facts |
| Tool Registry | typed tool schemas, permission metadata, execution adapters, MCP client/server | bypass sandbox or policy engine |
| Patch Engine | apply diffs, validate hunks, rollback, stage commits | let models write arbitrary files without validation |
| Sandbox/Exec | PTY, command limits, env filtering, Docker/worktree isolation, OS-level sandboxing | expose secrets by default |
| Persistence | sessions, event stream, artifacts, metrics, replay, trajectory storage | store sensitive data without redaction |

### Event-driven data flow

```text
User request
  -> classify_task (Task Router)
  -> load_project_instructions
  -> index_repo / refresh_repo_map
  -> build_context_pack
  -> decompose_task (if parallelizable)
  -> spawn_parallel_subagents (Writer agents on cheap/mid tier)
  -> collect_subagent_results
  -> merge_results (Response Synthesizer)
  -> verify_merged (Reviewer agent on frontier tier)
  -> challenge_if_complex (Challenger agent on third provider)
  -> resolve_disagreements (voting → challenger → user if deadlock)
  -> synthesize_final_response
  -> request_user_approval_if_required
  -> execute_tools / edit_patch
  -> run_checks (execution-grounded verification)
  -> review_diff
  -> repair_if_needed
  -> final_response + optional commit/PR
```

Core event types:

```ts
type ChimeraEvent =
  | { type: "user_request"; text: string; mode: Mode }
  | { type: "task_classified"; complexity: ComplexityScore; estimatedCost: number }
  | { type: "task_decomposed"; subtasks: Subtask[]; dependencyGraph: DAG }
  | { type: "agent_spawned"; agentId: string; role: AgentRole; provider: string; model: string }
  | { type: "context_pack_created"; files: string[]; tokenEstimate: number }
  | { type: "draft_proposed"; agentId: string; patchId: string; confidence: number }
  | { type: "verified"; agentId: string; verdict: "pass" | "fail" | "needs_revision"; findings: Finding[] }
  | { type: "challenged"; agentId: string; challenges: Challenge[]; alternatives: Alternative[] }
  | { type: "disagreement_detected"; agents: string[]; issue: string; resolution: "voting" | "challenger" | "user" }
  | { type: "handoff_triggered"; fromAgent: string; toAgent: string; reason: "context_threshold" | "task_boundary"; format: "compact" | "delta"; tokenCount: number; claimIds: string[] }
  | { type: "handoff_validated"; accepted: boolean; checklist: { dataComplete: boolean; referencesGrounded: boolean; claimsVerified: boolean; capabilityMatch: boolean }; clarifications: string[] }
  | { type: "tool_call_requested"; call: ToolCall; policy: PermissionDecision }
  | { type: "tool_call_result"; result: ToolResult }
  | { type: "patch_proposed"; patchId: string; files: string[] }
  | { type: "check_result"; command: string; exitCode: number; outputRef: string }
  | { type: "review_finding"; severity: "blocker" | "warning" | "note"; evidence: Evidence[] }
  | { type: "cost_alert"; currentCost: number; budget: number; percentage: number; action: "warn" | "throttle" | "stop" }
  | { type: "context_threshold_reached"; agentId: string; fillPercent: number; tier: ContextTier }
  | { type: "session_compacted"; summaryRef: string }
  | { type: "final_response"; status: "done" | "blocked" | "needs_user"; cost: number; agentCount: number }
  | { type: "provenance_claim"; claimId: string; source: string; agentId: string; confidence: number };
```

### Agent runtime

The runtime is a deterministic state machine around probabilistic model calls.

```text
Observe -> Orient -> Plan -> Act -> Verify -> Reflect -> Report
          ^                         |
          +-------- repair ---------+
```

Runtime responsibilities:

- normalize model/provider APIs via LiteLLM abstraction;
- build layered prompts with role-specific system prompts;
- enforce structured output schemas for inter-agent communication;
- parse tool calls and route through policy engine;
- maintain working memory with tiered context management;
- decide whether to continue, ask, or stop;
- emit events for every decision with provenance metadata;
- support roles: writer, reviewer, challenger, planner, summarizer, synthesizer.

### Orchestration engine

Chimera's default is **2-agent mode** (Writer + Reviewer on different providers). Complex tasks activate **3-agent mode** (Writer + Reviewer + Challenger). Single-agent mode exists but is discouraged — the user is prompted to spawn a 2nd same-model agent.

Modes:

| Mode | Default tools | Default autonomy | Agent count | Parallel? |
| --- | --- | --- | --- | --- |
| `ask` | read-only search/files/git status | low | 1–2 | no |
| `plan` | read-only search/files/git status | low | 2 | yes (parallel approach exploration) |
| `code` | edit, shell, git diff, tests | medium | 2–3 | yes (parallel subtask execution) |
| `debug` | shell, tests, logs, edit | medium | 2 | yes (parallel hypothesis testing) |
| `review` | git diff, tests, read-only files | low | 2–3 | yes (parallel dimension-scoped review) |
| `oal` | configurable loop with hard budgets | high but bounded | 2–3 | yes (parallel execution + serial quality gate) |

### Failure handling and retry logic

| Failure | Detection | Mitigation |
| --- | --- | --- |
| Invalid structured output | schema validation fails | ask model to repair JSON once; then reduce prompt and retry |
| Tool timeout | command timer expires | terminate process group; summarize partial output; ask or choose smaller command |
| Patch does not apply | hunk validation fails | re-read file, regenerate patch against current content |
| Tests fail | non-zero exit or failure pattern | classify failure as introduced/pre-existing/infra; repair only introduced failures |
| Context overflow | token estimator exceeds threshold | trigger agent relay racing — graceful wrap-up, handover document, spawn fresh agent |
| Model loop | repeated similar actions | stop after loop detector threshold and ask user |
| Permission denial | policy returns deny/ask | never retry as a different command to bypass policy |
| Merge conflict | git apply/worktree conflict | create conflict report and ask user or run repair in isolated branch |
| Provider failure / rate limit | API error or 429 | automatic failover to backup provider in fallback chain |
| Handoff error | receiving agent flags missing context | clarification round; if unresolved, escalate to user |
| Disagreement deadlock | Challenger cannot resolve | present both approaches to user with evidence |

### Token optimization strategies

- Build one shared repo map per session and reuse it across all agents.
- Send summaries of unchanged files, full content only for active edit targets.
- Prefer AST/LSP symbol snippets over whole files.
- Cache embeddings and file summaries keyed by content hash.
- Use observation masking (hide old tool outputs, keep tool calls visible) — matches summarization quality at zero compute cost (JetBrains finding).
- Prune terminal output to relevant excerpts plus full artifact references.
- Separate planning context from editing context; editing prompts should be narrow.
- Use cheaper/faster models for classification, summarization, and log pruning.
- Use expensive long-context models only for high-risk planning or cross-repo reasoning.
- Parallel independent generation + voting instead of multi-round debate (Debate-or-Vote paper).

### Why this architecture wins

This architecture keeps models powerful but not trusted. The orchestrator owns state, tools are typed and policy-checked, context is explicit, patches are reversible, sessions are replayable, and the user sees a single unified agent. The combination of parallel execution, provider pairing, cost-aware routing, serial quality gate, and agent relay racing is not replicated by any existing tool. That combination is what allows Chimera to evolve from a local CLI into a multi-agent/cloud/IDE platform without rewriting the core loop.

---

## 4. Multi-Agent Protocol

### Agent roles

| Role | Responsibility | Default model tier | Can be parallel? |
| --- | --- | --- | --- |
| **Writer** | implements patches, explores approaches, drafts plans | cheap/mid tier | yes (multiple Writers on different subtasks) |
| **Reviewer** | verifies correctness, tests, maintainability, security | frontier tier | yes (dimension-scoped: correctness, security, performance) |
| **Challenger** | attacks assumptions, proposes alternatives, checks edge cases | frontier/reasoning tier | no (single Challenger per task) |
| **Synthesizer** | merges all outputs into unified response, resolves conflicts | frontier tier | no |

### Default and complex modes

- **Default (2-agent)**: Writer + Reviewer on different providers. Writer drafts, Reviewer verifies.
- **Complex (3-agent)**: Writer + Reviewer + Challenger. Challenger activates when Reviewer flags issues or task complexity exceeds threshold.
- **Single-agent (discouraged)**: exists for trivial tasks. User is prompted: "Single-agent mode is active. Would you like to spawn a 2nd agent on the same model for verification?"

### Parallel execution model

**Planning phase** (parallel approach exploration):
1. Task Router decomposes the planning problem into independent sub-questions.
2. Spawns 2–3 Writer agents on different providers/models.
3. Each agent explores a different approach independently (no cross-contamination).
4. Results are collected and voted on (parallel independent generation + voting).
5. Best approach selected; ties trigger Challenger review.

**Execution phase** (parallel subtask execution):
1. Task Router builds a dependency graph (DAG) of subtasks.
2. Independent subtasks are identified and assigned to Writer agents.
3. Each Writer agent works on its subtask in parallel (git worktree isolation).
4. Results are collected and merged by the orchestrator.
5. Merged result goes through the serial quality gate.

**Serial quality gate** (draft → verify → challenge → synthesize):
1. **Draft**: Writer produces the implementation/plan.
2. **Verify**: Reviewer (different provider) checks correctness, tests, maintainability. Outputs structured verdict: `{verdict: "PASS|FAIL|NEEDS_REVISION", issues: [...], severity: "HIGH|MED|LOW"}`.
3. **Challenge** (complex mode only): Challenger (third provider) attacks assumptions, finds edge cases both Writer and Reviewer missed. Outputs: `{challenges: [...], alternatives: [...]}`.
4. **Synthesize**: Synthesizer merges all outputs, resolves conflicts, produces unified user-facing response.

### Provider pairing

Users pair **ANY models they want** — no hardcoded pairs. The Config TUI walks through setup. Examples:

| Pairing | Writer | Reviewer | Challenger | Rationale |
| --- | --- | --- | --- | --- |
| Budget | Qwen 3 (OpenRouter) | Claude Sonnet 4 (Anthropic API) | GPT-4o-mini (OpenAI) | Lowest cost, solid quality |
| Balanced | DeepSeek V3 (Direct API) | Claude Sonnet 4 (Anthropic API) | GPT-4o (OpenAI) | Best cost/quality ratio |
| Quality | Kimi K2 (Moonshot API) | Claude Opus 4 (Anthropic API) | o3-mini (OpenAI) | Maximum quality, moderate cost |
| Subscription mix | ChatGPT Plus (via unofficial) | Claude Sonnet (subscription) | Gemini Flash (free tier) | Leverages existing subscriptions |

### Task-based role assignment

The Task Router assigns roles dynamically based on subtask complexity, not fixed assignments:

- Simple file edits → cheap model as Writer.
- Architecture decisions → frontier model as Writer.
- Test generation → cheap model as Writer.
- Security review → frontier model as Reviewer.
- Performance optimization → mid-tier model as Writer, frontier as Reviewer.

### Disagreement protocol

1. **2-agent disagreement**: Reviewer flags issues with Writer's output. Writer gets one revision cycle. If still unresolved → escalate to Challenger.
2. **Challenger breaks tie**: Challenger reviews both approaches, produces independent assessment. Orchestrator votes based on structured verdicts.
3. **User escalation**: If Challenger cannot resolve (or all three agents disagree), present both approaches to user with evidence, pros/cons, and cost impact.

### Voting vs debate

Research shows simple voting outperforms multi-round debate for reasoning tasks (Debate-or-Vote, 2025). Chimera uses:

- **Parallel independent generation + voting** as the default coordination mechanism.
- **Multi-round debate only for tie-breaking** when voting produces no clear winner.
- **Correction-biased debate**: if debate is used, bias belief updates toward correction, not conformity. Use an external judge (Challenger) to validate reasoning.

### Handoff validation

At every inter-agent handoff (including agent relay racing), apply minimal clarification (AgentAsk paper prevents 75% of cascading errors):

1. Receiving agent reviews the handover document.
2. Receiving agent asks clarifying questions if anything is ambiguous.
3. Sending agent (or orchestrator) answers.
4. Receiving agent confirms understanding before proceeding.
5. If clarification fails to resolve ambiguity → escalate to user.

### Cost model

- Cheap model handles bulk parallel work (drafting, exploration, test generation).
- Frontier model handles verification, productionization, and synthesis.
- Per-agent cost tracking in real time.
- Budget-aware role assignment: if a provider hits its cost cap, the router automatically switches to the next cheapest capable model.
- Cost comparison dashboard: Chimera cost vs frontier-only baseline.

---

## 5. Provider Configuration

### Config-driven pairing

Users configure any model combination through the Config TUI. No hardcoded pairs, no provider lock-in.

### Config TUI setup wizard

First run launches an interactive wizard:

1. **Add providers**: enter API key, base URL, model name for each provider.
2. **Assign roles**: designate primary (Writer), secondary (Reviewer), tertiary (Challenger).
3. **Set per-model constraints**:
   - Token budget per turn.
   - Cost cap per task/session/day.
   - Max parallel subagent count per model.
   - Rate limit awareness (subscription quotas vs direct API limits).
4. **Test connections**: verify each provider responds correctly.
5. **Select profile template**: Budget, Balanced, Quality, or Custom.
6. **Save configuration**: written to `.chimera/config.yaml`.

### Config file format

```yaml
providers:
  - name: primary
    provider: openai-compatible
    base_url: https://api.deepseek.com
    model: deepseek-chat
    api_key: ${DEEPSEEK_API_KEY}
    role: writer
    constraints:
      max_tokens_per_turn: 8000
      cost_cap_per_task: 0.50
      cost_cap_per_session: 5.00
      cost_cap_per_day: 20.00
      max_parallel_instances: 4
      rate_limit_rpm: 1000
  - name: secondary
    provider: anthropic
    model: claude-sonnet-4-20250514
    api_key: ${ANTHROPIC_API_KEY}
    role: reviewer
    constraints:
      max_tokens_per_turn: 4000
      cost_cap_per_task: 2.00
      cost_cap_per_session: 15.00
      cost_cap_per_day: 50.00
      max_parallel_instances: 2
      rate_limit_rpm: 500
  - name: tertiary
    provider: openrouter
    model: openai/gpt-4o
    api_key: ${OPENROUTER_API_KEY}
    role: challenger
    constraints:
      max_tokens_per_turn: 4000
      cost_cap_per_task: 1.50
      cost_cap_per_session: 10.00
      cost_cap_per_day: 30.00
      max_parallel_instances: 1
      rate_limit_rpm: 200

defaults:
  fallback_chain:
    - primary
    - tertiary
    - secondary
  auto_failover: true
  cost_alert_thresholds: [50, 80, 95, 100]
```

### Cost-aware routing engine

The Task Router considers:

- **Model capabilities vs task complexity**: 15-dimension complexity scoring (similar to ClawRouter).
- **Remaining budget per model**: if a provider is near its cap, route to the next cheapest capable model.
- **Rate limits and subscription quotas**: aware of RPM limits, daily quotas, and subscription vs direct API differences.
- **Cost efficiency**: quality per dollar, using the Triage paper's mathematical framework (arXiv:2604.07494).
- **Automatic fallback**: if primary provider is rate-limited or down, seamlessly switch to backup provider in the fallback chain.

### Subscription + API mixing

Chimera supports mixing subscription plans with direct API access:

- ChatGPT Plus + Anthropic API + OpenRouter for Qwen/Gemini.
- Claude Pro (subscription) for Reviewer + DeepSeek V3 (direct API) for Writer.
- Free-tier Gemini Flash for Challenger + paid Claude Sonnet for Reviewer.

The Config TUI detects provider type and adjusts rate limit awareness accordingly.

---

## 6. TUI Design

### Architecture

Built with `ink` (React-based terminal UI) or `blessed` (lower-level). Three modes from the same binary:

- **Headless mode**: `chimera -p "prompt"` — non-interactive, prints response to stdout. Perfect for CI/CD, Unix scripting, automation.
- **TUI mode**: `chimera` — full-screen interactive interface with panels, streaming, and dashboards.
- **CLI mode**: `chimera ask "..."`, `chimera code "..."` — one-shot command mode with mode flags.

### Screens and panels

**1. Setup/Onboarding Wizard**
- Provider configuration: add API keys, base URLs, model names.
- Role assignment: primary (Writer), secondary (Reviewer), tertiary (Challenger).
- Constraint configuration: cost caps, token limits, parallel instance limits.
- Test connection to each provider with live response.
- Profile templates: Budget, Balanced, Quality, Custom.
- Save and validate configuration.

**2. Main Chat Interface**
- Conversation history with syntax-highlighted code blocks.
- Mode selector: ask, plan, code, debug, review, oal.
- File tree sidebar for context awareness.
- Real-time streaming responses.
- Status bar: current mode, active provider, cost so far, agent count.
- Command palette (Ctrl+P) for quick actions.

**3. Agent Mesh Dashboard** (accessible via toggle, hidden by default)
- Real-time view of active agents and their roles.
- Parallel subagent status: working, waiting, completed.
- Provider assignment per agent.
- Inter-agent communication log (internal, for debugging).
- Disagreement alerts and resolution status.
- Context fill percentage per agent with color-coded thresholds.

**4. Cost Dashboard**
- Per-provider spend: current session + historical.
- Budget remaining per model with progress bars.
- Cost per task breakdown.
- Comparison: Chimera cost vs frontier-only baseline (savings percentage).
- Warning indicators when approaching caps (50%, 80%, 95%, 100%).
- Projected cost at current rate.

**5. Session Browser**
- List of past sessions with metadata: mode, cost, duration, outcome, agent count.
- Resume previous sessions.
- Compare session trajectories side by side.
- Export session logs and event streams.
- Tree-structured session history (Pi pattern): navigate branches, fork sessions.

**6. Diff Viewer**
- Side-by-side or unified diff display.
- Per-file approval/rejection.
- Patch preview before application.
- Rollback option to any checkpoint.
- Multi-agent attribution: which agent produced which change.

**7. Config Editor**
- TUI-based YAML/JSON config management.
- Provider list with status indicators (connected, rate-limited, down).
- Constraint editor with validation.
- Mode policy configuration.
- Hook system configuration (25+ events like Claude Code).

### UX principles

- **Power user accessible**: keyboard shortcuts for everything.
- **Progressive disclosure**: simple by default, advanced features behind toggles.
- **Always visible**: current mode, active provider, cost so far, agent count.
- **Never exposes internal agent disagreements** unless escalation to user is required.
- **Single-agent illusion**: progress indicators show "Analyzing...", "Verifying...", "Synthesizing..." without exposing multi-agent mechanics.

---

## 7. Context Management & Agent Relay Racing

### Context degradation research

LLMs exhibit a U-shaped performance curve ("Lost in the Middle", Stanford TACL 2024): accuracy is highest when relevant information is at the beginning or end of context, and degrades significantly in the middle. Research consensus:

| Context Fill % | Signal | Recommended Action |
| --- | --- | --- |
| 0–30% | Healthy | Continue normally |
| 30–60% | Monitor | Good checkpoint for intentional observation masking |
| 60–70% | Caution | **TRIGGER HANDOFF** — graceful wrap-up, spawn fresh agent |
| 70–80% | Warning | Quality degrading — minimize wrap-up |
| 80%+ | Critical | Emergency handoff — quality already significantly degraded |

Model-specific degradation data:
- **Claude 3.5 Sonnet**: code repair drops from 29% at 32K to 3% at 256K (LongCodeBench).
- **GPT-4o**: NoLiMa drops from 99.3% baseline to 69.7% at 32K.
- **Qwen2.5-7B**: critical threshold at 40–50% of max context — F1 drops 45.5% over a narrow 10% range.
- **DeepSeek V3**: coherence degrades well before 128K, especially past 80K tokens.

**Chimera's handoff trigger: 60–70% of context window** — well before degradation accelerates, giving the agent room to wrap up gracefully.

### Tiered context management

| Tier | Fill % | Strategy | Cost |
| --- | --- | --- | --- |
| **Tier 0** | 0–30% | Normal operation. Full context available. | baseline |
| **Tier 1** | 30–60% | Observation masking: hide old tool outputs, keep tool calls visible. Matches summarization quality at zero compute (JetBrains finding). | zero |
| **Tier 2** | 60–70% | Trigger handoff: graceful wrap-up, commit to git, generate handover document, spawn fresh agent with clean context. | ~2K tokens |
| **Tier 3** | 80%+ | Emergency handoff: minimize wrap-up, quality already degraded. | ~2K tokens |

### Handover document protocol

When a handoff is triggered, the outgoing agent generates a **compact key-value handoff** — an internal-only format optimized for token efficiency. The user never sees this.

**Format: Compact Key-Value Markdown** (80–90% fewer tokens than narrative handoffs)

```
# HANDOFF
goal: <one-line objective>
status: in_progress|blocked|done
progress: Done: <completed>. In progress: <current>. Blocked: <if any>.
decisions:
- <decision>: <rationale>, <source>, <confidence>
- <decision>: <rationale>, <source>, <confidence>
next:
1. [HIGH] <action>
2. [MED] <action>
3. [LOW] <action>
context:
- <critical fact needed to continue>
files-modified:
- path/to/changed.ts (status: created|modified|in-progress, lines: N)
files-read:
- path/to/reference.ts:lines (why read)
errors:
- <error message if any>
meta:
- session: <id>
- agent: <name>
- provider: <provider/model>
- ts: <timestamp>
- context-fill: <percentage>
- claims: <claim-id-1>,<claim-id-2>
```

**Example:**

```
# HANDOFF
goal: Implement user auth module with JWT + OAuth2
status: in_progress
progress: Done: JWT encoding, User model, password hashing. In progress: OAuth2 flow. Blocked: none.
decisions:
- Use JWT with HS256, 15min expiry: performance requirement, architect-output, confirmed
- PostgreSQL for user store: existing infra, architect-output, confirmed
- bcrypt cost factor 12: security policy requirement, confirmed
next:
1. [HIGH] Implement OAuth2 authorization code flow in src/auth/oauth.ts
2. [MED] Add refresh token rotation in src/auth/refresh.ts
3. [LOW] Write integration tests for full auth flow
context:
- OAuth2 redirect URI must match config in .env.example:42
- User model has password field hashed, never store plaintext
files-modified:
- src/auth/jwt.ts (created, 87 lines)
- src/auth/models.ts (created, 64 lines)
- src/auth/oauth.ts (in-progress, line 142)
files-read:
- .env.example:40-45 (OAuth2 config)
- package.json (dependencies)
errors:
meta:
- session: abc123
- agent: writer-1
- provider: deepseek/deepseek-chat
- ts: 2026-05-18T14:30:00Z
- context-fill: 67%
- claims: dec-001,dec-002,dec-003
```

**Delta variant** (subsequent handoffs — only what changed):

```
# HANDOFF-DELTA
base: handoff-001
progress-delta: Implemented OAuth2 flow (src/auth/oauth.ts, 200 lines). Refresh token rotation added.
decisions-added:
- Use PKCE for OAuth2: security best practice, RFC 7636, confirmed
next-updated:
1. [HIGH] Write integration tests for OAuth2 + refresh token flow
2. [MED] Add rate limiting to auth endpoints
files-modified-added:
- src/auth/oauth.ts (completed, 200 lines)
- src/auth/refresh.ts (created, 95 lines)
claims-added: dec-004
```

**Token cost:** 200–600 tokens per handoff (vs 3,000–8,000 for narrative handoffs). Delta handoffs: 100–300 tokens.

**Design rationale:**
- **Markdown over JSON**: 15–38% fewer tokens, LLM-native format, better parsing accuracy (Improving Agents, Oct 2025).
- **Reference passing**: file paths + line ranges instead of inline content — trust the filesystem.
- **Claim IDs** (`dec-001`, `dec-002`): enables genealogy-graph tracking without carrying full source text (From Spark to Fire paper).
- **Single-line progress**: condenses 3 subsections into one line.
- **Priority tags on next steps**: immediate action ordering without extra structure.
- **Internal only**: no human readability requirements — stripped of all markdown formatting overhead.

### Handoff validation protocol

At every handoff (AgentAsk paper prevents 75% of cascading errors):

1. **Outgoing agent** generates compact handoff and commits work to git.
2. **Event log** is saved to filesystem for deep reference.
3. **Claim IDs** are registered in the genealogy-graph (SQLite) with source metadata.
4. **Reviewer validates** the handoff using the AgentAsk checklist before the new agent starts:

```yaml
handoff_checklist:
  data_complete: true       # All required fields present (prevents Data Gap — 29.1% of errors)
  references_grounded: true # All file paths resolve to actual files (prevents Referential Drift — 27.3%)
  claims_verified: true     # Decisions have source attribution (prevents Signal Corruption — 36.8%)
  capability_match: true    # Receiving agent has required tools/providers (prevents Capability Gap — 6.8%)
```

5. **Fresh agent spawns** with handoff at the **START** of its context (primacy bias).
6. **Clarification round**: fresh agent reads handoff, reads relevant files fresh from disk, asks clarifying questions if anything is ambiguous.
7. **Confirmation**: fresh agent confirms understanding before proceeding. If clarification fails → escalate to user.
8. **Resume work** with clean context window.

### Handoff storage

- Full handoff written to `.chimera/handoffs/<session-id>/<handoff-num>.md`
- Compact version (200–600 tokens) passed inline to new agent's context
- Claim lineage graph stored in SQLite, referenced by IDs
- Event log preserved separately for deep reference
- Chain tracking: each handoff references its `base` handoff ID, creating an auditable chain

### Agent relay racing flow

```
┌─────────────────────────────────────────────────┐
│              Context Monitor                     │
│  Tracks: tokens used, fill %, degradation risk   │
│  Threshold: 60–70% of context window            │
└─────────────────────┬───────────────────────────┘
                      │ threshold reached
                      ▼
┌─────────────────────────────────────────────────┐
│          Graceful Wrap-Up                        │
│  1. Complete current tool call                   │
│  2. Commit work to git with descriptive message  │
│  3. Generate handover document                   │
│  4. Tag claims with provenance metadata          │
│  5. Save full event log to filesystem            │
│  6. Reviewer validates handover document         │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│          Fresh Agent Spawn                       │
│  1. Load handover document (at context START)   │
│  2. Read relevant files fresh from disk          │
│  3. Clarification round: "Do I understand?"     │
│  4. If yes → continue; if no → request details  │
│  5. Resume work with clean context window        │
└─────────────────────────────────────────────────┘
```

### Integration with multi-agent architecture

- **Parallel subagents** each have their own context monitor — when any subagent hits the threshold, it triggers a handoff independently.
- **Reviewer agent** validates the handoff using the AgentAsk checklist before the new agent starts (quality gate on handoffs).
- **Challenger agent** can review the handoff for completeness — "Did the outgoing agent miss anything?"
- **Cost Tracker** logs the handoff event — handoffs add ~200–600 tokens (compact handoff + clarification), negligible compared to context degradation costs.
- **Event Stream** preserves the full history — the new agent can read the complete event log if needed.
- **Claim lineage graph** in SQLite tracks provenance by ID, not full text.

### Hybrid approach: verbatim > summarization

Research shows summarization loses 63% of information across sessions (Factory.ai benchmark). For coding agents, exact file paths, error codes, and line numbers matter — summarization paraphrases them away.

Chimera's approach:
- **Tier 1 (30–60%)**: observation masking — hide old tool outputs, keep tool calls visible. Zero compute cost.
- **Tier 2 (60–70%)**: agent relay racing — compact key-value handoff (200–600 tokens) + fresh agent. ~80–90% token savings vs narrative handoffs.
- **Never rely on LLM summarization** for critical context. Everything the agent must always remember lives in project instructions (AGENTS.md, CLAUDE.md, .chimera/rules.md), which load as part of the system prompt and are never touched by compaction.

---

## 8. Context Engineering Strategy

### Context pipeline

```text
Repository root
  -> instruction discovery (AGENTS.md, CLAUDE.md, .chimera/rules.md, etc.)
  -> file inventory + ignore rules
  -> language/framework detection
  -> lexical index (ripgrep)
  -> AST/tree-sitter index
  -> LSP symbols when available
  -> embeddings for eligible text/code chunks
  -> repo map summary (PageRank-weighted)
  -> task-specific retrieval
  -> context pack
  -> prompt assembly
```

### Instruction hierarchy

Precedence should be explicit:

1. system/developer policy;
2. user request;
3. mode policy;
4. repository instructions nearest to touched files;
5. global user preferences;
6. generated memory and summaries.

Instruction files to discover:

- `AGENTS.md`;
- `CLAUDE.md`;
- `GEMINI.md`;
- `.github/copilot-instructions.md`;
- `.cursorrules`;
- `.windsurfrules`;
- `.roo/rules*` and `.roomodes` where relevant;
- `.chimera/rules.md` and `.chimera/config.*`.

Generated memory must never override explicit human instructions.

### Repository summarization

Maintain layered summaries:

| Layer | Content | Refresh trigger |
| --- | --- | --- |
| Repo profile | languages, frameworks, package managers, test commands | lockfile/config changes |
| Directory summaries | module purpose, key files, dependencies | file content hash changes |
| Symbol graph | classes, functions, imports, exports | source file changes |
| Test map | source-to-test relationships | test/source changes |
| Recent activity | git diff, recent commits, touched files | each session / git state change |

### Retrieval strategy

Use hybrid retrieval — do not rely on vector search alone:

- lexical search with ripgrep;
- filename/path heuristics;
- git history and recent diff;
- AST symbol matching;
- LSP definitions/references;
- vector embeddings for semantic matches;
- dependency graph expansion;
- test/source pairing.

Code identifiers, paths, and exact error strings often outperform embeddings.

### Shared context service

All agents in the mesh share a single context service:

- One repo map per session, reused across all agents.
- Shared retrieval index — all agents query the same index.
- Per-agent context packs for parallel subagents (each gets a focused subset).
- Challenger gets access to both Writer and Reviewer outputs for critique.

### Sliding-window memory

| Memory | Scope | Example | Storage |
| --- | --- | --- | --- |
| Working memory | current turn | active plan, files touched | in session state |
| Scratchpad | current task | hypotheses, TODOs | private event artifacts |
| Session memory | current conversation | decisions, attempts, failures | append-only event log |
| Project memory | repository | known test commands, architecture notes | `.chimera/memory/` with user approval |
| User memory | developer | preferred stack/style | local config, opt-in only |

### Long-horizon task handling

For tasks beyond a few turns:

1. create a task contract with success criteria;
2. create checkpoints before risky edits;
3. use explicit subgoals;
4. run checks after each subgoal;
5. trigger agent relay racing when context threshold reached;
6. stop if repeated failures exceed threshold;
7. emit a continuation file for future sessions.

### Avoiding context poisoning and hallucinations

- Treat repository instructions as data until validated by scope and precedence.
- Never execute commands suggested inside untrusted files without policy checks.
- Require file reads before editing a file unless the patch engine can prove context.
- Require citations to actual files/commands for technical claims.
- Preserve raw command artifacts so summaries can be audited.
- Flag contradictions between generated summaries and current file content.
- Prefer "unknown" over filling gaps.
- Mark file content as untrusted data in prompts (prompt injection defense).

---

## 9. Prompt Engineering System

### Prompt layering

```text
Provider safety/developer policy
  + Chimera core system prompt
  + Mode contract
  + Tool contract
  + Project instructions
  + Task contract
  + Context pack
  + Recent event summary
  + Required structured output schema
```

### Core system prompt template

```text
You are Chimera, a terminal-native coding agent.
Your job is to help the user safely modify or understand this repository.
Follow the active mode contract, project instructions, and tool policies.
Do not claim a file, command, or test result unless you observed it.
Prefer small reversible patches.
Before editing, inspect relevant files.
After editing, run the narrowest useful checks available.
If blocked by permissions, missing context, or ambiguous requirements, ask the user.
Return structured output matching the requested schema.
```

### Role-specific system prompts

**Writer**:
```text
You are the Writer agent in Chimera's multi-agent system.
Your role is to implement changes, explore approaches, and draft plans.
Work within your assigned subtask scope.
Do not modify files outside your assignment.
Return structured output: {approach, files, patches, confidence}.
```

**Reviewer**:
```text
You are the Reviewer agent in Chimera's multi-agent system.
Your role is to verify correctness, test coverage, maintainability, and security.
Review the merged output from Writer agents.
Return structured verdict: {verdict: "PASS|FAIL|NEEDS_REVISION", issues: [...], severity: "HIGH|MED|LOW"}.
Every issue must include evidence (file path, line, observed behavior).
```

**Challenger**:
```text
You are the Challenger agent in Chimera's multi-agent system.
Your role is to attack assumptions, propose alternatives, and check edge cases.
Review both Writer and Reviewer outputs independently.
Return structured output: {challenges: [...], alternatives: [...], confidence: number}.
Focus on what both agents missed, not what they agreed on.
```

**Synthesizer**:
```text
You are the Synthesizer agent in Chimera's multi-agent system.
Your role is to merge all agent outputs into a single unified response.
Resolve conflicts using structured verdicts and confidence scores.
Present the final result as if it came from a single agent.
Do not expose internal disagreements unless escalation is required.
```

### Mode prompt examples

**Plan mode**:
```text
Mode: PLAN
You may inspect files, search, read git state, and reason.
You must not edit files or run destructive commands.
Produce:
1. goal restatement;
2. relevant files/modules;
3. implementation plan with parallel subtask decomposition;
4. risks and mitigations;
5. checks to run;
6. questions if requirements are ambiguous.
```

**Code mode**:
```text
Mode: CODE
Implement the approved task using small, reviewable patches.
Before each edit, identify the target file and why it is relevant.
After edits, run focused checks.
If tests fail, determine whether the failure is introduced, pre-existing, or environmental.
Stop and ask before destructive commands, broad rewrites, dependency upgrades, or secret access.
```

**Review mode**:
```text
Mode: REVIEW
Review the diff and supporting context.
Classify findings as blocker, warning, or note.
Every blocker must include evidence and a suggested fix.
Do not rewrite the code unless explicitly asked.
```

### Structured output schemas

Use Zod/JSON Schema-compatible schemas. Inter-agent communication uses strict schemas:

```json
{
  "writer_output": {
    "type": "object",
    "required": ["approach", "files", "patches", "confidence"],
    "properties": {
      "approach": { "type": "string" },
      "files": { "type": "array", "items": { "type": "string" } },
      "patches": { "type": "array", "items": { "$ref": "#/definitions/patch" } },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
    }
  },
  "reviewer_verdict": {
    "type": "object",
    "required": ["verdict", "issues"],
    "properties": {
      "verdict": { "enum": ["PASS", "FAIL", "NEEDS_REVISION"] },
      "issues": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["description", "severity", "evidence"],
          "properties": {
            "description": { "type": "string" },
            "severity": { "enum": ["HIGH", "MED", "LOW"] },
            "evidence": { "type": "string" }
          }
        }
      }
    }
  },
  "challenger_output": {
    "type": "object",
    "required": ["challenges", "alternatives"],
    "properties": {
      "challenges": { "type": "array", "items": { "type": "string" } },
      "alternatives": { "type": "array", "items": { "type": "string" } },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
    }
  }
}
```

### Chain-of-thought containment

Chimera should not depend on exposing private reasoning. Instead require concise, inspectable artifacts:

- plan summaries;
- assumptions;
- evidence lists;
- risk registers;
- tool-call rationales;
- diff explanations;
- failure analyses;
- handover documents.

The internal model reasoning can remain hidden; the system output should be auditable without requiring chain-of-thought.

### Recovery prompts

- **JSON repair**: "Return only valid JSON for the same schema."
- **Patch repair**: "The patch failed because hunk X did not match current file. Re-read the file and produce a minimal replacement."
- **Test failure**: "Classify this failure using observed output only; propose the smallest next diagnostic."
- **Loop break**: "You repeated the same failing action twice. Produce a new hypothesis or stop."
- **Handoff clarification**: "The handover document mentions [X]. Please clarify: [specific question]."

---

## 10. Tooling Layer

### Tool categories

| Tool family | MVP? | Examples | Notes |
| --- | --- | --- | --- |
| Filesystem | yes | read, write via patch, list, stat | edits go through patch engine |
| Search | yes | ripgrep, glob, semantic search later | lexical first |
| Shell | yes | run command with PTY/non-PTY | timeout and env filtering required |
| Git | yes | status, diff, apply, stage, commit, checkout, worktree | checkpoint before risky work |
| Patch engine | yes | apply unified diff, replace range, rollback | validate against current content |
| Test runner | yes | npm test, pytest, cargo test, go test, custom | command discovery plus user config |
| LSP | later v1 | definitions, references, diagnostics | not MVP critical but high leverage |
| Browser | later | fetch docs, Playwright | use allowlists and network policy |
| Docker/container | later | isolated exec, devcontainer | important for production hardening |
| MCP | v1 | configured servers/tools | per-tool permission metadata; dual role (client + server) |
| Evaluation | MVP-lite | replay task, store trajectory | grows in phase 5 |

### Permission profiles

Each agent has an independent permission profile:

| Profile | Read files | Write files | Shell | Network | Best for |
| --- | --- | --- | --- | --- | --- |
| `read-only` | yes | no | safe read commands | no/default deny | ask/plan/review |
| `ask-before-write` | yes | ask | ask | ask | default first-run |
| `workspace-write` | yes | yes in repo | ask for risky | ask | normal coding |
| `trusted-project` | yes | yes | allow allowlisted | allow allowlisted | experienced users |
| `danger-full-access` | yes | yes | yes | yes | CI/sandbox only |

### Parallel tool execution

- Multiple subagents can execute tools in parallel.
- Conflicts are detected at the patch engine level (same file modified by multiple agents).
- Conflict resolution: orchestrator merges patches, flags conflicts for Reviewer.
- Git worktree isolation for parallel agents prevents file-level conflicts.

### Secure execution

- All tool calls pass through policy checks.
- Shell commands run with timeout, output cap, cwd restriction, and env redaction.
- Destructive patterns require approval: `rm -rf`, `git reset --hard`, force pushes, package publishes, credential commands, broad chmod/chown, network exfiltration.
- Secrets are redacted in logs using pattern detectors and known env names.
- The model cannot alter its own permission profile.
- Tool outputs are stored as artifacts and summarized separately.
- OS-level sandboxing (Seatbelt on macOS, Landlock on Linux) for untrusted code execution (Codex CLI pattern).

### MCP dual role

Chimera acts as both:
- **MCP client**: connects to external MCP servers for tool extensions (like Claude Code, Cline).
- **MCP server** (later): exposes Chimera's capabilities to other agents (like Codex CLI's experimental MCP server mode). Enables composability.

---

## 11. MVP Definition

### Smallest usable product

The MVP should be a reliable terminal agent that can safely complete small-to-medium coding tasks in an existing repo, using 2 agents on different providers by default.

MVP features:

1. CLI with interactive TUI-lite and one-shot command mode.
2. **Config TUI setup wizard** for provider pairing, cost caps, role assignment.
3. Provider registry for at least OpenAI-compatible, Anthropic-compatible, and Google-compatible APIs.
4. **2-agent mode as default** (Writer + Reviewer on different providers).
5. Modes: `ask`, `plan`, `code`, `debug`, `review`.
6. **Parallel subtask execution** for code and debug modes.
7. **Serial quality gate**: draft → verify → synthesize (Challenger in Phase 3).
8. **Agent relay racing**: context monitoring, handover documents, fresh agent spawning.
9. Project instruction discovery for `AGENTS.md` and `.chimera/rules.md`.
10. Repo inventory and simple repo map (PageRank-weighted).
11. Read/search/edit/shell/git/test tools with permission profiles.
12. Patch engine with diff preview and rollback.
13. Session event log and resume.
14. **Cost tracker**: real-time per-provider spend, budget alerts.
15. Basic evaluation harness with replayable sample tasks.

### Explicitly cut from MVP

Cut these until the core loop is excellent:

- cloud execution;
- IDE extension;
- browser automation;
- voice;
- distributed execution;
- RL loops;
- plugin marketplace;
- full LSP integration;
- automatic PR creation;
- complex vector DB deployment;
- OS-level sandboxing (Phase 7).

### Technical shortcuts allowed

- Use SQLite for session storage and local indexes.
- Use in-process orchestration before distributed workers.
- Use ripgrep and tree-sitter before LSP.
- Use local embedding cache with SQLite vector extension or LanceDB instead of hosted vector infra.
- Use unified diff and range replace before building a CRDT editor.
- Use a simple React/Ink or Textual TUI before a full terminal UI framework.
- Use LiteLLM for provider abstraction (proven by OpenHands).

### MVP success criteria

- Can answer repo questions with cited files.
- Can implement a small multi-file change and show a clear diff.
- Can run project tests or explain why not.
- Can recover from a failed patch or failed test once.
- Can resume a previous session.
- Can operate safely under read-only and workspace-write policies.
- Can produce an auditable trajectory for evaluation.
- **Cost is demonstrably lower than frontier-only baseline** (target: 40–60% savings).
- **Quality matches or exceeds frontier-only** (verified by eval harness).

---

## 12. Implementation Roadmap

### Phase 1: Foundational scaffolding + multi-agent orchestrator

Goals:
- establish repo structure, packages, CLI entrypoint, config, logging, docs, and the multi-agent orchestrator core.

Tasks:
- choose TypeScript as primary language; set up monorepo with Turborepo or Nx;
- create packages: `chimera-cli`, `chimera-core`, `chimera-providers`, `chimera-tools`, `chimera-context`, `chimera-eval`, `chimera-tui`;
- implement config loading with Zod schema validation;
- add command router (`chimera ask`, `chimera plan`, `chimera code`, etc.);
- add structured logging with pino;
- add session directory layout with SQLite backend;
- implement **Task Router** with 15-dimension complexity scoring;
- implement **Event Stream** (immutable, append-only, replayable);
- implement **Agent Mesh Coordinator** skeleton (serial quality gate pipeline);
- add contribution docs and ADR template.

Suggested libraries:
- TypeScript: `commander` or `clipanion`, `zod`, `pino`, `execa`, `ink` or `blessed`, `better-sqlite3`, `litellm` (via Python bridge or TypeScript equivalent).

Risks:
- overbuilding UI before runtime;
- choosing a language that slows model-provider iteration;
- Task Router complexity scoring accuracy.

Deliverables:
- `chimera --help` with mode flags;
- config schema and loading;
- package skeleton;
- architecture docs;
- Task Router with complexity scoring;
- Event Stream with replay capability.

### Phase 2: Provider pairing + 2-agent serial loop + TUI

Goals:
- implement provider abstraction, 2-agent serial loop, Response Synthesizer, Cost Tracker, and Main Chat TUI.

Tasks:
- provider abstraction layer with LiteLLM integration;
- streaming responses for all providers;
- structured output validation (Zod schemas for inter-agent communication);
- **2-agent serial loop**: Writer drafts → Reviewer verifies → Synthesizer merges;
- **Response Synthesizer**: conflict resolution, unified output generation;
- **Cost Tracker**: real-time per-provider spend, budget enforcement, alerts;
- **Config TUI setup wizard**: provider configuration, role assignment, cost caps, test connections;
- **Main Chat TUI**: conversation history, syntax highlighting, mode selector, streaming;
- permission engine with per-agent profiles.

Dependencies:
- Phase 1 deliverables (Task Router, Event Stream, Agent Mesh skeleton).

Risks:
- provider-specific quirks leaking into core runtime;
- unbounded loops in serial quality gate;
- Cost Tracker accuracy across different provider pricing models.

Deliverables:
- `ask` and `plan` modes with 2-agent execution;
- model registry with fallback chains;
- deterministic event trace with cost metadata;
- Config TUI setup wizard;
- Main Chat TUI with streaming;
- Cost Tracker with budget alerts.

### Phase 3: Parallel subagents + Challenger + Agent Mesh Dashboard

Goals:
- enable parallel subagent spawning, Challenger agent, disagreement protocol, and Agent Mesh Dashboard.

Tasks:
- **Parallel subagent spawning**: dependency-graph decomposition, git worktree isolation, concurrent execution;
- **Challenger agent**: third provider, adversarial review, alternative proposal;
- **Disagreement protocol**: voting → Challenger → user escalation;
- **Handoff validation**: clarification round at every inter-agent handoff;
- **Agent Mesh Dashboard**: real-time agent status, parallel subagent view, disagreement alerts;
- **Genealogy-graph provenance tracking**: tag every claim with source metadata;
- **Agent relay racing**: context monitoring, handover document generation, fresh agent spawning.

Dependencies:
- Phase 2 deliverables (2-agent loop, Cost Tracker, Config TUI).

Risks:
- parallel execution conflicts (same file modified by multiple agents);
- Challenger agent adding too much latency;
- handoff validation adding overhead.

Deliverables:
- `code` and `debug` modes with parallel subtask execution;
- Challenger agent with adversarial review;
- Agent Mesh Dashboard (toggleable);
- Agent relay racing with handover documents;
- Handoff validation protocol.

### Phase 4: Context/retrieval + Cost Dashboard + LSP integration

Goals:
- make agents useful in real repos without dumping all files into context, add Cost Dashboard, integrate LSP.

Tasks:
- file inventory with ignore rules;
- instruction discovery (AGENTS.md, CLAUDE.md, .chimera/rules.md);
- ripgrep search integration;
- tree-sitter parsing for AST index;
- repo map summaries (PageRank-weighted, like Aider);
- embedding cache for semantic retrieval;
- context packer with per-agent subsets;
- **Cost Dashboard**: per-provider spend, budget remaining, cost vs frontier-only baseline, projections;
- **LSP integration**: automatic server startup, diagnostics feed into verification quality gate;
- observation masking for Tier 1 context management.

Dependencies:
- Phase 3 deliverables (parallel subagents, Challenger, relay racing).

Risks:
- stale summaries;
- vector-only hallucinations;
- token bloat from LSP diagnostics;
- LSP server startup latency.

Deliverables:
- repo map with PageRank weighting;
- context pack debug view;
- Cost Dashboard with real-time metrics;
- LSP integration with diagnostic feed;
- observation masking for context management.

### Phase 5: Execution tools + patch engine + sandboxing + Diff Viewer

Goals:
- enable safe multi-file editing, command execution, tests, repair, review, and OS-level sandboxing.

Tasks:
- patch engine with unified diff application and hunk validation;
- file write controls with per-agent permission profiles;
- shell execution with PTY, timeout, output cap, env filtering;
- git checkpointing before risky work;
- test command discovery and execution;
- failure classification (introduced/pre-existing/environmental);
- **execution-grounded verification**: every code change runs in sandbox before acceptance;
- **Diff Viewer**: side-by-side/unified diff, per-file approval, patch preview, rollback;
- **OS-level sandboxing**: Seatbelt (macOS), Landlock (Linux) for execution isolation;
- initial `oal` mode with hard budgets.

Dependencies:
- Phase 3 deliverables (parallel subagents, Challenger, relay racing).

Risks:
- destructive commands;
- failed patch application;
- flaky test interpretation;
- OS-level sandboxing platform compatibility.

Deliverables:
- implement small bug fixes end-to-end with 2-agent quality gate;
- rollback command with git checkpoint;
- review diff report with multi-agent attribution;
- Diff Viewer with per-file approval;
- OS-level sandboxing for shell execution.

### Phase 6: Session Browser + Config Editor + eval harness + UX polish

Goals:
- make Chimera feel better than raw model chat, add evaluation harness, polish UX.

Tasks:
- **Session Browser**: past sessions, resume, compare trajectories, export logs, tree-structured history;
- **Config Editor**: TUI-based config management, provider status, constraint editor, mode policies;
- trajectory replay for evaluation;
- fixture repos for benchmark tasks;
- synthetic tasks for regression testing;
- SWE-bench Lite adapter;
- mutation/regression tasks;
- scoring rubric and benchmark dashboard;
- **New eval metrics**: cost per task vs frontier-only, disagreement rate, parallel speedup, handoff quality;
- TUI timeline with compact progress display;
- mode switching UX;
- command palette;
- docs and examples.

Dependencies:
- Phase 5 deliverables (patch engine, sandboxing, Diff Viewer).

Risks:
- benchmark overfitting;
- nondeterminism from model/provider changes;
- hiding too much agent state in TUI;
- making advanced controls hard to discover.

Deliverables:
- `chimera eval run` with cost and quality metrics;
- metrics report with failure taxonomy;
- Session Browser with tree-structured history;
- Config Editor with validation;
- polished interactive CLI/TUI;
- docs site seed;
- demo recordings.

### Phase 7: Production hardening + cloud runner + IDE protocol

Goals:
- prepare for teams, CI, cloud, and enterprise environments.

Tasks:
- sandbox profiles with Docker/devcontainer runner;
- MCP governance with per-server allowlists;
- audit logs with tamper-evident storage;
- telemetry opt-in with data residency controls;
- secret redaction with pattern detectors;
- policy files for enterprise deployment;
- crash recovery with session state persistence;
- **cloud runner prototype**: control plane API, task queue, ephemeral workspace, sandboxed runner, event stream;
- **IDE protocol prototype**: local daemon so IDE clients (VS Code, JetBrains, Neovim) can reuse the same runtime;
- provider-agnostic fallback with automatic failover;
- dual MCP role (client + server) for composability.

Risks:
- policy complexity for enterprise;
- enterprise requirements delaying OSS velocity;
- cloud runner cost management;
- IDE protocol standardization.

Deliverables:
- hardened local release with enterprise features;
- CI/headless mode with API key authentication;
- cloud-runner design doc and prototype;
- IDE protocol prototype;
- dual MCP role implementation.

---

## 13. Evaluation & Benchmarking

### Benchmark categories

| Category | Example | Metric |
| --- | --- | --- |
| Repo Q&A | "Where is auth enforced?" | answer correctness, citation accuracy |
| Small bug fix | failing unit test | pass/fail, patch size, iterations |
| Multi-file feature | add endpoint + tests | acceptance criteria, tests pass |
| Refactor | rename API safely | compile/test pass, diff quality |
| Debug task | reproduce and fix crash | reproduction success, fix correctness |
| Review task | find bug in diff | precision/recall of findings |
| Autonomous loop | achieve goal under budget | completion, cost, safety violations |
| Security | identify unsafe pattern | true positives, false positives |

### Harness design

```text
Task spec + repo fixture
  -> isolated workspace
  -> Chimera run with fixed config
  -> event trajectory capture
  -> patch capture
  -> checks/tests
  -> judge/scorer
  -> metrics DB
  -> failure report
```

### Metrics

- success rate;
- pass@1 / pass@N for benchmark tasks;
- tests passed/failed;
- introduced regression count;
- patch size and touched-file count;
- latency wall-clock;
- model tokens and cost;
- number of tool calls;
- number of approval prompts;
- retry count;
- context-pack token count;
- hallucinated file/command claims;
- safety policy violations;
- user-intervention count;
- **cost per task vs frontier-only baseline** (target: 40–60% savings);
- **disagreement rate and resolution outcomes** (how often agents disagree, how resolved);
- **parallel speedup** (wall-clock time vs sequential execution);
- **handoff quality** (clarification rounds needed per handoff, information loss rate);
- **2-agent vs 3-agent vs single-agent quality/cost comparison**.

### Trajectory storage

Store:

- task spec;
- repo commit SHA;
- model/provider config;
- mode and permission profile;
- context packs;
- prompts after redaction;
- tool calls;
- command outputs;
- patches;
- test results;
- final answer;
- score and judge notes;
- **per-agent trajectories** (Writer, Reviewer, Challenger outputs);
- **disagreement logs** (what was disputed, how resolved);
- **handover documents** (for handoff quality analysis);
- **cost breakdown** (per-agent, per-provider, per-task).

### Failure analysis workflow

1. Reproduce with saved trajectory.
2. Classify failure: localization, planning, context, patching, tool, test interpretation, model refusal, permission, benchmark flaw, **handoff error**.
3. Add a regression fixture.
4. Patch the deterministic layer first if possible.
5. Only modify prompts after verifying tool/context layer is correct.
6. Re-run benchmark subset and compare cost/latency.

### SWE-bench style evaluation

Support adapters for:

- SWE-bench Lite / Verified;
- internal issue fixtures;
- OSS project pinned tasks;
- generated mutation tasks;
- human-authored acceptance checklists.

Publish results showing **cost-per-resolution vs competitors** on the OpenHands Index and HAL Leaderboard.

Avoid leaderboard chasing as the primary product metric. Optimize for developer usefulness and safe task completion in real repos.

---

## 14. Collaboration & Open Source Structure

### Recommended repo structure

```text
chimera/
  README.md
  LICENSE
  CONTRIBUTING.md
  CODE_OF_CONDUCT.md
  SECURITY.md
  docs/
    chimera-agent-blueprint.md
    architecture/
    adr/
    evals/
    modes.md
    security.md
    competitive-analysis/
  packages/
    chimera-cli/
    chimera-core/
    chimera-providers/
    chimera-tools/
    chimera-context/
    chimera-eval/
    chimera-tui/
  examples/
    basic-repo/
    eval-fixtures/
  .github/
    ISSUE_TEMPLATE/
    workflows/
```

### Contribution guidelines

- Require tests for deterministic code.
- Require event-schema compatibility notes for runtime changes.
- Require security review for new tools, shell behavior, MCP permissions, or sandbox changes.
- Require eval deltas for prompt/context/runtime changes that affect agent behavior.
- Require docs for new modes or permission profiles.
- Require cost impact analysis for any change that affects token usage or provider routing.

### Architecture Decision Records

Use ADRs for:

- language/runtime choice;
- provider abstraction;
- session storage format;
- patch strategy;
- sandbox model;
- vector store;
- multi-agent quorum design;
- cloud execution architecture;
- agent relay racing thresholds;
- handover document schema.

ADR template:

```md
# ADR-000X: Title

## Status
Proposed | Accepted | Superseded

## Context

## Decision

## Alternatives considered

## Consequences

## Failure modes and mitigations
```

### Issue templates

- Bug report with environment, command, model, permission profile, session ID, agent count.
- Feature request with user story and safety/cost impact.
- Tool integration request with permissions and threat model.
- Evaluation regression with task spec and trajectory.
- Documentation improvement.

### PR workflow

- Run unit tests, lint, typecheck.
- Run minimal eval suite for runtime/prompt/context changes.
- Include before/after trajectory snippets for agent-behavior changes.
- Include cost impact analysis for changes affecting token usage.
- Update docs and ADRs when architecture changes.
- Keep generated benchmark artifacts out of normal PRs unless explicitly needed.

Best-practice references:

- OpenAI Codex repo: https://github.com/openai/codex
- Continue repo: https://github.com/continuedev/continue
- OpenHands repo: https://github.com/All-Hands-AI/OpenHands
- SWE-agent repo: https://github.com/SWE-agent/SWE-agent
- Aider repo: https://github.com/Aider-AI/aider
- OpenCode repo: https://github.com/anomalyco/opencode

---

## 15. Security & Safety

### Threat model

| Threat | Example | Mitigation |
| --- | --- | --- |
| Prompt injection from repo | malicious README asks agent to leak secrets | instruction hierarchy, untrusted-content labeling, permission checks |
| Secret exfiltration | command prints `.env` or sends token to network | redaction, network policy, file allowlists |
| Destructive command | `rm -rf`, `git reset --hard` | approval gates, sandbox, git checkpoint |
| Supply-chain attack | agent installs package blindly | package install approval and lockfile diff review |
| Tool confusion | model calls wrong tool or path | schemas, cwd display, confirmation for broad paths |
| Context poisoning | stale generated summary contradicts code | content-hash invalidation, source citations, agent relay racing |
| Infinite autonomy | OAL loops forever | hard budgets, loop detection, stop conditions |
| Privilege escalation | MCP server performs hidden action | MCP permission metadata and per-server allowlists |
| **Cross-agent prompt injection** | Writer agent's output contains instructions to Reviewer | untrusted-content labeling between agents, instruction hierarchy precedence |
| **Handoff manipulation** | outgoing agent plants false claims in handover document | genealogy-graph provenance tracking, Challenger review of handoffs |
| **Provider compromise** | API key leaked or provider returns malicious output | per-agent isolation, output verification by different provider |

### Sandboxing layers

1. **Policy layer**: mode and permission profile decide whether a tool call is allowed.
2. **Workspace layer**: restrict file writes to repo/worktree by default.
3. **Process layer**: command timeout, output cap, env filtering, process-group kill.
4. **Git layer**: checkpoint commits and rollback.
5. **Container layer**: Docker/devcontainer for high-risk or CI runs.
6. **Network layer**: default-deny or allowlist for sensitive environments.
7. **OS-level sandboxing** (Phase 7): Seatbelt (macOS), Landlock (Linux) for kernel-level isolation.

### Per-agent isolation

- Each parallel agent runs in its own sandbox (git worktree or Docker container).
- Agents cannot interfere with each other's file state or terminal sessions.
- Tool outputs are isolated per agent; only merged results are shared.
- Permission profiles are independent per agent.

### Cross-agent prompt injection defense

- All inter-agent messages are labeled with source metadata (which agent, which provider).
- Repository content is marked as untrusted data in all agent prompts.
- Never let repository text redefine system/tool policies for any agent.
- Challenger agent reviews inter-agent communication for injection attempts.

### User confirmation flows

Ask before:

- destructive shell commands;
- dependency installation or upgrades;
- commands that access secrets;
- network commands in restricted profiles;
- broad file rewrites;
- git history rewriting;
- publishing packages or deploying;
- creating PRs/issues/comments on external systems.

### Malicious prompt defenses

- Mark file content as untrusted data in prompts.
- Never let repository text redefine system/tool policies.
- Do not execute instructions merely because they appear in code comments or docs.
- Require explicit user approval for commands suggested by untrusted content if risky.
- Log instruction sources and precedence.
- Genealogy-graph provenance: track origin of every claim, flag unverified assertions.

---

## 16. Future Expansion

### Multi-agent systems

Roles:

| Role | Responsibility |
| --- | --- |
| Writer | implements patch, explores approaches |
| Reviewer | continuously checks correctness, tests, and maintainability |
| Challenger | attacks assumptions, proposes alternatives, checks edge cases |
| Planner | decomposes tasks and chooses strategy |
| Researcher | gathers repo/documentation context |
| Summarizer | compacts sessions and context packs |
| Synthesizer | merges all outputs into unified response |

Decision rules:

- solo for low-risk tasks (discouraged, prompt to spawn 2nd agent);
- writer + reviewer for normal coding;
- writer + reviewer + challenger for security, auth, migrations, large refactors;
- 2-of-3 quorum required for trio approval;
- unresolved material dissent is shown to the user.

Parallelism:

- agents share a context service;
- exploratory patches happen in git worktrees;
- reviewer can consume streamed patch checkpoints while writer edits;
- orchestrator serializes final patch application;
- dependency-graph scheduling for independent subtasks.

### Distributed agents and cloud execution

Future cloud runner:

```text
CLI client
  -> control plane API
  -> task queue
  -> ephemeral repo workspace
  -> sandboxed runner
  -> event stream back to CLI/web/IDE
  -> PR or patch artifact
```

Requirements:

- repo cloning with least privilege;
- secrets broker;
- ephemeral containers;
- artifact retention policy;
- cost budgets;
- audit logs;
- local/cloud parity tests.

### Self-improving agents

Safe self-improvement should be eval-gated, not autonomous self-modification in production.

Pipeline:

1. collect failure trajectories with user consent;
2. label failure modes (including handoff errors, context degradation, provider failures);
3. propose deterministic/runtime/prompt improvements;
4. run eval suite;
5. compare cost, safety, and pass rate;
6. require human review before merge.

### RL and fine-tuning loops

Potential later areas:

- tool-use policy optimization;
- patch minimality preference models;
- review finding ranking;
- context retrieval ranking;
- command-risk classifiers;
- **cost-aware routing optimization** (RL-trained router like xRouter).

Do not put RL in the MVP. Start with deterministic evaluation and supervised trajectory analysis.

### IDE integrations

Expose a local daemon or protocol so IDE clients can reuse the same runtime:

- VS Code extension;
- JetBrains plugin;
- Neovim client;
- Cursor/Windsurf-compatible integration where possible;
- Language Server Protocol extension for diagnostics and code actions.

### Enterprise deployment

Enterprise features:

- admin policy files;
- provider allowlists;
- telemetry controls;
- SSO for cloud runner;
- audit exports;
- artifact retention controls;
- offline/local-model mode;
- private MCP registry;
- CI/CD integration;
- team-scoped configuration and shared agent definitions.

---

## Prioritized next steps

1. Create the monorepo scaffold, CLI package, and Config TUI setup wizard.
2. Implement provider abstraction, model registry, and LiteLLM integration.
3. Implement Task Router with 15-dimension complexity scoring and cost-aware routing.
4. Implement Event Stream and Agent Mesh Coordinator (serial quality gate pipeline).
5. Implement 2-agent serial loop: Writer drafts → Reviewer verifies → Synthesizer merges.
6. Implement Cost Tracker with per-provider spend and budget enforcement.
7. Implement parallel subagent spawning with git worktree isolation.
8. Implement Challenger agent and disagreement protocol.
9. Implement agent relay racing: context monitoring, handover documents, fresh agent spawning.
10. Implement execution tools, patch engine, and execution-grounded verification.
11. Add context compaction, observation masking, and LSP integration.
12. Add baseline eval harness with cost and quality metrics.
13. Only then add cloud runner, IDE protocol, and enterprise features.

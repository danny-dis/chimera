# Chimera Terminal Coding Agent Blueprint

Status: initial architecture document
Last reviewed: 2026-05-13
Audience: contributors building a production-grade terminal-native AI coding agent

Chimera is a terminal-native, provider-neutral coding-agent platform. Its first release should behave like a polished single-agent CLI, while its architecture is intentionally prepared for multi-agent review, cloud execution, IDE integrations, and long-running autonomous software engineering tasks.

This document is intentionally implementation-oriented. It defines what to build, what to cut from the MVP, how the pieces fit, and which OSS patterns Chimera should adopt or avoid.

---

## 1. Product Vision

### Problem

Developers increasingly expect agents to read a repository, plan work, edit multiple files, run commands, test changes, and recover from failures. Existing tools are powerful but fragmented across IDE-first products, proprietary cloud agents, and terminal CLIs with different context, permission, and orchestration models.

Chimera solves this by providing a local-first terminal agent that can:

- ingest a repository and project instructions;
- build a compact codebase map;
- plan, edit, test, review, and commit changes;
- execute shell commands with explicit safety policies;
- resume long-running sessions;
- use multiple model providers;
- support autonomous loops with human approval checkpoints;
- later coordinate multiple agents that challenge each other before finalizing work.

### Target users

| User | Needs | Chimera value |
| --- | --- | --- |
| Solo developer | Fast terminal-native coding help | One CLI for ask, plan, code, debug, review, and commit |
| Senior engineer | Safer large refactors | planning, review, tests, rollback, and patch isolation |
| OSS maintainer | Contributor-like agent workflow | AGENTS.md-aware sessions, PR summaries, benchmark traces |
| Platform team | Governed automation | permission profiles, sandboxing, telemetry, audit logs |
| AI engineer | Extensible agent runtime | model registry, tool registry, evaluation harness, MCP support |

### Competitive landscape

- **Claude Code**: strong terminal-agent UX, plan mode, subagents, hooks, MCP, permission modes, session compaction.
- **OpenAI Codex CLI / Codex**: terminal and cloud coding workflows, sandboxed local execution, AGENTS.md conventions, PR-oriented flow.
- **Cursor Agent**: IDE-native agent with editor context and command execution.
- **Aider**: Git-first terminal pair programmer with a repo map and low-friction patch workflow.
- **OpenHands / OpenDevin**: research and production-oriented software-agent platform with runtime isolation, browser/terminal/file interactions, and event streams.
- **SWE-agent**: benchmark-driven agent-computer interface for issue resolution.
- **Continue**: open source CLI plus IDE extensions, reusable assistant configuration, rules, tools, and background agents.
- **Cline / Roo Code**: IDE agents with Plan/Act-style workflows, modes, MCP, browser use, shell execution, and checkpointing.
- **Bolt / bolt.diy**: browser-based full-stack app generation, useful for rapid greenfield application assembly.
- **Devin-style systems**: cloud-hosted autonomous execution with task queues, persistent environments, and issue/PR integrations.
- **OpenCode**: terminal-native OSS agent with LSP integration, provider flexibility, auto-compaction, and scriptable workflows.

### Key differentiators

1. **Terminal-first, not terminal-only**: the CLI is the canonical interface; IDE, web, and CI/CD integrations are clients on the same event protocol.
2. **Provider-neutral by design**: OpenAI, Anthropic, Google, OpenRouter, Ollama, Bedrock, Vertex, Azure, and OpenAI-compatible endpoints are model providers, not architectural dependencies.
3. **Evidence-first execution**: every claim must be backed by file citations, command output, diff hunks, test results, or explicit assumptions.
4. **Multi-agent-ready runtime**: the MVP ships as a reliable single-agent or dual-pass system, but the event protocol supports writer/reviewer/challenger roles and quorum decisions.
5. **Context engineering as a platform primitive**: repo maps, retrieval, compaction, session memory, and instruction hierarchy are first-class systems rather than prompt hacks.
6. **Local safety envelope**: tool permissioning, sandboxing, git checkpoints, and rollback are always enforced outside the model.

### Why terminal-native agents matter

The terminal is where real build, test, lint, git, package-manager, container, and deployment workflows already exist. A terminal agent can operate in any editor, inside SSH, on remote machines, in CI, and in containers. The CLI also provides a stable automation surface for headless workflows, GitHub Actions, cron jobs, and future cloud runners.

---

## 2. Competitive Research

Research date: 2026-05-13. Prefer official documentation and repositories when making implementation decisions. Third-party articles can inspire hypotheses, but they should not be treated as authoritative implementation references.

### Decision matrix

| Tool | Architecture pattern | Strengths to adopt | Weaknesses to avoid | Official references |
| --- | --- | --- | --- | --- |
| Claude Code | Local terminal agent with tools, subagents, hooks, MCP, permissions, compaction | plan mode, subagents, lifecycle hooks, CLAUDE.md-style project context, permission modes | proprietary internals; avoid provider lock-in and opaque policies | https://docs.claude.com/en/docs/claude-code/overview, https://docs.claude.com/en/docs/claude-code/hooks, https://code.claude.com/docs/en/sub-agents |
| OpenAI Codex CLI | Local terminal coding agent with sandbox/approval model and AGENTS.md conventions | AGENTS.md, sandbox + approval separation, patch flow, CLI automation, PR workflow | avoid overfitting to one model family or one hosted backend | https://github.com/openai/codex, https://developers.openai.com/codex/guides/agents-md |
| OpenAI Codex cloud | Cloud tasks with repo clone, tests, PRs, issue flow | long-running task infrastructure, auditable PR outputs, parallel task execution | cloud state can hide local environment drift; needs local parity | https://openai.com/index/introducing-codex/ |
| Cursor Agent | IDE-native agent with editor context and terminal execution | tight code navigation UX, inline edits, persistent editor context | terminal users should not need an IDE; avoid UI-coupled runtime | https://docs.cursor.com/agent/overview, https://docs.cursor.com/en/agent/terminal |
| Aider | Python terminal pair programmer with Git-first workflow and repo map | repo map, diff visibility, commits, simple CLI ergonomics | less suitable as a full multi-agent runtime without major rework | https://github.com/Aider-AI/aider, https://aider.chat/docs/repomap.html |
| OpenHands / OpenDevin | Generalist software-agent platform with runtime, terminal, browser, and event stream | event-driven architecture, runtime isolation, benchmark culture | can be heavier than needed for a focused terminal MVP | https://github.com/All-Hands-AI/OpenHands, https://www.all-hands.dev/ |
| SWE-agent | Research agent with explicit agent-computer interface and benchmark harness | constrained tools, issue-resolution evaluation, reproducible trajectories | UI/UX is benchmark-first rather than developer-first | https://github.com/SWE-agent/SWE-agent, https://arxiv.org/abs/2405.15793 |
| Continue | Open source CLI, IDE extensions, rules, MCP/tools, background agents | shared config across IDE/CLI, TUI + headless modes, CI checks | account/config complexity can hurt first-run UX | https://github.com/continuedev/continue, https://docs.continue.dev/index |
| Roo Code | VS Code extension with modes, custom modes, MCP, checkpoints | mode-specific behavior, custom rules, orchestrator mode, checkpoints | IDE-only core; project evolved quickly, so design against concepts not internals | https://github.com/RooCodeInc/Roo-Code |
| Cline | Editor agent with Plan/Act, browser, MCP, terminal, AST/search/file context | permission-per-step UX, MCP marketplace, browser-use patterns | too much manual approval can slow expert users | https://github.com/cline/cline, https://docs.cline.bot/introduction/welcome |
| Bolt / bolt.diy | Browser app builder using WebContainers and many providers | instant app preview, multi-provider web app generation | optimized for greenfield web apps, not arbitrary repo maintenance | https://github.com/stackblitz-labs/bolt.diy |
| Devin-style systems | Hosted autonomous software engineer with persistent environment and task integrations | remote execution, task queue, issue/Jira integration, long-horizon autonomy | trust, cost, environment reproducibility, and black-box behavior | https://docs.devin.ai/ |
| OpenCode | Terminal-native OSS agent with LSP and provider breadth | terminal-first TUI, LSP code intelligence, auto-compaction, scriptability | avoid hidden context bloat; keep policies explicit | https://github.com/opencode-ai/opencode, https://opencode.ai/ |
| Goose | Local desktop/CLI automation agent with MCP extensions | MCP ecosystem, local automation, provider flexibility | broader automation scope can dilute coding-agent UX | https://github.com/block/goose |
| Pi | TypeScript agent harness and terminal coding-agent foundation | modular agent runtime, provider abstraction, TUI packages | verify maturity before committing as sole foundation | https://github.com/earendil-works/pi |

### Foundation recommendation

For the first production-grade Chimera release, build a **new TypeScript core** instead of hard-forking a full existing agent product. Reuse ideas, protocols, and selected libraries from the ecosystem, but keep Chimera's orchestration, policy engine, context engine, and event schema under our control.

Decision:

- **Primary implementation**: TypeScript monorepo for CLI, runtime, provider adapters, context, tools, TUI, and eval harness.
- **Reuse by reference**: adopt Aider's repo-map/Git ergonomics, OpenCode's LSP/terminal patterns, Continue's TUI/headless split, OpenHands' event-stream/runtime separation, SWE-agent's constrained agent-computer interface, and Claude/Codex-style permission and instruction conventions.
- **Potential code-level starting points**: evaluate Pi and OpenCode if their licenses, module boundaries, and governance match the desired contributor model; otherwise use them as architecture references.
- **Avoid**: starting from an IDE-only extension or a benchmark-first research harness as the canonical runtime, because Chimera's core must remain terminal-native, provider-neutral, and UI-independent.

Why this wins: it minimizes inherited product constraints while preserving the best proven patterns from existing OSS agents. It also prevents early architectural lock-in before Chimera's multi-agent protocol, permission engine, and context pipeline are stable.

### Lessons to adopt

- **From Claude Code**: lifecycle hooks, plan mode, subagents, compact/resume flows, and mode-specific permissions.
- **From Codex**: AGENTS.md hierarchy, local sandboxing, approvals, issue/PR lifecycle, and cloud/local parity.
- **From Aider**: repo map, Git-first changes, diff-before-commit, and user-friendly terminal ergonomics.
- **From OpenHands**: event stream, runtime abstraction, and environment isolation.
- **From SWE-agent**: the tool interface matters as much as the model; constrain navigation and edit actions.
- **From Continue**: reusable assistant configs and TUI/headless split.
- **From Roo/Cline**: modes, explicit Plan/Act transitions, MCP tools, browser use, and checkpoints.
- **From OpenCode**: LSP indexing, auto-compaction, and terminal-native extensibility.

### Lessons to avoid

- Do not create a three-agent committee for trivial tasks.
- Do not let the model decide its own security boundary.
- Do not rely only on vector search; combine lexical, structural, LSP, git, and model summaries.
- Do not hide patches from users.
- Do not store secrets, prompts, or telemetry without clear local policy.
- Do not bind the runtime to one UI surface.
- Do not ship autonomy before deterministic rollback and budget controls exist.

---

## 3. Technical Architecture

### High-level architecture

```text
+------------------------------+
|        Chimera CLI/TUI        |
| prompt, mode, diff, logs      |
+---------------+--------------+
                |
                v
+---------------+--------------+
|       Session Orchestrator    |
| state machine, events, policy |
+----+----------+----------+----+
     |                     |
     v                     v
+----+---------+     +-----+----------------+
| Agent Runtime|     | Context Engine       |
| plan/act/rev |<--->| repo map, RAG, memory|
+----+---------+     +-----+----------------+
     |                     |
     v                     v
+----+---------------------+----+
|          Tool Registry        |
| fs, shell, git, edit, tests,  |
| search, LSP, MCP, browser     |
+----+---------------------+----+
     |                     |
     v                     v
+----+---------+     +-----+----------------+
| Sandbox/Exec |     | Persistence          |
| pty, docker, |     | event log, patches,  |
| worktrees    |     | summaries, metrics   |
+--------------+     +----------------------+
```

### Component boundaries

| Component | Responsibility | Must not do |
| --- | --- | --- |
| CLI/TUI | render user interaction, collect approvals, stream events | own agent state or provider-specific logic |
| Session orchestrator | state machine, event log, mode policy, retries, budget, quorum | call tools without policy checks |
| Agent runtime | prompt assembly, model calls, structured outputs, tool-call interpretation | directly mutate files outside tool layer |
| Context engine | repo index, retrieval, instruction hierarchy, compaction, memory | trust unverified generated summaries as facts |
| Tool registry | typed tool schemas, permission metadata, execution adapters | bypass sandbox or policy engine |
| Patch engine | apply diffs, validate hunks, rollback, stage commits | let models write arbitrary files without validation |
| Sandbox/exec | PTY, command limits, env filtering, docker/worktree isolation | expose secrets by default |
| Persistence | sessions, event stream, artifacts, metrics, replay | store sensitive data without redaction policy |
| Evaluation harness | benchmark tasks, replay trajectories, scoring, regression suites | mutate developer workspace by default |

### Event-driven data flow

```text
User request
  -> classify_task
  -> load_project_instructions
  -> index_repo / refresh_repo_map
  -> build_context_pack
  -> plan
  -> review_plan
  -> request_user_approval_if_required
  -> execute_tools / edit_patch
  -> run_checks
  -> review_diff
  -> repair_if_needed
  -> final_response + optional commit/PR
```

Core event types:

```ts
type ChimeraEvent =
  | { type: "user_request"; text: string; mode: Mode }
  | { type: "context_pack_created"; files: string[]; tokenEstimate: number }
  | { type: "plan_proposed"; plan: Plan; risks: Risk[] }
  | { type: "tool_call_requested"; call: ToolCall; policy: PermissionDecision }
  | { type: "tool_call_result"; result: ToolResult }
  | { type: "patch_proposed"; patchId: string; files: string[] }
  | { type: "check_result"; command: string; exitCode: number; outputRef: string }
  | { type: "review_finding"; severity: "blocker" | "warning" | "note"; evidence: Evidence[] }
  | { type: "session_compacted"; summaryRef: string }
  | { type: "final_response"; status: "done" | "blocked" | "needs_user" };
```

### Agent runtime

The runtime is a deterministic state machine around probabilistic model calls.

```text
Observe -> Orient -> Plan -> Act -> Verify -> Reflect -> Report
          ^                         |
          +-------- repair ---------+
```

Runtime responsibilities:

- normalize model/provider APIs;
- build layered prompts;
- enforce structured output schemas;
- parse tool calls;
- maintain working memory;
- decide whether to continue, ask, or stop;
- emit events for every decision;
- support future roles: writer, reviewer, challenger, planner, summarizer.

### Orchestration engine

MVP orchestration should support a single active coding agent with optional deterministic review pass. The architecture should already support multi-agent roles.

Modes:

| Mode | Default tools | Default autonomy | Agent count |
| --- | --- | --- | --- |
| `ask` | read-only search/files/git status | low | 1 |
| `plan` | read-only search/files/git status | low | 1 |
| `ultraplan` | read-only, deeper indexing, optional web/MCP | low | 1-3 later |
| `code` | edit, shell, git diff, tests | medium | 1 now, 2 later |
| `debug` | shell, tests, logs, edit | medium | 1 now, 2 later |
| `review` | git diff, tests, read-only files | low | 1-2 |
| `oal` | configurable loop with hard budgets | high but bounded | 1 now, 2-3 later |

### Failure handling and retry logic

| Failure | Detection | Mitigation |
| --- | --- | --- |
| Invalid structured output | schema validation fails | ask model to repair JSON once; then reduce prompt and retry |
| Tool timeout | command timer expires | terminate process group; summarize partial output; ask or choose smaller command |
| Patch does not apply | hunk validation fails | re-read file, regenerate patch against current content |
| Tests fail | non-zero exit or failure pattern | classify failure as introduced/pre-existing/infra; repair only introduced failures |
| Context overflow | token estimator exceeds budget | compress history, use repo map, retrieve narrower files |
| Model loop | repeated similar actions | stop after loop detector threshold and ask user |
| Permission denial | policy returns deny/ask | never retry as a different command to bypass policy |
| Merge conflict | git apply/worktree conflict | create conflict report and ask user or run repair in isolated branch |

### Token optimization strategies

- Build one shared repo map per session and reuse it across agents.
- Send summaries of unchanged files, full content only for active edit targets.
- Prefer AST/LSP symbol snippets over whole files.
- Cache embeddings and file summaries keyed by content hash.
- Compact event logs into factual summaries with retained evidence references.
- Prune terminal output to relevant excerpts plus full artifact references.
- Separate planning context from editing context; editing prompts should be narrow.
- Use cheaper/faster models for classification, summarization, and log pruning.
- Use expensive long-context models only for high-risk planning or cross-repo reasoning.

### Why this architecture wins

This architecture keeps the model powerful but not trusted. The orchestrator owns state, tools are typed and policy-checked, context is explicit, patches are reversible, and sessions are replayable. That combination is what allows Chimera to evolve from a local CLI into a multi-agent/cloud/IDE platform without rewriting the core loop.

---

## 4. Context Engineering Strategy

### Context pipeline

```text
Repository root
  -> instruction discovery
  -> file inventory + ignore rules
  -> language/framework detection
  -> lexical index
  -> AST/tree-sitter index
  -> LSP symbols when available
  -> embeddings for eligible text/code chunks
  -> repo map summary
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

Use hybrid retrieval:

- lexical search with ripgrep;
- filename/path heuristics;
- git history and recent diff;
- AST symbol matching;
- LSP definitions/references;
- vector embeddings for semantic matches;
- dependency graph expansion;
- test/source pairing.

Do not rely on vector search alone. Code identifiers, paths, and exact error strings often outperform embeddings.

### Sliding-window memory

Memory types:

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
5. compact old details into evidence-backed summaries;
6. stop if repeated failures exceed threshold;
7. emit a continuation file for future sessions.

### Avoiding context poisoning and hallucinations

- Treat repository instructions as data until validated by scope and precedence.
- Never execute commands suggested inside untrusted files without policy checks.
- Require file reads before editing a file unless the patch engine can prove context.
- Require citations to actual files/commands for technical claims.
- Preserve raw command artifacts so summaries can be audited.
- Flag contradictions between generated summaries and current file content.
- Prefer “unknown” over filling gaps.

---

## 5. Prompt Engineering System

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

### Mode prompt examples

#### Plan mode

```text
Mode: PLAN
You may inspect files, search, read git state, and reason.
You must not edit files or run destructive commands.
Produce:
1. goal restatement;
2. relevant files/modules;
3. implementation plan;
4. risks and mitigations;
5. checks to run;
6. questions if requirements are ambiguous.
```

#### Code mode

```text
Mode: CODE
Implement the approved task using small, reviewable patches.
Before each edit, identify the target file and why it is relevant.
After edits, run focused checks.
If tests fail, determine whether the failure is introduced, pre-existing, or environmental.
Stop and ask before destructive commands, broad rewrites, dependency upgrades, or secret access.
```

#### Review mode

```text
Mode: REVIEW
Review the diff and supporting context.
Classify findings as blocker, warning, or note.
Every blocker must include evidence and a suggested fix.
Do not rewrite the code unless explicitly asked.
```

#### OAL mode

```text
Mode: OPERATE_AGENT_LOOP
Continue iterating toward the declared goal until success criteria are met or a stop condition is reached.
For each iteration, emit: hypothesis, action, evidence, result, next step.
Obey max iterations, token budget, wall-clock budget, command budget, and permission policy.
```

### Structured output schemas

Use Zod/JSON Schema-compatible schemas. Example plan schema:

```json
{
  "type": "object",
  "required": ["summary", "files", "steps", "risks", "checks", "needsUser"],
  "properties": {
    "summary": { "type": "string" },
    "files": { "type": "array", "items": { "type": "string" } },
    "steps": { "type": "array", "items": { "type": "string" } },
    "risks": { "type": "array", "items": { "type": "string" } },
    "checks": { "type": "array", "items": { "type": "string" } },
    "needsUser": { "type": "boolean" }
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
- failure analyses.

The internal model reasoning can remain hidden; the system output should be auditable without requiring chain-of-thought.

### Recovery prompts

Use targeted recovery prompts:

- **JSON repair**: “Return only valid JSON for the same schema.”
- **Patch repair**: “The patch failed because hunk X did not match current file. Re-read the file and produce a minimal replacement.”
- **Test failure**: “Classify this failure using observed output only; propose the smallest next diagnostic.”
- **Loop break**: “You repeated the same failing action twice. Produce a new hypothesis or stop.”

---

## 6. Tooling Layer

### Tool categories

| Tool family | MVP? | Examples | Notes |
| --- | --- | --- | --- |
| Filesystem | yes | read, write via patch, list, stat | edits go through patch engine |
| Search | yes | ripgrep, glob, semantic search later | lexical first |
| Shell | yes | run command with PTY/non-PTY | timeout and env filtering required |
| Git | yes | status, diff, apply, stage, commit, checkout, worktree later | checkpoint before risky work |
| Patch engine | yes | apply unified diff, replace range, rollback | validate against current content |
| Test runner | yes | npm test, pytest, cargo test, go test, custom | command discovery plus user config |
| LSP | later v1 | definitions, references, diagnostics | not MVP critical but high leverage |
| Browser | later | fetch docs, Playwright | use allowlists and network policy |
| Docker/container | later | isolated exec, devcontainer | important for production hardening |
| MCP | v1 | configured servers/tools | per-tool permission metadata |
| Evaluation | MVP-lite | replay task, store trajectory | grows in phase 5 |

### Permission profiles

| Profile | Read files | Write files | Shell | Network | Best for |
| --- | --- | --- | --- | --- | --- |
| `read-only` | yes | no | safe read commands | no/default deny | ask/plan/review |
| `ask-before-write` | yes | ask | ask | ask | default first-run |
| `workspace-write` | yes | yes in repo | ask for risky | ask | normal coding |
| `trusted-project` | yes | yes | allow allowlisted | allow allowlisted | experienced users |
| `danger-full-access` | yes | yes | yes | yes | CI/sandbox only |

### Secure execution

- All tool calls pass through policy checks.
- Shell commands run with timeout, output cap, cwd restriction, and env redaction.
- Destructive patterns require approval: `rm -rf`, `git reset --hard`, force pushes, package publishes, credential commands, broad chmod/chown, and network exfiltration commands.
- Secrets are redacted in logs using pattern detectors and known env names.
- The model cannot alter its own permission profile.
- Tool outputs are stored as artifacts and summarized separately.

---

## 7. MVP Definition

### Smallest usable product

The MVP should be a reliable terminal agent that can safely complete small-to-medium coding tasks in an existing repo.

MVP features:

1. CLI with interactive TUI-lite and one-shot command mode.
2. Provider registry for at least OpenAI-compatible, Anthropic-compatible, and Google-compatible APIs.
3. Modes: `ask`, `plan`, `code`, `debug`, `review`.
4. Project instruction discovery for `AGENTS.md` and `.chimera/rules.md`.
5. Repo inventory and simple repo map.
6. Read/search/edit/shell/git/test tools with permission profiles.
7. Patch engine with diff preview and rollback.
8. Session event log and resume.
9. Context compaction for long sessions.
10. Basic evaluation harness with replayable sample tasks.

### Explicitly cut from MVP

Cut these until the core loop is excellent:

- three-agent quorum;
- cloud execution;
- IDE extension;
- browser automation;
- voice;
- distributed execution;
- RL loops;
- plugin marketplace;
- full LSP integration;
- automatic PR creation;
- complex vector DB deployment.

### Technical shortcuts allowed

- Use SQLite for session storage and local indexes.
- Use in-process orchestration before distributed workers.
- Use ripgrep and tree-sitter before LSP.
- Use local embedding cache with SQLite vector extension or LanceDB instead of hosted vector infra.
- Use unified diff and range replace before building a CRDT editor.
- Use a simple React/Ink or Textual TUI before a full terminal UI framework.

### MVP success criteria

- Can answer repo questions with cited files.
- Can implement a small multi-file change and show a clear diff.
- Can run project tests or explain why not.
- Can recover from a failed patch or failed test once.
- Can resume a previous session.
- Can operate safely under read-only and workspace-write policies.
- Can produce an auditable trajectory for evaluation.

---

## 8. Implementation Roadmap

### Phase 1: Foundational scaffolding

Goals:

- establish repo structure, packages, CLI entrypoint, config, logging, and docs.

Tasks:

- choose primary language and package manager;
- create monorepo packages;
- implement config loading;
- add command router;
- add structured logging;
- add session directory layout;
- add contribution docs and ADR template.

Suggested libraries:

- TypeScript: `commander` or `clipanion`, `zod`, `pino`, `execa`, `ink` or `blessed`, `better-sqlite3`.
- Python alternative: `typer`, `pydantic`, `textual`, `sqlite-utils`, `rich`.
- Rust alternative: `clap`, `ratatui`, `tokio`, `serde`, `rusqlite`.

Risks:

- overbuilding UI before runtime;
- choosing a language that slows model-provider iteration.

Deliverables:

- `chimera --help`;
- config schema;
- package skeleton;
- architecture docs.

### Phase 2: Core agent runtime

Goals:

- implement model adapters, prompt assembly, schemas, basic tool loop.

Tasks:

- provider abstraction;
- streaming responses;
- structured output validation;
- agent loop state machine;
- tool-call parser;
- permission engine;
- event log.

Dependencies:

- config, logging, tool schema primitives.

Risks:

- provider-specific quirks leaking into core runtime;
- unbounded loops.

Deliverables:

- `ask` and `plan` modes;
- model registry;
- deterministic event trace.

### Phase 3: Context and retrieval systems

Goals:

- make the agent useful in real repos without dumping all files into context.

Tasks:

- file inventory;
- ignore rules;
- instruction discovery;
- ripgrep search;
- tree-sitter parsing;
- repo map summaries;
- embedding cache;
- context packer;
- compaction pipeline.

Suggested libraries:

- `ignore`, `glob`, `tree-sitter`, `ripgrep`, `sqlite-vec`, `lancedb`, provider embedding APIs.

Risks:

- stale summaries;
- vector-only hallucinations;
- token bloat.

Deliverables:

- repo map;
- context pack debug view;
- compaction event.

### Phase 4: Autonomous execution loop

Goals:

- enable safe multi-file editing, command execution, tests, repair, and review.

Tasks:

- patch engine;
- file write controls;
- shell execution;
- git checkpointing;
- test command discovery;
- failure classification;
- `code`, `debug`, and `review` modes;
- initial `oal` with budgets.

Dependencies:

- permission engine, event log, context packer.

Risks:

- destructive commands;
- failed patch application;
- flaky test interpretation.

Deliverables:

- implement small bug fixes end-to-end;
- rollback command;
- review diff report.

### Phase 5: Evaluation and benchmarking

Goals:

- measure regressions, cost, latency, reliability, and task success.

Tasks:

- trajectory replay;
- fixture repos;
- synthetic tasks;
- SWE-bench Lite adapter;
- mutation/regression tasks;
- scoring rubric;
- benchmark dashboard.

Dependencies:

- event storage and isolated execution.

Risks:

- benchmark overfitting;
- nondeterminism from model/provider changes.

Deliverables:

- `chimera eval run`;
- metrics report;
- failure taxonomy.

### Phase 6: Developer UX polish

Goals:

- make Chimera feel better than raw model chat.

Tasks:

- TUI timeline;
- diff viewer;
- mode switching;
- command palette;
- session browser;
- compact progress display;
- setup wizard;
- docs and examples.

Risks:

- hiding too much agent state;
- making advanced controls hard to discover.

Deliverables:

- polished interactive CLI;
- docs site seed;
- demo recordings.

### Phase 7: Production hardening

Goals:

- prepare for teams, CI, cloud, and enterprise environments.

Tasks:

- sandbox profiles;
- Docker/devcontainer runner;
- MCP governance;
- audit logs;
- telemetry opt-in;
- secret redaction;
- policy files;
- crash recovery;
- cloud runner prototype;
- IDE protocol prototype.

Risks:

- policy complexity;
- enterprise requirements delaying OSS velocity.

Deliverables:

- hardened local release;
- CI/headless mode;
- cloud-runner design doc.

---

## 9. OSS Stack Recommendations

### Language decision matrix

| Criterion | TypeScript | Python | Rust |
| --- | --- | --- | --- |
| Provider SDK ecosystem | excellent | excellent | moderate |
| CLI/TUI speed | good | good | excellent |
| Agent iteration speed | excellent | excellent | moderate |
| Packaging | moderate | moderate | excellent binary story |
| Web/IDE reuse | excellent | moderate | moderate |
| Data/ML ecosystem | good | excellent | moderate |
| Safety/performance | good | moderate | excellent |
| Contributor familiarity | high | high | moderate |

Recommendation: **TypeScript first**, with Rust optional later for sandbox/execution helpers and Python optional for evaluation adapters. TypeScript best matches modern agent UIs, provider SDKs, MCP tooling, and cross-platform CLI development speed.

### Recommended stack

| Layer | Recommendation | Alternatives |
| --- | --- | --- |
| CLI | `commander`, `clipanion`, or `oclif` | `clap` in Rust, `typer` in Python |
| TUI | `ink` for React-style UI; `blessed` for lower-level terminal UI | `ratatui`, `textual` |
| Schemas | `zod` | JSON Schema, TypeBox |
| Process exec | `execa`, node PTY for interactive commands | Python `subprocess`/`pexpect`, Rust `tokio::process` |
| Git | shell `git` plus wrapper | `isomorphic-git` for limited cases |
| Search | `ripgrep` | custom walker only as fallback |
| Parsing | `tree-sitter` | language-specific parsers |
| LSP | `vscode-languageserver-protocol` client | defer until v1 |
| Storage | SQLite + content-addressed artifacts | DuckDB for analytics, Postgres for cloud |
| Vector | `sqlite-vec` or LanceDB | Qdrant/Weaviate for team/cloud |
| Embeddings | provider embeddings + local cache | Voyage, Jina, OpenAI, Gemini, local models |
| Eval | custom harness + SWE-bench adapter | OpenHands/SWE-agent harnesses |
| MCP | official MCP SDKs | custom JSON-RPC only if necessary |
| Sandbox | git worktrees + command policy first; Docker later | Firecracker/gVisor for cloud |

### Build on top of existing OSS?

Preferred strategy:

1. **Study and borrow patterns from Pi, Aider, OpenCode, Continue, OpenHands, SWE-agent, Cline, and Roo.**
2. **Do not fork a large project for the MVP unless the license, architecture, and governance match exactly.**
3. **Use libraries and protocols rather than inheriting a full product UX.**

If a foundation is required, Pi and OpenCode are the closest terminal-native candidates. Aider is excellent for Git/repo-map ideas but less ideal as a multi-agent orchestration base. OpenHands is powerful for cloud/runtime research but likely too heavy for the first terminal-native MVP.

---

## 10. Evaluation & Benchmarking

### Benchmark categories

| Category | Example | Metric |
| --- | --- | --- |
| Repo Q&A | “Where is auth enforced?” | answer correctness, citation accuracy |
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
- user-intervention count.

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
- score and judge notes.

### Failure analysis workflow

1. Reproduce with saved trajectory.
2. Classify failure: localization, planning, context, patching, tool, test interpretation, model refusal, permission, benchmark flaw.
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

Avoid leaderboard chasing as the primary product metric. Optimize for developer usefulness and safe task completion in real repos.

---

## 11. Collaboration & Open Source Structure

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

### Architecture Decision Records

Use ADRs for:

- language/runtime choice;
- provider abstraction;
- session storage format;
- patch strategy;
- sandbox model;
- vector store;
- multi-agent quorum design;
- cloud execution architecture.

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

- Bug report with environment, command, model, permission profile, session ID.
- Feature request with user story and safety impact.
- Tool integration request with permissions and threat model.
- Evaluation regression with task spec and trajectory.
- Documentation improvement.

### PR workflow

- Run unit tests, lint, typecheck.
- Run minimal eval suite for runtime/prompt/context changes.
- Include before/after trajectory snippets for agent-behavior changes.
- Update docs and ADRs when architecture changes.
- Keep generated benchmark artifacts out of normal PRs unless explicitly needed.

Best-practice references:

- OpenAI Codex repo: https://github.com/openai/codex
- Continue repo: https://github.com/continuedev/continue
- OpenHands repo: https://github.com/All-Hands-AI/OpenHands
- SWE-agent repo: https://github.com/SWE-agent/SWE-agent
- Aider repo: https://github.com/Aider-AI/aider

---

## 12. Security & Safety

### Threat model

| Threat | Example | Mitigation |
| --- | --- | --- |
| Prompt injection from repo | malicious README asks agent to leak secrets | instruction hierarchy, untrusted-content labeling, permission checks |
| Secret exfiltration | command prints `.env` or sends token to network | redaction, network policy, file allowlists |
| Destructive command | `rm -rf`, `git reset --hard` | approval gates, sandbox, git checkpoint |
| Supply-chain attack | agent installs package blindly | package install approval and lockfile diff review |
| Tool confusion | model calls wrong tool or path | schemas, cwd display, confirmation for broad paths |
| Context poisoning | stale generated summary contradicts code | content-hash invalidation, source citations |
| Infinite autonomy | OAL loops forever | hard budgets, loop detection, stop conditions |
| Privilege escalation | MCP server performs hidden action | MCP permission metadata and per-server allowlists |

### Sandboxing layers

1. **Policy layer**: mode and permission profile decide whether a tool call is allowed.
2. **Workspace layer**: restrict file writes to repo/worktree by default.
3. **Process layer**: command timeout, output cap, env filtering, process-group kill.
4. **Git layer**: checkpoint commits and rollback.
5. **Container layer**: Docker/devcontainer for high-risk or CI runs.
6. **Network layer**: default-deny or allowlist for sensitive environments.

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

---

## 13. Future Expansion

### Multi-agent systems

Roles:

| Role | Responsibility |
| --- | --- |
| Writer | implements patch |
| Reviewer | continuously checks correctness, tests, and maintainability |
| Challenger | attacks assumptions, proposes alternatives, checks edge cases |
| Planner | decomposes tasks and chooses strategy |
| Researcher | gathers repo/documentation context |
| Summarizer | compacts sessions and context packs |

Decision rules:

- solo for low-risk tasks;
- writer + reviewer for normal coding;
- writer + reviewer + challenger for security, auth, migrations, large refactors;
- 2-of-3 quorum required for trio approval;
- unresolved material dissent is shown to the user.

Parallelism:

- agents share a context service;
- exploratory patches happen in git worktrees;
- reviewer can consume streamed patch checkpoints while writer edits;
- orchestrator serializes final patch application.

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
2. label failure modes;
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
- command-risk classifiers.

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
- CI/CD integration.

---

## Prioritized next steps

1. Create the monorepo scaffold and CLI package.
2. Implement config, model registry, and provider abstraction.
3. Implement event log and permission engine.
4. Implement read/search/git/shell tools under policy.
5. Implement `ask` and `plan` modes.
6. Implement patch engine and `code` mode.
7. Implement tests, rollback, and review mode.
8. Add context compaction and session resume.
9. Add baseline eval harness.
10. Only then add dual-agent review and later trio quorum.

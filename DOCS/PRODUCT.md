# Chimera Product Contract

## Definition

Chimera is an **independent terminal-native coding agent**, comparable in user-facing simplicity to modern coding agents such as Claude Code and Codex.

The user interacts with one coding agent. Internally Chimera may use one model or a coordinated set of models and workers. This is the product's core abstraction:

> **One coding agent. Many brains.**

## Core promise

Given a coding task, Chimera should:

1. understand the request and repository;
2. choose an appropriate execution strategy;
3. select the best available model/provider portfolio for the task;
4. inspect, edit and execute safely;
5. test and verify the result;
6. repair failures when possible;
7. return one coherent result with evidence.

## Independence

The core product MUST build and run without ATHENA, DMR-X, Ghost Factory, Sovereign Mind/SMS, or any other external project.

Those systems can consume Chimera through APIs, CLI, SDKs, MCP, A2A, or provider adapters. Chimera must not contain product-specific knowledge of them.

## UX principles

- **Zero-config first:** the normal path is simply `chimera "do this"`.
- **One agent illusion:** internal workers are implementation detail unless the user asks for visibility.
- **Progressive disclosure:** advanced users can inspect strategy, agents, models, costs and evidence.
- **Evidence over claims:** tests and tool results determine completion status.
- **Safe by default:** permissions and dangerous actions are explicit.
- **Fast when possible:** do not pay orchestration overhead for trivial work.
- **Cheap when possible:** use the least expensive capable model or local model.
- **Strong when necessary:** escalate strategy/model quality as task risk and complexity rise.

## Execution modes

`auto` is the default. Chimera dynamically chooses between:

- solo execution;
- sequential pipeline;
- parallel race;
- Duo;
- Trio;
- debate/adjudication;
- repair loops;
- larger coordinated runs for unusually difficult or high-risk tasks.

Users may explicitly request a strategy, but explicit strategy is an override rather than the default mental model.

## Advanced controls

Examples:

```bash
chimera "refactor authentication"
chimera --strategy auto "fix the failing tests"
chimera --strategy trio "redesign the cache layer"
chimera --model provider/model "implement the endpoint"
chimera --budget 2.00 "fix and verify the regression"
chimera --resume <session-id>
```

Exact command availability is implementation-dependent; documentation must not advertise commands before they are implemented.

## What Chimera owns

- coding-agent behavior;
- task understanding and decomposition;
- repository intelligence;
- context engineering;
- model/provider selection;
- execution strategies;
- agent lifecycle;
- tool execution;
- worktree/sandbox isolation;
- verification and evidence;
- durable sessions;
- cost/latency/quality optimization;
- CLI/TUI/IDE/API surfaces.

## What Chimera does not own

- sovereign orchestration of an unrelated agent ecosystem;
- general personal-assistant functionality;
- external system memory as a required dependency;
- a particular inference gateway;
- a particular model vendor;
- MCP/A2A as the internal runtime model.

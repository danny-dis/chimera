# GitHub Repo Research: AI-Powered Software Factory Assessment

**Date:** 2026-08-17
**Context:** Evaluating projects relevant to building a "Ghost Factory" (AI-powered software factory)

---

## 1. openai/symphony
- **What it does:** OpenAI's orchestration layer that monitors a Linear board for work, spawns isolated coding agents (Codex) to handle tasks, and lands PRs when accepted. Engineers manage *work* rather than supervising agents. Includes CI status, PR review feedback, complexity analysis, and walkthrough videos as proof of work.
- **Real or vaporware:** **REAL, actively maintained.** 26,708 stars, 2,726 forks, 9 open issues. Last commit: 2026-08-12. Apache 2.0. Elixir-based reference implementation. Warning: "low-key engineering preview for testing in trusted environments."
- **Relevance to Ghost Factory:** **HIGH.** This is the canonical "software factory" orchestrator from OpenAI. Directly implements the pattern: work → isolated agent runs → proof of work → merge. The SPEC.md is worth studying. Limitation: tightly coupled to Linear + Codex; you'd need to adapt for other tools.

---

## 2. coleam00/Archon
- **What it does:** Open-source "harness builder" for AI coding. Define development processes as YAML workflows (planning → implementation → validation → code review → PR creation). Runs them deterministically across projects. Every workflow run gets its own git worktree for isolation. Think "n8n for software development" or "GitHub Actions for AI coding."
- **Real or vaporware:** **REAL, very actively maintained.** 23,220 stars, 3,461 forks, 257 open issues. Last commit: 2026-08-17 (today). MIT license. TypeScript/Bun. Has CI, docs site (archon.diy).
- **Relevance to Ghost Factory:** **HIGH.** This is the workflow engine that powers the "Dark Factory Experiment" (#7). It's the most mature open-source harness for deterministic AI coding workflows. Directly usable as the orchestration backbone of a Ghost Factory.

---

## 3. abhigyanpatwari/GitNexus
- **What it does:** Client-side code intelligence engine. Indexes any codebase (GitHub, GitLab, Azure, local, ZIP) into a knowledge graph — every dependency, call chain, cluster, and execution flow — entirely in the browser. Exposes it through MCP tools so AI agents have perfect code context. Includes a Graph RAG Agent for code exploration.
- **Real or vaporware:** **REAL, actively maintained.** 45,463 stars, 5,033 forks, 311 open issues. Last commit: 2026-08-16. PolyForm Noncommercial license (NOT open source for commercial use). TypeScript. Has CI, Discord, web UI.
- **Relevance to Ghost Factory:** **MEDIUM-HIGH.** Not a factory itself, but provides the "nervous system" — the code intelligence layer that prevents agents from getting lost in large codebases. The MCP integration is directly useful. **Caveat:** Noncommercial license means you can't use it in a commercial Ghost Factory without permission.

---

## 4. fabro-sh/fabro
- **What it does:** Self-described "open source dark software factory for expert engineers." Define your development process as a graph, let agents execute it, intervene only where it matters. Features: verification gates, ensemble intelligence (combine models from different vendors — one to implement, one to cross-critique, one to summarize), version-controlled workflows as code. Runs as a server with web UI.
- **Real or vaporware:** **REAL, actively maintained.** 1,514 stars, 162 forks, 72 open issues. Last commit: 2026-08-14. MIT license. Rust. Has CI, docs (docs.fabro.sh), Discord.
- **Relevance to Ghost Factory:** **HIGH.** This is the closest thing to a complete, opinionated "dark factory" product. The graph-based workflow definition and ensemble intelligence are differentiators. The Rust implementation suggests performance focus. Directly usable as a Ghost Factory core.

---

## 5. foundatron/octopusgarden
- **What it does:** Autonomous software development system. You describe what you want (specs) and how to verify it (scenarios). Orchestrates AI coding agents that generate, test, and iterate until convergence — without human code review. Key innovation: scenarios are a **holdout set** the coding agent never sees; an LLM judge scores satisfaction probabilistically (0-100), preventing reward hacking.
- **Real or vaporware:** **REAL but STALLED.** 57 stars, 8 forks, 3 open issues. Last commit: 2026-03-18 (5 months ago). MIT license. Go. Has CI. Explicitly builds on StrongDM's Attractor (#6) and cites Ouroboros (#8) as inspiration.
- **Relevance to Ghost Factory:** **MEDIUM.** The holdout-set / LLM-judge pattern is genuinely interesting for quality assurance in a Ghost Factory. But the project appears abandoned (no commits since March). The ideas are worth borrowing; the code may not be production-ready.

---

## 6. strongdm/attractor
- **What it does:** NLSpec (Natural Language Spec) repository for building your own "Attractor" — a non-interactive coding agent sufficient for use in a Software Factory. Contains three specs: Attractor Specification, Coding Agent Loop Specification, Unified LLM Client Specification. You feed these specs to a coding agent (Claude Code, Codex, OpenCode, etc.) to build your own implementation.
- **Real or vaporware:** **REAL but STALLED.** 1,269 stars, 196 forks, 2 open issues. Last commit: 2026-03-17 (5 months ago). Apache 2.0. No code language (spec-only repo). StrongDM's production system validates this pattern.
- **Relevance to Ghost Factory:** **MEDIUM-HIGH.** This is the *specification* behind the software factory pattern. StrongDM's production system demonstrates that AI-generated code can pass rigorous QA without human review. The specs are directly usable as design documents for a Ghost Factory. **Caveat:** Not a tool you install — it's a spec you implement.

---

## 7. coleam00/dark-factory-experiment
- **What it does:** A public "Dark Factory" experiment. A working web app (RAG chat over YouTube transcripts) that is built, reviewed, and merged almost entirely by AI coding agents. Humans file issues and promote releases; everything else (triage, implementation, code review, testing, merging) is handled by Archon workflows on a cron. Runs at "level 4" (doesn't write its own issues) with a human-authored perimeter it cannot touch (auth, rate limiting, deploy configs, governance files).
- **Real or vaporware:** **REAL, actively maintained.** 121 stars, 35 forks, 1 open issue. Last commit: 2026-08-14. No license specified. Python. Uses Archon as the harness.
- **Relevance to Ghost Factory:** **HIGH.** This is the most concrete, working example of a "dark factory" pattern. The FACTORY_RULES.md, holdout/mutation testing, and ratchet mechanisms are directly applicable. It's a reference implementation you can study and fork.

---

## 8. Q00/ouroboros
- **What it does:** "Agent OS" — an agent that gets smarter on its own. Runs, fails, and gets smarter every generation. The grading command and expected result never make it into the success contract (prevents reward hacking). MCP server with 13 runtimes: Claude Code, Codex CLI, Gemini CLI, OpenCode, Copilot, Kiro, and more. Interview-gated, staged evaluation, budgeted evolution loop.
- **Real or vaporware:** **REAL, very actively maintained.** 5,494 stars, 554 forks, 65 open issues. Last commit: 2026-08-17 (today). MIT license. Python. Has CI, PyPI package, sponsors.
- **Relevance to Ghost Factory:** **HIGH.** The self-improving agent loop and multi-runtime MCP server are directly useful. The "budgeted evolution loop" and staged evaluation are patterns for keeping a Ghost Factory from running away. The 13-runtime support means it can orchestrate diverse agents.

---

## 9. DUBSOpenHub/dark-factory
- **What it does:** A GitHub Copilot CLI skill that turns a short free-text goal into a production-grade pull request. Isolates work in a disposable git worktree, orchestrates eight specialist agents from different model families, and measures quality with "sealed-envelope testing" — builders never see the hidden acceptance suite, and the suite is never written by a mind that thinks like theirs.
- **Real or vaporware:** **REAL but minimally maintained.** 21 stars, 3 forks, 1 open issue. Last commit: 2026-07-28. MIT license. TypeScript. Has CI, website.
- **Relevance to Ghost Factory:** **MEDIUM.** The sealed-envelope testing pattern is interesting (prevents agents from gaming their own tests). But it's tightly coupled to Copilot CLI and has very low adoption. The ideas are worth noting; the implementation is likely not production-grade.

---

## 10. sengac/fspec
- **What it does:** "Factory Spec" — infrastructure for running a software factory. Multiple AI agents working jobs in parallel, driven by specifications, managed on a Kanban board. Uses Acceptance Criteria Driven Development (ACDD): specification first → tests before code → minimal implementation. Features: Gherkin scenarios, clarifying questions for edge cases, failing tests as proof of understanding.
- **Real or vaporware:** **REAL, actively maintained.** 81 stars, 5 forks, 2 open issues. Last commit: 2026-08-17 (today). MIT license. Rust. Has CI, website (fspec.dev).
- **Relevance to Ghost Factory:** **MEDIUM-HIGH.** The spec-driven, test-first pipeline is a disciplined approach to ensuring quality in a Ghost Factory. The Kanban board + parallel agents pattern is directly applicable. Rust implementation suggests performance focus. Small community but active development.

---

## 11. ahoward/bunny
- **What it does:** "An autonomous build system for solo developers." Two adversarial LLMs: Claude writes code, Gemini writes tests to break it. Neither sees the other's prompt. Code ships when Claude beats Gemini's tests. Persistent knowledge graph compounds across builds. CLI tool (`bny hop`, `bny spike`, `bny digest`).
- **Real or vaporware:** **REAL but ABANDONED.** 13 stars, 0 forks, 13 open issues. Last commit: 2026-04-01 (4.5 months ago). No license. TypeScript. Requires both Anthropic and Gemini API keys.
- **Relevance to Ghost Factory:** **LOW-MEDIUM.** The adversarial testing pattern (builder vs. breaker) is clever and worth understanding. But the project is abandoned, has tiny adoption, and is designed for solo developers, not factory-scale work. The knowledge graph concept is interesting but not mature.

---

## 12. snarktank/ralph
- **What it does:** Autonomous AI agent loop that runs AI coding tools (Amp or Claude Code) repeatedly until all PRD items are complete. Each iteration is a fresh instance with clean context. Memory persists via git history, `progress.txt`, and `prd.json`. Based on Geoffrey Huntley's "Ralph pattern." Includes `/prd` and `/ralph` skills for Claude Code.
- **Real or vaporware:** **REAL but STALLED.** 21,509 stars, 2,066 forks, 74 open issues. Last commit: 2026-02-02 (6.5 months ago). MIT license. TypeScript. Has Claude Code marketplace support.
- **Relevance to Ghost Factory:** **MEDIUM.** The "run until PRD is complete" loop is a core Ghost Factory pattern. The PRD-to-implementation pipeline is directly relevant. **Caveat:** Development has stalled (last commit February). The pattern is well-documented and you can implement it yourself, but the code may need updates.

---

## Summary Table

| Repo | Stars | Last Commit | Status | License | Ghost Factory Relevance |
|------|-------|-------------|--------|---------|------------------------|
| openai/symphony | 26.7k | Aug 12 | Active | Apache 2.0 | HIGH — orchestration layer |
| coleam00/Archon | 23.2k | Aug 17 | Active | MIT | HIGH — workflow engine |
| abhigyanpatwari/GitNexus | 45.5k | Aug 16 | Active | Noncommercial | MEDIUM-HIGH — code intelligence (license issue) |
| fabro-sh/fabro | 1.5k | Aug 14 | Active | MIT | HIGH — complete dark factory |
| foundatron/octopusgarden | 57 | Mar 18 | Stalled | MIT | MEDIUM — holdout testing ideas |
| strongdm/attractor | 1.3k | Mar 17 | Stalled | Apache 2.0 | MEDIUM-HIGH — specs/patterns |
| coleam00/dark-factory-experiment | 121 | Aug 14 | Active | None | HIGH — working reference impl |
| Q00/ouroboros | 5.5k | Aug 17 | Active | MIT | HIGH — self-improving agent loop |
| DUBSOpenHub/dark-factory | 21 | Jul 28 | Minimal | MIT | MEDIUM — sealed-envelope testing |
| sengac/fspec | 81 | Aug 17 | Active | MIT | MEDIUM-HIGH — spec-driven pipeline |
| ahoward/bunny | 13 | Apr 1 | Abandoned | None | LOW-MEDIUM — adversarial testing |
| snarktank/ralph | 21.5k | Feb 2 | Stalled | MIT | MEDIUM — PRD loop pattern |

---

## Key Takeaways for a Ghost Factory

1. **Most mature stack:** Archon (workflow engine) + Symphony-style orchestration + Ouroboros (self-improving loop) is the strongest open-source combination.
2. **Best reference implementation:** coleam00/dark-factory-experiment is the only working, actively-maintained "dark factory" with real software being shipped.
3. **Most complete product:** fabro-sh/fabro is the most opinionated "dark factory" product with ensemble intelligence and graph-based workflows.
4. **Best patterns to borrow:** Holdout testing (octopusgarden), sealed-envelope testing (DUBSOpenHub), adversarial testing (bunny), spec-driven development (fspec).
5. **Avoid relying on:** GitNexus (noncommercial license), bunny (abandoned), ralph (stalled), octopusgarden (stalled).
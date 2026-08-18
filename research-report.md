# AI Software Factory - Repo Research Report

*Research Date: 2026-08-17*

---

## 1. github/spec-kit

**What it does (plain English):**
GitHub's official open-source toolkit for "Spec-Driven Development." Instead of jumping straight into coding with AI, you first define what you want to build using structured specifications (PRDs, architecture docs, task plans). The specs then become executable — the AI coding agent uses them to generate working code. Ships with a CLI tool (`specify`) and slash commands that integrate with GitHub Copilot, Claude Code, Codex, and others. Includes role-based "bundles" (PM, architect, developer) and community extensions.

**Reality / Maturity:**
- ✅ **Very real and actively maintained.**
- 129,657 stars | 11,603 forks | 339 open issues
- Created: 2025-08-21 | Last commit: 2026-08-14 (3 days ago)
- Language: Python | License: MIT
- Released by GitHub itself (not a third party)
- Docs at github.github.io/spec-kit, regular releases (v0.12.x)
- Active Discord, multiple language translations

**Relevance to AI Software Factory: HIGH**
- Directly implements the "spec-first → code" pipeline that an AI factory needs
- Vendor-neutral: works with Copilot, Claude Code, Codex, Command Code
- Role-based bundles mirror factory team structure
- Constitution/principles system for governing agent behavior
- Potential to use as the specification layer feeding into an agentic pipeline

---

## 2. bmad-code-org/BMAD-METHOD

**What it does (plain English):**
"Breakthrough Method for Agile AI Driven Development" (BMad). A comprehensive methodology + tooling for running the entire software delivery lifecycle with AI — from ideation through planning, architecture, coding, testing, and learning. Delivers as a Node.js CLI (`npx bmad-method install`) that adds structured workflows to any AI coding tool. Features multi-agent discussions (agents debate architecture), durable context that carries decisions forward, right-sized process (small changes → build directly, complex ones → deep planning). Has a whole ecosystem: BMad Builder (agent/workflow builder), BMad Loop (unattended epic builds), BMad Test Architect, BMad Game Dev Studio.

**Reality / Maturity:**
- ✅ **Very real, actively maintained, massive community.**
- 51,980 stars | 5,938 forks | 135 open issues
- Created: 2025-04-13 | Last commit: 2026-08-17 (today!)
- Language: JavaScript | License: MIT (trademarked)
- npm package published, active Discord, YouTube tutorials
- Ecosystem of 6+ repos (BMad Builder, Creative Intelligence Suite, Loop, Test Architect, Game Dev)
- V6 released with upgrade path

**Relevance to AI Software Factory: HIGH**
- Most complete methodology for running AI-assisted delivery end-to-end
- Multi-agent orchestration built-in (agents discuss, review, challenge)
- Durable context across sessions = factory memory
- BMad Loop specifically does unattended epic builds (factory automation)
- Web bundles (Gemini Gems, GPTs) for planning in existing subscriptions
- Could serve as the orchestration methodology layer for a factory setup

---

## 3. gsd-build/get-shit-done

**What it does (plain English):**
⚠️ **REPOSITORY HAS BEEN ARCHIVED.** The README redirects to a new home: **open-gsd/gsd-core** (github.com/open-gsd/gsd-core).

The original GSD was "a light-weight and powerful meta-prompting, context engineering and spec-driven development system for Claude Code" by someone named TÂCHES. It combined spec-driven development with context management for Claude Code.

**Current Status (open-gsd/gsd-core):**
- 8,342 stars | 583 forks | 84 open issues
- Created: 2026-05-22 | Last push: 2026-08-17 (today)
- Language: JavaScript | License: MIT
- Topics: claude-code, context-engineering, meta-prompting, spec-driven-development
- Active development

**Relevance to AI Software Factory: MEDIUM-HIGH**
- Spec-driven + context engineering approach aligns with factory needs
- But the project is young (3 months), recently migrated, and the original author identity is unclear
- Fewer stars/community than spec-kit or BMad
- Could be worth monitoring but less battle-tested

---

## 4. garrytan/gstack

**What it does (plain English):**
Garry Tan's (Y Combinator CEO) personal Claude Code setup, open-sourced. Turns Claude Code into a "virtual engineering team" with 23 specialist slash commands and 8 power tools: a CEO who rethinks the product, an engineering manager who locks architecture, a designer who catches AI slop, a reviewer who finds production bugs, a QA lead who opens real browsers, a security officer who runs OWASP + STRIDE audits, a release engineer who ships PRs, and more. All slash commands, all Markdown, MIT licensed. Includes team mode with auto-update for shared repos and OpenClaw integration. Garry claims 810× productivity increase over his 2013 pace.

**Reality / Maturity:**
- ✅ **Extremely popular, actively maintained, real daily-use tool.**
- 128,325 stars | 19,319 forks | 881 open issues
- Created: 2026-03-11 | Last commit: 2026-08-17 (today)
- Language: TypeScript | License: MIT
- Versioned releases (v1.67.0.0 as of today)
- Active contributor community, extensive docs
- Used daily by Garry Tan (verifiable from his GitHub activity)
- OpenClaw + Claude Code compatible

**Relevance to AI Software Factory: VERY HIGH**
- This is essentially a pre-built "AI software factory in a box"
- Covers the full lifecycle: product thinking → architecture → design → code review → QA → security → release
- Team mode with auto-update = deployable across an organization
- Proven at scale (YC CEO running it daily, 40+ repos)
- Could be used as-is or forked/customized for a factory setup
- Most "opinionated" option — embeds Garry's specific methodology

---

## 5. traycer.ai (traycerai/traycer)

**What it does (plain English):**
Open-source desktop app for "advanced agent orchestration." Traycer lets you connect your existing AI coding subscriptions (Claude Code, Codex, Cursor, OpenCode) and run multiple agents in parallel within a unified workspace. Features include: switching models instantly within the same agent (context preserved), agent-to-agent communication (automated debates, peer reviews), real-time collaboration with shared boards, cross-device sync, and a visual workspace for managing agent tasks. Also offers its own inference subscription. Described as a "nerve center for agentic coding."

**Reality / Maturity:**
- ✅ **Real and actively maintained, but smaller community.**
- 1,193 stars | 156 forks | 145 open issues
- Created: 2024-05-11 | Last commit: 2026-08-17 (today)
- Language: TypeScript | License: MIT
- Downloadable desktop app for macOS, Linux, Windows
- Active Discord, YouTube channel, documented API
- Less popular than the others but has been around for 2+ years

**Relevance to AI Software Factory: MEDIUM**
- Orchestration layer: could be useful for managing multiple agents in parallel
- Agent-to-agent communication is a factory-relevant pattern
- But it's more of a "control center" than a methodology — doesn't define workflows/practices
- Lower maturity than spec-kit or BMad
- Could complement a factory setup as the UI/orchestration layer
- Not a methodology replacement — pairs with spec-kit or BMad

---

## Summary Matrix

| Repo | Stars | Last Active | What It Is | Factory Fit |
|------|-------|-------------|------------|-------------|
| **github/spec-kit** | 129,657 | 3 days ago | Spec-driven dev toolkit by GitHub | HIGH — spec layer |
| **BMAD-METHOD** | 51,980 | Today | Full AI delivery methodology + ecosystem | HIGH — orchestration methodology |
| **get-shit-done** → open-gsd/gsd-core | 8,342 | Today | Spec + context system for Claude Code | MEDIUM — watch, less mature |
| **garrytan/gstack** | 128,325 | Today | Virtual engineering team via Claude Code | VERY HIGH — factory-in-a-box |
| **traycerai/traycer** | 1,193 | Today | Agent orchestration desktop app | MEDIUM — UI/control layer |

## Key Insight

These tools represent three layers of an AI software factory stack:
1. **Specification Layer:** spec-kit, GSD (define what to build)
2. **Methodology/Orchestration Layer:** BMad, gstack (how agents collaborate through the lifecycle)
3. **Control/UI Layer:** Traycer (visual management of multiple agents)

**garrytan/gstack** and **github/spec-kit** are the most immediately usable — gstack for a complete pre-built factory workflow, spec-kit for GitHub's vendor-neutral specification approach. **BMad** offers the deepest methodology but has the steepest learning curve. **Traycer** is best as a complementary orchestration UI rather than a primary methodology.
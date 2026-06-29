# Chimera Runtime Rules

>>> These rules are discovered at session start by all agents. <<<
>>> They encode session-specific constraints and provider configuration. <<<
>>> If you're new to Chimera, this file explains how things work. <<<

---

## What Is Multi-Agent Architecture?

When you talk to Chimera, you're talking to one agent. Behind the scenes,
three specialized agents work together:

- **Writer**: Implements changes, explores approaches, writes code
- **Reviewer**: Checks for bugs, security issues, and code quality
- **Challenger**: Finds edge cases, proposes alternatives

The user sees one response. The agents work in parallel and in series to
give you the best result.

---

## Provider Configuration

| Role | Provider | Model | Purpose |
|------|----------|-------|---------|
| Writer | NVIDIA NIM | Llama 3.1 8B | Bulk drafting, exploration, test generation |
| Reviewer | Google | Gemma 4 31B | Correctness verification, security review |
| Challenger | Mistral | Mistral Small | Adversarial analysis, alternative proposals |

---

## Session Constraints

- **Default mode**: CODE (full tool access, medium autonomy)
- **Cost awareness**: Track per-provider spend; warn at 80% of budget
- **Agent relay racing**: Trigger handoff at 60-70% context fill
- **Quality gate**: Every draft goes through Reviewer before presentation
- **Scope protection**: Each agent modifies only its assigned files

---

## Active Directives

- Follow `AGENTS.md` as the primary operating directive
- Follow `CLAUDE.md` for GitNexus code intelligence rules
- Check for `.chimera/rules.md` (this file) at session start
- Respect permission profiles per agent role
- Create git checkpoints before risky edits

---

## Project Context

- **Language**: TypeScript (ES2022, NodeNext modules, strict mode)
- **Package manager**: pnpm 11
- **Build**: Turborepo
- **Lint**: Biome + ESLint
- **Test**: Vitest
- **Monorepo**: 15 packages under `packages/chimera-*`

---

## Style Conventions

- 2-space indentation
- 100-character line width (Biome)
- Prefer `const` over `let`
- Prefer named exports over default exports
- Use Zod for runtime validation
- Use `type` keyword for type-only imports

# OpenCode Compatibility Layer

This skill provides compatibility with OpenCode-style workflows and tool patterns.

## Mode Equivalents

| Chimera | OpenCode | Description |
|---------|----------|-------------|
| `ask` | default chat | Read-only codebase analysis |
| `plan` | plan mode | Read-only planning without edits |
| `code` | build mode | Full tool access for implementation |
| `debug` | (new) | Multi-hypothesis debugging |

## Tool Patterns

- **Parallel agents**: Writer + Reviewer work simultaneously on tasks
- **Cost caps**: Automatic model selection based on task complexity
- **Session sharing**: Future feature for team collaboration

## Usage

Use `@opencode` when you want OpenCode-style behavior with multi-agent verification.
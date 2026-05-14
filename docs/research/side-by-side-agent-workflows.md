# Side-by-side Claude Code / Codex workflow research

Research date: 2026-05-13

This note captures product learnings from current side-by-side Claude Code and Codex usage patterns and maps them to Chimera's duo/trio/auto agent orchestration.

## Sources reviewed

- OpenAI's Codex plugin for Claude Code documents using Codex inside Claude Code for read-only review, adversarial review, background rescue jobs, status/result polling, and a review gate that blocks Claude's stop event when Codex finds issues: https://github.com/openai/codex-plugin-cc
- OpenAI Codex CLI is the local terminal coding-agent reference for Codex-style sandboxed terminal work: https://github.com/openai/codex
- Claude Code subagents document the pattern of specialized agents with separate context windows and role-specific prompts: https://code.claude.com/docs/en/sub-agents
- Claude Code hooks document lifecycle automation, including stop hooks that can run validation or review gates: https://code.claude.com/docs/en/hooks
- Community workflows repeatedly describe using one model to implement and a different model to review, with the second model catching cross-file consistency, API-contract, naming, and test gaps that the authoring model missed.

## Product lessons

1. **Review must be read-only by default.** The most robust pattern is to let a second agent inspect the current diff or branch before it is allowed to change anything.
2. **Adversarial review is distinct from normal review.** A reviewer catches correctness issues; a challenger questions direction, risk, assumptions, and alternatives.
3. **Background work needs explicit status/result/cancel semantics.** Long-running second opinions are useful only when users can see progress and stop them.
4. **Review gates are useful but dangerous.** They can create loops and burn usage limits, so Chimera must make loops explicit and budgeted.
5. **Local auth and local repo state matter.** Many users prefer reusing locally authenticated CLIs and the current checkout instead of sending work through a separate cloud workspace.
6. **Agent count should be adaptive.** Solo is enough for simple read-only questions, duo is the practical default for coding/review, and trio is best for high-risk work.

## Chimera implementation mapping

| Learning | Chimera implementation |
| --- | --- |
| Second model reviews authoring model | `--agents duo` runs writer + reviewer roles. |
| Adversarial challenge separate from review | `--agents trio` adds a challenger role. |
| Avoid always paying for three agents | `--agents auto` selects solo/duo/trio using task and repo risk signals. |
| Review gate must not silently loop | Quorum is reported, but automatic patch application remains disabled in this MVP. |
| Preserve local workflow | Agent outputs are written to session artifacts under `.chimera/sessions/`. |
| Support provider/model diversity | Role-specific models are selected through `CHIMERA_WRITER_MODEL`, `CHIMERA_REVIEWER_MODEL`, and `CHIMERA_CHALLENGER_MODEL`; local CLIs can also be wired with `CHIMERA_WRITER_COMMAND`, `CHIMERA_REVIEWER_COMMAND`, and `CHIMERA_CHALLENGER_COMMAND`. |

## Current limitations

The current MVP implements orchestration scaffolding, provider-backed role calls, and simple locally authenticated CLI subprocess role commands. It does not yet implement full background job management, cancellation, worktree isolation, status polling, or automatic patch application.

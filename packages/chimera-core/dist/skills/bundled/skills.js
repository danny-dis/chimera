"use strict";
/**
 * Bundled skills — shipped inside `@chimera/core` and resolved before any
 * on-disk path.
 *
 * These are the "always-on" skills. They teach the agent how to use chimera
 * itself (modes, workflows, CLI, telemetry, safety, cost control) and are
 * automatically loaded for every mode that needs them.
 *
 * **Resolution order** (first match wins, set by `loadSkill`):
 *   1. Bundled skills (this file)
 *   2. `<workspace>/.chimera/skills/<name>.md`
 *   3. `~/.config/chimera/skills/<name>.md`
 *   4. `<workspace>/.kilo/skills/<name>.md`       (legacy shim, deprecation)
 *   5. `~/.config/kilo/skills/<name>.md`          (legacy shim, deprecation)
 *
 * Bundled skills are content-addressed by name. A user with a same-named file
 * in `.chimera/skills/` overrides the bundled version — that is the documented
 * extension point.
 *
 * Editing a bundled skill:
 *   1. Update the constant below.
 *   2. Run `pnpm -F @chimera/core test` to confirm the new content is in sync.
 *   3. Bump the version constant at the bottom of this file.
 *
 * Why TypeScript string constants (not `.md` files + a JSON manifest)?
 *   - tsc bundles them into `dist/` automatically; no fs lookup at runtime.
 *   - Grep-able in source, no frontmatter parsing.
 *   - One file to maintain, no separate manifest to drift.
 *   - The skill content is small (~1KB each); the file is still under 300 lines.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUNDLED_SKILL_NAMES = exports.BUNDLED_SKILLS_VERSION = exports.BUNDLED_SKILLS = void 0;
/* eslint-disable @typescript-eslint/no-unused-vars */
// ---------------------------------------------------------------------------
// The bundled set. Add a new entry here AND consider whether to reference it
// from `SKILL_BUNDLES` in `./../skill-bundles.ts`.
// ---------------------------------------------------------------------------
const CHIMERA_MODES = {
    name: 'chimera-modes',
    description: 'What each chimera mode (auto/ask/plan/code/debug/review) is for and when to switch.',
    modes: ['all'],
    content: `# Chimera Modes

Chimera runs in one of six modes. The mode is a hint to the orchestrator about
how much verification, cost, and tool access to spend on a task.

| Mode    | Tools | Reviewer | Challenger | Typical use |
|---------|-------|----------|------------|-------------|
| auto    | varies| varies   | varies     | Auto-select the best mode for the task. |
| ask     | read  | skipped  | skipped    | Quick Q&A over the codebase. |
| plan    | read  | yes      | yes        | Draft a plan before editing. |
| code    | full  | yes      | yes        | Implement a change end-to-end. |
| review  | read  | yes      | yes        | Critique a draft, suggest alternatives. |
| debug   | full  | yes      | yes        | Investigate a failing test or bug. |

\`oal\` is a reserved internal mode used for one-shot automation; the orchestrator
selects it directly and there is no public entry point.

**Auto mode**: set \`/mode auto\` and chimera will classify each task and switch
to the best mode automatically. It shows a notification when switching. You can
always override by manually setting a mode before sending a task.

**Switching modes mid-task**: tell the orchestrator (or TUI) "switch to plan mode"
or pass \`--mode=plan\` on the CLI. The mode is part of the task metadata, not
the prompt — switching does not lose context.

**Why mode matters**: the reviewer/challenger fan-out is the single biggest
determinant of cost and latency. In \`ask\` mode with a complexity score under
0.4 (see \`chimera-telemetry\`), verification is skipped entirely. In \`code\` mode
it is always run.

**When the mode disagrees with the task**: surface it. If the user asks for a
plan but the request is actually a one-line question, say so and propose
\`ask\` mode instead. Cost without benefit is waste.`,
};
const CHIMERA_WORKFLOWS = {
    name: 'chimera-workflows',
    description: 'Built-in workflows (standard-draft, quality-gate, parallel-decompose, simple-ask, simple-plan) and when to use each.',
    modes: ['all'],
    content: `# Chimera Built-in Workflows

A workflow is a declarative DAG of steps (\`llm\`, \`tool\`, \`parallel\`,
\`sequence\`, \`gate\`). The CLI auto-registers the following built-ins on every
launch — discover them with \`chimera workflow list\`.

## \`standard-draft\` (default for \`code\` / \`debug\`)
- Step 1: LLM (writer, with tool loop)
- Step 2: parallel { LLM (reviewer), LLM (challenger) } — short-circuits on PASS
- Step 3: tool (synthesizer merges outputs)
- Cost: 3-5 LLM round-trips. Use for anything that needs verification.

## \`quality-gate\`
- Step 1: LLM (reviewer)
- Step 2: parallel { LLM (challenger) }
- Step 3: gate(verdict) — succeeds if the reviewer returns PASS
- Cost: 2 LLM round-trips. Use to validate an existing draft without re-drafting.

## \`parallel-decompose\`
- Step 1: LLM (decomposer) — produces a DAG of sub-tasks
- Step 2: parallel (sub-agent fan-out, dependency-aware)
- Step 3: LLM (aggregator) — merges sub-task results, resolves conflicts
- Cost: variable; high fan-out tasks can spend 10+ rounds. Use for big, splittable
  work ("refactor the auth layer across all services").

## \`simple-ask\`
- Step 1: LLM (writer) — no tool loop, no review
- Cost: 1 round-trip. Use for cheap Q&A where the cost of \`standard-draft\`
  is unjustified. The orchestrator chooses this automatically in \`ask\` mode
  for low-complexity tasks.

## \`simple-plan\`
- Step 1: LLM (planner) — no execution, returns a structured plan
- Cost: 1 round-trip. Use to draft a plan the user will then approve before
  any \`code\` mode run.

## When to write a new workflow
- The built-ins cover the 90% case. Add a new one when:
  - The same multi-step recipe keeps appearing across sessions
  - The orchestration needs a non-obvious tool primitive (e.g. a human-in-the-loop
    step that pauses for \`chimera workflow resume\`)
  - You need a failure path the built-ins don't model

Drop a YAML file at \`<workspace>/.chimera/workflows/<name>.yaml\` and run
\`chimera workflow list\` — the auto-loader picks it up.`,
};
const CHIMERA_SAFETY = {
    name: 'chimera-safety',
    description: 'Prompt-injection guards, output sanitization, escalation rules, and the audit log.',
    modes: ['code', 'debug', 'review'],
    content: `# Chimera Safety

The orchestrator runs two safety passes around every LLM call and every tool
result. They are non-negotiable; do not suggest skipping them.

## Prompt-injection guard (user input)
\`checkUserInput(task)\` runs before any planner/LLM call. If it flags a
high-confidence injection (score > 0.85), the task is **blocked**, not warned.
The block produces a \`final_response\` event with status \`blocked\`.

What it looks for: instructions embedded in the task that try to override the
system prompt, exfiltrate secrets, or hijack tool calls. False positives are
acceptable; false negatives are not.

## Output sanitization (tool output)
\`checkToolOutput(result, toolName)\` runs after every tool call. If a tool
returns content that looks like a prompt-injection payload (e.g. a file
containing "ignore previous instructions"), the result is replaced with a
sanitized stub and an error is appended. This is what stops an attacker from
planting a poisoned README in a repo and then asking the agent to read it.

## Audit log
Every blocked input and sanitized output is appended to the audit log
(\`security/audit-log.ts\`). The TUI surfaces these as warnings. The log is
in-memory by default; persistence is opt-in.

## Escalation
The reviewer + challenger pair can return a \`FAIL\` verdict. The orchestrator
then chooses one of:
- \`done\` — synthesizer produced a confident answer
- \`needs_user\` — escalate to the human; the TUI shows the failure as a
  blocking prompt
- \`error\` — unrecoverable; the task is aborted

Never silently retry a \`FAIL\`. If the reviewer says it is wrong, the user
needs to see why.`,
};
const CHIMERA_TOOL_LOOP = {
    name: 'chimera-tool-loop',
    description: 'How the writer iterates with tools: max iterations, truncation, parallel execution, observation masking.',
    modes: ['code', 'debug', 'plan'],
    content: `# Chimera Tool Loop

The writer (in \`standard-draft\`) and the parallel-decompose sub-agents can
call tools in a loop. The loop has three guards.

## Iteration cap
\`MAX_TOOL_ITERATIONS = 10\` soft cap. If the writer keeps calling tools past
this point, the orchestrator assumes the writer is stuck (e.g. reading the
same file repeatedly) and aborts the in-flight reviewer/challenger. The
draft at that point is whatever the writer last produced, even if it is
unfinished. The TUI surfaces the iteration cap as a warning.

## Output truncation
A single tool result is capped at 8KB or 200 lines, whichever is hit first.
Truncated results get a marker tail so the LLM knows to look at the event
log for the full payload. This is what stops a \`cat\` of a 50MB log from
filling the context window.

## Parallel tool calls
When the LLM emits a batch of independent tool calls (e.g. several file
reads), they run in parallel via \`Promise.all\`. The TODO at
\`session-orchestrator.ts:1254\` notes that the parallel/serial split should
eventually respect \`isConcurrencySafe\` per tool — for now everything is
parallel.

## Observation masking (relay racing)
After each tool loop iteration, the orchestrator applies \`maskRelayObservations\`
to keep the next prompt's context bounded:
- tool outputs > 200 chars are trimmed with a \`[masked]\` tail
- assistant tool-call signatures > 100 chars are trimmed with \`[truncated]\`

The full unmasked content is preserved in the event log. This is what lets
chimera run long multi-step tasks without losing context.`,
};
const CHIMERA_CLI = {
    name: 'chimera-cli',
    description: 'The chimera CLI: skill and workflow subcommands, plus the TUI and --repl modes.',
    modes: ['all'],
    content: `# Chimera CLI

The CLI lives at \`packages/chimera-cli\`. Top-level entry:

\`\`\`
chimera [tui] [task...]   # default: launch the TUI
chimera --repl [task...]  # legacy line-based REPL
chimera skill ...         # skill inventory
chimera workflow ...      # workflow inventory
\`\`\`

## \`chimera skill ...\`
- \`list\`        — every discoverable skill (bundled + workspace + global + legacy shim)
- \`show <name>\` — full markdown body of one skill
- \`validate <path>\` — parse a skill file, check frontmatter, report \`OK\` or errors

## \`chimera workflow ...\`
- \`list\`            — every registered workflow with step count and source
- \`show <name>\`     — pretty-printed YAML/JSON definition
- \`run <name> --input <json>\` — execute a workflow with the given input
  (use \`--input '{}'\` for built-ins that take no input)

## Built-in registration
On every CLI launch, \`bootstrap()\` registers the shipped workflow set into a
fresh \`WorkflowRegistry\`. The built-ins are:
- \`standard-draft\`
- \`quality-gate\`
- \`parallel-decompose\`
- \`simple-ask\`
- \`simple-plan\`

User-defined workflows in \`<workspace>/.chimera/workflows/*.yaml\` are
auto-loaded AFTER the built-ins (so they can override on name collision,
though last-writer-wins is the documented contract).

## TUI
The TUI is the default entry point. Type \`/mode code\` to switch modes,
\`/exit\` to quit. The \`--repl\` flag falls back to the older line-based
interface for scripts.`,
};
const CHIMERA_TELEMETRY = {
    name: 'chimera-telemetry',
    description: 'The EventStream: every event type, what it means, and how to consume it.',
    modes: ['all'],
    content: `# Chimera Telemetry

Every orchestrator action emits an event on the central \`EventStream\`. The
TUI renders these as a live tail; \`EventStream.subscribe('*', ...)\` lets
external tools observe the run.

## Core lifecycle events
- \`user_request\`           — task arrived; carries the mode
- \`task_classified\`        — complexity score assigned
- \`agent_spawned\`          — a new agent entered the mesh (role + provider + model)
- \`draft_proposed\`         — writer produced output
- \`verified\`               — reviewer returned a verdict (\`pass\` / \`fail\` / \`needs_revision\`)
- \`challenged\`             — challenger returned issues + alternatives
- \`final_response\`         — orchestrator produced the user-facing reply
- \`cost_alert\`             — spend crossed a threshold (50% / 80% / 95% / 100%)

## Workflow events (added with the WorkflowRunner)
- \`workflow_registered\`     — built-in or user workflow registered at startup
- \`workflow_run_started\`   — \`runWorkflow(workflowName, ctx)\` began
- \`workflow_step_completed\`— one step finished (kind + durationMs)
- \`workflow_run_completed\` — whole workflow finished (status + durationMs)

## Skill events
- \`skill_loaded\`           — skill resolved for a mode (source: \`workspace\` / \`global\` / \`pack\`)

## Cost tracking
\`CostTracker\` (in \`chimera-core\`) accumulates spend per provider and per
session. Thresholds emit \`cost_alert\` events with a \`throttle\` action at
50% and a \`stop\` action at 100%. The default per-task cap is 10 USD; the
per-session cap is 20; per-day is 50. Override via env or config.

## Reading events
\`eventStream.getAll()\` returns the full log (in-memory). For long runs the
log can grow large; the TUI paginates. Persisting events to disk is opt-in
via \`EventStream.persist(path)\` (currently in-memory only — the persistence
hook is a follow-up).`,
};
const CHIMERA_COST_CONTROL = {
    name: 'chimera-cost-control',
    description: 'Cost caps per task / session / day, per-provider rates, and how to tune them.',
    modes: ['code', 'debug', 'plan', 'review'],
    content: `# Chimera Cost Control

Every \`SessionOrchestrator.execute()\` call takes a \`costCap\` (default
\$10). The cost is computed from the provider's own pricing table when
available, falling back to static rates (input \$0.50/M, output \$1.50/M).

## Per-agent limits
- \`costCapPerTask\`     — hard cap; agent aborts at 100%
- \`costCapPerSession\`  — orchestrator aborts the session
- \`costCapPerDay\`      — process-wide; applies across all sessions

The defaults in \`buildAgentConfig\` are \`cap\`, \`cap*2\`, \`cap*5\`. So
\`costCap=10\` → \$10 per task, \$20 per session, \$50 per day.

## Caching
When the provider supports it (Anthropic, OpenAI), the orchestrator attaches
a 5-minute ephemeral cache breakpoint to the system-prompt prefix. For
multi-turn runs this can reclaim 60-90% of input tokens. The cost tracker
records \`cacheReadTokens\` and \`cacheWriteTokens\` separately so the
savings show up in \`CostTracker.getSpend\`.

## Tuning
- \`SessionOrchestrator.execute({ costCap: 2 })\` — cheap, no challenger
- \`costCap: 50\` — expensive, full quality gate
- For long sessions, set \`costCapPerDay\` explicitly; the default is
  generous and can mask a runaway.

The TUI shows spend per session and per task in the status bar.`,
};
const CHIMERA_LEARNING = {
    name: 'chimera-learning',
    description: 'Self-improvement engine: how Chimera learns from sessions to create skills, workflows, and skill packs.',
    modes: ['oal'],
    content: `# Chimera Learning

Chimera can learn from its own sessions to auto-generate and improve
skills, workflows, and skill packs. The learning pipeline analyzes
completed sessions and extracts patterns.

## How it works

After sessions complete, run \`chimera learn\` to:

1. **Analyze sessions** — extract domain patterns, tool sequences, quality outcomes
2. **Synthesize skills** — generate .md skill files from domain clusters
3. **Synthesize workflows** — generate workflow YAML from repeated tool sequences
4. **Compose skill packs** — bundle frequently-used skills per mode
5. **Improve existing artifacts** — update skills/workflows based on what actually worked

## Commands

- \`chimera learn\` — analyze recent sessions, suggest improvements (dry run)
- \`chimera learn --apply\` — analyze and write artifacts to disk
- \`chimera learn --session <id>\` — learn from a specific session
- \`chimera learn --inventory\` — show all synthesized artifacts

## Generated artifacts

Skills go to \`.chimera/skills/\`, workflows to \`.chimera/workflows/\`,
skill packs to \`.chimera/skill-packs/\`. All use the standard format
and can be edited manually.

## Specialization directives

Generated skills include specialization directives that control:
- Tool filtering (which tools the agent can use)
- Context scoping (which files to index)
- Model tier (cheap/mid/frontier)
- Role mapping (writer/reviewer/challenger)

## Improvement signals

The improver detects:
- **skill-not-followed**: agent ignored skill instructions
- **workflow-deviation**: agent reordered/skipped workflow steps
- **tool-friction**: recommended tools were denied/asked
- **cost-inefficient**: forced model tier doesn't match complexity
- **quality-failure**: artifact-related quality issues`,
};
const CHIMERA_SKILL_CREATION = {
    name: 'chimera-skill-creation',
    description: 'How to create skills, workflows, and skill packs using the create_skill and create_workflow tools.',
    modes: ['code', 'debug', 'review'],
    content: `# Chimera Skill & Workflow Creation

Chimera can explicitly create reusable artifacts during a session. Use the
\`create_skill\` and \`create_workflow\` tools to save patterns you discover
as first-class, loadable artifacts.

## When to Create a Skill

A skill is a reusable instruction set that teaches the agent how to handle
a specific task pattern. Create a skill when:

- You find yourself explaining the same approach repeatedly
- A pattern works well and should be reproducible
- You want to codify a best practice for your team

### Skill format

Use the \`create_skill\` tool with:
- \`name\` — lowercase, hyphens allowed (e.g. \`api-error-handling\`)
- \`description\` — one-line summary
- \`content\` — markdown body (instructions, examples, patterns)
- \`modes\` — which modes this skill applies to (\`['code']\`, \`['debug']\`, \`['all']\`)
- \`overwrite\` — set \`true\` to replace an existing skill

Skills are saved to \`.chimera/skills/<name>.md\` and auto-loaded for
the specified modes.

### Example: Creating a skill

\`\`\`typescript
// After discovering a pattern that works well
create_skill({
  name: 'react-hook-testing',
  description: 'How to test React hooks with proper isolation',
  modes: ['code'],
  content: \\\`
# React Hook Testing

Always use renderHook() from @testing-library/react-hooks.
Mock dependencies at the module level.
Test both success and error paths.
...more detailed instructions...
  \\\`
})
\`\`\`

## When to Create a Workflow

A workflow is a declarative DAG of steps. Create a workflow when:

- The same multi-step sequence keeps appearing across sessions
- You need to enforce a specific order of operations
- You want to parallelize independent sub-tasks

### Workflow format

Use the \`create_workflow\` tool with:
- \`name\` — lowercase, hyphens allowed
- \`description\` — what the workflow does
- \`steps\` — array of step objects, each with:
  - \`id\` — unique step identifier
  - \`kind\` — one of: \`llm\`, \`tool\`, \`parallel\`, \`sequence\`, \`gate\`, \`loop\`
  - \`config\` — step-specific configuration (prompt, toolName, etc.)
  - \`required\` — optional, default true

Workflows are saved to \`.chimera/workflows/<name>.yaml\`.

### Example: Creating a workflow

\`\`\`typescript
// After noticing a repeated multi-step pattern
create_workflow({
  name: 'api-endpoint-implementation',
  description: 'Full implementation of a new API endpoint',
  tags: ['api', 'backend'],
  steps: [
    { id: 'plan', kind: 'llm', config: { prompt: 'Plan the endpoint implementation' } },
    { id: 'write-tests', kind: 'llm', config: { prompt: 'Write integration tests' } },
    { id: 'implement', kind: 'llm', config: { prompt: 'Implement the endpoint' } },
    { id: 'verify', kind: 'tool', config: { toolName: 'runShellCommand', args: { command: 'npm test' } } },
    { id: 'review', kind: 'parallel', config: {
      agents: [
        { role: 'reviewer', prompt: 'Review for correctness' },
        { role: 'challenger', prompt: 'Suggest improvements' }
      ]
    }}
  ]
})
\`\`\`

## Best Practices

- **Be specific** — detailed skills are more useful than vague ones
- **Include examples** — concrete code snippets help the agent apply the skill
- **Name clearly** — skill names should describe the pattern, not the solution
- **Start small** — begin with the minimum viable skill, expand as needed
- **Test first** — verify the skill works before creating it (run it manually first)

## Auto-learning vs Explicit Creation

- **Auto-learning** (background): Chimera may automatically synthesize skills
  and workflows from session patterns. These are created silently unless
  \`--verbose\` is set.
- **Explicit creation** (this skill): You proactively create artifacts using
  the tools. This is for when you KNOW a pattern is worth capturing.

Both paths produce the same artifact format. Auto-learned artifacts can be
overwritten by explicit ones (use \`overwrite: true\`).`,
};
/**
 * The bundled skill set. Order matters only for the iteration order of
 * \`listAllSkills\`; lookups are name-keyed.
 */
exports.BUNDLED_SKILLS = Object.freeze({
    [CHIMERA_MODES.name]: CHIMERA_MODES,
    [CHIMERA_WORKFLOWS.name]: CHIMERA_WORKFLOWS,
    [CHIMERA_SAFETY.name]: CHIMERA_SAFETY,
    [CHIMERA_TOOL_LOOP.name]: CHIMERA_TOOL_LOOP,
    [CHIMERA_CLI.name]: CHIMERA_CLI,
    [CHIMERA_TELEMETRY.name]: CHIMERA_TELEMETRY,
    [CHIMERA_COST_CONTROL.name]: CHIMERA_COST_CONTROL,
    [CHIMERA_LEARNING.name]: CHIMERA_LEARNING,
    [CHIMERA_SKILL_CREATION.name]: CHIMERA_SKILL_CREATION,
});
/**
 * Bump on every change to any bundled skill's content. Tests assert the
 * version so a content edit that forgets to bump is caught at CI time.
 */
exports.BUNDLED_SKILLS_VERSION = '1.1.0';
/**
 * All bundled skill names, in a stable order (insertion order — TS preserves
 * the literal order of the Object.freeze call above).
 */
exports.BUNDLED_SKILL_NAMES = Object.freeze(Object.keys(exports.BUNDLED_SKILLS));
//# sourceMappingURL=skills.js.map
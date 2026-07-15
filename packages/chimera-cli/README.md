# Chimera

Terminal-native parallel multi-agent coding platform. Multiple specialized
agents (writer / reviewer / challenger / synthesizer) work behind one
unified response so you ship code safely on cheap or local models.

## Install

```bash
npm install -g @chimera/cli
# or run without installing:
npx @chimera/cli
```

Requires Node.js >= 20.

## First run (zero config)

Chimera auto-detects a provider on first run — no API key required if you
have a local model:

- **Ollama** — if `ollama` is running locally (`ollama pull llama3`), Chimera
  uses your pulled model automatically. Nothing to configure.
- **Any API key** — set one of these env vars and Chimera picks it up:
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`,
  `OPENROUTER_API_KEY`, or the `CHIMERA_CHEAP_API_KEY` + `CHIMERA_CHEAP_BASE_URL`
  pair for any OpenAI-compatible endpoint. Model-agnostic: whatever model the
  key maps to is what runs.

```bash
chimera init        # writes AGENTS.md + .chimera/config.yaml from your env
chimera code "fix the off-by-one in src/parser.ts"
```

`chimera init` generates `.chimera/config.yaml` from detected providers; every
role (writer/reviewer/challenger) is assigned automatically. Override any role
with `CHIMERA_WRITER_MODEL` / `CHIMERA_REVIEWER_MODEL` / `CHIMERA_CHALLENGER_MODEL`.

## Adaptive guidance

Chimera adapts how much it explains to *you* — not what it lets you do. It
infers a confidence score from how you use it (flags you pass, how you phrase
requests, whether a step needs repeating) and shows more or less hand-holding
accordingly. New or ambiguous sessions start in the middle. You can always shift
it:

- Say **"explain more"** (or "teach me") for a why-first, jargon-defined walkthrough.
- Say **"explain less"** (or "skip the explanation") for terse, shortcut-first output.

The toggle is reversible at any time. Set `CHIMERA_DEV=1` to see, in one line,
why a given depth was chosen (`[skill] score≈0.62 intermediate — …`).

## Modes

| Mode | What it does |
|------|--------------|
| `ask` | Answer a question |
| `plan` | Produce an implementation plan |
| `code` | Write/edit files (lands real files on disk) |
| `debug` | Find and fix a bug |
| `review` | Review a change |
| `oal` | Autonomous loop |
| `auto` | Self-selects the best preset |

## Presets

`solo` · `duo` · `trio` · `fusion` · `hive` · `swarm` · `auto`.
`code`/`debug` tasks default to a file-writing preset (`trio`/`fusion`);
`swarm` is reserved for analysis (review/plan) and is remapped to `trio` for
code tasks so a file always lands.

## Examples

```bash
chimera code "add a --verbose flag to cli.ts"
chimera review "did PR #42 introduce a regression?"
chimera debug "tests fail with TypeError in session.ts"
```

## Config

`~/.chimera/config.yaml` or `.chimera/config.yaml` (per-project). Set
`CHIMERA_CHEAP_*` / `OPENROUTER_*` / vendor keys in your shell or `.env`.
API keys are never written to disk by Chimera — only `${ENV_VAR}` references.

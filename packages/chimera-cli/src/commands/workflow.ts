/**
 * `chimera workflow …` — list, inspect, and run declarative workflows.
 *
 *   chimera workflow list                  — show every registered workflow
 *   chimera workflow show <name>           — print the workflow's YAML/JSON
 *   chimera workflow run <name>            — execute a workflow
 *     --input <json>                       — initial state.inputs (default {})
 *
 * Workflow sources are: workspace (`<ws>/.chimera/workflows/*.yaml|yml|json`),
 * global (`~/.config/chimera/workflows/…`), or inline (registered in code).
 * The CLI loads workspace+global via `WorkflowAutoLoader` and then merges in
 * any built-in workflows registered by `chimera-core` at import time
 * (e.g. `standard-draft`, `parallel-decompose`, `quality-gate`).
 */
import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import {
  EventStream,
  WorkflowAutoLoader,
  WorkflowRegistry,
  CoordinatorEngine,
  AgentMesh,
  runWorkflow,
  type WorkflowDefinition,
  type LLMProvider,
} from '@chimera/core';
import { ProviderFactory } from '@chimera/providers';
import type { ModelProvider } from '@chimera/providers';

/**
 * Built-in workflows surfaced by the CLI. `standard-draft` and
 * `quality-gate` are the orchestrator's and the mesh's own. The
 * `parallel-decompose` workflow is registered by `CoordinatorEngine`
 * via its `registerBuiltins` static so the engine owns its own
 * discoverable workflow definition.
 */
const BUILTIN_WORKFLOWS: WorkflowDefinition[] = [
  {
    name: 'standard-draft',
    description: 'Default draft → reviewer∥challenger → synthesize pipeline',
    steps: [
      { id: 'draft', kind: 'llm', config: { role: 'writer', withTools: true } },
      {
        id: 'quality-gate',
        kind: 'parallel',
        config: {
          branches: [
            { id: 'review', kind: 'llm', config: { role: 'reviewer' } },
            { id: 'challenge', kind: 'llm', config: { role: 'challenger' } },
          ],
        },
      },
      { id: 'synthesize', kind: 'tool', config: { name: 'synthesizer' } },
    ],
    tags: ['builtin', 'orchestrator'],
  },
];

interface WorkflowSource {
  registry: WorkflowRegistry;
  source: 'workspace' | 'global' | 'builtin';
  path?: string;
}

interface FoundWorkflow {
  definition: WorkflowDefinition;
  source: 'workspace' | 'global' | 'builtin';
}

async function loadWorkflowRegistry(workspaceRoot: string): Promise<WorkflowSource[]> {
  const auto = new WorkflowAutoLoader();
  const { registry, workflows } = await auto.loadIntoRegistry(workspaceRoot);

  const sources: WorkflowSource[] = [];
  if (workflows.length > 0) {
    const sample = workflows[0].path ?? '';
    const source: WorkflowSource['source'] = sample.includes(workspaceRoot) ? 'workspace' : 'global';
    sources.push({ registry, source, path: sample ? dirnameOf(sample) : undefined });
  } else {
    sources.push({ registry, source: 'workspace' });
  }

  // Built-in workflows live in their own registry so they don't collide with
  // user-defined names (last-writer-wins would otherwise let a user's
  // `quality-gate.yaml` silently shadow the built-in).
  const builtin = new WorkflowRegistry();
  for (const wf of BUILTIN_WORKFLOWS) builtin.register(wf);
  // Delegate the engine-owned workflow registration to the engine.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (CoordinatorEngine as any).registerBuiltins(builtin);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (AgentMesh as any).registerQualityGateWorkflow(builtin);
  sources.push({ registry: builtin, source: 'builtin' });

  return sources;
}

function dirnameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx === -1 ? p : p.slice(0, idx);
}

/**
 * Register the `workflow` subcommand tree on a parent `Command`.
 */
export function registerWorkflowCommand(parent: Command): Command {
  const wf = parent
    .command('workflow')
    .description('List, inspect, and run declarative workflows');

  wf.command('list')
    .description('List every registered workflow (workspace + global + builtin)')
    .action(async () => {
      const sources = await loadWorkflowRegistry(process.cwd());
      const all = collectAll(sources);

      if (all.length === 0) {
        console.log('\n  No workflows registered.\n');
        return;
      }

      const rows = all.map((entry) => [
        entry.definition.name,
        String(entry.definition.steps.length),
        entry.definition.path ?? '',
        entry.source,
      ]);
      printTable(['name', 'stepCount', 'path', 'source'], rows);
    });

  wf.command('show <name>')
    .description('Print the workflow definition as YAML')
    .action(async (name: string) => {
      const sources = await loadWorkflowRegistry(process.cwd());
      const found = findInSources(sources, name);
      if (!found) {
        console.error(`\n✗ Workflow '${name}' not found.\n`);
        process.exitCode = 1;
        return;
      }
      // If we know the on-disk path and the file is still there, dump the
      // raw file (YAML/JSON as the user wrote it). Otherwise, serialize the
      // in-memory definition back to YAML.
      if (found.definition.path && existsSync(found.definition.path)) {
        const raw = readFileSync(found.definition.path, 'utf-8');
        process.stdout.write(raw.endsWith('\n') ? raw : raw + '\n');
        return;
      }
      const serializable = {
        name: found.definition.name,
        description: found.definition.description,
        tags: found.definition.tags,
        steps: found.definition.steps,
      };
      // JSON is a reasonable default for "show the workflow definition"
      // when there's no on-disk YAML to dump. Operators that want the
      // exact source file can use `chimera workflow show` on a YAML file
      // (the auto-loader preserves the path on disk).
      process.stdout.write(JSON.stringify(serializable, null, 2) + '\n');
    });

  wf.command('run <name>')
    .description('Execute a workflow with the given initial input')
    .option('--input <json>', 'JSON object passed as state.inputs (default: {})', '{}')
    .action(async (name: string, options) => {
      const sources = await loadWorkflowRegistry(process.cwd());
      const found = findInSources(sources, name);
      if (!found) {
        console.error(`\n✗ Workflow '${name}' not found.\n`);
        process.exitCode = 1;
        return;
      }

      let parsedInput: Record<string, unknown> = {};
      if (options.input && options.input !== '{}') {
        try {
          parsedInput = JSON.parse(options.input);
        } catch (err) {
          console.error(`\n✗ --input is not valid JSON: ${err instanceof Error ? err.message : err}\n`);
          process.exitCode = 1;
          return;
        }
      }

      const eventStream = new EventStream();
      const providers = await getProviders();
      const llmProviders: Record<string, LLMProvider> = {
        writer: adaptProvider(providers[0] ?? noopProvider()),
        reviewer: adaptProvider(providers[1] ?? providers[0] ?? noopProvider()),
        challenger: adaptProvider(providers[2] ?? providers[0] ?? noopProvider()),
        decomposer: adaptProvider(providers[0] ?? noopProvider()),
        aggregator: adaptProvider(providers[1] ?? providers[0] ?? noopProvider()),
      };

      eventStream.subscribe('*', (event) => {
        if (event.type === 'workflow_step_completed') {
          console.log(`  [step] ${event.stepId} (${event.kind}) — ${event.durationMs}ms`);
        } else if (event.type === 'workflow_run_completed') {
          console.log(`  [run]  status=${event.status} duration=${event.durationMs}ms steps=${event.stepCount}`);
        }
      });

      try {
        const result = await runWorkflow(found.definition, {
          inputs: parsedInput,
          handlers: { providers: llmProviders, eventStream },
        });

        if (result.status !== 'success') {
          console.error(`\n✗ Workflow run failed: ${result.error ?? 'unknown error'}\n`);
          process.exitCode = 1;
          return;
        }
        console.log('\n✓ Workflow run complete. Outputs:');
        for (const [stepId, value] of Object.entries(result.outputs)) {
          const preview = JSON.stringify(value).slice(0, 200);
          console.log(`  ${stepId}: ${preview}`);
        }
        console.log();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n✗ Workflow run threw: ${msg}\n`);
        process.exitCode = 1;
      }
    });

  return wf;
}

function collectAll(sources: WorkflowSource[]): FoundWorkflow[] {
  const out: FoundWorkflow[] = [];
  for (const s of sources) {
    for (const def of s.registry.list()) {
      out.push({ definition: def, source: s.source });
    }
  }
  return out;
}

function findInSources(sources: WorkflowSource[], name: string): FoundWorkflow | null {
  for (const s of sources) {
    const def = s.registry.get(name);
    if (def) return { definition: def, source: s.source };
  }
  return null;
}

async function getProviders(): Promise<ModelProvider[]> {
  try {
    return ProviderFactory.createFromEnv();
  } catch (err) {
    console.error(
      `\n✗ Provider initialization failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return [];
  }
}

function adaptProvider(p: ModelProvider): LLMProvider {
  return {
    async complete(messages, options) {
      const result = await p.complete(
        messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant' | 'tool',
          content: m.content,
        })),
        {
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          responseFormat: options?.responseFormat,
        },
      );
      return {
        content: result.content,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        },
      };
    },
  };
}

function noopProvider(): ModelProvider {
  // Fallback used when no API keys are configured. Lets the workflow runner
  // exercise the DAG without making real LLM calls.
  return {
    async complete(messages: Array<{ role: string; content: string }>) {
      return {
        content: JSON.stringify({ response: messages.at(-1)?.content ?? '' }),
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    },
    getModel() {
      return { provider: 'mock', model: 'noop' };
    },
  } as unknown as ModelProvider;
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => {
    const cellMax = rows.reduce((m, r) => Math.max(m, (r[i] ?? '').length), 0);
    return Math.max(h.length, cellMax);
  });
  const fmt = (cols: string[]) =>
    cols.map((c, i) => (c ?? '').padEnd(widths[i])).join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  console.log();
  console.log(fmt(headers));
  console.log(sep);
  for (const r of rows) console.log(fmt(r));
  console.log();
}

// Re-export for tests
export const __test__ = { loadWorkflowRegistry, collectAll, findInSources };

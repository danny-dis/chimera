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
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { stringify } from 'yaml';
import {
  EventStream,
  WorkflowAutoLoader,
  WorkflowRegistry,
  registerBuiltInWorkflows,
  type WorkflowDefinition,
  type WorkflowRunResult,
} from '@chimera/core';

import { skillTierFromCli, tierMessage, type TieredMessage } from '@chimera/learning';



interface WorkflowSource {
  registry: WorkflowRegistry;
  source: 'workspace' | 'global' | 'builtin';
  path?: string;
}

interface FoundWorkflow {
  definition: WorkflowDefinition;
  source: 'workspace' | 'global' | 'builtin';
}

export async function loadWorkflowRegistry(workspaceRoot: string): Promise<WorkflowSource[]> {
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

  // Register the engine/mesh-owned built-in workflows via the canonical
  // core API (CoordinatorEngine/AgentMesh no longer expose static
  // registration methods).
  registerBuiltInWorkflows(builtin);
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
export function registerWorkflowCommand(
  parent: Command,
  execute?: (definition: WorkflowDefinition, inputs: Record<string, unknown>, eventStream: EventStream) => Promise<WorkflowRunResult>,
): Command {
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

  wf.command('create <name>')
    .description('Create a project-local workflow from a built-in template')
    .option('--template <name>', 'built-in workflow template', 'standard-draft')
    .action(async (name: string, options: { template: string }) => {
      if (!/^[a-z][a-z0-9-]{0,47}$/.test(name)) {
        console.error('✗ Workflow name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.');
        process.exitCode = 1;
        return;
      }
      const sources = await loadWorkflowRegistry(process.cwd());
      const template = sources.find((source) => source.source === 'builtin')?.registry.get(options.template) as WorkflowDefinition | undefined;
      if (!template) {
        console.error(`✗ Built-in workflow template '${options.template}' not found.`);
        process.exitCode = 1;
        return;
      }
      const directory = join(process.cwd(), '.chimera', 'workflows');
      const file = join(directory, `${name}.yaml`);
      if (existsSync(file)) {
        console.error(`✗ Workflow already exists: ${file}`);
        process.exitCode = 1;
        return;
      }
      mkdirSync(directory, { recursive: true });
      writeFileSync(file, stringify({ ...template, name, path: undefined }), { flag: 'wx' });
      console.log(`✓ Created ${file}`);
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
          if (!parsedInput || typeof parsedInput !== 'object' || Array.isArray(parsedInput)) throw new Error('Workflow input must be a JSON object');
        } catch (err) {
          console.error(`\n✗ --input is not valid JSON: ${err instanceof Error ? err.message : err}\n`);
          process.exitCode = 1;
          return;
        }
      }

      const eventStream = new EventStream();
      if (!execute) {
        console.error('Workflow execution requires the configured CLI runtime.');
        process.exitCode = 1;
        return;
      }

      const stepLog: TieredMessage = {
        beginner:
          '  A "step" is one self-contained unit of work in your workflow (e.g. a single transformation). Chimera runs them in order and reports each.',
        intermediate: '  [step] = one unit of work in the workflow, run in sequence.',
        advanced: '  [step] completed (kind/duration).',
      };
      eventStream.subscribe('*', (event) => {
        if (event.type === 'workflow_step_completed') {
          console.log(tierMessage(stepLog, skillTierFromCli()));
          console.log(`  [step] ${event.stepId} (${event.kind}) — ${event.durationMs}ms`);
        } else if (event.type === 'workflow_run_completed') {
          console.log(`  [run]  status=${event.status} duration=${event.durationMs}ms steps=${event.stepCount}`);
        }
      });

      try {
        const result = await execute(found.definition, parsedInput, eventStream);

        if (result.status !== 'success') {
          const failMsg: TieredMessage = {
            beginner: `\n✗ The workflow didn't finish: ${result.error ?? 'unknown error'}\n  Check the step above that failed, fix the input or the step's code, then run it again with \`chimera workflow run ${found.definition.name}\`.\n`,
            intermediate: `\n✗ Workflow run failed: ${result.error ?? 'unknown error'}\n`,
            advanced: `\n✗ workflow run failed: ${result.error ?? 'unknown error'} (re-run: chimera workflow run ${found.definition.name})\n`,
          };
          console.error(tierMessage(failMsg, skillTierFromCli()));
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
        const threwMsg: TieredMessage = {
          beginner: `\n✗ The workflow hit an unexpected error: ${msg}\n  This usually means a step's code threw. Read the message above, fix the step, and re-run.\n`,
          intermediate: `\n✗ Workflow run threw: ${msg}\n`,
          advanced: `\n✗ workflow run threw: ${msg}\n`,
        };
        console.error(tierMessage(threwMsg, skillTierFromCli()));
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

export function findInSources(sources: WorkflowSource[], name: string): FoundWorkflow | null {
  for (const s of sources) {
    const def = s.registry.get(name);
    if (def) return { definition: def, source: s.source };
  }
  return null;
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

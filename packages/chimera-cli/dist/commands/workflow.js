"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.__test__ = void 0;
exports.registerWorkflowCommand = registerWorkflowCommand;
const fs_1 = require("fs");
const core_1 = require("@chimera/core");
const providers_1 = require("@chimera/providers");
/**
 * Built-in workflows surfaced by the CLI. `standard-draft` and
 * `quality-gate` are the orchestrator's and the mesh's own. The
 * `parallel-decompose` workflow is registered by `CoordinatorEngine`
 * via its `registerBuiltins` static so the engine owns its own
 * discoverable workflow definition.
 */
const BUILTIN_WORKFLOWS = [
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
async function loadWorkflowRegistry(workspaceRoot) {
    const auto = new core_1.WorkflowAutoLoader();
    const { registry, workflows } = await auto.loadIntoRegistry(workspaceRoot);
    const sources = [];
    if (workflows.length > 0) {
        const sample = workflows[0].path ?? '';
        const source = sample.includes(workspaceRoot) ? 'workspace' : 'global';
        sources.push({ registry, source, path: sample ? dirnameOf(sample) : undefined });
    }
    else {
        sources.push({ registry, source: 'workspace' });
    }
    // Built-in workflows live in their own registry so they don't collide with
    // user-defined names (last-writer-wins would otherwise let a user's
    // `quality-gate.yaml` silently shadow the built-in).
    const builtin = new core_1.WorkflowRegistry();
    for (const wf of BUILTIN_WORKFLOWS)
        builtin.register(wf);
    // Register the engine/mesh-owned built-in workflows via the canonical
    // core API (CoordinatorEngine/AgentMesh no longer expose static
    // registration methods).
    (0, core_1.registerBuiltInWorkflows)(builtin);
    sources.push({ registry: builtin, source: 'builtin' });
    return sources;
}
function dirnameOf(p) {
    const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return idx === -1 ? p : p.slice(0, idx);
}
/**
 * Register the `workflow` subcommand tree on a parent `Command`.
 */
function registerWorkflowCommand(parent) {
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
        .action(async (name) => {
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
        if (found.definition.path && (0, fs_1.existsSync)(found.definition.path)) {
            const raw = (0, fs_1.readFileSync)(found.definition.path, 'utf-8');
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
        .action(async (name, options) => {
        const sources = await loadWorkflowRegistry(process.cwd());
        const found = findInSources(sources, name);
        if (!found) {
            console.error(`\n✗ Workflow '${name}' not found.\n`);
            process.exitCode = 1;
            return;
        }
        let parsedInput = {};
        if (options.input && options.input !== '{}') {
            try {
                parsedInput = JSON.parse(options.input);
            }
            catch (err) {
                console.error(`\n✗ --input is not valid JSON: ${err instanceof Error ? err.message : err}\n`);
                process.exitCode = 1;
                return;
            }
        }
        const eventStream = new core_1.EventStream();
        const providers = await getProviders();
        const llmProviders = {
            writer: adaptProvider(providers[0] ?? noopProvider()),
            reviewer: adaptProvider(providers[1] ?? providers[0] ?? noopProvider()),
            challenger: adaptProvider(providers[2] ?? providers[0] ?? noopProvider()),
            decomposer: adaptProvider(providers[0] ?? noopProvider()),
            aggregator: adaptProvider(providers[1] ?? providers[0] ?? noopProvider()),
        };
        eventStream.subscribe('*', (event) => {
            if (event.type === 'workflow_step_completed') {
                console.log(`  [step] ${event.stepId} (${event.kind}) — ${event.durationMs}ms`);
            }
            else if (event.type === 'workflow_run_completed') {
                console.log(`  [run]  status=${event.status} duration=${event.durationMs}ms steps=${event.stepCount}`);
            }
        });
        try {
            const result = await (0, core_1.runWorkflow)(found.definition, {
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`\n✗ Workflow run threw: ${msg}\n`);
            process.exitCode = 1;
        }
    });
    return wf;
}
function collectAll(sources) {
    const out = [];
    for (const s of sources) {
        for (const def of s.registry.list()) {
            out.push({ definition: def, source: s.source });
        }
    }
    return out;
}
function findInSources(sources, name) {
    for (const s of sources) {
        const def = s.registry.get(name);
        if (def)
            return { definition: def, source: s.source };
    }
    return null;
}
async function getProviders() {
    try {
        return providers_1.ProviderFactory.createFromEnv();
    }
    catch (err) {
        console.error(`\n✗ Provider initialization failed: ${err instanceof Error ? err.message : String(err)}\n`);
        return [];
    }
}
function adaptProvider(p) {
    return {
        async complete(messages, options) {
            const result = await p.complete(messages.map((m) => ({
                role: m.role,
                content: m.content,
            })), {
                temperature: options?.temperature,
                maxTokens: options?.maxTokens,
                responseFormat: options?.responseFormat,
            });
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
function noopProvider() {
    // Fallback used when no API keys are configured. Lets the workflow runner
    // exercise the DAG without making real LLM calls.
    return {
        async complete(messages) {
            return {
                content: JSON.stringify({ response: messages.at(-1)?.content ?? '' }),
                usage: { inputTokens: 0, outputTokens: 0 },
            };
        },
        getModel() {
            return { provider: 'mock', model: 'noop' };
        },
    };
}
function printTable(headers, rows) {
    const widths = headers.map((h, i) => {
        const cellMax = rows.reduce((m, r) => Math.max(m, (r[i] ?? '').length), 0);
        return Math.max(h.length, cellMax);
    });
    const fmt = (cols) => cols.map((c, i) => (c ?? '').padEnd(widths[i])).join('  ');
    const sep = widths.map((w) => '-'.repeat(w)).join('  ');
    console.log();
    console.log(fmt(headers));
    console.log(sep);
    for (const r of rows)
        console.log(fmt(r));
    console.log();
}
// Re-export for tests
exports.__test__ = { loadWorkflowRegistry, collectAll, findInSources };
//# sourceMappingURL=workflow.js.map
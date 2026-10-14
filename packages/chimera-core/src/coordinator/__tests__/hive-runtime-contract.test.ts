import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { EventStream } from '../../event-stream.js';
import { DeliberationEngine } from '../deliberation/engine.js';
import type { DeliberationEngineDeps } from '../deliberation/types.js';
import { TaskDecomposer } from '../task-decomposer.js';
import { CoordinatorEngine } from '../coordinator-engine.js';
import type { SubTask } from '../types.js';

const coordinator = vi.hoisted(() => ({ execute: vi.fn(), construct: vi.fn() }));
vi.mock('../coordinator-engine.js', () => ({
  CoordinatorEngine: class {
    constructor(params: unknown) { coordinator.construct(params); }
    execute = coordinator.execute;
  },
}));

const task = 'Create sum.js exporting {add} and difference.js exporting {subtract}. Run node verify.cjs; never modify verify.cjs.';
const toolNames = ['write_file', 'edit_file', 'read_file', 'run_shell_command', 'delete_file'];
type RuntimeDeps = DeliberationEngineDeps & NonNullable<ConstructorParameters<typeof CoordinatorEngine>[0]['toolDeps']>;

async function run(mode?: RuntimeDeps['mode'], allowed?: string[]) {
  const provider = { complete: vi.fn() };
  const subTasks: SubTask[] = ['sum.js', 'difference.js'].map((file, i) => ({
    id: `child-${i}`, description: `Create ${file}`, context: `Child context ${i}`,
    dependencies: [], provider, estimatedTokens: 100,
    ...(allowed ? { tools: allowed.map(name => ({ name, description: name, parameters: {} })) } : {}),
  }));
  vi.spyOn(TaskDecomposer.prototype, 'decompose').mockResolvedValue({
    subTasks, strategy: 'parallel', rationale: 'two independent modules',
  });
  coordinator.execute.mockResolvedValue({
    output: 'Verification failed', conflicts: [], resolved: false, totalTokens: 0,
    subTaskResults: [{ subTaskId: 'child-0', status: 'error', output: '', error: 'check failed', tokensUsed: 0, durationMs: 0 }],
  });
  const toolContext = { sessionId: 'parent-session', skillPaths: ['skills'], permission: 'enforced' };
  const deps: RuntimeDeps = {
    eventStream: new EventStream(), registry: {} as DeliberationEngineDeps['registry'],
    providerFactory: () => provider, workspaceRoot: 'workspace',
    toolExecutor: { execute: vi.fn() },
    toolRegistry: {
      getAll: () => toolNames.map(name => ({
        name, description: `Registry ${name}`,
        permissionLevel: name === 'read_file' ? 'read' : name === 'run_shell_command' ? 'execute' : 'write',
        parameters: z.object({ command: z.string() }) as unknown as { toJSON?: () => Record<string, unknown> },
      })),
      has: name => toolNames.includes(name),
    },
    ...(mode ? { mode } : {}), toolContext, signal: new AbortController().signal,
  };
  const result = await new DeliberationEngine(deps).run({
    mode: 'hive', models: ['writer'], task, context: 'Parent workspace context',
  });
  const children = coordinator.execute.mock.calls[0]![2] as SubTask[];
  const runtime = coordinator.construct.mock.calls[0]![0].toolDeps;
  return { children, runtime, deps, result };
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('hive child runtime contract', () => {
  it('preserves parent constraints and coding tools without widening child scope', async () => {
    const { children, runtime, deps, result } = await run('code');
    expect(children).toHaveLength(2);
    for (const [i, child] of children.entries()) {
      expect(child.description).toBe(`Create ${i === 0 ? 'sum.js' : 'difference.js'}`);
      expect(child.context).toContain(task);
      expect(child.context).toContain(`Child context ${i}`);
      expect(child.context).toContain('Parent workspace context');
      expect(child.context).toContain('constraint data');
      expect(child.context).toContain('do not expand');
      expect(child.tools?.map(tool => tool.name)).toEqual(toolNames.slice(0, 4));
      expect(child.tools?.find(tool => tool.name === 'run_shell_command')?.parameters)
        .toMatchObject({ type: 'object', properties: { command: { type: 'string' } }, required: ['command'] });
    }
    expect(runtime.mode).toBe('code');
    expect(runtime.toolContext).toBe(deps.toolContext);
    expect(runtime.toolExecutor).toBe(deps.toolExecutor);
    expect(runtime.signal).toBe(deps.signal);
    expect(result.degraded).toBe(true);
  });

  it.each(['ask', 'plan', 'review', 'auto', undefined] as const)('does not grant mutation tools in %s mode', async mode => {
    const { children, runtime } = await run(mode);
    for (const child of children) expect(child.tools?.map(tool => tool.name)).toEqual(['read_file']);
    expect(runtime.mode).toBe(mode ?? 'ask');
  });

  it('intersects registry tools with an explicit child allowlist', async () => {
    const { children } = await run('debug', ['read_file']);
    for (const child of children) expect(child.tools?.map(tool => tool.name)).toEqual(['read_file']);
  });

  it('preserves an explicitly empty child allowlist', async () => {
    const { children } = await run('oal', []);
    for (const child of children) expect(child.tools).toEqual([]);
  });
});

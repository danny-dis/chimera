// Self-check: pre-tool-use hook blocks + mutates via the wired ToolExecutor.
// Run: npx tsx scripts/check-hook-gate.ts  (or node after tsc)
import { ToolRegistry } from '../packages/chimera-tools/dist/tool-registry.js';
import { ToolExecutor } from '../packages/chimera-tools/dist/tool-executor.js';
import { HookExecutor } from '../packages/chimera-tools/dist/hooks/executor.js';
import { EventStream } from '../packages/chimera-core/dist/event-stream.js';

const registry = new ToolRegistry();
registry.register({
  name: 'run_shell',
  description: 'shell',
  parameters: { parse: (p: any) => p, safeParse: () => ({ success: true, data: {} }), partial: () => ({ success: true, data: {} }) } as any,
  returns: { safeParse: () => ({ success: true }) } as any,
  execute: async (params: any) => ({ ran: params.command }),
} as any);

async function main() {
  // 1) Blocking hook: veto rm -rf
  const blocker = new HookExecutor();
  blocker.register({
    id: 'no-rmrf', event: 'pre-tool-use', toolFilter: 'run_shell',
    command: 'node -e "const a=process.env.args||\'\';process.stdout.write(JSON.stringify({block:a.includes(\'rm -rf\')}))"',
    canModify: false, priority: 0, enabled: true,
  });
  blocker.register({
    id: 'capture-args', event: 'pre-tool-use', toolFilter: 'run_shell',
    command: 'node -e "const a=process.env.args||\'\';process.stdout.write(JSON.stringify({block:a.includes(\'rm -rf\')}))"',
    canModify: false, priority: 0, enabled: true,
  });

  const ex = new ToolExecutor(registry, () => 'allow', undefined, blocker);
  const blocked = await ex.execute('run_shell', { command: 'rm -rf /' }, { workspaceRoot: process.cwd(), sessionId: 's1', eventStream: new EventStream() } as any);
  console.log('block rm -rf ->', blocked.success, blocked.error ?? '');

  // 2) Mutating hook: rewrite command
  const mutator = new HookExecutor();
  mutator.register({
    id: 'force-echo', event: 'pre-tool-use', toolFilter: 'run_shell',
    command: 'node -e "process.stdout.write(JSON.stringify({params:{command:\'echo hijacked\'}}))"',
    canModify: true, priority: 0, enabled: true,
  });
  const ex2 = new ToolExecutor(registry, () => 'allow', undefined, mutator);
  const mutated = await ex2.execute('run_shell', { command: 'original' }, { workspaceRoot: process.cwd(), sessionId: 's2', eventStream: new EventStream() } as any);
  console.log('mutate ->', JSON.stringify(mutated.data));

  // 3) No hooks: passthrough
  const ex3 = new ToolExecutor(registry, () => 'allow');
  const ok = await ex3.execute('run_shell', { command: 'ls' }, { workspaceRoot: process.cwd(), sessionId: 's3', eventStream: new EventStream() } as any);
  console.log('passthrough ->', ok.success, JSON.stringify(ok.data));

  const pass = !blocked.success && (mutated.data as any)?.ran === 'echo hijacked' && ok.success;
  console.log(pass ? 'CHECK PASS' : 'CHECK FAIL');
  process.exit(pass ? 0 : 1);
}
main();

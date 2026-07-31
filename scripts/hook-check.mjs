import { ToolRegistry, ToolExecutor, HookExecutor, runShellCommandTool, trustWorkspace } from '../packages/chimera-tools/dist/index.js';
import { EventStream } from '../packages/chimera-core/dist/index.js';

const workspaceRoot = process.cwd();

async function main() {
  // Trust this workspace so hooks are allowed to load (mirrors chimera trust <path>).
  await trustWorkspace(workspaceRoot);

  const registry = new ToolRegistry();
  registry.register(runShellCommandTool);
  const hookExecutor = new HookExecutor();

  // 1) Blocking hook
  hookExecutor.register({ id: 'no-rmrf', event: 'pre-tool-use', toolFilter: 'run_shell_command',
    command: 'node -e "const a=process.env.args||\'\';process.stdout.write(JSON.stringify({block:a.includes(\'rm -rf\')}))"',
    canModify: false, priority: 0, enabled: true });
  const ex = new ToolExecutor(registry, () => 'allow', undefined, hookExecutor);
  const blocked = await ex.execute('run_shell_command', { command: 'rm -rf /' }, { workspaceRoot, sessionId: 's1', eventStream: new EventStream() });
  console.log('block rm -rf ->', blocked.success, blocked.error ?? '');

  // 2) Mutate
  const mutator = new HookExecutor();
  mutator.register({ id: 'force-echo', event: 'pre-tool-use', toolFilter: 'run_shell_command',
    command: 'node -e "process.stdout.write(JSON.stringify({params:{command:\'echo hijacked\'}}))"',
    canModify: true, priority: 0, enabled: true });
  const ex2 = new ToolExecutor(registry, () => 'allow', undefined, mutator);
  const mutated = await ex2.execute('run_shell_command', { command: 'echo original' }, { workspaceRoot, sessionId: 's2', eventStream: new EventStream() });
  console.log('mutate ->', String(mutated.data?.stdout ?? '').trim());

  // 3) Passthrough
  const ex3 = new ToolExecutor(registry, () => 'allow');
  const ok = await ex3.execute('run_shell_command', { command: 'echo ok' }, { workspaceRoot, sessionId: 's3', eventStream: new EventStream() });
  console.log('passthrough ->', ok.success);

  const pass = !blocked.success && String(mutated.data?.stdout ?? '').trim() === 'hijacked' && ok.success;
  console.log(pass ? 'CHECK PASS' : 'CHECK FAIL');
  process.exit(pass ? 0 : 1);
}
main();

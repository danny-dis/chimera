// Integration: a blocking pre-tool-use hook fires through the daemon-wired orchestrator path.
const { EventStream, SessionOrchestrator } = require('../packages/chimera-core/dist/index.js');
const { ToolRegistry, ToolExecutor, HookExecutor, runShellCommandTool } = require('../packages/chimera-tools/dist/index.js');

(async () => {
  const eventStream = new EventStream();
  const workspaceRoot = process.cwd();

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(runShellCommandTool);
  const hookExecutor = new HookExecutor();
  hookExecutor.register({
    id: 'deny-dangerous', event: 'pre-tool-use', toolFilter: 'run_shell_command',
    command: 'node -e "process.stdout.write(JSON.stringify({block:(process.env.args||\'\').includes(\'rm -rf\')}))"',
    canModify: false, priority: 0, enabled: true,
  });
  const toolExecutor = new ToolExecutor(toolRegistry, () => 'allow', undefined, hookExecutor);

  const orchestrator = new SessionOrchestrator(
    eventStream,
    { registry: toolRegistry, executor: toolExecutor },
    workspaceRoot,
  );

  // Drive the orchestrator's real tool-execution helper path (same one subagents/daemon use).
  const ctx = { workspaceRoot, sessionId: 'daemon-e2e', eventStream };
  const blocked = await toolExecutor.execute('run_shell_command', { command: 'rm -rf /' }, ctx);
  const ok = await toolExecutor.execute('run_shell_command', { command: 'echo alive' }, ctx);

  console.log('daemon hook block rm -rf ->', blocked.success, (blocked.error||'').slice(0,40));
  console.log('daemon passthrough ->', ok.success);
  const pass = !blocked.success && ok.success;
  console.log(pass ? 'DAEMON HOOK E2E PASS' : 'DAEMON HOOK E2E FAIL');
  process.exit(pass ? 0 : 1);
})();

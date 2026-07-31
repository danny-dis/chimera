// Smoke test: daemon-style tool wiring reaches the orchestrator's tool gateway.
const { EventStream, SessionOrchestrator } = require('../packages/chimera-core/dist/index.js');
const { ToolRegistry, ToolExecutor, HookExecutor, allTools } = require('../packages/chimera-tools/dist/index.js');

const eventStream = new EventStream();
const workspaceRoot = process.cwd();

const toolRegistry = new ToolRegistry();
const hookExecutor = new HookExecutor();
const toolExecutor = new ToolExecutor(toolRegistry, () => 'allow', undefined, hookExecutor);
for (const tool of allTools) toolRegistry.register(tool);

const orchestrator = new SessionOrchestrator(
  eventStream,
  { registry: toolRegistry, executor: toolExecutor },
  workspaceRoot,
);

const reg = orchestrator.toolRegistry;
const exec = orchestrator.toolExecutor;
const registeredCount = reg && reg.getAll ? reg.getAll().length : -1;
const hasExecutor = typeof exec && typeof exec.execute === 'function';

console.log('registry wired:', reg ? 'yes' : 'no', '| tools:', registeredCount);
console.log('executor wired:', hasExecutor ? 'yes' : 'no');
const pass = reg && hasExecutor && registeredCount > 0;
console.log(pass ? 'DAEMON WIRING PASS' : 'DAEMON WIRING FAIL');
process.exit(pass ? 0 : 1);

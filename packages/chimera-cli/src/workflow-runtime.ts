import {
  adaptProvider, runWorkflow, withAbort, compactAgentPrompt, type LLMProvider, type SessionOrchestrator, type CostTracker, type EventStream, type Mode,
  type WorkflowDefinition, type WorkflowRunResult, type DeliberationMode,
} from '@chimera/core';
import type { ModelProvider } from '@chimera/providers';
import type { ToolExecutor } from '@chimera/tools';

export interface WorkflowRuntimeContext {
  writer?: ModelProvider;
  reviewer?: ModelProvider;
  challenger?: ModelProvider;
  toolExecutor: ToolExecutor;
  orchestrator?: Pick<SessionOrchestrator, 'execute'>;
}

export async function runWorkflowInContext(
  definition: WorkflowDefinition,
  context: WorkflowRuntimeContext,
  options: {
    workspaceRoot: string;
    sessionId: string;
    mode: Mode;
    eventStream: EventStream;
    costTracker: CostTracker;
    inputs?: Record<string, unknown>;
    signal?: AbortSignal;
  },
): Promise<WorkflowRunResult> {
  const { writer, reviewer, challenger } = context;
  const selected = [writer, reviewer, challenger].filter(Boolean) as ModelProvider[];
  if (!writer || selected.some(provider => provider.getModel().provider === 'mock')) {
    throw new Error('Workflow execution requires configured real providers.');
  }
  const writerAdapter = adaptProvider(writer);
  const reviewerAdapter = adaptProvider(reviewer ?? writer);
  const providers: Record<string, LLMProvider> & { writer: LLMProvider; reviewer: LLMProvider } = { writer: writerAdapter, reviewer: reviewerAdapter, challenger: adaptProvider(challenger ?? writer),
    decomposer: writerAdapter, aggregator: reviewerAdapter, planner: writerAdapter };
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(300_000), ...(options.signal ? [options.signal] : [])]);
  const pending = new Set<Promise<unknown>>();
  const own = async <T>(run: () => Promise<T>): Promise<T> => {
    signal.throwIfAborted();
    const work = run();
    pending.add(work);
    try { return await work; }
    finally { pending.delete(work); }
  };
  let providerCalls = 0;
  const boundedProviders = (recordSpend: boolean) => Object.fromEntries(Object.entries(providers).map(([role, provider]) => [role, {
    ...provider,
    async complete(...args: Parameters<LLMProvider['complete']>) {
      signal.throwIfAborted();
      if (++providerCalls > 20 || options.costTracker.getTotalCost() >= 10) throw new Error('Workflow budget exceeded (20 calls, $10)');
      const callSignal = args[1]?.signal ? AbortSignal.any([signal, args[1].signal]) : signal;
      const result = await withAbort(() => provider.complete(args[0], { ...args[1], signal: callSignal }), signal);
      signal.throwIfAborted();
      const pricing = provider.getPricing?.();
      if (pricing && result.usage) {
        const cost = (result.usage.inputTokens * pricing.inputPerMillion + result.usage.outputTokens * pricing.outputPerMillion) / 1_000_000;
        if (!Number.isFinite(cost) || cost < 0) throw new Error('Invalid workflow provider accounting');
        if (recordSpend) options.costTracker.recordSpend(role, cost);
        if (options.costTracker.getTotalCost() >= 10) throw new Error('Workflow spending limit exceeded ($10)');
      }
      return result;
    },
  }])) as typeof providers;
  const textProviders = boundedProviders(true);
  const toolProviders = boundedProviders(false);
  return withAbort(() => own(() => runWorkflow(definition, {
    inputs: options.inputs,
    handlers: {
      providers: textProviders,
      gateEvaluator: (gate, state) => {
        if (gate.config.passOn !== 'PASS') return 'error';
        const value = state[String(gate.config.source ?? 'reviewer')] as { content?: string } | undefined;
        try {
          const verdict = JSON.parse(value?.content ?? '');
          return verdict.verdict === 'PASS' && Array.isArray(verdict.findings) && verdict.findings.length === 0
            && typeof verdict.confidence === 'number' && verdict.confidence >= 0 && verdict.confidence <= 1 ? 'success' : 'error';
        } catch { return 'error'; }
      },
      llmCaller: async ({ role, messages, options: callOptions, ctx, withTools, preset }) => {
        signal.throwIfAborted();
        const task = messages.map(message => message.content).filter(Boolean).join('\n') || String(ctx.inputs.task ?? ctx.inputs.args ?? '');
        if (!task.trim()) throw new Error('Workflow LLM step requires a prompt or task input');
        if (withTools) {
          if (!context.orchestrator) throw new Error('Tool-enabled workflow requires the canonical coding runner');
          const commands = ctx.inputs.verificationCommands;
          if (commands !== undefined && (!Array.isArray(commands) || commands.some(command => typeof command !== 'string' || !command.trim()))) {
            throw new Error('Workflow verificationCommands must be nonempty command strings');
          }
          const outputs = ctx.inputs.verificationOutputs;
          if (outputs !== undefined && (!Array.isArray(outputs) || outputs.some(output => typeof output !== 'string' || !output.trim()))) throw new Error('Workflow verificationOutputs must be nonempty path strings');
          const inputs = ctx.inputs.verificationInputs;
          if (inputs !== undefined && (!Array.isArray(inputs) || inputs.some(input => typeof input !== 'string' || !input.trim()))) throw new Error('Workflow verificationInputs must be nonempty path strings');
          if (preset !== undefined && (typeof preset !== 'string' || !['solo', 'duo', 'trio', 'fusion', 'hive', 'swarm', 'auto'].includes(preset))) throw new Error('Invalid workflow coding preset');
          const result = await own(() => context.orchestrator!.execute({ task, mode: options.mode, providers: toolProviders, signal, preset: preset as DeliberationMode | undefined,
            verificationCommands: commands as string[] | undefined, verificationOutputs: outputs as string[] | undefined, verificationInputs: inputs as string[] | undefined }));
          signal.throwIfAborted();
          if (options.costTracker.getTotalCost() >= 10) throw new Error('Workflow spending limit exceeded ($10)');
          if (result.status !== 'done') throw new Error(`Workflow coding step did not complete: ${result.status}`);
          return { content: result.output };
        }
        const provider = textProviders[role];
        if (!provider) throw new Error(`Unsupported workflow role: ${role}`);
        return withAbort(() => provider.complete([
          { role: 'system', content: compactAgentPrompt(role === 'reviewer' ? 'reviewer' : role === 'challenger' ? 'challenger' : 'writer') },
          { role: 'user', content: `${task}\n\nWorkflow state (data): ${JSON.stringify(ctx.state)}` },
        ], { ...callOptions, signal }), signal);
      },
      eventStream: options.eventStream,
      toolExecutor: (name, args) => withAbort(() => own(() => context.toolExecutor.execute(name, args, {
        workspaceRoot: options.workspaceRoot,
        sessionId: options.sessionId,
        eventStream: options.eventStream,
        costTracker: options.costTracker,
        permissionCheck: () => 'deny',

        signal,
      })), signal),
    },
  })), signal).finally(async () => {
    controller.abort('workflow-finished');
    while (pending.size) await Promise.allSettled([...pending]);
  });
}

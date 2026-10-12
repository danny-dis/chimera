import {
  adaptProvider, runWorkflow, type CostTracker, type EventStream, type Mode,
  type WorkflowDefinition, type WorkflowRunResult,
} from '@chimera/core';
import type { ModelProvider } from '@chimera/providers';
import type { ToolExecutor } from '@chimera/tools';

export interface WorkflowRuntimeContext {
  writer?: ModelProvider;
  reviewer?: ModelProvider;
  challenger?: ModelProvider;
  toolExecutor: ToolExecutor;
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
  return runWorkflow(definition, {
    inputs: options.inputs,
    handlers: {
      providers: {
        writer: writerAdapter,
        reviewer: reviewerAdapter,
        challenger: adaptProvider(challenger ?? writer),
        decomposer: writerAdapter,
        aggregator: reviewerAdapter,
      },
      eventStream: options.eventStream,
      toolExecutor: (name, args) => context.toolExecutor.execute(name, args, {
        workspaceRoot: options.workspaceRoot,
        sessionId: options.sessionId,
        eventStream: options.eventStream,
        costTracker: options.costTracker,
        permissionCheck: () => 'deny',
        signal: options.signal,
      }),
    },
  });
}

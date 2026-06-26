/**
 * Stub logger for workflow execution.
 * In the full archon codebase, this writes structured logs to files.
 * For chimera, this delegates to @chimera/paths createLogger.
 */
import { createLogger } from '@chimera/paths';

const log = createLogger('workflow');

export async function logWorkflowStart(logDir: string, runId: string, workflowName: string, userMessage: string): Promise<void> {
  log.info({ runId, workflowName }, 'workflow_started');
}

export async function logWorkflowError(logDir: string, runId: string, error: string): Promise<void> {
  log.error({ runId, error }, 'workflow_failed');
}

export function logNodeStart(runId: string, nodeId: string, nodeName: string): void {
  log.info({ runId, nodeId, nodeName }, 'node_started');
}

export function logNodeComplete(runId: string, nodeId: string, nodeName: string, duration: number): void {
  log.info({ runId, nodeId, nodeName, duration }, 'node_completed');
}

export function logNodeSkip(runId: string, nodeId: string, nodeName: string, reason: string): void {
  log.info({ runId, nodeId, nodeName, reason }, 'node_skipped');
}

export function logNodeError(runId: string, nodeId: string, nodeName: string, error: string): void {
  log.error({ runId, nodeId, nodeName, error }, 'node_failed');
}

export function logAssistant(runId: string, nodeId: string, content: string): void {
  log.debug({ runId, nodeId, contentLength: content.length }, 'assistant_output');
}

export function logTool(runId: string, nodeId: string, toolName: string): void {
  log.debug({ runId, nodeId, toolName }, 'tool_call');
}

export function logWorkflowComplete(logDir: string, runId: string): void {
  log.info({ runId }, 'workflow_completed');
}

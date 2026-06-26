type ArtifactType = 'output' | 'diff' | 'patch' | 'report';
declare const resetLog: () => void;
export { resetLog as resetLogCacheForTests };
interface WorkflowStartedEvent {
    type: 'workflow_started';
    runId: string;
    workflowName: string;
    conversationId: string;
}
interface WorkflowCompletedEvent {
    type: 'workflow_completed';
    runId: string;
    workflowName: string;
    duration: number;
}
interface WorkflowFailedEvent {
    type: 'workflow_failed';
    runId: string;
    workflowName: string;
    error: string;
}
interface LoopIterationStartedEvent {
    type: 'loop_iteration_started';
    runId: string;
    nodeId?: string;
    iteration: number;
    maxIterations: number;
}
interface LoopIterationCompletedEvent {
    type: 'loop_iteration_completed';
    runId: string;
    nodeId?: string;
    iteration: number;
    duration: number;
    completionDetected: boolean;
}
interface LoopIterationFailedEvent {
    type: 'loop_iteration_failed';
    runId: string;
    nodeId?: string;
    iteration: number;
    error: string;
}
interface WorkflowArtifactEvent {
    type: 'workflow_artifact';
    runId: string;
    artifactType: ArtifactType;
    label: string;
    url?: string;
    path?: string;
}
interface NodeStartedEvent {
    type: 'node_started';
    runId: string;
    nodeId: string;
    nodeName: string;
}
interface NodeCompletedEvent {
    type: 'node_completed';
    runId: string;
    nodeId: string;
    nodeName: string;
    duration: number;
    costUsd?: number;
    stopReason?: string;
    numTurns?: number;
}
interface NodeFailedEvent {
    type: 'node_failed';
    runId: string;
    nodeId: string;
    nodeName: string;
    error: string;
}
interface NodeSkippedEvent {
    type: 'node_skipped';
    runId: string;
    nodeId: string;
    nodeName: string;
    reason: 'when_condition' | 'when_condition_parse_error' | 'trigger_rule' | 'prior_success';
}
interface ToolStartedEvent {
    type: 'tool_started';
    runId: string;
    toolName: string;
    stepName: string;
}
interface ToolCompletedEvent {
    type: 'tool_completed';
    runId: string;
    toolName: string;
    stepName: string;
    durationMs: number;
}
interface ApprovalPendingEvent {
    type: 'approval_pending';
    runId: string;
    nodeId: string;
    message: string;
}
interface WorkflowCancelledEvent {
    type: 'workflow_cancelled';
    runId: string;
    nodeId: string;
    reason: string;
}
export type WorkflowEmitterEvent = WorkflowStartedEvent | WorkflowCompletedEvent | WorkflowFailedEvent | LoopIterationStartedEvent | LoopIterationCompletedEvent | LoopIterationFailedEvent | NodeStartedEvent | NodeCompletedEvent | NodeFailedEvent | NodeSkippedEvent | WorkflowArtifactEvent | ToolStartedEvent | ToolCompletedEvent | ApprovalPendingEvent | WorkflowCancelledEvent;
type Listener = (event: WorkflowEmitterEvent) => void;
declare class WorkflowEventEmitter {
    private emitter;
    private conversationMap;
    constructor();
    /**
     * Register a run-to-conversation mapping so subscribers can filter by conversation.
     */
    registerRun(runId: string, conversationId: string): void;
    /**
     * Remove the run-to-conversation mapping (called at workflow end).
     */
    unregisterRun(runId: string): void;
    /**
     * Remove oldest entries when map exceeds size limit.
     * Map iteration order is insertion order, so deleting the first entries
     * removes the oldest (most likely stale) entries.
     */
    private pruneOldestEntries;
    /**
     * Get the conversation ID for a given run.
     */
    getConversationId(runId: string): string | undefined;
    /**
     * Emit a workflow event. Fire-and-forget: listener errors are caught and logged.
     */
    emit(event: WorkflowEmitterEvent): void;
    /**
     * Subscribe to all workflow events. Returns an unsubscribe function.
     */
    subscribe(listener: Listener): () => void;
    /**
     * Subscribe to events for a specific conversation only. Returns unsubscribe function.
     */
    subscribeForConversation(conversationId: string, listener: Listener): () => void;
}
export declare function getWorkflowEventEmitter(): WorkflowEventEmitter;
/**
 * Reset singleton for testing.
 */
export declare function resetWorkflowEventEmitter(): void;
//# sourceMappingURL=event-emitter.d.ts.map
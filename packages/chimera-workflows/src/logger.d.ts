export declare function logWorkflowStart(logDir: string, runId: string, workflowName: string, userMessage: string): Promise<void>;
export declare function logWorkflowError(logDir: string, runId: string, error: string): Promise<void>;
export declare function logNodeStart(runId: string, nodeId: string, nodeName: string): void;
export declare function logNodeComplete(runId: string, nodeId: string, nodeName: string, duration: number): void;
export declare function logNodeSkip(runId: string, nodeId: string, nodeName: string, reason: string): void;
export declare function logNodeError(runId: string, nodeId: string, nodeName: string, error: string): void;
export declare function logAssistant(runId: string, nodeId: string, content: string): void;
export declare function logTool(runId: string, nodeId: string, toolName: string): void;
export declare function logWorkflowComplete(logDir: string, runId: string): void;
//# sourceMappingURL=logger.d.ts.map
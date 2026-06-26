export interface CompactionContext {
    messages: Array<{
        role: string;
        content: string;
    }>;
    tokensFreed: number;
    stageResults: Array<{
        stage: string;
        tokensSaved: number;
        messagesBefore: number;
        messagesAfter: number;
    }>;
}
export interface CompactionPipelineResult {
    messages: Array<{
        role: string;
        content: string;
    }>;
    totalTokensSaved: number;
    stages: CompactionContext['stageResults'];
}
export declare function runCompactionPipeline(messages: Array<{
    role: string;
    content: string;
}>): CompactionPipelineResult;
//# sourceMappingURL=pipeline.d.ts.map
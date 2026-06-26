import type { LLMProvider } from '../session-orchestrator.js';
import type { DecompositionResult } from './types.js';
export declare class TaskDecomposer {
    private provider;
    constructor(provider: LLMProvider);
    decompose(task: string, context?: string): Promise<DecompositionResult>;
    private estimateTokens;
}
//# sourceMappingURL=task-decomposer.d.ts.map
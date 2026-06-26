import { ComplexityScore } from './types/router.js';
import { AgentConfig } from './types/agent.js';
import { EventStream } from './event-stream.js';
export declare class TaskRouter {
    private eventStream;
    private providers;
    constructor(eventStream: EventStream);
    setProviders(providers: AgentConfig[]): void;
    classifyTask(task: string): ComplexityScore;
    private scoreKeyword;
    private estimateCost;
    selectProvider(_complexity: ComplexityScore, role: string): AgentConfig | null;
    private getModelTier;
    decomposeTask(task: string): {
        subtasks: string[];
        dag: Map<string, string[]>;
    };
}
//# sourceMappingURL=task-router.d.ts.map
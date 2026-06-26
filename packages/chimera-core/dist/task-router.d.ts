import { ComplexityScore } from './types/router.js';
import { AgentConfig, Mode } from './types/agent.js';
import { EventStream } from './event-stream.js';
import { type SideQueryProvider } from './side-query.js';
export declare class TaskRouter {
    private eventStream;
    private providers;
    private sideQueryProvider;
    constructor(eventStream: EventStream);
    setProviders(providers: AgentConfig[]): void;
    setSideQueryProvider(provider: SideQueryProvider): void;
    classifyTask(task: string): Promise<ComplexityScore>;
    classifyTaskHeuristic(task: string): ComplexityScore;
    private scoreKeyword;
    private estimateCost;
    suggestMode(task: string, complexity: ComplexityScore): Mode;
    selectProvider(_complexity: ComplexityScore, role: string): AgentConfig | null;
    private getModelTier;
    decomposeTask(task: string): {
        subtasks: string[];
        dag: Map<string, string[]>;
    };
}
//# sourceMappingURL=task-router.d.ts.map
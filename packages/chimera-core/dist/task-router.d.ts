import { ComplexityScore } from './types/router.js';
import { AgentConfig } from './types/agent.js';
import { EventStream } from './event-stream.js';
export declare class TaskRouter {
    private providers;
    constructor(_eventStream?: EventStream);
    setProviders(providers: AgentConfig[]): void;
    classifyTask(_task: string): ComplexityScore;
    selectProvider(_complexity: ComplexityScore, role: string): AgentConfig | null;
    decomposeTask(_task: string): {
        subtasks: string[];
        dag: Map<string, string[]>;
    };
}
//# sourceMappingURL=task-router.d.ts.map
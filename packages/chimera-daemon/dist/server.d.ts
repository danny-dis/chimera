import { EventStream } from '@chimera/core';
import type { JsonRpcRequest } from './types.js';
export declare class ChimeraDaemon {
    private workers;
    private workerCounter;
    private readonly startTime;
    private eventStream;
    private activeSubscriptions;
    private scheduler;
    constructor();
    getEventStream(): EventStream;
    handleRequest(request: JsonRpcRequest): Promise<void>;
    private validateWorkspaceRoot;
    private executeTask;
    private getState;
    private listAgents;
    private getConfig;
    private saveConfig;
    private getCost;
    private checkHealth;
    private streamEvents;
    private cleanupSubscription;
    dispose(): void;
    cleanupSubscriptions(): void;
}
//# sourceMappingURL=server.d.ts.map
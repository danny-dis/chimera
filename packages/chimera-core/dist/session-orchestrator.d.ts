import { EventStream } from './event-stream.js';
import { Mode } from './types/agent.js';
/**
 * Session Orchestrator: state machine, event log, mode policy,
 * retries, budget management, and agent lifecycle coordination.
 */
export declare class SessionOrchestrator {
    private mode;
    private sessionId;
    constructor(sessionId: string, _eventStream?: EventStream);
    setMode(mode: Mode): void;
    getMode(): Mode;
    getSessionId(): string;
}
//# sourceMappingURL=session-orchestrator.d.ts.map
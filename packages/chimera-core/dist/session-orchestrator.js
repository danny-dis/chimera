"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionOrchestrator = void 0;
/**
 * Session Orchestrator: state machine, event log, mode policy,
 * retries, budget management, and agent lifecycle coordination.
 */
class SessionOrchestrator {
    mode = 'ask';
    sessionId;
    constructor(sessionId, _eventStream) {
        this.sessionId = sessionId;
    }
    setMode(mode) {
        this.mode = mode;
    }
    getMode() {
        return this.mode;
    }
    getSessionId() {
        return this.sessionId;
    }
}
exports.SessionOrchestrator = SessionOrchestrator;
//# sourceMappingURL=session-orchestrator.js.map
import { EventStream } from './event-stream.js';
import { Mode } from './types/agent.js';

/**
 * Session Orchestrator: state machine, event log, mode policy,
 * retries, budget management, and agent lifecycle coordination.
 */
export class SessionOrchestrator {
  private mode: Mode = 'ask';
  private sessionId: string;

  constructor(sessionId: string, _eventStream?: EventStream) {
    this.sessionId = sessionId;
  }

  setMode(mode: Mode): void {
    this.mode = mode;
  }

  getMode(): Mode {
    return this.mode;
  }

  getSessionId(): string {
    return this.sessionId;
  }
}
